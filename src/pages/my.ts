// マイページ。プロフィール・グミ・ログインボーナスと、ショップ・スタイル・実績・設定への入り口。
// ショップ・実績・グミの履歴・プロフィールはこのタブの中で重ねて開く（戻るで戻る）。
// スタイルと設定は、それぞれのページ（下のメニューはマイページのまま）。

import { achName, achievements, claimAchievements, claimableAchievements, currentStreak, type Ach } from '../achievements';
import { api } from '../cloud/api';
import {
  GUMI_CHANGE,
  LOGIN_BONUS,
  OPEN_BONUS,
  STREAK_BONUS,
  STREAK_DAYS,
  balance,
  claimLogin,
  fmtGumi,
  history,
  loginStatus,
  totalStudyMs,
} from '../gumi';
import { questName } from '../quests';
import { drawGacha } from '../shop';
import { EXCHANGE_PRICE, GACHA10_COST, GACHA_COST, GACHA_ITEMS, currentTheme, isOwned, itemById, type Rarity } from '../styles';
import { shownTag, tagHtml } from '../tags';
import { HOUR, MIN } from '../time';
import { $, esc, html } from '../ui/dom';
import { toast } from '../ui/toast';
import { profileScreen } from './group/account';
import { avatar, createNav, type Nav, type Screen } from './group/ui';
import { openGacha, openRates } from './gacha';
import { offerExchange, setTag } from './style';
import { coinHtml, jarSvg, paintPatterns, previewHtml, rarityTag } from './styleparts';

export interface MyPageHooks {
  /** ログイン・登録の画面を開く（グループタブで） */
  openLogin: () => void;
  /** スタイル・設定のページを開く */
  openView: (name: 'style' | 'settings') => void;
}

let nav: Nav | null = null;

/** GUMI_CHANGE のたびに描き直す画面（離れたら止める） */
function live(el: HTMLElement, paint: () => void): Screen {
  paint();
  const on = () => {
    if (el.isConnected) paint();
  };
  // グミが変わったときと、ほかのタブからマイページに戻ってきたとき
  document.addEventListener(GUMI_CHANGE, on);
  document.addEventListener('my:show', on);
  return {
    el,
    dispose: () => {
      document.removeEventListener(GUMI_CHANGE, on);
      document.removeEventListener('my:show', on);
    },
  };
}

/** プロフィールをまだ読んでいなければ、1回だけ読む */
let profileAsked = false;

/** 戻る（描き直しても効くように、ページ全体で受ける。initMyPage を見る） */
const back = '<button type="button" class="view-back" data-back aria-label="戻る">‹</button>';

// ---- いちばん上 ----

