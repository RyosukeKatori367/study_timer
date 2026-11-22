import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { initPomodoroPage } from './pages/pomodoro';
import { initSettingsPage } from './pages/settings';
import { renderStats } from './pages/stats';
import { initStopwatchPage } from './pages/stopwatch';
import { initTimerPage } from './pages/timer';
import { initRun } from './run';
import { requestPersistence } from './store';
import { armTilt } from './tilt';
import { $ } from './ui/dom';

type ViewName = 'main' | 'stats' | 'settings';

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
  refreshPomodoro();
  refreshTimer();
  refreshStopwatch();
  if (current === 'stats') renderStats(statsView);
}

initSettingsPage($('.view[data-view="settings"]'), refreshAll);
initRun(refreshAll);

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
  if (name === 'stats') renderStats(statsView);
}
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
