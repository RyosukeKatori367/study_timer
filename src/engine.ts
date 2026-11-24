// タイマーの計算部分。画面とは切り離してあり、すべて「今の時刻」を引数で受け取る。
// 秒を1つずつ数えるのではなく、開始時刻との差で経過時間を出すので、
// アプリを閉じたりロックしたりしても、戻ったときに時間がずれない。

// timer    … カウントダウン
// timerUp  … カウントアップ（lap で 0 に戻り、設定時間を過ぎると赤くなる）
export type Mode = 'timer' | 'timerUp' | 'stopwatch' | 'pomoCycle';

/** ラップ番号（問題番号など）を共有するモード。前回の続きの番号から始まる。 */
export const usesLapNumbers = (mode: Mode): boolean => mode !== 'pomoCycle';

/**
 * 保存されているモード名を今の名前に直す。知らない名前なら null。
 * カウントアップは、以前はポモドーロの「ラップ型」（pomoLap）だった。
 */
export function normalizeMode(mode: unknown): Mode | null {
  if (mode === 'pomoLap') return 'timerUp';
  if (mode === 'timer' || mode === 'timerUp' || mode === 'stopwatch' || mode === 'pomoCycle') return mode;
  return null;
}

export type EndCondition =
  | { kind: 'none' }
  | { kind: 'clock'; at: number } // この時刻になったら止める
  | { kind: 'total'; ms: number } // 合計時間に達したら止める
  | { kind: 'count'; n: number }; // ポモドーロ: n セット目の作業が終わったら止める／ラップ: n ラップで止める

/** 計測中の状態。localStorage にそのまま保存する。 */
export interface Run {
  mode: Mode;
  startedAt: number;
  /** 最後に再開する前までに、今のラップでたまっていた時間 */
  acc: number;
  /** 最後に再開した時刻。null なら一時停止中 */
  resumedAt: number | null;
  laps: number[];
  firstLap: number;
  /** 設定時間を過ぎたことを検知済みか（音を1回だけ鳴らすため） */
  rang: boolean;

  // タイマー（カウントダウン／カウントアップ共通の設定時間）
  durationMs: number;
  /** カウントダウンで、0 を過ぎても数え続けるか */
  overrun: boolean;
  /** ラップ1回の目安（残り時間の見積もりに使う。わからなければ 0） */
  lapEstMs?: number;
  // ポモドーロ
  workMs: number;
  breakMs: number;
  end: EndCondition;
}

export interface Session {
  id: string;
  mode: Mode;
  start: number;
  end: number;
  /** 勉強時間。ポモドーロは作業時間だけを数える */
  studyMs: number;
  laps: number[];
  firstLap: number;
}

/** finish のとき、最後のラップがこれより短ければ記録しない（lap 直後の finish 対策） */
export const MIN_FINAL_LAP_MS = 5000;

export function newRun(mode: Mode, now: number, opts: Partial<Run> = {}): Run {
  return {
    mode,
    startedAt: now,
    acc: 0,
    resumedAt: now,
    laps: [],
    firstLap: 1,
    rang: false,
    durationMs: 0,
    overrun: false,
    workMs: 0,
    breakMs: 0,
    end: { kind: 'none' },
    ...opts,
  };
}

export const isRunning = (r: Run): boolean => r.resumedAt !== null;

/** 今のラップ（サイクル型は全体）の経過時間 */
export function elapsed(r: Run, now: number): number {
  return r.acc + (r.resumedAt !== null ? Math.max(0, now - r.resumedAt) : 0);
}

export function pause(r: Run, now: number): void {
  if (r.resumedAt === null) return;
  r.acc = elapsed(r, now);
  r.resumedAt = null;
}

export function resume(r: Run, now: number): void {
  if (r.resumedAt !== null) return;
  r.resumedAt = now;
}

/** ラップとして記録する長さ。超過なしのタイマーは設定時間までで止める。 */
export function lapLength(r: Run, now: number): number {
  const e = elapsed(r, now);
  if (r.mode === 'timer' && !r.overrun) return Math.min(e, r.durationMs);
  return e;
}

/** ラップを記録して、次のラップを 0 から始める。 */
export function lap(r: Run, now: number): void {
  r.laps.push(lapLength(r, now));
  r.acc = 0;
  r.resumedAt = now;
  r.rang = false;
}

/** 記録済みのラップ＋今のラップの合計 */
export function totalElapsed(r: Run, now: number): number {
  return r.laps.reduce((a, b) => a + b, 0) + lapLength(r, now);
}

/** タイマーの残り時間。超過ありなら負の値になる。 */
export function timerRemaining(r: Run, now: number): number {
  const rest = r.durationMs - elapsed(r, now);
  return r.overrun ? rest : Math.max(0, rest);
}

/** 今のラップが設定時間を過ぎているか（タイマーの2モード） */
export function isOver(r: Run, now: number): boolean {
  if (r.mode === 'timer') return elapsed(r, now) >= r.durationMs;
  if (r.mode === 'timerUp') return elapsed(r, now) > r.durationMs;
  return false;
}

