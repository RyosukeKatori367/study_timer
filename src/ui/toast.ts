import { $, esc, html } from './dom';

let timer: number | undefined;

export interface ToastAction {
  label: string;
  run: () => void;
}

/** 画面の上に短いお知らせを出す。action があればボタンを付けて、少し長めに出す */
export function toast(message: string, action?: ToastAction): void {
  const el = $('#toast');
  el.replaceChildren(html(`<span>${esc(message)}</span>`));
  el.classList.toggle('has-action', !!action);
  if (action) {
    const b = html<HTMLButtonElement>(`<button type="button" class="toast-action">${esc(action.label)}</button>`);
    b.onclick = () => {
      el.classList.remove('show');
      action.run();
    };
    el.append(b);
  }
  el.classList.add('show');
  clearTimeout(timer);
  timer = window.setTimeout(() => el.classList.remove('show'), action ? 6000 : 2200);
}
