// 本体の傾きから、画面を縦・横どちらで出すかを決める（計算だけ。センサーは tilt.ts）。

export type Tilt = 'portrait' | 'left' | 'right'; // left = 本体の左側が下（上端が左を向く）

const RAD = Math.PI / 180;

/**
 * beta / gamma（DeviceOrientationEvent の値、度）から次の向きを返す。
 * 机に平置きしたときや、縦と横の境目あたりでは、今の向きをそのまま保つ。
 */
export function nextTilt(current: Tilt, beta: number, gamma: number): Tilt {
  // 重力が画面のどちらを向いているか（x: 画面の右が＋、y: 画面の上が＋）
  const gx = Math.cos(beta * RAD) * Math.sin(gamma * RAD);
  const gy = -Math.sin(beta * RAD);
  if (Math.hypot(gx, gy) < 0.5) return current; // ほぼ水平（平置き）

  const angle = Math.atan2(gx, -gy) / RAD; // 0 = 縦、+90 = 右側が下、-90 = 左側が下
  const a = Math.abs(angle);
  if (a >= 60 && a <= 120) return angle < 0 ? 'left' : 'right';
  if (a <= 30) return 'portrait';
  return current; // 境目と逆さま
}