export interface CycleView {
  phase: 'work' | 'break';
  /** 今が何セット目か（1始まり） */
  set: number;
  phaseLen: number;
  phaseElapsed: number;
  phaseRemain: number;
  /** 終わった作業の回数 */
  completed: number;
  /** ここまでの作業時間の合計 */
  workTotal: number;
  /** 作業＋休憩の経過時間（一時停止中は進まない） */
  elapsed: number;
  /** 終了条件に達したか */
  done: boolean;
}

/** サイクル型ポモドーロの現在の状態を、経過時間から計算する。 */
export function cycleView(r: Run, now: number): CycleView {
  const work = Math.max(1000, r.workMs);
  const brk = Math.max(0, r.breakMs);
  const cycle = work + brk;

  let done = false;
  // 終了時刻を過ぎて戻ってきたときは、終了時刻の時点で止まっていたことにする
  let at = now;
  if (r.end.kind === 'clock' && now >= r.end.at) {
    at = r.end.at;
    done = true;
  }
  let e = elapsed(r, at);

  let limit = Infinity;
  if (r.end.kind === 'total') limit = r.end.ms;
  if (r.end.kind === 'count') limit = (Math.max(1, r.end.n) - 1) * cycle + work;
  if (e >= limit) {
    e = limit;
    done = true;
  }

  const index = Math.floor(e / cycle);
  const within = e - index * cycle;
  const inWork = within < work;
  const completed = index + (inWork ? 0 : 1);
  const phaseLen = inWork ? work : brk;
  const phaseElapsed = inWork ? within : within - work;

  return {
    phase: inWork ? 'work' : 'break',
    set: index + 1,
    phaseLen,
    phaseElapsed,
    phaseRemain: phaseLen - phaseElapsed,
    completed,
    workTotal: index * work + Math.min(within, work),
    elapsed: e,
    done,
  };
}

/** 終了条件までの残り。時刻・合計はミリ秒、回数は残りセット数。 */
export function cycleRemaining(r: Run, now: number, v: CycleView = cycleView(r, now)): number | null {
  switch (r.end.kind) {
    case 'clock':
      return Math.max(0, r.end.at - now);
    case 'total':
      return Math.max(0, r.end.ms - v.elapsed);
    case 'count':
      return Math.max(0, r.end.n - v.completed);
    default:
      return null;
  }
}

/** 計測を終えて、保存する記録を作る。ほぼ何も計っていなければ null。 */
export function finish(r: Run, now: number): Session | null {
  const base = {
    id: `${r.startedAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    mode: r.mode,
    start: r.startedAt,
    end: now,
    firstLap: r.firstLap,
  };

  if (r.mode === 'pomoCycle') {
    const v = cycleView(r, now);
    if (v.workTotal < 1000) return null;
    return { ...base, studyMs: v.workTotal, laps: [] };
  }

  const laps = [...r.laps];
  const last = lapLength(r, now);
  if (last >= MIN_FINAL_LAP_MS || (laps.length === 0 && last >= 1000)) laps.push(last);
  const studyMs = laps.reduce((a, b) => a + b, 0);
  if (studyMs < 1000) return null;
  return { ...base, studyMs, laps };
}

export interface LapEndView {
  /** 終了条件に達したか */
  done: boolean;
  /** 終了条件に達した時刻（記録の終了時刻にする） */
  doneAt: number;
  /** 終わるまでの時間。ラップ数のときは見積もり。見積もれなければ null */
  remainMs: number | null;
  /** 今のラップも含めた、残りのラップ数（ラップ数のときだけ） */
  remainLaps: number | null;
  /** 終わったラップの数 */
  lapsDone: number;
}

/**
 * ラップのあるモード（タイマー・ストップウォッチ）の終了条件の状態。
 * ラップ数のときの残り時間は「1ラップの平均 × 残りのラップ数 − 今のラップの経過」で見積もる。
 * 平均は、このときのラップがあればその平均、なければ lapEstMs（設定時間や前回の平均）を使う。
 */
export function lapEndView(r: Run, now: number): LapEndView {
  const lapsDone = r.laps.length;
  const base = { done: false, doneAt: now, remainMs: null, remainLaps: null, lapsDone };
  switch (r.end.kind) {
    case 'clock': {
      const rest = r.end.at - now;
      return { ...base, done: rest <= 0, doneAt: Math.min(now, r.end.at), remainMs: Math.max(0, rest) };
    }
    case 'total': {
      const over = totalElapsed(r, now) - r.end.ms;
      return {
        ...base,
        done: over >= 0,
        doneAt: over >= 0 && isRunning(r) ? now - over : now,
        remainMs: Math.max(0, -over),
      };
    }
    case 'count': {
      const left = Math.max(0, r.end.n - lapsDone);
      const avg = lapsDone > 0 ? r.laps.reduce((a, b) => a + b, 0) / lapsDone : (r.lapEstMs ?? 0);
      let remainMs: number | null = null;
      if (left === 0) remainMs = 0;
      else if (avg > 0) remainMs = Math.max(0, avg - lapLength(r, now)) + avg * (left - 1);
      return { ...base, done: left === 0, remainMs, remainLaps: left };
    }
    default:
      return base;
  }
}

/** 「18:00 まで」を実際の時刻にする。もう過ぎていたら翌日の同じ時刻。 */
export function clockToTimestamp(minutesOfDay: number, now: number): number {
  const d = new Date(now);
  d.setHours(Math.floor(minutesOfDay / 60), minutesOfDay % 60, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}
