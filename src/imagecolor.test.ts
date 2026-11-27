import { describe, expect, it } from 'vitest';
import { colorFromPixels } from './imagecolor';
import { MATERIAL_COLORS } from './palette';

const GRAY = '#b0b0b0';
/** 指定した色のピクセルを n 個並べる */
function pixels(parts: [string, number][]): number[] {
  const out: number[] = [];
  for (const [hex, n] of parts) {
    const v = parseInt(hex.slice(1), 16);
    for (let i = 0; i < n; i++) out.push((v >> 16) & 255, (v >> 8) & 255, v & 255, 255);
  }
  return out;
}

describe('画像から色を決める', () => {
  it('いちばん多い色に近い候補を選ぶ', () => {
    expect(colorFromPixels(pixels([['#1e5bd8', 80], ['#ffffff', 200]]), MATERIAL_COLORS, GRAY)).toBe('#338ced');
    expect(colorFromPixels(pixels([['#ff6a10', 60], ['#111111', 100]]), MATERIAL_COLORS, GRAY)).toBe('#e76624');
    expect(colorFromPixels(pixels([['#16a34a', 90], ['#2563eb', 20]]), MATERIAL_COLORS, GRAY)).toBe('#0aac23');
  });
  it('白黒の画像は灰色', () => {
    expect(colorFromPixels(pixels([['#ffffff', 100], ['#000000', 100], ['#808080', 50]]), MATERIAL_COLORS, GRAY)).toBe(GRAY);
  });
});
