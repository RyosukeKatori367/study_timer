// 予定の追加・編集と、まとめて登録（講座や問題集を曜日に割り振る）。

import { PLAN_TEXT_MAX, bulkPlans, bulkSchedule, dateOf, newPlanId, type BulkInput, type Plan } from '../plans';
import { deletePlans, livePlans, planById, putPlans, todayKey } from '../planbook';
import { materialName, nextLapNumber, settings } from '../store';
import { HOUR, MIN, fmtHM } from '../time';
import { range, unitFor } from '../units';
import { $, esc, html } from '../ui/dom';
import { pickDrums, pickList } from '../ui/sheet';
import { toast } from '../ui/toast';
import { materialThumb, pickMaterial } from './material';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
export const dayLabel = (key: string): string => {
  const d = dateOf(key);
  return `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
};
const shortDay = (key: string): string => {
  const d = dateOf(key);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
};
const atValue = (min: number | undefined) => (min === undefined ? '' : `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);
const parseAt = (v: string): number | undefined => {
  const m = /^(\d{1,2}):(\d{2})/.exec(v);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
};
const posInt = (v: string): number | undefined => {
  const n = Math.floor(Number(v));
  return v.trim() && Number.isFinite(n) && n >= 1 && n <= 99999 ? n : undefined;
};

function fullpage(id: string, label: string): { root: HTMLElement; close: () => void } {
  document.getElementById(id)?.remove();
  const root = html(`<div id="${id}" class="fullpage" role="dialog" aria-modal="true" aria-label="${esc(label)}"></div>`);
  document.getElementById('app')!.append(root);
  return { root, close: () => root.remove() };
}

