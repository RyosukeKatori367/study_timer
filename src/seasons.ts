// みんなのイベントのシーズン。「チャプター1 シーズン1」のように数える。
// 決めたシーズン（SEASONS）が終わったら、同じチャプターの次のシーズンが同じ長さで自動で続く
// （手で更新しなくても、イベントが途切れない）。新しいチャプターや特別なシーズンは SEASONS に足す。

export interface Tier {
  h: number;
  reward: number;
}

export interface Season {
  /** 'c1s1'（Firebase の文書の名前と、グミの台帳のキーに使う） */
  id: string;
  chapter: number;
  season: number;
  /** 'チャプター1 シーズン1' */
  name: string;
  /** 'C1S1' */
  short: string;
  /** 始まりと終わりの日（どちらも含む。1日の区切りの設定で数える） */
  start: string;
  end: string;
  days: number;
  /** みんなで何時間 */
  goalH: number;
  tiers: readonly Tier[];
  /** シーズンの名前（'虚空劫灰のプラーナ'）。自動で続くシーズンにはない */
  title?: string;
  /** 英語の副題（はじまりの演出に出す） */
  en?: string;
  /** 見た目（イベントの帯と演出の色）。src/style.css の .season-<look> */
  look?: string;
}

const TIERS: Tier[] = [
  { h: 100, reward: 50 },
  { h: 300, reward: 100 },
  { h: 600, reward: 150 },
  { h: 1000, reward: 200 },
  { h: 2000, reward: 300 },
];

interface Def {
  chapter: number;
  season: number;
  start: string;
  days: number;
  goalH?: number;
  tiers?: Tier[];
  title?: string;
  en?: string;
  look?: string;
}

/** 決めたシーズン（日付の順）。このあとは同じチャプターで自動で続く */
export const SEASONS: Def[] = [
  { chapter: 1, season: 1, start: '2026-11-28', days: 40, title: '虚空劫灰のプラーナ', en: 'PRANA OF THE VOID AND ASH', look: 'kuukou' },
];

const DEFAULT_DAYS = 40;
const DEFAULT_GOAL_H = 2000;

/** '2026-11-28' の n 日後 */
export function addDayKey(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** a から b まで何日か（b − a） */
export function dayDiff(a: string, b: string): number {
  return Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000);
}

function make(d: Def): Season {
  const goalH = d.goalH ?? DEFAULT_GOAL_H;
  return {
    id: `c${d.chapter}s${d.season}`,
    chapter: d.chapter,
    season: d.season,
    name: `チャプター${d.chapter} シーズン${d.season}`,
    short: `C${d.chapter}S${d.season}`,
    start: d.start,
    end: addDayKey(d.start, d.days - 1),
    days: d.days,
    goalH,
    tiers: d.tiers ?? TIERS.filter((t) => t.h <= goalH),
    ...(d.title ? { title: d.title } : {}),
    ...(d.en ? { en: d.en } : {}),
    ...(d.look ? { look: d.look } : {}),
  };
}

/** day の日を含むシーズンまでの一覧（最初から順に） */
export function seasonsUntil(day: string): Season[] {
  const out: Season[] = [];
  let i = 0;
  let s = make(SEASONS[0]);
  out.push(s);
  while (s.end < day) {
    const next = SEASONS[i + 1];
    if (next && next.start > s.end) {
      i++;
      s = make(next);
    } else {
      s = make({ chapter: s.chapter, season: s.season + 1, start: addDayKey(s.end, 1), days: DEFAULT_DAYS });
    }
    out.push(s);
    if (out.length > 1000) break; // 念のため
  }
  return out;
}

/** day の日のシーズン（最初のシーズンより前、またはシーズンのあいだの日なら null） */
export function seasonAt(day: string): Season | null {
  if (day < SEASONS[0].start) return null;
  const s = seasonsUntil(day).at(-1)!;
  return day >= s.start && day <= s.end ? s : null;
}

/** そのひとつ前のシーズン */
export function prevSeason(s: Season): Season | null {
  const list = seasonsUntil(s.start);
  const i = list.findIndex((x) => x.id === s.id);
  return i > 0 ? list[i - 1] : null;
}

/** 名前（'C1S1' など）。わからなければ id のまま */
export function seasonShort(id: string): string {
  const m = id.match(/^c(\d+)s(\d+)$/);
  return m ? `C${m[1]}S${m[2]}` : id;
}

export const inSeason = (s: Season, day: string): boolean => day >= s.start && day <= s.end;

/** 終わりまでの日数（今日を含む） */
export const daysLeftIn = (s: Season, today: string): number => dayDiff(today, s.end) + 1;

/** '11/28' */
export const md = (key: string): string => `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
