// 記録・設定・教材のバックアップ（ログインしている人だけ）。
//
// - 記録は半月ごとの文書に { s: { 記録の id: 記録 } } の形で入れる。足すときは merge で1件ずつ足すので、
//   2台の端末で同時に計っても上書きし合わない
// - 設定と教材は state 文書に丸ごと入れる。新しく変えたほうが勝つ（stateAt で比べる）
// - 「記録を全部消す」は clearedAt に時刻を入れて、ほかの端末でもその時刻までの記録を消す
// - オフラインのあいだに書いたものは、Firestore が端末に覚えておいて、つながったときに送る

import { getSessions, hasSavedState, mergeCloud, settings, allMaterials, type StoreChange, type Material, type Settings } from '../store';
import { fb } from './firebase';
import { chunkKey, fromCloud, isChunkKey, toCloud, type CloudSession } from './model';

const META = 'studytimer:sync';

interface Meta {
  uid: string;
  /** 端末で設定・教材を最後に変えた時刻（0 なら一度も変えていない） */
  stateAt: number;
  /** クラウドの記録の文書を、どこまで読んだか（サーバーの時刻） */
  pulledAt: number;
  clearedAt: number;
  /** まだ送れていない記録の id */
  dirty: string[];
  /** 最後にクラウドとやりとりできた時刻 */
  syncedAt: number;
}

interface StateDoc {
  settings: Settings;
  materials: Material[];
  stateAt: number;
  clearedAt: number;
}

let meta: Meta | null = readMeta();
let uid: string | null = null;

function readMeta(): Meta | null {
  try {
    const raw = localStorage.getItem(META);
    return raw ? (JSON.parse(raw) as Meta) : null;
  } catch {
    return null;
  }
}

function saveMeta(): void {
  try {
    if (meta) localStorage.setItem(META, JSON.stringify(meta));
  } catch {
    /* 次の起動でまた送ればよい */
  }
}

export const SYNC_CHANGE = 'cloud:sync';
export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';
let status: SyncStatus = 'idle';

function setStatus(s: SyncStatus): void {
  status = s;
  document.dispatchEvent(new CustomEvent(SYNC_CHANGE));
}

/** 設定タブの「バックアップ」に出すもの */
export function syncInfo(): { status: SyncStatus; syncedAt: number; pending: number } {
  return { status, syncedAt: meta?.syncedAt ?? 0, pending: meta?.dirty.length ?? 0 };
}

let onPulled: () => void = () => {};

/**
 * ログインしたら呼ぶ。この端末で初めてのアカウントなら、端末の記録を全部送る。
 * クラウドから取り込んで何か変わったら refresh を呼ぶ（画面を描き直す）。
 */
export async function startSync(userId: string, refresh: () => void): Promise<void> {
  uid = userId;
  onPulled = refresh;
  if (meta?.uid !== userId) {
    meta = {
      uid: userId,
      // 入れ直した直後（設定を一度も保存していない）なら、クラウドの設定を優先する
      stateAt: hasSavedState() ? 1 : 0,
      pulledAt: 0,
      clearedAt: 0,
      dirty: getSessions().map((s) => s.id),
      syncedAt: 0,
    };
    saveMeta();
  }
  await syncNow();
}

/** ログアウトしたら呼ぶ（端末の記録は残す。次に同じ人がログインしたら続きから） */
export function stopSync(): void {
  uid = null;
  clearTimeout(pushTimer);
  clearTimeout(stateTimer);
}

let running: Promise<void> | null = null;

