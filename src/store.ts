// 設定と記録の保存。すべて端末内の localStorage に入れる（サーバーなし）。
// GitHub Pages では同じユーザーの全リポジトリが保存領域を共有するので、
// キーには必ず接頭辞をつける。

import { normalizeMode, usesLapNumbers, type Run, type Session } from './engine';
import { MIN, setDurationStyle, type DurationStyle } from './time';

const PREFIX = 'studytimer:';

/** タイマーの種類。down = カウントダウン、up = カウントアップ */
export type TimerKind = 'down' | 'up';
export type EndKind = 'none' | 'clock' | 'total' | 'count';
/** タイマー・ストップウォッチの終了条件。ポモドーロの条件に「ラップ番号」が加わる */
export type LapEndKind = EndKind | 'lapNo';

export interface Settings {
  /** タイマーが 0 になったあとも数え続ける */
  overrun: boolean;
  sound: boolean;
  keepAwake: boolean;
  /** 計測中、本体を横に倒したら横向きで表示する */
  tilt: boolean;
  /** 1時間を超える時間を「1時間38分」と「98分」のどちらで出すか */
  durationStyle: DurationStyle;

  timerKind: TimerKind;
  /** タイマーの設定時間（2つの種類で共通） */
  timerMs: number;
  presets: number[];
  /** 手で指定した開始ラップ番号。null なら前回の続き */
  nextLap: number | null;

  workMs: number;
  breakMs: number;
  endKind: EndKind;
  /** 終了時刻（0:00 からの分） */
  endClockMin: number;
  endTotalMs: number;
  endCount: number;

  // ラップのあるモード（タイマー・ストップウォッチ）の終了条件。ポモドーロとは別に持つ
  lapEndKind: LapEndKind;
  lapEndClockMin: number;
  lapEndTotalMs: number;
  /** 何ラップで終えるか */
  lapEndCount: number;
  /** 何番のラップで終えるか（教材なしのとき。教材を選んでいるときは教材ごとの値を使う） */
  lapEndLapNo: number;
  /** finish したとき途中だったラップを済んだことにして、次は次の番号から始める */
  lapAdvance: boolean;
  /** ラップ数で終えるときの残り時間の目安。average = 平均ラップ、timer = タイマーの設定時間 */
  lapEstimate: 'average' | 'timer';
  /** finish は長押しで終わる（オフなら1回タップ） */
  finishHold: boolean;
  /** lap を押したときに短い音を鳴らす */
  lapSound: boolean;
  /** 計測中にアプリから離れた回数と時間を記録する */
  leaveTrack: boolean;

  // 統計
  /** 1日の区切り（0:00 からの分）。4:00 にすると、深夜の勉強を前の日に数える */
  dayBoundaryMin: number;
  /** 週の始まり。1 = 月曜、0 = 日曜 */
  weekStartsOn: 0 | 1;
  /** 1日の目標時間。0 なら目標なし */
  dailyGoalMs: number;

  /** 今選んでいる教材の id。null なら教材なし */
  materialId: string | null;
}

const DEFAULTS: Settings = {
  overrun: false,
  sound: true,
  keepAwake: true,
  tilt: false,
  durationStyle: 'hm',
  timerKind: 'down',
  timerMs: 10 * MIN,
  presets: [10 * MIN, 20 * MIN, 30 * MIN],
  nextLap: null,
  workMs: 25 * MIN,
  breakMs: 5 * MIN,
  endKind: 'none',
  endClockMin: 18 * 60,
  endTotalMs: 120 * MIN,
  endCount: 4,
  lapEndKind: 'none',
  lapEndClockMin: 18 * 60,
  lapEndTotalMs: 120 * MIN,
  lapEndCount: 10,
  lapEndLapNo: 10,
  lapAdvance: true,
  lapEstimate: 'average',
  finishHold: true,
  lapSound: false,
  leaveTrack: false,
  dayBoundaryMin: 0,
  weekStartsOn: 1,
  dailyGoalMs: 0,
  materialId: null,
};

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // 保存できなくても計測は続けられるようにする（プライベートブラウズなど）
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* 同上 */
  }
}

// ---- 設定 ----

