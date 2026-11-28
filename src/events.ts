// みんなのイベント（毎月）。ログインしている全員の、その月の勉強時間の合計で段階的に報酬が出る。
// 毎月自動で始まるので、手で更新しなくてよい。
// 合計は Firebase に置いた「一人ひとりのその月の合計」を足して出す（cloud/events.ts）。

import { api } from './cloud/api';
import { dateKey } from './cloud/model';
import { addEntries, hasEntry } from './gumi';
import { getSessions, settings } from './store';
import { HOUR } from './time';

export const EVENT_GOAL_H = 2000;
export const EVENT_TIERS: readonly { h: number; reward: number }[] = [
  { h: 100, reward: 50 },
  { h: 300, reward: 100 },
  { h: 600, reward: 150 },
  { h: 1000, reward: 200 },
  { h: 2000, reward: 300 },
];
/** これだけその月に勉強した人が、報酬を受け取れる */
export const JOIN_MS = HOUR;

export const monthOf = (now = Date.now()): string => dateKey(now, settings.dayBoundaryMin).slice(0, 7);

export function prevMonth(month: string): string {
  const d = new Date(`${month}-15T12:00:00`);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 月の名前（'11月'） */
export const monthName = (month: string): string => `${Number(month.slice(5))}月`;

/** この端末の記録の、その月の合計 */
export function myMonthMs(month: string): number {
  let ms = 0;
  for (const s of getSessions()) if (dateKey(s.start, settings.dayBoundaryMin).startsWith(month)) ms += s.studyMs;
  return ms;
}

/** 月の終わりまでの日数（今日を含む） */
export function daysLeft(now = Date.now()): number {
  const d = new Date(now - settings.dayBoundaryMin * 60000);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return last - d.getDate() + 1;
}

export const tierKey = (month: string, h: number): string => `e:${month}:${h}`;

export interface Tier {
  h: number;
  reward: number;
  key: string;
  reached: boolean;
  claimed: boolean;
  /** 受け取れる（全員で達成していて、自分も参加していて、まだ受け取っていない） */
  ready: boolean;
}

export function tiers(month: string, totalMs: number | null, mine = myMonthMs(month)): Tier[] {
  return EVENT_TIERS.map(({ h, reward }) => {
    const key = tierKey(month, h);
    const reached = totalMs !== null && totalMs >= h * HOUR;
    const claimed = hasEntry(key);
    return { h, reward, key, reached, claimed, ready: reached && !claimed && mine >= JOIN_MS };
  });
}

/** 受け取れる段階をまとめて受け取る。もらったグミ */
export function claimTiers(list: Tier[]): number {
  const entries: Record<string, number> = {};
  for (const t of list) if (t.ready) entries[t.key] = t.reward;
  if (Object.keys(entries).length) addEntries(entries);
  return Object.values(entries).reduce((a, b) => a + b, 0);
}

// ---- 合計（最後に読んだ値を覚えておく。オフラインでも出せるように） ----

const CACHE = 'studytimer:event';

interface Cached {
  total: number;
  people: number;
  at: number;
}

function readCache(): Record<string, Cached> {
  try {
    return JSON.parse(localStorage.getItem(CACHE) ?? '{}') as Record<string, Cached>;
  } catch {
    return {};
  }
}

export const cachedTotal = (month: string): Cached | null => readCache()[month] ?? null;

/** 全員の合計を読み直す（ログインしていなければ null） */
export async function loadTotal(month: string): Promise<Cached | null> {
  if (!api.user()) return null;
  const r = await api.eventTotal(month);
  const all = readCache();
  all[month] = { ...r, at: Date.now() };
  // 新しい2か月分だけ残す
  const keep = Object.keys(all).sort().slice(-2);
  try {
    localStorage.setItem(CACHE, JSON.stringify(Object.fromEntries(keep.map((k) => [k, all[k]]))));
  } catch {
    /* 保存できなくてもよい */
  }
  return all[month];
}

/** 受け取れる段階の数（覚えている合計で数える。今月と先月） */
export function claimableTiers(now = Date.now()): number {
  const m = monthOf(now);
  return [m, prevMonth(m)].reduce((n, month) => n + tiers(month, cachedTotal(month)?.total ?? null).filter((t) => t.ready).length, 0);
}