function homeScreen(n: Nav, hooks: MyPageHooks): Screen {
  const el = html('<div class="sns my"></div>');
  const paint = () => {
    const u = api.user();
    const p = u ? api.cachedProfile() : null;
    if (u && !p && !profileAsked) {
      profileAsked = true;
      void api
        .getProfile()
        .then(() => el.isConnected && paint())
        .catch(() => undefined);
    }
    const tag = u ? shownTag(u.uid, p?.tag) : null;
    const total = totalStudyMs();
    const streak = currentStreak();
    const st = loginStatus();
    const ach = achievements();
    const ready = claimableAchievements(ach).length;
    const owned = GACHA_ITEMS.filter((x) => isOwned(x.id)).length;
    const days = Array.from({ length: STREAK_DAYS }, (_, i) => {
      const d = i + 1;
      const cls = d < st.day || (d === st.day && st.claimed) ? 'got' : d === st.day ? 'today' : '';
      const amt = LOGIN_BONUS + (d === STREAK_DAYS ? STREAK_BONUS : 0);
      return `<span class="ld ${cls}${d === STREAK_DAYS ? ' big' : ''}"><small>${d}日目</small><b>${amt}</b></span>`;
    }).join('');
    el.innerHTML = `
      <h1>マイページ</h1>
      <button type="button" class="sns-card my-prof" data-profile>
        ${p ? avatar(p.icon, 56) : '<span class="av guest" style="--s:56px" aria-hidden="true"><span>？</span></span>'}
        <span class="my-prof-main">
          <span class="my-prof-name">${esc(p?.name ?? (u ? 'プロフィールを作る' : 'ゲスト'))}${tag ? tagHtml(tag) : ''}</span>
          <span class="my-prof-sub">累計 ${Math.floor(total / HOUR).toLocaleString('ja-JP')}時間${Math.floor((total % HOUR) / MIN)}分・連続 ${streak}日</span>
          ${u ? '' : '<span class="my-prof-sub">ログインすると、グループやみんなのイベントに参加できます</span>'}
        </span>
        <span class="chevron" aria-hidden="true">›</span>
      </button>
      <section class="login-card${st.claimed ? ' done' : ''}">
        <div class="login-head"><b>ログインボーナス</b><span>${
          st.streak > 1 ? `${st.claimed ? '' : '今日で'}${st.streak}日 連続` : '毎日もらえる'
        }</span></div>
        <div class="login-days">${days}</div>
        ${
          st.claimed
            ? '<div class="login-note">今日の分は受け取りました。また明日</div>'
            : `<button type="button" class="btn primary" data-bonus>+${fmtGumi(st.amount + (st.open ? OPEN_BONUS : 0))} 受け取る</button>
               ${st.open ? `<div class="login-note">開店記念の ${OPEN_BONUS}グミも いっしょに</div>` : ''}`
        }
      </section>
      <div class="my-coin">${coinHtml(balance())}<button type="button" class="link" data-history>グミの履歴 ›</button></div>
      <div class="my-grid">
        <button type="button" class="my-tile shop" data-open="shop">
          <span class="my-tile-icon">${jarSvg()}</span>
          <b>ショップ</b><span>ガチャ・交換所</span>
        </button>
        <button type="button" class="my-tile" data-open="style">
          <span class="my-tile-icon cube">${'<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.5 19.4 7.75v8.5L12 20.5l-7.4-4.25v-8.5Z"/><path d="M4.6 7.75 12 12l7.4-4.25M12 12v8.5"/></svg>'}</span>
          <b>スタイル</b><span>集めた ${owned}/${GACHA_ITEMS.length}</span>
        </button>
        <button type="button" class="my-tile" data-open="ach">
          <span class="my-tile-icon">${'<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="5.5"/><path d="M8.5 13.5 7 21l5-2.5 5 2.5-1.5-7.5"/></svg>'}</span>
          <b>実績</b><span>達成 ${ach.filter((a) => a.done).length}/${ach.length}</span>
          ${ready ? `<span class="my-badge">${ready}</span>` : ''}
        </button>
        <button type="button" class="my-tile" data-open="settings">
          <span class="my-tile-icon">${'<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>'}</span>
          <b>設定</b><span>アカウント・計測・データ</span>
        </button>
      </div>`;
    $('[data-profile]', el).onclick = () => (api.user() ? n.push((m) => profileScreen(m)) : hooks.openLogin());
    el.querySelector<HTMLElement>('[data-bonus]')?.addEventListener('click', () => {
      const got = claimLogin();
      if (got) toast(`+${fmtGumi(got)}グミ`);
    });
    $('[data-history]', el).onclick = () => n.push(historyScreen);
    el.querySelectorAll<HTMLElement>('[data-open]').forEach((b) => {
      b.onclick = () => {
        const to = b.dataset.open!;
        if (to === 'shop') n.push(shopScreen);
        else if (to === 'ach') n.push(achScreen);
        else hooks.openView(to as 'style' | 'settings');
      };
    });
  };
  return live(el, paint);
}

// ---- ショップ ----

const SHOP_RARITIES: Rarity[] = ['N', 'R', 'SR', 'SSR'];
let shopRarity: Rarity = 'N';

