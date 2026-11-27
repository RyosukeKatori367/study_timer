// Firebase の読み込み。グループ機能を使う人だけが読み込むように、最初に使うときに読み込む
// （ログインしない人は、今までどおり軽いまま）。
//
// apiKey などは「どの Firebase プロジェクトか」を示すだけで、秘密の値ではない（公開してよい）。
// データを守るのは firestore.rules のほう。

import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAiAdS8sQ5LhNgma9RFPaYXv_kKnlKEcvM',
  authDomain: 'gumibenn-e740d.firebaseapp.com',
  projectId: 'gumibenn-e740d',
  storageBucket: 'gumibenn-e740d.firebasestorage.app',
  messagingSenderId: '315437319165',
  appId: '1:315437319165:web:738bf4ef12e03787744f94',
};

export interface Fb {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  A: typeof import('firebase/auth');
  F: typeof import('firebase/firestore');
}

let loading: Promise<Fb> | null = null;

/** Firebase を読み込んで初期化する（2回目からは同じものを返す）。 */
export function fb(): Promise<Fb> {
  loading ??= load().catch((e: unknown) => {
    loading = null; // 通信できなかったときは、次に使うときにやり直す
    throw e;
  });
  return loading;
}

async function load(): Promise<Fb> {
  const [{ initializeApp }, A, F] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
  ]);
  const app = initializeApp(firebaseConfig);
  // getAuth はポップアップやリダイレクトのログインの部品まで読み込むので、使う分だけにする
  const auth = A.initializeAuth(app, {
    persistence: [A.indexedDBLocalPersistence, A.browserLocalPersistence],
  });
  auth.languageCode = 'ja';
  let db: Firestore;
  try {
    // 端末にも保存して、オフラインでも読めて、書いたものはつながったときに送られるようにする
    db = F.initializeFirestore(app, {
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    });
  } catch {
    // プライベートブラウズなどで端末に保存できないときは、メモリだけで動かす
    db = F.initializeFirestore(app, { ignoreUndefinedProperties: true });
  }
  return { app, auth, db, A, F };
}
