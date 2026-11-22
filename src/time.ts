// 時間の表示用フォーマット。すべてミリ秒を受け取る。

export const SEC = 1000;
export const MIN = 60 * SEC;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * 1時間を超える時間の出し方（設定で切り替える）。
 * hm … 1時間38分 / 1:38:12
 * m  … 98分 / 98:12
 */
export type DurationStyle = 'hm' | 'm';

let style: DurationStyle = 'hm';

export function setDurationStyle(next: DurationStyle): void {
  style = next;
}

function clockFromSeconds(total: number, forceHours: boolean): string {
  if (style === 'm') return `${Math.floor(total / 60)}:${pad2(total % 60)}`;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 || forceHours ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

/** 分を「1時間38分」か「98分」にする（設定による） */
function minutesText(total: number): string {
  const h = Math.floor(total / 60);
  return style === 'hm' && h > 0 ? `${h}時間${total % 60}分` : `${total}分`;
}

/** 経過時間（切り捨て）。例: 7:26 / 2:48:12（98分表示なら 168:12） */
export function fmtElapsed(ms: number, forceHours = false): string {
  return clockFromSeconds(Math.max(0, Math.floor(ms / SEC)), forceHours);
}

/** 残り時間（切り上げ）。12:00 から始まり、ちょうど 0 で 0:00 になる。 */
export function fmtRemain(ms: number): string {
  return clockFromSeconds(Math.max(0, Math.ceil(ms / SEC)), false);
}

/** ラップ時間。例: 12分2秒 / 3秒 / 1時間38分7秒（98分表示なら 98分7秒） */
export function fmtLap(ms: number): string {
  const total = Math.max(0, Math.floor(ms / SEC));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${minutesText(m)}${s}秒` : `${s}秒`;
}

/** 合計時間。例: 3時間42分 / 25分（98分表示なら 222分） */
export function fmtHM(ms: number): string {
  return minutesText(Math.max(0, Math.floor(ms / MIN)));
}

/** 時刻（0:00 からの分）を 18:00 の形にする。 */
export function fmtTimeOfDay(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${pad2(minutes % 60)}`;
}

/** その日の 0:00 のタイムスタンプ。 */
export function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** その週の月曜 0:00 のタイムスタンプ。 */
export function weekStart(ts: number): number {
  const d = new Date(dayStart(ts));
  const offset = (d.getDay() + 6) % 7; // 月=0 … 日=6
  d.setDate(d.getDate() - offset);
  return d.getTime();
}
