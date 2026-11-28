// お知らせ（パッチノート）。新しい版を出すときに、いちばん上に足す。
// 見たかどうかはこの端末だけで覚える（いちばん新しいお知らせの id）。

export interface News {
  id: string;
  date: string;
  title: string;
  items: string[];
}

export const NEWS: News[] = [
  {
    id: '2026-11-28c',
    date: '2026-11-28',
    title: 'グミとイベントが始まりました',
    items: [
      '勉強やログインで「グミ」がたまるようになりました（本物のお金では買えません）',
      'ログインボーナス：毎日120グミ、7日続けると7日目は240グミ。はじめて受け取るときは開店記念の300グミも',
      '勉強ボーナス：累計3時間ごとに30グミ（これまでの記録の分ももらえます）',
      'イベントタブ：みんなで合計2000時間をめざす毎月のイベント、今週の目標、今日のクエスト',
      'マイページ：ショップ（グミガチャ・交換所）、スタイル、実績、設定はここから',
      'グミガチャは1回120グミ・10回1200グミに。レア度の確率は集めても変わらず、そのレア度を全部持っていたら「かぶり」でグミが返ってきます',
    ],
  },
  {
    id: '2026-11-28b',
    date: '2026-11-28',
    title: 'スタイルが100種類に・豪運タグ',
    items: [
      'テーマと模様が全部で100種類。ベースカラー12色ははじめから使えます',
      'シークレットが1つ、0.05%で出る金色の「豪運」タグ',
      '計測中以外の背景に、テーマの色のグラデーション',
    ],
  },
  {
    id: '2026-11-28a',
    date: '2026-11-28',
    title: '教材のページとグループチャット',
    items: [
      '教材に画像・色・ジャンルを付けられるように（画像から色を自動で選びます）',
      'グループにチャットを追加',
      '計測中の画面の左上の「×」で、記録せずにやめられます',
    ],
  },
  {
    id: '2026-11-27',
    date: '2026-11-27',
    title: 'グループ機能',
    items: [
      'ログインすると、記録が自動でバックアップされます',
      '招待コードでグループに入り、終えた勉強を投稿・いいね・返信できます',
      '今日・今週のランキング、メンバーの統計',
    ],
  },
];

const KEY = 'studytimer:news';

const seenId = (): string => {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};

/** まだ見ていないお知らせの数 */
export const unseenNews = (): number => {
  const seen = seenId();
  const i = NEWS.findIndex((n) => n.id === seen);
  return i === -1 ? (seen ? NEWS.length : 1) : i;
};

export function markNewsSeen(): void {
  try {
    localStorage.setItem(KEY, NEWS[0].id);
  } catch {
    /* 覚えられなくてもよい */
  }
}

/** このお知らせは新しい（まだ見ていない） */
export const isNewNews = (id: string): boolean => {
  const seen = seenId();
  const i = NEWS.findIndex((n) => n.id === seen);
  const j = NEWS.findIndex((n) => n.id === id);
  return i === -1 ? j === 0 : j < i;
};
