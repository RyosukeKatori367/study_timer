// 設定タブのいちばん上に出す「アカウント」の欄。
// ログインしていなければ、ログイン・登録への入り口だけ出す。

import { api } from '../../cloud/api';
import { USER_CHANGE } from '../../cloud/account';
import { SYNC_CHANGE } from '../../cloud/sync';
import { esc, html } from '../../ui/dom';
import { toast } from '../../ui/toast';
import { authScreen, deleteScreen, passwordScreen, profileScreen } from './account';
import { relTime } from './fmt';
import { avatar, type ScreenFn } from './ui';

const ICON = '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>';

export function initAccountSection(view: HTMLElement, open: (fn: ScreenFn) => void): void {
  const section = html(`
    <section class="group" aria-label="アカウント">
      <h2 class="group-head">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON}</svg>
        アカウント
      </h2>
      <div class="group-card"></div>
    </section>`);
  view.querySelector('h1')!.after(section);
  const card = section.querySelector<HTMLElement>('.group-card')!;
  const foot = view.querySelector<HTMLElement>('.settings-foot');

  const backupText = (): string => {
    const s = api.syncInfo();
    if (s.status === 'syncing') return 'バックアップ中…';
    if (s.status === 'offline') return 'オフライン';
    if (s.status === 'error') return 'できませんでした';
    if (s.pending > 0) return `送信待ち ${s.pending}件`;
    return s.syncedAt ? `${relTime(s.syncedAt) || '1週間以上前'}` : 'まだ';
  };

  const render = () => {
    const u = api.user();
    if (foot) {
      foot.textContent = u
        ? '記録はこの端末に保存し、ログイン中はバックアップもしています'
        : '記録はこの端末の中にだけ保存されます';
    }
    if (!u) {
      card.innerHTML = `
        <button type="button" class="row" data-login>
          <span class="row-label">ログイン・新しく登録</span><span class="chevron" aria-hidden="true">›</span>
        </button>
        <div class="row-note">ログインすると、記録・設定・教材が自動でバックアップされ、グループで友達と勉強を見せ合えます。タイマーはログインしなくても使えます</div>`;
      card.querySelector<HTMLElement>('[data-login]')!.onclick = () => open((n) => authScreen(n, 'login'));
      return;
    }
    const p = api.cachedProfile();
    card.innerHTML = `
      <button type="button" class="row" data-profile style="min-height:64px">
        <span class="row-label" style="display:flex;align-items:center;gap:12px;min-width:0">
          ${p ? avatar(p.icon, 42) : ''}
          <span style="display:flex;flex-direction:column;min-width:0">
            <span class="sns-name">${esc(p?.name || 'プロフィールを作る')}</span>
            <span class="sns-row-sub sns-name">${esc(u.email)}</span>
          </span>
        </span>
        <span class="chevron" aria-hidden="true">›</span>
      </button>
      <button type="button" class="row" data-backup>
        <span class="row-label">バックアップ</span>
        <span class="row-value"><span>${esc(backupText())}</span></span>
      </button>
      <div class="row-note">記録・設定・教材を自動でバックアップします。タップすると今すぐ行います。入れ直したときや機種を変えたときは、ログインすれば戻ります</div>
      <button type="button" class="row" role="switch" data-ask aria-checked="${p?.postPrefs.ask ?? true}">
        <span class="row-label">終えたら投稿画面を出す</span><span class="switch" aria-hidden="true"></span>
      </button>
      <button type="button" class="row" data-password><span class="row-label">パスワードを変える</span><span class="chevron" aria-hidden="true">›</span></button>
      <button type="button" class="row" data-logout><span class="row-label">ログアウト</span></button>
      <button type="button" class="row danger" data-delete><span class="row-label">アカウントを削除</span></button>
      <div class="row-note">ログアウトしても、この端末の記録は消えません。アカウントを削除すると、投稿とグループの参加がすべて消えます</div>`;

    card.querySelector<HTMLElement>('[data-profile]')!.onclick = () => open((n) => profileScreen(n));
    card.querySelector<HTMLElement>('[data-backup]')!.onclick = () => void api.syncNow().then(render);
    card.querySelector<HTMLElement>('[data-ask]')!.onclick = async () => {
      const prof = api.cachedProfile() ?? (await api.getProfile().catch(() => null));
      if (!prof) return toast('先にプロフィールを作ってください');
      const ask = !prof.postPrefs.ask;
      prof.postPrefs.ask = ask;
      render();
      void api.savePostPrefs({ ask }).catch(() => toast('保存できませんでした'));
    };
    card.querySelector<HTMLElement>('[data-password]')!.onclick = () => open(passwordScreen);
    card.querySelector<HTMLElement>('[data-logout]')!.onclick = async () => {
      if (!confirm('ログアウトしますか？この端末の記録は消えません')) return;
      try {
        await api.signOut();
        toast('ログアウトしました');
      } catch {
        toast('ログアウトできませんでした');
      }
    };
    card.querySelector<HTMLElement>('[data-delete]')!.onclick = () => open(deleteScreen);
  };

  document.addEventListener(USER_CHANGE, () => {
    render();
    // プロフィールを読んでから、アイコンと名前を出し直す
    if (api.user()) void api.getProfile().then(render, () => undefined);
  });
  document.addEventListener(SYNC_CHANGE, render);
  document.addEventListener('settings:show', () => {
    render();
    if (api.user() && !api.cachedProfile()) void api.getProfile().then(render, () => undefined);
  });
  render();
}
