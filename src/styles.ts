// 見た目のスタイル（テーマの色と、背景の模様）と、グミガチャの確率。
// テーマはボタン・選んでいるところ・計測の円・下のメニューの色を変える。背景は黒のまま
// （常時表示で明るい画面をつけっぱなしにしないため）。模様は計測中の画面には出さない。
// 模様の画像は public/patterns/ に置いた SVG（GitHub Pages から配る）。テーマの色に塗って使う。

import { isDeveloper } from './cloud/model';
import { grantedTags } from './grants';
import { TAGS } from './tags';
import { GENERATED_PATTERNS } from './patterns.gen';
import { saveSettings, settings } from './store';

/** BASE ははじめから使えるもの（ガチャには出ない）。SECRET は1つだけの隠しもの。LEGEND は豪運タグ */
export type Rarity = 'BASE' | 'N' | 'R' | 'SR' | 'SSR' | 'SECRET' | 'LEGEND';

export interface ThemeItem {
  kind: 'theme';
  id: string;
  name: string;
  rarity: Rarity;
  /** 選んでいるところ・ボタンの色（明るい色。上の文字は黒） */
  light: string;
  /** いちばん目立つボタンの色 */
  strong: string;
  /** start などの大きいボタンの背景（2色・グラデーションのテーマ） */
  start?: string;
  /** start の文字の色（暗いボタンのときは白） */
  ink?: string;
  /** 下のメニューの背景（グラデーションのテーマ） */
  nav?: string;
  /** 計測の円の色（なければ strong） */
  ring?: string;
  /** 動くテーマ（シークレット） */
  anim?: 'rainbow';
  /** 期間限定（そのシーズンの期間限定ガチャだけで出る。交換所には出ない） */
  limited?: string;
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
  limited?: string;
}

/** 名前の横に出すタグ（グループで見える） */
export interface TagItem {
  kind: 'tag';
  id: string;
  name: string;
  rarity: Rarity;
  /** src/tags.ts の id */
  tag: string;
  limited?: string;
}

export type StyleItem = ThemeItem | PatternItem | TagItem;

/** ガチャで出るタグ */
const GACHA_TAGS: [string, Rarity][] = [
  ['asagata', 'N'],
  ['yorugata', 'N'],
  ['kotsukotsu', 'N'],
  ['mypace', 'N'],
  ['nemui', 'N'],
  ['jukensei', 'N'],
  ['fukushu', 'N'],
  ['ichiyazuke', 'N'],
  ['shuchu', 'R'],
  ['ankio', 'R'],
  ['keisan', 'R'],
  ['hayaoki', 'R'],
  ['cafeben', 'R'],
  ['toshokan', 'R'],
  ['tensai', 'SR'],
  ['fukutsu', 'SR'],
  ['zone', 'SR'],
  ['shinya', 'SR'],
  ['kami', 'SSR'],
  ['kakusei', 'SSR'],
  ['sakurasaku', 'SSR'],
  ['rikei', 'N'],
  ['bunkei', 'N'],
  ['sugakusuki', 'N'],
  ['eigosuki', 'N'],
  ['tangocho', 'N'],
  ['akasheet', 'N'],
  ['moshimae', 'N'],
  ['neochi', 'N'],
  ['asakatsu', 'N'],
  ['jishushitsu', 'N'],
  ['notoma', 'N'],
  ['kyukeichu', 'N'],
  ['kakomon', 'R'],
  ['kyotest', 'R'],
  ['shukudai', 'R'],
  ['tokkun', 'R'],
  ['drill', 'R'],
  ['marker', 'R'],
  ['kioku', 'R'],
  ['yofukashi', 'R'],
  ['bunbogu', 'R'],
  ['koshiki', 'SR'],
  ['hirameki', 'SR'],
  ['gyakuten', 'SR'],
  ['shishi', 'SR'],
  ['hoshiyomi', 'SR'],
  ['honban', 'SR'],
  ['daiichi', 'SSR'],
  ['tenka', 'SSR'],
  ['mugen', 'SSR'],
  ['gouun', 'LEGEND'],
];
/** 期間限定ガチャで出るタグ [タグ, レア度, シーズン] */
const LIMITED_TAGS: [string, Rarity, string][] = [
  ['kaijin', 'R', 'c1s1'],
  ['kokuu', 'SR', 'c1s1'],
  ['prana', 'SSR', 'c1s1'],
  ['yukidaruma', 'R', 'pu2612'],
  ['kotatsu', 'R', 'pu2612'],
  ['whitexmas', 'SR', 'pu2612'],
  ['kuribocchi', 'SR', 'pu2612'],
  ['kiseki', 'SSR', 'pu2612'],
];
export const TAG_ITEMS: TagItem[] = [
  ...GACHA_TAGS.map(([tag, rarity]): TagItem => ({ kind: 'tag', id: `g:${tag}`, name: TAGS.find((x) => x.id === tag)?.name ?? tag, rarity, tag })),
  ...LIMITED_TAGS.map(([tag, rarity, limited]): TagItem => ({
    kind: 'tag',
    id: `g:${tag}`,
    name: TAGS.find((x) => x.id === tag)?.name ?? tag,
    rarity,
    tag,
    limited,
  })),
];

