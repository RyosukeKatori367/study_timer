// グループのチャット。groups/{gid}/messages/{mid}
// 送るのはオフラインでもでき、つながったときに送られる（届くまでは「送信待ち」）。

import type { Unsubscribe } from 'firebase/firestore';
import { cloudUser } from './account';
import { fb } from './firebase';
import { messageError, type MessageDoc } from './model';
import { cachedProfile, getProfile } from './profile';

export type Message = MessageDoc & { id: string; pending: boolean; at: number };

function me(): string {
  const u = cloudUser();
  if (!u) throw new Error('ログインしていません');
  return u.uid;
}

/** メッセージを送る（届くのを待たずに返す） */
export async function sendMessage(gid: string, text: string): Promise<void> {
  const err = messageError(text);
  if (err) throw new Error(err);
  const p = cachedProfile() ?? (await getProfile());
  if (!p) throw new Error('先にプロフィールを作ってください');
  const { db, F } = await fb();
  const ref = F.doc(F.collection(db, 'groups', gid, 'messages'));
  void F.setDoc(ref, { uid: me(), name: p.name, icon: p.icon, text: text.trim(), createdAt: F.serverTimestamp() }).catch((e) =>
    console.warn('送れませんでした', e),
  );
}

/** 新しい n 件を見張る（古い順に並べて返す） */
export async function watchMessages(gid: string, n: number, cb: (list: Message[]) => void): Promise<Unsubscribe> {
  const { db, F } = await fb();
  const q = F.query(F.collection(db, 'groups', gid, 'messages'), F.orderBy('createdAt'), F.limitToLast(n));
  return F.onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) =>
      cb(
        snap.docs.map((d) => {
          const data = d.data({ serverTimestamps: 'estimate' }) as MessageDoc & { createdAt?: { toMillis(): number } };
          return { ...data, id: d.id, pending: d.metadata.hasPendingWrites, at: data.createdAt?.toMillis?.() ?? Date.now() };
        }),
      ),
    () => cb([]),
  );
}

/** メッセージを消す（自分のもの、または作成者） */
export async function deleteMessage(gid: string, mid: string): Promise<void> {
  const { db, F } = await fb();
  await F.deleteDoc(F.doc(db, 'groups', gid, 'messages', mid));
}

/** since（ミリ秒）より新しいメッセージの数（オフラインなら 0） */
export async function chatUnread(gid: string, since: number): Promise<number> {
  try {
    const { db, F } = await fb();
    const q = F.query(F.collection(db, 'groups', gid, 'messages'), F.where('createdAt', '>', F.Timestamp.fromMillis(since)));
    return (await F.getCountFromServer(q)).data().count;
  } catch {
    return 0;
  }
}

/** そのグループの自分のメッセージを全部消す（アカウントを消すとき） */
export async function deleteMyMessages(gid: string): Promise<void> {
  const { db, F } = await fb();
  const snap = await F.getDocs(F.query(F.collection(db, 'groups', gid, 'messages'), F.where('uid', '==', me())));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = F.writeBatch(db);
    for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
    await batch.commit();
  }
}

/** グループのメッセージを全部消す（作成者が1人だけのグループを消すとき） */
export async function deleteAllMessages(gid: string): Promise<void> {
  const { db, F } = await fb();
  const snap = await F.getDocs(F.collection(db, 'groups', gid, 'messages'));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = F.writeBatch(db);
    for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
    await batch.commit();
  }
}
