// グループ画面で使う、時刻や時間の書き方（画面から切り離してテストする）。

import type { Mode } from '../../engine';
import { pad2 } from '../../time';

const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const MODE_LABEL: Record<Mode, string> = {
  timer: 'タイマー',
  timerUp: 'カウントアップ',
  stopwatch: 'ストップウォッチ',
  pomoCycle: 'ポモドーロ',
  manual: '手入力',
};

const clock = (d: Date): string => `${d.getHours()}:${pad2(d.getMinutes())}`;

/** 時刻（今日なら 16:30、昨日なら 昨日 16:30、それより前は 11/24 16:30） */
export function absTime(at: number, now = Date.now()): string {
  const d = new Date(at);
  const t = new Date(now);
  const startOfToday = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  if (at >= startOfToday) return clock(d);
  if (at >= startOfToday - DAY) return `昨日 ${clock(d)}`;
  const year = d.getFullYear() !== t.getFullYear() ? `${d.getFullYear()}/` : '';
  return `${year}${d.getMonth() + 1}/${d.getDate()} ${clock(d)}`;
}

/** どれくらい前か（たった今、5分前、3時間前、2日前）。1週間より前は出さない */
export function relTime(at: number, now = Date.now()): string {
  const ms = Math.max(0, now - at);
  if (ms < MIN) return 'たった今';
  if (ms < HOUR) return `${Math.floor(ms / MIN)}分前`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}時間前`;
  if (ms < 7 * DAY) return `${Math.floor(ms / DAY)}日前`;
  return '';
}

/** 投稿の時刻（「16:30・12分前」） */
export function postTime(at: number, now = Date.now()): string {
  const rel = relTime(at, now);
  return rel ? `${absTime(at, now)}・${rel}` : absTime(at, now);
}

/** 時刻の範囲（14:27〜16:30） */
export const timeRange = (start: number, end: number): string => `${clock(new Date(start))}〜${clock(new Date(end))}`;

/** いいねした人の名前（3人まで、それより多ければ「ほかN人」） */
export function likeNames(names: string[]): string {
  if (names.length <= 3) return names.join('・');
  return `${names.slice(0, 3).join('・')} ほか${names.length - 3}人`;
}

/** 新着の数（10 以上は 9+） */
export const badgeText = (n: number): string => (n > 9 ? '9+' : String(n));