export const settings: Settings = { ...DEFAULTS, ...(read<Partial<Settings>>('settings') ?? {}) };

setDurationStyle(settings.durationStyle);

export function saveSettings(patch: Partial<Settings> = {}): void {
  Object.assign(settings, patch);
  setDurationStyle(settings.durationStyle);
  write('settings', settings);
}

// ---- 記録 ----

/** 古い版で保存した記録のモード名を、今の名前に直す。 */
function migrate(list: Session[]): Session[] {
  return list.flatMap((s) => {
    const mode = normalizeMode(s.mode);
    return mode ? [{ ...s, mode }] : [];
  });
}

let sessions: Session[] = migrate(read<Session[]>('sessions') ?? []);

export const getSessions = (): readonly Session[] => sessions;

export function addSession(s: Session): void {
  sessions.push(s);
  write('sessions', sessions);
}

export function clearSessions(): void {
  sessions = [];
  remove('sessions');
  saveSettings({ nextLap: null });
  for (const m of materials) m.nextLap = null;
  write('materials', materials);
}

// ---- 教材 ----
// 教材ごとに、ラップ番号（次は何番から）・前回の範囲・前回平均を分けて持つ。
// 記録には教材の id を付ける。教材を消しても記録は残すため、教材は archived にするだけ。

export interface Material {
  id: string;
  name: string;
  /** 手で決めた次のラップ番号、または finish したときに決まった番号。null なら記録から出す */
  nextLap: number | null;
  /** 終了条件「ラップ番号」で、何番まで（教材ごと）。まだ決めていなければ null */
  endLapNo?: number | null;
  archived?: boolean;
}

let materials: Material[] = read<Material[]>('materials') ?? [];

/** 教材の並び順（色を決めるのに使う。削除したものも含めて、作った順） */
export const materialOrder = (id: string): number => materials.findIndex((m) => m.id === id);

/** 選べる教材（削除したものを除く） */
export const activeMaterials = (): Material[] => materials.filter((m) => !m.archived);

export const materialById = (id: string | null | undefined): Material | null =>
  (id && materials.find((m) => m.id === id)) || null;

export function materialName(id: string | null | undefined): string {
  if (!id) return '教材なし';
  return materialById(id)?.name ?? '削除した教材';
}

/** 今選んでいる教材の id（削除されていたら null） */
export function currentMaterialId(): string | null {
  const m = materialById(settings.materialId);
  return m && !m.archived ? m.id : null;
}

function saveMaterials(): void {
  write('materials', materials);
}

export function addMaterial(name: string): Material {
  const m: Material = { id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, nextLap: null };
  materials.push(m);
  saveMaterials();
  return m;
}

export function renameMaterial(id: string, name: string): void {
  const m = materialById(id);
  if (!m) return;
  m.name = name;
  saveMaterials();
}

/** 教材を消す（これまでの記録は残る）。選んでいたら教材なしに戻す */
export function archiveMaterial(id: string): void {
  const m = materialById(id);
  if (!m) return;
  m.archived = true;
  saveMaterials();
  if (settings.materialId === id) saveSettings({ materialId: null });
}

/** 教材なしで、ラップのある記録の数 */
export const untaggedLapSessions = (): number =>
  sessions.filter((s) => !s.material && usesLapNumbers(s.mode) && s.laps.length > 0).length;

/** 教材なしの記録をすべて、この教材のものにする（最初の教材を作ったとき用） */
export function assignUntagged(id: string): void {
  const m = materialById(id);
  if (!m) return;
  sessions = sessions.map((s) => (s.material ? s : { ...s, material: id }));
  write('sessions', sessions);
  m.nextLap = settings.nextLap;
  saveMaterials();
  saveSettings({ nextLap: null });
}

/** ラップを使った直近の記録（タイマーの2モードとストップウォッチで共通、教材ごと） */
export function lastLapSession(materialId: string | null = currentMaterialId()): Session | null {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if ((s.material ?? null) === materialId && usesLapNumbers(s.mode) && s.laps.length > 0) return s;
  }
  return null;
}

/** 次に始めるラップ番号（決まっていればそれ、なければ前回の続き） */
export function nextLapNumber(materialId: string | null = currentMaterialId()): number {
  const fixed = materialId ? (materialById(materialId)?.nextLap ?? null) : settings.nextLap;
  if (fixed !== null) return fixed;
  const last = lastLapSession(materialId);
  return last ? last.firstLap + last.laps.length : 1;
}

