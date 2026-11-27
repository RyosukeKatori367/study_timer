// 計測中の画面。4つのモード（タイマー／ストップウォッチ／ポモドーロ2種）で
// 同じ画面を使い回し、モードごとに表示する中身だけ変える。

import { play } from './audio';
import {
  cycleRemaining,
  cycleView,
  elapsed,
  finish,
  isRunning,
  lap,
  pause,
  resume,
  timerRemaining,
  totalElapsed,
  lapEndView,
  LEAVE_MIN_MS,
  markBack,
  markLeft,
  usesLapNumbers,
  type Run,
  type Session,
} from './engine';
import { addSession, clearRun, getSessions, loadRun, materialName, saveRun, setNextLap, settings } from './store';
import { studyDayStart } from './summary';
import { getTilt, onTiltChange } from './tilt';
import { HOUR, fmtElapsed, fmtHM, fmtLap, fmtRemain, pad2 } from './time';
import { $, html, setText } from './ui/dom';
import { createRing, type Ring } from './ui/ring';
import { toast } from './ui/toast';
import { setAwake } from './wakelock';

const HOLD_MS = 600; // finish を押し続ける時間（押し間違い防止）
const TICK_MS = 200;

let run: Run | null = null;
let onExit: () => void = () => undefined;
let ticker: number | undefined;
let lastPhase = '';
let renderedLaps = -1;

let root: HTMLElement;
let app: HTMLElement;
let ring: Ring;
let el: {
  kicker: HTMLElement;
  titleA: HTMLElement;
  titleB: HTMLElement;
  big: HTMLElement;
  sub: HTMLElement;
  info: HTMLElement;
  infoLabels: HTMLElement[];
  infoValues: HTMLElement[];
  btnFinish: HTMLButtonElement;
  btnStop: HTMLButtonElement;
  btnLap: HTMLButtonElement;
  laps: HTMLElement;
  lapList: HTMLElement;
  lapNumber: HTMLElement;
  lapTotal: HTMLElement;
};

export const isActive = (): boolean => run !== null;

export function initRun(exit: () => void): void {
  onExit = exit;
  root = $('#run');
  app = $('#app');
  root.append(
    html(`
      <div class="run-head">
        <div class="run-kicker"></div>
        <div class="run-title"><span class="a"></span><span class="b"></span></div>
      </div>`),
    html(`
      <div class="ring-wrap">
        <div class="ring-center">
          <div class="big" role="timer"></div>
          <div class="sub"></div>
        </div>
      </div>`),
    html(`
      <div class="run-info">
        <div><span class="label"></span><span class="value"></span></div>
        <div><span class="label"></span><span class="value"></span></div>
        <div><span class="label"></span><span class="value"></span></div>
      </div>`),
    html(`
      <div class="run-btns">
        <button type="button" class="btn-finish"><span>finish</span></button>
        <button type="button" class="btn-stop">stop</button>
        <button type="button" class="btn-lap">lap</button>
      </div>`),
    html(`
      <div class="run-laps">
        <div class="lap-list"></div>
        <div class="lap-box">
          <div class="lap-now"><span>ラップ</span><span class="n"></span></div>
          <div class="lap-total"></div>
        </div>
      </div>`),
  );

  ring = createRing();
  $('.ring-wrap', root).prepend(ring.el);

  el = {
    kicker: $('.run-kicker', root),
    titleA: $('.run-title .a', root),
    titleB: $('.run-title .b', root),
    big: $('.big', root),
    sub: $('.sub', root),
    info: $('.run-info', root),
    infoLabels: [...root.querySelectorAll<HTMLElement>('.run-info .label')],
    infoValues: [...root.querySelectorAll<HTMLElement>('.run-info .value')],
    btnFinish: $<HTMLButtonElement>('.btn-finish', root),
    btnStop: $<HTMLButtonElement>('.btn-stop', root),
    btnLap: $<HTMLButtonElement>('.btn-lap', root),
    laps: $('.run-laps', root),
    lapList: $('.lap-list', root),
    lapNumber: $('.lap-now .n', root),
    lapTotal: $('.lap-total', root),
  };

  el.btnStop.onclick = () => {
    if (!run) return;
    const now = Date.now();
    if (isRunning(run)) pause(run, now);
    else resume(run, now);
    saveRun(run);
    render();
  };

  el.btnLap.onclick = () => {
    if (!run) return;
    const now = Date.now();
    lap(run, now);
    saveRun(run);
    play('lap');
    // 決めたラップ数に達したら、そこで終わる
    if (lapEndView(run, now).done) {
      play('done');
      end(now);
      return;
    }
    render();
  };

  bindHoldToFinish();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      cameBack();
      render();
    } else if (run && settings.leaveTrack) {
      // 計測中にアプリから離れた（ほかのアプリ・画面を消した）
      markLeft(run, Date.now());
      saveRun(run);
    }
  });
  onTiltChange(applyLayout);
  window.addEventListener('resize', applyLayout);

  // アプリを閉じる前に計測していたら、続きから再開する
  const saved = loadRun();
  if (saved) {
    run = saved;
    cameBack(); // 離れているあいだにアプリが閉じられていたときも、戻ったことにする
    show();
  }
}

