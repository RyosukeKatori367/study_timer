// 統計画面に出す数字の集計。記録は「1回＝1件」でそのまま保存してあり、
// 合計などは表示するときに毎回ここで計算する。

import type { Mode, Session } from './engine';
import { HOUR, MIN, type DurationStyle } from './time';

export interface DayOptions {
  /** 1日の区切り（0:00 からの分）。240 なら 4:00 までの勉強は前の日に数える */
  boundaryMin?: number;
  /** 週の始まり。1 = 月曜、0 = 日曜 */
  weekStartsOn?: 0 | 1;
}

export interface SummaryOptions extends DayOptions {
  /** 表示する週に含まれる時刻（なければ今週） */
  ref?: number;
}

/** ts を含む「勉強の1日」の始まり（区切りが 4:00 なら、その日の 4:00） */
export function studyDayStart(ts: number, boundaryMin = 0): number {
  const d = new Date(ts - boundaryMin * MIN);
  d.setHours(0, 0, 0, 0);
  return d.getTime() + boundaryMin * MIN;
}

/** ts を含む週の、最初の日の始まり */
export function studyWeekStart(ts: number, { boundaryMin = 0, weekStartsOn = 1 }: DayOptions = {}): number {
  const d = new Date(studyDayStart(ts, boundaryMin) - boundaryMin * MIN); // その日の 0:00
  d.setDate(d.getDate() - ((d.getDay() - weekStartsOn + 7) % 7));
  return d.getTime() + boundaryMin * MIN;
}

/** ある日の始まりから n 日後の始まり */
export function addDays(dayStartTs: number, n: number, boundaryMin = 0): number {
  const d = new Date(dayStartTs - boundaryMin * MIN);
  d.setDate(d.getDate() + n);
  return d.getTime() + boundaryMin * MIN;
}

export interface Summary {
  /** 表示している週の最初の日の始まり */
  weekStart: number;
  /** 各日の始まり（7日分） */
  dayStarts: number[];
  /** 各日の勉強時間 */
  days: number[];
  /** 各日の記録（開始時刻の順） */
  daySessions: Session[][];
  /** 今日が days の何番目か（表示している週に今日がなければ -1） */
  todayIndex: number;
  /** 今日の勉強時間（どの週を表示していても今日のもの） */
  todayMs: number;
  weekMs: number;
  byMode: { stopwatch: number; timer: number; pomodoro: number };
  weekLaps: number;
  weekLapAvgMs: number | null;
}

const groupOf = (mode: Mode): keyof Summary['byMode'] =>
  mode === 'stopwatch' ? 'stopwatch' : mode === 'pomoCycle' ? 'pomodoro' : 'timer';

/** 記録は開始した日のものとして数える。 */
export function summarize(sessions: readonly Session[], now: number, opts: SummaryOptions = {}): Summary {
  const { boundaryMin = 0 } = opts;
  const weekStart = studyWeekStart(opts.ref ?? now, opts);
  const edges = Array.from({ length: 8 }, (_, i) => addDays(weekStart, i, boundaryMin));
  const dayStarts = edges.slice(0, 7);
  const today = studyDayStart(now, boundaryMin);

  const out: Summary = {
    weekStart,
    dayStarts,
    days: [0, 0, 0, 0, 0, 0, 0],
    daySessions: [[], [], [], [], [], [], []],
    todayIndex: dayStarts.indexOf(today),
    todayMs: 0,
    weekMs: 0,
    byMode: { stopwatch: 0, timer: 0, pomodoro: 0 },
    weekLaps: 0,
    weekLapAvgMs: null,
  };

  let lapSum = 0;
  for (const s of sessions) {
    if (studyDayStart(s.start, boundaryMin) === today) out.todayMs += s.studyMs;
    if (s.start < edges[0] || s.start >= edges[7]) continue;
    let index = 6;
    while (index > 0 && s.start < edges[index]) index--;
    out.days[index] += s.studyMs;
    out.daySessions[index].push(s);
    out.weekMs += s.studyMs;
    out.byMode[groupOf(s.mode)] += s.studyMs;
    out.weekLaps += s.laps.length;
    for (const l of s.laps) lapSum += l;
  }
  for (const list of out.daySessions) list.sort((a, b) => a.start - b.start);
  if (out.weekLaps > 0) out.weekLapAvgMs = lapSum / out.weekLaps;
  return out;
}

// ---- 1日の詳細 ----

