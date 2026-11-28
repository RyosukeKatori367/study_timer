import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { initPomodoroPage } from './pages/pomodoro';
import { initSettingsPage } from './pages/settings';
import { renderStats } from './pages/stats';
import { initStopwatchPage } from './pages/stopwatch';
import { initTimerPage } from './pages/timer';
import { initCloud } from './cloud';
import { api, setApi } from './cloud/api';
import { SHOW_VIEW, initGroupPage, openGroupScreen } from './pages/group';
import { authScreen } from './pages/group/account';
import { initRun } from './run';
import { initStylePage, setTag } from './pages/style';
import { GRANTS_CHANGE } from './grants';
import { tagById } from './tags';
import { initEventPage } from './pages/event';
import { initMyPage, myHome } from './pages/my';
import { claimableAchievements } from './achievements';
import { claimableTiers } from './events';
import { GUMI_CHANGE, fmtGumi, loginStatus, syncStudyBonus } from './gumi';
import { unseenNews } from './news';
import { claimableQuests } from './quests';
import { applyStyle } from './styles';
import { requestPersistence } from './store';
import { armTilt } from './tilt';
import { $, html } from './ui/dom';
import { toast } from './ui/toast';

type ViewName = 'main' | 'stats' | 'group' | 'event' | 'my' | 'style' | 'settings';
/** 下のメニューのどれを光らせるか（スタイルと設定はマイページから開く） */
const NAV_OF: Partial<Record<ViewName, ViewName>> = { style: 'my', settings: 'my' };

// オフラインでも動くようにする。新しい版を公開したら自動で入れ替わる
registerSW({ immediate: true });
requestPersistence();

const views = document.querySelectorAll<HTMLElement>('.view');
const navButtons = document.querySelectorAll<HTMLElement>('nav button');
const pager = $('#pager');
const dots = $('#dots');
const statsView = $('.view[data-view="stats"]');
let current: ViewName = 'main';

// ---- 3つのモードのページ ----

const refreshPomodoro = initPomodoroPage($('.page[data-mode="pomodoro"]'));
const refreshTimer = initTimerPage($('.page[data-mode="timer"]'));
const refreshStopwatch = initStopwatchPage($('.page[data-mode="stopwatch"]'));

/** 記録が変わったとき（計測の終了・読み込み・全消去）に表示を更新する。 */
function refreshAll(): void {
  // バックアップから設定を取り込んだときなどに、テーマと模様も合わせる
  void applyStyle();
  refreshPomodoro();
  refreshTimer();
  refreshStopwatch();
  if (current === 'stats') renderStats(statsView);
  // 累計3時間ごとの勉強ボーナス（記録が増えたとき）
  const got = syncStudyBonus();
  if (got) window.setTimeout(() => toast(`勉強ボーナス +${fmtGumi(got)}グミ（累計3時間ごと）`), 2600);
  updateBadges();
}

const openLogin = () => openGroupScreen((n) => authScreen(n, 'login'));
const settingsView = $('.view[data-view="settings"]');
initSettingsPage(settingsView, refreshAll);
settingsView.prepend(html('<button type="button" class="view-back" aria-label="マイページに戻る">‹</button>'));
$('.view-back', settingsView).onclick = () => showView('my');
initStylePage($('.view[data-view="style"]'));
initEventPage($('.view[data-view="event"]'), openLogin);
initMyPage($('.view[data-view="my"]'), { openLogin, openView: (name) => showView(name) });
syncStudyBonus();
void applyStyle();
document.addEventListener('material:change', refreshAll);
initRun(refreshAll);

// ---- グループとバックアップ ----
// 開発中は ?fake（ログイン前）・?fake=in（ログイン後）で、Firebase につながずに偽のデータで画面を確かめる
const fake = import.meta.env.DEV ? new URLSearchParams(location.search).get('fake') : null;
const cloudReady =
  fake !== null
    ? import('./cloud/fake').then((m) => setApi(m.makeFakeApi(fake === 'in', api)))
    : Promise.resolve(initCloud(refreshAll));
