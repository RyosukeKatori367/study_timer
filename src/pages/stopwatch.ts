import { unlockAudio } from '../audio';
import { newRun } from '../engine';
import { startRun } from '../run';
import { nextLapNumber } from '../store';
import { html } from '../ui/dom';
import { createRing } from '../ui/ring';
import { fmtElapsed } from '../time';
import { createStartRow } from './lapinfo';

export function initStopwatchPage(page: HTMLElement): () => void {
  const ring = createRing();
  const wrap = html(`
    <div class="ring-wrap">
      <div class="ring-center"><div class="big"></div></div>
    </div>`);
  wrap.prepend(ring.el);

  const row = createStartRow(() => {
    unlockAudio();
    startRun(newRun('stopwatch', Date.now(), { firstLap: nextLapNumber() }));
  });

  page.append(html(`<h1>ストップウォッチ</h1>`), html(`<div class="page-main"></div>`), row.el);
  page.querySelector('.page-main')!.append(wrap);

  const big = wrap.querySelector('.big') as HTMLElement;
  const refresh = () => {
    row.refresh();
    const zero = fmtElapsed(0, true); // 0:00:00、98分表示なら 0:00
    big.textContent = zero;
    big.classList.toggle('long', zero.length >= 7);
  };
  refresh();
  return refresh;
}
