// 統計タブの「カレンダー」。月と週の表示。
// 過ぎた日は勉強時間（色の濃さ）、先の日は予定（点）。日を押すと、その日の勉強時間と予定が下に出る。

import { addDaysKey, dateOf, dayTotal, keyOf, toIcs, weekStartKey, type Plan } from '../plans';
import { dayPlans, livePlans, planSub, planTitle, putPlans, statusOf, studyMap, toggleDone, todayKey } from '../planbook';
import { settings } from '../store';
import { fmtShort } from '../summary';
import { HOUR, fmtHM } from '../time';
import { esc } from '../ui/dom';
import { pickList } from '../ui/sheet';
import { toast } from '../ui/toast';
import { materialThumb } from './material';
import { dayLabel, openPlanBulk, openPlanEdit } from './plan-edit';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

type CalMode = 'month' | 'week';
let mode: CalMode = 'month';
/** 見ている月の1日・見ている週の始まり（null なら今日の月・週） */
let anchor: string | null = null;
/** 選んでいる日（null なら今日） */
let picked: string | null = null;

/** ホームなどから、その日を選んだ状態で開く */
export function setCalendarDay(key: string, m: CalMode = mode): void {
  mode = m;
  picked = key;
  anchor = null;
}

const monthStart = (key: string) => `${key.slice(0, 8)}01`;
const md = (key: string) => {
  const d = dateOf(key);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/** 1日の勉強時間の色の濃さ（目標があれば目標に対して、なければ 1・2・4時間で区切る） */
function level(ms: number): number {
  if (ms < 60000) return 0;
  const goal = settings.dailyGoalMs;
  if (goal > 0) return ms >= goal ? 4 : ms >= goal * 0.66 ? 3 : ms >= goal * 0.33 ? 2 : 1;
  return ms >= 4 * HOUR ? 4 : ms >= 2 * HOUR ? 3 : ms >= HOUR ? 2 : 1;
}

/** 予定1行（済みのチェック・名前・時刻や進み具合） */
export function planRow(p: Plan, opts: { today?: string; showDate?: boolean } = {}): string {
  const st = statusOf(p);
  const late = opts.today !== undefined && p.d < opts.today && !st.done;
  const sub = [opts.showDate ? `${md(p.d)}${late ? 'の残り' : ''}` : '', planSub(p, st)].filter(Boolean).join('・');
  return `
    <div class="pl-row${st.done ? ' done' : ''}${late ? ' late' : ''}">
      <button type="button" class="pl-check" data-plan-done="${esc(p.id)}" aria-pressed="${st.done}" aria-label="${st.done ? '済み' : '済みにする'}"${
        st.auto ? ' data-auto' : ''
      }>${st.done ? '✓' : ''}</button>
      <button type="button" class="pl-main" data-plan-edit="${esc(p.id)}">
        ${p.m ? materialThumb(p.m, 26) : ''}
        <span class="pl-text"><span class="pl-title">${esc(planTitle(p))}</span>${sub ? `<span class="pl-sub">${esc(sub)}</span>` : ''}</span>
      </button>
    </div>`;
}

/** 予定の行のボタン（済み・編集）をつなぐ */
export function bindPlanRows(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-plan-done]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.planDone!;
      if (b.hasAttribute('data-auto')) return toast('記録から自動で済みになっています');
      toggleDone(id);
    };
  });
  root.querySelectorAll<HTMLElement>('[data-plan-edit]').forEach((b) => {
    b.onclick = () => openPlanEdit({ id: b.dataset.planEdit });
  });
  root.querySelectorAll<HTMLElement>('[data-plan-add]').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      openPlanEdit({ day: b.dataset.planAdd });
    };
  });
  root.querySelectorAll<HTMLElement>('[data-plan-bulk]').forEach((b) => {
    b.onclick = () => openPlanBulk(b.dataset.planBulk);
  });
}

