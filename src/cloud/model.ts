// グループ機能とバックアップで Firestore に入れるデータの形。
// ここは Firebase を読み込まない（テストしやすく、ログインしない人の読み込みを軽くするため）。
//
// 置き場所
//   users/{uid}                    自分だけ読める。プロフィール、入っているグループ、投稿の初期設定
//   users/{uid}/backup/state       自分だけ。設定と教材
//   users/{uid}/backup/{月の前半後半} 自分だけ。記録（例 2026-11a は 1〜15日、2026-11b は 16日〜）
//   groups/{gid}                   メンバーだけ読める。名前、色、作成者、招待コード、人数
//   groups/{gid}/members/{uid}     メンバーだけ。表示名とアイコンの写し、今日の勉強時間
//   groups/{gid}/posts/{pid}       メンバーだけ。投稿
//   groups/{gid}/posts/{pid}/replies/{rid} メンバーだけ。投稿への返信
//   groups/{gid}/messages/{mid}    メンバーだけ。グループのチャット
//   invites/{code}                 ログインしていれば、コードを知っている1件だけ読める（一覧は不可）

import type { Mode, Session } from '../engine';
import { addDays, studyDayStart, studyWeekStart, type DayOptions } from '../summary';

// ---- 上限 ----
export const NAME_MAX = 20;
export const BIO_MAX = 60;
export const GROUP_NAME_MAX = 24;
export const COMMENT_MAX = 140;
export const REPLY_MAX = 140;
export const MESSAGE_MAX = 500;
/** メンバー文書に残す、日ごとの勉強時間の日数（今週のランキングに足りる分） */
export const DAYS_KEEP = 14;
export const MAX_MEMBERS = 50;
export const MAX_GROUPS = 10;
/** アイコン画像（data URL）の最大の長さ。128px の JPEG なら 1 万字前後 */
export const ICON_IMAGE_MAX = 30000;
export const PASSWORD_MIN = 8;

/**
 * 開発者のアカウント（名前の横に「開発者」のしるしを出す）。
 * UID はログインの番号で、公開しても困らない（なりすましもできない）。メールアドレスは書かない
 */
export const DEVELOPER_UIDS: string[] = ['WrJppVm6T2VDHKUC1otLdn9rC7w1'];
export const isDeveloper = (uid: string): boolean => DEVELOPER_UIDS.includes(uid);

// ---- アイコン ----

/** 絵文字か1文字＋背景の色相。img があれば画像を優先して出す */
export interface Icon {
  /** 表示する文字（絵文字1つか1文字） */
  c: string;
  /** 背景の色相（0〜359） */
  h: number;
  /** 画像（data:image/jpeg;base64,…）。なければ文字 */
  img?: string;
}

/** 入力から最初の1文字（絵文字は1つ）を取り出す。 */
export function firstGrapheme(text: string): string {
  const t = text.trim();
  if (!t) return '';
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    for (const { segment } of new Seg('ja', { granularity: 'grapheme' }).segment(t)) return segment;
  }
  return Array.from(t)[0];
}

/**
 * 色相からアイコンの背景色と文字色を出す。
 * 明るさを固定して色相だけ動かすと、黄色は明るすぎ・青は暗すぎになるので、
 * 色相ごとに明るさを変えて、どの色でも白い文字が読めるようにする。
 */
export function iconColors(hue: number): { bg: string; fg: string } {
  const h = ((Math.round(hue) % 360) + 360) % 360;
  // 黄〜緑（50〜170）はもともと明るく見えるので、明度を下げる
  const yellowish = Math.max(0, 1 - Math.abs(h - 100) / 70);
  const l = Math.round(46 - 14 * yellowish);
  return { bg: `hsl(${h} 62% ${l}%)`, fg: '#ffffff' };
}

export function validIcon(icon: unknown): icon is Icon {
  if (typeof icon !== 'object' || icon === null) return false;
  const i = icon as Record<string, unknown>;
  return (
    typeof i.c === 'string' &&
    i.c.length >= 1 &&
    i.c.length <= 16 &&
    Number.isInteger(i.h) &&
    (i.h as number) >= 0 &&
    (i.h as number) < 360 &&
    (i.img === undefined || (typeof i.img === 'string' && i.img.startsWith('data:image/') && i.img.length <= ICON_IMAGE_MAX))
  );
}

// ---- プロフィール ----

/** 投稿の確認画面の初期値（前回の投稿の内容） */
export interface PostPrefs {
  material: boolean;
  laps: boolean;
  lapTimes: boolean;
  away: boolean;
  /** 投稿先のグループ */
  groups: string[];
  /** finish したあとに投稿の確認画面を出す */
  ask: boolean;
}

export const DEFAULT_POST_PREFS: PostPrefs = { material: true, laps: true, lapTimes: false, away: false, groups: [], ask: true };

