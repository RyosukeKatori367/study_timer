import { describe, expect, it } from 'vitest';
import { absTime, likeNames, postTime, relTime, timeRange } from './fmt';

const NOW = new Date(2026, 10, 27, 16, 42).getTime();
const at = (d: number, h: number, m: number) => new Date(2026, 10, d, h, m).getTime();

describe('投稿の時刻', () => {
  it('今日は時刻だけ、昨日は「昨日」、それより前は日付', () => {
    expect(absTime(at(27, 16, 30), NOW)).toBe('16:30');
    expect(absTime(at(26, 23, 5), NOW)).toBe('昨日 23:05');
    expect(absTime(at(24, 9, 0), NOW)).toBe('11/24 9:00');
  });
  it('どれくらい前か', () => {
    expect(relTime(NOW - 10_000, NOW)).toBe('たった今');
    expect(relTime(at(27, 16, 30), NOW)).toBe('12分前');
    expect(relTime(at(27, 13, 0), NOW)).toBe('3時間前');
    expect(relTime(at(25, 16, 0), NOW)).toBe('2日前');
    expect(relTime(at(10, 16, 0), NOW)).toBe('');
  });
  it('両方を並べる', () => {
    expect(postTime(at(27, 16, 30), NOW)).toBe('16:30・12分前');
    expect(postTime(at(10, 16, 0), NOW)).toBe('11/10 16:00');
    expect(timeRange(at(27, 14, 27), at(27, 16, 30))).toBe('14:27〜16:30');
  });
  it('いいねの名前', () => {
    expect(likeNames(['a', 'b'])).toBe('a・b');
    expect(likeNames(['a', 'b', 'c', 'd', 'e'])).toBe('a・b・c ほか2人');
  });
});
