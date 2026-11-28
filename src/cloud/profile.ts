// プロフィール（表示名・ひとこと・アイコン）と、投稿の初期設定。
// 表示名とアイコンは、入っているグループのメンバー文書にも写す（グループの人はそちらを読む）。

import { USER_CHANGE, cloudUser } from './account';
import { fb } from './firebase';
import { DEFAULT_POST_PREFS, profileError, type Icon, type PostPrefs, type UserDoc } from './model';

function uid(): string {
  const u = cloudUser();
  if (!u) throw new Error('ログインしていません');
  return u.uid;
}

let cache: UserDoc | null = null;

// ログインし直したら、前の人のプロフィールを捨てる
if (typeof document !== 'undefined') document.addEventListener(USER_CHANGE, () => (cache = null));

/** 自分のプロフィール。まだ作っていなければ null（登録した直後） */
export async function getProfile(): Promise<UserDoc | null> {
  const { db, F } = await fb();
  const snap = await F.getDoc(F.doc(db, 'users', uid()));
  cache = snap.exists() ? normalize(snap.data() as Partial<UserDoc>) : null;
  return cache;
}

/** 最後に読んだプロフィール（読み直さない） */
export const cachedProfile = (): UserDoc | null => cache;

function normalize(d: Partial<UserDoc>): UserDoc {
  return {
    name: d.name ?? '',
    bio: d.bio ?? '',
    ...(d.goal ? { goal: d.goal } : {}),
    icon: d.icon ?? { c: '🙂', h: 200 },
    ...(d.tag ? { tag: d.tag } : {}),
    groupIds: d.groupIds ?? [],
    postPrefs: { ...DEFAULT_POST_PREFS, ...(d.postPrefs ?? {}) },
  };
}

/** プロフィールを保存する（初めてなら作る）。入っているグループにも反映する */
export async function saveProfile(p: { name: string; bio: string; goal?: string; icon: Icon; tag?: string }): Promise<void> {
  const err = profileError(p);
  if (err) throw new Error(err);
  const { db, F } = await fb();
  const me = uid();
  const current = cache ?? (await getProfile());
  const icon: Icon = { c: p.icon.c, h: Math.round(p.icon.h) % 360 };
  if (p.icon.img) icon.img = p.icon.img;
  const tag = p.tag ?? current?.tag;
  const goal = (p.goal ?? current?.goal ?? '').trim();
  const next: UserDoc = {
    name: p.name.trim(),
    bio: p.bio.trim(),
    ...(goal ? { goal } : {}),
    icon,
    ...(tag ? { tag } : {}),
    groupIds: current?.groupIds ?? [],
    postPrefs: current?.postPrefs ?? DEFAULT_POST_PREFS,
  };
  // グループのメンバー文書にも写す（ひとことと志望大学も。ルールが古いときは名前とアイコンだけ）
  const commit = (withBio: boolean) => {
    const batch = F.writeBatch(db);
    batch.set(F.doc(db, 'users', me), { ...next, updatedAt: F.serverTimestamp() });
    for (const gid of next.groupIds) {
      batch.update(F.doc(db, 'groups', gid, 'members', me), {
        name: next.name,
        icon: next.icon,
        ...(tag ? { tag } : {}),
        ...(withBio ? { bio: next.bio, goal } : {}),
      });
    }
    return batch.commit();
  };
  try {
    await commit(true).catch((e) => {
      if ((e as { code?: string }).code === 'permission-denied') return commit(false);
      throw e;
    });
  } catch (e) {
    // 外されたグループが残っていると失敗するので、自分のデータだけ先に保存する
    await F.setDoc(F.doc(db, 'users', me), { ...next, updatedAt: F.serverTimestamp() });
    cache = next;
    throw e;
  }
  cache = next;
}

/** 投稿の確認画面の初期値を保存する（前回の投稿の内容を覚える） */
export async function savePostPrefs(prefs: Partial<PostPrefs>): Promise<void> {
  const { db, F } = await fb();
  const current = cache ?? (await getProfile());
  if (!current) return;
  current.postPrefs = { ...current.postPrefs, ...prefs };
  await F.updateDoc(F.doc(db, 'users', uid()), { postPrefs: current.postPrefs });
}
