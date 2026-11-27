// 画面から使う、グループ機能とアカウントの操作をひとまとめにしたもの。
// 開発中は ?fake を付けて開くと、Firebase につながずに偽のデータで画面を確かめられる（公開版には入らない）。

import * as account from './account';
import * as chat from './chat';
import * as groups from './groups';
import { deleteAccount } from './index';
import * as posts from './posts';
import * as profile from './profile';
import { syncInfo, syncNow } from './sync';

const real = {
  user: account.cloudUser,
  startCloud: account.startCloud,
  signUp: account.signUp,
  signIn: account.signIn,
  signOut: account.signOut,
  sendReset: account.sendReset,
  changePassword: account.changePassword,
  deleteAccount,

  getProfile: profile.getProfile,
  cachedProfile: profile.cachedProfile,
  saveProfile: profile.saveProfile,
  savePostPrefs: profile.savePostPrefs,

  listGroups: groups.listGroups,
  getMembers: groups.getMembers,
  unreadCount: groups.unreadCount,
  watchGroup: groups.watchGroup,
  watchMembers: groups.watchMembers,
  createGroup: groups.createGroup,
  previewInvite: groups.previewInvite,
  joinGroup: groups.joinGroup,
  leaveGroup: groups.leaveGroup,
  removeMember: groups.removeMember,
  regenerateCode: groups.regenerateCode,
  editGroup: groups.editGroup,

  createPost: posts.createPost,
  watchTimeline: posts.watchTimeline,
  watchPost: posts.watchPost,
  setLike: posts.setLike,
  deletePost: posts.deletePost,
  addReply: posts.addReply,
  watchReplies: posts.watchReplies,
  deleteReply: posts.deleteReply,

  sendMessage: chat.sendMessage,
  watchMessages: chat.watchMessages,
  deleteMessage: chat.deleteMessage,
  chatUnread: chat.chatUnread,

  syncInfo,
  syncNow,
};

export type Api = typeof real;

/** 画面はこれを通して使う（開発用の偽物に差し替えられるように） */
export let api: Api = real;

export function setApi(a: Api): void {
  api = a;
}
