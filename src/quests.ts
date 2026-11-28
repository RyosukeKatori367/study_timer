// 今日のクエスト（毎日3つ）と今週の目標（毎週3つ）。日付から自動で決まるので、毎週手で更新しなくてよい。
// 進み具合はこの端末の記録から計算する。達成したら「受け取る」でグミをもらう。

import { countsAsRecord, type Session } from './engine';
import { addDays, studyWeekStart } from './summary';
import { dateKey } from './cloud/model';
import { earn, hasEntry } from './gumi';
import { getSessions, settings } from './store';
import { HOUR, MIN } from './time';

type Calc = (ss: readonly Session[], dayKey: (ts: number) => string) => number;

export interface QuestDef {
  id: string;
  title: string;
  target: number;
  /** ms = 時間、count = 回数・日数 */
  unit: 'ms' | 'count';
  reward: number;
}

interface Def extends QuestDef {
  calc: Calc;
}

export interface Quest extends QuestDef {
  /** 台帳のキー */
  key: string;
  value: number;
  done: boolean;
  claimed: boolean;
}

const studyMs: Calc = (ss) => ss.reduce((t, s) => t + s.studyMs, 0);
/** 記録の回数（ポモドーロを教材ごとに分けた続きは数えない） */
const count = (pred: (s: Session) => boolean): Calc => (ss) => ss.filter((s) => countsAsRecord(s) && pred(s)).length;
const materials: Calc = (ss) => new Set(ss.flatMap((s) => (s.material ? [s.material] : []))).size;
const dayTotals = (ss: readonly Session[], dayKey: (ts: number) => string): Map<string, number> => {
  const m = new Map<string, number>();
  for (const s of ss) if (s.studyMs > 0) m.set(dayKey(s.start), (m.get(dayKey(s.start)) ?? 0) + s.studyMs);
  return m;
};

const time = (id: string, title: string, ms: number, reward: number): Def => ({ id, title, target: ms, unit: 'ms', reward, calc: studyMs });

// ---- 今日のクエスト ----

/** 時間のクエスト（1つ。重みつきで選ぶ） */
const DAILY_TIME: [Def, number][] = [
  [time('t30', '30分 勉強する', 30 * MIN, 20), 2],
  [time('t60', '1時間 勉強する', HOUR, 30), 2],
  [time('t120', '2時間 勉強する', 2 * HOUR, 40), 1],
];

/** そのほかのクエスト（2つ） */
const DAILY_MISC: Def[] = [
  { id: 'pomo', title: 'ポモドーロで1回 記録する', target: 1, unit: 'count', reward: 20, calc: count((s) => s.mode === 'pomoCycle') },
  { id: 'mat2', title: '2つの教材を勉強する', target: 2, unit: 'count', reward: 20, calc: materials },
  { id: 'long', title: '1回で25分以上 つづける', target: 1, unit: 'count', reward: 20, calc: count((s) => s.studyMs >= 25 * MIN) },
  {
    id: 'lap5',
    title: 'next を5回 押す',
    target: 5,
    unit: 'count',
    reward: 20,
    calc: (ss) => ss.reduce((t, s) => t + (s.mode === 'pomoCycle' ? 0 : s.laps.length), 0),
  },
  { id: 'rec2', title: '2回 記録する', target: 2, unit: 'count', reward: 20, calc: count(() => true) },
];

export const DAILY_ALL_BONUS = 30;

// ---- 今週の目標 ----

const WEEKLY_FIXED: Def[] = [time('h5', '今週 5時間 勉強する', 5 * HOUR, 60), time('h10', '今週 10時間 勉強する', 10 * HOUR, 120)];

const WEEKLY_MISC: Def[] = [
  { id: 'd3', title: '3日 勉強する', target: 3, unit: 'count', reward: 60, calc: (ss, k) => dayTotals(ss, k).size },
  { id: 'd5', title: '5日 勉強する', target: 5, unit: 'count', reward: 80, calc: (ss, k) => dayTotals(ss, k).size },
  { id: 'pomo5', title: 'ポモドーロで5回 記録する', target: 5, unit: 'count', reward: 80, calc: count((s) => s.mode === 'pomoCycle') },
  { id: 'mat3', title: '3つの教材を勉強する', target: 3, unit: 'count', reward: 60, calc: materials },
  {
    id: 'big3',
    title: '2時間以上の日を3日 つくる',
    target: 3,
    unit: 'count',
    reward: 100,
    calc: (ss, k) => [...dayTotals(ss, k).values()].filter((ms) => ms >= 2 * HOUR).length,
  },
];

