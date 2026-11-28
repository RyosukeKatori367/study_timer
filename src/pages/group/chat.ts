// グループのチャット（タイムラインの画面の「チャット」タブ）。
// 新しい50件を出し、「前のメッセージ」で50件ずつさかのぼる。長押しでコピー・削除。

import { api } from '../../cloud/api';
import type { Message } from '../../cloud/chat';
import type { Member } from '../../cloud/groups';
import { MESSAGE_MAX } from '../../cloud/model';
import { pad2 } from '../../time';
import { $, esc, html } from '../../ui/dom';
import { pickList } from '../../ui/sheet';
import { toast } from '../../ui/toast';
import { markSeen } from './groups';
import { avatar, nameHtml } from './ui';

const PAGE = 50;
/** これより間があいたら、同じ人でも名前とアイコンを出し直す */
const GROUP_MS = 5 * 60 * 1000;
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export const chatSeenKey = (gid: string): string => `${gid}:chat`;

const dayOf = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
const dayTitle = (ts: number): string => {
  const d = new Date(ts);
  const today = new Date();
  if (dayOf(ts) === dayOf(today.getTime())) return '今日';
  if (dayOf(ts) === dayOf(today.getTime() - 86400000)) return '昨日';
  return `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
};
const clock = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getHours()}:${pad2(d.getMinutes())}`;
};

export interface Chat {
  el: HTMLElement;
  /** タブを開いたとき（見張りを始めて、いちばん下まで送る） */
  show(): void;
  /** ほかのタブに移ったとき */
  hide(): void;
  /** メンバーの名前・アイコン・作成者が変わったとき */
  refresh(): void;
  dispose(): void;
}

export function createChat(gid: string, ctx: () => { members: Map<string, Member>; ownerId: string }): Chat {
  const el = html(`
    <div class="chat">
      <button type="button" class="btn dark small" data-more hidden>前のメッセージ</button>
      <div class="chat-list" aria-live="polite"></div>
      <form class="chat-form" novalidate>
        <textarea class="input" rows="1" maxlength="${MESSAGE_MAX}" placeholder="メッセージ" aria-label="メッセージ"></textarea>
        <button type="submit" class="btn primary">送る</button>
      </form>
    </div>`);
  const list = $('.chat-list', el);
  const more = $('[data-more]', el);
  const form = $<HTMLFormElement>('form', el);
  const text = $<HTMLTextAreaElement>('textarea', el);

  let messages: Message[] = [];
  let limit = PAGE;
  let stop: (() => void) | null = null;
  let visible = false;
  let stick = true; // いちばん下を見ているなら、新しいメッセージが来たら下まで送る
  const view = () => el.closest<HTMLElement>('.view');

  const nearBottom = () => {
    const v = view();
    return !v || v.scrollHeight - v.scrollTop - v.clientHeight < 80;
  };
  const toBottom = () => {
    const v = view();
    if (v) v.scrollTop = v.scrollHeight;
  };

  const render = () => {
    const { members, ownerId } = ctx();
    const meId = api.user()?.uid ?? '';
    more.hidden = messages.length < limit;
    if (messages.length === 0) {
      list.innerHTML = '<div class="chat-empty">まだメッセージはありません。最初のひとことを送ってみましょう</div>';
      return;
    }
    let out = '';
    messages.forEach((m, i) => {
      const prev = messages[i - 1];
      const next = messages[i + 1];
      if (!prev || dayOf(prev.at) !== dayOf(m.at)) out += `<div class="chat-day"><span>${esc(dayTitle(m.at))}</span></div>`;
      const head = !prev || prev.uid !== m.uid || m.at - prev.at > GROUP_MS || dayOf(prev.at) !== dayOf(m.at);
      const tail = !next || next.uid !== m.uid || next.at - m.at > GROUP_MS || dayOf(next.at) !== dayOf(m.at);
      const mine = m.uid === meId;
      const who: { name: string; icon: Message['icon']; tag?: string } = members.get(m.uid) ?? { name: m.name, icon: m.icon };
      const time = m.pending ? '送信待ち' : clock(m.at);
      out += `
        <div class="msg${mine ? ' mine' : ''}${head ? ' head' : ''}${tail ? ' tail' : ''}" data-mid="${esc(m.id)}">
          ${mine ? '' : `<span class="msg-av">${head ? avatar(who.icon, 30) : ''}</span>`}
          <div class="msg-body">
            ${!mine && head ? `<div class="msg-name">${nameHtml(m.uid, who.name, { owner: m.uid === ownerId, tag: who.tag })}</div>` : ''}
            <div class="msg-line">
              <div class="msg-bubble">${esc(m.text)}</div>
              ${tail ? `<span class="msg-time">${esc(time)}</span>` : ''}
            </div>
          </div>
        </div>`;
    });
    list.innerHTML = out;
  };

  const watch = async () => {
    stop?.();
    stop = await api.watchMessages(gid, limit, (ms) => {
      const atBottom = nearBottom();
      messages = ms;
      render();
      if (visible) {
        markSeen(chatSeenKey(gid));
        if (stick || atBottom) requestAnimationFrame(toBottom);
        stick = false;
      }
    });
  };

  more.onclick = () => {
    // さかのぼったあとも、今見ているメッセージの位置がずれないようにする
    const v = view();
    const before = v ? v.scrollHeight - v.scrollTop : 0;
    limit += PAGE;
    void watch().then(() =>
      requestAnimationFrame(() => {
        if (v) v.scrollTop = v.scrollHeight - before;
      }),
    );
  };

  // 入力欄は5行まで広がる
  const grow = () => {
    text.style.height = 'auto';
    text.style.height = `${Math.min(text.scrollHeight, 132)}px`;
  };
  text.oninput = grow;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const t = text.value;
    if (!t.trim()) return;
    try {
      await api.sendMessage(gid, t);
      text.value = '';
      grow();
      stick = true;
    } catch (err) {
      toast(err instanceof Error ? err.message : '送れませんでした');
    }
  };

  // 長押しでコピー・削除
  let pressTimer: number | undefined;
  list.addEventListener('pointerdown', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-mid]');
    if (!row) return;
    clearTimeout(pressTimer);
    pressTimer = window.setTimeout(() => void openMenu(row.dataset.mid!), 500);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'pointermove'] as const) {
    list.addEventListener(ev, (e) => {
      if (ev === 'pointermove' && Math.abs((e as PointerEvent).movementY) < 4) return;
      clearTimeout(pressTimer);
    });
  }
  list.addEventListener('contextmenu', (e) => e.preventDefault());

  const openMenu = async (mid: string) => {
    const m = messages.find((x) => x.id === mid);
    if (!m) return;
    const canDelete = m.uid === api.user()?.uid || ctx().ownerId === api.user()?.uid;
    const items = [{ label: 'コピー' }, ...(canDelete ? [{ label: '削除', danger: true }] : [])];
    const i = await pickList('メッセージ', items);
    if (i === 0) {
      try {
        await navigator.clipboard.writeText(m.text);
        toast('コピーしました');
      } catch {
        toast('コピーできませんでした');
      }
    } else if (i === 1) {
      if (!confirm('このメッセージを削除しますか？')) return;
      try {
        await api.deleteMessage(gid, mid);
      } catch {
        toast('削除できませんでした');
      }
    }
  };

  return {
    el,
    show() {
      visible = true;
      stick = true;
      if (!stop) void watch();
      else {
        render();
        markSeen(chatSeenKey(gid));
        requestAnimationFrame(toBottom);
      }
    },
    hide() {
      visible = false;
    },
    refresh: render,
    dispose() {
      stop?.();
      stop = null;
    },
  };
}
