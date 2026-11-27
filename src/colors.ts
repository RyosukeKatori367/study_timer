import { NONE_COLOR, defaultColor } from './palette';
import { materialById, materialOrder } from './store';

/**
 * 教材の色。自分で選んだ色があればそれ、なければ作った順に決まった色
 * （多い順ではないので、色は教材についてまわる）。教材なしは明るい灰色。
 */
export function materialColor(key: string | null | undefined): string {
  if (!key) return NONE_COLOR;
  return materialById(key)?.color ?? defaultColor(materialOrder(key));
}
