// 見た目のスタイル（テーマの色と、背景の模様）と、1日1回のグミガチャ。
// テーマはボタン・選んでいるところ・計測の円・下のメニューの色を変える。背景は黒のまま
// （常時表示で明るい画面をつけっぱなしにしないため）。模様は計測中の画面には出さない。
// 模様の画像は public/patterns/ に置いた SVG（GitHub Pages から配る）。テーマの色に塗って使う。

import { dateKey } from './cloud/model';
import { saveSettings, settings } from './store';

export type Rarity = 'N' | 'R' | 'SR' | 'SSR';

export interface ThemeItem {
  kind: 'theme';
  id: string;
  name: string;
  rarity: Rarity;
  /** 選んでいるところ・ボタンの色（明るい色。上の文字は黒） */
  light: string;
  /** 計測の円・いちばん目立つボタンの色 */
  strong: string;
  /** start などの大きいボタンの背景（グラデーションのテーマだけ） */
  start?: string;
}

export interface PatternItem {
  kind: 'pattern';
  id: string;
  name: string;
  rarity: Rarity;
  /** public/patterns/ の中のファイル（なしなら模様なし） */
  file?: string;
  /** 模様の濃さ */
  alpha: number;
}

export type StyleItem = ThemeItem | PatternItem;

export const THEMES: ThemeItem[] = [
  { kind: 'theme', id: 't:default', name: 'モノクロ', rarity: 'N', light: '#e6e6e6', strong: '#ffffff' },
  { kind: 'theme', id: 't:soda', name: 'ソーダ', rarity: 'N', light: '#a9dcff', strong: '#d5eeff' },
  { kind: 'theme', id: 't:melon', name: 'メロン', rarity: 'N', light: '#b9eea4', strong: '#dcf7d1' },
  { kind: 'theme', id: 't:lemon', name: 'レモン', rarity: 'N', light: '#fbe98f', strong: '#fdf4c7' },
  { kind: 'theme', id: 't:strawberry', name: 'いちご', rarity: 'N', light: '#ffb6cf', strong: '#ffdbe7' },
  { kind: 'theme', id: 't:orange', name: 'オレンジ', rarity: 'R', light: '#ffc996', strong: '#ffe4ca' },
  { kind: 'theme', id: 't:grape', name: 'グレープ', rarity: 'R', light: '#cdbaff', strong: '#e6dcff' },
  { kind: 'theme', id: 't:mint', name: 'ミント', rarity: 'R', light: '#a6eed8', strong: '#d2f6ec' },
  {
    kind: 'theme',
    id: 't:ramune',
    name: 'ラムネ',
    rarity: 'SR',
    light: '#b4e6ff',
    strong: '#e2f6ff',
    start: 'linear-gradient(160deg, #e9f8ff 0%, #9fd8ff 55%, #c4f1ff 100%)',
  },
  {
    kind: 'theme',
    id: 't:sakura',
    name: 'さくら',
    rarity: 'SR',
    light: '#ffc6d6',
    strong: '#ffe6ee',
    start: 'linear-gradient(160deg, #fff1f5 0%, #ffbfd2 60%, #ffe0ea 100%)',
  },
  {
    kind: 'theme',
    id: 't:aurora',
    name: 'オーロラ',
    rarity: 'SSR',
    light: '#bfe9e4',
    strong: '#dff7f2',
    start: 'linear-gradient(135deg, #a7f3d0 0%, #a5d8ff 45%, #d0bfff 100%)',
  },
  {
    kind: 'theme',
    id: 't:gold',
    name: 'ゴールド',
    rarity: 'SSR',
    light: '#f3d98b',
    strong: '#fff0c2',
    start: 'linear-gradient(135deg, #fff3c4 0%, #f2c94c 40%, #fff0b8 60%, #d9a52b 100%)',
  },
];

export const PATTERNS: PatternItem[] = [
  { kind: 'pattern', id: 'p:none', name: 'なし', rarity: 'N', alpha: 0 },
  { kind: 'pattern', id: 'p:dots', name: 'ドット', rarity: 'N', file: 'dots.svg', alpha: 0.16 },
  { kind: 'pattern', id: 'p:stripes', name: 'ストライプ', rarity: 'N', file: 'stripes.svg', alpha: 0.09 },
  { kind: 'pattern', id: 'p:grid', name: '方眼', rarity: 'N', file: 'grid.svg', alpha: 0.14 },
  { kind: 'pattern', id: 'p:check', name: 'チェック', rarity: 'R', file: 'check.svg', alpha: 0.07 },
  { kind: 'pattern', id: 'p:waves', name: 'なみ', rarity: 'R', file: 'waves.svg', alpha: 0.14 },
  { kind: 'pattern', id: 'p:gummy', name: 'グミ', rarity: 'R', file: 'gummy.svg', alpha: 0.16 },
  { kind: 'pattern', id: 'p:stars', name: 'ほし', rarity: 'SR', file: 'stars.svg', alpha: 0.16 },
  { kind: 'pattern', id: 'p:hearts', name: 'ハート', rarity: 'SR', file: 'hearts.svg', alpha: 0.16 },
  { kind: 'pattern', id: 'p:formulas', name: '数式', rarity: 'SSR', file: 'formulas.svg', alpha: 0.2 },
];

