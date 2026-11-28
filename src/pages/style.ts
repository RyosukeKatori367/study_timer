// スタイルタブ。いちばん上に1日1回のグミガチャ、その下にテーマと模様の一覧。
// まだ持っていないものは灰色で鍵がかかり、ガチャで出ると使えるようになる。

import {
  ALL_ITEMS,
  PATTERNS,
  THEMES,
  canDraw,
  currentPattern,
  currentTheme,
  draw,
  isOwned,
  nextDrawAt,
  patternUrl,
  themeVars,
  useStyle,
  type PatternItem,
  type Rarity,
  type StyleItem,
  type ThemeItem,
} from '../styles';
import { pad2 } from '../time';
import { $, esc, html } from '../ui/dom';
import { toast } from '../ui/toast';

const LOCK =
  '<svg class="lock" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

export const RARITY_COLOR: Record<Rarity, string> = { N: '#d9d9d9', R: '#6ab7ff', SR: '#ffd36a', SSR: '#ff8bd8' };

const rarityTag = (r: Rarity) => `<span class="rarity r-${r}">${r}</span>`;

/** テーマの見本（円・start ボタン・下のメニュー） */
function themePreview(t: ThemeItem): string {
  const vars = Object.entries(themeVars(t))
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  return `<span class="theme-prev" style="${esc(vars)}" aria-hidden="true">
    <span class="tp-ring"></span><span class="tp-start"></span><span class="tp-nav"><i></i><i></i><i></i></span>
  </span>`;
}

function tileHtml(item: StyleItem, selected: boolean): string {
  const owned = isOwned(item.id);
  const prev = item.kind === 'theme' ? themePreview(item) : `<span class="pattern-prev" data-pattern="${esc(item.id)}" aria-hidden="true"></span>`;
  return `
    <button type="button" class="style-tile${owned ? '' : ' locked'}" data-id="${esc(item.id)}" aria-pressed="${selected}"
      aria-label="${esc(item.name)}${owned ? '' : '（まだ持っていません）'}">
      <span class="style-prev">${prev}${owned ? '' : `<span class="lock-badge">${LOCK}</span>`}${selected ? '<span class="sel-badge">✓</span>' : ''}</span>
      <span class="style-name">${esc(item.name)}</span>
      ${item.rarity !== 'N' || !owned ? rarityTag(item.rarity) : ''}
    </button>`;
}

/** 模様の見本を、テーマの色で塗る（見やすいように本番より濃くする） */
function paintPatterns(root: HTMLElement, color: string): void {
  root.querySelectorAll<HTMLElement>('[data-pattern]').forEach((el) => {
    const p = PATTERNS.find((x) => x.id === el.dataset.pattern) as PatternItem | undefined;
    if (!p?.file) return;
    void patternUrl(p, color, Math.min(0.6, p.alpha * 2.6)).then((url) => (el.style.backgroundImage = url), () => undefined);
  });
}

export function initStylePage(view: HTMLElement): void {
  const render = () => {
    const theme = currentTheme();
    const pattern = currentPattern();
    const owned = ALL_ITEMS.filter((x) => isOwned(x.id)).length;
    const ready = canDraw();
    const next = nextDrawAt();
    view.innerHTML = `
      <h1>スタイル</h1>
      <section class="gacha-card">
        <div class="gacha-jar-mini">${jarSvg()}</div>
        <div class="gacha-info">
          <div class="gacha-title">今日のグミガチャ</div>
          <div class="gacha-sub">1日1回、まだ持っていないテーマか模様がひとつ出ます</div>
          <button type="button" class="gacha-btn" data-draw ${ready ? '' : 'disabled'}>${
            ready ? '引く' : `また明日（${next.getHours()}:${pad2(next.getMinutes())}から）`
          }</button>
          <div class="gacha-progress"><span style="width:${(owned / ALL_ITEMS.length) * 100}%"></span></div>
          <div class="gacha-count">集めた ${owned} / ${ALL_ITEMS.length}</div>
        </div>
      </section>
      <section class="style-section">
        <h2 class="group-head">テーマ</h2>
        <div class="style-grid">${THEMES.map((t) => tileHtml(t, t.id === theme.id)).join('')}</div>
      </section>
      <section class="style-section">
        <h2 class="group-head">模様</h2>
        <div class="style-grid">${PATTERNS.map((p) => tileHtml(p, p.id === pattern.id)).join('')}</div>
      </section>
      <p class="settings-foot">テーマはボタン・計測の円・下のメニューの色が変わります。模様は背景に出ます（計測中の画面には出しません）</p>`;
    paintPatterns(view, theme.light);

    view.querySelectorAll<HTMLElement>('.style-tile').forEach((b) => {
      b.onclick = () => {
        const item = ALL_ITEMS.find((x) => x.id === b.dataset.id)!;
        if (!isOwned(item.id)) return toast(`まだ持っていません。グミガチャで出ます（${item.rarity}）`);
        useStyle(item);
        render();
      };
    });
    $('[data-draw]', view).onclick = () => {
      if (!canDraw()) return;
      const item = draw();
      openGacha(item, () => render());
      render();
    };
  };
  document.addEventListener('style:show', render);
  render();
}