const t = (id: string, name: string, rarity: Rarity, light: string, strong: string, more: Partial<ThemeItem> = {}): ThemeItem => ({
  kind: 'theme',
  id: `t:${id}`,
  name,
  rarity,
  light,
  strong,
  ...more,
});
const lg = (deg: number, ...stops: string[]) => `linear-gradient(${deg}deg, ${stops.join(', ')})`;
const RAINBOW = ['#ff8bd8', '#ffd36a', '#7de3c3', '#6ab7ff', '#b98bff'];

export const THEMES: ThemeItem[] = [
  // ベースカラー（はじめから使える）
  t('default', 'モノクロ', 'BASE', '#e6e6e6', '#ffffff'),
  t('soda', 'ソーダ', 'BASE', '#a9dcff', '#d5eeff'),
  t('melon', 'メロン', 'BASE', '#b9eea4', '#dcf7d1'),
  t('lemon', 'レモン', 'BASE', '#fbe98f', '#fdf4c7'),
  t('strawberry', 'いちご', 'BASE', '#ffb6cf', '#ffdbe7'),
  t('orange', 'オレンジ', 'BASE', '#ffc996', '#ffe4ca'),
  t('grape', 'グレープ', 'BASE', '#cdbaff', '#e6dcff'),
  t('mint', 'ミント', 'BASE', '#a6eed8', '#d2f6ec'),
  t('peach', 'ピーチ', 'BASE', '#ffc4b3', '#ffe2d9'),
  t('lavender', 'ラベンダー', 'BASE', '#dccbff', '#efe6ff'),
  t('lime', 'ライム', 'BASE', '#d6f28c', '#ecf9c6'),
  t('aqua', 'アクア', 'BASE', '#9debea', '#cff5f4'),
  // N：2色
  t('creamsoda', 'クリームソーダ', 'N', '#a6eed8', '#d2f6ec', { start: '#fff6d8' }),
  t('ichigomilk', 'いちごミルク', 'N', '#ffb6cf', '#ffdbe7', { start: '#fff0f5' }),
  t('lemontea', 'レモンティー', 'N', '#fbe98f', '#fdf4c7', { start: '#f1d2a6' }),
  t('matcha', '抹茶ラテ', 'N', '#c4e19a', '#e2f0cd', { start: '#f3ecdc' }),
  t('hojicha', 'ほうじ茶', 'N', '#ddbf9f', '#efdfcd', { start: '#f5e8da' }),
  t('momosoda', 'ももソーダ', 'N', '#ffc4b3', '#ffe2d9', { start: '#d9f1ff' }),
  t('budousoda', 'ぶどうソーダ', 'N', '#cdbaff', '#e6dcff', { start: '#e3f6ff' }),
  t('yuzu', 'ゆずはちみつ', 'N', '#ffe07a', '#fff0b3', { start: '#fff3c7' }),
  // R：やわらかいグラデーション
  t('ramune', 'ラムネ', 'R', '#b4e6ff', '#e2f6ff', { start: lg(160, '#e9f8ff 0%', '#9fd8ff 55%', '#c4f1ff 100%') }),
  t('sakura', 'さくら', 'R', '#ffc6d6', '#ffe6ee', { start: lg(160, '#fff1f5 0%', '#ffbfd2 60%', '#ffe0ea 100%') }),
  t('yuyake', 'ゆうやけ', 'R', '#ffbf99', '#ffe1cc', { start: lg(160, '#ffd9a8', '#ff9fb4') }),
  t('aozora', 'あおぞら', 'R', '#9fd4ff', '#def0ff', { start: lg(180, '#d6efff', '#8cc8ff') }),
  t('wakaba', 'わかば', 'R', '#bdeca0', '#e0f7d0', { start: lg(150, '#e6fbd2', '#9fe3b4') }),
  t('fuji', 'ふじ', 'R', '#d8c4ff', '#efe6ff', { start: lg(150, '#e3d4ff', '#ffc8e8') }),
  t('sorbet', 'シャーベット', 'R', '#ffd0b0', '#ffe9d9', { start: lg(135, '#ffe0b8', '#ffc2d9', '#d8c4ff') }),
  t('mizuame', 'みずあめ', 'R', '#c9f0e8', '#e8faf6', { start: lg(160, '#f2fffb', '#bfeee3') }),
  // SR：あざやかなグラデーション（下のメニューも）
  t('tropical', 'トロピカル', 'SR', '#ffd88a', '#fff0c9', {
    start: lg(135, '#ffe066', '#ff9a8b', '#ff6fb5'),
    nav: lg(90, '#ffe28a', '#ffb0a8', '#ff9fd0'),
  }),
  t('citrus', 'シトラス', 'SR', '#e9f58a', '#f6fbc9', { start: lg(135, '#fff27a', '#b6f07a'), nav: lg(90, '#fff38f', '#c8f39a') }),
  t('berry', 'ベリー', 'SR', '#f2b5ff', '#fbe0ff', { start: lg(135, '#ff8ec4', '#b98bff'), nav: lg(90, '#ffb0d6', '#d4b6ff') }),
  t('ocean', 'オーシャン', 'SR', '#8fd8ff', '#d0eeff', {
    start: lg(160, '#6fd6ff', '#3c8cff'),
    ink: '#fff',
    nav: lg(90, '#9ee2ff', '#8fb6ff'),
  }),
  t('candy', 'キャンディ', 'SR', '#ffc2ec', '#ffe4f6', {
    start: 'repeating-linear-gradient(135deg, #ffc6ea 0 14px, #ffffff 14px 28px)',
    nav: lg(90, '#ffc6ee', '#c6e6ff'),
  }),
  t('midnight', 'ミッドナイト', 'SR', '#b9b4ff', '#dcd9ff', {
    start: lg(160, '#4b3fb3', '#1f1a5c'),
    ink: '#fff',
    ring: '#b9b4ff',
    nav: lg(90, '#c9c4ff', '#a9a2ff'),
  }),
  // SSR
  t('aurora', 'オーロラ', 'SSR', '#bfe9e4', '#dff7f2', {
    start: lg(135, '#a7f3d0 0%', '#a5d8ff 45%', '#d0bfff 100%'),
    nav: lg(90, '#b8f5dc', '#b6e0ff', '#dacbff'),
  }),
  t('gold', 'ゴールド', 'SSR', '#f3d98b', '#fff0c2', {
    start: lg(135, '#fff3c4 0%', '#f2c94c 40%', '#fff0b8 60%', '#d9a52b 100%'),
    nav: lg(90, '#f7e3a1', '#e9c35a', '#f7e3a1'),
    ring: '#f2c94c',
  }),
  t('pearl', 'パール', 'SSR', '#f0e6ff', '#ffffff', {
    start: lg(135, '#ffffff', '#f3e6ff 35%', '#e6fff7 65%', '#fff5e6'),
    nav: lg(90, '#fdf8ff', '#ece6ff', '#e6fbf5'),
  }),
  t('neon', 'ネオン', 'SSR', '#ff9cf2', '#ffd6fa', {
    start: lg(135, '#ff2bd6', '#7a2bff'),
    ink: '#fff',
    ring: '#ff6bf0',
    nav: lg(90, '#ff7be8', '#9d7bff'),
  }),
  // SECRET：動く虹色
  t('rainbow', 'にじいろグミ', 'SECRET', '#ffd1ec', '#ffffff', {
    start: lg(90, ...RAINBOW, ...RAINBOW, RAINBOW[0]),
    nav: lg(90, ...RAINBOW, ...RAINBOW, RAINBOW[0]),
    anim: 'rainbow',
  }),
  // 期間限定：チャプター1 シーズン1「虚空劫灰のプラーナ」（灰と残り火）
  t('haiiro', '灰の空', 'R', '#c4c9d1', '#e3e6ea', { start: lg(160, '#e6e8ec', '#9aa3ae'), limited: 'c1s1' }),
  t('zanka', '残火', 'SR', '#ffb27a', '#ffd7b8', {
    start: lg(135, '#ffcf7a', '#ff7a3d', '#c2410c'),
    ink: '#fff',
    nav: lg(90, '#ffc08a', '#ff8a5c'),
    ring: '#ff9a4d',
    limited: 'c1s1',
  }),
  t('kougai', '劫灰', 'SSR', '#ff9a4d', '#ffd2b0', {
    start: lg(135, '#2b2b2e 0%', '#5a5a60 45%', '#ff7a2e 100%'),
    ink: '#fff',
    nav: lg(90, '#8a8a92', '#ff8a3d'),
    ring: '#ff7a2e',
    limited: 'c1s1',
  }),
  // 12月のピックアップ（雪とクリスマス）
  t('yukiakari', '雪あかり', 'R', '#dfeaf5', '#f4f8fc', { start: lg(160, '#ffffff', '#b9cfe6'), limited: 'pu2612' }),
  t('hiiragi', 'ひいらぎ', 'R', '#9fd3a8', '#d6efd9', { start: lg(135, '#6cbf7b', '#2f7d47'), ink: '#fff', limited: 'pu2612' }),
  t('seiya', '聖夜', 'SR', '#f3d98b', '#fff1c7', {
    start: lg(135, '#26366e', '#4a5fb5'),
    ink: '#fff',
    nav: lg(90, '#f3d98b', '#a9b9ff'),
    ring: '#f3d98b',
    limited: 'pu2612',
  }),
  t('xmasred', 'クリスマスレッド', 'SR', '#ff8f8f', '#ffd0d0', {
    start: lg(135, '#ff5a5f', '#c81d32'),
    ink: '#fff',
    nav: lg(90, '#ff9a9a', '#8fd9a6'),
    ring: '#ff6b6b',
    limited: 'pu2612',
  }),
  t('ginsekai', '銀世界', 'SSR', '#cfe6ff', '#ffffff', {
    start: lg(135, '#ffffff', '#cfe6ff 45%', '#8fb8ff'),
    nav: lg(90, '#f2f8ff', '#bcd8ff', '#f2f8ff'),
    ring: '#bfe0ff',
    limited: 'pu2612',
  }),
];

