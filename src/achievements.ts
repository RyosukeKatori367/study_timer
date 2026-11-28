// 実績。これまでの記録・集めたスタイル・ガチャ・ログインから達成を決める。達成したら1回だけグミをもらえる。

import { api } from './cloud/api';
import { dateKey } from './cloud/model';
import { addEntries, earn, hasEntry, prevDay } from './gumi';
import { allMaterials, getSessions, settings } from './store';
import { GACHA_ITEMS, isOwned } from './styles';
import { HOUR } from './time';

export interface AchCtx {
  totalMs: number;
  bestDayMs: number;
  bestStreak: number;
  studyDays: number;
  pomo: number;
  materials: number;
  owned: number;
  gacha: number;
  logins: number;
  group: number;
  event: number;
  secret: number;
  legend: number;
}

export interface AchDef {
  id: string;
  /** 一覧の見出し */
  group: string;
  title: string;
  /** 何をすると達成か */
  desc: string;
  target: number;
  /** 進み具合の出し方 */
  unit: 'h' | 'n';
  reward: number;
  value: (c: AchCtx) => number;
  /** 達成するまで中身を隠す */
  hidden?: boolean;
}

export interface Ach extends AchDef {
  key: string;
  now: number;
  done: boolean;
  claimed: boolean;
}

const defs: AchDef[] = [];
const add = (group: string, unit: AchDef['unit'], value: AchDef['value'], list: [string, string, number, number][]) => {
  for (const [id, title, target, reward] of list) {
    defs.push({ id, group, title, desc: '', target, unit, reward, value });
  }
};

add('勉強時間', 'h', (c) => c.totalMs, [
  ['total1', 'はじめの1時間', 1 * HOUR, 30],
  ['total10', '10時間', 10 * HOUR, 50],
  ['total50', '50時間', 50 * HOUR, 100],
  ['total100', '100時間', 100 * HOUR, 200],
  ['total300', '300時間', 300 * HOUR, 300],
  ['total500', '500時間', 500 * HOUR, 500],
  ['total1000', '1000時間', 1000 * HOUR, 1000],
]);
add('1日の勉強', 'h', (c) => c.bestDayMs, [
  ['day2', '1日 2時間', 2 * HOUR, 30],
  ['day4', '1日 4時間', 4 * HOUR, 60],
  ['day6', '1日 6時間', 6 * HOUR, 100],
  ['day8', '1日 8時間', 8 * HOUR, 150],
  ['day10', '1日 10時間', 10 * HOUR, 200],
]);
add('連続', 'n', (c) => c.bestStreak, [
  ['streak3', '3日 連続', 3, 30],
  ['streak7', '7日 連続', 7, 60],
  ['streak14', '14日 連続', 14, 100],
  ['streak30', '30日 連続', 30, 200],
  ['streak60', '60日 連続', 60, 300],
  ['streak100', '100日 連続', 100, 500],
]);
add('勉強した日', 'n', (c) => c.studyDays, [
  ['days10', '10日', 10, 50],
  ['days30', '30日', 30, 100],
  ['days100', '100日', 100, 200],
  ['days200', '200日', 200, 300],
  ['days365', '365日', 365, 500],
]);
add('ポモドーロ', 'n', (c) => c.pomo, [
  ['pomo1', 'はじめてのポモドーロ', 1, 20],
  ['pomo10', 'ポモドーロ 10回', 10, 50],
  ['pomo50', 'ポモドーロ 50回', 50, 100],
  ['pomo100', 'ポモドーロ 100回', 100, 150],
]);
add('教材', 'n', (c) => c.materials, [
  ['mat1', 'はじめての教材', 1, 20],
  ['mat5', '教材 5つ', 5, 50],
]);
add('コレクション', 'n', (c) => c.owned, [
  ['own10', 'スタイル 10個', 10, 50],
  ['own30', 'スタイル 30個', 30, 100],
  ['own50', 'スタイル 50個', 50, 200],
  ['own70', 'スタイル 70個', 70, 300],
  ['ownAll', 'コンプリート', GACHA_ITEMS.length, 1000],
]);
add('ガチャ', 'n', (c) => c.gacha, [
  ['gacha1', 'はじめてのガチャ', 1, 20],
  ['gacha10', 'ガチャ 10回', 10, 50],
  ['gacha50', 'ガチャ 50回', 50, 100],
  ['gacha100', 'ガチャ 100回', 100, 200],
]);
add('ログイン', 'n', (c) => c.logins, [
  ['login7', 'ログイン 7日', 7, 50],
  ['login30', 'ログイン 30日', 30, 100],
  ['login100', 'ログイン 100日', 100, 200],
]);
add('みんなと', 'n', (c) => c.group, [['group', 'グループに入る', 1, 50]]);
add('みんなと', 'n', (c) => c.event, [['event', 'みんなのイベントで報酬をもらう', 1, 50]]);
add('ひみつ', 'n', (c) => c.secret, [['secret', 'にじいろ', 1, 200]]);
add('ひみつ', 'n', (c) => c.legend, [['legend', '豪運の持ち主', 1, 300]]);

