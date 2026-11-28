import { describe, expect, it } from 'vitest';
import { addSession, settings } from './store';
import { claimQuest, dailyAllClear, dailyDefs, dailyQuests, weeklyDefs, weeklyQuests } from './quests';
import { longestStreak } from './achievements';
import { claimTiers, tiers } from './events';
import { daysLeftIn, seasonAt, seasonsUntil } from './seasons';

const HOUR = 3600000;
const MIN = 60000;
const at = (d: number, h = 12) => new Date(2026, 10, d, h).getTime();

describe('今日のクエスト・今週の目標', () => {
  it('日付で決まり、3つとも違う', () => {
    for (let d = 1; d <= 30; d++) {
      const key = `2026-11-${String(d).padStart(2, '0')}`;
      const ids = dailyDefs(key).map((q) => q.id);
      expect(new Set(ids).size).toBe(3);
      expect(dailyDefs(key).map((q) => q.id)).toEqual(ids);
      expect(ids[0]).toMatch(/^t/);
    }
    expect(weeklyDefs('2026-11-23').map((q) => q.id).slice(0, 2)).toEqual(['h5', 'h10']);
  });
  it('その日の記録で進み、達成したら1回だけ受け取れる', () => {
    settings.gumi = {};
    const now = at(28, 20);
    addSession({ id: 'a', mode: 'stopwatch', start: at(28, 9), end: at(28, 11), studyMs: 2 * HOUR, laps: [HOUR, HOUR], firstLap: 1 });
    addSession({ id: 'b', mode: 'stopwatch', start: at(27, 9), end: at(27, 10), studyMs: HOUR, laps: [HOUR], firstLap: 1 });
    const time = dailyQuests(now)[0];
    expect(time.value).toBe(2 * HOUR); // 前の日の分は入らない
    expect(time.done).toBe(true);
    expect(claimQuest(time)).toBe(true);
    expect(claimQuest(time)).toBe(false);
    expect(dailyQuests(now)[0].claimed).toBe(true);
    expect(dailyAllClear(now).claimed).toBe(false);
  });
  it('今週の目標は週の記録で数える', () => {
    const w = weeklyQuests(at(28, 20));
    expect(w[0].value).toBe(3 * HOUR); // 11/23（月）から
    expect(w[0].done).toBe(false);
    void MIN;
  });
});

describe('実績・イベント', () => {
  it('いちばん長い連続', () => {
    expect(longestStreak([])).toBe(0);
    expect(longestStreak(['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05', '2026-11-06'])).toBe(3);
    expect(longestStreak(['2026-10-31', '2026-11-01'])).toBe(2);
  });
  it('イベントは全員の合計と、自分がシーズン中に1時間以上で受け取れる', () => {
    settings.gumi = {};
    const s = seasonAt('2026-12-01')!;
    const t = tiers(s, 350 * HOUR, 2 * HOUR);
    expect(t.map((x) => x.ready)).toEqual([true, true, false, false, false]);
    expect(t[0].key).toBe('e:c1s1:100');
    expect(tiers(s, 350 * HOUR, 30 * MIN).some((x) => x.ready)).toBe(false);
    expect(tiers(s, null, 2 * HOUR).some((x) => x.ready)).toBe(false);
    expect(claimTiers(t)).toBe(150);
    expect(tiers(s, 350 * HOUR, 2 * HOUR).filter((x) => x.ready)).toHaveLength(0);
  });
});

describe('シーズン', () => {
  it('チャプター1 シーズン1 は 2026-11-28 から40日（1/6 まで）', () => {
    const s = seasonAt('2026-11-28')!;
    expect(s.id).toBe('c1s1');
    expect(s.name).toBe('チャプター1 シーズン1');
    expect(s.end).toBe('2027-01-06');
    expect(daysLeftIn(s, '2026-11-28')).toBe(40);
    expect(daysLeftIn(s, '2027-01-06')).toBe(1);
    expect(seasonAt('2026-11-27')).toBeNull();
  });
  it('終わったら次のシーズンが自動で続く', () => {
    const s2 = seasonAt('2027-01-07')!;
    expect(s2.id).toBe('c1s2');
    expect(s2.start).toBe('2027-01-07');
    expect(s2.end).toBe('2027-02-15');
    expect(seasonsUntil('2027-06-01').map((x) => x.id).slice(0, 4)).toEqual(['c1s1', 'c1s2', 'c1s3', 'c1s4']);
  });
});

describe('日曜ボーナス', () => {
  it('日曜日に1時間で受け取れる。ほかの日は次の日曜を出す', async () => {
    const { sundayBonus } = await import('./quests');
    const { addSession } = await import('./store');
    const sun = new Date(2026, 10, 29, 20, 0).getTime(); // 2026-11-29 は日曜
    const sat = new Date(2026, 10, 28, 20, 0).getTime();
    expect(sundayBonus(sat)).toMatchObject({ today: false, day: '2026-11-29', done: false });
    expect(sundayBonus(sun)).toMatchObject({ today: true, day: '2026-11-29', done: false, key: 'u:2026-11-29' });
    const start = new Date(2026, 10, 29, 10, 0).getTime();
    addSession({ id: 'sun1', mode: 'stopwatch', start, end: start + 61 * 60000, studyMs: 61 * 60000, laps: [], firstLap: 1 });
    expect(sundayBonus(sun)).toMatchObject({ done: true, claimed: false });
  });
});
