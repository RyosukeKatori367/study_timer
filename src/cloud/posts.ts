// 投稿・タイムライン・いいね。
// 投稿はオフラインでも作れて、つながったときに送られる（送るまでは「送信待ち」として出せる）。

import type { Unsubscribe } from 'firebase/firestore';
import { materialColor } from '../colors';
import type { Session } from '../engine';
import { materialById } from '../store';
import { cloudUser } from './account';
import { fb } from './firebase';
import { postFromSession, replyError, type PostDoc, type PostOptions, type ReplyDoc } from './model';
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
export async function createPost(s: Session, opt: PostOptions, groups: string[], lite = false): Promise<void> {
  if (groups.length === 0) throw new Error('投稿先のグループを選んでください');
  const p = cachedProfile() ?? (await getProfile());
  if (!p) throw new Error('先にプロフィールを作ってください');
  const { db, F } = await fb();
  const uid = me();
  const m = materialById(s.material);
  // lite：ルールが古いときに断られない形（教材の画像と数え方を入れない）
  const body = postFromSession(
    s,
    opt,
    m ? { name: m.name, color: materialColor(m.id), ...(m.img && !lite ? { img: m.img } : {}) } : null,
    lite ? undefined : m?.unit,
  );
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
  // 送信はつながったときに済む。ここでは待たない。ルールが古くて断られたら、画像と数え方なしで送り直す
  void batch.commit().catch((e) => {
    if ((e as { code?: string }).code === 'permission-denied' && !lite && (body.material?.img || body.laps?.u)) {
      void createPost(s, opt, groups, true);
      return;
    }
    console.warn('投稿できませんでした', e);
    // 手入力の記録は、ルールを貼り直すまで投稿できない
    if ((e as { code?: string }).code === 'permission-denied' && s.mode === 'manual') {
      document.dispatchEvent(new CustomEvent('post:failed', { detail: '手入力の記録を投稿するには、ルールの更新が必要です' }));
    }
  });
  void savePostPrefs({ material: opt.material, laps: opt.laps, lapTimes: opt.lapTimes, away: opt.away, groups }).catch(
    () => undefined,
  );
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

/** 投稿を消す（自分の投稿、または作成者ならグループの投稿）。返信も一緒に消す */
export async function deletePost(gid: string, pid: string): Promise<void> {
  const { db, F } = await fb();
  const replies = await F.getDocs(F.collection(db, 'groups', gid, 'posts', pid, 'replies'));
  // 投稿と返信を1回で消す（1回で消せるのは 500 件まで。返信がそれ以上つくことは考えない）
  const batch = F.writeBatch(db);
  for (const d of replies.docs.slice(0, 499)) batch.delete(d.ref);
  batch.delete(F.doc(db, 'groups', gid, 'posts', pid));
  await batch.commit();
}

// ---- 返信 ----

export type Reply = ReplyDoc & { id: string; pending: boolean; at: number };

/** 投稿に返信する（オフラインでも返信でき、つながったときに送られる） */
export async function addReply(gid: string, pid: string, text: string): Promise<void> {
  const err = replyError(text);
  if (err) throw new Error(err);
  const p = cachedProfile() ?? (await getProfile());
  if (!p) throw new Error('先にプロフィールを作ってください');
  const { db, F } = await fb();
  const post = F.doc(db, 'groups', gid, 'posts', pid);
  const ref = F.doc(F.collection(post, 'replies'));
  const batch = F.writeBatch(db);
  batch.set(ref, { uid: me(), name: p.name, icon: p.icon, text: text.trim(), createdAt: F.serverTimestamp() });
  batch.update(post, { replyCount: F.increment(1), lastReply: ref.id });
  void batch.commit().catch((e) => console.warn('返信できませんでした', e));
}

/** 投稿への返信を見張る（古い順） */
export async function watchReplies(gid: string, pid: string, cb: (list: Reply[]) => void): Promise<Unsubscribe> {
  const { db, F } = await fb();
  const q = F.query(F.collection(db, 'groups', gid, 'posts', pid, 'replies'), F.orderBy('createdAt'));
  return F.onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) =>
      cb(
        snap.docs.map((d) => {
          const data = d.data({ serverTimestamps: 'estimate' }) as ReplyDoc & { createdAt?: { toMillis(): number } };
          return { ...data, id: d.id, pending: d.metadata.hasPendingWrites, at: data.createdAt?.toMillis?.() ?? Date.now() };
        }),
      ),
    () => cb([]),
  );
}

/** 返信を消す（自分の返信、または作成者） */
export async function deleteReply(gid: string, pid: string, rid: string): Promise<void> {
  const { db, F } = await fb();
  const batch = F.writeBatch(db);
  batch.delete(F.doc(db, 'groups', gid, 'posts', pid, 'replies', rid));
  batch.update(F.doc(db, 'groups', gid, 'posts', pid), { replyCount: F.increment(-1), lastReply: rid });
  await batch.commit();
}

/** そのグループの自分の投稿と返信を全部消す（アカウントを消すとき） */
export async function deleteMyPosts(gid: string): Promise<void> {
  const { db, F } = await fb();
  const uid = me();
  const mine = await F.getDocs(F.query(F.collection(db, 'groups', gid, 'posts'), F.where('uid', '==', uid)));
  for (const d of mine.docs) await deletePost(gid, d.id);
  // 人の投稿への自分の返信（返信のある投稿だけ見る）
  const withReplies = await F.getDocs(F.query(F.collection(db, 'groups', gid, 'posts'), F.where('replyCount', '>', 0)));
  for (const post of withReplies.docs) {
    const replies = await F.getDocs(F.query(F.collection(post.ref, 'replies'), F.where('uid', '==', uid)));
    for (const r of replies.docs) await deleteReply(gid, post.id, r.id).catch(() => undefined);
  }
}

/** 投稿を1件見張る（返信の画面で、いいねの数などを最新にする）。消えたら null */
export async function watchPost(gid: string, pid: string, cb: (p: Post | null) => void): Promise<Unsubscribe> {
  const { db, F } = await fb();
  return F.onSnapshot(
    F.doc(db, 'groups', gid, 'posts', pid),
    { includeMetadataChanges: true },
    (d) => {
      if (!d.exists()) return cb(null);
      const data = d.data({ serverTimestamps: 'estimate' }) as PostDoc & { createdAt?: { toMillis(): number } };
      cb({ ...data, id: d.id, pending: d.metadata.hasPendingWrites, at: data.createdAt?.toMillis?.() ?? Date.now() });
    },
    () => cb(null),
  );
}