function monthHtml(today: string, sel: string): string {
  const first = anchor ?? monthStart(sel);
  const d0 = dateOf(first);
  const nextMonth = keyOf(new Date(d0.getFullYear(), d0.getMonth() + 1, 1));
  const gridStart = weekStartKey(first, settings.weekStartsOn);
  const by = studyMap();
  const plans = livePlans();
  const byDay = new Map<string, Plan[]>();
  for (const p of plans) {
    if (p.d < gridStart) continue;
    const l = byDay.get(p.d);
    if (l) l.push(p);
    else byDay.set(p.d, [p]);
  }
  const heads = Array.from({ length: 7 }, (_, i) => {
    const w = (settings.weekStartsOn + i) % 7;
    return `<span class="cal-wd${w === 0 ? ' sun' : w === 6 ? ' sat' : ''}">${WEEKDAYS[w]}</span>`;
  }).join('');
  const cells: string[] = [];
  for (let k = gridStart; k < nextMonth || cells.length % 7 !== 0; k = addDaysKey(k, 1)) {
    const ms = k <= today ? dayTotal(by, k) : 0;
    const list = byDay.get(k) ?? [];
    const dots = list
      .slice(0, 4)
      .map((p) => `<i${statusOf(p, by).done ? ' class="done"' : k < today ? ' class="late"' : ''}></i>`)
      .join('');
    const cls = ['cal-cell', `lv${level(ms)}`, k < first || k >= nextMonth ? 'out' : '', k === today ? 'today' : '', k === sel ? 'sel' : '']
      .filter(Boolean)
      .join(' ');
    cells.push(`
      <button type="button" class="${cls}" data-cal-day="${k}" aria-label="${dayLabel(k)}${ms ? ` ${fmtHM(ms)}` : ''}${list.length ? ` 予定${list.length}件` : ''}">
        <span class="cal-num">${dateOf(k).getDate()}</span>
        ${ms >= 60000 ? `<span class="cal-ms">${fmtShort(ms, settings.durationStyle)}</span>` : ''}
        ${dots ? `<span class="cal-dots">${dots}</span>` : ''}
      </button>`);
    if (cells.length > 42) break;
  }
  const monthMs = [...by.entries()].filter(([k]) => k >= first && k < nextMonth).reduce((a, [k]) => a + dayTotal(by, k), 0);
  return `
    <div class="week-nav cal-nav">
      <button type="button" data-cal-move="-1" aria-label="前の月">‹</button>
      <span><b>${d0.getFullYear()}年${d0.getMonth() + 1}月</b>${monthMs ? fmtHM(monthMs) : ''}</span>
      <button type="button" data-cal-move="1" aria-label="次の月">›</button>
    </div>
    <div class="cal-grid">${heads}${cells.join('')}</div>
    ${dayPanel(sel, today)}`;
}

/** 選んだ日の勉強時間と予定 */
function dayPanel(key: string, today: string): string {
  const ms = key <= today ? dayTotal(studyMap(), key) : 0;
  const list = dayPlans(key);
  return `
    <section class="sns-card cal-day">
      <div class="cal-day-head">
        <span class="cal-day-date">${dayLabel(key)}${key === today ? '<small>今日</small>' : ''}</span>
        ${key <= today ? `<button type="button" class="cal-day-ms" data-cal-stats="${key}">${ms ? fmtHM(ms) : '記録なし'}<span class="chevron">›</span></button>` : ''}
      </div>
      ${list.length ? list.map((p) => planRow(p, { today })).join('') : '<p class="cal-empty">予定はありません</p>'}
      <div class="cal-day-actions">
        <button type="button" class="btn dark small" data-plan-add="${key}">＋ 予定を追加</button>
        <button type="button" class="btn ghost small" data-plan-bulk="${key}">まとめて登録</button>
      </div>
    </section>`;
}

function weekHtml(today: string, sel: string): string {
  const start = anchor ?? weekStartKey(sel, settings.weekStartsOn);
  const by = studyMap();
  const days = Array.from({ length: 7 }, (_, i) => addDaysKey(start, i));
  const all = days.flatMap((k) => dayPlans(k));
  const doneN = all.filter((p) => statusOf(p, by).done).length;
  const weekMs = days.reduce((a, k) => a + (k <= today ? dayTotal(by, k) : 0), 0);
  const scale = Math.max(settings.dailyGoalMs || 0, ...days.map((k) => dayTotal(by, k)), 2 * HOUR);
  const rows = days
    .map((k) => {
      const ms = k <= today ? dayTotal(by, k) : 0;
      const list = dayPlans(k);
      const w = dateOf(k).getDay();
      return `
        <section class="sns-card wk-day${k === today ? ' today' : ''}${k < today ? ' past' : ''}">
          <div class="wk-head">
            <span class="wk-date${w === 0 ? ' sun' : w === 6 ? ' sat' : ''}"><small>${WEEKDAYS[w]}</small><b>${dateOf(k).getDate()}</b></span>
            ${
              k <= today
                ? `<button type="button" class="wk-study" data-cal-stats="${k}" aria-label="${dayLabel(k)}の統計">
                     <span class="wk-bar"><i style="width:${Math.min(100, (ms / scale) * 100).toFixed(1)}%"></i></span>
                     <span class="wk-ms">${ms >= 60000 ? fmtShort(ms, settings.durationStyle) : '—'}</span>
                   </button>`
                : '<span class="wk-study future"></span>'
            }
            <button type="button" class="wk-add" data-plan-add="${k}" aria-label="${dayLabel(k)}に予定を追加">＋</button>
          </div>
          ${list.map((p) => planRow(p, { today })).join('')}
        </section>`;
    })
    .join('');
  return `
    <div class="week-nav cal-nav">
      <button type="button" data-cal-move="-1" aria-label="前の週">‹</button>
      <span><b>${md(days[0])}〜${md(days[6])}</b>${weekMs ? fmtHM(weekMs) : ''}</span>
      <button type="button" data-cal-move="1" aria-label="次の週">›</button>
    </div>
    <div class="wk-sum">${all.length ? `予定 ${doneN}/${all.length} 済み` : '予定はまだありません'}<button type="button" class="btn ghost small" data-plan-bulk="${days[0] < today ? today : days[0]}">まとめて登録</button></div>
    <div class="wk-list">${rows}</div>`;
}

