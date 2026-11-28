// 統計画面。週の棒グラフ（日ごとの時間・ラップの区切り・目標線）と、
// タップした日の詳細（ラップごとの棒グラフ・記録の一覧）。

import { materialColor } from '../colors';
import { commonUnit, count, nth, one, range, unitFor } from '../units';
import { countsAsRecord, leaveTotal, type Mode, type Session } from '../engine';
import { getSessions, materialById, materialName, materialOrder, settings } from '../store';
import { addDays, chartAxis, dayDetail, fmtAxis, fmtShort, hourly, summarize, type DayDetail } from '../summary';
import { HOUR, MIN, fmtHM, fmtLap, pad2 } from '../time';
import { donutHtml } from '../ui/charts';
import { esc } from '../ui/dom';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const PLOT_H = 120; // 棒の部分の高さ(px)
const LABEL_H = 34; // 曜日・日付の部分の高さ(px)
/** 平均のこの倍以上かかったラップを赤にする */
const LONG_LAP = 1.5;
const HOUR_H = 90; // 時間帯のグラフの高さ(px)

const keyOrder = (key: string): number => (key ? materialOrder(key) : -1);
const colorOf = (key: string): string => materialColor(key);

/** 1日の詳細で出すグラフ */
let detailTab: 'hour' | 'lap' = 'hour';

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

/** 上のカードの大きな数字（「13時間10分」のように長いときは少し小さくして、折り返さない） */
function statValue(ms: number): string {
  const t = fmtHM(ms);
  return `<span class="stat-value${t.length >= 6 ? ' long' : ''}">${t}</span>`;
}

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
    const u = unitFor(s.material);
    parts.push(range(s.firstLap, last, u));
    parts.push(count(s.laps.length, u));
    if (s.laps.length > 1) parts.push(`${one(u)}の平均${fmtLap(s.studyMs / s.laps.length)}`);
  }
  if (s.leaves?.length) parts.push(`離脱${s.leaves.length}回（${fmtHM(leaveTotal(s.leaves))}）`);
  return `
    <div class="sess">
      <div class="sess-top"><span>${fmtClock(s.start)}〜${fmtClock(s.end)}</span><span>${fmtHM(s.studyMs)}</span></div>
      <div class="sess-sub">${esc(parts.join(' · '))}</div>
    </div>`;
}

/** 時間帯ごとのグラフ（スクリーンタイムのような、1時間ごとの積み上げ棒） */
function hourHtml(start: number): string {
  const hours = hourly(getSessions(), start);
  const firstHour = new Date(start).getHours();
  const y = (ms: number) => (ms / HOUR) * HOUR_H;
  const lines = [0, 30 * MIN, HOUR]
    .map((ms) => `<div class="grid-line" style="bottom:${y(ms)}px"><span>${ms === 0 ? '0' : fmtAxis(ms, 'm')}</span></div>`)
    .join('');
  const bars = hours
    .map((m, i) => {
      const total = [...m.values()].reduce((a, b) => a + b, 0);
      // 色は教材ごとに決まった順番（多い順ではない）で積む
      const segs = [...m.entries()]
        .filter(([, ms]) => ms >= 1000)
        .sort((a, b) => keyOrder(a[0]) - keyOrder(b[0]))
        .map(([key, ms]) => `<div class="hour-seg" style="flex-grow:${ms};background:${colorOf(key)}"></div>`)
        .join('');
      const h = Math.min(HOUR_H, y(total));
      const hour = (firstHour + i) % 24;
      return `<button type="button" class="hour" data-h="${i}" aria-label="${hour}時台 ${fmtHM(total)}">
        ${total >= MIN ? `<div class="hour-bar" style="height:${h.toFixed(1)}px">${segs}</div>` : ''}
      </button>`;
    })
    .join('');
  const labels = hours
    .map((_, i) => `<span>${i % 6 === 0 ? `${(firstHour + i) % 24}時` : ''}</span>`)
    .join('');
  return `
    <div class="hour-chart">
      <div class="plot hour-plot" style="height:${HOUR_H}px">
        ${lines}
        <div class="hours">${bars}</div>
      </div>
      <div class="hour-labels">${labels}</div>
    </div>
    <div class="hour-caption">棒をタップすると、その時間帯の内訳が出ます</div>`;
}

/** 教材ごとの色の説明と、その日の時間 */
function legendHtml(d: DayDetail): string {
  return `
    <div class="legend">
      ${d.byMaterial
        .map(
          (m) => `
        <div class="legend-item">
          <span class="legend-name"><i style="background:${colorOf(m.key)}"></i>${esc(materialName(m.key || null))}</span>
          <span class="legend-value">${fmtHM(m.ms)}</span>
        </div>`,
        )
        .join('')}
    </div>`;
}

