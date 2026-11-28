// 設定と記録の保存。すべて端末内の localStorage に入れる（サーバーなし）。
// GitHub Pages では同じユーザーの全リポジトリが保存領域を共有するので、
// キーには必ず接頭辞をつける。

import { normalizeMode, usesLapNumbers, type Run, type Session } from './engine';
import { MATERIAL_COLORS, defaultColor } from './palette';
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
  /** 見た目のテーマと模様（スタイルタブ）。id は 't:soda' のような形 */
  theme: string;
  pattern: string;
  /** ガチャで手に入れたテーマ・模様の id */
  unlocked: string[];
  /** 最後にガチャを引いた日（'2026-11-28'）。グミで引くようになってからは使わない */
  gachaDay: string;
  /**
   * グミの台帳。{ 'l:2026-11-28': 120, 'g:xxxx': -120 } のように、もらった・使った分を1件ずつ入れる。
   * 残高は合計。キーが同じものは1回だけ（同じ日のログインボーナスを2回もらえない）。
   * 端末どうしでは、キーを足し合わせて残す（同じキーは大きいほう）
   */
  gumi: Record<string, number>;
  /** 計測中の時計の見た目（src/ui/faces.ts。はじめから全部使える） */
  face: string;
  /**
   * ポモドーロで、途中から教材を変える並び（2つ以上のときだけ使う）。
   * n はそのまとまりのセット数（最後のまとまりは、そのあとずっと）。1つ目の教材は、いつも今の教材（materialId）
   */
  pomoPlan: PlanBlock[];
  /** 消した記録の id（ほかの端末やバックアップから戻ってこないように覚えておく。端末どうしで足し合わせる） */
  removed: string[];
}