const DESC: Record<string, (d: AchDef) => string> = {
  勉強時間: (d) => `累計で ${d.target / HOUR}時間 勉強する`,
  '1日の勉強': (d) => `1日で ${d.target / HOUR}時間 勉強する`,
  連続: (d) => `${d.target}日 続けて勉強する`,
  勉強した日: (d) => `勉強した日が ${d.target}日になる`,
  ポモドーロ: (d) => `ポモドーロで ${d.target}回 記録する`,
  教材: (d) => `教材を ${d.target}つ 作る`,
  コレクション: (d) => (d.id === 'ownAll' ? 'ガチャで出るスタイルを全部集める' : `スタイルを ${d.target}個 集める`),
  ガチャ: (d) => `グミガチャを ${d.target}回 引く`,
  ログイン: (d) => `ログインボーナスを ${d.target}日 もらう`,
  みんなと: (d) => (d.id === 'group' ? 'グループに入る' : 'みんなのイベントで報酬を受け取る'),
  ひみつ: (d) => (d.id === 'secret' ? 'シークレットのテーマを手に入れる' : '豪運のタグを手に入れる'),
};
for (const d of defs) {
  d.desc = DESC[d.group](d);
  if (d.group === 'ひみつ') d.hidden = true;
}

export const ACHIEVEMENTS: readonly AchDef[] = defs;

/** 日付の一覧（並べたもの）から、いちばん長い連続の日数 */
export function longestStreak(days: string[]): number {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const d of sorted) {
    run = prev && prevDay(d) === prev ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function achContext(): AchCtx {
  const days = new Map<string, number>();
  let totalMs = 0;
  let pomo = 0;
  for (const s of getSessions()) {
    totalMs += s.studyMs;
    if (s.mode === 'pomoCycle' && !s.cont) pomo++; // 教材ごとに分けた続きは数えない
    if (s.studyMs <= 0) continue;
    const k = dateKey(s.start, settings.dayBoundaryMin);
    days.set(k, (days.get(k) ?? 0) + s.studyMs);
  }
  const keys = Object.keys(settings.gumi);
  // 期間限定ガチャ（k: 1回・K: 10回）も数える
  const gacha = keys.reduce((t, k) => t + (k.startsWith('g:') || k.startsWith('k:') ? 1 : k.startsWith('G:') || k.startsWith('K:') ? 10 : 0), 0);
  const groups = api.user() ? (api.cachedProfile()?.groupIds.length ?? 0) : 0;
  return {
    totalMs,
    bestDayMs: Math.max(0, ...days.values()),
    bestStreak: longestStreak([...days.keys()]),
    studyDays: days.size,
    pomo,
    materials: allMaterials().length,
    owned: GACHA_ITEMS.filter((x) => isOwned(x.id)).length,
    gacha,
    logins: keys.filter((k) => k.startsWith('l:')).length,
    group: groups,
    event: keys.some((k) => k.startsWith('e:')) ? 1 : 0,
    secret: isOwned('t:rainbow') ? 1 : 0,
    legend: isOwned('g:gouun') ? 1 : 0,
  };
}

export function achievements(ctx = achContext()): Ach[] {
  return defs.map((d) => {
    const key = `a:${d.id}`;
    const now = d.value(ctx);
    return { ...d, key, now, done: now >= d.target || hasEntry(key), claimed: hasEntry(key) };
  });
}

export const claimableAchievements = (list = achievements()): Ach[] => list.filter((a) => a.done && !a.claimed);

/** 受け取る。もらったグミ */
export function claimAchievements(list: Ach[]): number {
  const entries: Record<string, number> = {};
  for (const a of list) if (a.done && !hasEntry(a.key)) entries[a.key] = a.reward;
  const keys = Object.keys(entries);
  if (keys.length === 1) earn(keys[0], entries[keys[0]]);
  else if (keys.length > 1) addEntries(entries);
  return Object.values(entries).reduce((t, v) => t + v, 0);
}

export const achName = (key: string): string | undefined => defs.find((d) => `a:${d.id}` === key)?.title;

/** 今続いている日数（今日まだ勉強していなければ、昨日まで） */
export function currentStreak(now = Date.now()): number {
  const days = new Set<string>();
  for (const s of getSessions()) if (s.studyMs > 0) days.add(dateKey(s.start, settings.dayBoundaryMin));
  let k = dateKey(now, settings.dayBoundaryMin);
  if (!days.has(k)) k = prevDay(k);
  let n = 0;
  for (; days.has(k); k = prevDay(k)) n++;
  return n;
}
