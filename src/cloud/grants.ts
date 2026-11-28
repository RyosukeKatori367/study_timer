// 配られたタグを読む・受け取る。grants/{uid} = { tags: ['kosan'], at }。
// 古参タグ：KOSAN_BEFORE より前にログインして、そのままログインしている人は、自分で受け取れる
// （ログインした時刻 auth_time はルールでも確かめるので、あとから作ったアカウントでは受け取れない）。
// それ以外のタグや、ログインし直した人には、開発者が配る（Firebase コンソールで grants に文書を足す）。

import { cloudUser } from './account';
import { fb } from './firebase';
import { GRANTS_CHANGE, saveGranted } from '../grants';

/** 2026-11-28 14:00（日本時間）。firestore.rules と同じ値にする */
export const KOSAN_BEFORE = 1795842000;

/** 自分に配られたタグを読み、受け取れる古参タグがあれば受け取る。新しく受け取ったタグを返す */
export async function loadGrants(): Promise<string[]> {
  const u = cloudUser();
  if (!u) return [];
  const { db, F, auth } = await fb();
  const ref = F.doc(db, 'grants', u.uid);
  const snap = await F.getDoc(ref);
  let tags: string[] = snap.exists() ? ((snap.data().tags as string[] | undefined) ?? []) : [];
  const got: string[] = [];
  if (!tags.includes('kosan') && auth.currentUser) {
    const token = await auth.currentUser.getIdTokenResult();
    const at = Number(token.claims.auth_time ?? Infinity);
    if (at < KOSAN_BEFORE) {
      try {
        const next = [...tags, 'kosan'];
        if (snap.exists()) await F.updateDoc(ref, { tags: next, at: F.serverTimestamp() });
        else await F.setDoc(ref, { tags: next, at: F.serverTimestamp() });
        tags = next;
        got.push('kosan');
      } catch (e) {
        console.warn('古参タグを受け取れませんでした', e); // ルールがまだ古いときなど。次に開いたときにまた試す
      }
    }
  }
  saveGranted(u.uid, tags);
  document.dispatchEvent(new CustomEvent(GRANTS_CHANGE, { detail: got }));
  return got;
}
