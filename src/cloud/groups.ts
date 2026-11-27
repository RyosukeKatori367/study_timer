// グループ（作る・招待コードで入る・抜ける・外す・コードを作り直す）と、メンバーの今日の勉強時間。
// 人数の増減はルールで確かめているので、入る・抜けるは必ず1回のまとめ書き（batch）で行う。

import type { Unsubscribe } from 'firebase/firestore';
import { getSessions, settings } from '../store';
import { cloudUser } from './account';
import { fb, type Fb } from './firebase';
import {
  MAX_GROUPS,
  MAX_MEMBERS,
  dateKey,
  groupNameError,
  newInviteCode,
  normalizeCode,
  recentDays,
  weekKeys,
  type GroupDoc,
  type InviteDoc,
  type MemberDoc,
} from './model';
import { cachedProfile, getProfile } from './profile';

export type Group = GroupDoc & { id: string };
export type Member = MemberDoc & { uid: string };

function me(): string {
  const u = cloudUser();
  if (!u) throw new Error('ログインしていません');
  return u.uid;
}

function needOnline(): void {
  if (!navigator.onLine) throw new Error('オフラインのため、今はできません。つながってからやり直してください');
}

async function myProfile() {
  const p = cachedProfile() ?? (await getProfile());
  if (!p || !p.name) throw new Error('先にプロフィールを作ってください');
  return p;
}

/** メンバー文書に入れる、直近の日ごとの勉強時間（設定の「1日の区切り」で数える） */
const myDays = (now = Date.now()): Record<string, number> => recentDays(getSessions(), now, settings.dayBoundaryMin);

/** ランキングで使う「今日」と「今週」の日付（見ている人の設定で決める） */
export function rankKeys(now = Date.now()): { today: string[]; week: string[] } {
  const opt = { boundaryMin: settings.dayBoundaryMin, weekStartsOn: settings.weekStartsOn };
  return { today: [dateKey(now, opt.boundaryMin)], week: weekKeys(now, opt) };
}

// ---- 一覧 ----

/** 入っているグループ。外されたグループは、自分の一覧からも消す */
export async function listGroups(): Promise<Group[]> {
  const { db, F } = await fb();
  const p = await getProfile();
  if (!p) return [];
  const out: Group[] = [];
  const gone: string[] = [];
  await Promise.all(
    p.groupIds.map(async (gid) => {
      try {
        const snap = await F.getDoc(F.doc(db, 'groups', gid));
        if (snap.exists()) out.push({ id: gid, ...(snap.data() as GroupDoc) });
        else gone.push(gid);
      } catch (e) {
        if ((e as { code?: string }).code === 'permission-denied') gone.push(gid);
        else throw e;
      }
    }),
  );
  if (gone.length) {
    await F.updateDoc(F.doc(db, 'users', me()), { groupIds: F.arrayRemove(...gone) });
    p.groupIds = p.groupIds.filter((g) => !gone.includes(g));
  }
  // 入っている順（自分の一覧の順）に並べる
  return p.groupIds.flatMap((gid) => out.filter((g) => g.id === gid));
}

/** グループの変化を見張る */
export async function watchGroup(gid: string, cb: (g: Group | null) => void): Promise<Unsubscribe> {
  const { db, F } = await fb();
  return F.onSnapshot(
    F.doc(db, 'groups', gid),
    (snap) => cb(snap.exists() ? { id: gid, ...(snap.data() as GroupDoc) } : null),
    () => cb(null),
  );
}

/** メンバーの変化を見張る（入った順） */
export async function watchMembers(gid: string, cb: (list: Member[]) => void): Promise<Unsubscribe> {
  const { db, F } = await fb();
  const q = F.query(F.collection(db, 'groups', gid, 'members'), F.orderBy('joinedAt'));
  return F.onSnapshot(
    q,
    { includeMetadataChanges: false },
    (snap) => cb(snap.docs.map((d) => ({ uid: d.id, ...(d.data({ serverTimestamps: 'estimate' }) as MemberDoc) }))),
    () => cb([]),
  );
}

// ---- 作る・入る ----

/** 入るときのメンバー文書 */
function memberData(F: Fb['F'], p: { name: string; icon: MemberDoc['icon'] }, code: string) {
  return {
    name: p.name,
    icon: p.icon,
    joinedAt: F.serverTimestamp(),
    joinCode: code,
    days: myDays(),
    lastStudyAt: getSessions().at(-1)?.end ?? 0,
  };
}