/** アプリに戻ったとき。30秒以上離れていたら記録して、お知らせを出す */
function cameBack(): void {
  if (!run || run.leftAt == null) return;
  const ms = markBack(run, Date.now());
  saveRun(run);
  if (ms === null) return;
  // 今日の何回目か（終えた記録＋今の計測）
  const today = studyDayStart(Date.now(), settings.dayBoundaryMin);
  const before = getSessions()
    .filter((s) => studyDayStart(s.start, settings.dayBoundaryMin) === today)
    .reduce((a, s) => a + (s.leaves?.length ?? 0), 0);
  const r = run;
  const leave = r.leaves!.at(-1)!;
  toast(`${ms < HOUR ? fmtLap(ms) : fmtHM(ms)}離れていました（今日${before + (r.leaves?.length ?? 0)}回目）`, {
    label: '画面を消していただけ',
    // 画面を消して紙で勉強していたときなどは、離脱に数えない
    run: () => {
      if (run !== r || !r.leaves) return;
      r.leaves = r.leaves.filter((x) => x !== leave);
      saveRun(r);
      render();
      toast('離脱に数えないようにしました');
    },
  });
}

export function startRun(r: Run): void {
  run = r;
  saveRun(r);
  show();
}

function show(): void {
  if (!run) return;
  const cycle = run.mode === 'pomoCycle';
  root.dataset.mode = run.mode;
  root.hidden = false;
  // ポモドーロと、終了条件のあるタイマー・ストップウォッチは、残りなどを出す
  el.info.hidden = !cycle && run.end.kind === 'none';
  el.laps.hidden = cycle;
  el.btnLap.hidden = cycle;
  lastPhase = '';
  renderedLaps = -1;
  root.classList.remove('break');
  applyLayout();
  setAwake(settings.keepAwake);
  clearInterval(ticker);
  ticker = window.setInterval(render, TICK_MS);
  render();
}

/**
 * 次に始めるラップ番号。
 * finish したときに途中だったラップ（記録に入ったもの）を、設定によって
 * 済んだことにして次の番号から始めるか、同じ番号からやり直すかを決める。
 * lap の直後に finish したなど、途中のラップが記録に入らなかったときは、その番号から始める。
 */
function nextLapAfter(r: Run, s: Session): number {
  const inProgress = r.firstLap + r.laps.length;
  const partial = s.laps.length > r.laps.length;
  return partial && settings.lapAdvance ? inProgress + 1 : inProgress;
}

/**
 * 計測を終えて記録する。at は終了時刻（終了条件に達した時刻など）。
 * 離れているあいだに終わったときは、終わった時刻までを離脱にする。
 */
