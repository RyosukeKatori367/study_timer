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
  /** 何番のラップで終えるか */
  lapEndLapNo: number;
  /** finish したとき途中だったラップを済んだことにして、次は次の番号から始める */
  lapAdvance: boolean;
  /** ラップ数で終えるときの残り時間の目安。average = 平均ラップ、timer = タイマーの設定時間 */
  lapEstimate: 'average' | 'timer';
  /** finish は長押しで終わる（オフなら1回タップ） */
  finishHold: boolean;
  /** lap を押したときに短い音を鳴らす */
  lapSound: boolean;

  // 統計
  /** 1日の区切り（0:00 からの分）。4:00 にすると、深夜の勉強を前の日に数える */
  dayBoundaryMin: number;
  /** 週の始まり。1 = 月曜、0 = 日曜 */
  weekStartsOn: 0 | 1;
  /** 1日の目標時間。0 なら目標なし */
  dailyGoalMs: number;
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
  dayBoundaryMin: 0,
  weekStartsOn: 1,
  dailyGoalMs: 0,
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
}

/** ラップを使った直近の記録（タイマーの2モードとストップウォッチで共通） */
export function lastLapSession(): Session | null {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if (usesLapNumbers(s.mode) && s.laps.length > 0) return s;
  }
  return null;
}

/** 次に始めるラップ番号（手で指定していればそれ、なければ前回の続き） */
export function nextLapNumber(): number {
  if (settings.nextLap !== null) return settings.nextLap;
  const last = lastLapSession();
  return last ? last.firstLap + last.laps.length : 1;
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
  version: 1;
  exportedAt: string;
  settings: Settings;
  sessions: Session[];
}

export function exportBackup(): string {
  const data: Backup = {
    app: 'gumiben',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    sessions,
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
    s.laps.every((v) => typeof v === 'number')
  );
}

/** 書き出したファイルを読み込み、今の記録に足す。追加した件数を返す。 */
export function importBackup(text: string): number {
  const data = JSON.parse(text) as Partial<Backup>;
  if (data.app !== 'gumiben' || !Array.isArray(data.sessions)) {
    throw new Error('グミ勉の記録ファイルではありません');
  }
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
