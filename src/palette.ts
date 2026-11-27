// 教材の色の候補。はじめの7色は、暗い背景で見分けやすいように確かめた並び（作った順の初期の色）。
// 残りは自分で選ぶとき用の色。

export const PALETTE = ['#338ced', '#e76624', '#00a888', '#d28e05', '#e24d8b', '#0aac23', '#9887ef'];
export const EXTRA_COLORS = ['#e5484d', '#14b8c4', '#a0783c', '#6e7bf2', '#b0b0b0'];
export const MATERIAL_COLORS = [...PALETTE, ...EXTRA_COLORS];
export const NONE_COLOR = '#d9d9d9';
export const OTHER_COLOR = '#7a7a7a';

/** 色を決めていない教材の色（作った順） */
export const defaultColor = (order: number): string => (order >= 0 && order < PALETTE.length ? PALETTE[order] : OTHER_COLOR);
