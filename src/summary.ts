// 統計画面に出す数字の集計。記録は「1回＝1件」でそのまま保存してあり、
// 合計などは表示するときに毎回ここで計算する。

import type { Mode, Session } from './engine';
import { DAY, dayStart, weekStart } from './time';

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
  mode === 'timer' ? 'timer' : mode === 'stopwatch' ? 'stopwatch' : 'pomodoro';

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
