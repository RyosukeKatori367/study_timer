// 計測中に画面が消えないようにする（Wake Lock API）。
// ホーム画面から開いた Web アプリでは iOS 18.4 以降で効く。

let wanted = false;
let lock: WakeLockSentinel | null = null;

async function acquire(): Promise<void> {
  if (!wanted || lock || document.visibilityState !== 'visible') return;
  if (!('wakeLock' in navigator)) return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => {
      lock = null;
    });
  } catch {
    // 省電力モードなどで断られることがある。そのときは何もしない
  }
}

export function setAwake(on: boolean): void {
  wanted = on;
  if (on) {
    void acquire();
  } else if (lock) {
    void lock.release().catch(() => undefined);
    lock = null;
  }
}

// アプリを裏に回すとロックが外れるので、戻ってきたら取り直す
document.addEventListener('visibilitychange', () => void acquire());