export const PATTERNS: PatternItem[] = [{ kind: 'pattern', id: 'p:none', name: 'なし', rarity: 'BASE', alpha: 0 }, ...GENERATED_PATTERNS];

export const ALL_ITEMS: StyleItem[] = [...THEMES, ...PATTERNS, ...TAG_ITEMS];
/** いつものガチャで出るもの（期間限定は入らない） */
export const GACHA_ITEMS: StyleItem[] = ALL_ITEMS.filter((x) => x.rarity !== 'BASE' && !x.limited);
/** そのシーズンの期間限定ガチャで出るもの */
/** 期間限定ガチャで出るもの（模様は出さなくなった。2026-11-29、ユーザーの希望。持っている人はそのまま使える） */
export const limitedItems = (season: string): StyleItem[] => ALL_ITEMS.filter((x) => x.limited === season && x.kind !== 'pattern');
/** 一覧に出すか（もう出ないもの＝期間限定の模様と、終わった x- のものは、持っているときだけ） */
export const isListed = (x: StyleItem): boolean =>
  !(x.limited && (x.kind === 'pattern' || x.limited.startsWith('x-'))) || isOwned(x.id);
export const listedPatterns = (): PatternItem[] => PATTERNS.filter(isListed);

export const itemById = (id: string): StyleItem | undefined => ALL_ITEMS.find((x) => x.id === id);
export const isOwned = (id: string): boolean => itemById(id)?.rarity === 'BASE' || settings.unlocked.includes(id);
export const currentTheme = (): ThemeItem => THEMES.find((x) => x.id === settings.theme && isOwned(x.id)) ?? THEMES[0];
export const currentPattern = (): PatternItem => PATTERNS.find((p) => p.id === settings.pattern && isOwned(p.id)) ?? PATTERNS[0];