/** ラップごとのグラフ（同じ教材の同じ番号は、途中で分かれていても1本にまとめる） */
function lapHtml(d: DayDetail): string {
  const cu = commonUnit(d.laps.map((l) => l.material || null));
  const per = cu ? one(cu) : '1つ';
  if (d.laps.length === 0 || !d.lapMaxMs || !d.lapAvgMs) {
    return `<div class="empty">この日は next を押した記録がありません</div>`;
  }
  const max = d.lapMaxMs;
  const avg = d.lapAvgMs;
  const bars = d.laps
    .map((l, i) => {
      const long = d.laps.length >= 3 && l.ms >= avg * LONG_LAP;
      // 教材や記録が変わるところは少し間を空ける
      const prev = d.laps[i - 1];
      const gap = prev && (prev.session !== l.session || prev.material !== l.material) ? ' gap' : '';
      return `<button type="button" class="lap-bar${long ? ' long' : ''}${gap}" style="height:${Math.max(2, (l.ms / max) * 100).toFixed(1)}%"
        data-i="${i}" aria-label="${nth(l.no, unitFor(l.material))} ${fmtLap(l.ms)}"></button>`;
    })
    .join('');
  // 番号の範囲は、1つの教材だけの日に出す（教材が混ざると番号が続かない）
  const range =
    new Set(d.laps.map((l) => l.material)).size === 1
      ? `<div class="lap-range"><span>${nth(d.laps[0].no, unitFor(d.laps[0].material))}</span><span>${nth(d.laps[d.laps.length - 1].no, unitFor(d.laps[0].material))}</span></div>`
      : '';
  return `
    <div class="lap-chart-wrap">
      <div class="avg-line" style="bottom:${((avg / max) * 100).toFixed(1)}%"><span>平均</span></div>
      <div class="lap-chart">${bars}</div>
    </div>
    ${range}
    <div class="lap-caption">棒をタップすると、その時間が出ます</div>
    <div class="lap-legend">1本が${per}（途中で終えて分かれたものも合計）。点線は平均、平均の1.5倍以上は赤</div>`;
}

/** 離脱の回数と合計（設定がオンのとき、または記録があるとき） */
function leaveStats(sessions: Session[]): { count: number; ms: number } | null {
  const leaves = sessions.flatMap((s) => s.leaves ?? []);
  if (!settings.leaveTrack && leaves.length === 0) return null;
  return { count: leaves.length, ms: leaveTotal(leaves) };
}

function leaveLine(sessions: Session[]): string {
  const l = leaveStats(sessions);
  if (!l) return '';
  return `<div class="leave-line"><span>離脱</span><span>${l.count === 0 ? 'なし' : `${l.count}回・合計${fmtHM(l.ms)}`}</span></div>`;
}

/** 選んだ日の詳細 */
function detailHtml(start: number, sessions: Session[], d: DayDetail): string {
  const head = `
    <div class="detail-head">
      <span class="detail-date">${fmtDate(start)}</span>
      <span class="detail-total">${fmtHM(d.totalMs)}</span>
    </div>
    ${goalHtml(d.totalMs)}`;
  if (sessions.length === 0) {
    return `<section class="detail" aria-label="${fmtDate(start)}の詳細">${head}<div class="empty">この日の記録はありません</div></section>`;
  }

  const u = commonUnit(sessions.filter((x) => x.laps.length > 0).map((x) => x.material ?? null)) ?? (d.laps.length ? null : unitFor(null));
  const stats = `
    <div class="detail-stats">
      <div><span class="label">記録</span><span class="value">${sessions.filter(countsAsRecord).length}回</span></div>
      <div><span class="label">${u ? u.countLabel : 'こなした数'}</span><span class="value">${u ? count(d.laps.length, u) : d.laps.length}</span></div>
      <div><span class="label">平均</span><span class="value">${d.lapAvgMs === null ? '—' : fmtLap(d.lapAvgMs)}</span></div>
      <div><span class="label">最長</span><span class="value">${d.lapMaxMs === null ? '—' : fmtLap(d.lapMaxMs)}</span></div>
    </div>
    ${leaveLine(sessions)}`;

  const tabs = `
    <div class="seg detail-tabs" role="group" aria-label="グラフの種類">
      <button type="button" data-tab="hour" aria-pressed="${detailTab === 'hour'}">時間帯</button>
      <button type="button" data-tab="lap" aria-pressed="${detailTab === 'lap'}">${u ? one(u) : '1つ'}ごと</button>
    </div>`;

  return `
    <section class="detail" aria-label="${fmtDate(start)}の詳細">
      ${head}${stats}${tabs}
      ${detailTab === 'hour' ? hourHtml(start) + legendHtml(d) : lapHtml(d)}
      <div class="sess-list">${sessions.map(sessionHtml).join('')}</div>
    </section>`;
}