export function calendarHtml(): string {
  const today = todayKey();
  const sel = picked ?? today;
  const away = mode === 'month' ? (anchor ?? monthStart(sel)) !== monthStart(today) : (anchor ?? weekStartKey(sel, settings.weekStartsOn)) !== weekStartKey(today, settings.weekStartsOn);
  return `
    <div class="cal-top">
      <div class="seg cal-mode" role="group" aria-label="表示">
        <button type="button" data-cal-mode="month" aria-pressed="${mode === 'month'}">月</button>
        <button type="button" data-cal-mode="week" aria-pressed="${mode === 'week'}">週</button>
      </div>
      ${away || sel !== today ? '<button type="button" class="cal-today" data-cal-today>今日</button>' : ''}
      <button type="button" class="cal-ics" data-ics aria-label="iPhoneのカレンダーに入れる">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5 12 18l2.5-2.5"/></svg>
      </button>
    </div>
    ${mode === 'month' ? monthHtml(today, sel) : weekHtml(today, sel)}`;
}

/** iPhone のカレンダーに入れる（.ics を開く） */
async function exportIcs(): Promise<void> {
  const today = todayKey();
  const by = studyMap();
  const coming = livePlans().filter((p) => p.d >= today && !statusOf(p, by).done);
  const fresh = coming.filter((p) => !p.x || p.x < p.u - 1000);
  if (!coming.length) return void toast('これから先の、済んでいない予定がありません');
  const i = await pickList('iPhoneのカレンダーに入れる', [
    { label: `まだ入れていない予定（${fresh.length}件）`, sub: '2回入れると、カレンダーに同じ予定が2つできます' },
    { label: `これから先の予定を全部（${coming.length}件）` },
  ]);
  if (i === null) return;
  const list = i === 0 ? fresh : coming;
  if (!list.length) return void toast('まだ入れていない予定はありません');
  const text = toIcs(list, planTitle);
  // .ics をダウンロードして開くと「すべてを追加」が出る。開けなかったときは共有から
  const file = new File([text], 'gumiben.ics', { type: 'text/calendar' });
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'gumiben.ics';
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  const now = Date.now();
  putPlans(list.map((p) => ({ ...p, x: now + 2000 })));
  toast(`${list.length}件を書き出しました。ファイルを開いて「すべてを追加」でカレンダーに入ります`, {
    label: '開かないとき',
    run: () => {
      if (navigator.canShare?.({ files: [file] })) void navigator.share({ files: [file] }).catch(() => undefined);
      else toast('この端末では書き出せませんでした');
    },
  });
}

/** カレンダーのボタンをつなぐ。rerender で描き直し、openStatsDay でその日の統計へ */
export function bindCalendar(root: HTMLElement, rerender: () => void, openStatsDay: (key: string) => void): void {
  root.querySelectorAll<HTMLElement>('[data-cal-mode]').forEach((b) => {
    b.onclick = () => {
      mode = b.dataset.calMode as CalMode;
      anchor = null;
      rerender();
    };
  });
  root.querySelector<HTMLElement>('[data-cal-today]')?.addEventListener('click', () => {
    anchor = null;
    picked = null;
    rerender();
  });
  root.querySelectorAll<HTMLElement>('[data-cal-move]').forEach((b) => {
    b.onclick = () => {
      const n = Number(b.dataset.calMove);
      const sel = picked ?? todayKey();
      if (mode === 'month') {
        const d = dateOf(anchor ?? monthStart(sel));
        anchor = keyOf(new Date(d.getFullYear(), d.getMonth() + n, 1));
        // 選んでいる日も、その月に合わせる（今日のある月なら今日）
        const t = todayKey();
        picked = monthStart(t) === anchor ? t : anchor;
      } else {
        anchor = addDaysKey(anchor ?? weekStartKey(sel, settings.weekStartsOn), 7 * n);
        picked = null;
      }
      rerender();
    };
  });
  root.querySelectorAll<HTMLElement>('[data-cal-day]').forEach((b) => {
    b.onclick = () => {
      picked = b.dataset.calDay!;
      if (mode === 'month' && (anchor ?? '') !== monthStart(picked)) anchor = monthStart(picked);
      rerender();
    };
  });
  root.querySelectorAll<HTMLElement>('[data-cal-stats]').forEach((b) => {
    b.onclick = () => openStatsDay(b.dataset.calStats!);
  });
  root.querySelector<HTMLElement>('[data-ics]')?.addEventListener('click', () => void exportIcs());
  bindPlanRows(root);
}