// ---- ガチャ ----
// 1回 GACHA_COST グミ。先にレア度を決まった確率で選び、そのレア度のまだ持っていないものから同じ確率で選ぶ。
// そのレア度を全部持っていたら「かぶり」で、グミが少し返ってくる（レア度の確率は、いつでも書いてあるとおり）。

export const GACHA_RARITIES = ['N', 'R', 'SR', 'SSR', 'SECRET', 'LEGEND'] as const;
export type GachaRarity = (typeof GACHA_RARITIES)[number];
/** レア度ごとの確率（%） */
export const RARITY_RATE: Record<GachaRarity, number> = { N: 50, R: 30, SR: 14, SSR: 4.95, SECRET: 1, LEGEND: 0.05 };
export const GACHA_COST = 120;
/** 10回はまとめて引くと安い（2026-11-28 に 1200 から 1000 に） */
export const GACHA10_COST = 1000;
/** かぶったときに返ってくるグミ */
export const REFUND: Record<GachaRarity, number> = { N: 20, R: 40, SR: 80, SSR: 200, SECRET: 400, LEGEND: 1000 };
/** 交換所の値段（シークレットと豪運は交換できない） */
export const EXCHANGE_PRICE: Partial<Record<Rarity, number>> = { N: 300, R: 600, SR: 1200, SSR: 3000 };

