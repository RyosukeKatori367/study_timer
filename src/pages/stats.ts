import { getSessions } from '../store';
import { summarize } from '../summary';
import { fmtHM, fmtLap } from '../time';

const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];
const BAR_MAX = 120; // 棒グラフのいちばん高い棒の高さ(px)

export function renderStats(view: HTMLElement): void {
  const s = summarize(getSessions(), Date.now());
  const max = Math.max(...s.days);

  const bars = s.days
    .map((ms, i) => {
      const h = max > 0 ? Math.max(3, Math.round((ms / max) * BAR_MAX)) : 3;
      return `<div class="bar${i === s.todayIndex ? ' today' : ''}" style="height:${h}px"></div>`;
    })
    .join('');
  const labels = DAY_LABELS.map(
    (d, i) => `<span${i === s.todayIndex ? ' class="today"' : ''}>${d}</span>`,
  ).join('');
  const chartLabel = `今週の勉強時間。${s.days.map((ms, i) => `${DAY_LABELS[i]}${fmtHM(ms)}`).join('、')}`;

  view.innerHTML = `
    <h1>統計</h1>
    <div class="stat-cards">
      <div class="stat-card"><span class="card-label">今日</span><span class="stat-value">${fmtHM(s.todayMs)}</span></div>
      <div class="stat-card"><span class="card-label">今週</span><span class="stat-value">${fmtHM(s.weekMs)}</span></div>
    </div>
    <div class="chart" role="img" aria-label="${chartLabel}">
      <div class="bars">${bars}</div>
      <div class="bar-labels">${labels}</div>
    </div>
    <div class="list">
      <div class="section-label">今週の内訳</div>
      <div class="list-row"><span>ストップウォッチ</span><span>${fmtHM(s.byMode.stopwatch)}</span></div>
      <div class="list-row"><span>タイマー</span><span>${fmtHM(s.byMode.timer)}</span></div>
      <div class="list-row"><span>ポモドーロ</span><span>${fmtHM(s.byMode.pomodoro)}</span></div>
    </div>
    <div class="pair">
      <div><span class="label">今週のラップ</span><span class="value">${s.weekLaps}</span></div>
      <div><span class="label">平均</span><span class="value">${s.weekLapAvgMs === null ? '—' : fmtLap(s.weekLapAvgMs)}</span></div>
    </div>`;
}
