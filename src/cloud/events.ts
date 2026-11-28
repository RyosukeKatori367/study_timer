// みんなのイベントの合計。events/{月}/users/{uid} に、自分のその月の勉強時間の合計を書く。
// 全員の合計は、集計（sum）で1回で読む（人数が増えても読む回数はほとんど増えない）。
// 自分の合計を上書きするだけなので、何回送っても、別の端末から送っても数がずれない。

import { dateKey } from './model';
import { cloudUser } from './account';
import { fb } from './firebase';
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

/** 月ごとの自分の合計（記録から） */
function monthTotals(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of getSessions()) {
    const m = dateKey(s.start, settings.dayBoundaryMin).slice(0, 7);
    out[m] = (out[m] ?? 0) + s.studyMs;
  }
  return out;
}

function months(now = Date.now()): string[] {
  const m = dateKey(now, settings.dayBoundaryMin).slice(0, 7);
  const d = new Date(`${m}-15T12:00:00`);
  d.setMonth(d.getMonth() - 1);
  return [m, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`];
}

/** 今月と先月の自分の合計を送る（前に送った値と同じなら送らない） */
export async function publishEvent(): Promise<void> {
  const u = cloudUser();
  if (!u) return;
  const totals = monthTotals();
  const prev = readPub();
  const sent = prev?.uid === u.uid ? prev.m : {};
  const todo = months().filter((m) => (totals[m] ?? 0) > 0 && totals[m] !== sent[m]);
  if (todo.length === 0) return;
  const { db, F } = await fb();
  for (const m of todo) {
    await F.setDoc(F.doc(db, 'events', m, 'users', u.uid), { ms: totals[m], updatedAt: F.serverTimestamp() });
    sent[m] = totals[m];
  }
  const keep = Object.fromEntries(months().map((m) => [m, sent[m]]).filter(([, v]) => v !== undefined));
  try {
    localStorage.setItem(PUB, JSON.stringify({ uid: u.uid, m: keep }));
  } catch {
    /* 次にまた送るだけ */
  }
}

/** その月の全員の合計と人数 */
export async function eventTotal(month: string): Promise<{ total: number; people: number }> {
  const { db, F } = await fb();
  const snap = await F.getAggregateFromServer(F.collection(db, 'events', month, 'users'), {
    total: F.sum('ms'),
    people: F.count(),
  });
  const d = snap.data();
  return { total: d.total ?? 0, people: d.people ?? 0 };
}

/** アカウントを消すときに、自分の分を消す（記録のある月すべて） */
export async function deleteMyEvents(uid: string): Promise<void> {
  const { db, F } = await fb();
  const ms = Object.keys(monthTotals()).filter((m) => m >= '2026-11');
  for (const m of ms) await F.deleteDoc(F.doc(db, 'events', m, 'users', uid)).catch(() => undefined);
  try {
    localStorage.removeItem(PUB);
  } catch {
    /* なくてもよい */
  }
}