function end(at = Date.now()): void {
  if (!run) return;
  if (run.leftAt != null) {
    if (at - run.leftAt >= LEAVE_MIN_MS) (run.leaves ??= []).push([run.leftAt, at]);
    run.leftAt = null;
  }
  const mode = run.mode;
  const session = finish(run, at);
  if (session) {
    addSession(session);
    // ログインしていれば、投稿の確認画面が出る
    queueMicrotask(() => document.dispatchEvent(new CustomEvent('session:saved', { detail: session })));
    if (usesLapNumbers(mode)) setNextLap(nextLapAfter(run, session), run.material ?? null);
  }
  clearRun();
  run = null;
  clearInterval(ticker);
  setAwake(false);
  root.hidden = true;
  delete app.dataset.rot;
  if (session) {
    const t = session.studyMs >= HOUR ? fmtHM(session.studyMs) : fmtLap(session.studyMs);
    toast(`記録しました（${t}）`);
  } else {
    toast('記録せずに終了しました');
  }
  onExit();
}

/**
 * 縦・横のレイアウトを切り替える。横向きになるのは次の2通り。
 * - 本体が実際に横向きになった（画面の向きロックがオフ）→ そのまま横長のレイアウトにする
 * - 向きロック中に本体を倒した（設定がオンのとき）→ 画面は縦のままなので、CSS で90度回して見せる
 */
function applyLayout(): void {
  if (!run) return;
  const w = app.clientWidth;
  const h = app.clientHeight;
  const native = w > h;
  const tilt = settings.tilt ? getTilt() : 'portrait';
  const rotated = !native && tilt !== 'portrait';

  root.classList.toggle('land', native || rotated);
  root.classList.toggle('rot-left', rotated && tilt === 'left');
  root.classList.toggle('rot-right', rotated && tilt === 'right');
  // 回すときは、幅と高さを入れ替えた大きさにしてから回転させる
  root.style.width = rotated ? `${h}px` : '';
  root.style.height = rotated ? `${w}px` : '';
  root.style.setProperty('--short', `${Math.min(w, h)}px`);
  root.style.setProperty('--long', `${Math.max(w, h)}px`);
  if (rotated) app.dataset.rot = tilt;
  else delete app.dataset.rot;
}

/** finish は 0.6 秒押し続けたときだけ効く。 */
function bindHoldToFinish(): void {
  const btn = el.btnFinish;
  let hold: number | undefined;

  const cancel = (hint: boolean) => {
    if (hold === undefined) return;
    clearTimeout(hold);
    hold = undefined;
    btn.classList.remove('holding');
    if (hint) toast('finish は長押しで終了します');
  };

  btn.addEventListener('pointerdown', () => {
    if (!settings.finishHold) return; // 1回タップで終わる設定のときは click で終える
    btn.classList.add('holding');
    hold = window.setTimeout(() => {
      hold = undefined;
      btn.classList.remove('holding');
      end();
    }, HOLD_MS);
  });
  btn.addEventListener('pointerup', () => cancel(true));
  btn.addEventListener('pointerleave', () => cancel(false));
  btn.addEventListener('pointercancel', () => cancel(false));
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  // キーボード（Enter / Space）で押したとき、長押しなしの設定のときはそのまま終了
  btn.addEventListener('click', (e) => {
    if (e.detail === 0 || !settings.finishHold) end();
  });
}

/** 計測中の画面の一番上の小さい見出し。教材があれば並べる */
const kicker = (r: Run, mode: string): string => {
  const parts = [mode];
  if (r.material) parts.push(materialName(r.material));
  if (settings.leaveTrack && r.leaves?.length) parts.push(`離脱${r.leaves.length}回`);
  return parts.join(' · ');
};

function setBig(text: string, over = false): void {
  setText(el.big, text);
  el.big.classList.toggle('long', text.length >= 7);
  el.big.classList.toggle('over', over);
  el.sub.classList.toggle('over', over);
}