export interface LapItem {
  /** ラップ番号 */
  no: number;
  /** そのラップにかかった時間（途中で終えて分かれたものは合計） */
  ms: number;
  /** 最初に出てきた記録が、その日の何番目か */
  session: number;
  /** 教材の id（教材なしは ''） */
  material: string;
  /** いくつに分かれていたか（途中で finish して、あとで同じ番号から続けたとき 2 以上） */
  parts: number;
}

export interface Segment {
  ms: number;
  /** 教材の id（教材なしは ''） */
  key: string;
}

export interface DayDetail {
  totalMs: number;
  /** ラップごと（同じ教材の同じ番号は1つにまとめる） */
  laps: LapItem[];
  lapAvgMs: number | null;
  lapMaxMs: number | null;
  /** 棒グラフの区切り（ラップがある記録は計ったひとかたまりごと、ない記録は1つ） */
  segments: Segment[];
  /** 教材ごとの合計（多い順） */
  byMaterial: Segment[];
}

export function dayDetail(sessions: readonly Session[]): DayDetail {
  const laps = new Map<string, LapItem>();
  const segments: Segment[] = [];
  const byMaterial = new Map<string, number>();
  let totalMs = 0;
  sessions.forEach((s, i) => {
    const key = s.material ?? '';
    totalMs += s.studyMs;
    byMaterial.set(key, (byMaterial.get(key) ?? 0) + s.studyMs);
    if (s.laps.length > 0) {
      s.laps.forEach((ms, j) => {
        const no = s.firstLap + j;
        const id = `${key}\u0000${no}`;
        const found = laps.get(id);
        if (found) {
          found.ms += ms;
          found.parts += 1;
        } else {
          laps.set(id, { no, ms, session: i, material: key, parts: 1 });
        }
        segments.push({ ms, key });
      });
    } else {
      segments.push({ ms: s.studyMs, key });
    }
  });
  const list = [...laps.values()];
  const sum = list.reduce((a, l) => a + l.ms, 0);
  return {
    totalMs,
    laps: list,
    lapAvgMs: list.length > 0 ? sum / list.length : null,
    lapMaxMs: list.length > 0 ? Math.max(...list.map((l) => l.ms)) : null,
    segments,
    byMaterial: [...byMaterial.entries()].map(([key, ms]) => ({ key, ms })).sort((a, b) => b.ms - a.ms),
  };
}

// ---- 時間帯ごと ----

/** 計っていた時間帯。記録していない古い記録は、始めから終わりまで */
export const spansOf = (s: Session): [number, number][] => (s.spans?.length ? s.spans : [[s.start, s.end]]);

/**
 * その日の1時間ごとの勉強時間（教材ごと）。24 個の { 教材: ミリ秒 }。
 * 計っていた時間帯に、勉強時間を時間の長さに合わせて割り振る
 * （ポモドーロの休憩は勉強時間に入らないので、そのぶん薄く割り振られる）。
 * 前の日に始めて日をまたいだ記録も、この日に入るぶんは数える。
 */
export function hourly(sessions: readonly Session[], dayStartTs: number): Map<string, number>[] {
  const end = dayStartTs + 24 * HOUR;
  const hours = Array.from({ length: 24 }, () => new Map<string, number>());
  for (const s of sessions) {
    const spans = spansOf(s);
    const active = spans.reduce((a, [x, y]) => a + Math.max(0, y - x), 0);
    if (active <= 0) continue;
    const weight = Math.min(1, s.studyMs / active);
    const key = s.material ?? '';
    for (const [x, y] of spans) {
      let a = Math.max(x, dayStartTs);
      const b = Math.min(y, end);
      while (a < b) {
        const h = Math.floor((a - dayStartTs) / HOUR);
        const next = Math.min(b, dayStartTs + (h + 1) * HOUR);
        const m = hours[h];
        m.set(key, (m.get(key) ?? 0) + (next - a) * weight);
        a = next;
      }
    }
  }
  return hours;
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

/** 目盛りのラベル。例: 30分 / 1時間 / 1.5時間（98分表示なら 30分 / 60分 / 90分） */
export function fmtAxis(ms: number, style: DurationStyle = 'hm'): string {
  return ms < HOUR || style === 'm' ? `${Math.round(ms / MIN)}分` : `${ms / HOUR}時間`;
}

/** 棒の上に出す短い時間。例: 45分 / 3:42（98分表示なら 222分） */
export function fmtShort(ms: number, style: DurationStyle = 'hm'): string {
  const m = Math.floor(ms / MIN);
  if (style === 'm' || m < 60) return `${m}分`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
