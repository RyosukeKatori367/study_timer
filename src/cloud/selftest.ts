// セキュリティルールの確かめ（cloud-test.html から使う。アプリの画面からは使わない）。
// テスト用のアカウントを3つ作り、グループの作成・参加・投稿などが
// 「できるべきことはでき、できてはいけないことはできない」かを、本物の Firebase で確かめる。
// 最後にテスト用のデータとアカウントは消す。今のログインには影響しない（別の接続を使う）。

import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import * as A from 'firebase/auth';
import * as F from 'firebase/firestore';
import { newInviteCode } from './model';

const config = {
  apiKey: 'AIzaSyAiAdS8sQ5LhNgma9RFPaYXv_kKnlKEcvM',
  authDomain: 'gumibenn-e740d.firebaseapp.com',
  projectId: 'gumibenn-e740d',
};

interface Who {
  name: string;
  app: FirebaseApp;
  auth: A.Auth;
  db: F.Firestore;
  uid: string;
}

const out = document.getElementById('out')!;
let pass = 0;
let fail = 0;

function line(ok: boolean, text: string, detail = ''): void {
  const li = document.createElement('li');
  li.className = ok ? 'ok' : 'ng';
  li.textContent = `${ok ? '○' : '×'} ${text}${detail ? `（${detail}）` : ''}`;
  out.append(li);
  if (ok) pass++;
  else fail++;
}

/** できるべきこと */
async function allow(text: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    line(true, text);
  } catch (e) {
    line(false, text, (e as { code?: string }).code ?? String(e));
  }
}

/** できてはいけないこと */
async function deny(text: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    line(false, text, 'できてしまった');
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    line(code === 'permission-denied', text, code === 'permission-denied' ? '' : code || String(e));
  }
}

async function user(name: string): Promise<Who> {
  const app = initializeApp(config, `test-${name}-${Date.now()}`);
  const auth = A.initializeAuth(app, { persistence: A.inMemoryPersistence });
  const db = F.initializeFirestore(app, { ignoreUndefinedProperties: true });
  const email = `gumiben-test-${name}-${Date.now().toString(36)}@example.com`;
  const cred = await A.createUserWithEmailAndPassword(auth, email, `test-${crypto.randomUUID()}`);
  return { name, app, auth, db, uid: cred.user.uid };
}

const icon = { c: '🧪', h: 200 };
const profile = (name: string) => ({
  name,
  bio: '',
  icon,
  groupIds: [],
  postPrefs: { material: true, laps: true, lapTimes: false, groups: [], ask: true },
  updatedAt: F.serverTimestamp(),
});
const member = (code: string) => ({
  name: 'テスト',
  icon,
  joinedAt: F.serverTimestamp(),
  joinCode: code,
  todayStart: 0,
  todayMs: 0,
  lastStudyAt: 0,
});
const post = (uid: string) => ({
  uid,
  name: 'テスト',
  icon,
  createdAt: F.serverTimestamp(),
  sessionId: 'test',
  mode: 'timer',
  start: 0,
  end: 1,
  studyMs: 600000,
  laps: { from: 1, count: 3 },
  comment: 'テスト投稿',
  likes: [],
});