function render(): void {
  if (!run) return;
  const now = Date.now();

  switch (run.mode) {
    case 'stopwatch':
      renderStopwatch(run, now);
      break;
    case 'timer':
      renderTimer(run, now);
      break;
    case 'timerUp':
      renderTimerUp(run, now);
      break;
    case 'pomoCycle':
      renderPomoCycle(run, now);
      break;
  }
  if (!run) return; // ポモドーロが終了条件に達して、自動で終わった
  if (run.mode !== 'pomoCycle' && run.end.kind !== 'none') {
    renderLapEnd(run, now);
    if (!run) return; // 時刻・合計時間に達して、自動で終わった
  }

  const running = isRunning(run);
  setText(el.btnStop, running ? 'stop' : 'start');
  const ended = run.mode === 'timer' && !run.overrun && run.rang;
  root.classList.toggle('paused', !running && !ended);
  if (run.mode !== 'pomoCycle') renderLaps(run);
  el.lapTotal.classList.toggle('long', (el.lapTotal.textContent ?? '').length >= 8);
}

function renderStopwatch(r: Run, now: number): void {
  const total = totalElapsed(r, now);
  setText(el.kicker, kicker(r, 'ストップウォッチ'));
  setText(el.titleA, '');
  setText(el.titleB, '');
  setBig(fmtElapsed(total, true));
  setText(el.sub, '');
  ring.set(0, ((total % 60000) / 60000) * 360); // 1分で1周
  setText(el.lapTotal, fmtLap(elapsed(r, now)));
  el.btnStop.disabled = false;
}

function renderTimer(r: Run, now: number): void {
  const e = elapsed(r, now);
  if (!r.rang && e >= r.durationMs) {
    r.rang = true;
    if (!r.overrun && r.resumedAt !== null) {
      // 超過なし: ちょうど 0 になった時刻で止める
      pause(r, r.resumedAt + (r.durationMs - r.acc));
    }
    saveRun(r);
    play('done');
  }

  const rest = timerRemaining(r, now);
  const overSeconds = Math.floor(-rest / 1000);
  const over = r.overrun && r.rang;
  setText(el.kicker, kicker(r, 'タイマー・カウントダウン'));
  setText(el.titleA, '設定');
  setText(el.titleB, fmtRemain(r.durationMs));
  if (over) {
    setBig(overSeconds > 0 ? `-${fmtElapsed(-rest)}` : '0:00', true);
    setText(el.sub, '超過');
    ring.set(0, 360, true);
  } else {
    setBig(fmtRemain(rest));
    setText(el.sub, r.rang ? '終了' : '残り');
    ring.set((e / r.durationMs) * 360, 360); // 残り時間のぶんだけ光る
  }
  setText(el.lapTotal, `合計 ${fmtLap(totalElapsed(r, now))}`);
  // 0 で止まったあとは、lap（次へ）か finish だけ
  el.btnStop.disabled = !r.overrun && r.rang;
}

/** カウントアップ: 0 から増えていき、設定時間を過ぎたら赤くなる（自動では止まらない） */
function renderTimerUp(r: Run, now: number): void {
  const e = elapsed(r, now);
  const over = e > r.durationMs;
  if (!r.rang && over) {
    r.rang = true;
    saveRun(r);
    play('over');
  }
  setText(el.kicker, kicker(r, 'タイマー・カウントアップ'));
  setText(el.titleA, '設定');
  setText(el.titleB, fmtRemain(r.durationMs));
  setBig(fmtElapsed(e), over);
  setText(el.sub, over ? `+${fmtElapsed(e - r.durationMs)} 超過` : '');
  if (over) ring.set(0, 360, true);
  else ring.set(0, (e / r.durationMs) * 360);
  setText(el.lapTotal, `合計 ${fmtLap(totalElapsed(r, now))}`);
  el.btnStop.disabled = false;
}