/** 教材ごとの割合の円グラフ（その週に記録があるときだけ出す） */
function materialsHtml(sessions: Session[], weekLabel: string): string {
  if (sessions.length === 0) return '';
  const totals = new Map<string, { ms: number; laps: number }>();
  for (const s of sessions) {
    const key = s.material ?? '';
    const t = totals.get(key) ?? { ms: 0, laps: 0 };
    t.ms += s.studyMs;
    t.laps += s.laps.length;
    totals.set(key, t);
  }
  const segs = [...totals.entries()]
    .filter(([, t]) => t.ms > 0)
    .sort((a, b) => b[1].ms - a[1].ms)
    .map(([key, t]) => ({
      ms: t.ms,
      color: colorOf(key),
      label: materialName(key || null),
      sub: t.laps > 0 ? count(t.laps, unitFor(key || null)) : undefined,
      img: key ? materialById(key)?.img : undefined,
    }));
  if (segs.length === 0) return '';
  return `
    <section class="material-share" aria-label="${weekLabel}の教材の割合">
      <div class="section-label">${weekLabel}の教材の割合</div>
      ${donutHtml(segs, weekLabel)}
    </section>`;
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
      // どの日も教材の色で塗る（ラップごとの区切り線はそのまま）
      const segHtml = segs
        .map((v) => `<div class="bar-seg" style="flex-grow:${v.ms};background:${colorOf(v.key)}"></div>`)
        .join('');
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
      <div class="stat-card"><span class="card-label">今日</span>${statValue(s.todayMs)}${goalHtml(s.todayMs)}</div>
      <div class="stat-card"><span class="card-label">${weekLabel}</span>${statValue(s.weekMs)}</div>
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
    ${detailHtml(s.dayStarts[sel], s.daySessions[sel], dayDetail(s.daySessions[sel]))}
    ${materialsHtml(s.daySessions.flat(), weekLabel)}
    <div class="list">
      <div class="section-label">${weekLabel}の内訳</div>
      <div class="list-row"><span>ストップウォッチ</span><span>${fmtHM(s.byMode.stopwatch)}</span></div>
      <div class="list-row"><span>タイマー</span><span>${fmtHM(s.byMode.timer)}</span></div>
      <div class="list-row"><span>ポモドーロ</span><span>${fmtHM(s.byMode.pomodoro)}</span></div>
    </div>
    <div class="pair">
      <div><span class="label">${weekLabel}こなした数</span><span class="value">${s.weekLaps}</span></div>
      <div><span class="label">平均</span><span class="value">${s.weekLapAvgMs === null ? '—' : fmtLap(s.weekLapAvgMs)}</span></div>
      ${(() => {
        const l = leaveStats(s.daySessions.flat());
        return l
          ? `<div><span class="label">離脱</span><span class="value">${l.count}回</span>${l.count > 0 ? `<span class="sub">${fmtHM(l.ms)}</span>` : ''}</div>`
          : '';
      })()}
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

  view.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => {
    b.onclick = () => {
      detailTab = b.dataset.tab as 'hour' | 'lap';
      renderStats(view);
    };
  });

  // 時間帯の棒をタップしたら、その時間の内訳を出す
  const hours = hourly(getSessions(), s.dayStarts[sel]);
  const firstHour = new Date(s.dayStarts[sel]).getHours();
  const hourCaption = view.querySelector('.hour-caption');
  view.querySelectorAll<HTMLElement>('.hour').forEach((b) => {
    b.onclick = () => {
      view.querySelectorAll('.hour.sel').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      const m = hours[Number(b.dataset.h)];
      const total = [...m.values()].reduce((a, x) => a + x, 0);
      const parts = [...m.entries()]
        .filter(([, ms]) => ms >= MIN)
        .sort((a, x) => x[1] - a[1])
        .map(([key, ms]) => `${materialName(key || null)} ${fmtHM(ms)}`);
      const hour = (firstHour + Number(b.dataset.h)) % 24;
      if (hourCaption) {
        hourCaption.textContent =
          total < MIN ? `${hour}時台 記録なし` : `${hour}時台 ${fmtHM(total)}${parts.length > 1 ? `（${parts.join('・')}）` : ''}`;
      }
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
      const split = l.parts > 1 ? `${l.parts}回に分けて・` : '';
      if (caption) caption.textContent = `${nth(l.no, unitFor(l.material))} ${fmtLap(l.ms)}（${split}${vs}）`;
    };
  });
}
