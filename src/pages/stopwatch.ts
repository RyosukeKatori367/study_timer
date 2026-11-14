import { unlockAudio } from '../audio';
import { newRun } from '../engine';
import { startRun } from '../run';
import { nextLapNumber } from '../store';
import { html } from '../ui/dom';
import { createRing } from '../ui/ring';
import { createStartRow } from './lapinfo';

export function initStopwatchPage(page: HTMLElement): () => void {
  const ring = createRing();
  const wrap = html(`
    <div class="ring-wrap">
      <div class="ring-center"><div class="big long">0:00:00</div></div>
    </div>`);
  wrap.prepend(ring.el);

  const row = createStartRow(() => {
    unlockAudio();
    startRun(newRun('stopwatch', Date.now(), { firstLap: nextLapNumber() }));
  });

  page.append(html(`<h1>ストップウォッチ</h1>`), html(`<div class="page-main"></div>`), row.el);
  page.querySelector('.page-main')!.append(wrap);
  return row.refresh;
}