async function run(): Promise<void> {
  out.textContent = '';
  pass = fail = 0;
  const status = document.getElementById('status')!;
  status.textContent = '確かめています…';
  const users: Who[] = [];
  try {
    const a = await user('a');
    const b = await user('b');
    const c = await user('c');
    users.push(a, b, c);
    line(true, 'テスト用のアカウントを3つ作った');

    // ---- プロフィール ----
    await allow('自分のプロフィールを作れる', () => F.setDoc(F.doc(a.db, 'users', a.uid), profile('A')));
    await F.setDoc(F.doc(b.db, 'users', b.uid), profile('B'));
    await F.setDoc(F.doc(c.db, 'users', c.uid), profile('C'));
    await deny('人のプロフィールは読めない', () => F.getDoc(F.doc(b.db, 'users', a.uid)));
    await deny('人のプロフィールは書けない', () => F.setDoc(F.doc(b.db, 'users', a.uid), profile('x')));
    await deny('人のバックアップは読めない', () => F.getDoc(F.doc(b.db, 'users', a.uid, 'backup', 'state')));
    await allow('自分のバックアップは書ける', () =>
      F.setDoc(F.doc(a.db, 'users', a.uid, 'backup', 'state'), { stateAt: 1 }),
    );
    await deny('表示名が長すぎると保存できない', () =>
      F.setDoc(F.doc(a.db, 'users', a.uid), { ...profile('あ'.repeat(41)) }),
    );

    // ---- グループを作る ----
    const gid = F.doc(F.collection(a.db, 'groups')).id;
    const code = newInviteCode();
    const g = F.doc(a.db, 'groups', gid);
    await allow('グループを作れる', async () => {
      const batch = F.writeBatch(a.db);
      batch.set(g, { name: 'テスト班', hue: 120, ownerId: a.uid, code, memberCount: 1, lastMember: a.uid, createdAt: F.serverTimestamp() });
      batch.set(F.doc(a.db, 'invites', code), { groupId: gid, name: 'テスト班', hue: 120, memberCount: 1 });
      batch.set(F.doc(a.db, 'groups', gid, 'members', a.uid), member(code));
      batch.update(F.doc(a.db, 'users', a.uid), { groupIds: F.arrayUnion(gid) });
      await batch.commit();
    });
    await deny('人を作成者にしてグループを作れない', async () => {
      const gid2 = F.doc(F.collection(b.db, 'groups')).id;
      const code2 = newInviteCode();
      const batch = F.writeBatch(b.db);
      batch.set(F.doc(b.db, 'groups', gid2), { name: 'x', hue: 1, ownerId: a.uid, code: code2, memberCount: 1, lastMember: b.uid, createdAt: F.serverTimestamp() });
      batch.set(F.doc(b.db, 'invites', code2), { groupId: gid2, name: 'x', hue: 1, memberCount: 1 });
      batch.set(F.doc(b.db, 'groups', gid2, 'members', b.uid), member(code2));
      batch.update(F.doc(b.db, 'users', b.uid), { groupIds: F.arrayUnion(gid2) });
      await batch.commit();
    });

    // ---- 参加する前 ----
    await allow('コードを知っていれば、招待のプレビューを読める', async () => {
      const s = await F.getDoc(F.doc(b.db, 'invites', code));
      if (!s.exists() || s.data().groupId !== gid) throw new Error('中身が違う');
    });
    await deny('招待コードの一覧は取れない', () => F.getDocs(F.collection(b.db, 'invites')));
    await deny('入る前はグループを読めない', () => F.getDoc(F.doc(b.db, 'groups', gid)));
    await deny('入る前はメンバーを読めない', () => F.getDocs(F.collection(b.db, 'groups', gid, 'members')));
    await deny('入る前は投稿を読めない', () => F.getDocs(F.collection(b.db, 'groups', gid, 'posts')));
    await deny('違うコードでは入れない', async () => {
      const batch = F.writeBatch(b.db);
      batch.update(F.doc(b.db, 'groups', gid), { memberCount: F.increment(1), lastMember: b.uid });
      batch.set(F.doc(b.db, 'groups', gid, 'members', b.uid), member(newInviteCode()));
      batch.update(F.doc(b.db, 'users', b.uid), { groupIds: F.arrayUnion(gid) });
      await batch.commit();
    });
    await deny('人数を増やさずには入れない', async () => {
      const batch = F.writeBatch(b.db);
      batch.set(F.doc(b.db, 'groups', gid, 'members', b.uid), member(code));
      batch.update(F.doc(b.db, 'users', b.uid), { groupIds: F.arrayUnion(gid) });
      await batch.commit();
    });
    await deny('人数を2以上増やせない', async () => {
      const batch = F.writeBatch(b.db);
      batch.update(F.doc(b.db, 'groups', gid), { memberCount: F.increment(2), lastMember: b.uid });
      batch.set(F.doc(b.db, 'groups', gid, 'members', b.uid), member(code));
      batch.update(F.doc(b.db, 'users', b.uid), { groupIds: F.arrayUnion(gid) });
      await batch.commit();
    });

    // ---- 参加する ----
    await allow('正しいコードで入れる', async () => {
      const batch = F.writeBatch(b.db);
      batch.update(F.doc(b.db, 'groups', gid), { memberCount: F.increment(1), lastMember: b.uid });
      batch.set(F.doc(b.db, 'groups', gid, 'members', b.uid), member(code));
      batch.update(F.doc(b.db, 'users', b.uid), { groupIds: F.arrayUnion(gid) });
      await batch.commit();
    });
    await allow('入ったあとは、プレビューの人数をグループに合わせられる', () =>
      F.updateDoc(F.doc(b.db, 'invites', code), { name: 'テスト班', hue: 120, memberCount: 2 }),
    );
    await deny('プレビューに違う人数は入れられない', () => F.updateDoc(F.doc(b.db, 'invites', code), { memberCount: 40 }));
    await allow('入ったあとはメンバーを読める', () => F.getDocs(F.collection(b.db, 'groups', gid, 'members')));
    await deny('メンバーは作成者を変えられない', () => F.updateDoc(F.doc(b.db, 'groups', gid), { ownerId: b.uid }));
    await deny('メンバーは招待コードを変えられない', () => F.updateDoc(F.doc(b.db, 'groups', gid), { code: newInviteCode() }));
    await deny('メンバーは人数だけを変えられない', () => F.updateDoc(F.doc(b.db, 'groups', gid), { memberCount: 1 }));
    await deny('人のメンバー情報は書き換えられない', () =>
      F.updateDoc(F.doc(b.db, 'groups', gid, 'members', a.uid), { todayMs: 999 }),
    );
    await allow('自分の今日の時間は書ける', () =>
      F.updateDoc(F.doc(b.db, 'groups', gid, 'members', b.uid), { todayStart: 1, todayMs: 60000, lastStudyAt: 2 }),
    );

    // ---- 投稿 ----
    const pid = F.doc(F.collection(b.db, 'groups', gid, 'posts')).id;
    await allow('メンバーは投稿できる', () => F.setDoc(F.doc(b.db, 'groups', gid, 'posts', pid), post(b.uid)));
    await deny('人になりすまして投稿できない', () => F.addDoc(F.collection(b.db, 'groups', gid, 'posts'), post(a.uid)));
    await deny('最初からいいねの入った投稿は作れない', () =>
      F.addDoc(F.collection(b.db, 'groups', gid, 'posts'), { ...post(b.uid), likes: [a.uid] }),
    );
    await deny('入っていない人は投稿できない', () => F.addDoc(F.collection(c.db, 'groups', gid, 'posts'), post(c.uid)));
    await allow('メンバーはタイムラインを読める', () =>
      F.getDocs(F.query(F.collection(a.db, 'groups', gid, 'posts'), F.orderBy('createdAt', 'desc'), F.limit(30))),
    );
    await allow('いいねできる', () => F.updateDoc(F.doc(a.db, 'groups', gid, 'posts', pid), { likes: F.arrayUnion(a.uid) }));
    await deny('人の分のいいねは足せない', () => F.updateDoc(F.doc(a.db, 'groups', gid, 'posts', pid), { likes: F.arrayUnion(c.uid) }));
    await deny('人の投稿の中身は変えられない', () => F.updateDoc(F.doc(a.db, 'groups', gid, 'posts', pid), { comment: '書き換え' }));
    await allow('いいねを取り消せる', () => F.updateDoc(F.doc(a.db, 'groups', gid, 'posts', pid), { likes: F.arrayRemove(a.uid) }));
    await deny('入っていない人は投稿を読めない', () => F.getDocs(F.collection(c.db, 'groups', gid, 'posts')));
    await deny('入っていない人はいいねできない', () =>
      F.updateDoc(F.doc(c.db, 'groups', gid, 'posts', pid), { likes: F.arrayUnion(c.uid) }),
    );

    // ---- 外す・コードを作り直す ----
    await deny('メンバーは人を外せない', async () => {
      const batch = F.writeBatch(b.db);
      batch.delete(F.doc(b.db, 'groups', gid, 'members', a.uid));
      batch.update(F.doc(b.db, 'groups', gid), { memberCount: F.increment(-1), lastMember: a.uid });
      await batch.commit();
    });
    await deny('作成者は抜けられない（先に作成者を渡す）', async () => {
      const batch = F.writeBatch(a.db);
      batch.delete(F.doc(a.db, 'groups', gid, 'members', a.uid));
      batch.update(F.doc(a.db, 'groups', gid), { memberCount: F.increment(-1), lastMember: a.uid });
      await batch.commit();
    });
    await allow('作成者はメンバーを外せる', async () => {
      const batch = F.writeBatch(a.db);
      batch.delete(F.doc(a.db, 'groups', gid, 'members', b.uid));
      batch.update(F.doc(a.db, 'groups', gid), { memberCount: F.increment(-1), lastMember: b.uid });
      await batch.commit();
    });
    await deny('外されたら投稿を読めない', () => F.getDocs(F.collection(b.db, 'groups', gid, 'posts')));
    const code2 = newInviteCode();
    await allow('作成者は招待コードを作り直せる', async () => {
      const batch = F.writeBatch(a.db);
      batch.update(F.doc(a.db, 'groups', gid), { code: code2 });
      batch.delete(F.doc(a.db, 'invites', code));
      batch.set(F.doc(a.db, 'invites', code2), { groupId: gid, name: 'テスト班', hue: 120, memberCount: 1 });
      await batch.commit();
    });
    await allow('古いコードのプレビューは消えている', async () => {
      if ((await F.getDoc(F.doc(b.db, 'invites', code))).exists()) throw new Error('残っている');
    });
    await deny('古いコードでは入り直せない', async () => {
      const batch = F.writeBatch(b.db);
      batch.update(F.doc(b.db, 'groups', gid), { memberCount: F.increment(1), lastMember: b.uid });
      batch.set(F.doc(b.db, 'groups', gid, 'members', b.uid), member(code));
      await batch.commit();
    });
    await allow('外された人は、自分の投稿を消せる', () => F.deleteDoc(F.doc(b.db, 'groups', gid, 'posts', pid)));

    // ---- 片付け（グループを消す） ----
    await allow('作成者1人なら、グループを消せる', async () => {
      const batch = F.writeBatch(a.db);
      batch.delete(F.doc(a.db, 'groups', gid, 'members', a.uid));
      batch.delete(F.doc(a.db, 'invites', code2));
      batch.delete(g);
      batch.update(F.doc(a.db, 'users', a.uid), { groupIds: F.arrayRemove(gid) });
      await batch.commit();
    });
  } catch (e) {
    line(false, '途中で止まりました', (e as { code?: string }).code ?? String(e));
  } finally {
    for (const u of users) {
      try {
        await F.deleteDoc(F.doc(u.db, 'users', u.uid, 'backup', 'state')).catch(() => undefined);
        await F.deleteDoc(F.doc(u.db, 'users', u.uid)).catch(() => undefined);
        await A.deleteUser(u.auth.currentUser!);
      } catch {
        /* 残っても害はない（Firebase コンソールで消せる） */
      }
      await deleteApp(u.app).catch(() => undefined);
    }
    status.textContent = fail === 0 ? `すべて OK（${pass}件）` : `${fail}件 おかしい（OK ${pass}件）`;
    status.className = fail === 0 ? 'ok' : 'ng';
  }
}

document.getElementById('run')!.addEventListener('click', () => void run());
