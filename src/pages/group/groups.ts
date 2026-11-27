// グループ一覧・グループを作る・招待コード・参加・名前と色を変える の画面。

import { api } from '../../cloud/api';
import type { Group } from '../../cloud/groups';
import { GROUP_NAME_MAX, MAX_MEMBERS, dateKey, formatCode, normalizeCode } from '../../cloud/model';
import { settings } from '../../store';
import { $, esc, html } from '../../ui/dom';
import { toast } from '../../ui/toast';
import { profileScreen } from './account';
import { rememberGroups } from './compose';
import { badgeText } from './fmt';
import { timelineScreen } from './timeline';
import { busy, field, groupIcon, header, hueSlider, type Nav, type Screen } from './ui';

// ---- 新着（最後に見た時刻をグループごとに覚える） ----

const SEEN = 'studytimer:seen';

function seenMap(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SEEN) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

export function markSeen(gid: string, at = Date.now()): void {
  const m = seenMap();
  m[gid] = at;
  try {
    localStorage.setItem(SEEN, JSON.stringify(m));
  } catch {
    /* 新着の数がずれるだけ */
  }
}

// ---- ④ グループ一覧 ----

export async function listScreen(nav: Nav): Promise<Screen> {
  const profile = api.cachedProfile() ?? (await api.getProfile());
  if (!profile?.name) return profileScreen(nav, true);

  const el = html(`
    <div class="sns">
      <h1>グループ</h1>
      <div data-list><div class="sns-loading">読み込んでいます…</div></div>
      <button type="button" class="btn dark" data-create>＋ グループを作る</button>
      <button type="button" class="btn dark" data-join>招待コードで参加</button>
    </div>`);
  $('[data-create]', el).onclick = () => nav.push(createScreen);
  $('[data-join]', el).onclick = () => nav.push((n) => joinScreen(n));
  const box = $('[data-list]', el);

  let list: Group[];
  try {
    list = await api.listGroups();
  } catch {
    box.innerHTML = `<div class="sns-card sns-hero"><p class="sns-lead">読み込めませんでした。オフラインかもしれません</p><button type="button" class="btn dark small" data-retry>もう一度</button></div>`;
    $('[data-retry]', box).onclick = () => nav.home();
    return { el };
  }

  rememberGroups(list);
  if (list.length === 0) {
    box.innerHTML = `
      <div class="sns-card sns-hero">
        <div class="sns-hero-title">まだグループに入っていません</div>
        <p class="sns-lead">友達に招待コードをもらって参加するか、グループを作って友達を招待しましょう</p>
      </div>`;
    return { el };
  }

  const today = dateKey(Date.now(), settings.dayBoundaryMin);
  const seen = seenMap();
  box.innerHTML = `<div class="sns-card">${list
    .map(
      (g) => `
      <button type="button" class="sns-row" data-gid="${esc(g.id)}">
        ${groupIcon(g.name, g.hue)}
        <span class="sns-row-main">
          <span class="sns-row-title"><span class="sns-name">${esc(g.name)}</span></span>
          <span class="sns-row-sub" data-sub>${g.memberCount}人</span>
        </span>
        <span class="sns-row-end"><span data-badge></span><span class="chevron" aria-hidden="true">›</span></span>
      </button>`,
    )
    .join('')}</div>`;

  for (const g of list) {
    const row = $(`[data-gid="${CSS.escape(g.id)}"]`, box);
    row.onclick = () => nav.push((n) => timelineScreen(n, g.id));
    // 今日勉強した人数と新着は、あとから入れる
    void api
      .getMembers(g.id)
      .then((ms) => {
        const n = ms.filter((m) => (m.days?.[today] ?? 0) > 0).length;
        $('[data-sub]', row).textContent = `${ms.length}人・今日 ${n}人が勉強`;
      })
      .catch(() => undefined);
    // 初めて見るグループは、入ったときより前の投稿を新着にしない
    const since = seen[g.id] ?? Date.now();
    if (!(g.id in seen)) markSeen(g.id, since);
    void api.unreadCount(g.id, since).then((n) => {
      if (n > 0) $('[data-badge]', row).outerHTML = `<span class="badge" aria-label="新しい投稿${n}件">${badgeText(n)}</span>`;
    });
  }
  return { el };
}

// ---- ⑤ グループを作る ----

function groupForm(title: string, submit: string, init: { name: string; hue: number }) {
  const el = html(`
    <form class="sns" novalidate>
      ${header(title, { back: true })}
      <div class="profile-preview" data-preview></div>
      ${field(`グループ名（${GROUP_NAME_MAX}文字まで）`, `<input class="input" name="name" autocomplete="off" placeholder="物理勉強会">`)}
      ${field('アイコンの色', '<span data-hue></span>')}
      <button type="submit" class="btn primary">${esc(submit)}</button>
    </form>`) as HTMLFormElement;
  const name = $<HTMLInputElement>('[name="name"]', el);
  const hue = hueSlider(init.hue, 'アイコンの色');
  $('[data-hue]', el).replaceWith(hue);
  name.value = init.name;
  const render = () => ($('[data-preview]', el).innerHTML = groupIcon(name.value || '？', Number(hue.value), 72));
  name.oninput = render;
  hue.oninput = render;
  render();
  return { el, name, hue };
}

