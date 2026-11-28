// 期間限定ガチャ（シーズンのガチャと、不定期のピックアップ）。ショップとホームのシーズンの箱から開く。
// 出るのはそのバナーの限定のテーマ・模様・タグだけ。期間が終わると引けなくなり、交換所にも出ない。

import { activeBanner, activeBanners, type Banner } from '../banners';
import { balance, fmtGumi, GUMI_CHANGE } from '../gumi';
import { md } from '../seasons';
import { drawLimited } from '../shop';
import {
  GACHA10_COST,
  GACHA_COST,
  LIMITED_RARITIES,
  LIMITED_RATE,
  REFUND,
  currentTheme,
  isOwned,
  limitedItems,
} from '../styles';
import { $, esc, html } from '../ui/dom';
import { toast } from '../ui/toast';
import { openGacha } from './gacha';
import { emblemSvg } from './season-intro';
import { setTag } from './style';
import { KIND_NAME, coinHtml, paintPatterns, previewHtml, rarityTag } from './styleparts';

/** ピックアップの紋章（雪の結晶） */
function flakeSvg(size: number): string {
  const arms = [0, 60, 120]
    .map(
      (a) =>
        `<g transform="rotate(${a} 24 24)"><path d="M24 4v40M24 11l-4-4M24 11l4-4M24 37l-4 4M24 37l4 4M24 18l-6-3M24 18l6-3M24 30l-6 3M24 30l6 3"/></g>`,
    )
    .join('');
  return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">${arms}<circle cx="24" cy="24" r="3" fill="currentColor" stroke="none"/></svg>`;
}

const emblemOf = (b: Banner, size: number): string => (b.kind === 'pickup' ? flakeSvg(size) : emblemSvg(size, b.look));
const lookClass = (b: Banner): string => (b.kind === 'pickup' ? ` pickup-${esc(b.look ?? '')}` : ` season-${esc(b.look ?? '')}`);
const kindName = (b: Banner): string => (b.kind === 'pickup' ? 'ピックアップガチャ' : '期間限定ガチャ');

/** 今引ける期間限定のシーズン（なければ null。スタイルの説明に使う） */
export const limitedBanner = activeBanner;

/** ショップ・ホームに出す入り口（今引けるもの全部。なければ空） */
export function limitedEntry(): string {
  return activeBanners()
    .map(
      (b) => `
    <button type="button" class="lim-entry${lookClass(b)}" data-limited="${esc(b.id)}">
      <span class="lim-emblem">${emblemOf(b, 40)}</span>
      <span class="lim-entry-text"><small>${kindName(b)}・${md(b.end)}まで</small><b>${esc(b.title)}</b></span>
      <span class="chevron" aria-hidden="true">›</span>
    </button>`,
    )
    .join('');
}

/** 入り口のボタンをつなぐ */
export function bindLimitedEntries(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-limited]').forEach((b) => {
    b.onclick = () => openLimitedGacha(b.dataset.limited);
  });
}

/** 期間限定ガチャのページを開く */
export function openLimitedGacha(id?: string): void {
  const s = (id ? activeBanner(id) : undefined) ?? activeBanners()[0];
  if (!s) return toast('いまは期間限定ガチャはありません');
  document.getElementById('limited')?.remove();
  const root = html(`<div id="limited" class="fullpage" role="dialog" aria-modal="true" aria-label="${kindName(s)}"></div>`);
  document.getElementById('app')!.append(root);
  const items = limitedItems(s.id);

  const render = () => {
    const have = balance();
    const owned = items.filter((x) => isOwned(x.id)).length;
    const order = [...LIMITED_RARITIES].reverse();
    root.innerHTML = `
      <div class="sns">
        <div class="sns-head">
          <button type="button" class="sns-back" data-close aria-label="閉じる">×</button>
          <div class="sns-head-title">${kindName(s)}</div>
          <span class="sns-head-side"></span>
        </div>
        <section class="lim-banner${lookClass(s)}">
          <span class="lim-emblem">${emblemOf(s, 84)}</span>
          <div class="lim-kicker">${esc(s.name)}${s.kind === 'season' ? ' 限定' : ''}</div>
          <div class="lim-title">${esc(s.title)}</div>
          <div class="lim-period">${md(s.start)}〜${md(s.end)} まで</div>
        </section>
        <div class="shop-coin">${coinHtml(have)}</div>
        <div class="gacha-buttons lim-buttons">
          <button type="button" class="gacha-btn" data-draw="1" ${have < GACHA_COST ? 'disabled' : ''}>1回<small>${GACHA_COST}グミ</small></button>
          <button type="button" class="gacha-btn ten" data-draw="10" ${have < GACHA10_COST ? 'disabled' : ''}>10回<small>${fmtGumi(GACHA10_COST)}グミ</small></button>
        </div>
        <div class="gacha-foot"><span class="gacha-count">集めた ${owned} / ${items.length}</span></div>
        ${order
          .map((r) => {
            const list = items.filter((x) => x.rarity === r);
            return `
          <section class="lim-group">
            <div class="lim-group-head">${rarityTag(r)}<span>${LIMITED_RATE[r]}%</span><span class="head-note">全部そろったら かぶり +${REFUND[r]}</span></div>
            <div class="style-grid">${list
              .map(
                (x) => `
              <div class="style-tile${isOwned(x.id) ? '' : ' locked'}">
                <span class="style-prev">${previewHtml(x)}${isOwned(x.id) ? '<span class="sel-badge">✓</span>' : ''}</span>
                <span class="style-name">${esc(x.name)}</span>
                <span class="style-ach">${KIND_NAME[x.kind]}</span>
              </div>`,
              )
              .join('')}</div>
          </section>`;
          })
          .join('')}
        <p class="settings-foot">先にレア度を上の確率で決め、そのレア度のまだ持っていないものから1つ出ます。期間が終わると引けなくなり、交換所にも出ません（手に入れたものはずっと使えます）</p>
      </div>`;
    paintPatterns(root, currentTheme().light);
    $('[data-close]', root).onclick = () => root.remove();
    root.querySelectorAll<HTMLElement>('[data-draw]').forEach((b) => {
      b.onclick = () => {
        const results = drawLimited(s.id, b.dataset.draw === '10' ? 10 : 1);
        if (!results) return toast('グミが足りません');
        openGacha(results, setTag, () => {
          render();
          document.dispatchEvent(new CustomEvent('style:show'));
        });
      };
    });
  };
  render();
  document.addEventListener(GUMI_CHANGE, () => root.isConnected && render(), { once: true });
}
