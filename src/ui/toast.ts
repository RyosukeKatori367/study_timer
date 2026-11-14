import { $ } from './dom';

let timer: number | undefined;

export function toast(message: string): void {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(timer);
  timer = window.setTimeout(() => el.classList.remove('show'), 2200);
}
