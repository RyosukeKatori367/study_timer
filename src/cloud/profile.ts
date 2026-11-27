// プロフィール（表示名・ひとこと・アイコン）と、投稿の初期設定。
// 表示名とアイコンは、入っているグループのメンバー文書にも写す（グループの人はそちらを読む）。

import { USER_CHANGE, cloudUser } from './account';
import { fb } from './firebase';
import { DEFAULT_POST_PREFS, ICON_IMAGE_MAX, profileError, type Icon, type PostPrefs, type UserDoc } from './model';

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
    icon: d.icon ?? { c: '🙂', h: 200 },
    groupIds: d.groupIds ?? [],
    postPrefs: { ...DEFAULT_POST_PREFS, ...(d.postPrefs ?? {}) },
  };
}

/** プロフィールを保存する（初めてなら作る）。入っているグループにも反映する */
export async function saveProfile(p: { name: string; bio: string; icon: Icon }): Promise<void> {
  const err = profileError(p);
  if (err) throw new Error(err);
  const { db, F } = await fb();
  const me = uid();
  const current = cache ?? (await getProfile());
  const icon: Icon = { c: p.icon.c, h: Math.round(p.icon.h) % 360 };
  if (p.icon.img) icon.img = p.icon.img;
  const next: UserDoc = {
    name: p.name.trim(),
    bio: p.bio.trim(),
    icon,
    groupIds: current?.groupIds ?? [],
    postPrefs: current?.postPrefs ?? DEFAULT_POST_PREFS,
  };
  const batch = F.writeBatch(db);
  batch.set(F.doc(db, 'users', me), { ...next, updatedAt: F.serverTimestamp() });
  for (const gid of next.groupIds) {
    batch.update(F.doc(db, 'groups', gid, 'members', me), { name: next.name, icon: next.icon });
  }
  try {
    await batch.commit();
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

/**
 * 選んだ画像を、真ん中を正方形に切り抜いて 128px の JPEG にする。
 * 画像の置き場所（Storage）は使わず、プロフィールに直接入れるので小さくする（5〜10KB ほど）。
 */
export async function iconFromFile(file: File, size = 128): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('画像を選んでください');
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('画像を読み込めませんでした');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  for (const q of [0.8, 0.65, 0.5]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.length <= ICON_IMAGE_MAX) return url;
  }
  throw new Error('画像が大きすぎました。別の画像を選んでください');
}
