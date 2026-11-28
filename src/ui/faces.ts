// 計測中の画面の時計の見た目（ウォッチフェイス）。どれもはじめから使える。
// どの見た目も Ring と同じ set(from, to, over) で、from〜to（度、12時が0で時計回り）の範囲を光らせる。
// 色はテーマの --ring-color。数字（.big）の見た目は CSS の [data-face='…'] で変える。

import { createRing, type Ring } from './ring';

export type FaceId = 'ring' | 'arc' | 'analog' | 'dots' | 'digital' | 'flip' | 'minimal';

export interface FaceDef {
  id: FaceId;
  name: string;
  note: string;
}

export const FACES: FaceDef[] = [
  { id: 'ring', name: '目盛り', note: 'いつもの円' },
  { id: 'arc', name: 'なめらか', note: '光る太い輪' },
  { id: 'analog', name: 'アナログ', note: '針と扇形' },
  { id: 'dots', name: 'ドット', note: '60個の粒' },
  { id: 'digital', name: 'デジタル', note: '液晶の数字' },
  { id: 'flip', name: 'フリップ', note: 'めくれる数字' },
  { id: 'minimal', name: 'ミニマル', note: '細い数字と線' },
];

export const faceById = (id: string | undefined): FaceDef => FACES.find((f) => f.id === id) ?? FACES[0];

const C = 145;
const clamp = (d: number) => Math.min(360, Math.max(0, d));
const pt = (deg: number, r: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};
const f1 = (n: number) => n.toFixed(1);

/** 扇形の path（from〜to、半径 r） */
function sector(a: number, b: number, r: number): string {
  if (b - a >= 359.9) return `M${C},${C - r} A${r},${r} 0 1 1 ${C - 0.01},${C - r} Z`;
  if (b - a <= 0) return '';
  const [x1, y1] = pt(a, r);
  const [x2, y2] = pt(b, r);
  return `M${C},${C} L${f1(x1)},${f1(y1)} A${r},${r} 0 ${b - a > 180 ? 1 : 0} 1 ${f1(x2)},${f1(y2)} Z`;
}

/** 動いている端（カウントダウンは減っていく始まり、ほかは増えていく終わり） */
const edge = (a: number, b: number) => (a > 0 ? a : b);

function svgFace(cls: string, inner: string, update: (a: number, b: number, over: boolean, svg: SVGSVGElement) => void): Ring {
  const el = document.createElement('div');
  el.className = `ring face-${cls}`;
  el.innerHTML = `<svg viewBox="0 0 290 290" aria-hidden="true">${inner}</svg>`;
  const svg = el.querySelector('svg')!;
  let last = '';
  return {
    el,
    set(from, to, over = false) {
      const a = Math.round(clamp(from));
      const b = Math.round(clamp(to));
      const key = `${a}:${b}:${over}`;
      if (key === last) return;
      last = key;
      el.classList.toggle('over', over);
      update(a, b, over, svg);
    },
  };
}

/** 光る太い輪 */
function arcFace(): Ring {
  const circle = 'cx="145" cy="145" r="132" fill="none" pathLength="360" transform="rotate(-90 145 145)"';
  return svgFace(
    'arc',
    `<circle class="ring-base" ${circle} stroke-width="14"/>
     <circle class="ring-on arc-on" ${circle} stroke-width="14" stroke-linecap="round" stroke-dasharray="0 360"/>`,
    (a, b, _o, svg) => {
      const on = svg.querySelector('.arc-on')!;
      on.setAttribute('stroke-dasharray', `${Math.max(0, b - a)} 360`);
      on.setAttribute('stroke-dashoffset', String(-a));
    },
  );
}