function renderPomoCycle(r: Run, now: number): void {
  const v = cycleView(r, now);
  if (v.done) {
    play('done');
    end();
    return;
  }

  const phase = `${v.set}-${v.phase}`;
  if (phase !== lastPhase) {
    if (lastPhase) play(v.phase === 'break' ? 'toBreak' : 'toWork');
    lastPhase = phase;
  }

  const work = v.phase === 'work';
  const lastSet = r.end.kind === 'count' && v.set >= r.end.n;
  setText(el.kicker, kicker(r, 'ポモドーロ'));
  setText(el.titleA, work ? '作業' : '休憩');
  setText(el.titleB, `${v.set}セット目`);
  setBig(fmtRemain(v.phaseRemain));
  if (work && lastSet) setText(el.sub, '最後のセット');
  else if (work && r.breakMs > 0) setText(el.sub, `次は休憩 ${fmtRemain(r.breakMs)}`);
  else setText(el.sub, `次は作業 ${fmtRemain(r.workMs)}`);
  ring.set(0, (v.phaseElapsed / v.phaseLen) * 360);
  root.classList.toggle('break', !work);

  const rest = cycleRemaining(r, now, v);
  const info: [string, string][] = [];
  switch (r.end.kind) {
    case 'clock': {
      const d = new Date(r.end.at);
      info.push(['終了', `${d.getHours()}:${pad2(d.getMinutes())}`], ['残り', fmtRemain(rest ?? 0)]);
      break;
    }
    case 'total':
      info.push(['合計', fmtHM(r.end.ms)], ['残り', fmtRemain(rest ?? 0)]);
      break;
    case 'count':
      info.push(['回数', `${r.end.n}セット`], ['残り', `${rest ?? 0}セット`]);
      break;
    default:
      info.push(['終了', 'なし'], ['経過', fmtElapsed(v.elapsed)]);
  }
  info.push(['完了', `${v.completed}セット`]);
  info.forEach(([label, value], i) => {
    setText(el.infoLabels[i], label);
    setText(el.infoValues[i], value);
  });
  el.btnStop.disabled = false;
}

/** タイマー・ストップウォッチの終了条件（残り時間・残りラップ） */
function renderLapEnd(r: Run, now: number): void {
  const v = lapEndView(r, now);
  if (v.done) {
    play('done');
    end(v.doneAt);
    return;
  }
  const rest = v.remainMs === null ? '—' : fmtRemain(v.remainMs);
  const info: [string, string][] = [];
  switch (r.end.kind) {
    case 'clock': {
      const d = new Date(r.end.at);
      info.push(['終了', `${d.getHours()}:${pad2(d.getMinutes())}`], ['残り時間', rest], ['完了', `${v.lapsDone}ラップ`]);
      break;
    }
    case 'total':
      info.push(['合計', fmtHM(r.end.ms)], ['残り時間', rest], ['完了', `${v.lapsDone}ラップ`]);
      break;
    case 'count':
    case 'lapNo':
      info.push(
        ['終了', `${r.end.kind === 'count' ? r.firstLap + r.end.n - 1 : r.end.to}番`],
        ['残り時間（目安）', rest],
        ['残り', `${v.remainLaps ?? 0}ラップ`],
      );
      break;
  }
  info.forEach(([label, value], i) => {
    setText(el.infoLabels[i], label);
    setText(el.infoValues[i], value);
  });
}

function renderLaps(r: Run): void {
  setText(el.lapNumber, String(r.firstLap + r.laps.length));
  if (renderedLaps === r.laps.length) return;
  renderedLaps = r.laps.length;

  // 設定時間を超えたラップは赤で出す
  const limit = r.mode === 'timerUp' || (r.mode === 'timer' && r.overrun) ? r.durationMs : Infinity;
  const rows = r.laps
    .map((ms, i) => {
      const cls = ms > limit ? ' class="over"' : '';
      return `<div class="lap-row"><span>ラップ${r.firstLap + i}</span><span${cls}>${fmtLap(ms)}</span></div>`;
    })
    .reverse(); // 新しいラップを上に
  while (rows.length < 4) rows.push('<div class="lap-row"></div>');
  el.lapList.innerHTML = rows.join('');
  el.lapList.scrollTop = 0;
}