/** グループを作る。作ったグループの id と招待コードを返す */
export async function createGroup(name: string, hue: number): Promise<{ id: string; code: string }> {
  const err = groupNameError(name);
  if (err) throw new Error(err);
  needOnline();
  const p = await myProfile();
  if (p.groupIds.length >= MAX_GROUPS) throw new Error(`入れるグループは${MAX_GROUPS}個までです`);
  const { db, F } = await fb();
  const uid = me();
  const gid = F.doc(F.collection(db, 'groups')).id;
  const h = Math.round(hue) % 360;
  // 招待コードがたまたま使われていたら、作り直してもう一度
  for (let attempt = 0; ; attempt++) {
    const code = newInviteCode();
    const batch = F.writeBatch(db);
    batch.set(F.doc(db, 'groups', gid), {
      name: name.trim(),
      hue: h,
      ownerId: uid,
      code,
      memberCount: 1,
      lastMember: uid,
      createdAt: F.serverTimestamp(),
    });
    batch.set(F.doc(db, 'invites', code), { groupId: gid, name: name.trim(), hue: h, memberCount: 1 });
    batch.set(F.doc(db, 'groups', gid, 'members', uid), memberData(F, p, code));
    batch.update(F.doc(db, 'users', uid), { groupIds: F.arrayUnion(gid) });
    try {
      await batch.commit();
      p.groupIds.push(gid);
      return { id: gid, code };
    } catch (e) {
      if (attempt >= 2 || (e as { code?: string }).code !== 'permission-denied') throw e;
    }
  }
}

/** 参加する前のプレビュー（グループ名・色・人数）。コードが違えば null */
export async function previewInvite(input: string): Promise<(InviteDoc & { code: string }) | null> {
  const code = normalizeCode(input);
  if (!code) return null;
  needOnline();
  const { db, F } = await fb();
  const snap = await F.getDoc(F.doc(db, 'invites', code));
  return snap.exists() ? { code, ...(snap.data() as InviteDoc) } : null;
}

/** 招待コードで参加する。入ったグループの id を返す */
export async function joinGroup(input: string): Promise<string> {
  const inv = await previewInvite(input);
  if (!inv) throw new Error('招待コードが違います。もう一度確かめてください');
  const p = await myProfile();
  if (p.groupIds.includes(inv.groupId)) return inv.groupId;
  if (p.groupIds.length >= MAX_GROUPS) throw new Error(`入れるグループは${MAX_GROUPS}個までです`);
  if (inv.memberCount >= MAX_MEMBERS) throw new Error(`このグループは満員です（${MAX_MEMBERS}人まで）`);
  const { db, F } = await fb();
  const uid = me();
  const batch = F.writeBatch(db);
  batch.update(F.doc(db, 'groups', inv.groupId), { memberCount: F.increment(1), lastMember: uid });
  batch.set(F.doc(db, 'groups', inv.groupId, 'members', uid), memberData(F, p, inv.code));
  batch.update(F.doc(db, 'users', uid), { groupIds: F.arrayUnion(inv.groupId) });
  try {
    await batch.commit();
  } catch (e) {
    if ((e as { code?: string }).code === 'permission-denied') {
      throw new Error('参加できませんでした。コードが作り直されたか、満員の可能性があります');
    }
    throw e;
  }
  p.groupIds.push(inv.groupId);
  void syncInvite(inv.groupId);
  return inv.groupId;
}

/** 招待コードの文書の人数・名前を、グループに合わせる（プレビュー用。失敗してもよい） */
async function syncInvite(gid: string): Promise<void> {
  try {
    const { db, F } = await fb();
    const g = await F.getDoc(F.doc(db, 'groups', gid));
    if (!g.exists()) return;
    const d = g.data() as GroupDoc;
    await F.updateDoc(F.doc(db, 'invites', d.code), { name: d.name, hue: d.hue, memberCount: d.memberCount });
  } catch {
    /* プレビューの人数が少しずれるだけ */
  }
}

// ---- 抜ける・外す ----

/**
 * グループを抜ける。自分の投稿は残る。
 * 作成者が抜けるときは、いちばん前から入っている人に作成者を渡す。1人だけならグループを消す。
 */
export async function leaveGroup(gid: string): Promise<void> {
  needOnline();
  const { db, F } = await fb();
  const uid = me();
  const gRef = F.doc(db, 'groups', gid);
  const g = (await F.getDoc(gRef)).data() as GroupDoc | undefined;
  if (!g) return;
  if (g.ownerId === uid) {
    if (g.memberCount <= 1) return deleteGroup(gid, g);
    const members = await F.getDocs(F.query(F.collection(db, 'groups', gid, 'members'), F.orderBy('joinedAt')));
    const next = members.docs.find((d) => d.id !== uid);
    if (!next) return deleteGroup(gid, g);
    await F.updateDoc(gRef, { ownerId: next.id });
  }
  const batch = F.writeBatch(db);
  batch.delete(F.doc(db, 'groups', gid, 'members', uid));
  batch.update(gRef, { memberCount: F.increment(-1), lastMember: uid });
  batch.update(F.doc(db, 'users', uid), { groupIds: F.arrayRemove(gid) });
  // 抜けたあとはグループを読めないので、プレビューの人数もここで直す
  batch.update(F.doc(db, 'invites', g.code), { memberCount: g.memberCount - 1 });
  try {
    await batch.commit();
  } catch (e) {
    if ((e as { code?: string }).code !== 'permission-denied') throw e;
    // ほかの人が同時に入った・抜けたなどで人数がずれていたら、プレビューは直さずに抜ける
    const retry = F.writeBatch(db);
    retry.delete(F.doc(db, 'groups', gid, 'members', uid));
    retry.update(gRef, { memberCount: F.increment(-1), lastMember: uid });
    retry.update(F.doc(db, 'users', uid), { groupIds: F.arrayRemove(gid) });
    await retry.commit();
  }
  const p = cachedProfile();
  if (p) p.groupIds = p.groupIds.filter((x) => x !== gid);
}

