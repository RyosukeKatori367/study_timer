// スタイルのページ（マイページから開く）。テーマ・模様・タグの一覧。
// まだ持っていないものは灰色で鍵がかかる。ガチャで出るか、交換所でグミと交換すると使えるようになる。

import {
  ALL_ITEMS,
  GACHA_ITEMS,
  PATTERNS,
  TAG_ITEMS,
  THEMES,
  currentPattern,
  currentTheme,
  exchangePrice,
  isOwned,
  ownedTags,
  useStyle,
  type StyleItem,
} from '../styles';
import { api } from '../cloud/api';
import { balance, fmtGumi } from '../gumi';
import { exchange } from '../shop';
import { shownTag, tagById, tagHtml } from '../tags';
import { GRANTS_CHANGE } from '../grants';
import { $, esc } from '../ui/dom';
import { pickList } from '../ui/sheet';
import { toast } from '../ui/toast';
import { LOCK, coinHtml, paintPatterns, previewHtml, rarityTag } from './styleparts';

/** 一覧の絞り込み */
let filter: 'all' | 'owned' | 'locked' = 'all';

function tileHtml(item: StyleItem, selected: boolean): string {
  const owned = isOwned(item.id);
  // シークレットは、手に入れるまで中身も名前も隠す
  if (item.rarity === 'SECRET' && !owned) {
    return `
      <button type="button" class="style-tile locked secret" data-id="${esc(item.id)}" aria-label="シークレット（まだ持っていません）">
        <span class="style-prev"><span class="secret-prev">？</span></span>
        <span class="style-name">？？？</span>
        ${rarityTag(item.rarity)}
      </button>`;
  }
  const price = owned ? undefined : exchangePrice(item);
  return `
    <button type="button" class="style-tile${owned ? '' : ' locked'}" data-id="${esc(item.id)}" aria-pressed="${selected}"
      aria-label="${esc(item.name)}${owned ? '' : '（まだ持っていません）'}">
      <span class="style-prev">${previewHtml(item)}${owned ? '' : `<span class="lock-badge">${LOCK}</span>`}${selected ? '<span class="sel-badge">✓</span>' : ''}</span>
      <span class="style-name">${esc(item.name)}</span>
      ${price ? `<span class="style-price">${fmtGumi(price)}</span>` : rarityTag(item.rarity)}
    </button>`;
}

/** 今プロフィールで付けているタグ */
const profileTag = (): string | undefined => api.cachedProfile()?.tag;

/** マイページに戻る */
const back = () => document.dispatchEvent(new CustomEvent('view:show', { detail: 'my' }));

export function initStylePage(view: HTMLElement): void {
  const render = () => {
    const theme = currentTheme();
    const pattern = currentPattern();
    const owned = GACHA_ITEMS.filter((x) => isOwned(x.id)).length;
    const shown = (x: StyleItem) => filter === 'all' || (filter === 'owned') === isOwned(x.id);
    const grid = (items: StyleItem[], sel: string) => {
      const list = items.filter(shown);
      return list.length
        ? `<div class="style-grid">${list.map((x) => tileHtml(x, x.id === sel)).join('')}</div>`
        : '<p class="sns-lead">ありません</p>';
    };
    const base = THEMES.filter((x) => x.rarity === 'BASE');
    const gachaThemes = THEMES.filter((x) => x.rarity !== 'BASE');
    const ownedOf = (items: StyleItem[]) => `${items.filter((x) => isOwned(x.id)).length}/${items.length}`;
    view.innerHTML = `
      <button type="button" class="view-back" aria-label="マイページに戻る">‹</button>
      <h1>スタイル</h1>
      <div class="style-top">
        <span class="style-count">集めた ${owned} / ${GACHA_ITEMS.length}</span>
        ${coinHtml(balance())}
      </div>
      <div class="sns-seg small style-filter" role="group">
        <button type="button" data-filter="all" aria-pressed="${filter === 'all'}">すべて</button>
        <button type="button" data-filter="owned" aria-pressed="${filter === 'owned'}">持っている</button>
        <button type="button" data-filter="locked" aria-pressed="${filter === 'locked'}">まだ</button>
      </div>
      <section class="style-section">
        <h2 class="group-head">ベースカラー<span class="head-note">はじめから使える</span></h2>
        ${grid(base, theme.id)}
      </section>
      <section class="style-section">
        <h2 class="group-head">テーマ<span class="head-note">${ownedOf(gachaThemes)}</span></h2>
        ${grid(gachaThemes, theme.id)}
      </section>
      <section class="style-section">
        <h2 class="group-head">模様<span class="head-note">${ownedOf(PATTERNS.filter((x) => x.rarity !== 'BASE'))}</span></h2>
        ${grid(PATTERNS, pattern.id)}
      </section>
      <section class="style-section">
        <h2 class="group-head">タグ<span class="head-note">名前の横に出ます</span></h2>
        ${tagGrid(filter, grid)}
      </section>
      <p class="settings-foot">まだのものは、ショップのグミガチャで出るか、グミと交換できます（数字は交換に使うグミ）。テーマはボタン・計測の円・下のメニューの色が、模様は背景が変わります（計測中の画面には出しません）</p>`;
    paintPatterns(view, theme.light);
    $('.view-back', view).onclick = back;

    view.querySelectorAll<HTMLElement>('.style-tile[data-tag]').forEach((b) => {
      b.onclick = () => void setTag(b.dataset.tag!).then(render);
    });
    view.querySelectorAll<HTMLElement>('.style-tile[data-id]').forEach((b) => {
      b.onclick = () => {
        const item = ALL_ITEMS.find((x) => x.id === b.dataset.id)!;
        if (!isOwned(item.id)) return void offerExchange(item).then((ok) => ok && render());
        if (item.kind === 'tag') return void setTag(item.tag).then(render);
        useStyle(item);
        render();
      };
    });
    view.querySelectorAll<HTMLElement>('[data-filter]').forEach((b) => {
      b.onclick = () => {
        filter = b.dataset.filter as typeof filter;
        render();
      };
    });
  };
  document.addEventListener('style:show', render);
  document.addEventListener(GRANTS_CHANGE, render);
  render();
}

