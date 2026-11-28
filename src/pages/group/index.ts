// グループタブ。ログインしていなければ説明と登録・ログイン、していればグループ一覧から始まる。

import { api } from '../../cloud/api';
import { USER_CHANGE } from '../../cloud/account';
import { normalizeCode } from '../../cloud/model';
import { initCompose } from './compose';
import { joinScreen, listScreen } from './groups';
import { welcomeScreen } from './account';
import { initAccountSection } from './settings-account';
import { createNav, type Nav, type ScreenFn } from './ui';

export const SHOW_VIEW = 'view:show';

let nav: Nav | null = null;
let started = false;
/** 招待のリンク（?join=コード）から開いたときのコード */
let pendingJoin: string | null = null;

const root = (): ScreenFn => (api.user() ? listScreen : welcomeScreen);

/** グループタブを出す（ほかのタブから、この画面を開くときに使う） */
function openGroup(fn?: ScreenFn): void {
  document.dispatchEvent(new CustomEvent(SHOW_VIEW, { detail: 'group' }));
  if (fn) nav?.push(fn);
}

export function initGroupPage(view: HTMLElement, settingsView: HTMLElement): void {
  nav = createNav(view, root);
  initCompose();
  initAccountSection(settingsView, (fn) => {
    ensureStarted();
    openGroup(fn);
  });

  document.addEventListener(USER_CHANGE, () => {
    if (!started) return;
    nav!.home();
    takePendingJoin();
  });
  // タブを開いたときに、はじめて中身を作る（ログインしない人は Firebase を読み込まない）
  document.addEventListener('group:show', ensureStarted);

  // 招待のリンクから開いた
  const params = new URLSearchParams(location.search);
  const code = normalizeCode(params.get('join') ?? '');
  if (code) {
    pendingJoin = code;
    params.delete('join');
    const q = params.toString();
    history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`);
    queueMicrotask(() => openGroup());
  }
}

/** ほかのタブから、グループタブのこの画面を開く（ログイン・登録など） */
export function openGroupScreen(fn: ScreenFn): void {
  if (!nav) return void document.dispatchEvent(new CustomEvent(SHOW_VIEW, { detail: 'group' }));
  ensureStarted();
  openGroup(fn);
}

function ensureStarted(): void {
  if (started) return;
  started = true;
  nav!.home();
  if (api.user()) void api.startCloud().catch(() => undefined);
  takePendingJoin();
}

function takePendingJoin(): void {
  if (!pendingJoin || !api.user()) return;
  const code = pendingJoin;
  pendingJoin = null;
  nav!.push((n) => joinScreen(n, code));
}
