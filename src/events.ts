// みんなのイベント（シーズンごと）。ログインしている全員の、そのシーズンの勉強時間の合計で、段階的に報酬が出る。
// シーズンは src/seasons.ts（今は「チャプター1 シーズン1」、2026-11-28 から40日）。
// 合計は Firebase に置いた「一人ひとりのそのシーズンの合計」を足して出す（cloud/events.ts）。

import { api } from './cloud/api';
import { dateKey } from './cloud/model';
import { addEntries, hasEntry } from './gumi';
import { inSeason, prevSeason, seasonAt, type Season } from './seasons';
import { getSessions, settings } from './store';
import { HOUR } from './time';

/** シーズン中にこれだけ勉強した人が、報酬を受け取れる */
export const JOIN_MS = HOUR;

const today = (now = Date.now()): string => dateKey(now, settings.dayBoundaryMin);

export const currentSeason = (now = Date.now()): Season | null => seasonAt(today(now));

/** 今のシーズンと、ひとつ前のシーズン（受け取り忘れ用） */
export function liveSeasons(now = Date.now()): { cur: Season | null; prev: Season | null } {
  const cur = currentSeason(now);
  return { cur, prev: cur ? prevSeason(cur) : null };
}

/** この端末の記録の、そのシーズンの合計 */
export function mySeasonMs(s: Season): number {
  let ms = 0;
  for (const x of getSessions()) if (inSeason(s, dateKey(x.start, settings.dayBoundaryMin))) ms += x.studyMs;
  return ms;
}

export const tierKey = (s: Season, h: number): string => `e:${s.id}:${h}`;

export interface TierState {
  h: number;
  reward: number;
  key: string;
  reached: boolean;
  claimed: boolean;
  /** 受け取れる（全員で達成していて、自分も参加していて、まだ受け取っていない） */
  ready: boolean;
}

export function tiers(s: Season, totalMs: number | null, mine = mySeasonMs(s)): TierState[] {
  return s.tiers.map(({ h, reward }) => {
    const key = tierKey(s, h);
    const reached = totalMs !== null && totalMs >= h * HOUR;
    const claimed = hasEntry(key);
    return { h, reward, key, reached, claimed, ready: reached && !claimed && mine >= JOIN_MS };
  });
}

/** 受け取れる段階をまとめて受け取る。もらったグミ */
export function claimTiers(list: TierState[]): number {
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

export const cachedTotal = (id: string): Cached | null => readCache()[id] ?? null;

/** 全員の合計を読み直す（ログインしていなければ null） */
export async function loadTotal(id: string): Promise<Cached | null> {
  if (!api.user()) return null;
  const r = await api.eventTotal(id);
  const all = readCache();
  all[id] = { ...r, at: Date.now() };
  // 新しい3つだけ残す
  const keep = Object.entries(all)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, 3);
  try {
    localStorage.setItem(CACHE, JSON.stringify(Object.fromEntries(keep)));
  } catch {
    /* 保存できなくてもよい */
  }
  return all[id];
}

/** 受け取れる段階の数（覚えている合計で数える。今のシーズンとひとつ前） */
export function claimableTiers(now = Date.now()): number {
  const { cur, prev } = liveSeasons(now);
  return [cur, prev].reduce((n, s) => (s ? n + tiers(s, cachedTotal(s.id)?.total ?? null).filter((t) => t.ready).length : n), 0);
}
