// 時間を入力して記録する（タイマーを使わなかった勉強や、計り忘れたとき）。
// 開始時刻は、はじめは「今から逆算」（終わりが今）。日付や開始時刻を決めることもできる。
// 入力した記録は「手入力」として残り、統計の記録の一覧から消せる。

import { MANUAL_MAX_MS, manualSession, overlapping, type Session } from '../engine';
import { addSession, currentMaterialId, getSessions, materialName, removeSession, settings } from '../store';
import { studyDayStart } from '../summary';
import { HOUR, MIN, fmtHM, pad2 } from '../time';
import { $, esc, html } from '../ui/dom';
import { pickDrums, pickList } from '../ui/sheet';
import { toast } from '../ui/toast';
import { materialThumb, pickMaterial } from './material';
import { api } from '../cloud/api';
import { openCompose } from './group/compose';

/** 記録が増えた・消えた（統計などを描き直す） */
export const SESSIONS_CHANGE = 'sessions:change';
const notify = () => document.dispatchEvent(new CustomEvent(SESSIONS_CHANGE));

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const DAY = 24 * HOUR;
const clock = (ts: number) => {
  const d = new Date(ts);
  return `${d.getHours()}:${pad2(d.getMinutes())}`;
};
const dateLabel = (ts: number) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
};
/** その日の 0:00 */
const midnight = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
/** 分の単位にそろえる */
const toMinute = (ts: number) => Math.floor(ts / MIN) * MIN;

/**
 * 時間を入力して記録する画面を開く。day は統計で選んでいた日の始まり（今日なら省略）。
 * 今日でない日なら、その日の、今と同じ時刻に終わったことにして開始時刻を決めておく。
 */
