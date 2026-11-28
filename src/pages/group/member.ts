// グループのメンバーの統計（ランキング・メンバー一覧・投稿のアイコンから開く）。
// 見られるのは、メンバー文書にある直近2週間の日ごと・教材ごとの時間と、今月・先月・累計。

import { api } from '../../cloud/api';
import { bannerHtml, paintBanners } from '../banner';
import { rankKeys, type Member } from '../../cloud/groups';
import { matBreakdown, sumDays, weekKeys, type MatSlice } from '../../cloud/model';
import { activeMaterials, addMaterial, settings } from '../../store';
import { toast } from '../../ui/toast';
import { MATERIAL_CHANGE } from '../material';
import { fmtHM } from '../../time';
import { columnsHtml, donutHtml } from '../../ui/charts';
import { $, esc, html } from '../../ui/dom';
import { avatar, header, nameHtml, type Nav, type Screen } from './ui';

/** その人の直近2週間の教材（名前と色。教材なしは除く） */
function theirMaterials(m: Member): { key: string; n: string; c: string }[] {
  const out = new Map<string, { key: string; n: string; c: string }>();
  for (const day of Object.values(m.mats ?? {})) {
    for (const [key, v] of Object.entries(day)) {
      if (key === '_' || !v?.n || v.n === '教材なし' || out.has(key)) continue;
      out.set(key, { key, n: v.n, c: v.c });
    }
  }
  return [...out.values()];
}

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
        <div class="sns-card sns-hero has-tb" style="padding:20px 16px">
          ${bannerHtml(m.style, true)}
          ${avatar(m.icon, 64)}
          <div class="sns-row-title" style="font-size:18px;justify-content:center">${nameHtml(m.uid, m.name, { owner: m.uid === ownerId, tag: m.tag })}</div>
          ${m.goal ? `<div class="mem-goal">🎯 ${esc(m.goal)}</div>` : ''}
          ${m.bio ? `<div class="mem-bio">${esc(m.bio)}</div>` : ''}
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
        ${
          m.uid === api.user()?.uid
            ? ''
            : (() => {
                const list = theirMaterials(m);
                if (!list.length) return '';
                const have = new Set(activeMaterials().map((x) => x.name));
                return `
        <div class="sns-card sns-section">
          <div class="sns-section-head"><span>この人の教材</span><span class="sns-row-sub">直近2週間</span></div>
          ${list
            .map(
              (x) => `
            <div class="mem-mat">
              ${
                m.matImgs?.[x.key]
                  ? `<span class="mthumb" style="--s:32px"><img src="${esc(m.matImgs[x.key])}" alt=""></span>`
                  : `<span class="mthumb" style="--s:32px;background:${esc(x.c)}"><span>${esc([...x.n][0] ?? '')}</span></span>`
              }
              <span class="mem-mat-name">${esc(x.n)}</span>
              ${
                have.has(x.n)
                  ? '<span class="mem-mat-have">追加ずみ</span>'
                  : `<button type="button" class="btn dark small mem-mat-add" data-add-mat="${esc(x.key)}">＋ 自分の教材に</button>`
              }
            </div>`,
            )
            .join('')}
        </div>`;
              })()
        }
        <p class="sns-note">グループで見られるのは、直近2週間の日ごとの時間と、今月・累計です。色はこの人の教材の色です</p>
      </div>`;
    paintBanners(body);
    body.querySelectorAll<HTMLElement>('[data-add-mat]').forEach((b) => {
      b.onclick = () => {
        const x = theirMaterials(m).find((y) => y.key === b.dataset.addMat);
        if (!x) return;
        const img = m.matImgs?.[x.key];
        addMaterial(x.n, { ...(img ? { img } : {}) });
        document.dispatchEvent(new CustomEvent(MATERIAL_CHANGE));
        toast(`「${x.n}」を自分の教材に追加しました（番号は1から）`);
        render();
      };
    });
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
