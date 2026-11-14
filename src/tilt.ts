// 傾きセンサー。画面の向きをロックしていても、本体を横に倒したら横向きで表示するために使う。
// iPhone では、タップした瞬間に許可を求めないとセンサーが使えない。

import { nextTilt, type Tilt } from './orientation';
import { settings } from './store';

const HOLD_MS = 250; // この時間ずっと同じ向きなら切り替える（持ち上げたときのふらつき対策）

type Listener = (tilt: Tilt) => void;
type PermissionRequester = { requestPermission?: () => Promise<'granted' | 'denied'> };

let tilt: Tilt = 'portrait';
let listening = false;
let candidate: Tilt | null = null;
let since = 0;
const listeners = new Set<Listener>();

export const getTilt = (): Tilt => tilt;

export function onTiltChange(fn: Listener): void {
  listeners.add(fn);
}

function setTilt(next: Tilt): void {
  if (next === tilt) return;
  tilt = next;
  listeners.forEach((fn) => fn(tilt));
}

function handle(e: DeviceOrientationEvent): void {
  if (e.beta === null || e.gamma === null) return;
  const next = nextTilt(tilt, e.beta, e.gamma);
  if (next === tilt) {
    candidate = null;
    return;
  }
  const now = performance.now();
  if (candidate !== next) {
    candidate = next;
    since = now;
    return;
  }
  if (now - since < HOLD_MS) return;
  candidate = null;
  setTilt(next);
}

const requester = (): PermissionRequester | null =>
  'DeviceOrientationEvent' in window ? (DeviceOrientationEvent as unknown as PermissionRequester) : null;

/** センサーを使い始める。iPhone ではタップの中から呼ぶこと。使えなければ false。 */
export async function enableTilt(): Promise<boolean> {
  if (listening) return true;
  const api = requester();
  if (!api) return false;
  if (typeof api.requestPermission === 'function') {
    try {
      if ((await api.requestPermission()) !== 'granted') return false;
    } catch {
      return false;
    }
  }
  if (!listening) {
    window.addEventListener('deviceorientation', handle);
    listening = true;
  }
  return true;
}

export function disableTilt(): void {
  window.removeEventListener('deviceorientation', handle);
  listening = false;
  candidate = null;
  setTilt('portrait');
}

/**
 * 起動時に呼ぶ。設定がオンなら、センサーを使えるようにしておく。
 * iPhone は起動のたびに許可が要るので、最初のタップのときに求める。
 */
export function armTilt(): void {
  if (!settings.tilt) return;
  if (typeof requester()?.requestPermission === 'function') {
    document.addEventListener('click', () => void enableTilt(), { once: true, capture: true });
  } else {
    void enableTilt();
  }
}