export const ALL_ITEMS: StyleItem[] = [...THEMES, ...PATTERNS];
/** はじめから持っているもの */
const STARTER = new Set(['t:default', 'p:none']);

export const itemById = (id: string): StyleItem | undefined => ALL_ITEMS.find((x) => x.id === id);
export const isOwned = (id: string): boolean => STARTER.has(id) || settings.unlocked.includes(id);
export const currentTheme = (): ThemeItem => THEMES.find((t) => t.id === settings.theme && isOwned(t.id)) ?? THEMES[0];
export const currentPattern = (): PatternItem => PATTERNS.find((p) => p.id === settings.pattern && isOwned(p.id)) ?? PATTERNS[0];

// ---- ガチャ ----

/** レア度ごとの出やすさ（まだ持っていないものがあるレア度の中で比べる） */
export const RARITY_WEIGHT: Record<Rarity, number> = { N: 50, R: 30, SR: 15, SSR: 5 };

/**
 * まだ持っていないものから1つ選ぶ。先にレア度を重みで選び、その中から同じ確率で選ぶ。
 * 全部持っていたら null。
 */
export function pickReward(locked: StyleItem[], rand: () => number = Math.random): StyleItem | null {
  if (locked.length === 0) return null;
  const rarities = (['N', 'R', 'SR', 'SSR'] as Rarity[]).filter((r) => locked.some((x) => x.rarity === r));
  const total = rarities.reduce((t, r) => t + RARITY_WEIGHT[r], 0);
  let roll = rand() * total;
  let rarity = rarities[rarities.length - 1];
  for (const r of rarities) {
    roll -= RARITY_WEIGHT[r];
    if (roll < 0) {
      rarity = r;
      break;
    }
  }
  const pool = locked.filter((x) => x.rarity === rarity);
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

const today = (now = Date.now()): string => dateKey(now, settings.dayBoundaryMin);

/** 今日まだ引いていないか */
export const canDraw = (now = Date.now()): boolean => settings.gachaDay !== today(now);

/** まだ持っていないもの */
export const lockedItems = (): StyleItem[] => ALL_ITEMS.filter((x) => !isOwned(x.id));

/** ガチャを引く。出たもの（全部持っていたら null）。今日はもう引けなくなる */
export function draw(now = Date.now(), rand: () => number = Math.random): StyleItem | null {
  if (!canDraw(now)) return null;
  const item = pickReward(lockedItems(), rand);
  saveSettings({ gachaDay: today(now), unlocked: item ? [...settings.unlocked, item.id] : settings.unlocked });
  return item;
}

/** 次に引ける時刻（1日の区切り） */
export function nextDrawAt(now = Date.now()): Date {
  const d = new Date(now - settings.dayBoundaryMin * 60000);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return new Date(d.getTime() + settings.dayBoundaryMin * 60000);
}

// ---- 見た目に反映する ----

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(Math.max(0, Math.min(255, v * k)));
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const patternCache = new Map<string, string>();

/** 模様の SVG をテーマの色に塗って、CSS の background-image にできる形にする */
export async function patternUrl(p: PatternItem, color: string, alpha = p.alpha): Promise<string> {
  if (!p.file) return 'none';
  const key = `${p.file}|${color}|${alpha}`;
  const hit = patternCache.get(key);
  if (hit) return hit;
  const res = await fetch(`${import.meta.env.BASE_URL}patterns/${p.file}`);
  const svg = (await res.text()).replaceAll('currentColor', rgba(color, alpha));
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  patternCache.set(key, url);
  return url;
}

/** テーマの色を CSS の変数にする（プレビューにも使う） */
export function themeVars(t: ThemeItem): Record<string, string> {
  return {
    '--light': t.light,
    '--accent-strong': t.strong,
    '--start-bg': t.start ?? t.strong,
    '--nav-bg': shade(t.light, 0.94),
    '--nav-on': shade(t.light, 0.8),
  };
}

let applied = '';

/** 今のテーマと模様を、アプリ全体に反映する */
export async function applyStyle(): Promise<void> {
  const t = currentTheme();
  const p = currentPattern();
  const key = `${t.id}|${p.id}`;
  if (key === applied) return;
  applied = key;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(themeVars(t))) root.style.setProperty(k, v);
  const app = document.getElementById('app');
  if (!app) return;
  try {
    app.style.backgroundImage = await patternUrl(p, t.light);
  } catch {
    app.style.backgroundImage = 'none'; // オフラインで模様を読めなかったときは、模様なし
    applied = '';
  }
}

/** スタイルを選ぶ（持っているものだけ） */
export function useStyle(item: StyleItem): void {
  if (!isOwned(item.id)) return;
  saveSettings(item.kind === 'theme' ? { theme: item.id } : { pattern: item.id });
  void applyStyle();
}
