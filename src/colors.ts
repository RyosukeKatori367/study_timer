import { materialOrder } from './store';

/**
 * 教材の色。作った順に決まった色を使う（多い順ではないので、色は教材についてまわる）。
 * 暗い背景で見分けやすいように確かめた並び。8 つ目からはまとめて灰色。教材なしは明るい灰色。
 */
const PALETTE = ['#338ced', '#e76624', '#00a888', '#d28e05', '#e24d8b', '#0aac23', '#9887ef'];
const NONE_COLOR = '#d9d9d9';
const OTHER_COLOR = '#7a7a7a';

/** 教材の色（key は教材の id。空なら教材なし） */
export function materialColor(key: string | null | undefined): string {
  if (!key) return NONE_COLOR;
  const i = materialOrder(key);
  return i >= 0 && i < PALETTE.length ? PALETTE[i] : OTHER_COLOR;
}
