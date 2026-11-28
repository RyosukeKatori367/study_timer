import { describe, expect, it } from 'vitest';
import { addMaterial } from './store';
import { commonUnit, count, nth, one, range, unitById, unitFor } from './units';

describe('数え方', () => {
  it('問・講・ページの書き方', () => {
    const q = unitById('問');
    const k = unitById('講');
    const p = unitById('ページ');
    expect(nth(9, q)).toBe('9問目');
    expect(nth(9, k)).toBe('第9講');
    expect(nth(9, p)).toBe('9ページ');
    expect(count(10, q)).toBe('10問');
    expect(count(10, k)).toBe('10講');
    expect(range(231, 240, q)).toBe('231〜240問目');
    expect(range(3, 5, k)).toBe('第3〜5講');
    expect(range(7, 7, k)).toBe('第7講');
    expect(one(q)).toBe('1問');
    expect(q.upTo).toBe('何問目まで');
  });
  it('教材なし・知らない値は「問」。教材ごとに選べる', () => {
    expect(unitFor(null).id).toBe('問');
    expect(unitById('xxx').id).toBe('問');
    const m = addMaterial('東進 数学', { unit: '講' });
    expect(unitFor(m.id).id).toBe('講');
    expect(commonUnit([m.id, m.id])?.id).toBe('講');
    expect(commonUnit([m.id, null])).toBeNull();
  });
});
