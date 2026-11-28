// ショップ：グミガチャ（1回・10回）と交換所。グミが足りなければ何もしない。

import { newId, spend } from './gumi';
import { settings } from './store';
import { GACHA10_COST, GACHA_COST, exchangePrice, isOwned, itemById, pickLimited, pickReward, type DrawResult, type StyleItem } from './styles';

/** ガチャを n 回引く。グミが足りなければ null */
export function drawGacha(n: 1 | 10, rand: () => number = Math.random): DrawResult[] | null {
  const cost = n === 10 ? GACHA10_COST : GACHA_COST;
  const owned = new Set(settings.unlocked);
  const has = (id: string) => itemById(id)?.rarity === 'BASE' || owned.has(id);
  const results: DrawResult[] = [];
  for (let i = 0; i < n; i++) {
    const r = pickReward(has, rand);
    results.push(r);
    if (!r.dupe) owned.add(r.item.id);
  }
  const id = newId();
  const refund = results.reduce((t, r) => t + r.refund, 0);
  const key = spend(cost, `${n === 10 ? 'G' : 'g'}:${id}`, refund ? { [`r:${id}`]: refund } : {}, { unlocked: [...owned] });
  return key ? results : null;
}

/** 期間限定ガチャを n 回引く（値段はいつものガチャと同じ）。グミが足りなければ null */
export function drawLimited(season: string, n: 1 | 10, rand: () => number = Math.random): DrawResult[] | null {
  const cost = n === 10 ? GACHA10_COST : GACHA_COST;
  const owned = new Set(settings.unlocked);
  const results: DrawResult[] = [];
  for (let i = 0; i < n; i++) {
    const r = pickLimited(season, (id) => owned.has(id), rand);
    results.push(r);
    if (!r.dupe) owned.add(r.item.id);
  }
  const id = newId();
  const refund = results.reduce((t, r) => t + r.refund, 0);
  const key = spend(cost, `${n === 10 ? 'K' : 'k'}:${id}`, refund ? { [`r:${id}`]: refund } : {}, { unlocked: [...owned] });
  return key ? results : null;
}

/** 交換所で手に入れる。できたら true */
export function exchange(item: StyleItem): boolean {
  const price = exchangePrice(item);
  if (price === undefined || isOwned(item.id)) return false;
  return spend(price, `x:${item.id}`, {}, { unlocked: [...settings.unlocked, item.id] }) !== null;
}