/** users/{uid} */
export interface UserDoc {
  name: string;
  bio: string;
  icon: Icon;
  /** 名前の横に出すタグ（src/tags.ts の id。'none' なら出さない。なければ開発者だけ開発者タグ） */
  tag?: string;
  /** 入っているグループの id */
  groupIds: string[];
  postPrefs: PostPrefs;
}

/** 表示名などを確かめる。問題があれば理由、なければ null。 */
export function profileError(p: { name: string; bio: string; icon: Icon }): string | null {
  const name = p.name.trim();
  if (!name) return '表示名を入れてください';
  if (Array.from(name).length > NAME_MAX) return `表示名は${NAME_MAX}文字までです`;
  if (Array.from(p.bio).length > BIO_MAX) return `ひとことは${BIO_MAX}文字までです`;
  if (!validIcon(p.icon)) return 'アイコンを選び直してください';
  return null;
}

// ---- グループ ----

/** groups/{gid} */
export interface GroupDoc {
  name: string;
  /** グループのアイコンの色相 */
  hue: number;
  ownerId: string;
  /** 今の招待コード */
  code: string;
  memberCount: number;
  /** 最後に入った・抜けた人（人数の増減が本当にその人の分かを、ルールで確かめるため） */
  lastMember: string;
  createdAt: unknown;
}

/** groups/{gid}/members/{uid} */
export interface MemberDoc {
  name: string;
  icon: Icon;
  /** 名前の横に出すタグ（プロフィールの写し） */
  tag?: string;
  joinedAt: unknown;
  /** 入るときに使った招待コード（ルールで確かめるため） */
  joinCode: string;
  /** 日ごとの勉強時間 { '2026-11-27': ms }（直近 14 日）。今日・今週のランキングに使う */
  days: Record<string, number>;
  /** 日ごと・教材ごとの内訳（ランキングのグラフの色分けに使う。古い文書にはない） */
  mats?: DayMats;
  /** 累計と月ごとの合計（人の統計の画面に出す。古い文書にはない） */
  sums?: StudySums;
  /** 教材の画像 { 教材の id: data URL }（mats に出てくる教材のうち、画像があるものだけ） */
  matImgs?: Record<string, string>;
  lastStudyAt: number;
}

/** invites/{code}。参加前のプレビューに出すもの */
export interface InviteDoc {
  groupId: string;
  name: string;
  hue: number;
  memberCount: number;
}

// 見間違えやすい 0 O 1 I L を除いた 31 文字
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;

export function newInviteCode(random: (n: number) => Uint32Array = randomValues): string {
  const r = random(CODE_LENGTH);
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_CHARS[r[i] % CODE_CHARS.length];
  return s;
}

function randomValues(n: number): Uint32Array {
  return crypto.getRandomValues(new Uint32Array(n));
}

/** 入力された招待コードを整える（小文字・空白・ハイフンを許す）。形が違えば null。 */
export function normalizeCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== CODE_LENGTH) return null;
  for (const ch of s) if (!CODE_CHARS.includes(ch)) return null;
  return s;
}

/** 読みやすいように 4 文字ずつ区切る */
export const formatCode = (code: string): string => `${code.slice(0, 4)}-${code.slice(4)}`;

export function groupNameError(name: string): string | null {
  const n = name.trim();
  if (!n) return 'グループ名を入れてください';
  if (Array.from(n).length > GROUP_NAME_MAX) return `グループ名は${GROUP_NAME_MAX}文字までです`;
  return null;
}

// ---- 日ごとの時間とランキング ----
// 日付は、それぞれの人の「1日の区切り」で決める（自分の統計と同じ日に数える）。