function shopScreen(): Screen {
  const el = html('<div class="sns"></div>');
  const paint = () => {
    const have = balance();
    const owned = GACHA_ITEMS.filter((x) => isOwned(x.id)).length;
    const items = GACHA_ITEMS.filter((x) => x.rarity === shopRarity && !isOwned(x.id));
    el.innerHTML = `
      ${back}
      <h1>ショップ</h1>
      <div class="shop-coin">${coinHtml(have)}</div>
      <section class="gacha-card shop-gacha">
        <div class="gacha-jar-mini">${jarSvg()}</div>
        <div class="gacha-info">
          <div class="gacha-title">グミガチャ</div>
          <div class="gacha-sub">テーマ・模様・タグのどれかが出ます。まだ持っていないものから選ばれます</div>
          <div class="gacha-buttons">
            <button type="button" class="gacha-btn" data-draw="1" ${have < GACHA_COST ? 'disabled' : ''}>1回<small>${GACHA_COST}グミ</small></button>
            <button type="button" class="gacha-btn ten" data-draw="10" ${have < GACHA10_COST ? 'disabled' : ''}>10回<small>${fmtGumi(GACHA10_COST)}グミ</small></button>
          </div>
          <div class="gacha-progress"><span style="width:${(owned / GACHA_ITEMS.length) * 100}%"></span></div>
          <div class="gacha-foot">
            <span class="gacha-count">集めた ${owned} / ${GACHA_ITEMS.length}</span>
            <button type="button" class="gacha-rates" data-rates>排出確率 ›</button>
          </div>
        </div>
      </section>
      <section class="sns-card exch">
        <div class="ev-card-head"><span>交換所</span><span class="head-note">ほしいものを直接</span></div>
        <div class="sns-seg small" role="group">
          ${SHOP_RARITIES.map(
            (r) => `<button type="button" data-r="${r}" aria-pressed="${r === shopRarity}">${r}<small>${fmtGumi(EXCHANGE_PRICE[r]!)}</small></button>`,
          ).join('')}
        </div>
        ${
          items.length
            ? `<div class="style-grid">${items
                .map(
                  (x) => `
              <button type="button" class="style-tile" data-id="${esc(x.id)}" aria-label="${esc(x.name)}を交換">
                <span class="style-prev">${previewHtml(x)}</span>
                <span class="style-name">${esc(x.name)}</span>
                <span class="style-price">${fmtGumi(EXCHANGE_PRICE[x.rarity]!)}</span>
              </button>`,
                )
                .join('')}</div>`
            : `<p class="sns-lead">${rarityTag(shopRarity)} は全部持っています</p>`
        }
      </section>
      <p class="settings-foot">グミは勉強・ログインボーナス・クエスト・実績・イベントでたまります。シークレットと豪運は交換所に出ません</p>`;
    paintPatterns(el, currentTheme().light);
    el.querySelectorAll<HTMLElement>('[data-draw]').forEach((b) => {
      b.onclick = () => {
        const results = drawGacha(b.dataset.draw === '10' ? 10 : 1);
        if (!results) return toast('グミが足りません');
        openGacha(results, setTag, () => document.dispatchEvent(new CustomEvent('style:show')));
      };
    });
    $('[data-rates]', el).onclick = openRates;
    el.querySelectorAll<HTMLElement>('[data-r]').forEach((b) => {
      b.onclick = () => {
        shopRarity = b.dataset.r as Rarity;
        paint();
      };
    });
    el.querySelectorAll<HTMLElement>('.style-tile').forEach((b) => {
      b.onclick = () => {
        const item = itemById(b.dataset.id!);
        if (item) void offerExchange(item);
      };
    });
  };
  return live(el, paint);
}

// ---- 実績 ----

