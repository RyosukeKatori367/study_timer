// 開発用の偽のグループ機能（?fake で開いたときだけ読み込む。公開版には入らない）。
// Firebase につながずに、画面の見た目と動きを確かめるためのもの。
// ?fake     … ログインしていない状態から
// ?fake=in  … ログインしてグループに2つ入っている状態から

import type { Api } from './api';
import type { CloudUser } from './account';
import { USER_CHANGE } from './account';
import type { Group, Member } from './groups';
import { DEVELOPER_UIDS, dateKey, newInviteCode, normalizeCode, postFromSession, type UserDoc } from './model';
import type { Post, Reply } from './posts';
import type { Message } from './chat';
import { DEFAULT_POST_PREFS } from './model';
import { materialById, settings } from '../store';
import { materialColor } from '../colors';
import { weekKeys } from './model';

const MIN = 60000;
const now = Date.now();
const wait = (ms = 250) => new Promise<void>((r) => setTimeout(r, ms));

let user: CloudUser | null = null;
let profile: UserDoc | null = null;

const today = dateKey(now, settings.dayBoundaryMin);
const week = weekKeys(now, { boundaryMin: settings.dayBoundaryMin, weekStartsOn: settings.weekStartsOn });
const d = (todayMin: number, weekMin: number) => {
  const out: Record<string, number> = { [today]: todayMin * MIN };
  const other = week.find((k) => k !== today && k < today) ?? week[0];
  if (other !== today) out[other] = Math.max(0, weekMin - todayMin) * MIN;
  return out;
};

const people: Record<string, { name: string; icon: { c: string; h: number } }> = {
  me: { name: 'そら', icon: { c: 'そ', h: 170 } },
  dev: { name: 'りょう', icon: { c: '🧪', h: 280 } },
  haru: { name: 'はる', icon: { c: 'は', h: 25 } },
  yuu: { name: 'ゆう', icon: { c: 'ゆ', h: 45 } },
  rin: { name: 'りん', icon: { c: '🐱', h: 330 } },
  kei: { name: 'けい', icon: { c: 'け', h: 210 } },
};

/** 偽の教材の画像（色の地に白い文字） */
function fakeImg(color: string, text: string): string {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 96, 96);
  g.fillStyle = 'rgba(255,255,255,.9)';
  g.fillRect(10, 58, 76, 8);
  g.font = 'bold 34px sans-serif';
  g.textAlign = 'center';
  g.fillText(text, 48, 46);
  return c.toDataURL('image/jpeg', 0.8);
}

const BOOKS: Record<string, [string, string][]> = {
  me: [['リードα', '#338ced'], ['名門の森', '#e76624'], ['英単語', '#00a888']],
  dev: [['青チャート', '#338ced'], ['速読英単語', '#e76624']],
  haru: [['リードα', '#338ced'], ['化学の新研究', '#e76624'], ['古文単語', '#00a888'], ['教材なし', '#d9d9d9']],
  yuu: [['ターゲット1900', '#338ced']],
  rin: [['数学IA', '#338ced'], ['物理基礎', '#e76624']],
  kei: [['英文法', '#338ced'], ['現代文', '#e76624']],
};

/** 日ごとの合計を、その人の教材に 5:3:2 くらいで分ける */
function split(uid: string, days: Record<string, number>) {
  const books = BOOKS[uid] ?? [['教材なし', '#d9d9d9']];
  const w = [5, 3, 2, 1].slice(0, books.length);
  const sum = w.reduce((a, b) => a + b, 0);
  return Object.fromEntries(
    Object.entries(days).map(([k, ms]) => [k, Object.fromEntries(books.map(([n, c], i) => [`m${i}`, { n, c, ms: Math.round((ms * w[i]) / sum) }]))]),
  );
}

function member(uid: string, todayMin: number, weekMin: number, joined: number): Member {
  const p = uid === 'me' && profile ? profile : people[uid];
  const days = d(todayMin, weekMin);
  const month = Object.values(days).reduce((a, b) => a + b, 0) * 3;
  const sums = { all: month * 7, months: { [today.slice(0, 7)]: month } };
  const matImgs = uid === 'haru' ? { m0: fakeImg('#1e5bd8', 'α'), m1: fakeImg('#ef6c1a', '化') } : undefined;
  const tag = uid === 'haru' ? { tag: 'gouun' } : {};
  // 使っているテーマと模様（帯の見本）
  const styles: Record<string, { t: string; p: string }> = {
    me: { t: settings.theme, p: settings.pattern },
    haru: { t: 't:sakura', p: 'p:sakura' },
    dev: { t: 't:midnight', p: 'p:stars' },
    yuu: { t: 't:ramune', p: 'p:none' },
    rin: { t: 't:hojicha', p: 'p:none' },
    kei: { t: 't:aurora', p: 'p:none' },
  };
  const style = styles[uid] ? { style: styles[uid] } : {};
  return { uid, name: p.name, icon: p.icon, joinedAt: joined, joinCode: '', days, mats: split(uid, days), sums, lastStudyAt: now, ...(matImgs ? { matImgs } : {}), ...tag, ...style };
}

