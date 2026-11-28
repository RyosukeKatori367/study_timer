// カレンダーの予定（やること）。
// 設定（settings.plans）に入れてバックアップする。端末どうしでは id ごとに新しく変えたほうを残し、
// 消した予定は「消した」しるしだけ残す（ほかの端末から戻ってこないように）。
//
// 済みかどうか
//   - 手で済みにした
//   - 教材と範囲（第3〜5講など）があれば、その教材の次の番号が範囲を越えたら自動で済み
//   - 教材と目標時間があれば、その日にその教材を目標時間 勉強したら自動で済み

import type { Session } from './engine';
import { studyDayStart } from './summary';

export interface Plan {
  id: string;
  /** 勉強の日（'2026-11-29'。1日の区切りの設定に合わせた日） */
  d: string;
  /** やること（教材を選んだときは空でもいい） */
  t: string;
  /** 教材の id */
  m?: string;
  /** 範囲（番号）。a〜b */
  a?: number;
  b?: number;
  /** 目標時間（ミリ秒） */
  ms?: number;
  /** 時刻（0:00 からの分）。iPhone のカレンダーに入れたときの通知にも使う */
  at?: number;
  /** 手で済みにした時刻 */
  done?: number;
  /** 消した */
  del?: 1;
  /** まとめて登録したときの、まとまりの id */
  g?: string;
  /** iPhone のカレンダーに書き出した時刻 */
  x?: number;
  /** 最後に変えた時刻（端末どうしで新しいほうを残す） */
  u: number;
}

export const PLAN_TEXT_MAX = 40;
/** 消した予定のしるしを残す日数 */
const TOMBSTONE_DAYS = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

export const newPlanId = (): string => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---- 日付（'YYYY-MM-DD'） ----

const pad = (n: number) => String(n).padStart(2, '0');
export const keyOf = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** その日の 0:00（端末の時刻） */
export function dateOf(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDaysKey(key: string, n: number): string {
  const d = dateOf(key);
  d.setDate(d.getDate() + n);
  return keyOf(d);
}
export const weekdayOf = (key: string): number => dateOf(key).getDay();
/** 勉強の日（1日の区切りの前の深夜は前の日） */
export const studyDayKey = (ts: number, boundaryMin = 0): string =>
  keyOf(new Date(studyDayStart(ts, boundaryMin) - boundaryMin * 60000));
/** その日の勉強の始まりの時刻 */
export const dayStartOf = (key: string, boundaryMin = 0): number => dateOf(key).getTime() + boundaryMin * 60000;
/** その週の始まりの日（weekStartsOn 1 = 月曜） */
export function weekStartKey(key: string, weekStartsOn: 0 | 1): string {
  const back = (weekdayOf(key) - weekStartsOn + 7) % 7;
  return addDaysKey(key, -back);
}
const isKey = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);

// ---- 済みかどうか ----

/** 日ごと・教材ごとの勉強時間（'2026-11-29' → 教材の id（なしは ''） → ミリ秒） */
export type DayMaterialMs = Map<string, Map<string, number>>;

export function studyByDay(sessions: readonly Session[], boundaryMin = 0): DayMaterialMs {
  const out: DayMaterialMs = new Map();
  for (const s of sessions) {
    if (s.studyMs <= 0) continue;
    const k = studyDayKey(s.start, boundaryMin);
    let m = out.get(k);
    if (!m) out.set(k, (m = new Map()));
    const id = s.material ?? '';
    m.set(id, (m.get(id) ?? 0) + s.studyMs);
  }
  return out;
}

export const dayTotal = (by: DayMaterialMs, key: string): number => {
  let t = 0;
  for (const v of by.get(key)?.values() ?? []) t += v;
  return t;
};

export interface PlanStatus {
  done: boolean;
  /** 記録から自動で済みになった */
  auto: boolean;
  /** 範囲のうち、済んだ数 */
  rangeDone?: number;
  rangeAll?: number;
  /** その日にその教材を勉強した時間 */
  studied?: number;
}

/**
 * 予定が済んだか。nextLap は教材の次の番号（なければ 1）、by は日ごとの勉強時間
 */
export function planStatus(p: Plan, nextLap: (materialId: string) => number, by: DayMaterialMs): PlanStatus {
  const st: PlanStatus = { done: false, auto: false };
  let autoParts = 0;
  let autoDone = 0;
  if (p.m && p.b !== undefined) {
    const a = p.a ?? p.b;
    const next = nextLap(p.m);
    st.rangeAll = p.b - a + 1;
    st.rangeDone = Math.max(0, Math.min(st.rangeAll, next - a));
    autoParts++;
    if (next > p.b) autoDone++;
  }
  if (p.m && p.ms) {
    st.studied = by.get(p.d)?.get(p.m) ?? 0;
    autoParts++;
    if (st.studied >= p.ms) autoDone++;
  }
  if (autoParts > 0 && autoDone === autoParts) {
    st.done = true;
    st.auto = true;
  }
  if (p.done) st.done = true;
  return st;
}

// ---- 並べる ----

