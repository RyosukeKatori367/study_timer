// タイマーとストップウォッチの下段（前回のラップ情報＋start ボタン）。

import { lastLapSession, nextLapNumber, setNextLap } from '../store';
import { MIN, SEC, fmtHM, fmtLap } from '../time';
import { $, html, setText } from '../ui/dom';
import { pickInteger } from '../ui/sheet';

export interface StartRow {
  el: HTMLElement;
  refresh(): void;
}

/** 前回の平均ラップ時間。記録がなければ null。 */
export function lastLapAverage(): number | null {
  const last = lastLapSession();
  if (!last) return null;
  return last.laps.reduce((a, b) => a + b, 0) / last.laps.length;
}

// 1分以上は分まで、1分未満は秒で出す。どちらも四捨五入する
const fmtAverage = (ms: number): string =>
  ms >= MIN ? fmtHM(Math.round(ms / MIN) * MIN) : fmtLap(Math.round(ms / SEC) * SEC);

export function createStartRow(onStart: () => void): StartRow {
  const el = html(`
    <div class="start-row">
      <div class="lap-info">
        <div class="prev">
          <div class="prev-label">前回:</div>
          <div class="prev-range"></div>
          <div class="prev-avg"></div>
        </div>
        <button type="button" class="lap-pill" aria-label="開始ラップ番号を変える">
          <span class="lap-pill-label">ラップ</span>
          <span class="lap-pill-value"></span>
        </button>
      </div>
      <button type="button" class="btn-start">start</button>
    </div>`);

  const refresh = () => {
    const last = lastLapSession();
    if (last) {
      const to = last.firstLap + last.laps.length - 1;
      $('.prev-range', el).innerHTML = `${last.firstLap} ~ ${to}<small>ラップ</small>`;
      setText($('.prev-avg', el), `平均${fmtAverage(lastLapAverage() ?? 0)}`);
    } else {
      setText($('.prev-range', el), 'なし');
      setText($('.prev-avg', el), '');
    }
    setText($('.lap-pill-value', el), `${nextLapNumber()}~`);
  };

  $('.lap-pill', el).onclick = async () => {
    const n = await pickInteger('開始ラップ番号', nextLapNumber(), 1, 99999);
    if (n !== null) {
      setNextLap(n);
      // タイマーとストップウォッチの両方の表示を更新する
      document.dispatchEvent(new CustomEvent('lapinfo:change'));
    }
  };
  $('.btn-start', el).onclick = onStart;
  document.addEventListener('lapinfo:change', refresh);
  document.addEventListener('material:change', refresh);

  refresh();
  return { el, refresh };
}
