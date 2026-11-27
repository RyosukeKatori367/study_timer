// 統計画面。週の棒グラフ（日ごとの時間・ラップの区切り・目標線）と、
// タップした日の詳細（ラップごとの棒グラフ・記録の一覧）。

import type { Mode, Session } from '../engine';
import { getSessions, materialName, settings } from '../store';
import { addDays, chartAxis, dayDetail, fmtAxis, fmtShort, summarize } from '../summary';
import { fmtHM, fmtLap, pad2 } from '../time';
import { esc } from '../ui/dom';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const PLOT_H = 120; // 棒の部分の高さ(px)
const LABEL_H = 34; // 曜日・日付の部分の高さ(px)
/** 平均のこの倍以上かかったラップを赤にする */
const LONG_LAP = 1.5;

/** 何週前を見ているか（0 = 今週） */
let weekOffset = 0;
/** 詳細を出している日（週の中の何日目）。null なら自動で決める */
let selected: number | null = null;

const MODE_NAMES: Record<Mode, string> = {
  timer: 'タイマー（カウントダウン）',
  timerUp: 'タイマー（カウントアップ）',
  stopwatch: 'ストップウォッチ',
  pomoCycle: 'ポモドーロ',
};

const fmtDate = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
};
const fmtClock = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getHours()}:${pad2(d.getMinutes())}`;
};
const fmtMD = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/** 目標の進み具合（目標がなければ空） */
function goalHtml(ms: number): string {
  const goal = settings.dailyGoalMs;
  if (goal <= 0) return '';
  const rate = Math.min(1, ms / goal);
  const done = ms >= goal;
  return `
    <div class="goal${done ? ' done' : ''}">
      <div class="goal-bar"><div style="width:${(rate * 100).toFixed(1)}%"></div></div>
      <div class="goal-text">${done ? '目標達成' : `目標 ${fmtHM(goal)}・${Math.floor((ms / goal) * 100)}%`}</div>
    </div>`;
}

function sessionHtml(s: Session): string {
  const parts = s.material ? [materialName(s.material), MODE_NAMES[s.mode]] : [MODE_NAMES[s.mode]];
  if (s.laps.length > 0) {
    const last = s.firstLap + s.laps.length - 1;
    parts.push(s.laps.length === 1 ? `${s.firstLap}番` : `${s.firstLap}〜${last}番`);
    parts.push(`${s.laps.length}ラップ`);
    if (s.laps.length > 1) parts.push(`平均${fmtLap(s.studyMs / s.laps.length)}`);
  }
  return `
    <div class="sess">
      <div class="sess-top"><span>${fmtClock(s.start)}〜${fmtClock(s.end)}</span><span>${fmtHM(s.studyMs)}</span></div>
      <div class="sess-sub">${esc(parts.join(' · '))}</div>
    </div>`;
}

/** 選んだ日の詳細 */
function detailHtml(start: number, sessions: Session[]): string {
  const d = dayDetail(sessions);
  const head = `
    <div class="detail-head">
      <span class="detail-date">${fmtDate(start)}</span>
      <span class="detail-total">${fmtHM(d.totalMs)}</span>
    </div>
    ${goalHtml(d.totalMs)}`;
  if (sessions.length === 0) {
    return `<section class="detail" aria-label="${fmtDate(start)}の詳細">${head}<div class="empty">この日の記録はありません</div></section>`;
  }

  const stats = `
    <div class="detail-stats">
      <div><span class="label">記録</span><span class="value">${sessions.length}回</span></div>
      <div><span class="label">ラップ</span><span class="value">${d.laps.length}</span></div>
      <div><span class="label">平均</span><span class="value">${d.lapAvgMs === null ? '—' : fmtLap(d.lapAvgMs)}</span></div>
      <div><span class="label">最長</span><span class="value">${d.lapMaxMs === null ? '—' : fmtLap(d.lapMaxMs)}</span></div>
    </div>`;

  let laps = '';
  if (d.laps.length > 0 && d.lapMaxMs && d.lapAvgMs) {
    const max = d.lapMaxMs;
    const avg = d.lapAvgMs;
    const bars = d.laps
      .map((l, i) => {
        const long = d.laps.length >= 3 && l.ms >= avg * LONG_LAP;
        // 記録が変わるところ（別の回）は少し間を空ける
        const gap = i > 0 && d.laps[i - 1].session !== l.session ? ' gap' : '';
        return `<button type="button" class="lap-bar${long ? ' long' : ''}${gap}" style="height:${Math.max(2, (l.ms / max) * 100).toFixed(1)}%"
          data-i="${i}" aria-label="${l.no}番 ${fmtLap(l.ms)}"></button>`;
      })
      .join('');
    laps = `
      <div class="lap-chart-head">ラップごとの時間</div>
      <div class="lap-chart-wrap">
        <div class="avg-line" style="bottom:${((avg / max) * 100).toFixed(1)}%"><span>平均</span></div>
        <div class="lap-chart">${bars}</div>
      </div>
      ${
        // 番号の範囲は、1つの教材だけの日に出す（教材が混ざると番号が続かない）
        new Set(sessions.filter((x) => x.laps.length > 0).map((x) => x.material ?? '')).size === 1
          ? `<div class="lap-range"><span>${d.laps[0].no}番</span><span>${d.laps[d.laps.length - 1].no}番</span></div>`
          : ''
      }
      <div class="lap-caption">棒をタップすると、そのラップの時間が出ます</div>
      <div class="lap-legend">点線は平均。平均の1.5倍以上かかったラップは赤</div>`;
  }

  return `
    <section class="detail" aria-label="${fmtDate(start)}の詳細">
      ${head}${stats}${laps}
      <div class="sess-list">${sessions.map(sessionHtml).join('')}</div>
    </section>`;
}

/** 教材ごとの内訳（教材を付けた記録がある週だけ出す） */
function materialsHtml(sessions: Session[], weekLabel: string): string {
  if (!sessions.some((s) => s.material)) return '';
  const totals = new Map<string, { ms: number; laps: number }>();
  for (const s of sessions) {
    const key = s.material ?? '';
    const t = totals.get(key) ?? { ms: 0, laps: 0 };
    t.ms += s.studyMs;
    t.laps += s.laps.length;
    totals.set(key, t);
  }
  const rows = [...totals.entries()]
    .sort((a, b) => b[1].ms - a[1].ms)
    .map(
      ([id, t]) =>
        `<div class="list-row"><span>${esc(materialName(id || null))}</span><span>${t.laps > 0 ? `<small>${t.laps}ラップ</small>` : ''}${fmtHM(t.ms)}</span></div>`,
    )
    .join('');
  return `<div class="list"><div class="section-label">${weekLabel}の教材ごとの内訳</div>${rows}</div>`;
}

/** reset = true のときは今週に戻す（下のメニューから開いたとき） */
export function renderStats(view: HTMLElement, reset = false): void {
  if (reset) {
    weekOffset = 0;
    selected = null;
  }
  const now = Date.now();
  const opts = { boundaryMin: settings.dayBoundaryMin, weekStartsOn: settings.weekStartsOn };
  const thisWeek = summarize(getSessions(), now, opts);
  const s =
    weekOffset === 0
      ? thisWeek
      : summarize(getSessions(), now, { ...opts, ref: addDays(thisWeek.weekStart, -7 * weekOffset, opts.boundaryMin) });
  const style = settings.durationStyle;

  // 詳細を出す日: 選んだ日、なければ今日、今週でなければ記録のある最後の日
  if (selected === null) {
    let last = -1;
    s.days.forEach((ms, i) => {
      if (ms > 0) last = i;
    });
    selected = s.todayIndex >= 0 ? s.todayIndex : Math.max(0, last);
  }
  const sel = selected;

  const goal = settings.dailyGoalMs;
  const axis = chartAxis(Math.max(...s.days, goal));
  const y = (ms: number) => LABEL_H + (ms / axis.top) * PLOT_H; // 下からの位置(px)

  const lines = [0, ...axis.ticks]
    .map((ms) => `<div class="grid-line" style="bottom:${y(ms)}px"><span>${ms === 0 ? '0' : fmtAxis(ms, style)}</span></div>`)
    .join('');
  const goalLine = goal > 0 ? `<div class="goal-line" style="bottom:${y(goal)}px"><span>目標</span></div>` : '';

  const days = s.days
    .map((ms, i) => {
      const start = s.dayStarts[i];
      const date = new Date(start);
      const h = (ms / axis.top) * PLOT_H;
      const segs = dayDetail(s.daySessions[i]).segments;
      // ラップの区切りが細かすぎて線だらけになるときは、区切り線を引かない
      const dense = segs.length > h / 3 ? ' dense' : '';
      const segHtml = segs.map((v) => `<div class="bar-seg" style="flex-grow:${v}"></div>`).join('');
      const cls = [i === sel ? 'sel' : '', i === s.todayIndex ? 'today' : '', ms >= goal && goal > 0 ? 'goal-done' : '']
        .filter(Boolean)
        .join(' ');
      return `
        <button type="button" class="day ${cls}" data-day="${i}" aria-pressed="${i === sel}"
          aria-label="${fmtDate(start)} ${fmtHM(ms)}">
          <div class="bar-track">
            ${ms > 0 ? `<div class="bar-value" style="bottom:${h + 3}px">${fmtShort(ms, style)}</div>` : ''}
            <div class="bar${dense}" style="height:${h.toFixed(1)}px">${segHtml}</div>
          </div>
          <div class="day-label"><span>${WEEKDAYS[date.getDay()]}</span><small>${date.getDate()}</small></div>
        </button>`;
    })
    .join('');

  const weekLabel = weekOffset === 0 ? '今週' : weekOffset === 1 ? '先週' : `${weekOffset}週前`;
  const range = `${fmtMD(s.dayStarts[0])}〜${fmtMD(s.dayStarts[6])}`;

  view.innerHTML = `
    <h1>統計</h1>
    <div class="stat-cards">
      <div class="stat-card"><span class="card-label">今日</span><span class="stat-value">${fmtHM(s.todayMs)}</span>${goalHtml(s.todayMs)}</div>
      <div class="stat-card"><span class="card-label">${weekLabel}</span><span class="stat-value">${fmtHM(s.weekMs)}</span></div>
    </div>
    <div class="chart">
      <div class="week-nav">
        <button type="button" data-week="prev" aria-label="前の週">‹</button>
        <span><b>${weekLabel}</b>${range}</span>
        <button type="button" data-week="next" aria-label="次の週"${weekOffset === 0 ? ' disabled' : ''}>›</button>
      </div>
      <div class="plot" style="height:${PLOT_H + LABEL_H}px">
        ${lines}${goalLine}
        <div class="days">${days}</div>
      </div>
    </div>
    ${detailHtml(s.dayStarts[sel], s.daySessions[sel])}
    <div class="list">
      <div class="section-label">${weekLabel}の内訳</div>
      <div class="list-row"><span>ストップウォッチ</span><span>${fmtHM(s.byMode.stopwatch)}</span></div>
      <div class="list-row"><span>タイマー</span><span>${fmtHM(s.byMode.timer)}</span></div>
      <div class="list-row"><span>ポモドーロ</span><span>${fmtHM(s.byMode.pomodoro)}</span></div>
    </div>
    ${materialsHtml(s.daySessions.flat(), weekLabel)}
    <div class="pair">
      <div><span class="label">${weekLabel}のラップ</span><span class="value">${s.weekLaps}</span></div>
      <div><span class="label">平均</span><span class="value">${s.weekLapAvgMs === null ? '—' : fmtLap(s.weekLapAvgMs)}</span></div>
    </div>`;

  // 日をタップしたら、その日の詳細に切り替える
  view.querySelectorAll<HTMLElement>('.day').forEach((b) => {
    b.onclick = () => {
      selected = Number(b.dataset.day);
      renderStats(view);
    };
  });
  view.querySelectorAll<HTMLButtonElement>('[data-week]').forEach((b) => {
    b.onclick = () => {
      weekOffset = Math.max(0, weekOffset + (b.dataset.week === 'prev' ? 1 : -1));
      selected = null;
      renderStats(view);
    };
  });

  // ラップの棒をタップしたら、番号と時間を出す
  const d = dayDetail(s.daySessions[sel]);
  const caption = view.querySelector('.lap-caption');
  view.querySelectorAll<HTMLElement>('.lap-bar').forEach((b) => {
    b.onclick = () => {
      view.querySelectorAll('.lap-bar.sel').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      const l = d.laps[Number(b.dataset.i)];
      const diff = d.lapAvgMs === null ? 0 : l.ms - d.lapAvgMs;
      const vs = Math.abs(diff) < 1000 ? '平均くらい' : `平均より${diff > 0 ? '+' : '−'}${fmtLap(Math.abs(diff))}`;
      if (caption) caption.textContent = `${l.no}番 ${fmtLap(l.ms)}（${vs}）`;
    };
  });
}