export function createScreen(nav: Nav): Screen {
  const { el, name, hue } = groupForm('グループを作る', '作る', { name: '', hue: Math.floor(Math.random() * 360) });
  el.insertAdjacentHTML('beforeend', `<p class="sns-lead">作ると招待コードが出ます。友達に送って参加してもらいます（${MAX_MEMBERS}人まで）</p>`);
  el.onsubmit = async (e) => {
    e.preventDefault();
    const out: { made?: { id: string; code: string } } = {};
    const ok = await busy($('[type="submit"]', el), async () => {
      out.made = await api.createGroup(name.value, Number(hue.value));
    });
    if (ok && out.made) {
      const { id, code } = out.made;
      markSeen(id);
      nav.replace((n) => codeScreen(n, { id, code, name: name.value.trim() }, true));
    }
  };
  return { el };
}

/** グループ名と色を変える（作成者） */
export function editScreen(nav: Nav, g: Group): Screen {
  const { el, name, hue } = groupForm('グループ名・色', '保存', g);
  el.onsubmit = async (e) => {
    e.preventDefault();
    if (await busy($('[type="submit"]', el), () => api.editGroup(g.id, name.value, Number(hue.value)))) {
      toast('保存しました');
      nav.back();
    }
  };
  return { el };
}

// ---- 招待コード ----

/** 招待コードを見せる。created なら作った直後（「タイムラインへ」を出す） */
export function codeScreen(nav: Nav, g: { id: string; code: string; name: string }, created = false): Screen {
  const link = `${location.origin}${import.meta.env.BASE_URL}?join=${g.code}`;
  const text = `グミ勉のグループ「${g.name}」に入ってね\n招待コード：${formatCode(g.code)}\n${link}`;
  const el = html(`
    <div class="sns">
      ${header(created ? 'グループを作りました' : '招待コード', { back: !created })}
      <div class="sns-card sns-hero">
        <div class="sns-row-sub">招待コード</div>
        <div class="code-big">${esc(formatCode(g.code))}</div>
        <div class="btn-row" style="width:100%">
          <button type="button" class="btn dark small" data-copy>コピー</button>
          <button type="button" class="btn dark small" data-share>共有（LINEなど）</button>
        </div>
        <p class="sns-lead">コードを知っている人だけ参加できます。知らない人には教えないでください</p>
      </div>
      ${created ? '<button type="button" class="btn primary" data-open>グループを開く</button>' : ''}
    </div>`);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast('コピーしました');
    } catch {
      toast('コピーできませんでした');
    }
  };
  $('[data-copy]', el).onclick = () => void copy();
  $('[data-share]', el).onclick = async () => {
    if (!navigator.share) return copy();
    try {
      await navigator.share({ text });
    } catch {
      /* 共有をやめただけ */
    }
  };
  el.querySelector<HTMLElement>('[data-open]')?.addEventListener('click', () => {
    nav.reset(nav_root);
    nav.push((n) => timelineScreen(n, g.id));
  });
  return { el };
}

// 一覧（グループタブのいちばん下の画面）
const nav_root = (n: Nav) => listScreen(n);

// ---- ⑥ 招待コードで参加 ----

export function joinScreen(nav: Nav, prefill = ''): Screen {
  const el = html(`
    <form class="sns" novalidate>
      ${header('グループに参加', { back: true })}
      ${field('招待コード（8文字）', '<input class="input code" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EF23" maxlength="12">')}
      <div data-preview></div>
      <button type="submit" class="btn primary">確かめる</button>
      <p class="sns-lead" data-note>コードは、グループの人に教えてもらってください</p>
    </form>`) as HTMLFormElement;
  const input = $<HTMLInputElement>('[name="code"]', el);
  const submit = $<HTMLButtonElement>('[type="submit"]', el);
  const preview = $('[data-preview]', el);
  let ready: string | null = null; // プレビューを出したコード

  input.oninput = () => {
    if (ready && normalizeCode(input.value) !== ready) {
      ready = null;
      preview.innerHTML = '';
      submit.textContent = '確かめる';
    }
  };

  const check = async () => {
    const code = normalizeCode(input.value);
    if (!code) return toast('招待コードは8文字です（0・O・1・I・L は使いません）');
    await busy(submit, async () => {
      const inv = await api.previewInvite(code);
      if (!inv) {
        toast('招待コードが違います。もう一度確かめてください');
        return;
      }
      input.value = formatCode(code);
      ready = code;
      const full = inv.memberCount >= MAX_MEMBERS;
      preview.innerHTML = `
        <div class="sns-card sns-hero">
          ${groupIcon(inv.name, inv.hue, 64)}
          <div class="sns-hero-title">${esc(inv.name)}</div>
          <div class="sns-row-sub">${inv.memberCount}人が参加中${full ? '（満員）' : ''}</div>
        </div>`;
      submit.textContent = '参加する';
      $('[data-note]', el).innerHTML =
        '参加すると、あなたの表示名・アイコン・日ごとの勉強時間（教材ごとの内訳つき）と、これから投稿する記録がメンバーに見えます';
    });
  };

  el.onsubmit = async (e) => {
    e.preventDefault();
    if (!ready) return check();
    const code = ready;
    let gid = '';
    if (await busy(submit, async () => (gid = await api.joinGroup(code)))) {
      markSeen(gid);
      toast('参加しました');
      nav.reset(nav_root);
      nav.push((n) => timelineScreen(n, gid));
    }
  };

  if (prefill) {
    input.value = prefill;
    queueMicrotask(() => void check());
  }
  return { el };
}