function achRow(a: Ach): string {
  const hidden = a.hidden && !a.done;
  const prog = a.unit === 'h' ? `${Math.floor(Math.min(a.now, a.target) / HOUR)} / ${a.target / HOUR}時間` : `${Math.min(a.now, a.target)} / ${a.target}`;
  const right = a.claimed
    ? '<span class="q-got">受け取り済み</span>'
    : a.done
      ? `<button type="button" class="q-claim" data-ach="${esc(a.key)}">+${a.reward} 受け取る</button>`
      : `<span class="q-reward">+${a.reward}</span>`;
  return `
    <div class="q-row ach${a.claimed ? ' claimed' : a.done ? ' done' : ''}">
      <span class="medal" aria-hidden="true">${a.done ? '★' : ''}</span>
      <span class="q-main">
        <span class="q-title">${hidden ? '？？？' : esc(a.title)}</span>
        <span class="q-desc">${hidden ? 'ひみつの実績' : esc(a.desc)}</span>
        ${a.done || hidden ? '' : `<span class="q-bar"><i style="width:${Math.min(100, (a.now / a.target) * 100)}%"></i></span><span class="q-prog">${prog}</span>`}
      </span>
      ${right}
    </div>`;
}

function achScreen(): Screen {
  const el = html('<div class="sns"></div>');
  const paint = () => {
    const list = achievements();
    const ready = claimableAchievements(list);
    const got = list.filter((a) => a.claimed).reduce((t, a) => t + a.reward, 0);
    const groups = [...new Set(list.map((a) => a.group))];
    el.innerHTML = `
      ${back}
      <h1>実績</h1>
      <div class="ach-sum"><span>達成 <b>${list.filter((a) => a.done).length}</b> / ${list.length}</span><span>もらったグミ ${fmtGumi(got)}</span></div>
      ${
        ready.length
          ? `<button type="button" class="btn primary" data-all>まとめて受け取る（+${fmtGumi(ready.reduce((t, a) => t + a.reward, 0))}）</button>`
          : ''
      }
      ${groups
        .map(
          (g) => `
        <section class="sns-card ev-card">
          <div class="ev-card-head"><span>${esc(g)}</span></div>
          ${list
            .filter((a) => a.group === g)
            .map(achRow)
            .join('')}
        </section>`,
        )
        .join('')}`;
    el.querySelector<HTMLElement>('[data-all]')?.addEventListener('click', () => {
      const n = claimAchievements(claimableAchievements());
      if (n) toast(`+${fmtGumi(n)}グミ`);
    });
    el.querySelectorAll<HTMLElement>('[data-ach]').forEach((b) => {
      b.onclick = () => {
        const a = achievements().find((x) => x.key === b.dataset.ach);
        if (a && claimAchievements([a])) toast(`+${a.reward}グミ`);
      };
    });
  };
  return live(el, paint);
}

// ---- グミの履歴 ----

const names = (key: string): string | undefined => {
  if (key.startsWith('a:')) return achName(key);
  if (key.startsWith('x:')) return itemById(key.slice(2))?.name;
  return questName(key);
};

function historyScreen(): Screen {
  const el = html('<div class="sns"></div>');
  const list = history(names);
  el.innerHTML = `
    ${back}
    <h1>グミの履歴</h1>
    <div class="shop-coin">${coinHtml(balance())}</div>
    ${
      list.length
        ? `<section class="sns-card hist">${list
            .slice(0, 300)
            .map(
              (h) => `
          <div class="hist-row">
            <span class="hist-label">${esc(h.label)}${h.date ? `<small>${esc(h.date)}</small>` : ''}</span>
            <b class="${h.amount < 0 ? 'minus' : 'plus'}">${h.amount < 0 ? '−' : '+'}${fmtGumi(Math.abs(h.amount))}</b>
          </div>`,
            )
            .join('')}</section>`
        : '<p class="sns-lead">まだありません。ログインボーナスを受け取ってみましょう</p>'
    }`;
  return { el };
}

export function initMyPage(view: HTMLElement, hooks: MyPageHooks): void {
  nav = createNav(view, () => (n) => homeScreen(n, hooks));
  view.addEventListener('click', (e) => {
    if ((e.target as Element).closest('[data-back]')) nav?.back();
  });
  nav.home();
}

/** マイページのいちばん上に戻す（下のメニューで、マイページを開いているときにもう一度押したとき） */
export const myHome = (): void => nav?.home();
