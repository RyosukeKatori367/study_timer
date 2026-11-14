import { describe, expect, it } from 'vitest';
import {
  clockToTimestamp,
  cycleRemaining,
  cycleView,
  elapsed,
  finish,
  isOver,
  lap,
  newRun,
  pause,
  resume,
  timerRemaining,
  totalElapsed,
} from './engine';
import { summarize } from './summary';
import { MIN, SEC, fmtElapsed, fmtHM, fmtLap, fmtRemain, weekStart } from './time';

const T0 = new Date(2026, 10, 14, 13, 0, 0).getTime(); // 2026-11-14(土) 13:00

describe('経過時間', () => {
  it('一時停止しているあいだは進まない', () => {
    const r = newRun('stopwatch', T0);
    expect(elapsed(r, T0 + 10 * SEC)).toBe(10 * SEC);
    pause(r, T0 + 10 * SEC);
    expect(elapsed(r, T0 + 60 * SEC)).toBe(10 * SEC);
    resume(r, T0 + 60 * SEC);
    expect(elapsed(r, T0 + 65 * SEC)).toBe(15 * SEC);
  });

  it('ラップを押すと 0 に戻り、合計は足し算になる', () => {
    const r = newRun('stopwatch', T0, { firstLap: 231 });
    lap(r, T0 + 3 * SEC);
    lap(r, T0 + 3 * SEC + 722 * SEC);
    expect(r.laps).toEqual([3 * SEC, 722 * SEC]);
    expect(elapsed(r, T0 + 730 * SEC)).toBe(5 * SEC);
    expect(totalElapsed(r, T0 + 730 * SEC)).toBe(730 * SEC);
  });
});

describe('タイマー', () => {
  it('超過なしなら 0 で止まる', () => {
    const r = newRun('timer', T0, { durationMs: 12 * MIN });
    expect(timerRemaining(r, T0 + 4 * MIN)).toBe(8 * MIN);
    expect(timerRemaining(r, T0 + 20 * MIN)).toBe(0);
    expect(isOver(r, T0 + 20 * MIN)).toBe(true);
    // 記録されるラップは設定時間まで
    lap(r, T0 + 20 * MIN);
    expect(r.laps).toEqual([12 * MIN]);
  });

  it('超過ありなら負の値で数え続ける', () => {
    const r = newRun('timer', T0, { durationMs: 12 * MIN, overrun: true });
    expect(timerRemaining(r, T0 + 13 * MIN + 23 * SEC)).toBe(-(1 * MIN + 23 * SEC));
    lap(r, T0 + 13 * MIN);
    expect(r.laps).toEqual([13 * MIN]);
  });
});

describe('ポモドーロ（サイクル型）', () => {
  const base = { workMs: 25 * MIN, breakMs: 5 * MIN };

  it('作業→休憩→作業と切り替わる', () => {
    const r = newRun('pomoCycle', T0, base);
    let v = cycleView(r, T0 + 6 * MIN + 18 * SEC);
    expect([v.phase, v.set, v.phaseRemain, v.completed]).toEqual(['work', 1, 18 * MIN + 42 * SEC, 0]);
    v = cycleView(r, T0 + 27 * MIN);
    expect([v.phase, v.set, v.phaseRemain, v.completed]).toEqual(['break', 1, 3 * MIN, 1]);
    v = cycleView(r, T0 + 31 * MIN);
    expect([v.phase, v.set, v.completed, v.workTotal]).toEqual(['work', 2, 1, 26 * MIN]);
    expect(v.done).toBe(false);
  });

  it('回数: 最後の作業が終わったら止まり、最後の休憩は入らない', () => {
    const r = newRun('pomoCycle', T0, { ...base, end: { kind: 'count', n: 2 } });
    expect(cycleView(r, T0 + 54 * MIN).done).toBe(false);
    const v = cycleView(r, T0 + 55 * MIN);
    expect([v.done, v.completed, v.workTotal]).toEqual([true, 2, 50 * MIN]);
    expect(cycleRemaining(r, T0 + 31 * MIN)).toBe(1);
  });

  it('合計時間: 達したらすぐ止まる', () => {
    const r = newRun('pomoCycle', T0, { ...base, end: { kind: 'total', ms: 40 * MIN } });
    expect(cycleView(r, T0 + 39 * MIN).done).toBe(false);
    const v = cycleView(r, T0 + 3 * 60 * MIN);
    expect([v.done, v.elapsed, v.workTotal]).toEqual([true, 40 * MIN, 35 * MIN]);
  });

  it('終了時刻: 作業の途中でもすぐ止まり、遅れて戻っても終了時刻で打ち切る', () => {
    const at = clockToTimestamp(13 * 60 + 40, T0); // 13:40
    expect(at).toBe(T0 + 40 * MIN);
    const r = newRun('pomoCycle', T0, { ...base, end: { kind: 'clock', at } });
    expect(cycleView(r, T0 + 39 * MIN).done).toBe(false);
    const v = cycleView(r, T0 + 90 * MIN);
    expect([v.done, v.phase, v.set, v.workTotal]).toEqual([true, 'work', 2, 35 * MIN]);
    expect(finish(r, T0 + 90 * MIN)?.studyMs).toBe(35 * MIN);
  });

  it('過ぎた時刻を指定したら翌日になる', () => {
    const at = clockToTimestamp(9 * 60, T0);
    expect(new Date(at).getDate()).toBe(15);
  });
});