interface FakeGroup {
  g: Group;
  members: Member[];
  posts: Post[];
  replies: Map<string, Reply[]>;
  messages: Message[];
}

const groups = new Map<string, FakeGroup>();
/** 写真の大きい版（投稿の id → data URL） */
const fullPhotos = new Map<string, string>();
const invites = new Map<string, string>();

function seed(): void {
  const g1: FakeGroup = {
    g: { id: 'g1', name: '物理勉強会', hue: 210, ownerId: 'me', code: 'K7Q2MXRA', memberCount: 5, lastMember: 'kei', createdAt: now },
    members: [member('me', 173, 610, 1), member('dev', 95, 400, 2), member('haru', 123, 820, 3), member('yuu', 80, 300, 4), member('rin', 0, 120, 5)],
    posts: [],
    replies: new Map(),
    messages: [],
  };
  const msg = (uid: string, ago: number, text: string): Message => ({
    id: `c${ago}${uid}`,
    uid,
    name: people[uid].name,
    icon: people[uid].icon,
    text,
    createdAt: now - ago * MIN,
    at: now - ago * MIN,
    pending: false,
  });
  g1.messages = [
    msg('haru', 60 * 25, '明日の小テストの範囲どこまでだっけ'),
    msg('yuu', 60 * 25 - 2, 'p.120まで！'),
    msg('haru', 60 * 25 - 3, 'ありがと'),
    msg('dev', 95, '今日21時から一緒にポモドーロやる人いる？'),
    msg('me', 90, 'やる！'),
    msg('haru', 88, '自分もやる'),
    msg('haru', 87, '25分×4セットでいい？'),
    msg('dev', 30, 'おつかれー。リードα 240番まで終わった'),
  ];
  const post = (id: string, uid: string, ago: number, extra: Partial<Post>): Post => ({
    id,
    uid,
    name: people[uid].name,
    icon: people[uid].icon,
    createdAt: now - ago * MIN,
    at: now - ago * MIN,
    pending: false,
    sessionId: id,
    mode: 'stopwatch',
    start: now - ago * MIN - 120 * MIN,
    end: now - ago * MIN,
    studyMs: 120 * MIN,
    comment: '',
    likes: [],
    ...extra,
  });
  g1.posts = [
    post('p1', 'haru', 12, {
      studyMs: 123 * MIN,
      material: { name: 'リードα', color: '#338ced', img: fakeImg('#1e5bd8', 'α') },
      laps: { from: 231, count: 10 },
      lapMs: [11, 13, 12, 10, 14, 12, 11, 15, 13, 12].map((m) => m * MIN),
      away: { n: 2, ms: 6 * MIN },
      comment: '力学おわった！円運動むずい',
      likes: ['me', 'yuu', 'dev'],
      replyCount: 2,
    }),
    post('p2', 'me', 64, { mode: 'pomoCycle', studyMs: 50 * MIN, material: { name: '名門の森', color: '#e76624' }, likes: ['haru'] }),
    post('p3', 'dev', 190, { mode: 'timer', studyMs: 80 * MIN, comment: '英語長文3題', laps: { from: 12, count: 3 } }),
    post('p4', 'yuu', 60 * 26, { mode: 'timerUp', studyMs: 45 * MIN }),
  ];
  g1.replies.set('p1', [
    { id: 'r1', uid: 'me', name: people.me.name, icon: people.me.icon, text: 'おつかれ！円運動わかる', createdAt: now - 8 * MIN, at: now - 8 * MIN, pending: false },
    { id: 'r2', uid: 'haru', name: people.haru.name, icon: people.haru.icon, text: '明日いっしょにやろ', createdAt: now - 5 * MIN, at: now - 5 * MIN, pending: false },
  ]);
  const g2: FakeGroup = {
    g: { id: 'g2', name: '2年3組 受験組', hue: 25, ownerId: 'kei', code: 'ZP4H9WQE', memberCount: 3, lastMember: 'me', createdAt: now },
    members: [member('kei', 60, 500, 1), member('me', 173, 610, 2), member('yuu', 80, 300, 3)],
    posts: [],
    replies: new Map(),
    messages: [],
  };
  for (const fg of [g1, g2]) {
    groups.set(fg.g.id, fg);
    invites.set(fg.g.code, fg.g.id);
  }
}

