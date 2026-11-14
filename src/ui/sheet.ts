// 画面の下から出てくる入力シート（ドラムで選ぶ／数字を打つ）。

import { $, esc, html } from './dom';
import { createDrum } from './drum';

export interface DrumColumn {
  min: number;
  max: number;
  value: number;
  unit: string;
  pad?: boolean;
}

function open(title: string, body: HTMLElement, read: () => number[] | null): Promise<number[] | null> {
  const host = $('#sheet');
  const panel = html(`
    <div class="sheet-panel" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-title">${esc(title)}</div>
      <div class="sheet-body"></div>
      <div class="sheet-actions">
        <button type="button" class="sheet-cancel">キャンセル</button>
        <button type="button" class="sheet-ok">OK</button>
      </div>
    </div>`);
  $('.sheet-body', panel).append(body);
  host.replaceChildren(panel);
  host.hidden = false;

  return new Promise((resolve) => {
    const close = (result: number[] | null) => {
      host.hidden = true;
      host.replaceChildren();
      host.onclick = null;
      resolve(result);
    };
    $('.sheet-cancel', panel).onclick = () => close(null);
    $('.sheet-ok', panel).onclick = () => close(read());
    // 背景（シートの外）をタップしたら閉じる
    host.onclick = (e) => {
      if (e.target === host) close(null);
    };
  });
}

/** ドラムを横に並べて値を選ぶ。キャンセルしたら null。 */
export function pickDrums(title: string, cols: DrumColumn[]): Promise<number[] | null> {
  const body = html(`<div class="drum-group"><div class="drum-bar"></div></div>`);
  const drums = cols.map((c) => {
    const drum = createDrum(c);
    const col = html(`<div class="drum-col"></div>`);
    col.append(drum.el, html(`<span class="drum-unit">${esc(c.unit)}</span>`));
    body.append(col);
    return drum;
  });
  return open(title, body, () => drums.map((d) => d.get()));
}

/** 数字を1つ入力する。キャンセルや範囲外なら null。 */
export async function pickInteger(title: string, value: number, min: number, max: number): Promise<number | null> {
  const input = html<HTMLInputElement>(
    `<input class="sheet-input" type="number" inputmode="numeric" pattern="[0-9]*" min="${min}" max="${max}" value="${value}" aria-label="${esc(title)}">`,
  );
  const result = await open(title, input, () => {
    const n = Math.floor(Number(input.value));
    return Number.isFinite(n) && n >= min && n <= max ? [n] : null;
  });
  return result ? result[0] : null;
}
