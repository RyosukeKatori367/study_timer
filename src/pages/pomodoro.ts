import { unlockAudio } from '../audio';
import { clockToTimestamp, newRun, type EndCondition } from '../engine';
import { startRun } from '../run';
import { saveSettings, settings, type EndKind } from '../store';
import { HOUR, MIN, SEC, fmtHM, fmtRemain, fmtTimeOfDay } from '../time';
import { $, html, setText } from '../ui/dom';
import { pickDrums } from '../ui/sheet';
import { toast } from '../ui/toast';

/** 「分・秒」をドラムで選ぶ。キャンセルなら null。 */
async function pickDuration(title: string, ms: number): Promise<number | null> {
  const r = await pickDrums(title, [
    { min: 0, max: 180, value: Math.floor(ms / MIN), unit: '分' },
    { min: 0, max: 59, value: Math.floor((ms % MIN) / SEC), unit: '秒', pad: true },
  ]);
  return r ? r[0] * MIN + r[1] * SEC : null;
}

export function initPomodoroPage(page: HTMLElement): void {
  page.append(
    html(`<h1>ポモドーロ</h1>`),
    html(`
      <div class="cards">
        <button type="button" class="card" data-field="work"><span class="card-label">作業</span><span class="card-value"></span></button>
        <button type="button" class="card" data-field="break"><span class="card-label">休憩</span><span class="card-value"></span></button>
      </div>`),
    html(`
      <div class="end">
        <div class="section-label">終了条件</div>
        <div class="chips" role="group" aria-label="終了条件">
          <button type="button" data-end="none">なし</button>
          <button type="button" data-end="clock">時刻</button>
          <button type="button" data-end="total">合計</button>
          <button type="button" data-end="count">回数</button>
        </div>
        <button type="button" class="end-value"><span class="v"></span><span class="u"></span></button>
        <div class="end-none">止めるまで繰り返します</div>
      </div>`),
    html(`<button type="button" class="btn-start wide">start</button>`),
  );

  const card = (field: string) => $(`.card[data-field="${field}"]`, page);

  const render = () => {
    setText($('.card-value', card('work')), fmtRemain(settings.workMs));
    setText($('.card-value', card('break')), fmtRemain(settings.breakMs));

    page.querySelectorAll<HTMLElement>('.chips button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.end === settings.endKind));
    });
    const value = $('.end-value', page);
    value.hidden = settings.endKind === 'none';
    $('.end-none', page).hidden = settings.endKind !== 'none';
    const [v, u] =
      settings.endKind === 'clock'
        ? [fmtTimeOfDay(settings.endClockMin), 'まで']
        : settings.endKind === 'total'
          ? [fmtHM(settings.endTotalMs), '']
          : [String(settings.endCount), 'セット'];
    setText($('.v', value), v);
    setText($('.u', value), u);
  };

  card('work').onclick = async () => {
    const ms = await pickDuration('作業時間', settings.workMs);
    if (ms === null) return;
    if (ms < SEC) return toast('1秒以上にしてください');
    saveSettings({ workMs: ms });
    render();
  };
  card('break').onclick = async () => {
    const ms = await pickDuration('休憩時間', settings.breakMs);
    if (ms === null) return;
    saveSettings({ breakMs: ms });
    render();
  };

  page.querySelectorAll<HTMLElement>('.chips button').forEach((b) => {
    b.onclick = () => {
      saveSettings({ endKind: b.dataset.end as EndKind });
      render();
    };
  });

  $('.end-value', page).onclick = async () => {
    if (settings.endKind === 'clock') {
      const r = await pickDrums('終了時刻', [
        { min: 0, max: 23, value: Math.floor(settings.endClockMin / 60), unit: '時' },
        { min: 0, max: 59, value: settings.endClockMin % 60, unit: '分', pad: true },
      ]);
      if (r) saveSettings({ endClockMin: r[0] * 60 + r[1] });
    } else if (settings.endKind === 'total') {
      const r = await pickDrums('合計時間', [
        { min: 0, max: 12, value: Math.floor(settings.endTotalMs / HOUR), unit: '時間' },
        { min: 0, max: 59, value: Math.floor((settings.endTotalMs % HOUR) / MIN), unit: '分', pad: true },
      ]);
      if (r) {
        const ms = r[0] * HOUR + r[1] * MIN;
        if (ms < MIN) return toast('1分以上にしてください');
        saveSettings({ endTotalMs: ms });
      }
    } else if (settings.endKind === 'count') {
      const r = await pickDrums('回数', [{ min: 1, max: 20, value: settings.endCount, unit: 'セット' }]);
      if (r) saveSettings({ endCount: r[0] });
    }
    render();
  };

  $('.btn-start', page).onclick = () => {
    unlockAudio();
    const now = Date.now();
    const end: EndCondition =
      settings.endKind === 'clock'
        ? { kind: 'clock', at: clockToTimestamp(settings.endClockMin, now) }
        : settings.endKind === 'total'
          ? { kind: 'total', ms: settings.endTotalMs }
          : settings.endKind === 'count'
            ? { kind: 'count', n: settings.endCount }
            : { kind: 'none' };
    startRun(newRun('pomoCycle', now, { workMs: settings.workMs, breakMs: settings.breakMs, end }));
  };

  render();
}
