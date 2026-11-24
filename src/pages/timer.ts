import { unlockAudio } from '../audio';
import { newRun } from '../engine';
import { startRun } from '../run';
import { nextLapNumber, saveSettings, settings, type TimerKind } from '../store';
import { HOUR, MIN, SEC, fmtRemain } from '../time';
import { $, html } from '../ui/dom';
import { createDrum } from '../ui/drum';
import { toast } from '../ui/toast';
import { createStartRow, lastLapAverage } from './lapinfo';
import { createEndRow, lapEndCondition } from './lapend';

const LONG_PRESS_MS = 550;

export function initTimerPage(page: HTMLElement): () => void {
  const save = () => saveSettings({ timerMs: read() });

  const hours = createDrum({ min: 0, max: 9, value: Math.floor(settings.timerMs / HOUR), onChange: save });
  const minutes = createDrum({ min: 0, max: 59, value: Math.floor((settings.timerMs % HOUR) / MIN), onChange: save });
  const seconds = createDrum({ min: 0, max: 59, value: Math.floor((settings.timerMs % MIN) / SEC), onChange: save });

  const read = () => hours.get() * HOUR + minutes.get() * MIN + seconds.get() * SEC;
  const setTime = (ms: number) => {
    hours.set(Math.floor(ms / HOUR));
    minutes.set(Math.floor((ms % HOUR) / MIN));
    seconds.set(Math.floor((ms % MIN) / SEC));
    saveSettings({ timerMs: ms });
  };

  const main = html(`
    <div class="page-main timer-set">
      <div class="presets" aria-label="プリセット"></div>
      <div class="drum-group">
        <div class="drum-bar"></div>
        <div class="drum-col"><span class="drum-unit">時間</span></div>
        <div class="drum-col"><span class="drum-unit">分</span></div>
        <div class="drum-col"><span class="drum-unit">秒</span></div>
      </div>
    </div>`);
  const cols = main.querySelectorAll('.drum-col');
  cols[0].prepend(hours.el);
  cols[1].prepend(minutes.el);
  cols[2].prepend(seconds.el);

  const presets = $('.presets', main);

  // タイマーの種類（カウントダウン／カウントアップ）。設定時間とプリセットは共通
  const kinds = html(`
    <div class="seg" role="group" aria-label="タイマーの種類">
      <button type="button" data-kind="down">カウントダウン</button>
      <button type="button" data-kind="up">カウントアップ</button>
    </div>`);
  const kindButtons = kinds.querySelectorAll<HTMLElement>('button');
  const renderKind = () => {
    kindButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === settings.timerKind)));
  };
  kindButtons.forEach((b) => {
    b.onclick = () => {
      saveSettings({ timerKind: b.dataset.kind as TimerKind });
      renderKind();
    };
  });

  /** プリセットのボタンを作る。長押しで削除（前回の平均は消せない）。 */
  const presetButton = (ms: number, label?: string) => {
    const b = html<HTMLButtonElement>(
      `<button type="button" class="preset${label ? ' pinned' : ''}">${
        label ? `<small>${label}</small>` : ''
      }${fmtRemain(ms)}</button>`,
    );
    let hold: number | undefined;
    let removed = false;
    b.onclick = () => {
      if (!removed) setTime(ms);
    };
    if (!label) {
      b.addEventListener('pointerdown', () => {
        removed = false;
        hold = window.setTimeout(() => {
          removed = true;
          saveSettings({ presets: settings.presets.filter((p) => p !== ms) });
          renderPresets();
          toast('プリセットを削除しました');
        }, LONG_PRESS_MS);
      });
      for (const type of ['pointerup', 'pointerleave', 'pointercancel'] as const) {
        b.addEventListener(type, () => clearTimeout(hold));
      }
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    return b;
  };

  const renderPresets = () => {
    presets.replaceChildren();
    // 前回の平均ラップ時間を一番上に固定する
    const avg = lastLapAverage();
    if (avg !== null && avg >= SEC) presets.append(presetButton(Math.round(avg / SEC) * SEC, '前回平均'));
    for (const ms of settings.presets) presets.append(presetButton(ms));

    const add = html<HTMLButtonElement>(
      `<button type="button" class="preset add" aria-label="今の時間をプリセットに追加">＋</button>`,
    );
    add.onclick = () => {
      const ms = read();
      if (ms <= 0) return toast('時間を選んでから追加してください');
      if (settings.presets.includes(ms)) return toast('同じプリセットがあります');
      saveSettings({ presets: [...settings.presets, ms].sort((a, b) => a - b) });
      renderPresets();
    };
    presets.append(add);
  };

  const row = createStartRow(() => {
    const ms = read();
    if (ms <= 0) return toast('時間を設定してください');
    unlockAudio();
    saveSettings({ timerMs: ms });
    const now = Date.now();
    // ラップ数で終えるときの残り時間は、最初のラップが終わるまでは設定時間で見積もる
    const common = { firstLap: nextLapNumber(), durationMs: ms, end: lapEndCondition(now), lapEstMs: ms };
    if (settings.timerKind === 'up') {
      // 0 から増えていく。lap で 0 に戻り、設定時間を過ぎると赤くなる
      startRun(newRun('timerUp', now, common));
    } else {
      startRun(newRun('timer', now, { ...common, overrun: settings.overrun }));
    }
  });
  const endRow = createEndRow();

  page.append(html(`<h1>タイマー</h1>`), kinds, main, endRow.el, row.el);
  renderKind();
  renderPresets();

  return () => {
    row.refresh();
    endRow.refresh();
    renderPresets();
  };
}
