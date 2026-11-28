import { describe, expect, it } from 'vitest';
import { ALL_ITEMS, PATTERNS, THEMES, pickReward, type StyleItem } from './styles';

describe('グミガチャ', () => {
  it('まだ持っていないものから選ぶ。全部持っていたら null', () => {
    expect(pickReward([])).toBeNull();
    const locked = ALL_ITEMS.filter((x) => x.id !== 't:default' && x.id !== 'p:none');
    for (let i = 0; i < 50; i++) expect(locked).toContain(pickReward(locked));
  });
  it('レア度を先に重みで選ぶ（N が出やすく、SSR は出にくい）', () => {
    const locked = ALL_ITEMS.filter((x) => x.id !== 't:default' && x.id !== 'p:none');
    // 乱数 0 → いちばん出やすい N、乱数ほぼ 1 → SSR
    expect(pickReward(locked, () => 0)!.rarity).toBe('N');
    expect(pickReward(locked, () => 0.999)!.rarity).toBe('SSR');
    // 回数を重ねると、N のほうが SSR より多い
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const count: Record<string, number> = { N: 0, R: 0, SR: 0, SSR: 0 };
    for (let i = 0; i < 2000; i++) count[pickReward(locked, rand)!.rarity]++;
    expect(count.N).toBeGreaterThan(count.R);
    expect(count.R).toBeGreaterThan(count.SR);
    expect(count.SR).toBeGreaterThan(count.SSR);
    expect(count.SSR).toBeGreaterThan(0);
  });
  it('残りが SSR だけなら必ず SSR', () => {
    const ssr = ALL_ITEMS.filter((x) => x.rarity === 'SSR') as StyleItem[];
    expect(pickReward(ssr, () => 0)!.rarity).toBe('SSR');
  });
  it('id がかぶっていない', () => {
    const ids = [...THEMES, ...PATTERNS].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
