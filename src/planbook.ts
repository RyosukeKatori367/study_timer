// 予定（src/plans.ts）を、端末の設定に入れたり出したりする。カレンダーとホームで使う。

import { addDaysKey, planStatus, plansOn, studyByDay, studyDayKey, type DayMaterialMs, type Plan, type PlanStatus } from './plans';
import { getSessions, materialName, nextLapNumber, onStoreChange, saveSettings, settings } from './store';
import { range, unitFor } from './units';
import { fmtHM, pad2 } from './time';

/** 予定が増えた・変わった・消えた */
export const PLANS_CHANGE = 'plans:change';
const notify = () => document.dispatchEvent(new CustomEvent(PLANS_CHANGE));

export const livePlans = (): Plan[] => settings.plans.filter((p) => !p.del);
export const planById = (id: string): Plan | undefined => settings.plans.find((p) => p.id === id && !p.del);
export const todayKey = (now = Date.now()): string => studyDayKey(now, settings.dayBoundaryMin);
export const dayPlans = (key: string): Plan[] => plansOn(settings.plans, key);

/** 予定を足す・書きかえる（同じ id は置きかえ） */
export function putPlans(list: Plan[]): void {
  const now = Date.now();
  const map = new Map(settings.plans.map((p) => [p.id, p]));
  for (const p of list) map.set(p.id, { ...p, u: now });
  saveSettings({ plans: [...map.values()] });
  notify();
}

/** 予定を消す（消したしるしだけ残す） */
export function deletePlans(ids: string[]): void {
  const gone = new Set(ids);
  const now = Date.now();
  saveSettings({ plans: settings.plans.map((p) => (gone.has(p.id) ? { id: p.id, d: p.d, t: '', del: 1 as const, u: now } : p)) });
  notify();
}

/** 手で済みにする・もどす */
export function toggleDone(id: string): void {
  const p = planById(id);
  if (!p) return;
  const next = { ...p };
  if (p.done) delete next.done;
  else next.done = Date.now();
  putPlans([next]);
}

// ---- 済みかどうか（記録から） ----

let cache: { key: string; by: DayMaterialMs } | null = null;
onStoreChange((c) => {
  if (c.kind !== 'state') cache = null;
});

/** 日ごと・教材ごとの勉強時間（記録が変わるまで覚えておく） */
export function studyMap(): DayMaterialMs {
  const s = getSessions();
  const key = `${s.length}:${s.at(-1)?.id ?? ''}:${settings.dayBoundaryMin}`;
  if (!cache || cache.key !== key) cache = { key, by: studyByDay(s, settings.dayBoundaryMin) };
  return cache.by;
}

export const statusOf = (p: Plan, by: DayMaterialMs = studyMap()): PlanStatus => planStatus(p, (m) => nextLapNumber(m), by);

/** 予定の名前（「物理 第3〜5講」「単語帳 50語」） */
export function planTitle(p: Plan): string {
  const name = p.t || (p.m ? materialName(p.m) : '予定');
  const r = p.m && p.b !== undefined ? range(p.a ?? p.b, p.b, unitFor(p.m)) : '';
  return r ? `${name} ${r}` : name;
}

export const fmtAt = (min: number): string => `${Math.floor(min / 60)}:${pad2(min % 60)}`;

/** 予定の下に出す1行（時刻・教材・進み具合） */
export function planSub(p: Plan, st: PlanStatus): string {
  const parts: string[] = [];
  if (p.at !== undefined) parts.push(fmtAt(p.at));
  if (p.t && p.m) parts.push(materialName(p.m));
  if (st.rangeAll !== undefined && !st.done) {
    const left = st.rangeAll - (st.rangeDone ?? 0);
    if (st.rangeDone) parts.push(`あと${left}${unitFor(p.m).cnt}`);
  }
  if (p.ms) parts.push(st.studied !== undefined ? `${fmtHM(Math.min(st.studied, p.ms))} / ${fmtHM(p.ms)}` : `目標 ${fmtHM(p.ms)}`);
  if (st.auto) parts.push('記録で済み');
  return parts.join('・');
}

/** 過ぎた日の、済んでいない予定（新しい順。days 日前まで） */
export function leftovers(today: string, days = 14): Plan[] {
  const from = addDaysKey(today, -days);
  const by = studyMap();
  return livePlans()
    .filter((p) => p.d < today && p.d >= from && !statusOf(p, by).done)
    .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
}