// ---- 見張り ----
type Fn = () => void;
const listeners = new Set<Fn>();
const changed = () => listeners.forEach((f) => f());
function watch(fn: Fn): () => void {
  listeners.add(fn);
  queueMicrotask(fn);
  return () => listeners.delete(fn);
}

function me(): string {
  if (!user) throw new Error('ログインしていません');
  return user.uid;
}

function setUser(u: CloudUser | null): void {
  user = u;
  document.dispatchEvent(new CustomEvent(USER_CHANGE));
}

const fg = (gid: string): FakeGroup => {
  const x = groups.get(gid);
  if (!x || !x.members.some((m) => m.uid === user?.uid)) throw Object.assign(new Error('permission'), { code: 'permission-denied' });
  return x;
};

export function makeFakeApi(loggedIn: boolean, real: Api): Api {
  DEVELOPER_UIDS.push('dev');
  if (loggedIn) {
    user = { uid: 'me', email: 'sora@example.com' };
    profile = { name: 'そら', bio: '東工大志望。物理がんばる', icon: { c: 'そ', h: 170 }, groupIds: ['g1', 'g2'], postPrefs: { ...DEFAULT_POST_PREFS, groups: ['g1'] } };
    people.me = { name: profile.name, icon: profile.icon };
    seed();
  }
  let synced = Date.now() - 3 * MIN;

  return {
    ...real,
    user: () => user,
    startCloud: async () => {},
    signUp: async (email) => {
      await wait();
      profile = null;
      setUser({ uid: 'me', email });
    },
    signIn: async (email, password) => {
      await wait();
      if (password !== 'password') throw { code: 'auth/invalid-credential' };
      profile = { name: 'そら', bio: '', icon: { c: 'そ', h: 170 }, groupIds: [], postPrefs: DEFAULT_POST_PREFS };
      setUser({ uid: 'me', email });
    },
    signOut: async () => setUser(null),
    sendReset: async () => wait(),
    changePassword: async () => wait(),
    deleteAccount: async () => {
      await wait();
      profile = null;
      setUser(null);
    },

    getProfile: async () => (await wait(100), profile),
    cachedProfile: () => profile,
    saveProfile: async (p) => {
      await wait();
      profile = { ...(profile ?? { groupIds: [], postPrefs: DEFAULT_POST_PREFS }), ...p, name: p.name.trim(), bio: p.bio.trim() };
      people.me = { name: profile.name, icon: profile.icon };
      for (const x of groups.values()) for (const m of x.members) if (m.uid === 'me') Object.assign(m, people.me, profile.tag ? { tag: profile.tag } : {});
      changed();
    },
    savePostPrefs: async (prefs) => {
      if (profile) profile.postPrefs = { ...profile.postPrefs, ...prefs };
    },

    listGroups: async () => {
      await wait();
      return (profile?.groupIds ?? []).flatMap((gid) => (groups.get(gid) ? [groups.get(gid)!.g] : []));
    },
    getMembers: async (gid) => fg(gid).members,
    unreadCount: async (gid, since) => groups.get(gid)?.posts.filter((p) => p.at > since).length ?? 0,
    watchGroup: async (gid, cb) => watch(() => cb(groups.get(gid)?.g ?? null)),
    watchMembers: async (gid, cb) => watch(() => cb([...(groups.get(gid)?.members ?? [])])),
    createGroup: async (name, hue) => {
      await wait();
      const id = `g${Date.now()}`;
      const code = newInviteCode();
      groups.set(id, {
        g: { id, name: name.trim(), hue: Math.round(hue), ownerId: me(), code, memberCount: 1, lastMember: me(), createdAt: Date.now() },
        members: [member('me', 0, 0, Date.now())],
        posts: [],
        replies: new Map(),
        messages: [],
      });
      invites.set(code, id);
      profile!.groupIds.push(id);
      return { id, code };
    },
    previewInvite: async (input) => {
      await wait();
      const code = normalizeCode(input);
      const gid = code && invites.get(code);
      if (!code || !gid) return null;
      const g = groups.get(gid)!.g;
      return { code, groupId: gid, name: g.name, hue: g.hue, memberCount: g.memberCount };
    },
    joinGroup: async (input) => {
      await wait();
      const gid = invites.get(normalizeCode(input) ?? '');
      if (!gid) throw new Error('招待コードが違います。もう一度確かめてください');
      const x = groups.get(gid)!;
      if (!x.members.some((m) => m.uid === 'me')) {
        x.members.push(member('me', 0, 0, Date.now()));
        x.g.memberCount++;
      }
      if (!profile!.groupIds.includes(gid)) profile!.groupIds.push(gid);
      changed();
      return gid;
    },
    leaveGroup: async (gid) => {
      await wait();
      const x = groups.get(gid)!;
      x.members = x.members.filter((m) => m.uid !== 'me');
      x.g.memberCount--;
      profile!.groupIds = profile!.groupIds.filter((g) => g !== gid);
      changed();
    },
    removeMember: async (gid, uid) => {
      await wait();
      const x = fg(gid);
      x.members = x.members.filter((m) => m.uid !== uid);
      x.g.memberCount--;
      changed();
    },
    regenerateCode: async (gid) => {
      await wait();
      const x = fg(gid);
      invites.delete(x.g.code);
      x.g.code = newInviteCode();
      invites.set(x.g.code, gid);
      changed();
      return x.g.code;
    },
    editGroup: async (gid, name, hue) => {
      await wait();
      Object.assign(fg(gid).g, { name: name.trim(), hue: Math.round(hue) });
      changed();
    },

    createPost: async (s, opt, gids, photo) => {
      const m = materialById(s.material);
      const body = postFromSession(s, opt, m ? { name: m.name, color: materialColor(m.id) } : null);
      for (const gid of gids) {
        const id = `p${Math.random()}`;
        if (photo) fullPhotos.set(id, photo.full);
        fg(gid).posts.unshift({
          ...body,
          ...(photo ? { photo: { t: photo.thumb, w: photo.w, h: photo.h } } : {}),
          id,
          uid: 'me',
          name: profile!.name,
          icon: profile!.icon,
          createdAt: Date.now(),
          at: Date.now(),
          pending: false,
        });
      }
      if (profile) profile.postPrefs = { ...profile.postPrefs, material: opt.material, laps: opt.laps, lapTimes: opt.lapTimes, away: opt.away, groups: gids };
      changed();
    },
    watchTimeline: async (gid, cb) => watch(() => cb([...(groups.get(gid)?.posts ?? [])])),
    watchPost: async (gid, pid, cb) => watch(() => cb(groups.get(gid)?.posts.find((p) => p.id === pid) ?? null)),
    setLike: async (gid, pid, liked) => {
      const p = fg(gid).posts.find((x) => x.id === pid)!;
      p.likes = liked ? [...new Set([...p.likes, 'me'])] : p.likes.filter((u) => u !== 'me');
      changed();
    },
    getPostPhoto: async (_gid, pid) => fullPhotos.get(pid) ?? null,
    deletePost: async (gid, pid) => {
      const x = fg(gid);
      x.posts = x.posts.filter((p) => p.id !== pid);
      changed();
    },
    addReply: async (gid, pid, text) => {
      const x = fg(gid);
      const list = x.replies.get(pid) ?? [];
      list.push({ id: `r${Math.random()}`, uid: 'me', name: profile!.name, icon: profile!.icon, text: text.trim(), createdAt: Date.now(), at: Date.now(), pending: false });
      x.replies.set(pid, list);
      const p = x.posts.find((q) => q.id === pid)!;
      p.replyCount = list.length;
      changed();
    },
    watchReplies: async (gid, pid, cb) => watch(() => cb([...(groups.get(gid)?.replies.get(pid) ?? [])])),
    deleteReply: async (gid, pid, rid) => {
      const x = fg(gid);
      const list = (x.replies.get(pid) ?? []).filter((r) => r.id !== rid);
      x.replies.set(pid, list);
      x.posts.find((q) => q.id === pid)!.replyCount = list.length;
      changed();
    },

    sendMessage: async (gid, text) => {
      fg(gid).messages.push({ id: `c${Math.random()}`, uid: 'me', name: profile!.name, icon: profile!.icon, text: text.trim(), createdAt: Date.now(), at: Date.now(), pending: false });
      changed();
    },
    watchMessages: async (gid, n, cb) => watch(() => cb((groups.get(gid)?.messages ?? []).slice(-n))),
    deleteMessage: async (gid, mid) => {
      const x = fg(gid);
      x.messages = x.messages.filter((m) => m.id !== mid);
      changed();
    },
    chatUnread: async (gid, since) => groups.get(gid)?.messages.filter((m) => m.at > since && m.uid !== 'me').length ?? 0,

    // みんなのイベント：今のシーズン 342 時間（6人）
    eventTotal: async () => {
      await wait(400);
      return { total: 342 * 3600000, people: 6 };
    },
    publishEvent: async () => false,

    syncInfo: () => ({ status: 'idle', syncedAt: synced, pending: 0 }),
    syncNow: async () => {
      await wait(600);
      synced = Date.now();
    },
  };
}
