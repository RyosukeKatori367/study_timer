// ⑦ グループのタイムライン・ランキング、投稿の返信、⑨ グループの設定・メンバー の画面。

import { api } from '../../cloud/api';
import { rankKeys, type Group, type Member } from '../../cloud/groups';
import { matBreakdown, ranking, sumDays, type Icon } from '../../cloud/model';
import type { Post, Reply } from '../../cloud/posts';
import { settings } from '../../store';
import { chartAxis, fmtAxis } from '../../summary';
import { fmtHM, fmtLap } from '../../time';
import { memberScreen } from './member';
import { $, esc, html } from '../../ui/dom';
import { pickList } from '../../ui/sheet';
import { toast } from '../../ui/toast';
import { MODE_LABEL, likeNames, postTime, timeRange } from './fmt';
import { chatSeenKey, createChat } from './chat';
import { codeScreen, editScreen, markSeen, seenAt } from './groups';
import { avatar, busy, groupIcon, header, nameHtml, type Nav, type Screen } from './ui';

let tab: 'timeline' | 'ranking' | 'chat' = 'timeline';
let range: 'today' | 'week' = 'today';

interface Ctx {
  gid: string;
  group: Group | null;
  members: Map<string, Member>;
}

const me = (): string => api.user()?.uid ?? '';

/** 今の表示名とアイコン（抜けた人は投稿したときのもの） */
function who(ctx: Ctx, uid: string, fallback: { name: string; icon: Icon }): { name: string; icon: Icon } {
  const m = ctx.members.get(uid);
  return m ? { name: m.name, icon: m.icon } : fallback;
}

// ---- 投稿1件 ----

function lapChart(lapMs: number[]): string {
  const max = Math.max(...lapMs);
  const avg = lapMs.reduce((a, b) => a + b, 0) / lapMs.length;
  const bars = lapMs.map((ms) => `<span style="height:${Math.max(6, (ms / max) * 100)}%"></span>`).join('');
  return `<div class="post-laps" aria-hidden="true">${bars}</div>
    <div class="post-laps-cap">ラップ ${lapMs.length}回・平均 ${fmtLap(avg)}・最長 ${fmtLap(max)}</div>`;
}

function postHtml(p: Post, ctx: Ctx, opt: { detail?: boolean } = {}): string {
  const author = who(ctx, p.uid, p);
  const liked = p.likes.includes(me());
  const likers = p.likes.map((u) => ctx.members.get(u)?.name ?? '抜けた人');
  const pills: string[] = [];
  if (p.material) {
    const mark = p.material.img
      ? `<img class="pill-img" src="${esc(p.material.img)}" alt="" style="box-shadow:0 0 0 1.5px ${esc(p.material.color)}">`
      : `<i style="background:${esc(p.material.color)}"></i>`;
    pills.push(`<span class="pill">${mark}${esc(p.material.name)}</span>`);
  }
  if (p.laps) {
    const to = p.laps.from + p.laps.count - 1;
    pills.push(`<span class="pill">${p.laps.count > 1 ? `${p.laps.from}〜${to}番` : `${p.laps.from}番`}・${p.laps.count}ラップ</span>`);
  }
  if (p.away) pills.push(`<span class="pill">離脱 ${p.away.n}回・${fmtHM(p.away.ms)}</span>`);
  const canMenu = p.uid === me() || ctx.group?.ownerId === me();
  const replies = p.replyCount ?? 0;
  return `
    <article class="post${p.pending ? ' pending' : ''}" data-pid="${esc(p.id)}">
      <div class="post-head">
        <button type="button" class="post-avatar" data-who aria-label="${esc(author.name)}の統計">${avatar(author.icon, 36)}</button>
        <div class="post-who" data-who>
          <div class="sns-row-title">${nameHtml(p.uid, author.name)}</div>
          <div class="post-time">${p.pending ? '送信待ち' : esc(postTime(p.at))}</div>
        </div>
        ${canMenu ? '<button type="button" class="post-menu" data-menu aria-label="メニュー">⋯</button>' : ''}
      </div>
      <div class="post-main">
        <span class="post-ms">${esc(fmtHM(p.studyMs))}</span>
        <span class="post-mode">${esc(MODE_LABEL[p.mode] ?? '')}・${esc(timeRange(p.start, p.end))}</span>
      </div>
      ${pills.length ? `<div class="pills">${pills.join('')}</div>` : ''}
      ${p.lapMs?.length ? lapChart(p.lapMs) : ''}
      ${p.comment ? `<div class="post-comment">${esc(p.comment)}</div>` : ''}
      <div class="post-actions">
        <button type="button" data-like class="${liked ? 'liked' : ''}" aria-pressed="${liked}" aria-label="いいね">
          ${liked ? '♥' : '♡'} ${p.likes.length || (liked ? '' : 'いいね')}
        </button>
        ${likers.length ? `<span class="like-names">${esc(likeNames(likers))}</span>` : ''}
        ${
          opt.detail
            ? ''
            : `<button type="button" class="reply-btn" data-reply>💬 ${replies ? `返信 ${replies}` : '返信'}</button>`
        }
      </div>
    </article>`;
}

