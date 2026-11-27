import { describe, expect, it } from 'vitest';
import { finish, lap, newRun } from './engine';
import {
  addMaterial,
  addSession,
  archiveMaterial,
  assignUntagged,
  currentMaterialId,
  endLapNo,
  exportBackup,
  lastLapSession,
  materialName,
  nextLapNumber,
  saveSettings,
  setEndLapNo,
  setNextLap,
} from './store';

const MIN = 60000;
const T0 = new Date(2026, 10, 27, 15, 0).getTime();

/** n ラップの記録を作って保存する */
function record(firstLap: number, n: number, material?: string, at = T0) {
  const r = newRun('stopwatch', at, { firstLap, material });
  for (let i = 1; i <= n; i++) lap(r, at + i * 10 * MIN);
  const s = finish(r, at + n * 10 * MIN);
  addSession(s!);
  return s!;
}

describe('教材ごとのラップ番号', () => {
  it('教材を作る前の記録を、最初の教材に引き継げる', () => {
    record(226, 5); // 教材なしで 226〜230
    expect(nextLapNumber(null)).toBe(231);
    const lead = addMaterial('リードα');
    assignUntagged(lead.id);
    expect(lastLapSession(null)).toBeNull();
    expect(nextLapNumber(lead.id)).toBe(231);
  });

  it('教材ごとに、前回の続きの番号が別になる', () => {
    const [lead] = [addMaterial('リードα2')];
    const meimon = addMaterial('名門の森');
    record(1, 3, lead.id, T0 + 60 * MIN);
    record(40, 2, meimon.id, T0 + 120 * MIN);
    expect(nextLapNumber(lead.id)).toBe(4);
    expect(nextLapNumber(meimon.id)).toBe(42);
    expect(lastLapSession(meimon.id)?.firstLap).toBe(40);

    // 選んでいる教材が初期値になる
    saveSettings({ materialId: meimon.id });
    expect(currentMaterialId()).toBe(meimon.id);
    expect(nextLapNumber()).toBe(42);

    // 手で決めた番号も教材ごと
    setNextLap(100);
    expect(nextLapNumber(meimon.id)).toBe(100);
    expect(nextLapNumber(lead.id)).toBe(4);
  });

  it('教材を消しても記録の名前は残り、選んでいたら教材なしに戻る', () => {
    const m = addMaterial('消す教材');
    record(1, 1, m.id, T0 + 300 * MIN);
    saveSettings({ materialId: m.id });
    archiveMaterial(m.id);
    expect(currentMaterialId()).toBeNull();
    expect(materialName(m.id)).toBe('消す教材');
    expect(materialName(null)).toBe('教材なし');
  });

  it('書き出しに教材が入る', () => {
    const data = JSON.parse(exportBackup());
    expect(data.version).toBe(2);
    expect(data.materials.map((m: { name: string }) => m.name)).toContain('名門の森');
    expect(data.sessions.some((s: { material?: string }) => s.material)).toBe(true);
  });
});

describe('終了条件のラップ番号は教材ごと', () => {
  it('教材ごとに別の番号を覚え、教材なしは設定の値を使う', () => {
    const a = addMaterial('教材A');
    const b = addMaterial('教材B');
    expect(endLapNo(a.id)).toBeNull(); // まだ決めていない
    setEndLapNo(240, a.id);
    setEndLapNo(50, b.id);
    setEndLapNo(15, null);
    expect([endLapNo(a.id), endLapNo(b.id), endLapNo(null)]).toEqual([240, 50, 15]);
    saveSettings({ materialId: b.id });
    expect(endLapNo()).toBe(50);
  });
});

describe('クラウドから取り込む', () => {
  it('ない記録を足し、同じ id は二重にしない', async () => {
    const { mergeCloud, getSessions } = await import('./store');
    const base = getSessions().length;
    const s = record(1, 2, undefined, T0 + 400 * MIN);
    const other = { ...s, id: 'other-device', start: s.start + 1, end: s.end + 1 };
    expect(mergeCloud({ sessions: [s, other] })).toBe(true);
    expect(getSessions().length).toBe(base + 2);
    expect(mergeCloud({ sessions: [s, other] })).toBe(false);
  });
  it('別の端末で全部消したら、その時刻までの記録を消す', async () => {
    const { mergeCloud, getSessions } = await import('./store');
    const last = getSessions().at(-1)!;
    mergeCloud({ clearedAt: last.end });
    expect(getSessions().length).toBe(0);
  });
  it('教材は id の順に並べて、色がどの端末でも同じになる', async () => {
    const { mergeCloud, allMaterials } = await import('./store');
    mergeCloud({ materials: [{ id: 'm0000aaa', name: '古い教材', nextLap: null }] });
    const ids = allMaterials().map((m) => m.id);
    expect(ids[0]).toBe('m0000aaa');
    expect([...ids].sort()).toEqual(ids);
  });
  it('設定はクラウドのもので置き換え、知らない項目は入れない', async () => {
    const { mergeCloud, settings } = await import('./store');
    mergeCloud({ settings: { dailyGoalMs: 7 * MIN, bogus: 1 } as never });
    expect(settings.dailyGoalMs).toBe(7 * MIN);
    expect('bogus' in settings).toBe(false);
  });
});