/** タグの一覧：開発者タグ・配られたタグ（古参など）と、ガチャのタグ */
function tagGrid(filter: 'all' | 'owned' | 'locked', grid: (items: StyleItem[], sel: string) => string): string {
  const uid = api.user()?.uid;
  const now = uid ? shownTag(uid, profileTag())?.id : undefined;
  const extra = filter === 'locked' ? [] : ownedTags(uid).filter((t) => !TAG_ITEMS.some((x) => x.tag === t));
  const tiles = extra
    .map((t) => {
      const def = tagById(t);
      if (!def) return '';
      return `
        <button type="button" class="style-tile" data-tag="${esc(t)}" aria-pressed="${now === t}" aria-label="${esc(def.name)}">
          <span class="style-prev"><span class="tag-prev" aria-hidden="true">${tagHtml(def)}</span>${now === t ? '<span class="sel-badge">✓</span>' : ''}</span>
          <span class="style-name">${esc(def.name)}</span>
        </button>`;
    })
    .join('');
  const gacha = grid(TAG_ITEMS, TAG_ITEMS.find((x) => x.tag === now)?.id ?? '');
  if (!tiles) return gacha;
  // ガチャのタグの一覧（style-grid）の頭に足す
  return gacha.includes('class="style-grid"') ? gacha.replace('<div class="style-grid">', `<div class="style-grid">${tiles}`) : `<div class="style-grid">${tiles}</div>`;
}

/** まだ持っていないものを押したとき：交換できるものなら、交換するか聞く。交換したら true */
export async function offerExchange(item: StyleItem): Promise<boolean> {
  const price = exchangePrice(item);
  if (price === undefined) {
    toast(item.rarity === 'SECRET' ? 'シークレット。グミガチャでだけ出ます' : '豪運はグミガチャでだけ出ます（0.05%）');
    return false;
  }
  const have = balance();
  if (have < price) {
    toast(`交換には ${fmtGumi(price)}グミ いります（今 ${fmtGumi(have)}グミ）`);
    return false;
  }
  const i = await pickList(`「${item.name}」を交換しますか？`, [
    { label: `${fmtGumi(price)}グミで交換する`, sub: `残り ${fmtGumi(have - price)}グミ` },
  ]);
  if (i !== 0 || !exchange(item)) return false;
  toast(`「${item.name}」を手に入れました`);
  if (item.kind !== 'tag') useStyle(item);
  return true;
}

/** プロフィールのタグを付ける（ログインしていないときは、付け方を伝える） */
export async function setTag(tag: string): Promise<void> {
  if (!api.user()) return toast('ログインすると、グループで名前の横に出せます');
  try {
    const p = api.cachedProfile() ?? (await api.getProfile());
    if (!p) return toast('先にプロフィールを作ってください');
    const next = p.tag === tag ? 'none' : tag;
    await api.saveProfile({ name: p.name, bio: p.bio, icon: p.icon, tag: next });
    toast(next === 'none' ? 'タグを外しました' : `「${tagById(next)?.name}」を付けました`);
    document.dispatchEvent(new CustomEvent('style:show')); // 一覧の「付けている」を直す
  } catch {
    toast('付けられませんでした。オフラインかもしれません');
  }
}