/** 投稿のボタン（いいね・返信・メニュー）。どの画面でも同じ動き */
function bindPosts(root: HTMLElement, nav: Nav, ctx: Ctx, find: (pid: string) => Post | undefined): void {
  root.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const art = t.closest<HTMLElement>('[data-pid]');
    const p = art && find(art.dataset.pid!);
    if (!p) return;
    if (t.closest('[data-who]')) {
      nav.push((n) => memberScreen(n, ctx.gid, p.uid));
    } else if (t.closest('[data-like]')) {
      void api.setLike(ctx.gid, p.id, !p.likes.includes(me())).catch(() => toast('いいねできませんでした'));
    } else if (t.closest('[data-reply]')) {
      nav.push((n) => postScreen(n, ctx.gid, p.id));
    } else if (t.closest('[data-menu]')) {
      const i = await pickList('投稿', [{ label: 'この投稿を削除', danger: true }]);
      if (i !== 0 || !confirm('この投稿を削除しますか？返信も消えます')) return;
      try {
        await api.deletePost(ctx.gid, p.id);
        toast('削除しました');
      } catch {
        toast('削除できませんでした');
      }
    }
  });
}

// ---- タイムライン・ランキング ----

export async function timelineScreen(nav: Nav, gid: string): Promise<Screen> {
  const ctx: Ctx = { gid, group: null, members: new Map() };
  let posts: Post[] = [];
  const el = html(`
    <div class="sns">
      ${header('', { back: true, titleButton: true, right: '<button type="button" class="sns-more" data-settings aria-label="グループの設定">⋯</button>' })}
      <div class="sns-seg" role="group">
        <button type="button" data-tab="timeline">タイムライン</button>
        <button type="button" data-tab="ranking">ランキング</button>
        <button type="button" data-tab="chat">チャット<span class="tab-dot" data-chat-dot hidden></span></button>
      </div>
      <div data-body><div class="sns-loading">読み込んでいます…</div></div>
    </div>`);
  const body = $('[data-body]', el);
  const title = $('.switch-title', el);
  const titleText = $('.t', title);

  // チャットは入力中の文字を消さないように、一度作ったものを出し入れする
  const chat = createChat(gid, () => ({ members: ctx.members, ownerId: ctx.group?.ownerId ?? '' }));
  const chatDot = $('[data-chat-dot]', el);

  const render = () => {
    titleText.textContent = ctx.group?.name ?? '';
    el.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
    // チャットのときは画面の高さいっぱいに広げて、入力欄をいちばん下に置く
    el.classList.toggle('fill', tab === 'chat');
    body.classList.toggle('chat-on', tab === 'chat');
    if (tab === 'chat') {
      chatDot.hidden = true;
      if (body.firstElementChild !== chat.el) {
        body.replaceChildren(chat.el);
        chat.show();
      } else {
        chat.refresh();
      }
      return;
    }
    chat.hide();
    if (tab === 'timeline') renderTimeline();
    else renderRanking();
  };

  const renderTimeline = () => {
    if (!posts.length) {
      body.innerHTML = `<div class="sns-card sns-hero"><div class="sns-hero-title">まだ投稿がありません</div>
        <p class="sns-lead">計測を finish すると、投稿の画面が出ます</p></div>`;
      return;
    }
    body.innerHTML = `<div class="sns-card">${posts.map((p) => postHtml(p, ctx)).join('')}</div>
      ${posts.length >= 30 ? '<p class="sns-lead">新しい30件を出しています</p>' : ''}`;
  };

  const renderRanking = () => {
    const keys = rankKeys()[range];
    const rows = ranking([...ctx.members.values()], keys);
    const active = rows.filter((r) => r.ms > 0);
    const total = active.reduce((a, r) => a + r.ms, 0);
    // 横軸（時間）は、いちばん長い人に合わせたきりのいい目盛り
    const axis = chartAxis(Math.max(1, ...rows.map((r) => r.ms)));
    const ticks = [0, ...axis.ticks];
    const x = (ms: number) => (ms / axis.top) * 100;
    const tickHtml = ticks
      .map(
        (ms, i) =>
          `<div class="rank-tick${i === 0 ? ' first' : ''}${i === ticks.length - 1 ? ' last' : ''}" style="left:${x(ms)}%"><span>${
            ms === 0 ? '0' : esc(fmtAxis(ms, settings.durationStyle))
          }</span></div>`,
      )
      .join('');
    body.innerHTML = `
      <div class="sns-seg small" role="group" style="margin-bottom:12px">
        <button type="button" data-range="today" aria-pressed="${range === 'today'}">今日</button>
        <button type="button" data-range="week" aria-pressed="${range === 'week'}">今週</button>
      </div>
      <div class="sns-summary" style="margin-bottom:8px"><span>${active.length}人が勉強</span><span>みんなで ${esc(fmtHM(total))}</span></div>
      <div class="sns-card rank-chart">
        <div class="rank-axis" aria-hidden="true">${tickHtml}</div>
        ${rows
          .map((r) => {
            const parts = r.ms > 0 ? matBreakdown(r.item, keys) : [];
            // 教材ごとに色を分けて、間を 2px あける
            const bar = parts.map((m) => `<span style="flex:${m.ms} 1 0;background:${esc(m.c)}"></span>`).join('');
            return `
          <button type="button" class="sns-row rank-row${r.ms > 0 && r.rank <= 3 ? ' top' : ''}${r.item.uid === me() ? ' mine' : ''}${r.ms === 0 ? ' zero' : ''}" data-rank="${esc(r.item.uid)}" aria-label="${esc(r.item.name)} ${esc(fmtHM(r.ms))}・統計を見る">
            <span class="rank">${r.ms > 0 ? r.rank : '–'}</span>
            ${avatar(r.item.icon, 36)}
            <span class="sns-row-main">
              <span class="rank-line">
                <span class="sns-row-title">${nameHtml(r.item.uid, r.item.name, { owner: ctx.group?.ownerId === r.item.uid })}</span>
                <span class="ms">${r.ms > 0 ? esc(fmtHM(r.ms)) : '—'}</span>
              </span>
              ${r.ms > 0 ? `<span class="rank-bar" style="width:${x(r.ms)}%" aria-hidden="true">${bar}</span>` : ''}
            </span>
          </button>`;
          })
          .join('')}
      </div>
      <p class="sns-note" style="margin-top:8px">${range === 'today' ? '今日' : '今週'}の勉強時間です。色はそれぞれの人の教材です。タップすると、その人の統計が見られます</p>`;
    body.querySelectorAll<HTMLElement>('[data-range]').forEach((b) => {
      b.onclick = () => {
        range = b.dataset.range as typeof range;
        render();
      };
    });
    body.querySelectorAll<HTMLElement>('[data-rank]').forEach((b) => {
      b.onclick = () => nav.push((n) => memberScreen(n, gid, b.dataset.rank!));
    });
  };

  el.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => {
    b.onclick = () => {
      tab = b.dataset.tab as typeof tab;
      render();
    };
  });
  $('[data-settings]', el).onclick = () => nav.push((n) => groupSettingsScreen(n, gid));
  title.onclick = async () => {
    const list = await api.listGroups().catch(() => [] as Group[]);
    if (list.length < 2) return;
    const i = await pickList(
      'グループを切り替える',
      list.map((g) => ({ label: g.name, sub: `${g.memberCount}人` })),
      list.findIndex((g) => g.id === gid),
    );
    if (i !== null && list[i].id !== gid) nav.replace((n) => timelineScreen(n, list[i].id));
  };
  bindPosts(body, nav, ctx, (pid) => posts.find((p) => p.id === pid));

  const stops = await Promise.all([
    api.watchGroup(gid, (g) => {
      if (!g) {
        toast('このグループは見られなくなりました');
        return nav.home();
      }
      ctx.group = g;
      render();
    }),
    api.watchMembers(gid, (list) => {
      ctx.members = new Map(list.map((m) => [m.uid, m]));
      render();
    }),
    api.watchTimeline(gid, (list) => {
      posts = list;
      markSeen(gid);
      render();
    }),
  ]);
  // まだ見ていないメッセージがあれば、チャットのタブに印を付ける
  if (tab !== 'chat') {
    const since = seenAt(chatSeenKey(gid));
    void api.chatUnread(gid, since).then((n) => {
      if (n > 0 && tab !== 'chat') chatDot.hidden = false;
    });
  }
  return {
    el,
    dispose: () => {
      stops.forEach((s) => s());
      chat.dispose();
    },
  };
}