/** 文字列から決まる数（同じ日なら、どの端末でも同じクエストになるように） */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function weighted<T>(list: [T, number][], n: number): T {
  const total = list.reduce((t, [, w]) => t + w, 0);
  let r = n % total;
  for (const [x, w] of list) {
    if (r < w) return x;
    r -= w;
  }
  return list[0][0];
}

/** その日のクエストの中身（日付だけで決まる） */
export function dailyDefs(day: string): Def[] {
  const h = hash(`daily:${day}`);
  const first = weighted(DAILY_TIME, h);
  const a = h % DAILY_MISC.length;
  const b = (a + 1 + ((h >>> 8) % (DAILY_MISC.length - 1))) % DAILY_MISC.length;
  return [first, DAILY_MISC[a], DAILY_MISC[b]];
}

/** その週の目標の中身（週の最初の日だけで決まる） */
export function weeklyDefs(week: string): Def[] {
  return [...WEEKLY_FIXED, WEEKLY_MISC[hash(`weekly:${week}`) % WEEKLY_MISC.length]];
}

const dayKeyFn = () => (ts: number) => dateKey(ts, settings.dayBoundaryMin);

function build(defs: Def[], prefix: string, ss: readonly Session[]): Quest[] {
  const k = dayKeyFn();
  return defs.map((d) => {
    const value = d.calc(ss, k);
    const key = `${prefix}:${d.id}`;
    const { calc: _calc, ...def } = d;
    return { ...def, key, value, done: value >= d.target, claimed: hasEntry(key) };
  });
}

export function dailyQuests(now = Date.now()): Quest[] {
  const today = dateKey(now, settings.dayBoundaryMin);
  const k = dayKeyFn();
  const ss = getSessions().filter((s) => k(s.start) === today);
  return build(dailyDefs(today), `d:${today}`, ss);
}

/** 今日のクエストを全部達成したときのおまけ */
export function dailyAllClear(now = Date.now()): { key: string; reward: number; done: boolean; claimed: boolean } {
  const today = dateKey(now, settings.dayBoundaryMin);
  const key = `D:${today}`;
  return { key, reward: DAILY_ALL_BONUS, done: dailyQuests(now).every((q) => q.done), claimed: hasEntry(key) };
}

/** 今週の最初の日（'2026-11-23'）と、次に入れ替わる時刻 */
export function weekInfo(now = Date.now()): { week: string; start: number; next: number } {
  const opt = { boundaryMin: settings.dayBoundaryMin, weekStartsOn: settings.weekStartsOn };
  const start = studyWeekStart(now, opt);
  return { week: dateKey(start, settings.dayBoundaryMin), start, next: addDays(start, 7, settings.dayBoundaryMin) };
}

export function weeklyQuests(now = Date.now()): Quest[] {
  const { week, start, next } = weekInfo(now);
  const ss = getSessions().filter((s) => s.start >= start && s.start < next);
  return build(weeklyDefs(week), `w:${week}`, ss);
}

/** 受け取る。もらえたら true */
export function claimQuest(q: { key: string; reward: number; done: boolean }): boolean {
  return q.done && earn(q.key, q.reward);
}

/** 台帳のキーから、クエストの名前を引く（履歴用） */
export function questName(key: string): string | undefined {
  const [p, , id] = key.split(':');
  if (p === 'd') return [...DAILY_TIME.map(([d]) => d), ...DAILY_MISC].find((d) => d.id === id)?.title;
  if (p === 'w') return [...WEEKLY_FIXED, ...WEEKLY_MISC].find((d) => d.id === id)?.title;
  return undefined;
}

/** 受け取れるクエストの数（今日・今週） */
export function claimableQuests(now = Date.now()): number {
  const all = dailyAllClear(now);
  return (
    [...dailyQuests(now), ...weeklyQuests(now)].filter((q) => q.done && !q.claimed).length + (all.done && !all.claimed ? 1 : 0)
  );
}
