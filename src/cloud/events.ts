// みんなのイベントの合計。events/{シーズン}/users/{uid} に、自分のそのシーズンの勉強時間の合計を書く。
// 全員の合計は、集計（sum）で1回で読む（人数が増えても読む回数はほとんど増えない）。
// 自分の合計を上書きするだけなので、何回送っても、別の端末から送っても数がずれない。

import { dateKey } from './model';
import { cloudUser } from './account';
import { fb } from './firebase';
import { inSeason, prevSeason, seasonAt, seasonsUntil, type Season } from '../seasons';
import { getSessions, settings } from '../store';

const PUB = 'studytimer:eventpub';

interface Published {
  uid: string;
  m: Record<string, number>;
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
  const todo = seasons.map((s) => [s.id, seasonTotal(s)] as const).filter(([id, ms]) => ms > 0 && ms !== sent[id]);
  if (todo.length === 0) return false;
  const { db, F } = await fb();
  for (const [id, ms] of todo) {
    await F.setDoc(F.doc(db, 'events', id, 'users', u.uid), { ms, updatedAt: F.serverTimestamp() });
    sent[id] = ms;
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
