// ログイン前の説明・登録・ログイン・プロフィール・パスワードの変更・アカウントの削除の画面。

import { api } from '../../cloud/api';
import { credentialError } from '../../cloud/account';
import { BIO_MAX, NAME_MAX, PASSWORD_MIN, firstGrapheme, type Icon } from '../../cloud/model';
import { iconFromFile } from '../../cloud/profile';
import { $, html } from '../../ui/dom';
import { toast } from '../../ui/toast';
import { avatar, busy, field, header, hueSlider, type Nav, type Screen } from './ui';

/** ① ログインしていないとき */
export function welcomeScreen(nav: Nav): Screen {
  const el = html(`
    <div class="sns">
      <h1>グループ</h1>
      <div class="sns-card sns-hero">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#e6e6e6" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9.5" r="2.4"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M15.5 14.2c2.9-.4 5.5 1.4 5.5 4.3"/></svg>
        <div class="sns-hero-title">友達と勉強を見せ合う</div>
        <p class="sns-lead">招待コードでグループに入ると、終えた勉強が流れて、いいねや返信を送り合えます。今日・今週のランキングもあります</p>
      </div>
      <button type="button" class="btn primary" data-signup>新しく登録</button>
      <button type="button" class="btn ghost" data-login>ログイン</button>
      <p class="sns-lead">タイマーと記録は、ログインしなくても今までどおり使えます。ログインすると、記録が自動でバックアップされます</p>
    </div>`);
  $('[data-signup]', el).onclick = () => nav.push((n) => authScreen(n, 'signup'));
  $('[data-login]', el).onclick = () => nav.push((n) => authScreen(n, 'login'));
  return { el };
}