/** クラウドから取り込んで、送れていないものを送る */
export function syncNow(): Promise<void> {
  running ??= (async () => {
    if (!uid || !meta) return;
    if (!navigator.onLine) {
      setStatus('offline');
      return;
    }
    setStatus('syncing');
    try {
      await pull();
      await pushSessions();
      meta.syncedAt = Date.now();
      saveMeta();
      setStatus('idle');
    } catch (e) {
      console.warn('バックアップできませんでした', e);
      setStatus(navigator.onLine ? 'error' : 'offline');
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/** 起動したときやアプリに戻ったときに。1分以内に済ませていればしない */
export function syncSoon(): void {
  if (meta && Date.now() - meta.syncedAt > 60_000) void syncNow();
}

async function pull(): Promise<void> {
  if (!uid || !meta) return;
  const { db, F } = await fb();
  const col = F.collection(db, 'users', uid, 'backup');
  let changed = false;

  // 設定と教材
  const stateSnap = await F.getDoc(F.doc(col, 'state'));
  const cloud = stateSnap.exists() ? (stateSnap.data() as Partial<StateDoc>) : null;
  const clearedAt = Math.max(meta.clearedAt, cloud?.clearedAt ?? 0);
  if (clearedAt > meta.clearedAt) {
    changed = mergeCloud({ clearedAt }) || changed;
    meta.clearedAt = clearedAt;
  }
  if (cloud && (cloud.stateAt ?? 0) > meta.stateAt) {
    // クラウドのほうが新しい
    changed = mergeCloud({ settings: cloud.settings, materials: cloud.materials, replaceMaterials: true }) || changed;
    meta.stateAt = cloud.stateAt ?? 0;
  } else {
    // 端末のほうが新しい（か同じ）。ほかの端末で作った教材だけ足して、送る
    if (cloud?.materials) changed = mergeCloud({ materials: cloud.materials }) || changed;
    if (!cloud || meta.stateAt > (cloud.stateAt ?? 0) || clearedAt > (cloud.clearedAt ?? 0)) await pushState();
  }

  // 記録（前回読んだあとに変わった文書だけ読む）
  const q = F.query(col, F.where('updatedAt', '>', F.Timestamp.fromMillis(meta.pulledAt)));
  const snap = await F.getDocs(q);
  const incoming: CloudSession[] = [];
  let latest = meta.pulledAt;
  for (const d of snap.docs) {
    if (!isChunkKey(d.id)) continue;
    const data = d.data() as { s?: Record<string, CloudSession>; updatedAt?: { toMillis(): number } };
    incoming.push(...Object.values(data.s ?? {}));
    latest = Math.max(latest, data.updatedAt?.toMillis() ?? 0);
  }
  if (incoming.length) changed = mergeCloud({ sessions: incoming.map(fromCloud), clearedAt: meta.clearedAt }) || changed;
  meta.pulledAt = latest;
  saveMeta();
  if (changed) onPulled();
}

async function pushSessions(): Promise<void> {
  if (!uid || !meta || meta.dirty.length === 0) return;
  const { db, F } = await fb();
  const ids = new Set(meta.dirty);
  const chunks = new Map<string, Record<string, CloudSession>>();
  for (const s of getSessions()) {
    if (!ids.has(s.id)) continue;
    const key = chunkKey(s.start);
    if (!chunks.has(key)) chunks.set(key, {});
    chunks.get(key)![s.id] = toCloud(s);
  }
  // 1回にまとめて送れるのは 500 件までなので、文書 400 個ずつに分ける
  const entries = [...chunks.entries()];
  for (let i = 0; i < entries.length; i += 400) {
    const batch = F.writeBatch(db);
    for (const [key, s] of entries.slice(i, i + 400)) {
      batch.set(F.doc(db, 'users', uid, 'backup', key), { s, updatedAt: F.serverTimestamp() }, { merge: true });
    }
    await batch.commit();
  }
  // 送っているあいだに増えた分は残す
  meta.dirty = meta.dirty.filter((id) => !ids.has(id));
  saveMeta();
}

async function pushState(): Promise<void> {
  if (!uid || !meta) return;
  const { db, F } = await fb();
  const doc: StateDoc = {
    settings: { ...settings },
    materials: allMaterials().map((m) => ({ ...m })),
    stateAt: meta.stateAt,
    clearedAt: meta.clearedAt,
  };
  await F.setDoc(F.doc(db, 'users', uid, 'backup', 'state'), { ...doc, updatedAt: F.serverTimestamp() });
}

/** 記録をクラウドからも全部消す（別の端末にも、clearedAt で伝わる） */
async function clearCloud(): Promise<void> {
  if (!uid || !meta) return;
  const { db, F } = await fb();
  const snap = await F.getDocs(F.collection(db, 'users', uid, 'backup'));
  const batch = F.writeBatch(db);
  for (const d of snap.docs) if (isChunkKey(d.id)) batch.delete(d.ref);
  await batch.commit();
  await pushState();
}

let pushTimer: ReturnType<typeof setTimeout> | undefined;
let stateTimer: ReturnType<typeof setTimeout> | undefined;

/** 端末の記録・設定が変わったとき（store から） */
export function onLocalChange(c: StoreChange): void {
  if (!meta || !uid) return;
  if (c.kind === 'sessions') {
    meta.dirty = [...new Set([...meta.dirty, ...c.ids])];
    saveMeta();
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void pushSessions().then(markSynced, onFail), 1000);
  } else if (c.kind === 'state') {
    meta.stateAt = Date.now();
    saveMeta();
    // 計測を始めるたびに設定が変わることもあるので、少しまとめてから送る
    clearTimeout(stateTimer);
    stateTimer = setTimeout(() => void pushState().then(markSynced, onFail), 3000);
  } else {
    meta.clearedAt = Date.now();
    meta.stateAt = Date.now();
    meta.dirty = [];
    saveMeta();
    void clearCloud().then(markSynced, onFail);
  }
}

function markSynced(): void {
  if (!meta) return;
  meta.syncedAt = Date.now();
  saveMeta();
  setStatus('idle');
}

function onFail(e: unknown): void {
  console.warn('バックアップできませんでした', e);
  setStatus(navigator.onLine ? 'error' : 'offline');
}

/** アカウントを消すときに、バックアップも消す */
export async function deleteBackup(userId: string): Promise<void> {
  const { db, F } = await fb();
  const snap = await F.getDocs(F.collection(db, 'users', userId, 'backup'));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = F.writeBatch(db);
    for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
    await batch.commit();
  }
  stopSync();
  meta = null;
  try {
    localStorage.removeItem(META);
  } catch {
    /* なくてもよい */
  }
}
