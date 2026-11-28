import { describe, expect, it } from 'vitest';
import { addDaysKey, bulkSchedule, cleanPlan, mergePlans, planStatus, plansOn, studyByDay, toIcs, weekStartKey, type Plan } from './plans';
import type { Session } from './engine';

const H = 3600000;
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe('日付', () => {
  it('日を足す・週の始まり', () => {
    expect(addDaysKey('2026-11-30', 2)).toBe('2026-12-02');
    expect(addDaysKey('2026-12-31', 1)).toBe('2027-01-01');
    // 2026-11-29 は日曜
    expect(weekStartKey('2026-11-29', 1)).toBe('2026-11-23');
    expect(weekStartKey('2026-11-29', 0)).toBe('2026-11-29');
  });
});

describe('まとめて登録', () => {
  it('決めた曜日に、1日いくつずつ割り振る', () => {
    // 2026-11-30 は月曜。月水金に2つずつ
    const s = bulkSchedule({ m: 'm1', from: 1, to: 5, perDay: 2, weekdays: [1, 3, 5], start: '2026-11-30' });
    expect(s).toEqual([
      { d: '2026-11-30', a: 1, b: 2 },
      { d: '2026-12-02', a: 3, b: 4 },
      { d: '2026-12-04', a: 5, b: 5 },
    ]);
  });
  it('曜日がなければ空', () => {
    expect(bulkSchedule({ m: 'm1', from: 1, to: 5, perDay: 1, weekdays: [], start: '2026-11-30' })).toEqual([]);
  });
});

describe('済みかどうか', () => {
  const sessions: Session[] = [
    { id: 's1', mode: 'stopwatch', start: at(2026, 11, 29, 10), end: at(2026, 11, 29, 11), studyMs: 40 * 60000, laps: [], firstLap: 1, material: 'm2' },
  ];
  const by = studyByDay(sessions);
  it('範囲：次の番号が範囲を越えたら自動で済み', () => {
    const p: Plan = { id: 'p', d: '2026-11-29', t: '', m: 'm1', a: 3, b: 5, u: 1 };
    expect(planStatus(p, () => 5, by)).toMatchObject({ done: false, rangeDone: 2, rangeAll: 3 });
    expect(planStatus(p, () => 6, by)).toMatchObject({ done: true, auto: true });
  });
  it('目標時間：その日にその教材を勉強したら自動で済み', () => {
    const p: Plan = { id: 'p', d: '2026-11-29', t: '', m: 'm2', ms: 30 * 60000, u: 1 };
    expect(planStatus(p, () => 1, by)).toMatchObject({ done: true, auto: true, studied: 40 * 60000 });
    expect(planStatus({ ...p, ms: H }, () => 1, by).done).toBe(false);
    expect(planStatus({ ...p, d: '2026-11-30' }, () => 1, by).done).toBe(false);
  });
  it('手で済み', () => {
    expect(planStatus({ id: 'p', d: '2026-11-29', t: 'プリント', u: 1, done: 5 }, () => 1, by)).toMatchObject({ done: true, auto: false });
  });
});

describe('端末どうしで合わせる', () => {
  it('同じ id は新しく変えたほう。消したしるしは古くなったら捨てる', () => {
    const now = at(2026, 11, 29);
    const a: Plan[] = [
      { id: 'x', d: '2026-11-29', t: '古い', u: 1 },
      { id: 'y', d: '2026-11-29', t: '', del: 1, u: now - 200 * 24 * H },
    ];
    const b = [{ id: 'x', d: '2026-11-29', t: '新しい', u: 2 }, { id: 'z', d: '2026-11-30', t: 'べつ', u: 1 }, { bad: 1 }];
    const m = mergePlans(a, b, now);
    expect(m.map((p) => [p.id, p.t])).toEqual([
      ['x', '新しい'],
      ['z', 'べつ'],
    ]);
  });
  it('おかしな値は直す', () => {
    expect(cleanPlan({ id: 'p', d: '2026-11-29', t: 'a', u: 1, a: 9, b: 3, at: 5000 })).toEqual({ id: 'p', d: '2026-11-29', t: 'a', u: 1, b: 3, a: 3 });
    expect(cleanPlan({ id: 'p', d: '11/29', t: 'a', u: 1 })).toBeNull();
  });
  it('その日の予定は時刻の順', () => {
    const list: Plan[] = [
      { id: 'b', d: '2026-11-29', t: '2', u: 1 },
      { id: 'a', d: '2026-11-29', t: '1', at: 600, u: 1 },
      { id: 'c', d: '2026-11-29', t: '消した', del: 1, u: 1 },
    ];
    expect(plansOn(list, '2026-11-29').map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('.ics', () => {
  it('終日と時刻つき', () => {
    const text = toIcs(
      [
        { id: 'p1', d: '2026-11-30', t: '物理, 第3講', u: 1 },
        { id: 'p2', d: '2026-12-01', t: '数学', at: 19 * 60 + 30, ms: 90 * 60000, u: 1 },
      ],
      (p) => p.t,
      Date.UTC(2026, 10, 29),
    );
    expect(text).toContain('DTSTART;VALUE=DATE:20261130');
    expect(text).toContain('DTEND;VALUE=DATE:20261201');
    expect(text).toContain('SUMMARY:物理\\, 第3講');
    expect(text).toContain('DTSTART:20261201T193000');
    expect(text).toContain('DTEND:20261201T210000');
    expect(text.split('BEGIN:VEVENT').length).toBe(3);
  });
});
