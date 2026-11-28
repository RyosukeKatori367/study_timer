// 名前の横に出すタグ（グループで見える）。
// 開発者タグは UID で決まり、ほかの人は付けられない（ルールでも止める）。
// 豪運はグミガチャで 0.05% で出る。古参は 2026-11-28 にアカウントがあった人に配った（grants、ルールで守る）。
// ach があるタグは、その実績の報酬（実績を受け取ったら使える）。

import { isDeveloper } from './cloud/model';

export interface TagDef {
  id: string;
  name: string;
  /** 見た目（CSS の tag-○○） */
  look: 'dev' | 'gold' | 'silver' | 'bronze' | 'sapphire' | 'sage' | 'ember' | 'ruby' | 'steel' | 'jade' | 'prism' | 'candy' | 'rainbow';
  /** 実績の報酬のタグなら、その実績の id（src/achievements.ts） */
  ach?: string;
}

export const TAGS: TagDef[] = [
  { id: 'dev', name: '開発者', look: 'dev' },
  { id: 'gouun', name: '豪運', look: 'gold' },
  { id: 'kosan', name: '古参', look: 'silver' },
  // 実績の報酬
  { id: 'doryoku', name: '努力家', look: 'bronze', ach: 'total100' },
  { id: 'kyudo', name: '求道者', look: 'sapphire', ach: 'total500' },
  { id: 'kenja', name: '千時間の賢者', look: 'sage', ach: 'total1000' },
  { id: 'mosa', name: '猛者', look: 'ember', ach: 'day10' },
  { id: 'keizoku', name: '継続の鬼', look: 'ruby', ach: 'streak30' },
  { id: 'tetsujin', name: '鉄人', look: 'steel', ach: 'streak100' },
  { id: 'kaikin', name: '一年皆勤', look: 'jade', ach: 'days365' },
  { id: 'gumichu', name: 'グミ中毒', look: 'candy', ach: 'gacha100' },
  { id: 'shushu', name: '収集家', look: 'prism', ach: 'ownAll' },
  { id: 'niji', name: '虹の使い', look: 'rainbow', ach: 'secret' },
];

/** その実績の報酬のタグ */
export const achTag = (achId: string): TagDef | undefined => TAGS.find((x) => x.ach === achId);

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