/** 終了条件「ラップ番号」の番号（教材ごと）。教材でまだ決めていなければ null */
export function endLapNo(materialId: string | null = currentMaterialId()): number | null {
  const m = materialById(materialId);
  return m ? (m.endLapNo ?? null) : settings.lapEndLapNo;
}

export function setEndLapNo(n: number, materialId: string | null = currentMaterialId()): void {
  const m = materialById(materialId);
  if (m) {
    m.endLapNo = n;
    saveMaterials();
  } else {
    saveSettings({ lapEndLapNo: n });
  }
}

/** 次に始めるラップ番号を決める（null なら記録から出す） */
export function setNextLap(n: number | null, materialId: string | null = currentMaterialId()): void {
  const m = materialById(materialId);
  if (m) {
    m.nextLap = n;
    saveMaterials();
  } else {
    saveSettings({ nextLap: n });
  }
}

// ---- 計測中の状態（アプリを閉じても続きから再開するため） ----

export function loadRun(): Run | null {
  const r = read<Run & { maxMs?: number }>('run');
  if (!r) return null;
  const mode = normalizeMode(r.mode);
  if (!mode) return null;
  // 古い版のラップ型ポモドーロは、設定時間を maxMs に入れていた
  if ((r.mode as string) === 'pomoLap' && r.maxMs) r.durationMs = r.maxMs;
  return { ...r, mode };
}
export const saveRun = (r: Run): void => write('run', r);
export const clearRun = (): void => remove('run');

// ---- 書き出し・読み込み ----

interface Backup {
  app: 'gumiben';
  version: 1 | 2;
  exportedAt: string;
  settings: Settings;
  sessions: Session[];
  /** version 2 から */
  materials?: Material[];
}

export function exportBackup(): string {
  const data: Backup = {
    app: 'gumiben',
    version: 2,
    exportedAt: new Date().toISOString(),
    settings,
    sessions,
    materials,
  };
  return JSON.stringify(data, null, 2);
}

function isSession(x: unknown): x is Session {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.mode === 'string' &&
    normalizeMode(s.mode) !== null &&
    typeof s.start === 'number' &&
    typeof s.end === 'number' &&
    typeof s.studyMs === 'number' &&
    typeof s.firstLap === 'number' &&
    Array.isArray(s.laps) &&
    s.laps.every((v) => typeof v === 'number') &&
    (s.material === undefined || typeof s.material === 'string') &&
    (s.leaves === undefined ||
      (Array.isArray(s.leaves) &&
        s.leaves.every((x) => Array.isArray(x) && x.length === 2 && x.every((v) => typeof v === 'number')))) &&
    (s.spans === undefined ||
      (Array.isArray(s.spans) &&
        s.spans.every((x) => Array.isArray(x) && x.length === 2 && x.every((v) => typeof v === 'number'))))
  );
}

/** 書き出したファイルを読み込み、今の記録に足す。追加した件数を返す。 */
export function importBackup(text: string): number {
  const data = JSON.parse(text) as Partial<Backup>;
  if (data.app !== 'gumiben' || !Array.isArray(data.sessions)) {
    throw new Error('グミ勉の記録ファイルではありません');
  }
  // 知らない教材は足す（名前が分かるように。消した扱いのものもそのまま）
  for (const m of data.materials ?? []) {
    if (m && typeof m.id === 'string' && typeof m.name === 'string' && !materialById(m.id)) {
      materials.push({ id: m.id, name: m.name, nextLap: null, archived: !!m.archived });
    }
  }
  saveMaterials();
  const known = new Set(sessions.map((s) => s.id));
  const incoming = migrate(data.sessions.filter(isSession)).filter((s) => !known.has(s.id));
  sessions = [...sessions, ...incoming].sort((a, b) => a.start - b.start);
  write('sessions', sessions);
  return incoming.length;
}

/** ブラウザに「このデータは勝手に消さないで」と頼む。 */
export function requestPersistence(): void {
  void navigator.storage?.persist?.().catch(() => false);
}