/** 針と扇形（キッチンタイマーのような） */
function analogFace(): Ring {
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const long = i % 5 === 0;
    const [x1, y1] = pt(i * 6, long ? 118 : 124);
    const [x2, y2] = pt(i * 6, 132);
    return `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke-width="${long ? 3 : 1.2}"/>`;
  }).join('');
  return svgFace(
    'analog',
    `<circle cx="145" cy="145" r="140" class="dial"/>
     <path class="wedge"/>
     <g class="ticks">${ticks}</g>
     <line class="hand" x1="145" y1="145" x2="145" y2="30" stroke-width="4" stroke-linecap="round"/>
     <circle cx="145" cy="145" r="8" class="cap"/>`,
    (a, b, _o, svg) => {
      svg.querySelector('.wedge')!.setAttribute('d', sector(a, b, 112));
      const [x, y] = pt(edge(a, b), 116);
      const hand = svg.querySelector('.hand')!;
      hand.setAttribute('x2', f1(x));
      hand.setAttribute('y2', f1(y));
    },
  );
}

/** 60個の粒 */
function dotsFace(): Ring {
  const dots = Array.from({ length: 60 }, (_, i) => {
    const [x, y] = pt(i * 6 + 3, 130);
    return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${i % 5 === 4 ? 5.2 : 4.2}"/>`;
  }).join('');
  return svgFace('dots', `<g class="dot-all">${dots}</g>`, (a, b, _o, svg) => {
    svg.querySelectorAll('circle').forEach((c, i) => c.classList.toggle('ring-on', i * 6 + 3 > a && i * 6 + 3 < b));
  });
}

/** 線だけ（デジタル・フリップ・ミニマル）：数字の下に、進み具合の横線 */
function barFace(cls: 'digital' | 'flip' | 'minimal'): Ring {
  const el = document.createElement('div');
  el.className = `ring face-${cls}`;
  const n = cls === 'digital' ? 24 : 0;
  el.innerHTML =
    cls === 'digital'
      ? `<div class="seg-bar">${'<i></i>'.repeat(n)}</div>`
      : '<div class="line-bar"><i></i></div>';
  const segs = [...el.querySelectorAll<HTMLElement>('.seg-bar i')];
  const fill = el.querySelector<HTMLElement>('.line-bar i');
  let last = '';
  return {
    el,
    set(from, to, over = false) {
      const a = clamp(from);
      const b = clamp(to);
      const key = `${Math.round(a)}:${Math.round(b)}:${over}`;
      if (key === last) return;
      last = key;
      el.classList.toggle('over', over);
      if (fill) {
        fill.style.marginLeft = `${(a / 360) * 100}%`;
        fill.style.width = `${((b - a) / 360) * 100}%`;
      }
      segs.forEach((s, i) => {
        const mid = ((i + 0.5) / n) * 360;
        s.classList.toggle('on', mid > a && mid < b);
      });
    },
  };
}

export function createFace(id: FaceId): Ring {
  switch (id) {
    case 'arc':
      return arcFace();
    case 'analog':
      return analogFace();
    case 'dots':
      return dotsFace();
    case 'digital':
    case 'flip':
    case 'minimal':
      return barFace(id);
    default:
      return createRing();
  }
}

/** 数字の見た目：デジタルは消えている部分（8）をうっすら、フリップは1文字ずつカードに */
export function bigHtml(face: FaceId, text: string, prev: string): string | null {
  if (face !== 'flip') return null;
  return [...text]
    .map((ch, i) => {
      if (!/\d/.test(ch)) return `<span class="fsep">${ch}</span>`;
      const changed = prev.length === text.length && prev[i] !== ch;
      return `<span class="fcard${changed ? ' flip' : ''}">${ch}</span>`;
    })
    .join('');
}

/** 見本（スタイルのページ）。25:00 で 3/4 くらい光らせる */
export function facePreview(id: FaceId): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'face-prev';
  wrap.dataset.face = id;
  const ringWrap = document.createElement('span');
  ringWrap.className = 'ring-wrap';
  const face = createFace(id);
  face.set(0, 250);
  const center = document.createElement('span');
  center.className = 'ring-center';
  const big = document.createElement('span');
  big.className = 'big';
  big.dataset.ghost = '88:88';
  const html = bigHtml(id, '25:00', '');
  if (html) big.innerHTML = html;
  else big.textContent = '25:00';
  center.append(big);
  ringWrap.append(face.el, center);
  wrap.append(ringWrap);
  return wrap;
}
