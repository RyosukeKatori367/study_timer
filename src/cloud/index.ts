// グループ機能とバックアップの入り口。main.ts から initCloud を呼ぶ。
// 画面（グループタブ・投稿の確認など）は、ここに並べた関数を使う。

import { onStoreChange } from '../store';
import { USER_CHANGE, cloudUser, deleteLogin, reauth, startCloud } from './account';
import { fb } from './firebase';
import { leaveGroup, publishToday } from './groups';
import { deleteMyPosts } from './posts';
import { getProfile } from './profile';
import { deleteBackup, onLocalChange, startSync, stopSync, syncSoon } from './sync';

/**
 * 起動時に呼ぶ。ログインしている人だけ Firebase を読み込み、バックアップを始める。
 * refresh は、クラウドから記録や設定を取り込んだときに画面を描き直すためのもの。
 */
export function initCloud(refresh: () => void): void {
  document.addEventListener(USER_CHANGE, () => {
    const u = cloudUser();
    if (u) void startSync(u.uid, refresh);
    else stopSync();
  });

  onStoreChange((c) => {
    if (!cloudUser()) return;
    onLocalChange(c);
    if (c.kind !== 'state') void publishToday().catch(() => undefined);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && cloudUser()) syncSoon();
  });
  window.addEventListener('online', () => {
    if (cloudUser()) syncSoon();
  });

  const u = cloudUser();
  if (u) {
    // 計測の画面が出てから読み込む（起動を遅くしない）
    const go = () =>
      void startCloud()
        .then(() => {
          const now = cloudUser();
          if (now) return startSync(now.uid, refresh);
        })
        .catch((e) => console.warn('Firebase を読み込めませんでした', e));
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 3000 });
    else setTimeout(go, 1500);
  }
}

/**
 * アカウントを消す。パスワードを確かめてから、投稿・グループの参加・バックアップ・プロフィールを消す。
 * 端末の記録は残る。
 */
export async function deleteAccount(password: string): Promise<void> {
  const u = cloudUser();
  if (!u) return;
  await reauth(password);
  const p = await getProfile();
  for (const gid of p?.groupIds ?? []) {
    try {
      await deleteMyPosts(gid);
      await leaveGroup(gid);
    } catch (e) {
      // 外されていたグループなどは読めないので、そのまま進む
      console.warn('グループの片付けができませんでした', gid, e);
    }
  }
  await deleteBackup(u.uid);
  const { db, F } = await fb();
  await F.deleteDoc(F.doc(db, 'users', u.uid));
  await deleteLogin();
}

export { cloudUser, USER_CHANGE } from './account';
export * as account from './account';
export * as groups from './groups';
export * as posts from './posts';
export * as profile from './profile';
export { syncInfo, syncNow, SYNC_CHANGE } from './sync';
