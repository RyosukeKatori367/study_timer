// ログイン（メールアドレスとパスワード）。
// ログインしているかどうかは端末にも覚えておき、ログインしている人だけ起動時に Firebase を読み込む。

import { fb } from './firebase';
import { PASSWORD_MIN } from './model';

const FLAG = 'studytimer:cloud';
export const USER_CHANGE = 'cloud:user';

export interface CloudUser {
  uid: string;
  email: string;
}

let user: CloudUser | null = readFlag();

function readFlag(): CloudUser | null {
  try {
    const raw = localStorage.getItem(FLAG);
    return raw ? (JSON.parse(raw) as CloudUser) : null;
  } catch {
    return null;
  }
}

function setUser(next: CloudUser | null): void {
  const same = next?.uid === user?.uid && next?.email === user?.email;
  user = next;
  try {
    if (next) localStorage.setItem(FLAG, JSON.stringify(next));
    else localStorage.removeItem(FLAG);
  } catch {
    /* 保存できなくてもその回は使える */
  }
  if (!same) document.dispatchEvent(new CustomEvent(USER_CHANGE));
}

/** 今ログインしている人（Firebase を読み込む前は、前回の状態） */
export const cloudUser = (): CloudUser | null => user;

let started = false;

/**
 * Firebase を読み込んで、ログインの状態を見張り始める。
 * 起動時はログインしている人だけ呼ぶ。グループタブを開いたときにも呼ぶ。
 */
export async function startCloud(): Promise<void> {
  const { auth, A } = await fb();
  if (started) return;
  started = true;
  await new Promise<void>((resolve) => {
    A.onAuthStateChanged(auth, (u) => {
      setUser(u ? { uid: u.uid, email: u.email ?? '' } : null);
      resolve();
    });
  });
}

export async function signUp(email: string, password: string): Promise<void> {
  const err = credentialError(email, password);
  if (err) throw new Error(err);
  const { auth, A } = await fb();
  await startCloud();
  await A.createUserWithEmailAndPassword(auth, email.trim(), password);
}

export async function signIn(email: string, password: string): Promise<void> {
  const { auth, A } = await fb();
  await startCloud();
  await A.signInWithEmailAndPassword(auth, email.trim(), password);
}

/** ログアウト。端末の記録はそのまま残る */
export async function signOut(): Promise<void> {
  const { auth, A } = await fb();
  await A.signOut(auth);
  setUser(null);
}

/** パスワードの再設定メールを送る */
export async function sendReset(email: string): Promise<void> {
  const { auth, A } = await fb();
  await A.sendPasswordResetEmail(auth, email.trim());
}

/** 今のパスワードを確かめてから、パスワードを変える */
export async function changePassword(current: string, next: string): Promise<void> {
  if (next.length < PASSWORD_MIN) throw new Error(`パスワードは${PASSWORD_MIN}文字以上にしてください`);
  await reauth(current);
  const { auth, A } = await fb();
  await A.updatePassword(auth.currentUser!, next);
}

/** 大事な操作（パスワードの変更・アカウントの削除）の前に、パスワードをもう一度確かめる */
export async function reauth(password: string): Promise<void> {
  const { auth, A } = await fb();
  const u = auth.currentUser;
  if (!u?.email) throw new Error('ログインしていません');
  await A.reauthenticateWithCredential(u, A.EmailAuthProvider.credential(u.email, password));
}

/** Firebase のログインを消す（データの片付けは deleteAccount で先に済ませる） */
export async function deleteLogin(): Promise<void> {
  const { auth, A } = await fb();
  await A.deleteUser(auth.currentUser!);
  setUser(null);
}

/** 登録する前に、入力を確かめる。問題があれば理由、なければ null */
export function credentialError(email: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'メールアドレスの形が正しくありません';
  if (password.length < PASSWORD_MIN) return `パスワードは${PASSWORD_MIN}文字以上にしてください`;
  return null;
}

/** Firebase などのエラーを、画面に出す文に直す */
export function errorMessage(e: unknown): string {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'このメールアドレスはもう登録されています。ログインしてください';
    case 'auth/invalid-email':
      return 'メールアドレスの形が正しくありません';
    case 'auth/weak-password':
      return `パスワードは${PASSWORD_MIN}文字以上にしてください`;
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'メールアドレスかパスワードが違います';
    case 'auth/too-many-requests':
      return '何度も失敗したので、しばらく待ってからやり直してください';
    case 'auth/network-request-failed':
    case 'unavailable':
      return '通信できませんでした。電波のよいところでやり直してください';
    case 'auth/requires-recent-login':
      return '安全のため、もう一度ログインしてからやり直してください';
    case 'auth/user-disabled':
      return 'このアカウントは使えなくなっています';
    case 'permission-denied':
      return 'この操作はできません（グループから外れたか、コードが変わった可能性があります）';
    case 'not-found':
      return '見つかりませんでした';
  }
  if (e instanceof Error && !code) return e.message;
  return 'うまくいきませんでした。時間をおいてやり直してください';
}
