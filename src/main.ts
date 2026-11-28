import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { initPomodoroPage } from './pages/pomodoro';
import { initSettingsPage } from './pages/settings';
import { renderStats } from './pages/stats';
import { initStopwatchPage } from './pages/stopwatch';
import { initTimerPage } from './pages/timer';
import { initCloud } from './cloud';
import { api, setApi } from './cloud/api';
import { SHOW_VIEW, initGroupPage } from './pages/group';
import { initRun } from './run';
import { initStylePage } from './pages/style';
import { applyStyle } from './styles';
import { requestPersistence } from './store';
import { armTilt } from './tilt';
import { $ } from './ui/dom';

type ViewName = 'main' | 'stats' | 'group' | 'style' | 'settings';

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
}

initSettingsPage($('.view[data-view="settings"]'), refreshAll);
initStylePage($('.view[data-view="style"]'));
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
  views.forEach((v) => v.classList.toggle('active', v.dataset.view === name));
  navButtons.forEach((b) => {
    if (b.dataset.view === name) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  dots.classList.toggle('hide', name !== 'main');
  if (name === 'stats') renderStats(statsView, true); // メニューから開いたら今週に戻す
  if (name === 'settings') document.dispatchEvent(new CustomEvent('settings:show'));
  if (name === 'group') document.dispatchEvent(new CustomEvent('group:show'));
  if (name === 'style') document.dispatchEvent(new CustomEvent('style:show'));
}
document.addEventListener(SHOW_VIEW, (e) => showView((e as CustomEvent<ViewName>).detail));
navButtons.forEach((b) => {
  b.onclick = () => showView(b.dataset.view as ViewName);
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
