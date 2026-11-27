// タイマーとストップウォッチの「終了条件」の行。設定は2つの画面で共通。

import { clockToTimestamp, type EndCondition } from '../engine';
import {
  currentMaterialId,
  endLapNo,
  materialName,
  nextLapNumber,
  saveSettings,
  setEndLapNo,
  settings,
  type LapEndKind,
} from '../store';
import { HOUR, MIN, fmtHM, fmtTimeOfDay } from '../time';
import { $, html, setText } from '../ui/dom';
import { pickDrums, pickInteger, pickOption } from '../ui/sheet';
import { toast } from '../ui/toast';

const KINDS: LapEndKind[] = ['none', 'clock', 'total', 'count', 'lapNo'];
const LABELS = ['なし', '時刻', '合計時間', 'ラップ数', 'ラップ番号'];
const CHANGE = 'lapend:change';

/** 計測を始めるときの終了条件 */
export function lapEndCondition(now: number): EndCondition {
  switch (settings.lapEndKind) {
    case 'clock':
      return { kind: 'clock', at: clockToTimestamp(settings.lapEndClockMin, now) };
    case 'total':
      return { kind: 'total', ms: settings.lapEndTotalMs };
    case 'count':
      return { kind: 'count', n: settings.lapEndCount };
    case 'lapNo':
      // 番号は教材ごと。決まっていないときは lapEndError で止めるので、ここには来ない
      return { kind: 'lapNo', to: endLapNo() ?? nextLapNumber() };
    default:
      return { kind: 'none' };
  }
}

/** 今の終了条件では始められないとき、その理由。始められるなら null。 */
export function lapEndError(): string | null {
  if (settings.lapEndKind === 'lapNo') {
    const to = endLapNo();
    if (to === null) return `${materialName(currentMaterialId())}の終了番号が決まっていません。終了条件から決めてください`;
    if (to < nextLapNumber()) return `終了の${to}番が、開始の${nextLapNumber()}番より前です`;
  }
  return null;
}

function describe(): string {
  switch (settings.lapEndKind) {
    case 'clock':
      return `${fmtTimeOfDay(settings.lapEndClockMin)}まで`;
    case 'total':
      return `合計${fmtHM(settings.lapEndTotalMs)}`;
    case 'count': {
      const from = nextLapNumber();
      return `${settings.lapEndCount}ラップ（〜${from + settings.lapEndCount - 1}番）`;
    }
    case 'lapNo': {
      const to = endLapNo();
      if (to === null) return 'ラップ番号（未設定）';
      const n = to - nextLapNumber() + 1;
      return n > 0 ? `${to}番まで（${n}ラップ）` : `${to}番まで（過ぎています）`;
    }
    default:
      return 'なし';
  }
}

/** 終了条件の値を選ぶ。キャンセルしたら false。 */
async function pickValue(kind: LapEndKind): Promise<boolean> {
  if (kind === 'clock') {
    const r = await pickDrums('終了時刻', [
      { min: 0, max: 23, value: Math.floor(settings.lapEndClockMin / 60), unit: '時' },
      { min: 0, max: 59, value: settings.lapEndClockMin % 60, unit: '分', pad: true },
    ]);
    if (!r) return false;
    saveSettings({ lapEndClockMin: r[0] * 60 + r[1] });
  } else if (kind === 'total') {
    const r = await pickDrums('合計時間', [
      { min: 0, max: 12, value: Math.floor(settings.lapEndTotalMs / HOUR), unit: '時間' },
      { min: 0, max: 59, value: Math.floor((settings.lapEndTotalMs % HOUR) / MIN), unit: '分', pad: true },
    ]);
    if (!r) return false;
    const ms = r[0] * HOUR + r[1] * MIN;
    if (ms < MIN) {
      toast('1分以上にしてください');
      return false;
    }
    saveSettings({ lapEndTotalMs: ms });
  } else if (kind === 'count') {
    const n = await pickInteger(`ラップ数（${nextLapNumber()}番から）`, settings.lapEndCount, 1, 999);
    if (n === null) return false;
    saveSettings({ lapEndCount: n });
  } else if (kind === 'lapNo') {
    const from = nextLapNumber();
    // 前に決めた番号が過ぎていたら、今の番号から10ラップ分を初めの値にする
    const saved = endLapNo();
    const value = saved !== null && saved >= from ? saved : from + 9;
    const id = currentMaterialId();
    const title = `${id ? `${materialName(id)}：` : ''}何番まで（${from}番から）`;
    const n = await pickInteger(title, value, from, 99999, `${from}番以上にしてください`);
    if (n === null) return false;
    setEndLapNo(n); // 教材ごとに覚える
  }
  return true;
}

export function createEndRow(): { el: HTMLElement; refresh: () => void } {
  const el = html(`
    <button type="button" class="pick-chip">
      <span class="pick-text"><span class="pick-label">終了条件</span><span class="pick-value"></span></span>
      <span class="chevron" aria-hidden="true">›</span>
    </button>`);
  const refresh = () => {
    setText($('.pick-value', el), describe());
    el.classList.toggle('on', settings.lapEndKind !== 'none');
  };

  el.onclick = async () => {
    const i = await pickOption('終了条件', LABELS, KINDS.indexOf(settings.lapEndKind));
    if (i === null) return;
    const kind = KINDS[i];
    if (kind !== 'none' && !(await pickValue(kind))) return;
    saveSettings({ lapEndKind: kind });
    document.dispatchEvent(new CustomEvent(CHANGE));
  };
  // もう一方の画面で変えたときや、開始ラップ番号を変えたときも表示を合わせる
  document.addEventListener(CHANGE, refresh);
  document.addEventListener('lapinfo:change', refresh);
  document.addEventListener('material:change', refresh);

  refresh();
  return { el, refresh };
}
