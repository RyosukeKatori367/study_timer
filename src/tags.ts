// 名前の横に出すタグ（グループで見える）。
// 開発者タグは UID で決まり、ほかの人は付けられない（ルールでも止める）。
// 豪運はグミガチャで 0.05% で出る。ほかにも、合言葉で配るタグを足していく予定。

import { isDeveloper } from './cloud/model';

export interface TagDef {
  id: string;
  name: string;
  /** 見た目（CSS の tag-○○） */
  look: 'dev' | 'gold';
}

export const TAGS: TagDef[] = [
  { id: 'dev', name: '開発者', look: 'dev' },
  { id: 'gouun', name: '豪運', look: 'gold' },
];

export const tagById = (id: string | undefined): TagDef | undefined => TAGS.find((x) => x.id === id);

/**
 * その人の名前の横に出すタグ。tag は本人が選んだもの（'none' なら出さない）。
 * 決めていなければ、開発者だけ開発者タグを出す。開発者タグは本人以外には出さない。
 */
export function shownTag(uid: string, tag: string | undefined): TagDef | null {
  if (tag === 'none') return null;
  if (tag === 'dev' || (tag === undefined && isDeveloper(uid))) return isDeveloper(uid) ? TAGS[0] : null;
  return tagById(tag) ?? null;
}

export const tagHtml = (t: TagDef): string => `<span class="tag tag-${t.look}">${t.name}</span>`;
