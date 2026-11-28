// イベントタブ。「イベント」（毎月のみんなのイベントと今週の目標）・「クエスト」（今日のクエスト）・「お知らせ」。

import { api } from '../cloud/api';
import { JOIN_MS, cachedTotal, claimTiers, liveSeasons, loadTotal, mySeasonMs, tiers, type TierState } from '../events';
import { daysLeftIn, md, type Season } from '../seasons';
import { dateKey } from '../cloud/model';
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

function tierRows(list: TierState[], mine: number): string {
  return list
    .map((t) => {
      const right = t.claimed
        ? '<span class="q-got">受け取り済み</span>'
        : t.ready
          ? `<button type="button" class="q-claim" data-tier="${esc(t.key)}">+${t.reward} 受け取る</button>`
          : t.reached && mine < JOIN_MS
            ? '<span class="q-note">シーズン中に1時間 勉強すると受け取れる</span>'
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

  /** 全員の合計を読み直す（force でなければ、1分以内に読んでいれば読まない） */
  const refreshTotal = (id: string, force = false) => {
    if (!api.user() || loading.has(id)) return;
    const c = cachedTotal(id);
    if (!force && c && Date.now() - c.at < 60_000) return;
    loading.add(id);
    void loadTotal(id)
      .then(() => {
        failed.delete(id);
        if (view.classList.contains('active') && seg === 'event') render();
        document.dispatchEvent(new CustomEvent(GUMI_CHANGE)); // 下のメニューのしるしを直す
      })
      .catch((e) => {
        console.warn('イベントの合計を読めませんでした', e);
        failed.add(id);
        if (view.classList.contains('active') && seg === 'event') render();
      })
      .finally(() => loading.delete(id));
  };

  const ticks = (s: Season, total: number | null) =>
    s.tiers
      .filter((t) => t.h < s.goalH)
      .map((t) => `<i class="ev-tick${total !== null && total >= t.h * HOUR ? ' on' : ''}" style="left:${(t.h / s.goalH) * 100}%"></i>`)
      .join('');

  const eventHtml = (): string => {
    const now = Date.now();
    const { cur, prev } = liveSeasons(now);
    const signed = !!api.user();
    const wk = weekInfo(now);
    const nextWeek = new Date(wk.next);
    const weekly = weeklyQuests(now);
    const weekCard = `
      <section class="sns-card ev-card">
        <div class="ev-card-head"><span>今週の目標</span><span class="head-note">${nextWeek.getMonth() + 1}/${nextWeek.getDate()}（${'日月火水木金土'[nextWeek.getDay()]}）に入れ替わる</span></div>
        ${weekly.map(questRow).join('')}
      </section>`;
    if (!cur) {
      return `<section class="ev-banner"><div class="ev-title">次のシーズンをお楽しみに</div></section>${weekCard}`;
    }
    const c = cachedTotal(cur.id);
    const total = signed ? (c?.total ?? null) : null;
    const mine = mySeasonMs(cur);
    const list = tiers(cur, total, mine);
    const prevList = signed && prev ? tiers(prev, cachedTotal(prev.id)?.total ?? null, mySeasonMs(prev)) : [];
    const today = dateKey(now, settings.dayBoundaryMin);
    const goal = cur.goalH.toLocaleString('ja-JP');
    return `
      <section class="ev-banner">
        <div class="ev-month"><span class="ev-season">${esc(cur.name)}</span><span>${md(cur.start)}〜${md(cur.end)}</span></div>
        <div class="ev-title">みんなで${goal}時間</div>
        ${
          signed
            ? `<div class="ev-bar"><i class="ev-fill" style="width:${total === null ? 0 : pctOf(total, cur.goalH * HOUR)}%"></i>${ticks(cur, total)}</div>
               <div class="ev-nums"><span><b>${total === null ? (failed.has(cur.id) ? '—' : '…') : hours(total)}</b> / ${goal}時間</span><span>あと${daysLeftIn(cur, today)}日</span></div>
               <div class="ev-sub">${
                 failed.has(cur.id) && !c ? '合計を読み込めませんでした（オフラインかも）・' : c ? `参加 ${c.people}人・` : ''
               }あなたのシーズン ${fmtHM(mine)}</div>`
            : `<p class="ev-sub">ログインしている人みんなの、シーズン中の勉強時間を合わせます。ログインすると参加できます</p>
               <button type="button" class="btn primary small" data-login>ログイン・登録</button>`
        }
      </section>
      <section class="sns-card ev-card">
        <div class="ev-card-head"><span>報酬</span><span class="head-note">シーズン中に1時間以上 勉強した人がもらえる</span></div>
        ${tierRows(list, mine)}
      </section>
      ${
        prev && prevList.some((t) => t.ready)
          ? `<section class="sns-card ev-card">
               <div class="ev-card-head"><span>${esc(prev.name)}の結果</span><span class="head-note">受け取り忘れ</span></div>
               ${tierRows(prevList, mySeasonMs(prev))}
             </section>`
          : ''
      }
      ${weekCard}`;
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
        const { cur, prev } = liveSeasons();
        const s = [cur, prev].find((x) => x && key.startsWith(`e:${x.id}:`));
        const got = s ? claimTiers(tiers(s, cachedTotal(s.id)?.total ?? null).filter((t) => t.key === key)) : 0;
        if (got) toast(`+${fmtGumi(got)}グミ（みんなのおかげ！）`);
        render();
      };
    });
  };

  const show = () => {
    render();
    if (seg === 'event' && api.user()) {
      // 先に自分の分を送ってから、全員の合計を読む（送ったときは読み直す）
      const { cur, prev } = liveSeasons();
      void api
        .publishEvent()
        .catch(() => false)
        .then((sent) => {
          if (cur) refreshTotal(cur.id, sent);
          if (prev) refreshTotal(prev.id, sent);
        });
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
