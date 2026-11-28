// その人が使っているテーマと模様で作る「帯」。グループのランキング・メンバー一覧・人の統計・マイページに敷く。
// テーマによっては、帯の中で花びらが散る・泡がのぼる などの動きをつける（動きを減らす設定のときは出さない）。

import { PATTERNS, THEMES, patternUrl, type PatternItem } from '../styles';
import { esc } from '../ui/dom';

export interface StyleRef {
  /** テーマの id（'t:sakura'） */
  t: string;
  /** 模様の id（'p:none'） */
  p: string;
}

type Fx = 'petals' | 'wisteria' | 'leaves' | 'bubbles' | 'sparkle' | 'steam' | 'aurora' | 'neon' | 'rainbow' | 'glow';

/** テーマごとの動き（ベースカラーは色だけ） */
const FX: Record<string, Fx> = {
  sakura: 'petals',
  fuji: 'wisteria',
  wakaba: 'leaves',
  matcha: 'leaves',
  ramune: 'bubbles',
  creamsoda: 'bubbles',
  momosoda: 'bubbles',
  budousoda: 'bubbles',
  mizuame: 'bubbles',
  ocean: 'bubbles',
  citrus: 'bubbles',
  tropical: 'bubbles',
  lemontea: 'steam',
  hojicha: 'steam',
  yuzu: 'steam',
  ichigomilk: 'steam',
  midnight: 'sparkle',
  pearl: 'sparkle',
  gold: 'sparkle',
  candy: 'sparkle',
  berry: 'sparkle',
  sorbet: 'sparkle',
  aozora: 'sparkle',
  aurora: 'aurora',
  neon: 'neon',
  rainbow: 'rainbow',
  yuyake: 'glow',
};

/** 粒の数 */
const COUNT: Partial<Record<Fx, number>> = { petals: 7, wisteria: 7, leaves: 5, bubbles: 7, sparkle: 6, steam: 3 };

function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** 粒（場所・大きさ・はやさは決まった値。どの端末でも同じ見た目） */
function particles(fx: Fx): string {
  const n = COUNT[fx] ?? 0;
  return Array.from({ length: n }, (_, i) => {
    const x = (i * 61 + 7) % 100;
    const y = (i * 37 + 13) % 100;
    const s = 0.7 + ((i * 29) % 7) / 10;
    const dur = 4 + ((i * 17) % 40) / 10;
    const delay = -((i * 23) % 70) / 10;
    return `<i style="left:${x}%;top:${y}%;--s:${s.toFixed(2)};--t:${dur.toFixed(1)}s;animation-delay:${delay.toFixed(1)}s"></i>`;
  }).join('');
}

/**
 * 帯の HTML（行やカードの先頭に入れる）。テーマが分からなければ空。
 * big は人の統計の上のカードなど、高さのある場所
 */
export function bannerHtml(style: StyleRef | undefined, big = false): string {
  const th = style && THEMES.find((x) => x.id === style.t);
  if (!th) return '';
  const fx = FX[th.id.slice(2)];
  const pat = PATTERNS.find((x) => x.id === style.p && x.file);
  const bg = big
    ? `linear-gradient(160deg, ${rgba(th.light, 0.34)}, ${rgba(th.strong, 0.12)} 60%, ${rgba(th.light, 0.06)})`
    : `linear-gradient(90deg, ${rgba(th.light, 0.26)}, ${rgba(th.light, 0.1)} 55%, ${rgba(th.light, 0)} 92%)`;
  return `<span class="tb${big ? ' big' : ''}${fx ? ` fx-${fx}` : ''}" style="background:${esc(bg)};--tb-a:${esc(th.light)};--tb-b:${esc(th.strong)}" aria-hidden="true">
    ${pat ? `<span class="tb-pat" data-tbp="${esc(pat.id)}" data-tbc="${esc(th.light)}"></span>` : ''}
    ${fx ? `<span class="tb-fx">${particles(fx)}</span>` : ''}
  </span>`;
}

/** 帯の模様を塗る（模様の SVG を読むのを待つので、描いたあとに呼ぶ） */
export function paintBanners(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('.tb-pat[data-tbp]').forEach((el) => {
    const p = PATTERNS.find((x) => x.id === el.dataset.tbp) as PatternItem | undefined;
    if (!p) return;
    void patternUrl(p, el.dataset.tbc ?? '#fff', Math.min(0.5, p.alpha * 2)).then(
      (url) => (el.style.backgroundImage = url),
      () => undefined,
    );
  });
}
