// グループのメンバーの統計（ランキング・メンバー一覧・投稿のアイコンから開く）。
// 見られるのは、メンバー文書にある直近2週間の日ごと・教材ごとの時間と、今月・先月・累計。

import { api } from '../../cloud/api';
import { rankKeys, type Member } from '../../cloud/groups';
import { matBreakdown, sumDays, weekKeys, type MatSlice } from '../../cloud/model';
import { settings } from '../../store';
import { fmtHM } from '../../time';
import { columnsHtml, donutHtml } from '../../ui/charts';
import { $, esc, html } from '../../ui/dom';
import { avatar, header, nameHtml, type Nav, type Screen } from './ui';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const DAY = 24 * 60 * 60 * 1000;

/** '2026-11-27' → { label: '11/27', sub: '金' } */
function dayLabel(key: string): { label: string; sub: string } {
  const [y, m, d] = key.split('-').map(Number);
  return { label: `${m}/${d}`, sub: WEEKDAYS[new Date(y, m - 1, d).getDay()] };
}

export async function memberScreen(_nav: Nav, gid: string, uid: string): Promise<Screen> {
  let member: Member | null = null;
  let ownerId = '';
  /** 0 = 今週、1 = 先週（メンバー文書には2週間分しかない） */
  let week = 0;
  const el = html(`
    <div class="sns">
      ${header('統計', { back: true })}
      <div data-body><div class="sns-loading">読み込んでいます…</div></div>
    </div>`);
  const body = $('[data-body]', el);

  const render = () => {
    const m = member;
    if (!m) {
      body.innerHTML = '<div class="sns-error">このメンバーはグループにいません</div>';
      return;
    }
    const now = Date.now();
    const opt = { boundaryMin: settings.dayBoundaryMin, weekStartsOn: settings.weekStartsOn };
    const today = rankKeys(now).today;
    const keys = weekKeys(now - week * 7 * DAY, opt);
    const month = today[0].slice(0, 7);
    const weekName = week === 0 ? '今週' : '先週';

    // 教材の積む順は、その週に多かった順（いちばん多い教材をいちばん下に）
    const parts = matBreakdown(m, keys);
    const order = new Map(parts.map((p, i) => [p.key, i]));
    const cols = keys.map((k) => {
      const day = matBreakdown(m, [k]);
      return {
        ...dayLabel(k),
        mark: k === today[0],
        segs: day
          .sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99))
          .map((s: MatSlice) => ({ ms: s.ms, color: s.c })),
      };
    });
    const first = dayLabel(keys[0]).label;
    const last = dayLabel(keys[6]).label;

    body.innerHTML = `
      <div class="sns">
        <div class="sns-card sns-hero" style="padding:20px 16px">
          ${avatar(m.icon, 64)}
          <div class="sns-row-title" style="font-size:18px;justify-content:center">${nameHtml(m.uid, m.name, { owner: m.uid === ownerId, tag: m.tag })}</div>
        </div>
        <div class="stat-grid">
          <div><span class="label">今日</span><span class="value">${esc(fmtHM(sumDays(m.days, today)))}</span></div>
          <div><span class="label">今週</span><span class="value">${esc(fmtHM(sumDays(m.days, weekKeys(now, opt))))}</span></div>
          <div><span class="label">今月</span><span class="value">${m.sums ? esc(fmtHM(m.sums.months[month] ?? 0)) : '—'}</span></div>
          <div><span class="label">累計</span><span class="value">${m.sums ? esc(fmtHM(m.sums.all)) : '—'}</span></div>
        </div>
        <div class="sns-card sns-section">
          <div class="sns-section-head">
            <span>学習推移</span>
            <span class="week-switch">
              <button type="button" data-week="1" aria-label="先週"${week === 1 ? ' disabled' : ''}>‹</button>
              <span>${weekName} ${esc(first)}〜${esc(last)}</span>
              <button type="button" data-week="0" aria-label="今週"${week === 0 ? ' disabled' : ''}>›</button>
            </span>
          </div>
          ${columnsHtml(cols, settings.durationStyle)}
        </div>
        <div class="sns-card sns-section">
          <div class="sns-section-head"><span>${weekName}の教材の割合</span></div>
          ${
            parts.length
              ? donutHtml(
                  parts.map((p) => ({ ms: p.ms, color: p.c, label: p.n, img: m.matImgs?.[p.key] })),
                  weekName,
                )
              : `<div class="sns-lead">${weekName}の記録はまだありません</div>`
          }
        </div>
        <p class="sns-note">グループで見られるのは、直近2週間の日ごとの時間と、今月・累計です。色はこの人の教材の色です</p>
      </div>`;
    body.querySelectorAll<HTMLElement>('[data-week]').forEach((b) => {
      b.onclick = () => {
        week = Number(b.dataset.week);
        render();
      };
    });
  };

  const stops = await Promise.all([
    api.watchGroup(gid, (g) => {
      ownerId = g?.ownerId ?? '';
      render();
    }),
    api.watchMembers(gid, (list) => {
      member = list.find((x) => x.uid === uid) ?? null;
      if (member) $('.sns-head-title', el).textContent = `${member.name}の統計`;
      render();
    }),
  ]);
  return { el, dispose: () => stops.forEach((s) => s()) };
}
