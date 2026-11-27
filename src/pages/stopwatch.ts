import { unlockAudio } from '../audio';
import { newRun } from '../engine';
import { startRun } from '../run';
import { currentMaterialId, nextLapNumber } from '../store';
import { html } from '../ui/dom';
import { createRing } from '../ui/ring';
import { fmtElapsed } from '../time';
import { createStartRow, lastLapAverage } from './lapinfo';
import { createEndRow, lapEndCondition, lapEndError } from './lapend';
import { createMaterialChip } from './material';
import { toast } from '../ui/toast';

export function initStopwatchPage(page: HTMLElement): () => void {
  const ring = createRing();
  const wrap = html(`
    <div class="ring-wrap">
      <div class="ring-center"><div class="big"></div></div>
    </div>`);
  wrap.prepend(ring.el);

  const row = createStartRow(() => {
    unlockAudio();
    const err = lapEndError();
    if (err) return toast(err);
    const now = Date.now();
    // ラップ数で終えるときの残り時間は、最初のラップが終わるまでは前回の平均で見積もる
    startRun(
      newRun('stopwatch', now, {
        firstLap: nextLapNumber(),
        end: lapEndCondition(now),
        lapEstMs: lastLapAverage() ?? 0,
        material: currentMaterialId() ?? undefined,
      }),
    );
  });
  const endRow = createEndRow();

  const materialChip = createMaterialChip();
  const picks = html(`<div class="pick-row"></div>`);
  picks.append(materialChip.el, endRow.el);

  page.append(html(`<h1>ストップウォッチ</h1>`), html(`<div class="page-main"></div>`), picks, row.el);
  page.querySelector('.page-main')!.append(wrap);

  const big = wrap.querySelector('.big') as HTMLElement;
  const refresh = () => {
    row.refresh();
    endRow.refresh();
    materialChip.refresh();
    const zero = fmtElapsed(0, true); // 0:00:00、98分表示なら 0:00
    big.textContent = zero;
    big.classList.toggle('long', zero.length >= 7);
  };
  refresh();
  return refresh;
}
