// イベントタブ。「イベント」（毎月のみんなのイベントと今週の目標）・「クエスト」（今日のクエスト）・「お知らせ」。

import { api } from '../cloud/api';
import {
  EVENT_GOAL_H,
  EVENT_TIERS,
  JOIN_MS,
  cachedTotal,
  claimTiers,
  daysLeft,
  loadTotal,
  monthName,
  monthOf,
  myMonthMs,
  prevMonth,
  tiers,
  type Tier,
} from '../events';
import { GUMI_CHANGE, STUDY_BLOCK, STUDY_BONUS, fmtGumi, nextStudyBonusIn } from '../gumi';
import { NEWS, isNewNews, markNewsSeen } from '../news';
import { claimQuest, dailyAllClear, dailyQuests, weekInfo, weeklyQuests, type Quest } from '../quests';
import { settings } from '../store';
import { HOUR, fmtHM, fmtTimeOfDay } from '../time';
import { esc } from '../ui/dom';
import { toast } from '../ui/toast';

type Seg = 'event' | 'quest' | 'news';
let seg: Seg = 'event';

const hours = (ms: number): string => Math.floor(ms / HOUR).toLocaleString('ja-JP');
/** 目標の時間（「1時間」「30分」「1時間30分」。0分は書かない） */
const fmtGoal = (ms: number): string => {
  const m = Math.floor(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ''}` : `${m}分`;
};
const pctOf = (v: number, max: number): number => Math.max(0, Math.min(100, (v / max) * 100));

/** クエスト1行（受け取るボタンつき） */
function questRow(q: { key: string; title: string; reward: number; done: boolean; claimed: boolean; value?: number; target?: number; unit?: 'ms' | 'count' }): string {
  const prog =
    q.value !== undefined && q.target !== undefined
      ? q.unit === 'ms'
        ? `${fmtGoal(Math.min(q.value, q.target))} / ${fmtGoal(q.target)}`
        : `${Math.min(q.value, q.target)} / ${q.target}`
      : '';
  const bar = q.value !== undefined && q.target ? `<span class="q-bar"><i style="width:${pctOf(q.value, q.target)}%"></i></span>` : '';
  const right = q.claimed
    ? '<span class="q-got">受け取り済み</span>'
    : q.done
      ? `<button type="button" class="q-claim" data-claim="${esc(q.key)}">+${q.reward} 受け取る</button>`
      : `<span class="q-reward">+${q.reward}</span>`;
  return `
    <div class="q-row${q.claimed ? ' claimed' : q.done ? ' done' : ''}">
      <span class="q-check" aria-hidden="true">${q.done ? '✓' : ''}</span>
      <span class="q-main">
        <span class="q-title">${esc(q.title)}</span>
        ${bar}${prog ? `<span class="q-prog">${esc(prog)}</span>` : ''}
      </span>
      ${right}
    </div>`;
}

function tierRows(list: Tier[], mine: number): string {
  return list
    .map((t) => {
      const right = t.claimed
        ? '<span class="q-got">受け取り済み</span>'
        : t.ready
          ? `<button type="button" class="q-claim" data-tier="${esc(t.key)}">+${t.reward} 受け取る</button>`
          : t.reached && mine < JOIN_MS
            ? '<span class="q-note">1時間 勉強すると受け取れる</span>'
            : `<span class="q-reward">+${t.reward}</span>`;
      return `
        <div class="q-row${t.claimed ? ' claimed' : t.reached ? ' done' : ''}">
          <span class="q-check" aria-hidden="true">${t.reached ? '✓' : ''}</span>
          <span class="q-main"><span class="q-title">みんなで ${t.h.toLocaleString('ja-JP')}時間</span></span>
          ${right}
        </div>`;
    })
    .join('');
}

export function initEventPage(view: HTMLElement, openLogin: () => void): void {
  const loading = new Set<string>();
  /** 合計を読めなかった月 */
  const failed = new Set<string>();

  /** 全員の合計を読み直す（1分以内に読んでいれば読まない） */
  const refreshTotal = (month: string) => {
    if (!api.user() || loading.has(month)) return;
    const c = cachedTotal(month);
    if (c && Date.now() - c.at < 60_000) return;
    loading.add(month);
    void loadTotal(month)
      .then(() => {
        failed.delete(month);
        if (view.classList.contains('active') && seg === 'event') render();
        document.dispatchEvent(new CustomEvent(GUMI_CHANGE)); // 下のメニューのしるしを直す
      })
      .catch((e) => {
        console.warn('イベントの合計を読めませんでした', e);
        failed.add(month);
        if (view.classList.contains('active') && seg === 'event') render();
      })
      .finally(() => loading.delete(month));
  };

  const eventHtml = (): string => {
    const now = Date.now();
    const month = monthOf(now);
    const last = prevMonth(month);
    const signed = !!api.user();
    const c = cachedTotal(month);
    const total = signed ? (c?.total ?? null) : null;
    const mine = myMonthMs(month);
    const list = tiers(month, total, mine);
    const ticks = EVENT_TIERS.slice(0, -1)
      .map((t) => `<i class="ev-tick${total !== null && total >= t.h * HOUR ? ' on' : ''}" style="left:${(t.h / EVENT_GOAL_H) * 100}%"></i>`)
      .join('');
    const lastList = signed ? tiers(last, cachedTotal(last)?.total ?? null, myMonthMs(last)) : [];
    const lastReady = lastList.filter((t) => t.ready);
    const wk = weekInfo(now);
    const nextWeek = new Date(wk.next);
    const weekly = weeklyQuests(now);
    return `
      <section class="ev-banner">
        <div class="ev-month">${monthName(month)}のみんなのイベント</div>
        <div class="ev-title">みんなで${EVENT_GOAL_H.toLocaleString('ja-JP')}時間</div>
        ${
          signed
            ? `<div class="ev-bar"><i style="width:${total === null ? 0 : pctOf(total, EVENT_GOAL_H * HOUR)}%"></i>${ticks}</div>
               <div class="ev-nums"><span><b>${total === null ? (failed.has(month) ? '—' : '…') : hours(total)}</b> / ${EVENT_GOAL_H.toLocaleString('ja-JP')}時間</span><span>あと${daysLeft(now)}日</span></div>
               <div class="ev-sub">${
                 failed.has(month) && !c ? '合計を読み込めませんでした（オフラインかも）・' : c ? `参加 ${c.people}人・` : ''
               }あなたの${monthName(month)} ${fmtHM(mine)}</div>`
            : `<p class="ev-sub">ログインしている人みんなの、今月の勉強時間を合わせます。ログインすると参加できます</p>
               <button type="button" class="btn primary small" data-login>ログイン・登録</button>`
        }
      </section>
      <section class="sns-card ev-card">
        <div class="ev-card-head"><span>報酬</span><span class="head-note">今月1時間以上 勉強した人がもらえる</span></div>
        ${tierRows(list, mine)}
      </section>
      ${
        lastReady.length
          ? `<section class="sns-card ev-card">
               <div class="ev-card-head"><span>${monthName(last)}のイベント</span><span class="head-note">受け取り忘れ</span></div>
               ${tierRows(lastList, myMonthMs(last))}
             </section>`
          : ''
      }
      <section class="sns-card ev-card">
        <div class="ev-card-head"><span>今週の目標</span><span class="head-note">${nextWeek.getMonth() + 1}/${nextWeek.getDate()}（${'日月火水木金土'[nextWeek.getDay()]}）に入れ替わる</span></div>
        ${weekly.map(questRow).join('')}
      </section>`;
  };

  const questHtml = (): string => {
    const now = Date.now();
    const daily = dailyQuests(now);
    const all = dailyAllClear(now);
    const left = nextStudyBonusIn();
    return `
      <section class="sns-card ev-card">
        <div class="ev-card-head"><span>今日のクエスト</span><span class="head-note">${fmtTimeOfDay(settings.dayBoundaryMin)}に入れ替わる</span></div>
        ${daily.map(questRow).join('')}
        ${questRow({ key: all.key, title: '3つ全部 達成する', reward: all.reward, done: all.done, claimed: all.claimed })}
      </section>
      <section class="sns-card ev-card">
        <div class="ev-card-head"><span>勉強ボーナス</span><span class="head-note">自動でもらえる</span></div>
        <div class="q-row">
          <span class="q-check" aria-hidden="true"></span>
          <span class="q-main">
            <span class="q-title">累計 3時間ごとに ${STUDY_BONUS}グミ</span>
            <span class="q-bar"><i style="width:${pctOf(STUDY_BLOCK - left, STUDY_BLOCK)}%"></i></span>
            <span class="q-prog">次まで あと ${esc(fmtHM(left))}</span>
          </span>
          <span class="q-reward">+${STUDY_BONUS}</span>
        </div>
      </section>
      <p class="settings-foot">グミはショップのグミガチャや交換所で使えます。進み具合はこの端末の記録で数えます</p>`;
  };

  const newsHtml = (): string =>
    NEWS.map(
      (n) => `
      <section class="sns-card news-card">
        <div class="news-head">${isNewNews(n.id) ? '<span class="news-new">NEW</span>' : ''}<span class="news-date">${esc(n.date.replaceAll('-', '/'))}</span></div>
        <div class="news-title">${esc(n.title)}</div>
        <ul class="news-items">${n.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      </section>`,
    ).join('');

  const render = () => {
    view.innerHTML = `
      <h1>イベント</h1>
      <div class="sns-seg event-seg" role="group">
        <button type="button" data-seg="event" aria-pressed="${seg === 'event'}">イベント</button>
        <button type="button" data-seg="quest" aria-pressed="${seg === 'quest'}">クエスト</button>
        <button type="button" data-seg="news" aria-pressed="${seg === 'news'}">お知らせ</button>
      </div>
      <div class="event-body">${seg === 'event' ? eventHtml() : seg === 'quest' ? questHtml() : newsHtml()}</div>`;
    view.querySelectorAll<HTMLElement>('[data-seg]').forEach((b) => {
      b.onclick = () => {
        seg = b.dataset.seg as Seg;
        show();
      };
    });
    view.querySelector<HTMLElement>('[data-login]')?.addEventListener('click', openLogin);
    view.querySelectorAll<HTMLElement>('[data-claim]').forEach((b) => {
      b.onclick = () => {
        const now = Date.now();
        const all = dailyAllClear(now);
        const list: (Quest | typeof all)[] = [...dailyQuests(now), ...weeklyQuests(now), all];
        const q = list.find((x) => x.key === b.dataset.claim);
        if (q && claimQuest(q)) toast(`+${q.reward}グミ`);
        render();
      };
    });
    view.querySelectorAll<HTMLElement>('[data-tier]').forEach((b) => {
      b.onclick = () => {
        const key = b.dataset.tier!;
        const month = key.split(':')[1];
        const got = claimTiers(tiers(month, cachedTotal(month)?.total ?? null).filter((t) => t.key === key));
        if (got) toast(`+${fmtGumi(got)}グミ（みんなのおかげ！）`);
        render();
      };
    });
  };

  const show = () => {
    render();
    if (seg === 'event') {
      const m = monthOf();
      refreshTotal(m);
      refreshTotal(prevMonth(m));
    }
    if (seg === 'news') {
      markNewsSeen();
      document.dispatchEvent(new CustomEvent(GUMI_CHANGE));
    }
  };

  document.addEventListener('event:show', show);
  // 記録が増えたとき・グミが変わったときに、開いていれば描き直す
  document.addEventListener(GUMI_CHANGE, () => {
    if (view.classList.contains('active')) render();
  });
  render();
}

/** 開いたときにお知らせを見るように、最初の区切りを選ぶ */
export function openEventSeg(next: Seg): void {
  seg = next;
}