/** 交換の値段（期間限定は交換できない） */
export const exchangePrice = (item: StyleItem): number | undefined => (item.limited ? undefined : EXCHANGE_PRICE[item.rarity]);

/** レア度を確率で選ぶ */
export function pickRarity(rand: () => number = Math.random): GachaRarity {
  let roll = rand() * 100;
  for (const r of GACHA_RARITIES) {
    roll -= RARITY_RATE[r];
    if (roll < 0) return r;
  }
  return 'N'; // 小数の誤差で 100 ちょうどになったとき
}

export interface DrawResult {
  item: StyleItem;
  /** もう持っていた（そのレア度を全部持っていた） */
  dupe: boolean;
  /** かぶりで返ってくるグミ */
  refund: number;
}

/** 1回引く（持っているかどうかは owned で調べる） */
export function pickReward(owned: (id: string) => boolean, rand: () => number = Math.random): DrawResult {
  const rarity = pickRarity(rand);
  const pool = GACHA_ITEMS.filter((x) => x.rarity === rarity);
  const fresh = pool.filter((x) => !owned(x.id));
  const list = fresh.length ? fresh : pool;
  const item = list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
  const dupe = fresh.length === 0;
  return { item, dupe, refund: dupe ? REFUND[rarity] : 0 };
}

// ---- 期間限定ガチャ ----
// そのシーズンのあいだだけ引ける。出るのはそのシーズンの限定のもの（R・SR・SSR）だけ。値段はいつものガチャと同じ。

export const LIMITED_RARITIES = ['R', 'SR', 'SSR'] as const;
/** 期間限定ガチャのレア度ごとの確率（%） */
export const LIMITED_RATE: Record<(typeof LIMITED_RARITIES)[number], number> = { R: 60, SR: 32, SSR: 8 };

/** 期間限定ガチャを1回引く */
export function pickLimited(season: string, owned: (id: string) => boolean, rand: () => number = Math.random): DrawResult {
  let roll = rand() * 100;
  let rarity: (typeof LIMITED_RARITIES)[number] = 'R';
  for (const r of LIMITED_RARITIES) {
    roll -= LIMITED_RATE[r];
    if (roll < 0) {
      rarity = r;
      break;
    }
  }
  const pool = limitedItems(season).filter((x) => x.rarity === rarity);
  const fresh = pool.filter((x) => !owned(x.id));
  const list = fresh.length ? fresh : pool;
  const item = list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
  const dupe = fresh.length === 0;
  return { item, dupe, refund: dupe ? REFUND[rarity] : 0 };
}

/** 次に引くときの確率（レア度ごと・1つずつ・かぶり） */
export function currentRates(owned: (id: string) => boolean = isOwned): { rarity: Record<string, number>; item: Map<string, number>; dupe: number } {
  const rarity: Record<string, number> = {};
  const item = new Map<string, number>();
  let dupe = 0;
  for (const r of GACHA_RARITIES) {
    rarity[r] = RARITY_RATE[r];
    const fresh = GACHA_ITEMS.filter((x) => x.rarity === r && !owned(x.id));
    if (fresh.length === 0) dupe += RARITY_RATE[r];
    for (const x of fresh) item.set(x.id, RARITY_RATE[r] / fresh.length);
  }
  return { rarity, item, dupe };
}

