// グループ機能とバックアップの入り口。main.ts から initCloud を呼ぶ。
// 画面（グループタブ・投稿の確認など）は、ここに並べた関数を使う。

import { onStoreChange } from '../store';
import { USER_CHANGE, cloudUser, deleteLogin, reauth, startCloud } from './account';
import { fb } from './firebase';
import { leaveGroup, publishStudy } from './groups';
import { deleteMyMessages } from './chat';
import { deleteMyEvents, publishEvent } from './events';
import { loadGrants } from './grants';
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
    if (u) void startSync(u.uid, refresh).then(afterSync);
    else stopSync();
  });

  let publishTimer: ReturnType<typeof setTimeout> | undefined;
  onStoreChange((c) => {
    if (!cloudUser()) return;
    onLocalChange(c);
    if (c.kind !== 'state') publishAll();
    else {
      // 教材の名前や色を変えたときも、ランキングの色分けを直す（まとめて少しあとに送る）
      clearTimeout(publishTimer);
      publishTimer = setTimeout(() => void publishStudy().catch(() => undefined), 5000);
    }
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
          if (now) return startSync(now.uid, refresh).then(afterSync);
        })
        .catch((e) => console.warn('Firebase を読み込めませんでした', e));
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 3000 });
    else setTimeout(go, 1500);
  }
}

/** グループのメンバー文書と、みんなのイベントの自分の合計を送る（失敗しても次にまた送る） */
function publishAll(): void {
  void publishStudy().catch(() => undefined);
  void publishEvent().catch(() => undefined);
}

/** 起動・ログインしたとき（バックアップの読み込みのあと）。送るものと、配られたタグ */
function afterSync(): void {
  publishAll();
  void loadGrants().catch((e) => console.warn('配られたタグを読めませんでした', e));
}

/** 配られたタグの文書を消す（なければ何もしない） */
async function deleteGrant(uid: string): Promise<void> {
  const { db, F } = await fb();
  await F.deleteDoc(F.doc(db, 'grants', uid)).catch(() => undefined);
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
      await deleteMyMessages(gid);
      await leaveGroup(gid);
    } catch (e) {
      // 外されていたグループなどは読めないので、そのまま進む
      console.warn('グループの片付けができませんでした', gid, e);
    }
  }
  await deleteMyEvents(u.uid);
  await deleteGrant(u.uid);
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