export interface PlanBlock {
  /** 教材の id（教材なしは null） */
  m: string | null;
  n: number;
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
  theme: 't:default',
  pattern: 'p:none',
  unlocked: [],
  gachaDay: '',
  gumi: {},
  face: 'ring',
  pomoPlan: [],
  removed: [],
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

// ---- 変更の知らせ（ログインしている人のバックアップに使う） ----

/**
 * sessions = 記録が増えた・変わった（ids）、removed = 記録を消した、clear = 記録を全部消した、state = 設定か教材が変わった
 */
export type StoreChange =
  | { kind: 'sessions'; ids: string[] }
  | { kind: 'removed'; sessions: { id: string; start: number }[] }
  | { kind: 'clear' }
  | { kind: 'state' };

const listeners = new Set<(c: StoreChange) => void>();
/** クラウドから取り込んでいる間は知らせない（取り込んだものを送り返さないため） */
let quiet = false;

export function onStoreChange(fn: (c: StoreChange) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(c: StoreChange): void {
  if (quiet) return;
  for (const fn of listeners) fn(c);
}

// ---- 設定 ----

export const settings: Settings = { ...DEFAULTS, ...(read<Partial<Settings>>('settings') ?? {}) };
if (!settings.gumi || typeof settings.gumi !== 'object') settings.gumi = {};
if (!Array.isArray(settings.pomoPlan)) settings.pomoPlan = [];
if (!Array.isArray(settings.removed)) settings.removed = [];

setDurationStyle(settings.durationStyle);

export function saveSettings(patch: Partial<Settings> = {}): void {
  Object.assign(settings, patch);
  setDurationStyle(settings.durationStyle);
  write('settings', settings);
  emit({ kind: 'state' });
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
  emit({ kind: 'sessions', ids: [s.id] });
}

/** 記録を1件消す（消したことは覚えておき、バックアップやほかの端末からも消える） */
export function removeSession(id: string): void {
  const s = sessions.find((x) => x.id === id);
  if (!s) return;
  sessions = sessions.filter((x) => x.id !== id);
  write('sessions', sessions);
  saveSettings({ removed: [...new Set([...settings.removed, id])] });
  emit({ kind: 'removed', sessions: [{ id, start: s.start }] });
}

/** 消した記録を取り除く。変わったら true */
function dropRemoved(): boolean {
  if (settings.removed.length === 0) return false;
  const gone = new Set(settings.removed);
  const before = sessions.length;
  sessions = sessions.filter((s) => !gone.has(s.id));
  if (sessions.length === before) return false;
  write('sessions', sessions);
  return true;
}

export function clearSessions(): void {
  sessions = [];
  remove('sessions');
  saveSettings({ nextLap: null });
  for (const m of materials) m.nextLap = null;
  write('materials', materials);
  emit({ kind: 'clear' });
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
  /** 自分で選んだ色（なければ作った順の色） */
  color?: string;
  /** ジャンル（数学・英語など。この端末の中での分け方） */
  genre?: string;
  /** 画像（96px 四方の JPEG の data URL） */
  img?: string;
  /** 数え方（'問'・'講' など。src/units.ts。なければ「問」） */
  unit?: string;
  archived?: boolean;
}

/** 教材を編集するときに変えられるもの（img・genre を undefined にすると消す） */
export type MaterialPatch = Partial<Pick<Material, 'name' | 'color' | 'genre' | 'img' | 'unit'>>;

let materials: Material[] = read<Material[]>('materials') ?? [];

/** 教材の並び順（色を決めるのに使う。削除したものも含めて、作った順） */
export const materialOrder = (id: string): number => materials.findIndex((m) => m.id === id);

/** 選べる教材（削除したものを除く） */
/** すべての教材（削除したものも含む。バックアップ用） */
export const allMaterials = (): readonly Material[] => materials;

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
  emit({ kind: 'state' });
}

export function addMaterial(name: string, extra: MaterialPatch = {}): Material {
  // 色は、ほかの教材（消したものを除く）とかぶらない最初の色にする
  const used = new Set(materials.filter((x) => !x.archived).map((x) => x.color ?? defaultColor(materialOrder(x.id))));
  const color = MATERIAL_COLORS.find((c) => !used.has(c)) ?? defaultColor(materials.length);
  const m: Material = { id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, nextLap: null, color };
  applyPatch(m, extra);
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

function applyPatch(m: Material, patch: MaterialPatch): void {
  for (const key of ['name', 'color', 'genre', 'img', 'unit'] as const) {
    if (!(key in patch)) continue;
    const v = patch[key];
    if (v === undefined || v === '') delete m[key];
    else m[key] = v;
  }
}

/**
 * 教材を並べ替える（ids の順に。ids にない教材＝削除したものなどは後ろに）。
 * ジャンルの順番は、そのジャンルの教材がはじめに出てくる順なので、いっしょに変わる。
 * 色を決めていない教材は並び順で色が決まるので、今の色を入れてから並べ替える（色が変わらないように）。
 */
export function reorderMaterials(ids: string[]): void {
  for (const m of materials) if (!m.color) m.color = defaultColor(materialOrder(m.id));
  const pos = new Map(ids.map((id, i) => [id, i]));
  const listed = materials.filter((m) => pos.has(m.id)).sort((a, b) => pos.get(a.id)! - pos.get(b.id)!);
  materials = [...listed, ...materials.filter((m) => !pos.has(m.id))];
  saveMaterials();
}

/** 教材の名前・色・ジャンル・画像をまとめて変える */
export function updateMaterial(id: string, patch: MaterialPatch): void {
  const m = materialById(id);
  if (!m) return;
  applyPatch(m, patch);
  saveMaterials();
}

/** 使っているジャンル（教材の並び順で、最初に出てきた順） */
export function materialGenres(): string[] {
  const out: string[] = [];
  for (const m of activeMaterials()) if (m.genre && !out.includes(m.genre)) out.push(m.genre);
  return out;
}

/** 教材の色を変える */
export function setMaterialColor(id: string, color: string): void {
  const m = materialById(id);
  if (!m) return;
  m.color = color;
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
  const changed = sessions.filter((s) => !s.material).map((s) => s.id);
  sessions = sessions.map((s) => (s.material ? s : { ...s, material: id }));
  write('sessions', sessions);
  emit({ kind: 'sessions', ids: changed });
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
    (s.cont === undefined || typeof s.cont === 'boolean') &&
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
      materials.push({
        id: m.id,
        name: m.name,
        nextLap: null,
        archived: !!m.archived,
        ...(m.color ? { color: m.color } : {}),
        ...(m.genre ? { genre: m.genre } : {}),
        ...(typeof m.unit === 'string' ? { unit: m.unit } : {}),
        ...(typeof m.img === 'string' && m.img.startsWith('data:image/') ? { img: m.img } : {}),
      });
    }
  }
  saveMaterials();
  const known = new Set(sessions.map((s) => s.id));
  const incoming = migrate(data.sessions.filter(isSession)).filter((s) => !known.has(s.id));
  sessions = [...sessions, ...incoming].sort((a, b) => a.start - b.start);
  write('sessions', sessions);
  if (incoming.length) emit({ kind: 'sessions', ids: incoming.map((s) => s.id) });
  return incoming.length;
}

// ---- クラウドのバックアップを取り込む ----

/** 設定か教材を一度でも保存したか（入れ直した直後なら false） */
export const hasSavedState = (): boolean => read('settings') !== null || read('materials') !== null;

export interface CloudData {
  /** これがあれば、端末の設定をこれで置き換える */
  settings?: Partial<Settings>;
  /** 教材。同じ id はクラウドのものにするか（replace）、端末にないものだけ足すか */
  materials?: Material[];
  replaceMaterials?: boolean;
  /** 記録。端末にないものを足す */
  sessions?: Session[];
  /** この時刻までに終わった記録は消す（別の端末で「記録を全部消す」をしたとき） */
  clearedAt?: number;
}

/**
 * クラウドのバックアップを端末に取り込む。何か変わったら true。
 * 取り込んだ分は変更として知らせない（送り返さない）。
 */