/** その日の予定（時刻のあるものを先に時刻順、ほかは作った順） */
export function plansOn(plans: readonly Plan[], key: string): Plan[] {
  return plans
    .filter((p) => !p.del && p.d === key)
    .sort((x, y) => (x.at ?? 9999) - (y.at ?? 9999) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

// ---- 端末どうしで合わせる ----

/** おかしな値を捨てて、予定の形にそろえる */
export function cleanPlan(x: unknown): Plan | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id || typeof o.u !== 'number' || !isKey(o.d)) return null;
  const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.floor(v) : undefined);
  const p: Plan = { id: o.id, d: o.d, t: typeof o.t === 'string' ? o.t.slice(0, PLAN_TEXT_MAX) : '', u: o.u };
  if (o.del) return { ...p, t: '', del: 1 };
  if (typeof o.m === 'string' && o.m) p.m = o.m;
  const a = num(o.a, 1, 99999);
  const b = num(o.b, 1, 99999);
  if (b !== undefined) {
    p.b = b;
    p.a = a !== undefined && a <= b ? a : b;
  }
  const ms = num(o.ms, 60000, 24 * 3600000);
  if (ms !== undefined) p.ms = ms;
  const at = num(o.at, 0, 24 * 60 - 1);
  if (at !== undefined) p.at = at;
  const done = num(o.done, 1, Number.MAX_SAFE_INTEGER);
  if (done !== undefined) p.done = done;
  if (typeof o.g === 'string' && o.g) p.g = o.g;
  const xx = num(o.x, 1, Number.MAX_SAFE_INTEGER);
  if (xx !== undefined) p.x = xx;
  return p;
}

/**
 * 2つの端末の予定を合わせる。同じ id は新しく変えたほうを残す。
 * 消したしるしは TOMBSTONE_DAYS 日たったら捨てる
 */
export function mergePlans(a: readonly unknown[], b: unknown, now = Date.now()): Plan[] {
  const out = new Map<string, Plan>();
  const add = (x: unknown) => {
    const p = cleanPlan(x);
    if (!p) return;
    const cur = out.get(p.id);
    if (!cur || p.u > cur.u) out.set(p.id, p);
  };
  a.forEach(add);
  if (Array.isArray(b)) b.forEach(add);
  return [...out.values()].filter((p) => !p.del || now - p.u < TOMBSTONE_DAYS * DAY_MS);
}

/** 2つの予定の一覧が同じか（id と更新時刻で比べる） */
export function samePlans(a: readonly Plan[], b: readonly Plan[]): boolean {
  if (a.length !== b.length) return false;
  const m = new Map(a.map((p) => [p.id, p.u]));
  return b.every((p) => m.get(p.id) === p.u);
}

// ---- まとめて登録（講座など） ----

export interface BulkInput {
  m: string;
  /** 第 from 〜 to */
  from: number;
  to: number;
  /** 1日にいくつ */
  perDay: number;
  /** やる曜日（0 = 日曜） */
  weekdays: number[];
  /** 始める日 */
  start: string;
  at?: number;
}

/** 範囲を、決めた曜日に perDay ずつ割り振る（日の一覧。最大 366 日） */
export function bulkSchedule(x: BulkInput): { d: string; a: number; b: number }[] {
  const out: { d: string; a: number; b: number }[] = [];
  if (x.to < x.from || x.perDay < 1 || x.weekdays.length === 0) return out;
  let n = x.from;
  let d = x.start;
  for (let guard = 0; n <= x.to && guard < 3660; guard++) {
    if (x.weekdays.includes(weekdayOf(d))) {
      const b = Math.min(x.to, n + x.perDay - 1);
      out.push({ d, a: n, b });
      n = b + 1;
      if (out.length >= 366) break;
    }
    d = addDaysKey(d, 1);
  }
  return out;
}

export function bulkPlans(x: BulkInput, now = Date.now()): Plan[] {
  const g = `g${now.toString(36)}`;
  return bulkSchedule(x).map((s, i) => ({
    id: `${newPlanId()}${i.toString(36)}`,
    d: s.d,
    t: '',
    m: x.m,
    a: s.a,
    b: s.b,
    ...(x.at !== undefined ? { at: x.at } : {}),
    g,
    u: now,
  }));
}

// ---- iPhone のカレンダーに入れる（.ics） ----

/** .ics の文字のエスケープ */
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const compact = (key: string) => key.replaceAll('-', '');
const stamp = (ts: number) => new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
/** 75バイトごとに折り返す（.ics の決まり。日本語は1文字ずつ数えて安全側に） */
function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > 73) {
      out.push(cur);
      cur = ' ';
      bytes = 1;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

/**
 * 予定を .ics にする。title(p) で予定の名前を決める。
 * 時刻のある予定は、その時刻から（目標時間か1時間）で、始まる時刻に通知。時刻のない予定は終日で、その日の朝8時に通知
 */
export function toIcs(plans: readonly Plan[], title: (p: Plan) => string, now = Date.now()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//gumiben//plans//JA', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:グミ勉'];
  for (const p of plans) {
    if (p.del) continue;
    lines.push('BEGIN:VEVENT', `UID:${p.id}@gumiben`, `DTSTAMP:${stamp(now)}`);
    if (p.at !== undefined) {
      const start = new Date(dateOf(p.d).getTime() + p.at * 60000);
      const end = new Date(start.getTime() + (p.ms ?? 3600000));
      const local = (d: Date) => `${keyOf(d).replaceAll('-', '')}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
      lines.push(`DTSTART:${local(start)}`, `DTEND:${local(end)}`);
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(title(p))}`, 'TRIGGER:PT0M', 'END:VALARM');
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compact(p.d)}`, `DTEND;VALUE=DATE:${compact(addDaysKey(p.d, 1))}`);
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(title(p))}`, 'TRIGGER:PT8H', 'END:VALARM');
    }
    lines.push(fold(`SUMMARY:${icsText(title(p))}`), 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
