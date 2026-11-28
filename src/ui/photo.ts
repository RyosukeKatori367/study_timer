// 投稿に添える写真を小さくする。Firebase の画像置き場（Cloud Storage）は無料プランで使えないので、
// JPEG にして文字（data URL）で Firestore に入れる。
// - 小さい版（タイムラインに出す）：長い辺 640px、文字で 9万字くらいまで（約65KB）
// - 大きい版（タップしたときだけ読む）：長い辺 1280px、文字で 40万字くらいまで（約300KB）

export interface PhotoData {
  /** 小さい版（JPEG の data URL） */
  thumb: string;
  /** 大きい版（JPEG の data URL） */
  full: string;
  /** 大きい版の幅と高さ */
  w: number;
  h: number;
}

export const THUMB_SIDE = 640;
export const FULL_SIDE = 1280;
export const THUMB_MAX = 90000;
export const FULL_MAX = 400000;

/** 長い辺が side 以下になる大きさ（大きくはしない） */
export function fitSize(w: number, h: number, side: number): { w: number; h: number } {
  const k = Math.min(1, side / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像を読み込めませんでした'));
    };
    img.src = url; // 写真の向き（EXIF）は、ブラウザが合わせて描いてくれる
  });
}

/** 長い辺 side に縮めて、max 文字に収まるまで画質を下げる。それでも大きければ、さらに縮める */
function encode(img: HTMLImageElement, side: number, max: number): { url: string; w: number; h: number } {
  let target = side;
  for (let round = 0; round < 4; round++) {
    const { w, h } = fitSize(img.naturalWidth, img.naturalHeight, target);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#fff'; // 透明な部分（PNG）は白に
    g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, h);
    for (const q of [0.78, 0.68, 0.58, 0.48, 0.4]) {
      const url = canvas.toDataURL('image/jpeg', q);
      if (url.length <= max) return { url, w, h };
    }
    target = Math.round(target * 0.75);
  }
  throw new Error('写真が大きすぎます');
}

/** 選んだ写真から、投稿に入れる小さい版と大きい版を作る */
export async function preparePhoto(file: File): Promise<PhotoData> {
  if (!file.type.startsWith('image/')) throw new Error('画像を選んでください');
  const img = await loadImage(file);
  const full = encode(img, FULL_SIDE, FULL_MAX);
  const thumb = encode(img, THUMB_SIDE, THUMB_MAX);
  return { thumb: thumb.url, full: full.url, w: full.w, h: full.h };
}

/** 写真を画面いっぱいに出す（はじめは小さい版、大きい版が読めたら差しかえる）。タップで閉じる */
export function showPhoto(thumb: string, loadFull?: () => Promise<string | null>): void {
  document.getElementById('photo-view')?.remove();
  const box = document.createElement('div');
  box.id = 'photo-view';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', '写真');
  const img = document.createElement('img');
  img.src = thumb;
  img.alt = '';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'photo-close';
  close.setAttribute('aria-label', '閉じる');
  close.textContent = '×';
  box.append(img, close);
  box.onclick = () => box.remove();
  document.getElementById('app')!.append(box);
  void loadFull?.()
    .then((url) => {
      if (url && box.isConnected) img.src = url;
    })
    .catch(() => undefined);
}
