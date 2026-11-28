// 説明書（使い方）のスクリーンショットを撮る。開発サーバー（npm run dev -- --port 5173）を立ててから
//   NODE_PATH=<playwright のある node_modules> node design/help-shots.mjs /tmp/help-raw
// で撮り、design/help-annotate.py で番号の枠を描いて public/help/*.webp にする。
// 偽のデータ（?fake / ?fake=in）で撮るので、本物のアカウントは使わない。

import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = process.argv[2] ?? '/tmp/help-raw';
mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:5173/study_timer/';
const marks = {};
const navs = {};
const errs = [];

const browser = await chromium.launch();

/** 記録・教材・設定を入れた新しい画面 */
const BASE = (() => {
  const d = new Date();
  d.setHours(21, 0, 0, 0);
  return d.getTime();
})();
/** 予定の見本（今日から n 日後の日付で） */
const dk = (n) => {
  const d = new Date(BASE + n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const PLANS = [
  { id: 'p1', d: dk(0), t: '', m: 'm2', a: 8, b: 9, at: 19 * 60, u: 1 },
  { id: 'p2', d: dk(0), t: '単語 50語', m: 'm3', ms: 30 * 60000, u: 1 },
  { id: 'p3', d: dk(0), t: '学校のプリント', u: 1, done: 1 },
  { id: 'p4', d: dk(-1), t: '過去問 2019 大問1', u: 1 },
  { id: 'p5', d: dk(1), t: '', m: 'm2', a: 10, b: 11, u: 1 },
  { id: 'p6', d: dk(2), t: '模試の復習', u: 1 },
  { id: 'p7', d: dk(3), t: '', m: 'm2', a: 12, b: 13, u: 1 },
  { id: 'p8', d: dk(-3), t: '', m: 'm1', a: 220, b: 230, u: 1 },
];

async function fresh(query = '', extra = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  // 時計は今日の21時にそろえる（夜中に撮っても「今日の記録」があるように）
  await p.clock.install({ time: BASE });
  await p.addInitScript((extra) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    const H = 3600000;
    const M = 60000;
    const now = Date.now();
    localStorage.setItem(
      'studytimer:materials',
      JSON.stringify([
        { id: 'm1', name: 'リードα', nextLap: 236, color: '#338ced' },
        { id: 'm2', name: '東進 数学', nextLap: 8, color: '#e76624', unit: '講', genre: '数学' },
        { id: 'm3', name: '鉄壁', nextLap: 412, color: '#00a888', unit: '語', genre: '英語' },
      ]),
    );
    const out = [];
    const day = 86400000;
    for (let d = 13; d >= 1; d--) {
      if (d === 5 || d === 10) continue;
      const t = new Date(now - d * day);
      t.setHours(16, 30, 0, 0);
      const s = t.getTime();
      const n = 3 + (d % 4);
      const laps = Array.from({ length: n }, (_, i) => (9 + ((i * 7 + d) % 8)) * M);
      const ms = laps.reduce((a, b) => a + b, 0);
      out.push({ id: `a${d}`, mode: 'stopwatch', start: s, end: s + ms, studyMs: ms, laps, firstLap: 200 + d * 3, material: 'm1' });
      const s2 = s + 3 * H;
      out.push({ id: `b${d}`, mode: 'timer', start: s2, end: s2 + 80 * M, studyMs: 80 * M, laps: [40 * M, 40 * M], firstLap: 1 + (13 - d), material: 'm2' });
    }
    const today = new Date(now);
    today.setHours(today.getHours() - 3, 0, 0, 0);
    const t0 = today.getTime();
    const tl = [11, 9, 14, 8, 12].map((m) => m * M);
    out.push({ id: 'today1', mode: 'stopwatch', start: t0, end: t0 + 54 * M, studyMs: 54 * M, laps: tl, firstLap: 231, material: 'm1' });
    out.push({ id: 'today2', mode: 'pomoCycle', start: t0 + 70 * M, end: t0 + 125 * M, studyMs: 50 * M, laps: [], firstLap: 1, material: 'm3' });
    localStorage.setItem('studytimer:sessions', JSON.stringify(out));
    localStorage.setItem(
      'studytimer:settings',
      JSON.stringify({ materialId: 'm1', lapEndKind: 'count', lapEndCount: 10, dailyGoalMs: 3 * H, finishHold: false, ...extra }),
    );
    localStorage.setItem('studytimer:seasonIntro', 'c1s1');
    localStorage.setItem('studytimer:news', '2026-11-29c');
  }, extra);
  await p.goto(URL + query);
  await p.waitForTimeout(900);
  return p;
}

/** 撮る。sel の要素に番号の枠（①②…）を付けるために、位置を覚えておく */
async function shot(p, name, sels = [], opts = {}) {
  await p.waitForTimeout(opts.wait ?? 400);
  const boxes = [];
  for (const sel of sels) {
    const el = await p.$(sel);
    const b = el && (await el.boundingBox());
    if (!b) {
      errs.push(`${name}: 見つからない ${sel}`);
      boxes.push(null);
      continue;
    }
    const vw = p.viewportSize();
    if (b.x >= vw.width || b.y >= vw.height || b.x + b.width <= 0 || b.y + b.height <= 0) {
      errs.push(`${name}: 画面の外 ${sel}`);
      boxes.push(null);
      continue;
    }
    boxes.push([b.x, b.y, b.width, b.height]);
  }
  marks[name] = boxes;
  navs[name] = await p.evaluate(() => {
    const n = document.querySelector('nav');
    if (!n) return null;
    const r = n.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit && n.contains(hit) ? r.top : null;
  });
  await p.screenshot({ path: `${OUT}/${name}.png` });
}

const scrollView = (p, view, y) =>
  p.evaluate(([v, y]) => document.querySelector(`.view[data-view=${v}]`).scrollTo(0, y), [view, y]);
const pager = (p, i) =>
  p.evaluate((i) => {
    const g = document.getElementById('pager');
    g.scrollTo({ left: g.clientWidth * i, behavior: 'instant' });
  }, i);

// ---- 時計 ----
{
  const p = await fresh();
  await shot(p, 'nav', ['nav [data-view=stats]', 'nav [data-view=main]', 'nav [data-view=group]', 'nav [data-view=event]', 'nav [data-view=my]']);
  await shot(p, 'timer', [
    '.page[data-mode=timer] .seg',
    '.page[data-mode=timer] .presets',
    '.page[data-mode=timer] .drum-group',
    '.page[data-mode=timer] .material-chip',
    '.page[data-mode=timer] .pick-row > :last-child',
    '.page[data-mode=timer] .prev',
    '.page[data-mode=timer] .lap-pill',
    '.page[data-mode=timer] .btn-start',
    '.help-btn',
  ]);
  await pager(p, 2);
  await shot(p, 'stopwatch', ['#dots', '.page[data-mode=stopwatch] .btn-start'], { wait: 600 });
  await pager(p, 0);
  await shot(p, 'pomodoro', [
    '.page[data-mode=pomodoro] .card[data-field=work]',
    '.page[data-mode=pomodoro] .card[data-field=break]',
    '.page[data-mode=pomodoro] .end',
    '.page[data-mode=pomodoro] .material-chip',
    '.page[data-mode=pomodoro] .plan-chip',
  ], { wait: 600 });
  await pager(p, 1);
  await p.waitForTimeout(500);
  // 計測中
  await p.click('.page[data-mode=timer] .btn-start');
  await p.clock.fastForward('02:12');
  await p.click('.btn-lap');
  await p.clock.fastForward('01:47');
  await p.click('.btn-lap');
  await p.clock.fastForward('00:38');
  await p.waitForTimeout(800);
  await shot(p, 'run', ['.run-cancel', '.run-head', '.ring-wrap', '.run-info', '.btn-finish', '.btn-stop', '.btn-lap', '.lap-list', '.lap-box'].map((s) => `#run ${s}`));
  await p.evaluate(() => (window.confirm = () => true));
  await p.click('.run-cancel');
  await p.waitForTimeout(600);
  await p.clock.fastForward('00:05'); // 「記録せずにやめました」が消えるまで
  await p.waitForTimeout(600);
  // 教材
  await p.click('.page[data-mode=timer] .material-chip');
  await p.waitForTimeout(700);
  await shot(p, 'materials', ['.mrow:nth-of-type(1)', '.mrow [data-edit]', '[data-add]', '[data-sort]']);
  await p.click('.mrow [data-edit]');
  await p.waitForTimeout(700);
  await shot(p, 'material_edit', ['.medit-top', '[name=name]', '[data-genres]', '[data-units]', '[data-colors]']);
  await p.click('[data-back]');
  await p.waitForTimeout(400);
  await p.click('[data-sort]');
  await p.waitForTimeout(500);
  await shot(p, 'material_sort', ['.sort-row .sort-handle', '.sort-genre-btns', '[data-done]']);
  await p.click('[data-done]');
  await p.waitForTimeout(400);
  await p.click('[data-close]');
  await p.waitForTimeout(500);
  // 終了条件
  await p.click('.page[data-mode=timer] .pick-row > :last-child');
  await p.waitForTimeout(700);
  await shot(p, 'end', []);
  await p.context().close();
}

// ---- ポモドーロのセットごとの教材 ----
{
  const p = await fresh('', {
    materialId: 'm2',
    endKind: 'count',
    endCount: 4,
    pomoPlan: [
      { m: 'm2', n: 2 },
      { m: 'm3', n: 1 },
      { m: 'm1', n: 1 },
    ],
  });
  await pager(p, 0);
  await p.waitForTimeout(500);
  await p.click('.page[data-mode=pomodoro] .plan-chip');
  await p.waitForTimeout(600);
  await shot(p, 'pomo_plan', ['#pomoplan .plan-mat', '#pomoplan .stepper', '#pomoplan .plan-rest', '#pomoplan [data-add]']);
  await p.click('#pomoplan .btn.primary');
  await p.waitForTimeout(400);
  await p.click('.page[data-mode=pomodoro] .btn-start');
  await p.clock.fastForward('57:00'); // 2セット目のあとの休憩
  await p.waitForTimeout(800);
  await shot(p, 'run_pomo', ['#run .pm-btn', '#run .pm-next']);
  await p.context().close();
}

// ---- 統計 ----
{
  const p = await fresh('?fake=in', { plans: PLANS });
  await p.click('nav [data-view=stats]');
  await p.waitForTimeout(800);
  await shot(p, 'stats', ['.stat-cards', '.week-nav', '.chart']);
  const y = await p.evaluate(() => document.querySelector('.detail').getBoundingClientRect().top + document.querySelector('.view[data-view=stats]').scrollTop - 70);
  await scrollView(p, 'stats', y);
  await shot(p, 'stats_day', ['.detail-head', '.detail-stats', '.detail-tabs', '.hour-chart']);
  await p.click('.detail-tabs [data-tab=lap]');
  await p.waitForTimeout(400);
  await p.click('.lap-bar');
  await shot(p, 'stats_laps', ['.lap-chart-wrap', '.lap-caption', '.sess-list']);
  const y2 = await p.evaluate(() => {
    const el = document.querySelector('.material-share') ?? document.querySelector('.donut');
    return el ? el.getBoundingClientRect().top + document.querySelector('.view[data-view=stats]').scrollTop - 90 : 1400;
  });
  await scrollView(p, 'stats', y2);
  await shot(p, 'stats_share', []);
  // 時間を入力して記録
  await p.click('.detail-tabs [data-tab=hour]');
  await p.waitForTimeout(400);
  await p.click('[data-manual]');
  await p.waitForTimeout(600);
  await shot(p, 'manual', ['#manual [data-dur]', '#manual [data-material]', '#manual .sns-card:has([data-date])', '#manual [data-save="post"]']);
  await p.click('#manual [data-save=""]');
  await p.waitForTimeout(400);
  // お知らせ（記録しました・勉強ボーナス）が消えるまで
  for (let i = 0; i < 3; i++) {
    await p.clock.fastForward('00:04');
    await p.waitForTimeout(300);
  }
  const y3 = await p.evaluate(() => {
    const el = document.querySelector('[data-del]').closest('.sess');
    return el.getBoundingClientRect().top + document.querySelector('.view[data-view=stats]').scrollTop - 260;
  });
  await scrollView(p, 'stats', y3);
  await shot(p, 'manual_list', ['.sess:has([data-del])']);
  // カレンダー
  await scrollView(p, 'stats', 0);
  await p.click('[data-stats-tab=cal]');
  await p.waitForTimeout(600);
  await shot(p, 'calendar', ['.stats-tabs', '.cal-mode', '.cal-ics']);
  const yc = await p.evaluate(() => document.querySelector('.cal-day').getBoundingClientRect().top + document.querySelector('.view[data-view=stats]').scrollTop - 300);
  await scrollView(p, 'stats', yc);
  await shot(p, 'calendar_day', ['.cal-cell.today', '.cal-day .pl-row', '.cal-day-actions']);
  await scrollView(p, 'stats', 0);
  await p.click('[data-cal-mode=week]');
  await p.waitForTimeout(400);
  const y4 = await p.evaluate(() => document.querySelector('.wk-day.today').getBoundingClientRect().top + document.querySelector('.view[data-view=stats]').scrollTop - 330);
  await scrollView(p, 'stats', y4);
  await shot(p, 'calendar_week', []);
  await p.click('[data-cal-mode=month]');
  await p.waitForTimeout(300);
  await p.click('.cal-day [data-plan-edit=p1]');
  await p.waitForTimeout(500);
  await shot(p, 'plan_edit', ['#plan-edit [data-f=t]', '#plan-edit .sns-card:has([data-material])', '#plan-edit [data-ms]', '#plan-edit .sns-card:has([data-f=d])']);
  await p.click('#plan-edit [data-close]');
  await p.waitForTimeout(300);
  await p.click('.cal-day [data-plan-bulk]');
  await p.waitForTimeout(400);
  await p.click('#plan-bulk [data-material]');
  await p.waitForTimeout(600);
  await p.click('.sheet-panel .sheet-item:has-text("東進 数学"), #materials :text("東進 数学")');
  await p.waitForTimeout(500);
  await p.fill('#plan-bulk [data-f=b]', '20');
  await p.dispatchEvent('#plan-bulk [data-f=b]', 'change');
  await p.click('#plan-bulk [data-per="1"]');
  await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('#plan-bulk').scrollTo(0, 120));
  await shot(p, 'plan_bulk', ['#plan-bulk .pe-range', '#plan-bulk .wd-chips', '#plan-bulk .bulk-preview']);
  await p.context().close();
}

