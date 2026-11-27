import { describe, expect, it } from 'vitest';
import {
  clockToTimestamp,
  cycleRemaining,
  cycleView,
  elapsed,
  finish,
  isOver,
  lapEndView,
  lap,
  newRun,
  normalizeMode,
  pause,
  resume,
  timerRemaining,
  totalElapsed,
} from './engine';
import { nextTilt } from './orientation';
import { chartAxis, dayDetail, fmtAxis, fmtShort, studyDayStart, studyWeekStart, summarize } from './summary';
import { HOUR, MIN, SEC, setDurationStyle, fmtElapsed, fmtHM, fmtLap, fmtRemain, weekStart } from './time';

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

describe('傾きの判定', () => {
  it('立てて持っているときは縦、横に倒すと横', () => {
    expect(nextTilt('portrait', 90, 0)).toBe('portrait');
    expect(nextTilt('portrait', 0, -90)).toBe('left'); // 左側が下
    expect(nextTilt('portrait', 0, 90)).toBe('right'); // 右側が下
    expect(nextTilt('left', 80, 5)).toBe('portrait');
  });

  it('横向きで少し後ろに倒しても横のまま（センサーの値が跳ぶ表し方でも同じ）', () => {
    expect(nextTilt('portrait', 20, -75)).toBe('left');
    expect(nextTilt('portrait', 160, 75)).toBe('left');
    expect(nextTilt('portrait', 160, -75)).toBe('right');
  });

  it('机に平置きしたときと、境目では今の向きを保つ', () => {
    expect(nextTilt('left', 3, -4)).toBe('left');
    expect(nextTilt('portrait', 3, -4)).toBe('portrait');
    expect(nextTilt('portrait', 45, -45)).toBe('portrait');
    expect(nextTilt('right', 45, 45)).toBe('right');
  });
});

describe('タイマー（カウントアップ）', () => {
  it('設定時間を過ぎても止まらず、lap で 0 に戻る', () => {
    const r = newRun('timerUp', T0, { durationMs: 25 * MIN, firstLap: 231 });
    expect(isOver(r, T0 + 25 * MIN)).toBe(false);
    expect(isOver(r, T0 + 27 * MIN)).toBe(true);
    lap(r, T0 + 27 * MIN);
    expect(r.laps).toEqual([27 * MIN]); // 超過したぶんも記録する
    expect(elapsed(r, T0 + 28 * MIN)).toBe(1 * MIN);
    const s = finish(r, T0 + 40 * MIN);
    expect([s?.mode, s?.firstLap, s?.laps.length, s?.studyMs]).toEqual(['timerUp', 231, 2, 40 * MIN]);
  });

  it('古い版の「ラップ型ポモドーロ」の記録は、カウントアップとして読む', () => {
    expect(normalizeMode('pomoLap')).toBe('timerUp');
    expect(normalizeMode('timer')).toBe('timer');
    expect(normalizeMode('pomoCycle')).toBe('pomoCycle');
    expect(normalizeMode('unknown')).toBeNull();
  });

  it('統計ではタイマーに入る', () => {
    const s = summarize(
      [{ id: 'a', mode: 'timerUp', start: T0, end: T0 + 30 * MIN, studyMs: 30 * MIN, laps: [30 * MIN], firstLap: 1 }],
      T0,
    );
    expect(s.byMode).toEqual({ stopwatch: 0, timer: 30 * MIN, pomodoro: 0 });
  });
});