/** ts を含む勉強の1日の日付（'2026-11-27'） */
export function dateKey(ts: number, boundaryMin = 0): string {
  const d = new Date(studyDayStart(ts, boundaryMin) - boundaryMin * 60000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 記録から、直近 DAYS_KEEP 日の日ごとの勉強時間を出す（メンバー文書に入れる） */
export function recentDays(sessions: readonly Session[], now: number, boundaryMin = 0): Record<string, number> {
  const from = addDays(studyDayStart(now, boundaryMin), -(DAYS_KEEP - 1), boundaryMin);
  const out: Record<string, number> = {};
  for (const s of sessions) {
    if (s.start < from || s.studyMs <= 0) continue;
    const k = dateKey(s.start, boundaryMin);
    out[k] = (out[k] ?? 0) + s.studyMs;
  }
  return out;
}

/** 教材1つ分の時間。n = 教材名、c = 色（その人の教材の色） */
export interface MatSlice {
  n: string;
  c: string;
  ms: number;
}

/** 日ごと・教材ごとの内訳 { '2026-11-27': { 教材の id（教材なしは '_'）: MatSlice } } */
export type DayMats = Record<string, Record<string, MatSlice>>;

/**
 * 記録から、直近 DAYS_KEEP 日の日ごと・教材ごとの時間を出す。
 * info は教材の id から名前と色を返す（教材なしは id が null）。
 */
export function recentMats(
  sessions: readonly Session[],
  now: number,
  boundaryMin: number,
  info: (id: string | null) => { n: string; c: string },
): DayMats {
  const from = addDays(studyDayStart(now, boundaryMin), -(DAYS_KEEP - 1), boundaryMin);
  const out: DayMats = {};
  for (const s of sessions) {
    if (s.start < from || s.studyMs <= 0) continue;
    const day = (out[dateKey(s.start, boundaryMin)] ??= {});
    const key = s.material ?? '_';
    day[key] ??= { ...info(s.material ?? null), ms: 0 };
    day[key].ms += s.studyMs;
  }
  return out;
}

/** keys の日の、教材ごとの合計（多い順）。内訳がない古いデータは、合計を「不明」1つにする */
export function matBreakdown(
  m: { days?: Record<string, number>; mats?: DayMats },
  keys: readonly string[],
): (MatSlice & { key: string })[] {
  const total = sumDays(m.days, keys);
  const byKey = new Map<string, MatSlice & { key: string }>();
  for (const k of keys) {
    for (const [key, v] of Object.entries(m.mats?.[k] ?? {})) {
      const cur = byKey.get(key);
      if (cur) cur.ms += v.ms;
      else byKey.set(key, { key, n: v.n, c: v.c, ms: v.ms });
    }
  }
  const list = [...byKey.values()].filter((x) => x.ms > 0).sort((a, b) => b.ms - a.ms);
  const known = list.reduce((t, x) => t + x.ms, 0);
  // 内訳がない日の分（古いデータ）は灰色でまとめる
  if (total - known >= 60000) list.push({ key: '?', n: '内訳なし', c: '#5a5a5a', ms: total - known });
  return list;
}

/** 累計と、直近の月の合計 { all: ms, months: { '2026-11': ms } } */
export interface StudySums {
  all: number;
  months: Record<string, number>;
}

/** 記録から累計と月ごとの合計を出す（月は今月と先月だけ残す） */
export function studySums(sessions: readonly Session[], now: number, boundaryMin = 0): StudySums {
  const thisMonth = dateKey(now, boundaryMin).slice(0, 7);
  const d = new Date(thisMonth + '-01T00:00:00');
  d.setMonth(d.getMonth() - 1);
  const lastMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const out: StudySums = { all: 0, months: { [thisMonth]: 0, [lastMonth]: 0 } };
  for (const s of sessions) {
    out.all += s.studyMs;
    const m = dateKey(s.start, boundaryMin).slice(0, 7);
    if (m in out.months) out.months[m] += s.studyMs;
  }
  return out;
}

/** 今週の 7 日の日付（週の始まりから） */
export function weekKeys(now: number, opt: DayOptions = {}): string[] {
  const start = studyWeekStart(now, opt);
  return Array.from({ length: 7 }, (_, i) => dateKey(addDays(start, i, opt.boundaryMin), opt.boundaryMin));
}

export const sumDays = (days: Record<string, number> | undefined, keys: readonly string[]): number =>
  keys.reduce((t, k) => t + (days?.[k] ?? 0), 0);

export interface RankItem<T> {
  item: T;
  ms: number;
  /** 順位（同じ時間なら同じ順位） */
  rank: number;
}

/** ランキング（keys の日の合計が多い順。0 分の人は最後にまとめる） */
export function ranking<T extends { days?: Record<string, number> }>(list: readonly T[], keys: readonly string[]): RankItem<T>[] {
  const rows = list.map((item) => ({ item, ms: sumDays(item.days, keys), rank: 0 })).sort((a, b) => b.ms - a.ms);
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1].ms === r.ms ? rows[i - 1].rank : i + 1));
  return rows;
}

// ---- 投稿 ----

/** groups/{gid}/posts/{pid} */
export interface PostDoc {
  uid: string;
  /** 投稿したときの表示名とアイコン（抜けた人の投稿にも名前を出すため） */
  name: string;
  icon: Icon;
  createdAt: unknown;
  /** どの記録の投稿か（同じ記録を同じグループに2回出さないため） */
  sessionId: string;
  mode: Mode;
  start: number;
  end: number;
  studyMs: number;
  /** 教材名・色・画像（出さないときは付けない） */
  material?: PostMaterial;
  /** ラップ番号の範囲とラップ数（出さないときは付けない） */
  laps?: { from: number; count: number };
  /** ラップごとの時間（出さないときは付けない） */
  lapMs?: number[];
  /** 計測中にアプリから離れた回数と時間（出さないときは付けない） */
  away?: { n: number; ms: number };
  comment: string;
  /** いいねした人の uid */
  likes: string[];
  /** 返信の数（返信を足す・消すときに一緒に増減する） */
  replyCount?: number;
  /** 最後に足した・消した返信の id（ルールで確かめるため） */
  lastReply?: string;
}

