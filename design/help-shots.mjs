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
async function fresh(query = '', extra = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  await p.clock.install();
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
    localStorage.setItem('studytimer:news', '2026-11-28j');
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
  const p = await fresh();
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
  const p = await fresh('?fake=in', { gumi: { b: 4200, 'l:2026-11-27': 120 }, unlocked: ['g:asagata', 'g:shuchu', 'g:keisan', 'g:zone', 'g:kami'] });
  await p.click('nav [data-view=event]');
  await p.waitForTimeout(1500);
  await shot(p, 'event', ['.ev-banner', '.ev-card', '.ev-season']);
  const y = await p.evaluate(() => [...document.querySelectorAll('.ev-card')].at(-1).getBoundingClientRect().top + document.querySelector('.view[data-view=event]').scrollTop - 80);
  await scrollView(p, 'event', y);
  await shot(p, 'event_week', []);
  await scrollView(p, 'event', 0);
  await p.click('[data-seg=quest]');
  await shot(p, 'quest', ['.ev-card', '.ev-card:nth-of-type(2)']);
  await p.click('[data-seg=news]');
  await shot(p, 'news', []);
  // はじまりの演出
  await p.click('[data-seg=event]');
  await p.waitForTimeout(300);
  await p.click('[data-intro]');
  await p.waitForTimeout(3300);
  await shot(p, 'intro', [], { wait: 0 });
  await p.click('.season-intro');
  await p.waitForTimeout(900);

  await p.click('nav [data-view=my]');
  await p.waitForTimeout(900);
  await shot(p, 'my', ['.my-prof', '.login-card', '.my-coin', '.my-grid']);
  await p.click('[data-bonus]');
  await p.waitForTimeout(400);
  await p.click('[data-open=shop]');
  await p.waitForTimeout(800);
  await shot(p, 'shop', ['.gacha-buttons', '[data-rates]', '.exch']);
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
  await shot(p, 'style', ['.style-filter', '.style-section']);
  await p.evaluate(() => {
    const h = [...document.querySelectorAll('.view[data-view=style] .group-head')].find((x) => x.textContent.startsWith('タグ'));
    const v = document.querySelector('.view[data-view=style]');
    v.scrollTo(0, h.getBoundingClientRect().top + v.scrollTop - 70);
  });
  await shot(p, 'style_tags', [], { wait: 600 });
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
