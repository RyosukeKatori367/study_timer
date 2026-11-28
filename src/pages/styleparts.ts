// スタイルの見本・レア度・グミのしるしなど、スタイル・ショップ・ガチャの画面で共通の部品。

import { PATTERNS, patternUrl, themeVars, type PatternItem, type Rarity, type StyleItem, type ThemeItem } from '../styles';
import { fmtGumi } from '../gumi';
import { tagById, tagHtml } from '../tags';
import { esc } from '../ui/dom';

export const LOCK =
  '<svg class="lock" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

export const KIND_NAME = { theme: 'テーマ', pattern: '模様', tag: 'タグ' } as const;

export const rarityTag = (r: Rarity): string => (r === 'BASE' ? '' : `<span class="rarity r-${r}">${r}</span>`);

/** テーマの見本（円・start ボタン・下のメニュー） */
export function themePreview(t: ThemeItem): string {
  const vars = Object.entries(themeVars(t))
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  return `<span class="theme-prev" style="${esc(vars)}" aria-hidden="true">
    <span class="tp-ring"></span><span class="tp-start"></span><span class="tp-nav"><i></i><i></i><i></i></span>
  </span>`;
}

/** 見本（テーマは円とボタン、模様は柄、タグは名前の横に出るしるし） */
export function previewHtml(item: StyleItem, big = false): string {
  if (item.kind === 'theme') return themePreview(item);
  if (item.kind === 'tag') {
    const t = tagById(item.tag);
    return `<span class="tag-prev${big ? ' big' : ''}" aria-hidden="true">${t ? tagHtml(t) : ''}</span>`;
  }
  return `<span class="pattern-prev${big ? ' big' : ''}" data-pattern="${esc(item.id)}" aria-hidden="true"></span>`;
}

/** 模様の見本を、テーマの色で塗る（見やすいように本番より濃くする） */
export function paintPatterns(root: HTMLElement, color: string): void {
  root.querySelectorAll<HTMLElement>('[data-pattern]').forEach((el) => {
    const p = PATTERNS.find((x) => x.id === el.dataset.pattern) as PatternItem | undefined;
    if (!p?.file) return;
    void patternUrl(p, color, Math.min(0.6, p.alpha * 2.6)).then((url) => (el.style.backgroundImage = url), () => undefined);
  });
}

/** グミの立方体（上・左・右の面の色）。SSR は虹色 */
export function cubeSvg(rarity0: Rarity | 'jar', size: number, fill?: [string, string, string]): string {
  // シークレットは SSR と同じ虹色の立方体（演出のほうで、さらに特別にする）
  const rarity = rarity0 === 'SECRET' ? 'SSR' : rarity0 === 'BASE' ? 'N' : rarity0 === 'LEGEND' ? 'SR' : rarity0;
  const k = Math.cos(Math.PI / 6);
  const s = 40;
  const c = 50;
  const T = [c, c - s];
  const UR = [c + s * k, c - s / 2];
  const LR = [c + s * k, c + s / 2];
  const B = [c, c + s];
  const LL = [c - s * k, c + s / 2];
  const UL = [c - s * k, c - s / 2];
  const C = [c, c];
  const pts = (...ps: number[][]) => ps.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
  const id = `g${Math.random().toString(36).slice(2, 7)}`;
  const base: Record<string, [string, string, string]> = {
    N: ['#ffffff', '#d9d9d9', '#a8a8a8'],
    R: ['#bfe1ff', '#6ab7ff', '#3a86d6'],
    SR: ['#fff1c2', '#ffd36a', '#d9a52b'],
    SSR: [`url(#${id}a)`, `url(#${id}b)`, `url(#${id}c)`],
    jar: fill ?? ['#fff', '#ddd', '#bbb'],
  };
  const [top, left, right] = base[rarity];
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
    ${
      rarity === 'SSR'
        ? `<defs>
            <linearGradient id="${id}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd1f0"/><stop offset=".5" stop-color="#cfe9ff"/><stop offset="1" stop-color="#d7ffe9"/></linearGradient>
            <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8bd8"/><stop offset="1" stop-color="#8b7bff"/></linearGradient>
            <linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6ad1ff"/><stop offset="1" stop-color="#39c99a"/></linearGradient>
          </defs>`
        : ''
    }
    <g stroke-linejoin="round" stroke-width="6">
      <polygon points="${pts(UL, C, B, LL)}" fill="${left}" stroke="${left}"/>
      <polygon points="${pts(C, UR, LR, B)}" fill="${right}" stroke="${right}"/>
      <polygon points="${pts(T, UR, C, UL)}" fill="${top}" stroke="${top}"/>
    </g>
    <path d="M${(UL[0] + 12).toFixed(1)},${(UL[1] + 2).toFixed(1)} L${(T[0] - 10).toFixed(1)},${(T[1] + 8).toFixed(1)}" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/>
  </svg>`;
}

/** グミのびん */
export function jarSvg(): string {
  const gummies: [number, number, number, [string, string, string]][] = [
    [30, 92, 26, ['#ffb6cf', '#f0479a', '#c2287a']],
    [58, 96, 24, ['#a9dcff', '#338ced', '#1f6fc0']],
    [82, 90, 24, ['#b9eea4', '#0aac23', '#077a19']],
    [44, 72, 24, ['#fbe98f', '#d28e05', '#a06c00']],
    [70, 68, 22, ['#cdbaff', '#9887ef', '#6e5fd0']],
    [28, 62, 20, ['#ffc996', '#e76624', '#b84a12']],
    [86, 58, 20, ['#a6eed8', '#00a888', '#007a62']],
  ];
  return `<svg viewBox="0 0 120 140" class="jar" aria-hidden="true">
    <rect x="34" y="6" width="52" height="16" rx="6" fill="#ff8bd8"/>
    <rect x="30" y="18" width="60" height="8" rx="4" fill="#e06cbf"/>
    <path d="M24 30 Q14 34 14 52 V116 Q14 132 32 132 H88 Q106 132 106 116 V52 Q106 34 96 30 Z" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.55)" stroke-width="2.5"/>
    ${gummies
      .map(([x, y, s, f]) => `<g transform="translate(${x - s / 2} ${y - s / 2})">${cubeSvg('jar', s, f).replace('<svg ', '<svg x="0" y="0" ')}</g>`)
      .join('')}
    <path d="M24 44 V108" stroke="rgba(255,255,255,.45)" stroke-width="5" stroke-linecap="round"/>
  </svg>`;
}

/** グミのしるし（お金） */
export const gumiIcon = (size = 16): string => cubeSvg('jar', size, ['#ffe0f3', '#ff8bd8', '#e0559f']);

/** 「◆ 1,240 グミ」のチップ */
export const coinHtml = (n: number, unit = true): string =>
  `<span class="coin">${gumiIcon(16)}<b>${fmtGumi(n)}</b>${unit ? '<small>グミ</small>' : ''}</span>`;