/** groups/{gid}/posts/{pid}/replies/{rid} */
export interface ReplyDoc {
  uid: string;
  name: string;
  icon: Icon;
  text: string;
  createdAt: unknown;
}

/** groups/{gid}/messages/{mid} */
export interface MessageDoc {
  uid: string;
  name: string;
  icon: Icon;
  text: string;
  createdAt: unknown;
}

export function messageError(text: string): string | null {
  const t = text.trim();
  if (!t) return 'メッセージを入れてください';
  if (Array.from(t).length > MESSAGE_MAX) return `メッセージは${MESSAGE_MAX}文字までです`;
  return null;
}

export function replyError(text: string): string | null {
  const t = text.trim();
  if (!t) return '返信を入れてください';
  if (Array.from(t).length > REPLY_MAX) return `返信は${REPLY_MAX}文字までです`;
  return null;
}

export interface PostMaterial {
  name: string;
  color: string;
  img?: string;
}

export interface PostOptions {
  material: boolean;
  laps: boolean;
  lapTimes: boolean;
  /** 離れた回数と時間 */
  away: boolean;
  comment: string;
}

/** 記録と、出すものの選択から、投稿の中身を作る（uid・名前・時刻は送るときに入れる）。 */
export function postFromSession(
  s: Session,
  opt: PostOptions,
  material: PostMaterial | null,
): Omit<PostDoc, 'uid' | 'name' | 'icon' | 'createdAt'> {
  const p: Omit<PostDoc, 'uid' | 'name' | 'icon' | 'createdAt'> = {
    sessionId: s.id,
    mode: s.mode,
    start: s.start,
    end: s.end,
    studyMs: s.studyMs,
    comment: opt.comment.trim().slice(0, COMMENT_MAX),
    likes: [],
  };
  if (opt.material && material) p.material = material;
  if (opt.away && s.leaves?.length) {
    p.away = { n: s.leaves.length, ms: s.leaves.reduce((t, [a, b]) => t + (b - a), 0) };
  }
  if (s.laps.length > 0 && s.mode !== 'pomoCycle') {
    if (opt.laps) p.laps = { from: s.firstLap, count: s.laps.length };
    if (opt.lapTimes) p.lapMs = s.laps.slice(0, 200);
  }
  return p;
}

// ---- バックアップ ----
// Firestore は「配列の中の配列」を入れられないので、spans と leaves は平らにして入れる。

export interface CloudSession {
  id: string;
  mode: Mode;
  start: number;
  end: number;
  studyMs: number;
  laps: number[];
  firstLap: number;
  material?: string;
  spans?: number[];
  leaves?: number[];
}

const flat = (pairs: [number, number][]): number[] => pairs.flat();

function pairs(list: unknown): [number, number][] | undefined {
  if (!Array.isArray(list) || list.length % 2 !== 0 || !list.every((v) => typeof v === 'number')) return undefined;
  const out: [number, number][] = [];
  for (let i = 0; i < list.length; i += 2) out.push([list[i], list[i + 1]]);
  return out;
}

export function toCloud(s: Session): CloudSession {
  const c: CloudSession = {
    id: s.id,
    mode: s.mode,
    start: s.start,
    end: s.end,
    studyMs: s.studyMs,
    laps: s.laps,
    firstLap: s.firstLap,
  };
  if (s.material) c.material = s.material;
  if (s.spans) c.spans = flat(s.spans);
  if (s.leaves) c.leaves = flat(s.leaves);
  return c;
}

export function fromCloud(c: CloudSession): Session {
  const s: Session = {
    id: c.id,
    mode: c.mode,
    start: c.start,
    end: c.end,
    studyMs: c.studyMs,
    laps: c.laps,
    firstLap: c.firstLap,
  };
  if (c.material) s.material = c.material;
  const sp = pairs(c.spans);
  if (sp) s.spans = sp;
  const lv = pairs(c.leaves);
  if (lv) s.leaves = lv;
  return s;
}

/**
 * 記録を入れる文書の名前（月の前半・後半）。1つの文書は 1MB までなので、
 * たくさん計る人でも収まるように半月ごとに分ける。端末の時刻（日本時間）で決める。
 */
export function chunkKey(start: number): string {
  const d = new Date(start);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}${d.getDate() <= 15 ? 'a' : 'b'}`;
}

/** 記録の文書の名前か（state と区別する） */
export const isChunkKey = (id: string): boolean => /^\d{4}-\d{2}[ab]$/.test(id);
