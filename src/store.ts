// 設定と記録の保存。すべて端末内の localStorage に入れる（サーバーなし）。
// GitHub Pages では同じユーザーの全リポジトリが保存領域を共有するので、
// キーには必ず接頭辞をつける。

import type { Run, Session } from './engine';
import { MIN } from './time';

const PREFIX = 'studytimer:';

export type PomoKind = 'lap' | 'cycle';
export type EndKind = 'none' | 'clock' | 'total' | 'count';

export interface Settings {
  /** タイマーが 0 になったあとも数え続ける */
  overrun: boolean;
  sound: boolean;
  keepAwake: boolean;

  timerMs: number;
  presets: number[];
  /** 手で指定した開始ラップ番号。null なら前回の続き */
  nextLap: number | null;

  pomoKind: PomoKind;
  pomoLapMaxMs: number;
  workMs: number;
  breakMs: number;
  endKind: EndKind;
  /** 終了時刻（0:00 からの分） */
  endClockMin: number;
  endTotalMs: number;
  endCount: number;
}

const DEFAULTS: Settings = {
  overrun: false,
  sound: true,
  keepAwake: true,
  timerMs: 10 * MIN,
  presets: [10 * MIN, 20 * MIN, 30 * MIN],
  nextLap: null,
  pomoKind: 'cycle',
  pomoLapMaxMs: 25 * MIN,
  workMs: 25 * MIN,
  breakMs: 5 * MIN,
  endKind: 'none',
  endClockMin: 18 * 60,
  endTotalMs: 120 * MIN,
  endCount: 4,
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

export function saveSettings(patch: Partial<Settings> = {}): void {
  Object.assign(settings, patch);
  write('settings', settings);
}

// ---- 記録 ----

let sessions: Session[] = read<Session[]>('sessions') ?? [];

export const getSessions = (): readonly Session[] => sessions;

export function addSession(s: Session): void {
  sessions.push(s);
  write('sessions', sessions);
}

export function clearSessions(): void {
  sessions = [];
  remove('sessions');
}

/** ラップを使った直近のタイマー／ストップウォッチの記録 */
export function lastLapSession(): Session | null {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if ((s.mode === 'timer' || s.mode === 'stopwatch') && s.laps.length > 0) return s;
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

export const loadRun = (): Run | null => read<Run>('run');
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
    ['timer', 'stopwatch', 'pomoLap', 'pomoCycle'].includes(s.mode) &&
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
  const incoming = data.sessions.filter(isSession).filter((s) => !known.has(s.id));
  sessions = [...sessions, ...incoming].sort((a, b) => a.start - b.start);
  write('sessions', sessions);
  return incoming.length;
}

/** ブラウザに「このデータは勝手に消さないで」と頼む。 */
export function requestPersistence(): void {
  void navigator.storage?.persist?.().catch(() => false);
}
