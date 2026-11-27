// グループ画面の部品（アイコン、名前のしるし、見出し、入力欄）と、画面の切り替え。

import { api } from '../../cloud/api';
import { errorMessage } from '../../cloud/account';
import { firstGrapheme, iconColors, isDeveloper, type Icon } from '../../cloud/model';
import { esc, html } from '../../ui/dom';
import { toast } from '../../ui/toast';

/** 丸いアイコン（人）。size は px */
export function avatar(icon: Icon, size = 36): string {
  const { bg, fg } = iconColors(icon.h);
  const inner = icon.img
    ? `<img src="${esc(icon.img)}" alt="" draggable="false">`
    : `<span>${esc(icon.c || '?')}</span>`;
  return `<span class="av" style="--s:${size}px;background:${bg};color:${fg}" aria-hidden="true">${inner}</span>`;
}

/** 角の丸い四角のアイコン（グループ）。名前の最初の1文字 */
export function groupIcon(name: string, hue: number, size = 44): string {
  const { bg, fg } = iconColors(hue);
  return `<span class="gicon" style="--s:${size}px;background:${bg};color:${fg}" aria-hidden="true"><span>${esc(firstGrapheme(name) || '?')}</span></span>`;
}

/** 名前と、そのあとのしるし（開発者・作成者・自分） */
export function nameHtml(uid: string, name: string, opt: { owner?: boolean } = {}): string {
  const me = api.user()?.uid === uid;
  return `<span class="sns-name">${esc(name)}</span>${isDeveloper(uid) ? '<span class="tag dev">開発者</span>' : ''}${
    opt.owner ? '<span class="tag">作成者</span>' : ''
  }${me ? '<span class="tag me">自分</span>' : ''}`;
}

/** 色相を選ぶスライダー（虹色の帯） */
export function hueSlider(value: number, label: string): HTMLInputElement {
  const stops = Array.from({ length: 13 }, (_, i) => iconColors(i * 30).bg).join(',');
  const el = html<HTMLInputElement>(
    `<input class="hue" type="range" min="0" max="359" step="1" value="${Math.round(value)}" aria-label="${esc(label)}">`,
  );
  el.style.setProperty('--track', `linear-gradient(90deg, ${stops})`);
  return el;
}

/** ラベルつきの入力欄 */
export function field(label: string, input: string): string {
  return `<label class="field"><span class="field-label">${esc(label)}</span>${input}</label>`;
}

/**
 * ボタンを押したときの処理を、二重押しを防ぎながら行う。失敗したら理由をお知らせに出す。
 * 成功したら true。
 */
export async function busy(button: HTMLElement, fn: () => Promise<unknown>): Promise<boolean> {
  if (button.classList.contains('busy')) return false;
  button.classList.add('busy');
  button.setAttribute('aria-busy', 'true');
  try {
    await fn();
    return true;
  } catch (e) {
    console.warn(e);
    toast(errorMessage(e));
    return false;
  } finally {
    button.classList.remove('busy');
    button.removeAttribute('aria-busy');
  }
}

// ---- 画面の切り替え（グループタブの中だけで使う、戻るつきの画面の重なり） ----

export interface Screen {
  el: HTMLElement;
  /** 画面を離れるときの片付け（見張りの解除など） */
  dispose?: () => void;
}

export type ScreenFn = (nav: Nav) => Screen | Promise<Screen>;

export interface Nav {
  push(fn: ScreenFn): void;
  /** 一つ前の画面に戻る */
  back(): void;
  /** 重なりを捨てて、この画面から始める */
  reset(fn: ScreenFn): void;
  /** 今の画面を差し替える（戻ったときにこの画面に戻らない） */
  replace(fn: ScreenFn): void;
  /** いちばん下（グループ一覧など）に戻る */
  home(): void;
}

/** 見出し（戻るボタン・題・右のボタン） */
export function header(title: string, opt: { back?: boolean; right?: string; titleButton?: boolean } = {}): string {
  const t = opt.titleButton
    ? `<button type="button" class="sns-head-title switch-title"><span class="t">${esc(title)}</span><span class="caret" aria-hidden="true">▾</span></button>`
    : `<div class="sns-head-title">${esc(title)}</div>`;
  return `<div class="sns-head">
    ${opt.back ? '<button type="button" class="sns-back" aria-label="戻る">‹</button>' : '<span class="sns-head-side"></span>'}
    ${t}
    ${opt.right ?? '<span class="sns-head-side"></span>'}
  </div>`;
}

export function createNav(view: HTMLElement, root: () => ScreenFn): Nav {
  const stack: { fn: ScreenFn; scroll: number }[] = [];
  let current: Screen | null = null;
  let token = 0;

  const show = async (restoreScroll = 0) => {
    const entry = stack.at(-1)!;
    const my = ++token;
    current?.dispose?.();
    current = null;
    let screen: Screen;
    try {
      screen = await entry.fn(nav);
    } catch (e) {
      console.warn(e);
      screen = { el: html(`<div class="sns-error">${esc(errorMessage(e))}</div>`) };
    }
    if (my !== token) return screen.dispose?.(); // 待っているあいだに別の画面に移った
    current = screen;
    view.replaceChildren(screen.el);
    screen.el.querySelector<HTMLElement>('.sns-back')?.addEventListener('click', () => nav.back());
    view.scrollTop = restoreScroll;
  };

  const nav: Nav = {
    push(fn) {
      if (stack.length) stack.at(-1)!.scroll = view.scrollTop;
      stack.push({ fn, scroll: 0 });
      void show();
    },
    back() {
      if (stack.length <= 1) return nav.home();
      stack.pop();
      void show(stack.at(-1)!.scroll);
    },
    reset(fn) {
      stack.length = 0;
      stack.push({ fn, scroll: 0 });
      void show();
    },
    replace(fn) {
      stack.pop();
      stack.push({ fn, scroll: 0 });
      void show();
    },
    home() {
      nav.reset(root());
    },
  };
  return nav;
}