// ---- グループ ----
{
  const g = await fresh('?fake');
  await g.click('nav [data-view=group]');
  await g.waitForTimeout(800);
  await shot(g, 'group_welcome', []);
  await g.context().close();

  const p = await fresh('?fake=in');
  await p.click('nav [data-view=group]');
  await p.waitForTimeout(900);
  await shot(p, 'group_list', ['.view[data-view=group] .sns-card .sns-row', '[data-create]', '[data-join]']);
  await p.click('.view[data-view=group] .sns-card .sns-row');
  await p.waitForTimeout(1000);
  await shot(p, 'group_timeline', ['.sns-head-title', '[data-tab=timeline]', '.post .pills', '.post [data-like]', '.post [data-reply]', '[data-settings]']);
  await p.click('[data-tab=ranking]');
  await p.waitForTimeout(1000);
  await shot(p, 'group_ranking', ['.rank-range, .sns-seg.small', '.rank-row']);
  await p.click('.rank-row');
  await p.waitForTimeout(1000);
  await shot(p, 'group_member', ['.sns-hero', '.stat-grid']);
  await p.click('.view[data-view=group] .sns-back');
  await p.waitForTimeout(800);
  await p.click('[data-tab=chat]');
  await p.waitForTimeout(1000);
  await shot(p, 'group_chat', ['.chat-form']);
  await p.click('[data-settings]');
  await p.waitForTimeout(900);
  await shot(p, 'group_settings', ['[data-code]', '.view[data-view=group] .sns-card .has-tb']);
  // 終えたときの投稿
  await p.click('nav [data-view=main]');
  await p.waitForTimeout(500);
  await pager(p, 2);
  await p.waitForTimeout(400);
  await p.click('.page[data-mode=stopwatch] .btn-start');
  for (const t of ['12:31', '09:44', '14:02']) {
    await p.clock.fastForward(t);
    await p.click('.btn-lap');
  }
  await p.clock.fastForward('00:08');
  await p.click('.btn-finish');
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const b = document.querySelector('[data-post]');
    b?.scrollIntoView({ block: 'end' });
    let el = b?.parentElement;
    while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement;
    el?.scrollBy(0, 20);
  });
  if (await p.$('#compose')) await shot(p, 'compose', ['#compose .group-card', '#compose textarea', '#compose .chip-row', '[data-post]']);
  else errs.push('compose が出ない');
  await p.context().close();
}