// ---- 投稿と返信 ----

export async function postScreen(nav: Nav, gid: string, pid: string): Promise<Screen> {
  const ctx: Ctx = { gid, group: null, members: new Map() };
  let post: Post | null = null;
  let replies: Reply[] = [];
  const el = html(`
    <div class="sns">
      ${header('返信', { back: true })}
      <div class="sns-card" data-post></div>
      <div class="sns-card" data-replies></div>
      <form class="reply-form" novalidate>
        <textarea class="input" name="text" rows="2" maxlength="280" placeholder="返信する"></textarea>
        <button type="submit" class="btn primary">送る</button>
      </form>
    </div>`);
  const postBox = $('[data-post]', el);
  const replyBox = $('[data-replies]', el);
  const form = $<HTMLFormElement>('form', el);
  const text = $<HTMLTextAreaElement>('textarea', el);

  const render = () => {
    postBox.innerHTML = post ? postHtml(post, ctx, { detail: true }) : '';
    replyBox.hidden = replies.length === 0;
    replyBox.innerHTML = replies
      .map((r) => {
        const w = who(ctx, r.uid, r);
        const canDelete = r.uid === me() || ctx.group?.ownerId === me();
        return `
          <div class="reply" data-rid="${esc(r.id)}">
            ${avatar(w.icon, 32)}
            <div class="reply-body">
              <div class="reply-head">
                <span class="sns-row-title">${nameHtml(r.uid, w.name)}</span>
                <span class="post-time">${r.pending ? '送信待ち' : esc(postTime(r.at))}</span>
                ${canDelete ? '<button type="button" class="post-menu" data-reply-menu aria-label="メニュー">⋯</button>' : ''}
              </div>
              <div class="post-comment">${esc(r.text)}</div>
            </div>
          </div>`;
      })
      .join('');
  };

  bindPosts(postBox, nav, ctx, () => post ?? undefined);
  replyBox.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const rid = t.closest<HTMLElement>('[data-rid]')?.dataset.rid;
    if (!rid || !t.closest('[data-reply-menu]')) return;
    const i = await pickList('返信', [{ label: 'この返信を削除', danger: true }]);
    if (i !== 0) return;
    try {
      await api.deleteReply(gid, pid, rid);
    } catch {
      toast('削除できませんでした');
    }
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (await busy($('[type="submit"]', form), () => api.addReply(gid, pid, text.value))) {
      text.value = '';
      text.blur();
    }
  };

  const stops = await Promise.all([
    api.watchGroup(gid, (g) => {
      ctx.group = g;
      render();
    }),
    api.watchMembers(gid, (list) => {
      ctx.members = new Map(list.map((m) => [m.uid, m]));
      render();
    }),
    api.watchPost(gid, pid, (p) => {
      if (!p) {
        toast('この投稿は削除されました');
        return nav.back();
      }
      post = p;
      render();
    }),
    api.watchReplies(gid, pid, (list) => {
      replies = list;
      render();
    }),
  ]);
  return { el, dispose: () => stops.forEach((s) => s()) };
}

