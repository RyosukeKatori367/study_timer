import { describe, expect, it } from 'vitest';
import { ALL_ITEMS, GACHA_ITEMS, PATTERNS, REFUND, THEMES, currentRates, pickRarity, pickReward } from './styles';

const none = () => false;

describe('グミガチャ', () => {
  it('レア度は書いてある確率で決まる（乱数 0 → N、0.999 → シークレット、0.9996 → 豪運）', () => {
    expect(pickRarity(() => 0)).toBe('N');
    expect(pickRarity(() => 0.5)).toBe('R');
    expect(pickRarity(() => 0.999)).toBe('SECRET');
    expect(pickRarity(() => 0.9996)).toBe('LEGEND');
    expect(pickReward(none, () => 0.9996).item.name).toBe('豪運');
  });
  it('そのレア度のまだ持っていないものから選ぶ', () => {
    const ownedN = new Set(GACHA_ITEMS.filter((x) => x.rarity === 'N').slice(1).map((x) => x.id));
    const r = pickReward((id) => ownedN.has(id), () => 0);
    expect(r.item.rarity).toBe('N');
    expect(r.dupe).toBe(false);
    expect(ownedN.has(r.item.id)).toBe(false);
  });
  it('そのレア度を全部持っていたら、かぶりでグミが返ってくる', () => {
    const all = new Set(GACHA_ITEMS.map((x) => x.id));
    const r = pickReward((id) => all.has(id), () => 0);
    expect(r.dupe).toBe(true);
    expect(r.refund).toBe(REFUND.N);
  });
  it('回数を重ねると N のほうが SSR より多い', () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const count: Record<string, number> = { N: 0, R: 0, SR: 0, SSR: 0, SECRET: 0, LEGEND: 0 };
    for (let i = 0; i < 3000; i++) count[pickReward(none, rand).item.rarity]++;
    expect(count.N).toBeGreaterThan(count.R);
    expect(count.R).toBeGreaterThan(count.SR);
    expect(count.SR).toBeGreaterThan(count.SSR);
  });
  it('次の確率：1つずつの合計とかぶりの合計で 100%', () => {
    const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
    const fresh = currentRates(none);
    expect(sum(fresh.item)).toBeCloseTo(100, 6);
    expect(fresh.dupe).toBe(0);
    const ownN = new Set(GACHA_ITEMS.filter((x) => x.rarity === 'N').map((x) => x.id));
    const noN = currentRates((id) => ownN.has(id));
    expect(noN.dupe).toBeCloseTo(50);
    expect(noN.rarity.R).toBe(30); // ほかのレア度の確率は変わらない
    expect(sum(noN.item) + noN.dupe).toBeCloseTo(100, 6);
  });
  it('全部で101種類（テーマと模様が100・豪運タグ1）、ベースカラー12・シークレット1', () => {
    expect(ALL_ITEMS.length).toBe(101);
    expect(ALL_ITEMS.filter((x) => x.rarity === 'LEGEND').map((x) => x.name)).toEqual(['豪運']);
    expect(THEMES.filter((x) => x.rarity === 'BASE').length).toBe(12);
    expect(ALL_ITEMS.filter((x) => x.rarity === 'SECRET').length).toBe(1);
    expect(GACHA_ITEMS.every((x) => x.rarity !== 'BASE')).toBe(true);
  });
  it('id がかぶっていない', () => {
    const ids = [...THEMES, ...PATTERNS].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
