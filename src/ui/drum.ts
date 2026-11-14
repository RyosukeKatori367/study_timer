// ドラム（ホイール）ピッカー。中身はただの縦スクロールで、
// CSS の scroll-snap で1行ずつ止まるようにしている。

import { pad2 } from '../time';

export const DRUM_ITEM = 44; // 1行の高さ（CSS の --drum-item と同じ値にする）

export interface Drum {
  el: HTMLElement;
  get(): number;
  set(value: number): void;
}

export interface DrumOptions {
  min: number;
  max: number;
  value: number;
  /** 2桁にそろえる（分・秒など） */
  pad?: boolean;
  onChange?: (value: number) => void;
}

export function createDrum(o: DrumOptions): Drum {
  const el = document.createElement('div');
  el.className = 'drum';
  for (let v = o.min; v <= o.max; v++) {
    const item = document.createElement('div');
    item.textContent = o.pad ? pad2(v) : String(v);
    el.append(item);
  }

  const clamp = (v: number) => Math.min(o.max, Math.max(o.min, v));
  let value = clamp(o.value);
  /** まだ画面に出ていなくてスクロール位置を合わせられていない */
  let pending = true;

  const apply = () => {
    if (el.clientHeight === 0) return; // 非表示のあいだは位置を変えられない
    el.scrollTop = (value - o.min) * DRUM_ITEM;
    pending = false;
  };

  let settle: number | undefined;
  el.addEventListener(
    'scroll',
    () => {
      if (pending) return;
      clearTimeout(settle);
      settle = window.setTimeout(() => {
        const next = clamp(o.min + Math.round(el.scrollTop / DRUM_ITEM));
        if (next !== value) {
          value = next;
          o.onChange?.(value);
        }
      }, 100);
    },
    { passive: true },
  );

  // 画面に出たタイミングで位置を合わせる
  new ResizeObserver(() => {
    if (pending) apply();
  }).observe(el);

  return {
    el,
    get: () => (pending ? value : clamp(o.min + Math.round(el.scrollTop / DRUM_ITEM))),
    set(v) {
      value = clamp(v);
      pending = true;
      apply();
    },
  };
}
