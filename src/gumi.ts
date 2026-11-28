// グミ（アプリの中だけのお金）。勉強・ログイン・クエスト・実績・イベントでもらい、ガチャと交換所で使う。
// 本物のお金では買えない。
//
// 残高は持たず、台帳（settings.gumi）の合計で出す。台帳のキーで「何でもらったか」が分かり、
// 同じキーは1回だけなので、同じ日のログインボーナスを2回もらうことはない。
// 端末どうしでは台帳を足し合わせるので、どちらの端末でもらった・使った分も残る。
//
// キーの形
//   b:open           開店記念
//   l:<日付>          ログインボーナス           L:<日付>  7日連続のおまけ
//   s                 勉強ボーナス（3時間ごとに30。累計の分をまとめて1件、増えるだけ）
//   d:<日付>:<id>     今日のクエスト             D:<日付>  今日のクエストを全部
//   w:<週>:<id>       今週の目標
//   e:<シーズン>:<時間> みんなのイベント（e:c1s1:100）
//   a:<id>            実績
//   g:<id> G:<id>     ガチャ1回・10回（マイナス）  r:<id>   かぶりのお返し
//   x:<スタイルid>     交換所（マイナス）

import { getSessions, saveSettings, settings, type Settings } from './store';
import { dateKey } from './cloud/model';
import { seasonShort } from './seasons';
import { HOUR } from './time';

export const GUMI_CHANGE = 'gumi:change';

export const LOGIN_BONUS = 120;
/** 7日連続で、7日目にもう1回分 */
export const STREAK_BONUS = 120;
export const STREAK_DAYS = 7;
export const OPEN_BONUS = 300;
/** 勉強ボーナス：累計の勉強時間 STUDY_BLOCK ごとに STUDY_BONUS */
export const STUDY_BLOCK = 3 * HOUR;
export const STUDY_BONUS = 30;

export const balance = (): number => Object.values(settings.gumi).reduce((t, v) => t + v, 0);
export const hasEntry = (key: string): boolean => key in settings.gumi;

const changed = () => {
  if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent(GUMI_CHANGE));
};

/** 台帳に足す（まとめて1回で保存する。patch は同時に変える設定） */
export function addEntries(entries: Record<string, number>, patch: Partial<Settings> = {}): void {
  saveSettings({ ...patch, gumi: { ...settings.gumi, ...entries } });
  changed();
}

/** もらう。もうもらっていたら false */
export function earn(key: string, amount: number): boolean {
  if (hasEntry(key)) return false;
  addEntries({ [key]: amount });
  return true;
}

export const newId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * 使う。足りなければ null。extra は同時に台帳に入れるもの（かぶりのお返しなど）。
 * 使ったときのキーを返す
 */
export function spend(amount: number, key: string, extra: Record<string, number> = {}, patch: Partial<Settings> = {}): string | null {
  if (balance() < amount || hasEntry(key)) return null;
  addEntries({ [key]: -amount, ...extra }, patch);
  return key;
}

// ---- 日付 ----

export const todayKey = (now = Date.now()): string => dateKey(now, settings.dayBoundaryMin);

