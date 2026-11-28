import { describe, expect, it } from 'vitest';
import { ALL_ITEMS, GACHA_ITEMS, PATTERNS, THEMES, currentRates, pickReward, type StyleItem } from './styles';

describe('グミガチャ', () => {
  it('まだ持っていないものから選ぶ。全部持っていたら null', () => {
    expect(pickReward([])).toBeNull();
    const locked = GACHA_ITEMS;
    for (let i = 0; i < 50; i++) expect(locked).toContain(pickReward(locked));
  });
  it('レア度を先に重みで選ぶ（N が出やすく、SSR は出にくい）', () => {
    const locked = GACHA_ITEMS;
    // 乱数 0 → いちばん出やすい N、乱数ほぼ 1 → SSR
    expect(pickReward(locked, () => 0)!.rarity).toBe('N');
    expect(pickReward(locked, () => 0.999)!.rarity).toBe('SECRET');
    // 回数を重ねると、N のほうが SSR より多い
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const count: Record<string, number> = { N: 0, R: 0, SR: 0, SSR: 0, SECRET: 0, LEGEND: 0 };
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
  it('全部で101種類（テーマと模様が100・豪運タグ1）、ベースカラー12・シークレット1', () => {
    expect(ALL_ITEMS.length).toBe(101);
    expect(ALL_ITEMS.filter((x) => x.rarity === 'LEGEND').map((x) => x.name)).toEqual(['豪運']);
    expect(THEMES.filter((x) => x.rarity === 'BASE').length).toBe(12);
    expect(ALL_ITEMS.filter((x) => x.rarity === 'SECRET').length).toBe(1);
    expect(GACHA_ITEMS.every((x) => x.rarity !== 'BASE')).toBe(true);
  });
  it('今の確率は合計100%、持っていないものがないレア度は割り振り直す', () => {
    const all = currentRates(GACHA_ITEMS);
    const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
    expect(sum(all.item)).toBeCloseTo(100, 6);
    expect(all.rarity.N).toBeCloseTo(50);
    const noN = currentRates(GACHA_ITEMS.filter((x) => x.rarity !== 'N'));
    expect(noN.rarity.N).toBe(0);
    expect(noN.rarity.R).toBeCloseTo(60); // 30 / (30+14+4.95+1+0.05)
    expect(all.rarity.LEGEND).toBeCloseTo(0.05);
    expect(sum(noN.item)).toBeCloseTo(100, 6);
  });
  it('id がかぶっていない', () => {
    const ids = [...THEMES, ...PATTERNS].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
