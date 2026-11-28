// 「ラップ」の言いかえ。教材ごとに数え方（単位）を選ぶ：問題集は「問」、映像授業は「講」など。
// 教材なしと、選んでいない教材は「問」。

import { materialById } from './store';

export interface Unit {
  /** 教材に保存する値（'問'） */
  id: string;
  /** 選ぶときの名前 */
  name: string;
  /** 例（選ぶときの説明） */
  example: string;
  /** 番号の前と後ろ（第 9 講・9 問目） */
  pre: string;
  suf: string;
  /** 数の後ろ（10問・10講） */
  cnt: string;
  /** 「問題数」など */
  countLabel: string;
  /** 「何問目まで」など */
  upTo: string;
}

const u = (id: string, name: string, example: string, pre: string, suf: string, cnt: string, countLabel: string, upTo: string): Unit => ({
  id,
  name,
  example,
  pre,
  suf,
  cnt,
  countLabel,
  upTo,
});

export const UNITS: readonly Unit[] = [
  u('問', '問', '問題集（9問目）', '', '問目', '問', '問題数', '何問目まで'),
  u('講', '講', '映像授業（第9講）', '第', '講', '講', '講数', '第何講まで'),
  u('ページ', 'ページ', '参考書（9ページ）', '', 'ページ', 'ページ', 'ページ数', '何ページまで'),
  u('章', '章', '章ごと（第9章）', '第', '章', '章', '章数', '第何章まで'),
  u('語', '語', '単語帳（9語目）', '', '語目', '語', '語数', '何語目まで'),
  u('番', '番', 'そのほか（9番）', '', '番', '個', '個数', '何番まで'),
];

export const DEFAULT_UNIT = UNITS[0];

export const unitById = (id: string | undefined): Unit => UNITS.find((x) => x.id === id) ?? DEFAULT_UNIT;

/** その教材の数え方（教材なしは「問」） */
export const unitFor = (materialId: string | null | undefined): Unit => unitById(materialId ? materialById(materialId)?.unit : undefined);

/** 9問目・第9講 */
export const nth = (n: number, x: Unit = DEFAULT_UNIT): string => `${x.pre}${n}${x.suf}`;

/** 10問・10講 */
export const count = (n: number, x: Unit = DEFAULT_UNIT): string => `${n}${x.cnt}`;

/** 231〜240問目・第231〜240講（1つなら nth） */
export const range = (a: number, b: number, x: Unit = DEFAULT_UNIT): string => (a === b ? nth(a, x) : `${x.pre}${a}〜${b}${x.suf}`);

/** 「1問」「1講」（1問の平均・1問ごと） */
export const one = (x: Unit = DEFAULT_UNIT): string => `1${x.cnt}`;

/** いくつかの教材の数え方が全部同じならそれ、混ざっていれば null */
export function commonUnit(materialIds: (string | null | undefined)[]): Unit | null {
  const set = new Set(materialIds.map((id) => unitFor(id).id));
  return set.size === 1 ? unitById([...set][0]) : null;
}
