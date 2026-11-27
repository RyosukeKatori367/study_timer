// 投稿・タイムライン・いいね。
// 投稿はオフラインでも作れて、つながったときに送られる（送るまでは「送信待ち」として出せる）。

import type { Unsubscribe } from 'firebase/firestore';
import { materialColor } from '../colors';
import type { Session } from '../engine';
import { materialById } from '../store';
import { cloudUser } from './account';
import { fb } from './firebase';
import { postFromSession, type PostDoc, type PostOptions } from './model';
import { cachedProfile, getProfile, savePostPrefs } from './profile';

export type Post = PostDoc & {
  id: string;
  /** まだサーバーに届いていない（オフラインで投稿した） */
  pending: boolean;
  /** 投稿した時刻（届く前は端末の時刻で見積もる） */
  at: number;
};

function me(): string {
  const u = cloudUser();
  if (!u) throw new Error('ログインしていません');
  return u.uid;
}

/**
 * 記録を投稿する。groups に選んだグループすべてに出す。
 * 出したもの（教材名など）と投稿先は、次の確認画面の初期値として覚える。
 * 届くのを待たずに返す（オフラインでも投稿の操作は終わる）。
 */
export async function createPost(s: Session, opt: PostOptions, groups: string[]): Promise<void> {
  if (groups.length === 0) throw new Error('投稿先のグループを選んでください');
  const p = cachedProfile() ?? (await getProfile());
  if (!p) throw new Error('先にプロフィールを作ってください');
  const { db, F } = await fb();
  const uid = me();
  const m = materialById(s.material);
  const body = postFromSession(s, opt, m ? { name: m.name, color: materialColor(m.id) } : null);
  const batch = F.writeBatch(db);
  for (const gid of groups) {
    if (!p.groupIds.includes(gid)) continue;
    batch.set(F.doc(F.collection(db, 'groups', gid, 'posts')), {
      ...body,
      uid,
      name: p.name,
      icon: p.icon,
      createdAt: F.serverTimestamp(),
    });
  }
  // 送信はつながったときに済む。ここでは待たない
  void batch.commit().catch((e) => console.warn('投稿できませんでした', e));
  void savePostPrefs({ material: opt.material, laps: opt.laps, lapTimes: opt.lapTimes, groups }).catch(() => undefined);
}

/** グループのタイムライン（新しい順に n 件）を見張る */
export async function watchTimeline(gid: string, cb: (posts: Post[]) => void, n = 30): Promise<Unsubscribe> {
  const { db, F } = await fb();
  const q = F.query(F.collection(db, 'groups', gid, 'posts'), F.orderBy('createdAt', 'desc'), F.limit(n));
  return F.onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) =>
      cb(
        snap.docs.map((d) => {
          const data = d.data({ serverTimestamps: 'estimate' }) as PostDoc & { createdAt?: { toMillis(): number } };
          return {
            ...data,
            id: d.id,
            pending: d.metadata.hasPendingWrites,
            at: data.createdAt?.toMillis?.() ?? Date.now(),
          };
        }),
      ),
    () => cb([]),
  );
}

/** いいねする・取り消す */
export async function setLike(gid: string, pid: string, liked: boolean): Promise<void> {
  const { db, F } = await fb();
  const uid = me();
  await F.updateDoc(F.doc(db, 'groups', gid, 'posts', pid), {
    likes: liked ? F.arrayUnion(uid) : F.arrayRemove(uid),
  });
}

/** 投稿を消す（自分の投稿、または作成者ならグループの投稿） */
export async function deletePost(gid: string, pid: string): Promise<void> {
  const { db, F } = await fb();
  await F.deleteDoc(F.doc(db, 'groups', gid, 'posts', pid));
}

/** そのグループの自分の投稿を全部消す（アカウントを消すとき） */
export async function deleteMyPosts(gid: string): Promise<void> {
  const { db, F } = await fb();
  const snap = await F.getDocs(F.query(F.collection(db, 'groups', gid, 'posts'), F.where('uid', '==', me())));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = F.writeBatch(db);
    for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
    await batch.commit();
  }
}