/** 予定を追加する（day の日に）・編集する（id） */
export function openPlanEdit(opts: { id?: string; day?: string } = {}): void {
  const old = opts.id ? planById(opts.id) : undefined;
  const { root, close } = fullpage('plan-edit', old ? '予定を編集' : '予定を追加');
  const draft: Plan = old ? { ...old } : { id: newPlanId(), d: opts.day ?? todayKey(), t: '', u: 0 };

  const read = () => {
    // 入力欄の値を下書きに入れる
    draft.t = $<HTMLInputElement>('[data-f=t]', root).value.trim().slice(0, PLAN_TEXT_MAX);
    const d = $<HTMLInputElement>('[data-f=d]', root).value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) draft.d = d;
    const at = parseAt($<HTMLInputElement>('[data-f=at]', root).value);
    if (at === undefined) delete draft.at;
    else draft.at = at;
    const fa = root.querySelector<HTMLInputElement>('[data-f=a]');
    const fb = root.querySelector<HTMLInputElement>('[data-f=b]');
    if (fa && fb) {
      const a = posInt(fa.value);
      const b = posInt(fb.value);
      if (b !== undefined) {
        draft.b = b;
        draft.a = a !== undefined && a <= b ? a : b;
      } else {
        delete draft.a;
        delete draft.b;
      }
    }
  };

  const render = () => {
    const u = unitFor(draft.m ?? null);
    root.innerHTML = `
      <div class="sns">
        <div class="sns-head">
          <button type="button" class="sns-back" data-close aria-label="閉じる">×</button>
          <div class="sns-head-title">${old ? '予定を編集' : '予定を追加'}</div>
          <span class="sns-head-side"></span>
        </div>
        <label class="field">
          <span class="field-label">やること（教材を選べば、なくてもいい）</span>
          <input class="input" data-f="t" maxlength="${PLAN_TEXT_MAX}" placeholder="例：単語帳 50語、学校のプリント" value="${esc(draft.t)}">
        </label>
        <div class="sns-card">
          <button type="button" class="sns-row" data-material>
            <span class="sns-row-main">教材</span>
            <span class="sns-row-end">${draft.m ? materialThumb(draft.m, 24) : ''}<span>${draft.m ? esc(materialName(draft.m)) : 'なし'}</span><span class="chevron">›</span></span>
          </button>
          ${
            draft.m
              ? `<div class="sns-row pe-range">
                   <span class="sns-row-main">範囲</span>
                   <span class="pe-range-in">${esc(u.pre)}<input class="input mini" data-f="a" inputmode="numeric" pattern="[0-9]*" value="${draft.a ?? nextLapNumber(draft.m)}" aria-label="範囲のはじめ">〜<input class="input mini" data-f="b" inputmode="numeric" pattern="[0-9]*" value="${draft.b ?? ''}" placeholder="—" aria-label="範囲の終わり">${esc(u.suf)}</span>
                 </div>
                 <button type="button" class="sns-row" data-ms>
                   <span class="sns-row-main">目標時間<small class="sns-row-sub">その日にこの教材を勉強したら、自動で済み</small></span>
                   <span class="sns-row-end"><span>${draft.ms ? fmtHM(draft.ms) : 'なし'}</span><span class="chevron">›</span></span>
                 </button>`
              : ''
          }
        </div>
        ${draft.m ? `<p class="field-note plan-note">範囲の終わりまで記録する（次の番号が範囲を越える）と、自動で済みになります</p>` : ''}
        <div class="sns-card">
          <label class="sns-row">
            <span class="sns-row-main">日付</span>
            <input class="plan-date" type="date" data-f="d" value="${esc(draft.d)}">
          </label>
          <div class="sns-row">
            <span class="sns-row-main">時刻<small class="sns-row-sub">なくてもいい。iPhoneのカレンダーに入れると、この時刻に通知</small></span>
            <input class="plan-date" type="time" data-f="at" value="${atValue(draft.at)}">
            ${draft.at !== undefined ? '<button type="button" class="plan-clear" data-at-clear aria-label="時刻をなしにする">×</button>' : ''}
          </div>
        </div>
        <button type="button" class="btn primary" data-save>${old ? '保存する' : '追加する'}</button>
        ${old ? '<button type="button" class="btn dark danger-text" data-del>この予定を消す</button>' : ''}
        ${!old ? '<button type="button" class="btn ghost small" data-bulk>講座や問題集をまとめて登録する</button>' : ''}
      </div>`;

    $('[data-close]', root).onclick = close;
    $('[data-material]', root).onclick = async () => {
      read();
      const id = await pickMaterial(draft.m ?? null, '教材', '選ぶと、範囲や目標時間で自動で済みにできます');
      if (id === undefined) return;
      if (id) draft.m = id;
      else delete draft.m;
      if (id !== old?.m) {
        delete draft.a;
        delete draft.b;
      }
      render();
    };
    root.querySelector<HTMLElement>('[data-ms]')?.addEventListener('click', async () => {
      read();
      const cur = draft.ms ?? 0;
      const r = await pickDrums('目標時間（0でなし）', [
        { min: 0, max: 12, value: Math.floor(cur / HOUR), unit: '時間' },
        { min: 0, max: 59, value: Math.floor((cur % HOUR) / MIN), unit: '分', pad: true },
      ]);
      if (!r) return;
      const ms = r[0] * HOUR + r[1] * MIN;
      if (ms >= MIN) draft.ms = ms;
      else delete draft.ms;
      render();
    });
    root.querySelector<HTMLElement>('[data-at-clear]')?.addEventListener('click', () => {
      read();
      delete draft.at;
      render();
    });
    root.querySelector<HTMLElement>('[data-bulk]')?.addEventListener('click', () => {
      read();
      close();
      openPlanBulk(draft.d, draft.m);
    });
    root.querySelector<HTMLElement>('[data-del]')?.addEventListener('click', async () => {
      if (!old) return;
      const later = old.g ? livePlans().filter((p) => p.g === old.g && p.d >= old.d) : [];
      const items = [{ label: 'この予定を消す', danger: true }];
      if (later.length > 1) items.push({ label: `まとめて登録した、この日から先の予定も消す（${later.length}件）`, danger: true });
      const i = await pickList(planTitleShort(old), items);
      if (i === null) return;
      deletePlans(i === 1 ? later.map((p) => p.id) : [old.id]);
      close();
      toast(i === 1 ? `${later.length}件の予定を消しました` : '予定を消しました');
    });
    $('[data-save]', root).onclick = () => {
      read();
      if (!draft.t && !draft.m) return toast('やることを書くか、教材を選んでください');
      putPlans([draft]);
      close();
      toast(old ? '保存しました' : `${shortDay(draft.d)}に追加しました`);
    };
  };
  render();
}

const planTitleShort = (p: Plan): string => {
  const name = p.t || (p.m ? materialName(p.m) : '予定');
  return p.m && p.b !== undefined ? `${name} ${range(p.a ?? p.b, p.b, unitFor(p.m))}` : name;
};