export function mergeCloud(data: CloudData): boolean {
  let changed = false;
  quiet = true;
  try {
    if (data.settings) {
      const patch: Partial<Settings> = {};
      for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
        if (key in data.settings) (patch as Record<string, unknown>)[key] = data.settings[key];
      }
      // 手に入れたスタイルとグミの台帳は、どちらの端末のものも残す。ガチャを引いた日は新しいほう
      Object.assign(patch, collectibles(data.settings));
      const cloudDay = typeof data.settings.gachaDay === 'string' ? data.settings.gachaDay : '';
      patch.gachaDay = cloudDay > settings.gachaDay ? cloudDay : settings.gachaDay;
      saveSettings(patch);
      changed = true;
    }
    if (data.materials?.length) {
      const byId = new Map(materials.map((m) => [m.id, m]));
      for (const m of data.materials) {
        if (!m || typeof m.id !== 'string' || typeof m.name !== 'string') continue;
        const mine = byId.get(m.id);
        if (!mine) byId.set(m.id, { ...m, nextLap: m.nextLap ?? null });
        else if (data.replaceMaterials) Object.assign(mine, m, { nextLap: m.nextLap ?? null });
        else continue;
        changed = true;
      }
      // 色を決めていない教材は、作った順（id の順）の色を入れておく（並べ替えても、どの端末でも同じ色になるように）
      [...byId.values()]
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .forEach((m, i) => {
          if (!m.color) m.color = defaultColor(i);
        });
      // 並び順は、クラウドのほうが新しければクラウドの順、そうでなければ端末の順（知らない教材は後ろに）
      const order = data.replaceMaterials
        ? [...data.materials.map((m) => m?.id), ...materials.map((m) => m.id)]
        : [...materials.map((m) => m.id), ...data.materials.map((m) => m?.id)];
      const seen = new Set<string>();
      materials = order.flatMap((id) => {
        const m = typeof id === 'string' && !seen.has(id) ? byId.get(id) : undefined;
        if (!m) return [];
        seen.add(id as string);
        return [m];
      });
      write('materials', materials);
    }
    if (data.clearedAt) {
      const before = sessions.length;
      sessions = sessions.filter((s) => s.end > data.clearedAt!);
      if (sessions.length !== before) changed = true;
    }
    if (dropRemoved()) changed = true;
    if (data.sessions?.length) {
      const gone = new Set(settings.removed);
      const index = new Map(sessions.map((s, i) => [s.id, i]));
      for (const s of migrate(data.sessions.filter(isSession))) {
        if (data.clearedAt && s.end <= data.clearedAt) continue;
        if (gone.has(s.id)) continue;
        const i = index.get(s.id);
        if (i === undefined) {
          index.set(s.id, sessions.length);
          sessions.push(s);
          changed = true;
        } else if (!sessions[i].material && s.material) {
          // 別の端末で、教材なしの記録を教材に入れた
          sessions[i] = { ...sessions[i], material: s.material };
          changed = true;
        }
      }
      sessions.sort((a, b) => a.start - b.start);
    }
    if (changed) write('sessions', sessions);
  } finally {
    quiet = false;
  }
  return changed;
}

/** グミの台帳を足し合わせる（同じキーは大きいほう。おかしな値は捨てる） */
export function mergeLedger(a: Record<string, number>, b: unknown): Record<string, number> {
  const out = { ...a };
  if (!b || typeof b !== 'object') return out;
  for (const [k, v] of Object.entries(b as Record<string, unknown>)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    out[k] = k in out ? Math.max(out[k], v) : v;
  }
  return out;
}

/** 手に入れたスタイルとグミの台帳を、端末のものとクラウドのもので合わせた値 */
function collectibles(cloud: Partial<Settings>): Pick<Settings, 'unlocked' | 'gumi' | 'removed'> {
  const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);
  return {
    unlocked: [...new Set([...settings.unlocked, ...strings(cloud.unlocked)])],
    gumi: mergeLedger(settings.gumi, cloud.gumi),
    // 消した記録は、どちらの端末で消したものも覚えておく
    removed: [...new Set([...settings.removed, ...strings(cloud.removed)])],
  };
}

/**
 * 端末の設定のほうが新しいときに、クラウドにだけある「手に入れたスタイル」と「グミ」を取り込む
 * （送る前に呼ぶ。ほかの端末で引いたガチャやもらったグミが消えないように）。増えたら true
 */
export function mergeCollectibles(cloud: Partial<Settings> | undefined): boolean {
  if (!cloud) return false;
  const next = collectibles(cloud);
  const grew =
    next.unlocked.length !== settings.unlocked.length ||
    next.removed.length !== settings.removed.length ||
    Object.keys(next.gumi).length !== Object.keys(settings.gumi).length ||
    Object.entries(next.gumi).some(([k, v]) => settings.gumi[k] !== v);
  if (!grew) return false;
  quiet = true;
  try {
    saveSettings(next);
    dropRemoved();
  } finally {
    quiet = false;
  }
  return true;
}

/** ブラウザに「このデータは勝手に消さないで」と頼む。 */
export function requestPersistence(): void {
  void navigator.storage?.persist?.().catch(() => false);
}