/** ② 新しく登録／ログイン */
export function authScreen(nav: Nav, mode: 'signup' | 'login'): Screen {
  const signup = mode === 'signup';
  const el = html(`
    <form class="sns" novalidate>
      ${header(signup ? '新しく登録' : 'ログイン', { back: true })}
      ${field('メールアドレス', '<input class="input" type="email" name="email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="you@example.com">')}
      ${field(
        signup ? `パスワード（${PASSWORD_MIN}文字以上）` : 'パスワード',
        `<input class="input" type="password" name="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="${PASSWORD_MIN}">`,
      )}
      ${
        signup
          ? `<button type="button" class="check" role="checkbox" aria-checked="false" data-agree>
               <span class="box" aria-hidden="true">✓</span>
               <span><span class="link" data-privacy>データの扱い</span>を読んで、同意します</span>
             </button>`
          : ''
      }
      <button type="submit" class="btn primary">${signup ? '登録する' : 'ログイン'}</button>
      ${signup ? '' : '<button type="button" class="sns-lead link" data-reset>パスワードを忘れた</button>'}
      <p class="sns-lead">${
        signup
          ? 'すでにアカウントがある → <button type="button" class="link" data-switch>ログイン</button>'
          : 'はじめて → <button type="button" class="link" data-switch>新しく登録</button>'
      }</p>
      <p class="sns-lead">本名や学校名は入れないでください。メールアドレスはほかの人には見えません</p>
    </form>`) as HTMLFormElement;

  const email = $<HTMLInputElement>('[name="email"]', el);
  const password = $<HTMLInputElement>('[name="password"]', el);
  const agree = el.querySelector<HTMLElement>('[data-agree]');
  if (agree) {
    agree.onclick = (e) => {
      if ((e.target as HTMLElement).closest('[data-privacy]')) return nav.push(privacyScreen);
      agree.setAttribute('aria-checked', String(agree.getAttribute('aria-checked') !== 'true'));
    };
  }
  $('[data-switch]', el).onclick = () => nav.replace((n) => authScreen(n, signup ? 'login' : 'signup'));
  el.querySelector<HTMLElement>('[data-reset]')?.addEventListener('click', async () => {
    if (!email.value.trim()) return toast('メールアドレスを入れてください');
    await busy($('[data-reset]', el), () => api.sendReset(email.value));
    toast('パスワードを決め直すメールを送りました');
  });

  el.onsubmit = async (e) => {
    e.preventDefault();
    if (signup) {
      const err = credentialError(email.value, password.value);
      if (err) return toast(err);
      if (agree?.getAttribute('aria-checked') !== 'true') return toast('データの扱いに同意してください');
    } else if (!email.value.trim() || !password.value) {
      return toast('メールアドレスとパスワードを入れてください');
    }
    const ok = await busy($('[type="submit"]', el), () =>
      signup ? api.signUp(email.value, password.value) : api.signIn(email.value, password.value),
    );
    // ログインできたら、グループタブが最初の画面から作り直す（USER_CHANGE）
    if (ok && signup) toast('登録しました。プロフィールを作りましょう');
  };
  return { el };
}

/** データの扱い（登録の前に読むもの） */
export function privacyScreen(): Screen {
  const el = html(`
    <div class="sns">
      ${header('データの扱い', { back: true })}
      <div class="prose">
        <p>グミ勉は個人が作っている勉強用のアプリです。グループ機能のために、次のものを Google の Firebase に保存します。</p>
        <h3>保存するもの</h3>
        <ul>
          <li>メールアドレスとパスワード（ログインのため。パスワードは暗号化され、開発者にも見えません）</li>
          <li>表示名・ひとこと・アイコン</li>
          <li>入っているグループ、投稿、返信、いいね、チャットのメッセージ</li>
          <li>記録・設定・教材のバックアップ</li>
          <li>グループのランキングと統計に使う、直近2週間の日ごとの勉強時間とその教材ごとの内訳（教材名と色）、今月・先月の合計、累計</li>
        </ul>
        <h3>見える人</h3>
        <ul>
          <li>表示名・アイコン・投稿・チャット・勉強時間（日ごと・教材ごと・月・累計）は、同じグループのメンバーだけに見えます</li>
          <li>メールアドレスとバックアップは、あなただけのものです</li>
          <li>開発者は、問題が起きたときに調べるため、保存されたデータを見られる立場にあります</li>
        </ul>
        <h3>消すとき</h3>
        <ul>
          <li>設定の「アカウントを削除」で、投稿・返信・チャットのメッセージ・グループの参加・バックアップ・アカウントを消せます</li>
          <li>グループを抜けても、そのグループに出した投稿とメッセージは残ります（抜ける前なら自分で消せます）</li>
        </ul>
        <h3>お願い</h3>
        <ul>
          <li>本名・学校名・住所など、あなたや友達が特定される情報は書かないでください</li>
          <li>招待コードは、知っている人にだけ教えてください</li>
        </ul>
      </div>
    </div>`);
  return { el };
}

/** ③ プロフィール。setup なら登録の直後（戻れず、ボタンは「はじめる」） */
export async function profileScreen(nav: Nav, setup = false): Promise<Screen> {
  const p = (api.cachedProfile() ?? (await api.getProfile())) || null;
  let icon: Icon = p?.icon ? { ...p.icon } : { c: '', h: Math.floor(Math.random() * 360) };
  const el = html(`
    <form class="sns" novalidate>
      ${setup ? '<h1>プロフィール</h1>' : header('プロフィール', { back: true })}
      <div class="profile-preview" data-preview></div>
      <div class="char-row">
        ${field('アイコンの文字', `<input class="input" name="char" maxlength="8" placeholder="🙂" autocomplete="off">`)}
        <div class="btn-row" style="grid-template-columns:1fr">
          <button type="button" class="btn dark small" data-image>画像を選ぶ</button>
        </div>
      </div>
      <input type="file" accept="image/*" hidden>
      ${field('アイコンの色', '<span data-hue></span>')}
      ${field(`表示名（グループの人に見える・${NAME_MAX}文字まで）`, `<input class="input" name="name" autocomplete="nickname" placeholder="そら">`)}
      ${field(`ひとこと（なくてもいい・${BIO_MAX}文字まで）`, `<input class="input" name="bio" autocomplete="off" placeholder="物理がんばる">`)}
      <button type="submit" class="btn primary">${setup ? 'はじめる' : '保存'}</button>
      ${setup ? '<p class="sns-lead">あとから設定のアカウントで変えられます</p>' : ''}
    </form>`) as HTMLFormElement;

  const char = $<HTMLInputElement>('[name="char"]', el);
  const name = $<HTMLInputElement>('[name="name"]', el);
  const bio = $<HTMLInputElement>('[name="bio"]', el);
  const imageBtn = $('[data-image]', el);
  const file = $<HTMLInputElement>('input[type="file"]', el);
  const hue = hueSlider(icon.h, 'アイコンの色');
  $('[data-hue]', el).replaceWith(hue);
  char.value = icon.c;
  name.value = p?.name ?? '';
  bio.value = p?.bio ?? '';

  const render = () => {
    const c = firstGrapheme(char.value) || firstGrapheme(name.value) || '?';
    icon = { ...icon, c, h: Number(hue.value) };
    $('[data-preview]', el).innerHTML = avatar(icon, 96);
    imageBtn.textContent = icon.img ? '画像をやめる' : '画像を選ぶ';
    hue.disabled = !!icon.img;
    char.disabled = !!icon.img;
  };
  char.oninput = render;
  name.oninput = render;
  hue.oninput = render;
  imageBtn.onclick = () => {
    if (icon.img) {
      delete icon.img;
      render();
    } else {
      file.click();
    }
  };
  file.onchange = async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    try {
      icon.img = await iconFromFile(f);
      render();
    } catch (e) {
      toast(e instanceof Error ? e.message : '画像を読み込めませんでした');
    }
  };
  render();

  el.onsubmit = async (e) => {
    e.preventDefault();
    render();
    const ok = await busy($('[type="submit"]', el), () =>
      api.saveProfile({ name: name.value, bio: bio.value, icon: { ...icon, c: firstGrapheme(char.value) || firstGrapheme(name.value) } }),
    );
    if (!ok) return;
    if (setup) nav.home();
    else {
      toast('保存しました');
      nav.back();
    }
  };
  return { el };
}

/** パスワードを変える */
export function passwordScreen(nav: Nav): Screen {
  const el = html(`
    <form class="sns" novalidate>
      ${header('パスワードを変える', { back: true })}
      ${field('今のパスワード', '<input class="input" type="password" name="current" autocomplete="current-password">')}
      ${field(`新しいパスワード（${PASSWORD_MIN}文字以上）`, '<input class="input" type="password" name="next" autocomplete="new-password">')}
      <button type="submit" class="btn primary">変える</button>
      <p class="sns-lead">変えると、ほかの端末ではもう一度ログインが必要になります</p>
    </form>`) as HTMLFormElement;
  el.onsubmit = async (e) => {
    e.preventDefault();
    const current = $<HTMLInputElement>('[name="current"]', el).value;
    const next = $<HTMLInputElement>('[name="next"]', el).value;
    if (await busy($('[type="submit"]', el), () => api.changePassword(current, next))) {
      toast('パスワードを変えました');
      nav.back();
    }
  };
  return { el };
}

/** アカウントを削除する */
export function deleteScreen(nav: Nav): Screen {
  const el = html(`
    <form class="sns" novalidate>
      ${header('アカウントを削除', { back: true })}
      <div class="prose">
        <p>次のものが消えます。元に戻せません。</p>
        <ul>
          <li>あなたの投稿・返信・チャットのメッセージ</li>
          <li>グループの参加（すべてのグループから抜けます）</li>
          <li>プロフィールとバックアップ</li>
          <li>ログインのアカウント</li>
        </ul>
        <p>この端末の記録は消えず、ログインしなくても今までどおり使えます。作成者のグループは、ほかのメンバーに作成者を渡します。</p>
      </div>
      ${field('確認のため、パスワード', '<input class="input" type="password" name="password" autocomplete="current-password">')}
      <button type="submit" class="btn primary" style="background:var(--red);color:#fff">削除する</button>
    </form>`) as HTMLFormElement;
  el.onsubmit = async (e) => {
    e.preventDefault();
    const pw = $<HTMLInputElement>('[name="password"]', el).value;
    if (!pw) return toast('パスワードを入れてください');
    if (!confirm('アカウントを削除します。よろしいですか？')) return;
    if (await busy($('[type="submit"]', el), () => api.deleteAccount(pw))) {
      toast('アカウントを削除しました');
      nav.home();
    }
  };
  return { el };
}