/** '2026-11-28' の前の日 */
export function prevDay(key: string): string {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---- ログインボーナス ----

/** key の日まで、ログインボーナスを何日続けてもらったか（key の日も含む） */
function streakUntil(key: string): number {
  let n = 0;
  for (let k = key; hasEntry(`l:${k}`); k = prevDay(k)) n++;
  return n;
}

export interface LoginStatus {
  /** 今日はもうもらった */
  claimed: boolean;
  /** 今日を含めて何日続いているか（まだもらっていなければ、もらったら何日目か） */
  streak: number;
  /** 7日のうちの何日目か（1〜7） */
  day: number;
  /** 今日もらえる（もらった）グミ */
  amount: number;
  /** 開店記念もまだ */
  open: boolean;
}

export function loginStatus(now = Date.now()): LoginStatus {
  const today = todayKey(now);
  const claimed = hasEntry(`l:${today}`);
  const streak = claimed ? streakUntil(today) : streakUntil(prevDay(today)) + 1;
  const day = ((streak - 1) % STREAK_DAYS) + 1;
  return {
    claimed,
    streak,
    day,
    amount: LOGIN_BONUS + (day === STREAK_DAYS ? STREAK_BONUS : 0),
    open: !hasEntry('b:open'),
  };
}

/** ログインボーナスを受け取る。もらったグミ（もうもらっていたら 0） */
export function claimLogin(now = Date.now()): number {
  const st = loginStatus(now);
  if (st.claimed) return 0;
  const today = todayKey(now);
  const entries: Record<string, number> = { [`l:${today}`]: LOGIN_BONUS };
  if (st.day === STREAK_DAYS) entries[`L:${today}`] = STREAK_BONUS;
  if (st.open) entries['b:open'] = OPEN_BONUS;
  addEntries(entries);
  return Object.values(entries).reduce((t, v) => t + v, 0);
}

// ---- 勉強ボーナス ----

export const totalStudyMs = (): number => getSessions().reduce((t, s) => t + s.studyMs, 0);

/** 次の勉強ボーナスまでの時間 */
export const nextStudyBonusIn = (): number => STUDY_BLOCK - (totalStudyMs() % STUDY_BLOCK);

/**
 * 累計の勉強時間に合わせて、勉強ボーナスを増やす。増えた分を返す。
 * 記録を消しても、もらった分は減らさない（また同じ時間をこえるまで増えない）
 */
export function syncStudyBonus(): number {
  const want = Math.floor(totalStudyMs() / STUDY_BLOCK) * STUDY_BONUS;
  const have = settings.gumi.s ?? 0;
  if (want <= have) return 0;
  addEntries({ s: want });
  return want - have;
}

// ---- 履歴 ----

export interface HistoryItem {
  key: string;
  amount: number;
  label: string;
  /** 日付（分かるものだけ。'11/28'） */
  date?: string;
}

const md = (key: string): string => {
  const m = key.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[2])}/${Number(m[3])}` : '';
};

/** 台帳の1件の名前。名前は labels（クエスト・実績・スタイルの名前）から引く */
export function entryLabel(key: string, names: (key: string) => string | undefined = () => undefined): HistoryItem {
  const amount = settings.gumi[key] ?? 0;
  const [p, a = '', b = ''] = key.split(':');
  const named = names(key);
  const item = (label: string, date?: string): HistoryItem => ({ key, amount, label, ...(date ? { date } : {}) });
  switch (p) {
    case 'b':
      return item('開店記念');
    case 'l':
      return item('ログインボーナス', md(a));
    case 'L':
      return item('7日連続ボーナス', md(a));
    case 's':
      return item(`勉強ボーナス（累計 ${(amount / STUDY_BONUS) * 3}時間ぶん）`);
    case 'd':
      return item(named ? `今日のクエスト「${named}」` : '今日のクエスト', md(a));
    case 'D':
      return item('今日のクエストを全部', md(a));
    case 'w':
      return item(named ? `今週の目標「${named}」` : '今週の目標', md(a));
    case 'e':
      return item(`みんなのイベント（${seasonShort(a)}・${b}時間）`);
    case 'a':
      return item(named ? `実績「${named}」` : '実績');
    case 'g':
      return item('グミガチャ 1回', idDate(a));
    case 'G':
      return item('グミガチャ 10回', idDate(a));
    case 'r':
      return item('かぶりのお返し', idDate(a));
    case 'x':
      return item(named ? `交換「${named}」` : '交換所');
    default:
      return item(named ?? 'そのほか');
  }
}

/** newId() で作った id から日付を出す */
function idDate(id: string): string | undefined {
  const ts = parseInt(id.slice(0, -4), 36);
  if (!Number.isFinite(ts) || ts < 1.6e12) return undefined;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 台帳を新しい順に（台帳に入れた順の逆） */
export function history(names?: (key: string) => string | undefined): HistoryItem[] {
  return Object.keys(settings.gumi)
    .reverse()
    .map((k) => entryLabel(k, names));
}

/** 3桁ごとにカンマ */
export const fmtGumi = (n: number): string => n.toLocaleString('ja-JP');