// ---- イベント・マイページ ----
{
  const p = await fresh('?fake=in', { gumi: { b: 4200, 'l:2026-11-27': 120 }, unlocked: ['g:asagata', 'g:shuchu', 'g:keisan', 'g:zone', 'g:kami'], plans: PLANS });
  await p.click('nav [data-view=event]');
  await p.waitForTimeout(1500);
  await shot(p, 'event', ['.home-edit', '.login-card', '.home-todo']);
  const yh = await p.evaluate(() => document.querySelector('.home-stats').getBoundingClientRect().top + document.querySelector('.view[data-view=event]').scrollTop - 70);
  await scrollView(p, 'event', yh);
  await shot(p, 'home_more', ['.home-stats', '.home-quest']);
  await scrollView(p, 'event', 0);
  await p.click('[data-home-edit]');
  await p.waitForTimeout(400);
  await shot(p, 'home_edit', ['.home-sort-row:nth-child(2) .home-sort-main', '.home-sort-row:nth-child(2) .sort-handle']);
  await p.click('[data-home-done]');
  await p.waitForTimeout(600);
  // シーズンの箱を開く
  await p.click('[data-box=season]');
  await p.waitForTimeout(900);
  const y0 = await p.evaluate(() => document.querySelector('.rk-list').closest('.ev-card').getBoundingClientRect().top + document.querySelector('.view[data-view=event]').scrollTop - 70);
  await scrollView(p, 'event', y0);
  await shot(p, 'event_open', ['.rk-list', '.rk-opt', '.season-body .lim-entry']);
  await p.click('[data-box=season]');
  await p.waitForTimeout(400);
  // 今週の箱を開く
  await p.click('[data-box=week]');
  await p.waitForTimeout(500);
  const y = await p.evaluate(() => document.querySelector('.week-box').getBoundingClientRect().top + document.querySelector('.view[data-view=event]').scrollTop - 80);
  await scrollView(p, 'event', y);
  await shot(p, 'event_week', []);
  await p.click('[data-box=week]');
  await scrollView(p, 'event', 0);
  await p.click('.home-news [data-open-news]');
  await p.waitForTimeout(400);
  await shot(p, 'news', []);
  await p.click('#news-page [data-close]');
  await p.waitForTimeout(300);
  // はじまりの演出
  await p.click('[data-box=season]');
  await p.waitForTimeout(500);
  await p.click('[data-intro]');
  await p.waitForTimeout(3300);
  await shot(p, 'intro', [], { wait: 0 });
  await p.click('.season-intro');
  await p.waitForTimeout(900);

  await p.click('nav [data-view=my]');
  await p.waitForTimeout(900);
  await shot(p, 'my', ['.my-prof', '.my-coin', '.my-grid']);
  await p.click('[data-open=shop]');
  await p.waitForTimeout(800);
  await shot(p, 'shop', ['.view[data-view=my] .lim-entry', '.shop-gacha .gacha-buttons', '[data-rates]']);
  await p.click('[data-draw="10"]');
  await p.waitForTimeout(2100);
  await p.click('#gacha');
  await p.waitForTimeout(1500);
  await shot(p, 'gacha', []);
  await p.click('#gacha [data-close]');
  await p.waitForTimeout(500);
  await p.click('.view[data-view=my] [data-back]');
  await p.waitForTimeout(400);
  await p.click('[data-open=ach]');
  await p.waitForTimeout(700);
  await shot(p, 'ach', ['[data-all]', '.ach-tag']);
  await p.click('.view[data-view=my] [data-back]');
  await p.waitForTimeout(400);
  await p.click('[data-open=style]');
  await p.waitForTimeout(900);
  await p.evaluate(() => localStorage.removeItem('studytimer:styleopen'));
  await p.waitForTimeout(300);
  await shot(p, 'style', ['.style-filter', '.sec-toggle[data-sec=face]', '.sec-toggle[data-sec=theme]']);
  await p.click('[data-sec=tag]');
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    const h = document.querySelector('.sec-toggle[data-sec=tag]');
    const v = document.querySelector('.view[data-view=style]');
    v.scrollTo(0, h.getBoundingClientRect().top + v.scrollTop - 70);
  });
  await shot(p, 'style_tags', [], { wait: 600 });
  await p.click('[data-sec=tag]');
  await p.evaluate(() => document.querySelector('.view[data-view=style]').scrollTo(0, 0));
  await p.click('.view[data-view=style] .view-back');
  await p.waitForTimeout(400);
  await p.click('[data-open=settings]');
  await p.waitForTimeout(800);
  await shot(p, 'settings', []);
  await p.context().close();
}

writeFileSync(`${OUT}/navs.json`, JSON.stringify(navs));
writeFileSync(`${OUT}/marks.json`, JSON.stringify(marks));
console.log(errs.join('\n') || 'no errors');
await browser.close();