// ---- 絵 ----

/** グミの立方体（上・左・右の面の色）。SSR は虹色 */
function cubeSvg(rarity: Rarity | 'jar', size: number, fill?: [string, string, string]): string {
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
function jarSvg(): string {
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

// ---- ガチャの演出（全画面） ----

function openGacha(item: StyleItem | null, onDone: () => void): void {
  const rarity: Rarity = item?.rarity ?? 'N';
  const host = html(`
    <div id="gacha" class="g-shake r-${rarity}" role="dialog" aria-modal="true" aria-label="グミガチャ">
      <div class="g-rays" aria-hidden="true"></div>
      <div class="g-flash" aria-hidden="true"></div>
      <div class="g-jar">${jarSvg()}</div>
      <div class="g-cube">${cubeSvg(rarity, 120)}</div>
      <div class="g-hint">タップして開ける</div>
      <div class="g-result"></div>
    </div>`);
  document.body.append(host);
  const set = (stage: string) => {
    host.className = `${stage} r-${rarity}`;
  };
  // びんが揺れる → グミが落ちてくる → タップで開ける
  const t1 = window.setTimeout(() => set('g-drop'), 1100);
  const t2 = window.setTimeout(() => set('g-ready'), 1900);
  let opened = false;
  const open = () => {
    if (opened) return;
    opened = true;
    clearTimeout(t1);
    clearTimeout(t2);
    $('.g-result', host).innerHTML = resultHtml(item);
    paintPatterns(host, currentTheme().light);
    set('g-open');
    host.querySelector<HTMLElement>('[data-use]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (item) useStyle(item);
      close();
      toast(`「${item?.name}」にしました`);
    });
    $('[data-close]', host).addEventListener('click', (e) => {
      e.stopPropagation();
      close();
    });
  };
  const close = () => {
    host.remove();
    onDone();
  };
  host.addEventListener('click', () => {
    if (host.classList.contains('g-open')) return;
    open();
  });
}

function resultHtml(item: StyleItem | null): string {
  if (!item) {
    return `
      <div class="g-rarity">COMPLETE</div>
      <div class="g-name">全部そろっています！</div>
      <div class="g-kind">新しいスタイルが増えたら、また出ます</div>
      <div class="g-buttons"><button type="button" class="btn primary" data-close>閉じる</button></div>`;
  }
  const prev =
    item.kind === 'theme'
      ? themePreview(item)
      : `<span class="pattern-prev big" data-pattern="${esc(item.id)}" aria-hidden="true"></span>`;
  return `
    <div class="g-rarity">${item.rarity}</div>
    <div class="g-prev">${prev}</div>
    <div class="g-name">${esc(item.name)}</div>
    <div class="g-kind">${item.kind === 'theme' ? 'テーマ' : '模様'}が使えるようになりました</div>
    <div class="g-buttons">
      <button type="button" class="btn ghost" data-close>閉じる</button>
      <button type="button" class="btn primary" data-use>使ってみる</button>
    </div>`;
}