void cloudReady.then(() => initGroupPage($('.view[data-view="group"]'), $('.view[data-view="settings"]')));

armTilt();

// ---- ダブルタップ対策 ----
// iPhone のホーム画面アプリでは、何もないところをダブルタップすると画面全体がずれて、
// ボタンの反応する位置までずれてしまうことがある。ボタン以外でのダブルタップを無効にする。
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    const target = e.target instanceof Element ? e.target : null;
    const interactive = target?.closest('button, input, .drum, .presets, .lap-list');
    if (now - lastTouchEnd < 350 && !interactive) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false },
);
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---- 下のメニュー ----

function showView(name: ViewName): void {
  current = name;
  const lit = NAV_OF[name] ?? name;
  views.forEach((v) => v.classList.toggle('active', v.dataset.view === name));
  navButtons.forEach((b) => {
    if (b.dataset.view === lit) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  dots.classList.toggle('hide', name !== 'main');
  if (name === 'stats') renderStats(statsView, true); // メニューから開いたら今週に戻す
  if (name === 'settings') document.dispatchEvent(new CustomEvent('settings:show'));
  if (name === 'group') document.dispatchEvent(new CustomEvent('group:show'));
  if (name === 'style') document.dispatchEvent(new CustomEvent('style:show'));
  if (name === 'event') document.dispatchEvent(new CustomEvent('event:show'));
  if (name === 'my') document.dispatchEvent(new CustomEvent('my:show'));
  updateBadges();
}
document.addEventListener(SHOW_VIEW, (e) => showView((e as CustomEvent<ViewName>).detail));
navButtons.forEach((b) => {
  b.onclick = () => {
    const to = b.dataset.view as ViewName;
    // マイページ（とそこから開いたページ）でもう一度押したら、マイページのいちばん上に戻る
    if (to === 'my' && (current === 'my' || NAV_OF[current] === 'my')) myHome();
    showView(to);
  };
});

// ---- 下のメニューのしるし（受け取れるグミ・新しいお知らせ） ----

function setBadge(view: ViewName, on: boolean): void {
  const b = document.querySelector<HTMLElement>(`nav button[data-view="${view}"]`);
  if (!b) return;
  let dot = b.querySelector('.nav-dot');
  if (on && !dot) b.append((dot = html('<span class="nav-dot" aria-hidden="true"></span>')));
  if (!on) dot?.remove();
  const base = b.getAttribute('aria-label')!.replace(/（.*）$/, '');
  b.setAttribute('aria-label', on ? `${base}（受け取れるものがあります）` : base);
}

function updateBadges(): void {
  try {
    setBadge('event', claimableQuests() + claimableTiers() + unseenNews() > 0);
    setBadge('my', !loginStatus().claimed || claimableAchievements().length > 0);
  } catch (e) {
    console.warn(e);
  }
}
document.addEventListener(GUMI_CHANGE, updateBadges);
// 古参タグなどを受け取ったとき
document.addEventListener(GRANTS_CHANGE, (e) => {
  const got = (e as CustomEvent<string[]>).detail ?? [];
  const t = tagById(got[0]);
  if (t) toast(`「${t.name}」タグを受け取りました！`, { label: '付ける', run: () => void setTag(t.id) });
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') updateBadges(); // 日付が変わったとき
});

// ---- 横スワイプ ----

function updateDots(): void {
  const index = Math.round(pager.scrollLeft / Math.max(1, pager.clientWidth));
  [...dots.children].forEach((d, i) => d.classList.toggle('on', i === index));
}
pager.addEventListener('scroll', updateDots, { passive: true });

// 最初は中央（タイマー）を表示する
pager.scrollLeft = pager.clientWidth;
updateDots();
showView('main');