describe('グラフの目盛り', () => {
  it('きりのいい間隔で2〜4本になる', () => {
    expect(chartAxis(0)).toEqual({ top: 30 * MIN, ticks: [15 * MIN, 30 * MIN] });
    expect(chartAxis(50 * MIN)).toEqual({ top: 60 * MIN, ticks: [15 * MIN, 30 * MIN, 45 * MIN, 60 * MIN] });
    expect(chartAxis(222 * MIN)).toEqual({ top: 4 * HOUR, ticks: [1 * HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR] });
    expect(chartAxis(5 * HOUR)).toEqual({ top: 6 * HOUR, ticks: [2 * HOUR, 4 * HOUR, 6 * HOUR] });
    expect(chartAxis(90 * MIN).ticks.map((ms) => fmtAxis(ms))).toEqual(['30分', '1時間', '1.5時間']);
  });

  it('どんな値でも、いちばん長い日が枠に収まる', () => {
    for (const max of [1, 14 * MIN, 61 * MIN, 4 * HOUR + 1, 13 * HOUR, 24 * HOUR]) {
      const a = chartAxis(max);
      expect(a.top).toBeGreaterThanOrEqual(max);
      expect(a.ticks.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('時間の表示（1時間38分／98分）', () => {
  it('98分表示では、時間を分にまとめる', () => {
    setDurationStyle('m');
    try {
      expect(fmtHM(98 * MIN)).toBe('98分');
      expect(fmtHM(25 * MIN)).toBe('25分');
      expect(fmtLap(98 * MIN + 7 * SEC)).toBe('98分7秒');
      expect(fmtElapsed(98 * MIN + 12 * SEC)).toBe('98:12');
      expect(fmtElapsed(0, true)).toBe('0:00');
      expect(fmtRemain(90 * MIN)).toBe('90:00');
      expect(fmtAxis(90 * MIN, 'm')).toBe('90分');
    } finally {
      setDurationStyle('hm');
    }
  });

  it('1時間38分表示（初期設定）', () => {
    expect(fmtHM(98 * MIN)).toBe('1時間38分');
    expect(fmtLap(98 * MIN + 7 * SEC)).toBe('1時間38分7秒');
    expect(fmtElapsed(98 * MIN + 12 * SEC)).toBe('1:38:12');
    expect(fmtRemain(90 * MIN)).toBe('1:30:00');
    expect(fmtAxis(90 * MIN)).toBe('1.5時間');
  });
});

describe('ラップのあるモードの終了条件', () => {
  it('ラップ数: 残りラップと、平均からの残り時間の見積もり', () => {
    const r = newRun('stopwatch', T0, { firstLap: 231, end: { kind: 'count', n: 10 }, lapEstMs: 12 * MIN });
    // まだラップがない → 前回の平均 12分 で見積もる
    let v = lapEndView(r, T0 + 2 * MIN);
    expect([v.remainLaps, v.remainMs, v.done]).toEqual([10, 10 * MIN + 9 * 12 * MIN, false]);
    // 2ラップ（10分・14分）終えたら、その平均 12分 で見積もる
    lap(r, T0 + 10 * MIN);
    lap(r, T0 + 24 * MIN);
    v = lapEndView(r, T0 + 30 * MIN);
    expect([v.remainLaps, v.remainMs, v.lapsDone]).toEqual([8, 6 * MIN + 7 * 12 * MIN, 2]);
    // 今のラップが平均を超えても、マイナスにはしない
    expect(lapEndView(r, T0 + 50 * MIN).remainMs).toBe(7 * 12 * MIN);
  });

  it('ラップ数: 決めた数のラップを押したら終わり、最後に押した直後の数秒は記録しない', () => {
    const r = newRun('timer', T0, { durationMs: 5 * MIN, end: { kind: 'count', n: 2 }, lapEstMs: 5 * MIN });
    lap(r, T0 + 4 * MIN);
    expect(lapEndView(r, T0 + 4 * MIN).done).toBe(false);
    lap(r, T0 + 9 * MIN);
    expect(lapEndView(r, T0 + 9 * MIN).done).toBe(true);
    expect(finish(r, T0 + 9 * MIN)?.laps).toEqual([4 * MIN, 5 * MIN]);
  });

  it('見積もりの元がなければ残り時間は出さない', () => {
    const r = newRun('stopwatch', T0, { end: { kind: 'count', n: 3 } });
    expect(lapEndView(r, T0 + MIN).remainMs).toBeNull();
  });

  it('合計時間: 達した時刻で止まり、途中のラップも記録する', () => {
    const r = newRun('stopwatch', T0, { end: { kind: 'total', ms: 30 * MIN } });
    lap(r, T0 + 20 * MIN);
    expect(lapEndView(r, T0 + 25 * MIN).remainMs).toBe(5 * MIN);
    const v = lapEndView(r, T0 + 34 * MIN); // 開き直したのが遅れた
    expect([v.done, v.doneAt]).toEqual([true, T0 + 30 * MIN]);
    expect(finish(r, v.doneAt)?.laps).toEqual([20 * MIN, 10 * MIN]);
  });

  it('時刻: その時刻で止まる', () => {
    const at = T0 + 45 * MIN;
    const r = newRun('timerUp', T0, { durationMs: 10 * MIN, end: { kind: 'clock', at } });
    expect(lapEndView(r, T0 + 40 * MIN).remainMs).toBe(5 * MIN);
    const v = lapEndView(r, T0 + 60 * MIN);
    expect([v.done, v.doneAt]).toEqual([true, at]);
    expect(finish(r, v.doneAt)?.studyMs).toBe(45 * MIN);
  });

  it('終了条件なし', () => {
    expect(lapEndView(newRun('stopwatch', T0), T0 + MIN).done).toBe(false);
  });
});

describe('ラップ番号で終える', () => {
  it('231番から始めて 233番まで: 3ラップで終わる', () => {
    const r = newRun('stopwatch', T0, { firstLap: 231, end: { kind: 'lapNo', to: 233 }, lapEstMs: 10 * MIN });
    expect(lapEndView(r, T0).remainLaps).toBe(3);
    lap(r, T0 + 10 * MIN);
    lap(r, T0 + 20 * MIN);
    const v = lapEndView(r, T0 + 25 * MIN);
    expect([v.remainLaps, v.remainMs, v.done]).toEqual([1, 5 * MIN, false]);
    lap(r, T0 + 30 * MIN);
    expect(lapEndView(r, T0 + 30 * MIN).done).toBe(true);
  });
});

describe('集計の区切り', () => {
  const mk = (start: number, studyMs: number, laps: number[] = [], firstLap = 1) => ({
    id: String(start),
    mode: 'stopwatch' as const,
    start,
    end: start + studyMs,
    studyMs,
    laps,
    firstLap,
  });

  it('1日の区切りを 4:00 にすると、深夜の勉強は前の日に数える', () => {
    const lateNight = new Date(2026, 10, 15, 1, 30).getTime(); // 日曜 1:30
    const sat = new Date(2026, 10, 14, 4, 0).getTime(); // 土曜 4:00
    expect(studyDayStart(lateNight, 240)).toBe(sat);
    expect(studyDayStart(lateNight, 0)).toBe(new Date(2026, 10, 15).getTime());
    const s = summarize([mk(lateNight, 60 * MIN)], lateNight, { boundaryMin: 240 });
    expect(s.todayIndex).toBe(5); // 土曜として数える
    expect(s.days[5]).toBe(60 * MIN);
    expect(s.todayMs).toBe(60 * MIN);
  });

  it('週の始まりを日曜にできる', () => {
    const monStart = studyWeekStart(T0, { weekStartsOn: 1 });
    const sunStart = studyWeekStart(T0, { weekStartsOn: 0 });
    expect(new Date(monStart).getDay()).toBe(1);
    expect(new Date(sunStart).getDay()).toBe(0);
    const s = summarize([], T0, { weekStartsOn: 0 });
    expect(s.todayIndex).toBe(6); // 土曜は日曜始まりの週の最後の日
  });

  it('前の週を表示しても、今日の合計は今日のもの', () => {
    const lastWeek = T0 - 7 * 24 * 60 * MIN;
    const s = summarize([mk(lastWeek, 30 * MIN), mk(T0 - MIN * 90, 20 * MIN)], T0, { ref: lastWeek });
    expect([s.todayIndex, s.weekMs, s.todayMs]).toEqual([-1, 30 * MIN, 20 * MIN]);
    expect(s.daySessions[5].map((x) => x.studyMs)).toEqual([30 * MIN]);
  });

  it('1日の詳細: ラップに番号をつけ、棒の区切りはラップごと', () => {
    const d = dayDetail([
      mk(T0, 22 * MIN, [10 * MIN, 12 * MIN], 231),
      { ...mk(T0 + 60 * MIN, 25 * MIN), mode: 'pomoCycle' as const },
    ]);
    expect(d.laps.map((l) => [l.no, l.session])).toEqual([
      [231, 0],
      [232, 0],
    ]);
    expect([d.totalMs, d.lapAvgMs, d.lapMaxMs]).toEqual([47 * MIN, 11 * MIN, 12 * MIN]);
    expect(d.segments).toEqual([10 * MIN, 12 * MIN, 25 * MIN]);
  });

  it('棒の上の短い時間', () => {
    expect(fmtShort(45 * MIN)).toBe('45分');
    expect(fmtShort(222 * MIN)).toBe('3:42');
    expect(fmtShort(222 * MIN, 'm')).toBe('222分');
  });
});

describe('残り時間の目安をタイマーの設定時間にする', () => {
  it('ラップの平均ではなく、いつも設定時間で見積もる', () => {
    const base = { durationMs: 10 * MIN, end: { kind: 'count' as const, n: 5 }, lapEstMs: 10 * MIN };
    const avg = newRun('timerUp', T0, base);
    const fixed = newRun('timerUp', T0, { ...base, estimateFixed: true });
    for (const r of [avg, fixed]) {
      lap(r, T0 + 20 * MIN); // 1ラップ目に20分かかった
    }
    // 残り4ラップ、今のラップは0分経過
    expect(lapEndView(avg, T0 + 20 * MIN).remainMs).toBe(4 * 20 * MIN);
    expect(lapEndView(fixed, T0 + 20 * MIN).remainMs).toBe(4 * 10 * MIN);
  });
});
