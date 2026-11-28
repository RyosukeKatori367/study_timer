import { describe, expect, it } from 'vitest';
import { FULL_SIDE, THUMB_SIDE, fitSize } from './ui/photo';

describe('投稿の写真の大きさ', () => {
  it('長い辺をそろえて縮め、比率は変えない。小さい写真は大きくしない', () => {
    expect(fitSize(4032, 3024, FULL_SIDE)).toEqual({ w: 1280, h: 960 });
    expect(fitSize(3024, 4032, THUMB_SIDE)).toEqual({ w: 480, h: 640 });
    expect(fitSize(300, 200, FULL_SIDE)).toEqual({ w: 300, h: 200 });
  });
});
