// 期間限定ガチャ（シーズン中だけ引ける）。ショップとイベントのシーズンの箱から開く。
// 出るのはそのシーズンの限定のテーマ・模様・タグだけ。期間が終わると引けなくなり、交換所にも出ない。

import { dateKey } from '../cloud/model';
import { balance, fmtGumi, GUMI_CHANGE } from '../gumi';
import { md, seasonAt, type Season } from '../seasons';
import { drawLimited } from '../shop';
import { settings } from '../store';
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

/** 今引ける期間限定ガチャのシーズン（なければ null） */
export function limitedSeason(now = Date.now()): Season | null {
  const s = seasonAt(dateKey(now, settings.dayBoundaryMin));
  return s && limitedItems(s.id).length ? s : null;
}

/** ショップ・イベントに出す入り口（なければ空） */
export function limitedEntry(): string {
  const s = limitedSeason();
  if (!s) return '';
  return `
    <button type="button" class="lim-entry" data-limited>
      <span class="lim-emblem">${emblemSvg(40, s.look)}</span>
      <span class="lim-entry-text"><small>期間限定ガチャ・${md(s.end)}まで</small><b>${esc(s.title ?? s.name)}</b></span>
      <span class="chevron" aria-hidden="true">›</span>
    </button>`;
}

/** 期間限定ガチャのページを開く */
export function openLimitedGacha(): void {
  const s = limitedSeason();
  if (!s) return toast('いまは期間限定ガチャはありません');
  document.getElementById('limited')?.remove();
  const root = html('<div id="limited" class="fullpage" role="dialog" aria-modal="true" aria-label="期間限定ガチャ"></div>');
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
          <div class="sns-head-title">期間限定ガチャ</div>
          <span class="sns-head-side"></span>
        </div>
        <section class="lim-banner season-${esc(s.look ?? '')}">
          <span class="lim-emblem">${emblemSvg(84, s.look)}</span>
          <div class="lim-kicker">${esc(s.name)} 限定</div>
          <div class="lim-title">${esc(s.title ?? s.name)}</div>
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