/** 自分しかいないグループを消す（投稿も消す） */
async function deleteGroup(gid: string, g: GroupDoc): Promise<void> {
  const { db, F } = await fb();
  const uid = me();
  const posts = await F.getDocs(F.collection(db, 'groups', gid, 'posts'));
  for (let i = 0; i < posts.docs.length; i += 400) {
    const b = F.writeBatch(db);
    for (const d of posts.docs.slice(i, i + 400)) b.delete(d.ref);
    await b.commit();
  }
  const batch = F.writeBatch(db);
  batch.delete(F.doc(db, 'groups', gid, 'members', uid));
  batch.delete(F.doc(db, 'invites', g.code));
  batch.delete(F.doc(db, 'groups', gid));
  batch.update(F.doc(db, 'users', uid), { groupIds: F.arrayRemove(gid) });
  await batch.commit();
  const p = cachedProfile();
  if (p) p.groupIds = p.groupIds.filter((x) => x !== gid);
}

/** 作成者がメンバーを外す（外された人は、今の招待コードでまた入れるので、必要ならコードも作り直す） */
export async function removeMember(gid: string, uid: string): Promise<void> {
  needOnline();
  const { db, F } = await fb();
  const gRef = F.doc(db, 'groups', gid);
  const batch = F.writeBatch(db);
  batch.delete(F.doc(db, 'groups', gid, 'members', uid));
  batch.update(gRef, { memberCount: F.increment(-1), lastMember: uid });
  await batch.commit();
  void syncInvite(gid);
}

// ---- 作成者の設定 ----

/** 招待コードを作り直す（古いコードは使えなくなる）。新しいコードを返す */
export async function regenerateCode(gid: string): Promise<string> {
  needOnline();
  const { db, F } = await fb();
  const gRef = F.doc(db, 'groups', gid);
  const g = (await F.getDoc(gRef)).data() as GroupDoc;
  for (let attempt = 0; ; attempt++) {
    const code = newInviteCode();
    const batch = F.writeBatch(db);
    batch.update(gRef, { code });
    batch.delete(F.doc(db, 'invites', g.code));
    batch.set(F.doc(db, 'invites', code), { groupId: gid, name: g.name, hue: g.hue, memberCount: g.memberCount });
    try {
      await batch.commit();
      return code;
    } catch (e) {
      if (attempt >= 2 || (e as { code?: string }).code !== 'permission-denied') throw e;
    }
  }
}

/** グループ名と色を変える（作成者だけ） */
export async function editGroup(gid: string, name: string, hue: number): Promise<void> {
  const err = groupNameError(name);
  if (err) throw new Error(err);
  needOnline();
  const { db, F } = await fb();
  const gRef = F.doc(db, 'groups', gid);
  const g = (await F.getDoc(gRef)).data() as GroupDoc;
  const h = Math.round(hue) % 360;
  const batch = F.writeBatch(db);
  batch.update(gRef, { name: name.trim(), hue: h });
  batch.update(F.doc(db, 'invites', g.code), { name: name.trim(), hue: h, memberCount: g.memberCount });
  await batch.commit();
}

// ---- 日ごとの勉強時間（ランキング用） ----

/** 計測を終えたときに、入っているグループに日ごとの勉強時間を知らせる（オフラインならつながったときに送られる） */
export async function publishStudy(): Promise<void> {
  const p = cachedProfile() ?? (await getProfile().catch(() => null));
  if (!p || p.groupIds.length === 0) return;
  const { db, F } = await fb();
  const uid = me();
  const days = myDays();
  const last = getSessions().at(-1);
  await Promise.all(
    p.groupIds.map((gid) =>
      F.updateDoc(F.doc(db, 'groups', gid, 'members', uid), { days, lastStudyAt: last?.end ?? 0 }).catch(() => undefined),
    ),
  );
}

/** メンバーを1回だけ読む（グループ一覧の「今日 N人が勉強」用） */
export async function getMembers(gid: string): Promise<Member[]> {
  const { db, F } = await fb();
  const snap = await F.getDocs(F.collection(db, 'groups', gid, 'members'));
  return snap.docs.map((d) => ({ uid: d.id, ...(d.data({ serverTimestamps: 'estimate' }) as MemberDoc) }));
}

/** since（ミリ秒）より新しい投稿の数（グループ一覧の新着の数。オフラインなら 0） */
export async function unreadCount(gid: string, since: number): Promise<number> {
  try {
    const { db, F } = await fb();
    const q = F.query(F.collection(db, 'groups', gid, 'posts'), F.where('createdAt', '>', F.Timestamp.fromMillis(since)));
    return (await F.getCountFromServer(q)).data().count;
  } catch {
    return 0;
  }
}
