// グミガチャの演出（全画面）と、排出確率のページ。

import {
  GACHA10_COST,
  GACHA_COST,
  GACHA_ITEMS,
  GACHA_RARITIES,
  REFUND,
  RARITY_RATE,
  currentRates,
  currentTheme,
  isOwned,
  useStyle,
  type DrawResult,
  type Rarity,
  type StyleItem,
} from '../styles';
import { $, esc, html } from '../ui/dom';
import { toast } from '../ui/toast';
import { KIND_NAME, cubeSvg, jarSvg, paintPatterns, previewHtml, rarityTag } from './styleparts';

const ORDER: Rarity[] = ['N', 'R', 'SR', 'SSR', 'SECRET', 'LEGEND'];

/** タグを付ける（スタイルのページから渡してもらう。ログインやプロフィールのことはそちらで） */
export type SetTag = (tag: string) => Promise<void>;

export function openGacha(results: DrawResult[], setTag: SetTag, onDone: () => void): void {
  const best = results.reduce<Rarity>((b, r) => (ORDER.indexOf(r.item.rarity) > ORDER.indexOf(b) ? r.item.rarity : b), 'N');
  const host = html(`
    <div id="gacha" class="g-shake r-${best}" role="dialog" aria-modal="true" aria-label="グミガチャ">
      <div class="g-rays" aria-hidden="true"></div>
      <div class="g-flash" aria-hidden="true"></div>
      <div class="g-jar">${jarSvg()}</div>
      <div class="g-cube">${cubeSvg(best, 120)}</div>
      <div class="g-hint">タップして開ける</div>
      <div class="g-result"></div>
    </div>`);
  document.body.append(host);
  const set = (stage: string) => {
    host.className = `${stage} r-${best}${results.length > 1 ? ' g-many' : ''}`;
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
    $('.g-result', host).innerHTML = results.length === 1 ? oneHtml(results[0]) : manyHtml(results, best);
    paintPatterns(host, currentTheme().light);
    set('g-open');
    host.querySelector<HTMLElement>('[data-use]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
      const item = results[0].item;
      if (item.kind === 'tag') return void setTag(item.tag);
      useStyle(item);
      toast(`「${item.name}」にしました`);
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

function oneHtml({ item, dupe, refund }: DrawResult): string {
  const prev = previewHtml(item, true);
  if (dupe) {
    return `
      <div class="g-rarity">${item.rarity}</div>
      <div class="g-prev">${prev}</div>
      <div class="g-name">${esc(item.name)}</div>
      <div class="g-kind">もう持っていたので、<b class="g-refund">${refund}グミ</b> 返ってきました</div>
      <div class="g-buttons"><button type="button" class="btn primary" data-close>閉じる</button></div>`;
  }
  return `
    <div class="g-rarity">${item.rarity}</div>
    ${item.rarity === 'SECRET' ? '<div class="g-secret">シークレットを引きました！</div>' : ''}
    ${item.rarity === 'LEGEND' ? '<div class="g-secret gold">豪運！ 0.05%を引きました</div>' : ''}
    <div class="g-prev">${prev}</div>
    <div class="g-name">${esc(item.name)}</div>
    <div class="g-kind">${
      item.kind === 'tag' ? '名前の横に出るタグです。スタイルかプロフィールで付けられます' : `${KIND_NAME[item.kind]}が使えるようになりました`
    }</div>
    <div class="g-buttons">
      <button type="button" class="btn ghost" data-close>閉じる</button>
      <button type="button" class="btn primary" data-use>${item.kind === 'tag' ? '付けてみる' : '使ってみる'}</button>
    </div>`;
}

function manyHtml(results: DrawResult[], best: Rarity): string {
  const fresh = results.filter((r) => !r.dupe).length;
  const refund = results.reduce((t, r) => t + r.refund, 0);
  const cells = results
    .map(
      (r, i) => `
      <div class="g-cell r-${r.item.rarity}${r.dupe ? ' dupe' : ''}" style="animation-delay:${0.08 * i}s">
        <span class="g-cell-prev">${previewHtml(r.item)}</span>
        <span class="g-cell-name">${esc(r.item.name)}</span>
        <span class="g-cell-foot">${rarityTag(r.item.rarity)}${r.dupe ? `<small>+${r.refund}</small>` : '<b>NEW</b>'}</span>
      </div>`,
    )
    .join('');
  return `
    <div class="g-rarity small">${best}</div>
    ${best === 'SECRET' ? '<div class="g-secret">シークレットを引きました！</div>' : ''}
    ${best === 'LEGEND' ? '<div class="g-secret gold">豪運！ 0.05%を引きました</div>' : ''}
    <div class="g-multi">${cells}</div>
    <div class="g-kind">新しく ${fresh}個${refund ? `・かぶりのお返し <b class="g-refund">${refund}グミ</b>` : ''}</div>
    <div class="g-buttons"><button type="button" class="btn primary" data-close>閉じる</button></div>`;
}

// ---- 排出確率 ----

const RARITY_NOTE: Record<string, string> = {
  N: '2色のテーマ・よくある模様',
  R: 'やわらかいグラデーション・和柄や小物の模様',
  SR: 'あざやかなグラデーション・動物や理科の模様',
  SSR: '特別なグラデーション・文字や宇宙の模様',
  SECRET: '1つだけの隠しもの',
  LEGEND: '名前の横に出る金色のタグ「豪運」',
};

const pct = (p: number): string => (p === 0 ? '0%' : p < 0.1 ? `${p.toFixed(2)}%` : p < 1 ? `${p.toFixed(2)}%` : `${p.toFixed(1)}%`);

export function openRates(): void {
  const now = currentRates();
  const host = html('<div class="fullpage" role="dialog" aria-modal="true" aria-label="排出確率"></div>');
  const rows = GACHA_RARITIES.map((r) => {
    const all = GACHA_ITEMS.filter((x) => x.rarity === r);
    const left = all.filter((x) => !isOwned(x.id));
    return `<tr><td>${rarityTag(r)}</td><td>${RARITY_RATE[r]}%</td><td>${left.length}/${all.length}</td><td class="now">${
      left.length ? 'まだのもの' : `かぶり +${REFUND[r]}`
    }</td></tr>`;
  }).join('');
  const lists = GACHA_RARITIES.map((r) => {
    const items: StyleItem[] = GACHA_ITEMS.filter((x) => x.rarity === r);
    return `
      <details class="rate-list">
        <summary>${rarityTag(r)}<span>${esc(RARITY_NOTE[r])}（${items.length}種）</span></summary>
        ${items
          .map((x) => {
            const hidden = x.rarity === 'SECRET' && !isOwned(x.id);
            const name = hidden ? '？？？' : `${esc(x.name)}<small>${KIND_NAME[x.kind]}</small>`;
            const p = isOwned(x.id) ? '持っている' : pct(now.item.get(x.id) ?? 0);
            return `<div class="rate-row${isOwned(x.id) ? ' owned' : ''}"><span>${name}</span><span>${p}</span></div>`;
          })
          .join('')}
      </details>`;
  }).join('');
  host.innerHTML = `
    <div class="sns">
      <div class="sns-head">
        <button type="button" class="sns-back" data-close aria-label="閉じる">×</button>
        <div class="sns-head-title">排出確率</div>
        <span class="sns-head-side"></span>
      </div>
      <div class="prose">
        <p>グミガチャは1回 ${GACHA_COST}グミ、10回 ${GACHA10_COST.toLocaleString()}グミです。テーマ・模様・タグのどれかが出ます。</p>
        <p>先にレア度を下の確率で決め、そのレア度のまだ持っていないものから、同じ確率で1つ選びます。そのレア度を全部持っていたら「かぶり」になり、グミが少し返ってきます。レア度の確率は、集めても変わりません。ベースカラーは、はじめから使えるのでガチャには出ません。</p>
      </div>
      <table class="rate-table">
        <thead><tr><th>レア度</th><th>確率</th><th>残り</th><th>出るもの</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="sns-note">今のあなたが次に引いたとき、かぶりになる確率は ${pct(now.dupe)} です</p>
      <div class="sns-card rate-lists">${lists}</div>
      <p class="sns-note">1つずつの確率は、次に引くときにそれが出る確率です</p>
    </div>`;
  $('[data-close]', host).onclick = () => host.remove();
  $('#app').append(host);
}