/** まだ持っていないもの（ガチャで出るもののうち） */
export const lockedItems = (): StyleItem[] => GACHA_ITEMS.filter((x) => !isOwned(x.id));

// ---- 見た目に反映する ----

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** 計測中以外の背景（黒に、テーマの色をうっすら混ぜたグラデーション） */
export function themeBackground(th: ThemeItem): string {
  const second = th.nav?.match(/#[0-9a-f]{6}/gi)?.at(-1) ?? th.light;
  return [
    `radial-gradient(120% 55% at 50% 0%, ${rgba(th.light, 0.2)}, transparent 70%)`,
    `radial-gradient(90% 45% at 100% 100%, ${rgba(second, 0.12)}, transparent 70%)`,
    `linear-gradient(180deg, ${rgba(th.light, 0.05)}, rgba(0, 0, 0, 0) 60%)`,
  ].join(', ');
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(Math.max(0, Math.min(255, v * k)));
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

const patternCache = new Map<string, string>();

/** 模様の SVG をテーマの色に塗って、CSS の background-image にできる形にする */
export async function patternUrl(p: PatternItem, color: string, alpha = p.alpha): Promise<string> {
  if (!p.file) return 'none';
  const key = `${p.file}|${color}|${alpha}`;
  const hit = patternCache.get(key);
  if (hit) return hit;
  const res = await fetch(`${import.meta.env.BASE_URL}patterns/${p.file}`);
  // 色を塗り、全体をまとめて薄くする（形が重なったところだけ濃くならないように）
  const svg = (await res.text())
    .replaceAll('currentColor', color)
    .replace(/(<svg[^>]*>)/, `$1<g opacity="${alpha}">`)
    .replace('</svg>', '</g></svg>');
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  patternCache.set(key, url);
  return url;
}

/** テーマの色を CSS の変数にする（プレビューにも使う） */
export function themeVars(th: ThemeItem): Record<string, string> {
  return {
    '--light': th.light,
    '--accent-strong': th.strong,
    '--start-bg': th.start ?? th.strong,
    '--start-ink': th.ink ?? '#000',
    '--ring-color': th.ring ?? th.strong,
    '--nav-bg': th.nav ?? shade(th.light, 0.94),
    '--nav-on': shade(th.light, 0.8),
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
  if (t.anim) root.dataset.anim = t.anim;
  else delete root.dataset.anim;
  const app = document.getElementById('app');
  if (!app) return;
  // 模様を上に、テーマの色のグラデーションを下に重ねる（計測中の画面は黒い背景で隠れる）
  const bg = themeBackground(t);
  let pattern = 'none';
  try {
    pattern = await patternUrl(p, t.light);
  } catch {
    applied = ''; // オフラインで模様を読めなかったときは、模様なし（次に開いたときにまた読む）
  }
  const layers = pattern === 'none' ? [bg] : [pattern, bg];
  app.style.backgroundImage = layers.join(', ');
  const grads = bg.split('gradient(').length - 1;
  app.style.backgroundRepeat = [...(pattern === 'none' ? [] : ['repeat']), ...Array(grads).fill('no-repeat')].join(', ');
  app.style.backgroundSize = [...(pattern === 'none' ? [] : ['auto']), ...Array(grads).fill('100% 100%')].join(', ');
}

/** スタイルを選ぶ（持っているものだけ） */
export function useStyle(item: StyleItem): void {
  if (!isOwned(item.id) || item.kind === 'tag') return;
  saveSettings(item.kind === 'theme' ? { theme: item.id } : { pattern: item.id });
  void applyStyle();
}

/** 持っているタグ（src/tags.ts の id）。開発者タグは開発者だけ、配られたタグ（古参など）はその人だけ */
export function ownedTags(uid: string | undefined): string[] {
  const out = TAG_ITEMS.filter((x) => isOwned(x.id)).map((x) => x.tag);
  // 実績の報酬のタグは、その実績を受け取っていれば持っている
  const ach = TAGS.filter((t) => t.ach && `a:${t.ach}` in settings.gumi).map((t) => t.id);
  const extra = [...(uid && isDeveloper(uid) ? ['dev'] : []), ...grantedTags(uid), ...ach];
  return [...new Set([...extra, ...out])];
}
