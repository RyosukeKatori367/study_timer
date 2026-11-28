// 名前の横に出すタグ（グループで見える）。
// 開発者タグは UID で決まり、ほかの人は付けられない（ルールでも止める）。
// 豪運はグミガチャで 0.05% で出る。ほかにも N〜SSR のタグがグミガチャで出る（src/styles.ts の TAG_ITEMS）。古参は 2026-11-28 にアカウントがあった人に配った（grants、ルールで守る）。
// ach があるタグは、その実績の報酬（実績を受け取ったら使える）。

import { isDeveloper } from './cloud/model';

export interface TagDef {
  id: string;
  name: string;
  /** 見た目（CSS の tag-○○） */
  look: string;
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
  // グミガチャで出るタグ（N：1色、R：2色、SR：光る、SSR：動く）
  { id: 'asagata', name: '東進勢', look: 'n-sky' },
  { id: 'yorugata', name: '駿台勢', look: 'n-night' },
  { id: 'kotsukotsu', name: '塾とかいらねえから', look: 'n-mint' },
  { id: 'mypace', name: '河合勢', look: 'n-lemon' },
  { id: 'nemui', name: 'ねむい', look: 'n-lilac' },
  { id: 'jukensei', name: '受験生', look: 'n-peach' },
  { id: 'fukushu', name: '後期千葉医', look: 'n-leaf' },
  { id: 'ichiyazuke', name: '一夜漬け', look: 'n-ash' },
  { id: 'shuchu', name: '実力不足', look: 'r-focus' },
  { id: 'ankio', name: '一流', look: 'r-memo' },
  { id: 'keisan', name: '阪大', look: 'r-calc' },
  { id: 'hayaoki', name: '受けたら受かる', look: 'r-dawn' },
  { id: 'cafeben', name: '傍若無人', look: 'r-cafe' },
  { id: 'toshokan', name: 'なっぴ', look: 'r-pink' },
  { id: 'tensai', name: 'しゃばい', look: 'sr-genius' },
  { id: 'fukutsu', name: '不屈', look: 'sr-iron' },
  { id: 'zone', name: 'ゾーン突入', look: 'sr-zone' },
  { id: 'shinya', name: 'ぎんぎん', look: 'sr-midnight' },
  { id: 'kami', name: '無限♾️', look: 'ssr-divine' },
  { id: 'kakusei', name: '覚醒', look: 'ssr-awaken' },
  { id: 'sakurasaku', name: 'やりすぎ', look: 'ssr-sakura' },
  // 2026-11-28 に足したガチャのタグ
  { id: 'rikei', name: 'ゴーーーーール！！', look: 'n-blue' },
  { id: 'bunkei', name: 'ゲイ', look: 'n-rose' },
  { id: 'sugakusuki', name: 'かわちぃ', look: 'n-cyan' },
  { id: 'eigosuki', name: 'メロい', look: 'n-coral' },
  { id: 'tangocho', name: 'え？', look: 'n-sand' },
  { id: 'akasheet', name: '(´・ω・｀)', look: 'n-red' },
  { id: 'moshimae', name: 'バリスティック', look: 'n-orange' },
  { id: 'neochi', name: '寝落ち', look: 'n-dusk' },
  { id: 'asakatsu', name: '朝活', look: 'n-sun' },
  { id: 'jishushitsu', name: 'ボット', look: 'n-slate' },
  { id: 'notoma', name: '部活引退', look: 'n-paper' },
  { id: 'kyukeichu', name: 'は？', look: 'n-matcha' },
  { id: 'kakomon', name: '過去問ハンター', look: 'r-hunter' },
  { id: 'kyotest', name: 'バモス', look: 'r-kyote' },
  { id: 'shukudai', name: 'セロガキ', look: 'r-killer' },
  { id: 'tokkun', name: 'ドパガキ', look: 'r-tokkun' },
  { id: 'drill', name: 'ずぶ濡れ', look: 'r-drill' },
  { id: 'marker', name: '公式アカウント', look: 'r-marker' },
  { id: 'kioku', name: 'の座りょう', look: 'r-memory' },
  { id: 'yofukashi', name: '夜ふかし勉', look: 'r-owl' },
  { id: 'bunbogu', name: 'ちゃらんぽらん', look: 'r-stationery' },
  { id: 'koshiki', name: '善し澤', look: 'sr-formula' },
  { id: 'hirameki', name: 'いかせて', look: 'sr-idea' },
  { id: 'gyakuten', name: 'BPM125', look: 'sr-comeback' },
  { id: 'shishi', name: '理Ⅲ', look: 'sr-lion' },
  { id: 'hoshiyomi', name: '”青純”', look: 'sr-stars' },
  { id: 'honban', name: '京医的脅威', look: 'sr-clutch' },
  { id: 'daiichi', name: 'どう見たって儚いだろ', look: 'ssr-dream' },
  { id: 'tenka', name: '本質厨', look: 'ssr-tenka' },
  { id: 'mugen', name: '鉄緑勢', look: 'ssr-infinite' },
  // 期間限定ガチャのタグ（チャプター1 シーズン1「虚空劫灰のプラーナ」）
  { id: 'kaijin', name: 'チル', look: 'lim-ash' },
  { id: 'kokuu', name: '女体化マルフォイ', look: 'lim-void' },
  { id: 'prana', name: '別班', look: 'lim-prana' },
  // 12月のピックアップ
  { id: 'yukidaruma', name: '死してなお', look: 'pu-snowman' },
  { id: 'kotatsu', name: '渇望', look: 'pu-kotatsu' },
  { id: 'whitexmas', name: '解き放て', look: 'pu-white' },
  { id: 'kuribocchi', name: '夏を満喫', look: 'pu-xmas' },
  { id: 'kiseki', name: '道連れだ', look: 'pu-kiseki' },
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