describe('終了時の記録', () => {
  it('最後のラップも含めて記録する', () => {
    const r = newRun('stopwatch', T0, { firstLap: 231 });
    lap(r, T0 + 10 * MIN);
    const s = finish(r, T0 + 22 * MIN);
    expect(s?.laps).toEqual([10 * MIN, 12 * MIN]);
    expect(s?.studyMs).toBe(22 * MIN);
    expect(s?.firstLap).toBe(231);
  });

  it('lap の直後に finish したら、数秒のラップは捨てる', () => {
    const r = newRun('stopwatch', T0);
    lap(r, T0 + 10 * MIN);
    expect(finish(r, T0 + 10 * MIN + 2 * SEC)?.laps).toEqual([10 * MIN]);
  });

  it('ほとんど計っていなければ記録しない', () => {
    expect(finish(newRun('stopwatch', T0), T0 + 300)).toBeNull();
  });
});

describe('集計と表示', () => {
  it('今日・今週・モード別・ラップ平均を出す', () => {
    const mk = (mode: 'timer' | 'stopwatch' | 'pomoCycle', start: number, studyMs: number, laps: number[] = []) => ({
      id: String(start),
      mode,
      start,
      end: start + studyMs,
      studyMs,
      laps,
      firstLap: 1,
    });
    const monday = weekStart(T0);
    const sessions = [
      mk('stopwatch', monday - 60 * MIN, 99 * MIN), // 先週の日曜 → 数えない
      mk('stopwatch', monday + 10 * 60 * MIN, 60 * MIN, [20 * MIN, 40 * MIN]),
      mk('timer', T0 - 2 * 60 * MIN, 30 * MIN, [30 * MIN]),
      mk('pomoCycle', T0 - 60 * MIN, 50 * MIN),
    ];
    const s = summarize(sessions, T0);
    expect(s.todayIndex).toBe(5); // 土曜
    expect(s.todayMs).toBe(80 * MIN);
    expect(s.weekMs).toBe(140 * MIN);
    expect(s.days).toEqual([60 * MIN, 0, 0, 0, 0, 80 * MIN, 0]);
    expect(s.byMode).toEqual({ stopwatch: 60 * MIN, timer: 30 * MIN, pomodoro: 50 * MIN });
    expect(s.weekLaps).toBe(3);
    expect(s.weekLapAvgMs).toBe(30 * MIN);
  });

  it('時間の書式', () => {
    expect(fmtElapsed(168 * MIN + 12 * SEC)).toBe('2:48:12');
    expect(fmtElapsed(0, true)).toBe('0:00:00');
    expect(fmtRemain(7 * MIN + 25 * SEC + 1)).toBe('7:26');
    expect(fmtRemain(0)).toBe('0:00');
    expect(fmtLap(722 * SEC)).toBe('12分2秒');
    expect(fmtLap(3 * SEC)).toBe('3秒');
    expect(fmtHM(222 * MIN)).toBe('3時間42分');
  });
});
