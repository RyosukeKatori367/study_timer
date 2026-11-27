// 画像から教材の色を自動で決める（画面から切り離してテストする）。
// 色の濃いところの色相を数え、いちばん多い色相に近い候補の色を選ぶ。白・黒・灰色ばかりなら灰色。

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 色相（0〜360）・彩度（0〜1）・明度（0〜1） */
export function rgbToHsv([r, g, b]: RGB): [number, number, number] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const d = max - Math.min(R, G, B);
  let h = 0;
  if (d > 0) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

const hueGap = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * ピクセル（RGBA の並び）から、候補の中でいちばん合う色を選ぶ。
 * gray は、色の濃いところが少ない画像（白黒の表紙など）のときの色。
 */
export function colorFromPixels(data: ArrayLike<number>, palette: string[], gray: string): string {
  const BINS = 24;
  const weight = new Array<number>(BINS).fill(0);
  const sum = Array.from({ length: BINS }, () => [0, 0, 0]);
  let pixels = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    pixels++;
    const rgb: RGB = [data[i], data[i + 1], data[i + 2]];
    const [h, s, v] = rgbToHsv(rgb);
    if (s < 0.25 || v < 0.2) continue; // 白・黒・灰色は数えない
    const w = s * v;
    const bin = Math.floor(h / (360 / BINS)) % BINS;
    weight[bin] += w;
    for (let k = 0; k < 3; k++) sum[bin][k] += rgb[k] * w;
  }
  // となりの色相もまとめて数える（境目で分かれないように）
  let best = -1;
  let bestW = 0;
  for (let i = 0; i < BINS; i++) {
    const w = weight[i] + 0.5 * (weight[(i + 1) % BINS] + weight[(i + BINS - 1) % BINS]);
    if (w > bestW) {
      bestW = w;
      best = i;
    }
  }
  if (best < 0 || weight[best] < pixels * 0.04) return gray;
  const avg = sum[best].map((x) => x / weight[best]) as RGB;
  const [h, , v] = rgbToHsv(avg);
  let pick = gray;
  let score = Infinity;
  for (const c of palette) {
    const [ph, ps, pv] = rgbToHsv(hexToRgb(c));
    if (ps < 0.2) continue; // 灰色の候補は、色のある画像には選ばない
    const d = hueGap(h, ph) + Math.abs(v - pv) * 40;
    if (d < score) {
      score = d;
      pick = c;
    }
  }
  return pick;
}
