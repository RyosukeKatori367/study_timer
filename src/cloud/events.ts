// みんなのイベントの合計。events/{シーズン}/users/{uid} に、自分のそのシーズンの勉強時間の合計を書く。
// 全員の合計は、集計（sum）で1回で読む（人数が増えても読む回数はほとんど増えない）。
// 自分の合計を上書きするだけなので、何回送っても、別の端末から送っても数がずれない。

import { dateKey } from './model';
import { cloudUser } from './account';
import { fb } from './firebase';
import { inSeason, prevSeason, seasonAt, seasonsUntil, type Season } from '../seasons';
import { getSessions, settings } from '../store';
import { cachedProfile, getProfile } from './profile';
import type { Icon } from './model';

const PUB = 'studytimer:eventpub';

interface Published {
  uid: string;
  /** シーズンごとに送ったもの（合計と、名前を出すかなど。前の版は数だけ） */
  m: Record<string, number | string>;
}

/** ランキングに出す名前など（出さない設定なら null） */
async function shownAs(): Promise<{ name: string; icon: Icon; tag?: string } | null> {
  if (!settings.eventName) return null;
  const p = cachedProfile() ?? (await getProfile().catch(() => null));
  if (!p?.name) return null;
  return { name: p.name, icon: p.icon, ...(p.tag && p.tag !== 'none' ? { tag: p.tag } : {}) };
}

function readPub(): Published | null {
  try {
    return JSON.parse(localStorage.getItem(PUB) ?? 'null') as Published | null;
  } catch {
    return null;
  }
}

const today = (): string => dateKey(Date.now(), settings.dayBoundaryMin);

/** シーズンごとの自分の合計（記録から） */
function seasonTotal(s: Season): number {
  let ms = 0;
  for (const x of getSessions()) if (inSeason(s, dateKey(x.start, settings.dayBoundaryMin))) ms += x.studyMs;
  return ms;
}

/** 今のシーズンとひとつ前 */
function live(): Season[] {
  const cur = seasonAt(today());
  const prev = cur ? prevSeason(cur) : null;
  return [cur, prev].filter((s): s is Season => s !== null);
}

/** 今のシーズンとひとつ前の自分の合計を送る（前に送った値と同じなら送らない）。送ったら true */
export async function publishEvent(): Promise<boolean> {
  const u = cloudUser();
  if (!u) return false;
  const seasons = live();
  const prev = readPub();
  const sent = prev?.uid === u.uid ? prev.m : {};
  const who = await shownAs();
  // 名前を変えた・出さないにしたときも送り直す
  const sig = (ms: number) => `${ms}|${who ? `${who.name}|${who.icon.c}|${who.icon.h}|${who.icon.img ? 1 : 0}|${who.tag ?? ''}` : '-'}`;
  const todo = seasons.map((s) => [s.id, seasonTotal(s)] as const).filter(([id, ms]) => ms > 0 && sig(ms) !== sent[id]);
  if (todo.length === 0) return false;
  const { db, F } = await fb();
  for (const [id, ms] of todo) {
    const ref = F.doc(db, 'events', id, 'users', u.uid);
    try {
      await F.setDoc(ref, { ms, ...(who ?? {}), updatedAt: F.serverTimestamp() });
    } catch (e) {
      // ルールが古いと名前を入れられないので、合計だけ送る
      if ((e as { code?: string }).code !== 'permission-denied' || !who) throw e;
      await F.setDoc(ref, { ms, updatedAt: F.serverTimestamp() });
    }
    sent[id] = sig(ms);
  }
  const keep = Object.fromEntries(seasons.map((s) => [s.id, sent[s.id]]).filter(([, v]) => v !== undefined));
  try {
    localStorage.setItem(PUB, JSON.stringify({ uid: u.uid, m: keep }));
  } catch {
    /* 次にまた送るだけ */
  }
  return true;
}

/** そのシーズンの全員の合計と人数 */
export async function eventTotal(id: string): Promise<{ total: number; people: number }> {
  const { db, F } = await fb();
  const snap = await F.getAggregateFromServer(F.collection(db, 'events', id, 'users'), {
    total: F.sum('ms'),
    people: F.count(),
  });
  const d = snap.data();
  return { total: d.total ?? 0, people: d.people ?? 0 };
}

export interface RankEntry {
  uid: string;
  ms: number;
  /** 名前を出していない人はなし */
  name?: string;
  icon?: Icon;
  tag?: string;
}

/** そのシーズンの貢献度ランキング（上から n 人と、自分の順位） */
export async function eventRanking(id: string, n = 30): Promise<{ top: RankEntry[]; me: { rank: number; ms: number } | null }> {
  const { db, F } = await fb();
  const col = F.collection(db, 'events', id, 'users');
  const snap = await F.getDocs(F.query(col, F.orderBy('ms', 'desc'), F.limit(n)));
  const top = snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<RankEntry, 'uid'>) }));
  const uid = cloudUser()?.uid;
  let me: { rank: number; ms: number } | null = null;
  const i = top.findIndex((x) => x.uid === uid);
  if (i >= 0) me = { rank: i + 1, ms: top[i].ms };
  else if (uid) {
    const mine = await F.getDoc(F.doc(col, uid));
    const ms = (mine.data() as { ms?: number } | undefined)?.ms;
    if (ms) {
      const above = await F.getCountFromServer(F.query(col, F.where('ms', '>', ms)));
      me = { rank: above.data().count + 1, ms };
    }
  }
  return { top, me };
}

/** アカウントを消すときに、自分の分を消す（今までのシーズンすべて） */
export async function deleteMyEvents(uid: string): Promise<void> {
  const { db, F } = await fb();
  for (const s of seasonsUntil(today())) await F.deleteDoc(F.doc(db, 'events', s.id, 'users', uid)).catch(() => undefined);
  try {
    localStorage.removeItem(PUB);
  } catch {
    /* なくてもよい */
  }
}
