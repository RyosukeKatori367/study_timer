// 期間限定のガチャ（バナー）。シーズンのガチャと、不定期のピックアップ（月ごとなど）。
// 同時に開催できる。出るものは、そのバナーの id を limited に持つテーマ・模様・タグ（src/styles.ts）。

import { dateKey } from './cloud/model';
import { seasonAt } from './seasons';
import { settings } from './store';
import { limitedItems } from './styles';

export interface Banner {
  /** 'c1s1'（シーズン）・'pu2612'（ピックアップ） */
  id: string;
  kind: 'season' | 'pickup';
  /** 小さく出す名前（「チャプター1 シーズン1」「12月のピックアップ」） */
  name: string;
  /** 大きく出す名前 */
  title: string;
  /** 始まりと終わりの日（どちらも含む） */
  start: string;
  end: string;
  /** 見た目（シーズンは season-xxx、ピックアップは pickup-xxx） */
  look?: string;
}

/** ピックアップ（不定期。足すときはここに） */
export const PICKUPS: Banner[] = [
  { id: 'pu2612', kind: 'pickup', name: '12月のピックアップ', title: 'スノウ・ホリデー', start: '2026-11-29', end: '2026-12-31', look: 'xmas' },
];

/** 今引けるバナー（シーズン → ピックアップの順） */
export function activeBanners(now = Date.now()): Banner[] {
  const day = dateKey(now, settings.dayBoundaryMin);
  const out: Banner[] = [];
  const s = seasonAt(day);
  if (s && limitedItems(s.id).length) {
    out.push({ id: s.id, kind: 'season', name: s.name, title: s.title ?? s.name, start: s.start, end: s.end, look: s.look });
  }
  for (const p of PICKUPS) if (p.start <= day && day <= p.end && limitedItems(p.id).length) out.push(p);
  return out;
}

export const activeBanner = (id: string | undefined, now = Date.now()): Banner | undefined =>
  id ? activeBanners(now).find((b) => b.id === id) : undefined;