export function openManual(day?: number): void {
  document.getElementById('manual')?.remove();
  const root = html('<div id="manual" class="fullpage" role="dialog" aria-modal="true" aria-label="時間を入力して記録"></div>');
  document.getElementById('app')!.append(root);
  const close = () => root.remove();

  let dur = HOUR;
  let material = currentMaterialId();
  /** 決めた開始時刻（null なら今から逆算） */
  let fixed: number | null = null;
  const now0 = Date.now();
  if (day !== undefined && day !== studyDayStart(now0, settings.dayBoundaryMin)) {
    fixed = toMinute(midnight(day) + (now0 - midnight(now0)) - dur);
  }

  const range = () => {
    const end = fixed === null ? toMinute(Date.now()) : fixed + dur;
    return { start: end - dur, end };
  };

  // ログインしていてグループに入っていれば、記録して投稿できる
  const canPost = !!api.user() && (api.cachedProfile()?.groupIds.length ?? 0) > 0;

  const render = () => {
    const { start, end } = range();
    const future = end > Date.now() + MIN;
    const over = overlapping(getSessions(), start, end);
    const sameDay = midnight(start) === midnight(end - 1);
    const when = sameDay
      ? `${dateLabel(start)} ${clock(start)}〜${clock(end)}`
      : `${dateLabel(start)} ${clock(start)}〜${dateLabel(end)} ${clock(end)}`;
    root.innerHTML = `
      <div class="sns">
        <div class="sns-head">
          <button type="button" class="sns-back" data-close aria-label="閉じる">×</button>
          <div class="sns-head-title">時間を入力して記録</div>
          <span class="sns-head-side"></span>
        </div>
        <p class="sns-lead">タイマーを使わなかった勉強や、計り忘れたときに。統計やグループのランキングにも入ります</p>
        <div class="sns-card">
          <button type="button" class="sns-row" data-dur>
            <span class="sns-row-main">勉強した時間</span>
            <span class="sns-row-end"><b class="manual-dur">${fmtHM(dur)}</b><span class="chevron">›</span></span>
          </button>
          <button type="button" class="sns-row" data-material>
            <span class="sns-row-main">教材</span>
            <span class="sns-row-end">${materialThumb(material, 24)}<span>${esc(materialName(material))}</span><span class="chevron">›</span></span>
          </button>
        </div>
        <div class="sns-card">
          <button type="button" class="sns-row" data-date>
            <span class="sns-row-main">日付</span>
            <span class="sns-row-end">${fixed === null ? '今日' : esc(dateLabel(start))}<span class="chevron">›</span></span>
          </button>
          <button type="button" class="sns-row" data-start>
            <span class="sns-row-main">開始時刻</span>
            <span class="sns-row-end">${fixed === null ? `今から逆算（${clock(start)}）` : clock(start)}<span class="chevron">›</span></span>
          </button>
        </div>
        ${fixed !== null ? '<button type="button" class="btn ghost small" data-auto>今から逆算にもどす</button>' : ''}
        <div class="manual-preview${future ? ' bad' : ''}">
          <span class="manual-when">${esc(when)}</span>
          <span class="manual-what">${fmtHM(dur)}・${esc(materialName(material))}</span>
        </div>
        ${future ? '<p class="manual-warn bad">まだ来ていない時間です。開始時刻を前にしてください</p>' : ''}
        ${
          !future && over.length
            ? `<p class="manual-warn">この時間帯の記録と重なっています（${over
                .slice(0, 2)
                .map((s) => `${clock(s.start)}〜${clock(s.end)}`)
                .join('、')}${over.length > 2 ? ' ほか' : ''}）。そのまま記録すると、時間が2重に数えられます</p>`
            : ''
        }
        ${
          canPost
            ? `<button type="button" class="btn primary" data-save="post" ${future ? 'disabled' : ''}>記録して投稿</button>
               <button type="button" class="btn dark" data-save ${future ? 'disabled' : ''}>記録だけする</button>`
            : `<button type="button" class="btn primary" data-save ${future ? 'disabled' : ''}>記録する</button>
               <p class="sns-lead">ログインしてグループに入ると、グループに投稿もできます</p>`
        }
      </div>`;

    $('[data-close]', root).onclick = close;
    $('[data-dur]', root).onclick = async () => {
      const r = await pickDrums('勉強した時間', [
        { min: 0, max: MANUAL_MAX_MS / HOUR, value: Math.floor(dur / HOUR), unit: '時間' },
        { min: 0, max: 59, value: Math.floor((dur % HOUR) / MIN), unit: '分', pad: true },
      ]);
      if (!r) return;
      const ms = r[0] * HOUR + r[1] * MIN;
      if (ms < MIN) return toast('1分以上にしてください');
      if (ms > MANUAL_MAX_MS) return toast(`1回に記録できるのは ${MANUAL_MAX_MS / HOUR}時間までです`);
      // 開始時刻を決めていたら、開始はそのままで終わりがずれる
      dur = ms;
      render();
    };
    $('[data-material]', root).onclick = async () => {
      const id = await pickMaterial(material, '教材');
      if (id === undefined) return;
      material = id;
      render();
    };
    $('[data-date]', root).onclick = async () => {
      const today = midnight(Date.now());
      const days = Array.from({ length: 14 }, (_, i) => midnight(today - i * DAY + 12 * HOUR));
      const cur = days.indexOf(midnight(range().start));
      const i = await pickList(
        '日付',
        days.map((d, k) => ({ label: k === 0 ? `今日 ${dateLabel(d)}` : k === 1 ? `昨日 ${dateLabel(d)}` : dateLabel(d) })),
        cur,
      );
      if (i === null) return;
      if (i === 0 && fixed === null) return;
      // 開始の時刻はそのままで、日付だけ変える
      const { start } = range();
      fixed = days[i] + (start - midnight(start));
      render();
    };
    $('[data-start]', root).onclick = async () => {
      const { start } = range();
      const d = new Date(start);
      const r = await pickDrums('開始時刻', [
        { min: 0, max: 23, value: d.getHours(), unit: '時' },
        { min: 0, max: 59, value: d.getMinutes(), unit: '分', pad: true },
      ]);
      if (!r) return;
      fixed = midnight(start) + r[0] * HOUR + r[1] * MIN;
      render();
    };
    root.querySelector<HTMLElement>('[data-auto]')?.addEventListener('click', () => {
      fixed = null;
      render();
    });
    root.querySelectorAll<HTMLElement>('[data-save]').forEach((b) => {
      b.onclick = () => {
        const r = range();
        if (r.end > Date.now() + MIN) return toast('まだ来ていない時間です');
        const s = manualSession(r.start, dur, material);
        addSession(s);
        notify();
        close();
        toast(`記録しました（${fmtHM(dur)}・${clock(r.start)}〜${clock(r.end)}）`);
        // 「記録して投稿」なら、投稿の画面を出す（ひとこと・投稿先を選んで投稿）
        if (b.dataset.save === 'post') {
          void openCompose(s).then((ok) => {
            if (!ok) toast('投稿するには、ログインしてグループに入ってください');
          });
        }
      };
    });
  };

  render();
}

/** 手入力の記録を消す（確かめてから） */
export async function confirmRemove(s: Session): Promise<void> {
  const i = await pickList(`${clock(s.start)}〜${clock(s.end)} の記録（${fmtHM(s.studyMs)}）`, [
    { label: 'この記録を消す', danger: true },
  ]);
  if (i !== 0) return;
  removeSession(s.id);
  notify();
  toast('記録を消しました');
}
