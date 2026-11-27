// 音。iPhone では、ユーザーが画面をタップした瞬間にしか音の準備ができないので、
// start を押したときに unlockAudio() を呼んでおく。

import { settings } from './store';

type AudioCtor = typeof AudioContext;
let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  const Ctor: AudioCtor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  if (!Ctor) return;
  ctx ??= new Ctor();
  try {
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    // 無音を一瞬鳴らして、あとから音を出せる状態にしておく
    tone(440, 0, 0.05, 0);
  } catch {
    // 音が使えなくても計測は始められるようにする
  }
}

function tone(freq: number, delay: number, duration: number, volume = 0.25): void {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.01);
  gain.gain.setValueAtTime(volume, Math.max(t + 0.01, t + duration - 0.03));
  gain.gain.linearRampToValueAtTime(0, t + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

export type Sound = 'done' | 'toBreak' | 'toWork' | 'over' | 'lap';

export function play(sound: Sound): void {
  // lap の音は別の設定。それ以外は「終了時に音を鳴らす」に従う
  if (!(sound === 'lap' ? settings.lapSound : settings.sound) || !ctx) return;
  try {
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    schedule(sound);
  } catch {
    // 音が鳴らせなくても画面の表示は続ける
  }
}

function schedule(sound: Sound): void {
  switch (sound) {
    case 'done': // ピピピッ ×2
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 3; j++) tone(1047, i * 0.7 + j * 0.16, 0.1);
      }
      break;
    case 'toBreak': // 下がる2音
      tone(880, 0, 0.18);
      tone(659, 0.22, 0.3);
      break;
    case 'toWork': // 上がる2音
      tone(659, 0, 0.18);
      tone(880, 0.22, 0.3);
      break;
    case 'lap': // 短い高い音
      tone(1568, 0, 0.07, 0.15);
      break;
    case 'over': // 低い1音
      tone(523, 0, 0.35);
      break;
  }
}