/** まとめて登録（講座・問題集を、決めた曜日に割り振る） */
export function openPlanBulk(day?: string, material?: string): void {
  const { root, close } = fullpage('plan-bulk', 'まとめて登録');
  const first = settings.weekStartsOn;
  const x: BulkInput = {
    m: material ?? '',
    from: material ? nextLapNumber(material) : 1,
    to: 0,
    perDay: 1,
    weekdays: [1, 2, 3, 4, 5],
    start: day ?? todayKey(),
  };
  x.to = x.from + 9;

  const read = () => {
    const a = posInt($<HTMLInputElement>('[data-f=a]', root).value);
    const b = posInt($<HTMLInputElement>('[data-f=b]', root).value);
    if (a !== undefined) x.from = a;
    if (b !== undefined) x.to = b;
    const d = $<HTMLInputElement>('[data-f=d]', root).value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) x.start = d;
    x.at = parseAt($<HTMLInputElement>('[data-f=at]', root).value);
  };

  const render = () => {
    const u = unitFor(x.m || null);
    const days = x.m ? bulkSchedule(x) : [];
    const order = Array.from({ length: 7 }, (_, i) => (first + i) % 7);
    const preview = days.length
      ? `<div class="bulk-preview">
           <div class="bulk-sum">全${days.length}日・${shortDay(days[0].d)}〜${shortDay(days[days.length - 1].d)}</div>
           ${days
             .slice(0, 4)
             .map((s) => `<div class="bulk-row"><span>${shortDay(s.d)}</span><span>${esc(range(s.a, s.b, u))}</span></div>`)
             .join('')}
           ${days.length > 4 ? `<div class="bulk-row more"><span>…</span><span>${esc(range(days.at(-1)!.a, days.at(-1)!.b, u))}</span></div>` : ''}
         </div>`
      : `<p class="sns-lead">${x.m ? '範囲と曜日を決めてください' : '教材を選んでください'}</p>`;
    root.innerHTML = `
      <div class="sns">
        <div class="sns-head">
          <button type="button" class="sns-back" data-close aria-label="閉じる">×</button>
          <div class="sns-head-title">まとめて登録</div>
          <span class="sns-head-side"></span>
        </div>
        <p class="sns-lead">映像授業の講座や問題集を、決めた曜日に順番に割り振ります。記録して番号が進むと、自動で済みになります</p>
        <div class="sns-card">
          <button type="button" class="sns-row" data-material>
            <span class="sns-row-main">教材</span>
            <span class="sns-row-end">${x.m ? materialThumb(x.m, 24) : ''}<span>${x.m ? esc(materialName(x.m)) : '選ぶ'}</span><span class="chevron">›</span></span>
          </button>
          <div class="sns-row pe-range">
            <span class="sns-row-main">範囲</span>
            <span class="pe-range-in">${esc(u.pre)}<input class="input mini" data-f="a" inputmode="numeric" pattern="[0-9]*" value="${x.from}" aria-label="はじめ">〜<input class="input mini" data-f="b" inputmode="numeric" pattern="[0-9]*" value="${x.to}" aria-label="終わり">${esc(u.suf)}</span>
          </div>
          <div class="sns-row">
            <span class="sns-row-main">1日に</span>
            <span class="pe-stepper"><button type="button" data-per="-1" aria-label="減らす">−</button><b>${x.perDay}${esc(u.cnt)}</b><button type="button" data-per="1" aria-label="増やす">＋</button></span>
          </div>
        </div>
        <div class="field">
          <span class="field-label">やる曜日</span>
          <div class="wd-chips" role="group" aria-label="やる曜日">${order
            .map((w) => `<button type="button" data-wd="${w}" aria-pressed="${x.weekdays.includes(w)}">${WEEKDAYS[w]}</button>`)
            .join('')}</div>
        </div>
        <div class="sns-card">
          <label class="sns-row">
            <span class="sns-row-main">始める日</span>
            <input class="plan-date" type="date" data-f="d" value="${esc(x.start)}">
          </label>
          <div class="sns-row">
            <span class="sns-row-main">時刻<small class="sns-row-sub">なくてもいい</small></span>
            <input class="plan-date" type="time" data-f="at" value="${atValue(x.at)}">
          </div>
        </div>
        ${preview}
        <button type="button" class="btn primary" data-save ${days.length ? '' : 'disabled'}>${days.length ? `${days.length}日分を登録する` : '登録する'}</button>
      </div>`;

    $('[data-close]', root).onclick = close;
    $('[data-material]', root).onclick = async () => {
      read();
      const id = await pickMaterial(x.m || null, '教材');
      if (!id) return;
      if (id !== x.m) {
        x.m = id;
        x.from = nextLapNumber(id);
        x.to = x.from + 9;
      }
      render();
    };
    root.querySelectorAll<HTMLElement>('[data-per]').forEach((b) => {
      b.onclick = () => {
        read();
        x.perDay = Math.max(1, Math.min(20, x.perDay + Number(b.dataset.per)));
        render();
      };
    });
    root.querySelectorAll<HTMLElement>('[data-wd]').forEach((b) => {
      b.onclick = () => {
        read();
        const w = Number(b.dataset.wd);
        x.weekdays = x.weekdays.includes(w) ? x.weekdays.filter((v) => v !== w) : [...x.weekdays, w];
        render();
      };
    });
    // 数字や日付を変えたら、割り振りを出し直す
    root.querySelectorAll<HTMLInputElement>('[data-f]').forEach((i) => {
      i.onchange = () => {
        read();
        render();
      };
    });
    $('[data-save]', root).onclick = () => {
      read();
      if (!x.m) return toast('教材を選んでください');
      if (x.to < x.from) return toast('範囲の終わりは、はじめより後にしてください');
      const list = bulkPlans(x);
      if (!list.length) return toast('やる曜日を選んでください');
      putPlans(list);
      close();
      toast(`${list.length}日分の予定を登録しました（${shortDay(list[0].d)}〜${shortDay(list.at(-1)!.d)}）`);
    };
  };
  render();
}