// ---- ⑨ グループの設定・メンバー ----

export async function groupSettingsScreen(nav: Nav, gid: string): Promise<Screen> {
  let group: Group | null = null;
  let members: Member[] = [];
  const el = html(`
    <div class="sns">
      ${header('グループの設定', { back: true })}
      <div data-body><div class="sns-loading">読み込んでいます…</div></div>
    </div>`);
  const body = $('[data-body]', el);

  const render = () => {
    if (!group) return;
    const owner = group.ownerId === me();
    const today = rankKeys().today;
    body.innerHTML = `
      <div class="sns">
        <div class="sns-card sns-hero" style="padding:20px">
          ${groupIcon(group.name, group.hue, 64)}
          <div class="sns-hero-title">${esc(group.name)}</div>
        </div>
        <div>
          <h2 class="group-head" style="margin-bottom:8px">招待</h2>
          <div class="sns-card">
            <button type="button" class="sns-row" data-code><span class="sns-row-main">招待コード</span><span class="sns-row-end">${esc(group.code.slice(0, 4))}-${esc(group.code.slice(4))}<span class="chevron">›</span></span></button>
            ${owner ? '<button type="button" class="sns-row" data-regen><span class="sns-row-main"><span>コードを作り直す</span><span class="sns-row-sub">古いコードは使えなくなります</span></span></button>' : ''}
          </div>
        </div>
        <div>
          <h2 class="group-head" style="margin-bottom:8px">メンバー（${members.length}人）</h2>
          <div class="sns-card">${members
            .map((m) => {
              const ms = sumDays(m.days, today);
              return `<button type="button" class="sns-row" data-uid="${esc(m.uid)}">
                ${avatar(m.icon, 36)}
                <span class="sns-row-main"><span class="sns-row-title">${nameHtml(m.uid, m.name, { owner: m.uid === group!.ownerId })}</span></span>
                <span class="sns-row-end">${ms > 0 ? `今日 ${esc(fmtHM(ms))}` : '—'}<span class="chevron" aria-hidden="true">›</span></span>
              </button>`;
            })
            .join('')}</div>
          <p class="sns-note" style="margin-top:8px">メンバーをタップすると、その人の統計が見られます${owner ? '。作成者はグループから外すこともできます' : ''}</p>
        </div>
        <div class="sns-card">
          ${owner ? '<button type="button" class="sns-row" data-edit><span class="sns-row-main">グループ名・色を変える</span><span class="chevron">›</span></button>' : ''}
          <button type="button" class="sns-row" data-leave style="color:var(--red)">グループを抜ける</button>
        </div>
      </div>`;

    $('[data-code]', body).onclick = () => nav.push((n) => codeScreen(n, { id: gid, code: group!.code, name: group!.name }));
    body.querySelector<HTMLElement>('[data-regen]')?.addEventListener('click', async (e) => {
      if (!confirm('招待コードを作り直しますか？今のコードは使えなくなります')) return;
      let code = '';
      if (await busy(e.currentTarget as HTMLElement, async () => (code = await api.regenerateCode(gid)))) {
        nav.push((n) => codeScreen(n, { id: gid, code, name: group!.name }));
      }
    });
    body.querySelector<HTMLElement>('[data-edit]')?.addEventListener('click', () => nav.push((n) => editScreen(n, group!)));
    body.querySelectorAll<HTMLElement>('button[data-uid]').forEach((b) => {
      b.onclick = async () => {
        const m = members.find((x) => x.uid === b.dataset.uid);
        if (!m) return;
        // 作成者は外すこともできる。それ以外は統計を見るだけ
        if (!owner || m.uid === me()) return nav.push((n) => memberScreen(n, gid, m.uid));
        const i = await pickList(m.name, [{ label: '統計を見る' }, { label: 'グループから外す', danger: true }]);
        if (i === 0) return nav.push((n) => memberScreen(n, gid, m.uid));
        if (i !== 1 || !confirm(`${m.name}さんをグループから外しますか？\n今の招待コードではまた入れるので、必要ならコードも作り直してください`)) return;
        if (await busy(b, () => api.removeMember(gid, m.uid))) toast('外しました');
      };
    });
    $('[data-leave]', body).onclick = async (e) => {
      const others = members.filter((m) => m.uid !== me());
      const msg = !owner
        ? 'グループを抜けますか？あなたの投稿はグループに残ります'
        : others.length === 0
          ? 'あなたしかいないので、グループごと消えます。よろしいですか？'
          : `グループを抜けますか？作成者は${others[0].name}さんに渡します。あなたの投稿はグループに残ります`;
      if (!confirm(msg)) return;
      if (await busy(e.currentTarget as HTMLElement, () => api.leaveGroup(gid))) {
        toast('グループを抜けました');
        nav.home();
      }
    };
  };

  const stops = await Promise.all([
    api.watchGroup(gid, (g) => {
      if (!g) return nav.home();
      group = g;
      render();
    }),
    api.watchMembers(gid, (list) => {
      members = list;
      render();
    }),
  ]);
  return { el, dispose: () => stops.forEach((s) => s()) };
}
