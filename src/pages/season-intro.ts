// シーズンのはじまりの演出。シーズン中にはじめてイベントタブを開いたときに1回だけ出す（タップで飛ばせる）。
// 真っ暗な画面に光の線が走り、シーズンの紋章と名前がノイズまじりに組み上がって、しばらく止まってから消える。

import type { Season } from '../seasons';
import { md } from '../seasons';
import { esc, html } from '../ui/dom';

const SEEN = 'studytimer:seasonIntro';

/** シーズンの紋章（虚空：欠けた輪、劫灰：舞う灰、プラーナ：立ちのぼる息吹） */
export function emblemSvg(size: number, look = ''): string {
  const id = `e${Math.random().toString(36).slice(2, 7)}`;
  const ember = look === 'kuukou' ? ['#fff1e0', '#ffb07a', '#ff5a36'] : ['#ffffff', '#cfe6ff', '#7fb2ff'];
  return `<svg class="emblem" viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">
    <defs>
      <linearGradient id="${id}f" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="${ember[2]}" stop-opacity="0"/>
        <stop offset=".45" stop-color="${ember[2]}"/>
        <stop offset=".8" stop-color="${ember[1]}"/>
        <stop offset="1" stop-color="${ember[0]}"/>
      </linearGradient>
      <linearGradient id="${id}h" x1="0" x2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0"/>
        <stop offset=".5" stop-color="#fff" stop-opacity=".9"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <g fill="none" stroke="#e9e4ef" stroke-linecap="round">
      <circle cx="60" cy="60" r="50" stroke-width="1.4" stroke-dasharray="250 64" transform="rotate(-62 60 60)"/>
      <circle cx="60" cy="60" r="41" stroke-width=".6" opacity=".55" stroke-dasharray="2 5"/>
      <path d="M22 60 A38 38 0 0 1 98 60" stroke-width=".8" opacity=".35"/>
    </g>
    <rect x="6" y="59.4" width="108" height="1.2" fill="url(#${id}h)"/>
    <path d="M60 22 C69 42 73 58 60 86 C47 58 51 42 60 22 Z" fill="url(#${id}f)"/>
    <path d="M60 40 C64 52 65 62 60 76 C55 62 56 52 60 40 Z" fill="#fff" opacity=".85"/>
    <g fill="#d9d2cc">
      <rect x="84" y="30" width="3" height="3" transform="rotate(45 85.5 31.5)" opacity=".9"/>
      <rect x="30" y="84" width="2.4" height="2.4" transform="rotate(45 31.2 85.2)" opacity=".7"/>
      <circle cx="92" cy="78" r="1.2" opacity=".6"/>
      <circle cx="26" cy="38" r="1" opacity=".5"/>
      <circle cx="74" cy="98" r=".9" opacity=".5"/>
    </g>
    <path d="M60 4 V14 M60 106 V116" stroke="#e9e4ef" stroke-width="1" opacity=".6"/>
  </svg>`;
}

/** まだこのシーズンの演出を見ていない */
export function introUnseen(s: Season): boolean {
  try {
    return localStorage.getItem(SEEN) !== s.id;
  } catch {
    return false;
  }
}

function markSeen(s: Season): void {
  try {
    localStorage.setItem(SEEN, s.id);
  } catch {
    /* 覚えられなければ、次もまた出る */
  }
}

/** 揺れる光の線（左から右へ） */
function wavePath(amp: number, freq: number, phase: number): string {
  let d = '';
  for (let x = -20; x <= 420; x += 8) {
    const y = 60 + amp * Math.sin((x / 400) * Math.PI * 2 * freq + phase) * Math.sin((x / 400) * Math.PI);
    d += `${d ? 'L' : 'M'}${x},${y.toFixed(1)} `;
  }
  return d;
}

export function playSeasonIntro(s: Season, onDone?: () => void): void {
  markSeen(s);
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const mark = `
    <div class="si-mark">
      ${emblemSvg(112, s.look)}
      <div class="si-title">${esc(s.title ?? s.name)}</div>
      ${s.en ? `<div class="si-en">${esc(s.en)}</div>` : ''}
    </div>`;
  // ロゴを横に切った帯。帯ごとにずれて、色がにじみながら、ぴたりと揃う
  const cuts = [0, 14, 27, 41, 52, 63, 77, 88, 100];
  const bands = cuts
    .slice(0, -1)
    .map((top, i) => {
      const bottom = cuts[i + 1];
      const dx = (i % 2 ? 1 : -1) * (18 + ((i * 37) % 40));
      const delay = 0.75 + ((i * 53) % 9) * 0.06;
      return `<div class="si-band" style="clip-path:inset(${top}% 0 ${100 - bottom}% 0);--dx:${dx}px;--d:${delay.toFixed(2)}s">${mark}</div>`;
    })
    .join('');
  const waves = [
    wavePath(22, 1.5, 0),
    wavePath(16, 2, 1.7),
    wavePath(26, 1.2, 3.4),
    wavePath(10, 2.6, 0.8),
  ]
    .map((d, i) => `<path d="${d}" pathLength="1" style="--d:${(0.15 + i * 0.12).toFixed(2)}s"/>`)
    .join('');
  const ash = Array.from({ length: 26 }, (_, i) => {
    const left = (i * 37 + 11) % 100;
    const size = 1.5 + ((i * 7) % 4) * 0.7;
    const dur = 5 + ((i * 13) % 50) / 10;
    const delay = -((i * 17) % 60) / 10;
    const ember = i % 5 === 0;
    return `<i class="${ember ? 'ember' : ''}" style="left:${left}%;width:${size}px;height:${size}px;--t:${dur}s;animation-delay:${delay}s"></i>`;
  }).join('');
  const host = html(`
    <div class="season-intro season-${esc(s.look ?? 'default')}${reduce ? ' still' : ''}" role="dialog" aria-modal="true" aria-label="${esc(s.title ?? s.name)}">
      <div class="si-ash" aria-hidden="true">${ash}</div>
      <svg class="si-waves" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">${waves}</svg>
      <div class="si-logo">
        <div class="si-bands" aria-hidden="true">${bands}</div>
        <div class="si-full">${mark}</div>
      </div>
      <div class="si-info">
        <div class="si-chapter">CHAPTER ${s.chapter} ・ SEASON ${s.season}</div>
        <div class="si-dates">${md(s.start)} — ${md(s.end)}　${s.days}日間</div>
      </div>
      <div class="si-skip">タップで閉じる</div>
    </div>`);
  document.body.append(host);
  let done = false;
  const close = () => {
    if (done) return;
    done = true;
    host.classList.add('out');
    window.setTimeout(() => {
      host.remove();
      onDone?.();
    }, 600);
  };
  host.addEventListener('click', close);
  window.setTimeout(close, reduce ? 2500 : 5600);
}
