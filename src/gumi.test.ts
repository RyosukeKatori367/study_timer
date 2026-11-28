import { describe, expect, it } from 'vitest';
import { addSession, mergeLedger, settings } from './store';
import { balance, claimLogin, earn, loginStatus, spend, syncStudyBonus } from './gumi';
import { drawGacha, exchange } from './shop';
import { GACHA_ITEMS, isOwned } from './styles';

const HOUR = 3600000;
const day = (d: number) => new Date(2026, 10, d, 12).getTime();

describe('グミの台帳', () => {
  it('同じキーは1回だけ。足りなければ使えない', () => {
    settings.gumi = {};
    expect(earn('a:test', 50)).toBe(true);
    expect(earn('a:test', 50)).toBe(false);
    expect(balance()).toBe(50);
    expect(spend(120, 'g:1')).toBeNull();
    expect(balance()).toBe(50);
  });
  it('端末どうしでは足し合わせる（同じキーは大きいほう、おかしな値は捨てる）', () => {
    const m = mergeLedger({ 'l:2026-11-27': 120, s: 60 }, { 'l:2026-11-28': 120, s: 90, bad: 'x', g: NaN });
    expect(m).toEqual({ 'l:2026-11-27': 120, 'l:2026-11-28': 120, s: 90 });
  });
});

describe('ログインボーナス', () => {
  it('はじめは開店記念もいっしょ。1日1回', () => {
    settings.gumi = {};
    expect(claimLogin(day(1))).toBe(120 + 300);
    expect(claimLogin(day(1))).toBe(0);
    expect(loginStatus(day(1))).toMatchObject({ claimed: true, streak: 1, day: 1 });
  });
  it('7日続けると7日目は2回分。1日あくと1日目に戻る', () => {
    settings.gumi = {};
    for (let d = 1; d <= 6; d++) claimLogin(day(d));
    expect(loginStatus(day(7))).toMatchObject({ claimed: false, day: 7, amount: 240 });
    expect(claimLogin(day(7))).toBe(240);
    expect(loginStatus(day(8)).day).toBe(1);
    expect(loginStatus(day(10))).toMatchObject({ streak: 1, day: 1 });
  });
});

describe('勉強ボーナス', () => {
  it('累計3時間ごとに30。増えた分だけ', () => {
    settings.gumi = {};
    addSession({ id: 's1', mode: 'stopwatch', start: day(2), end: day(2) + 4 * HOUR, studyMs: 4 * HOUR, laps: [4 * HOUR], firstLap: 1 });
    expect(syncStudyBonus()).toBe(30);
    expect(syncStudyBonus()).toBe(0);
    addSession({ id: 's2', mode: 'stopwatch', start: day(3), end: day(3) + 3 * HOUR, studyMs: 3 * HOUR, laps: [3 * HOUR], firstLap: 1 });
    expect(syncStudyBonus()).toBe(30); // 7時間 → 2回分
    expect(settings.gumi.s).toBe(60);
  });
});

describe('ショップ', () => {
  it('10回引くと1200使い、同じものは出ない', () => {
    settings.gumi = { b: 2000 };
    settings.unlocked = [];
    const r = drawGacha(10, () => 0.1)!;
    expect(r).toHaveLength(10);
    expect(new Set(r.map((x) => x.item.id)).size).toBe(10);
    expect(balance()).toBe(800);
    expect(settings.unlocked).toHaveLength(10);
    expect(drawGacha(10)).toBeNull(); // 足りない
  });
  it('かぶったらお返しが台帳に入る', () => {
    settings.unlocked = GACHA_ITEMS.map((x) => x.id);
    settings.gumi = { b: 120 };
    const r = drawGacha(1, () => 0)!;
    expect(r[0].dupe).toBe(true);
    expect(balance()).toBe(20);
  });
  it('交換所は値段どおり。シークレットは交換できない', () => {
    settings.unlocked = [];
    settings.gumi = { b: 1000 };
    const n = GACHA_ITEMS.find((x) => x.rarity === 'N')!;
    const secret = GACHA_ITEMS.find((x) => x.rarity === 'SECRET')!;
    expect(exchange(n)).toBe(true);
    expect(isOwned(n.id)).toBe(true);
    expect(balance()).toBe(700);
    expect(exchange(n)).toBe(false);
    expect(exchange(secret)).toBe(false);
  });
});
