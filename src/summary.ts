// 統計画面に出す数字の集計。記録は「1回＝1件」でそのまま保存してあり、
// 合計などは表示するときに毎回ここで計算する。

import type { Mode, Session } from './engine';
import { DAY, HOUR, MIN, dayStart, weekStart } from './time';

export interface Summary {
  todayMs: number;
  weekMs: number;
  /** 月〜日の勉強時間 */
  days: number[];
  /** 今日が days の何番目か */
  todayIndex: number;
  byMode: { stopwatch: number; timer: number; pomodoro: number };
  weekLaps: number;
  weekLapAvgMs: number | null;
}

const groupOf = (mode: Mode): keyof Summary['byMode'] =>
  mode === 'stopwatch' ? 'stopwatch' : mode === 'pomoCycle' ? 'pomodoro' : 'timer';

/** 記録は開始した日のものとして数える。 */
export function summarize(sessions: readonly Session[], now: number): Summary {
  const today = dayStart(now);
  const monday = weekStart(now);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 7);
  const weekEnd = sunday.getTime();

  const out: Summary = {
    todayMs: 0,
    weekMs: 0,
    days: [0, 0, 0, 0, 0, 0, 0],
    todayIndex: Math.round((today - monday) / DAY),
    byMode: { stopwatch: 0, timer: 0, pomodoro: 0 },
    weekLaps: 0,
    weekLapAvgMs: null,
  };

  let lapSum = 0;
  for (const s of sessions) {
    if (s.start < monday || s.start >= weekEnd) continue;
    const index = Math.round((dayStart(s.start) - monday) / DAY);
    out.days[index] += s.studyMs;
    out.weekMs += s.studyMs;
    out.byMode[groupOf(s.mode)] += s.studyMs;
    if (index === out.todayIndex) out.todayMs += s.studyMs;
    out.weekLaps += s.laps.length;
    for (const l of s.laps) lapSum += l;
  }
  if (out.weekLaps > 0) out.weekLapAvgMs = lapSum / out.weekLaps;
  return out;
}

// ---- グラフの目盛り ----

export interface ChartAxis {
  /** グラフのいちばん上の値 */
  top: number;
  /** 目盛り線を引く値（0 は含まない） */
  ticks: number[];
}

const AXIS_STEPS = [15, 30, 60, 120, 180, 240, 360, 480, 720].map((m) => m * MIN);

/** いちばん長い日の勉強時間から、きりのいい目盛り（2〜4本）を決める。 */
export function chartAxis(maxMs: number): ChartAxis {
  const step = AXIS_STEPS.find((s) => maxMs <= s * 4) ?? AXIS_STEPS[AXIS_STEPS.length - 1];
  const count = Math.max(2, Math.ceil(maxMs / step));
  const ticks = Array.from({ length: count }, (_, i) => (i + 1) * step);
  return { top: count * step, ticks };
}

/** 目盛りのラベル。例: 30分 / 1時間 / 1.5時間 */
export function fmtAxis(ms: number): string {
  return ms < HOUR ? `${Math.round(ms / MIN)}分` : `${ms / HOUR}時間`;
}
