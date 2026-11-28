// ホーム（下のメニューの4つ目。中の名前は event のまま）。
// ウィジェットを並べる：ログインボーナス・今日のやること・今日の勉強・今日のクエスト・シーズン・今週の目標・お知らせ。
// 「編集」で並べ替えと、出す・出さないを決める（settings.homeOrder・homeHidden）。
// シーズンの箱を押すと、報酬・貢献度ランキング・期間限定ガチャ・シーズンの説明が開く。今週の箱を押すと、今週の目標と日曜ボーナスが開く。

import { api } from '../cloud/api';
import { JOIN_MS, cachedTotal, claimTiers, liveSeasons, loadTotal, mySeasonMs, tiers, type TierState } from '../events';
import { daysLeftIn, md, type Season } from '../seasons';
import { emblemSvg, introUnseen, playSeasonIntro } from './season-intro';
import { dateKey } from '../cloud/model';
import { GUMI_CHANGE, STUDY_BLOCK, STUDY_BONUS, fmtGumi, nextStudyBonusIn } from '../gumi';
import { NEWS, isNewNews, markNewsSeen } from '../news';
import { claimQuest, dailyAllClear, dailyQuests, sundayBonus, weekInfo, weeklyQuests, type Quest } from '../quests';
import { getSessions, saveSettings, settings } from '../store';
import { summarize } from '../summary';
import { PLANS_CHANGE, dayPlans, leftovers, todayKey } from '../planbook';
import { bindPlanRows, planRow } from './calendar';
import { openCalendarAt } from './stats';
import { SHOW_VIEW } from './group';
import { HANDLE, bindDrag } from '../ui/drag';
import { html } from '../ui/dom';
import type { RankEntry } from '../cloud/events';
import { tagById, tagHtml } from '../tags';
import { avatar } from './group/ui';
import { bindLoginCard, loginCardHtml } from './login-card';
import { bindLimitedEntries, limitedEntry } from './limited';
import { HOUR, fmtHM, fmtTimeOfDay } from '../time';
import { esc } from '../ui/dom';
import { toast } from '../ui/toast';

/** ホームのウィジェット（並びのはじめ） */
const WIDGETS = [
  { id: 'login', name: 'ログインボーナス' },
  { id: 'todo', name: '今日のやること' },
  { id: 'stats', name: '今日の勉強' },
  { id: 'quest', name: '今日のクエスト' },
  { id: 'season', name: 'シーズン（みんなのイベント）' },
  { id: 'week', name: '今週の目標' },
  { id: 'news', name: 'お知らせ' },
] as const;
type WidgetId = (typeof WIDGETS)[number]['id'];

/** 今の並び（知らないものは捨て、足りないものは後ろに） */
function widgetOrder(): WidgetId[] {
  const known = new Set<string>(WIDGETS.map((w) => w.id));
  const saved = settings.homeOrder.filter((id): id is WidgetId => known.has(id));
  return [...new Set([...saved, ...WIDGETS.map((w) => w.id)])];
}

/** 並べ替え中 */
let editing = false;
/** シーズンと今週の箱を開いているか */
const boxOpen = { season: false, week: false, daily: false };

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

  /** 全員の合計を読み直す（force でなければ、1分以内に読んでいれば読まない） */
  const refreshTotal = (id: string, force = false) => {
    if (!api.user() || loading.has(id)) return;
    const c = cachedTotal(id);
    if (!force && c && Date.now() - c.at < 60_000) return;
    loading.add(id);
    void loadTotal(id)
      .then(() => {
        failed.delete(id);
        if (view.classList.contains('active')) render();
        document.dispatchEvent(new CustomEvent(GUMI_CHANGE)); // 下のメニューのしるしを直す
      })
      .catch((e) => {
        console.warn('イベントの合計を読めませんでした', e);
        failed.add(id);
        if (view.classList.contains('active')) render();
      })
      .finally(() => loading.delete(id));
  };

  const ticks = (s: Season, total: number | null) =>
    s.tiers
      .filter((t) => t.h < s.goalH)
      .map((t) => `<i class="ev-tick${total !== null && total >= t.h * HOUR ? ' on' : ''}" style="left:${(t.h / s.goalH) * 100}%"></i>`)
      .join('');

  /** 貢献度ランキング（シーズンごと。2分以内に読んだものはそのまま使う） */
  const ranks = new Map<string, { at: number; data: Awaited<ReturnType<typeof api.eventRanking>> | null }>();
  const loadRanking = (id: string, force = false) => {
    if (!api.user()) return;
    const c = ranks.get(id);
    if (c && !force && (c.data === null || Date.now() - c.at < 120_000)) return;
    ranks.set(id, { at: Date.now(), data: c?.data ?? null });
    void api
      .eventRanking(id)
      .then((data) => {
        ranks.set(id, { at: Date.now(), data });
        if (view.classList.contains('active')) render();
      })
      .catch((e) => console.warn('ランキングを読めませんでした', e));
  };

  const rankRow = (rank: number, e: RankEntry | null, ms: number, mine: boolean) => {
    const t = e?.tag ? tagById(e.tag) : undefined;
    return `
      <div class="rk-row${mine ? ' me' : ''}">
        <span class="rk-no${rank <= 3 ? ` top${rank}` : ''}">${rank}</span>
        ${e?.name && e.icon ? avatar(e.icon, 30) : '<span class="av anon" style="--s:30px" aria-hidden="true"><span>？</span></span>'}
        <span class="rk-name">${e?.name ? esc(e.name) : 'ひみつの参加者'}${t ? tagHtml(t) : ''}${mine ? '<small>あなた</small>' : ''}</span>
        <span class="rk-ms">${esc(fmtHM(ms))}</span>
      </div>`;
  };

  const rankingCard = (s: Season): string => {
    const c = ranks.get(s.id);
    const uid = api.user()?.uid;
    const d = c?.data;
    const body = !d
      ? '<p class="sns-lead">読み込んでいます…</p>'
      : d.top.length === 0
        ? '<p class="sns-lead">まだだれもいません。1時間 勉強して参加しよう</p>'
        : d.top.map((e, i) => rankRow(i + 1, e, e.ms, e.uid === uid)).join('') +
          (d.me && d.me.rank > d.top.length
            ? `<div class="rk-gap">…</div>${rankRow(d.me.rank, null, d.me.ms, true).replace('ひみつの参加者', 'あなた').replace('<small>あなた</small>', '')}`
            : '');
    return `
      <section class="sns-card ev-card">
        <div class="ev-card-head"><span>貢献度ランキング</span><span class="head-note">シーズン中の勉強時間</span></div>
        <div class="rk-list">${body}</div>
        <button type="button" class="row rk-opt" role="switch" aria-checked="${settings.eventName}" data-rkname>
          <span class="row-label">ランキングに名前を出す<small class="rk-sub">出さないと「ひみつの参加者」と出ます</small></span>
          <span class="switch" aria-hidden="true"></span>
        </button>
      </section>`;
  };

  /** 今週の目標の箱（日曜ボーナスもここ） */
  const weekBox = (now: number): string => {
    const wk = weekInfo(now);
    const nextWeek = new Date(wk.next);
    const weekly = weeklyQuests(now);
    const sun = sundayBonus(now);
    const ready = weekly.filter((q) => q.done && !q.claimed).length + (sun.done && !sun.claimed ? 1 : 0);
    const done = weekly.filter((q) => q.done).length;
    const open = boxOpen.week;
    const sunRow = sun.today
      ? questRow({ key: sun.key, title: '日曜ボーナス：1時間 勉強する', reward: sun.reward, done: sun.done, claimed: sun.claimed, value: sun.value, target: sun.target, unit: 'ms' })
      : `<div class="q-row later">
           <span class="q-check" aria-hidden="true"></span>
           <span class="q-main"><span class="q-title">日曜ボーナス（${md(sun.day)}）</span><span class="q-prog">日曜日に1時間 勉強すると もらえる</span></span>
           <span class="q-reward">+${sun.reward}</span>
         </div>`;
    return `
      <section class="sns-card ev-card ev-box week-box${open ? ' open' : ''}">
        <div class="ev-box-head" role="button" tabindex="0" aria-expanded="${open}" data-box="week">
          <span class="ev-box-title">今週の目標${ready ? '<i class="box-dot" aria-label="受け取れるものがあります"></i>' : ''}</span>
          <span class="head-note">${done}/${weekly.length} 達成${sun.today && !sun.claimed ? '・日曜ボーナス' : ''}</span>
          <span class="sec-chev" aria-hidden="true">›</span>
        </div>
        ${
          open
            ? `<div class="ev-box-body">
                 <div class="box-note">${nextWeek.getMonth() + 1}/${nextWeek.getDate()}（${'日月火水木金土'[nextWeek.getDay()]}）に入れ替わる</div>
                 ${weekly.map(questRow).join('')}
                 ${sunRow}
               </div>`
            : ''
        }
      </section>`;
  };

  /** シーズンの箱（開くと報酬・ランキング・限定ガチャ・説明）と、前のシーズンの受け取り忘れ */
  const seasonWidget = (): string => {
    const now = Date.now();
    const { cur, prev } = liveSeasons(now);
    const signed = !!api.user();
    if (!cur) return '<section class="ev-banner"><div class="ev-title">次のシーズンをお楽しみに</div></section>';
    const c = cachedTotal(cur.id);
    const total = signed ? (c?.total ?? null) : null;
    const mine = mySeasonMs(cur);
    const list = tiers(cur, total, mine);
    const prevList = signed && prev ? tiers(prev, cachedTotal(prev.id)?.total ?? null, mySeasonMs(prev)) : [];
    const today = dateKey(now, settings.dayBoundaryMin);
    const goal = cur.goalH.toLocaleString('ja-JP');
    const open = boxOpen.season;
    const ready = list.some((t) => t.ready);
    return `
      <section class="ev-banner ev-box season-box${cur.look ? ` season-${esc(cur.look)}` : ''}${open ? ' open' : ''}">
        <div class="ev-box-head" role="button" tabindex="0" aria-expanded="${open}" data-box="season">
          ${cur.title ? `<span class="ev-emblem">${emblemSvg(96, cur.look)}</span>` : ''}
          <div class="ev-month"><span class="ev-season">${esc(cur.name)}</span><span>${md(cur.start)}〜${md(cur.end)}</span></div>
          ${
            cur.title
              ? `<div class="ev-season-title">${esc(cur.title)}</div><div class="ev-goal">みんなで${goal}時間</div>`
              : `<div class="ev-title">みんなで${goal}時間</div>`
          }
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
          <div class="ev-more">${ready ? '<i class="box-dot"></i>' : ''}${open ? 'とじる' : '報酬・ランキング・限定ガチャ'}<span class="sec-chev" aria-hidden="true">›</span></div>
        </div>
      </section>
      ${
        open
          ? `<div class="ev-box-body season-body">
               <section class="sns-card ev-card">
                 <div class="ev-card-head"><span>報酬</span><span class="head-note">シーズン中に1時間以上 勉強した人がもらえる</span></div>
                 ${tierRows(list, mine)}
               </section>
               ${signed ? rankingCard(cur) : ''}
               ${limitedEntry()}
               <section class="sns-card ev-card season-about">
                 <div class="ev-card-head"><span>シーズンについて</span></div>
                 <p class="sns-lead">ログインしている人みんなの、${md(cur.start)}〜${md(cur.end)}の勉強時間を合わせて、目標をめざします。報酬は、シーズン中に1時間以上 勉強した人が受け取れます。受け取り忘れは、次のシーズンのあいだなら受け取れます</p>
                 <button type="button" class="btn dark small" data-intro>シーズンのはじまりをもう一度見る</button>
               </section>
             </div>`
          : ''
      }
      ${
        prev && prevList.some((t) => t.ready)
          ? `<section class="sns-card ev-card">
               <div class="ev-card-head"><span>${esc(prev.name)}の結果</span><span class="head-note">受け取り忘れ</span></div>
               ${tierRows(prevList, mySeasonMs(prev))}
             </section>`
          : ''
      }`;
  };

  /** 今日のクエストの箱（開くと3つと全部達成、勉強ボーナスの次まで） */
  const questWidget = (): string => {
    const now = Date.now();
    const daily = dailyQuests(now);
    const all = dailyAllClear(now);
    const left = nextStudyBonusIn();
    const open = boxOpen.daily;
    const ready = daily.filter((q) => q.done && !q.claimed).length + (all.done && !all.claimed ? 1 : 0);
    const done = daily.filter((q) => q.done).length;
    return `
      <section class="sns-card ev-card ev-box home-quest${open ? ' open' : ''}">
        <div class="ev-box-head" role="button" tabindex="0" aria-expanded="${open}" data-box="daily">
          <span class="ev-box-title">今日のクエスト${ready ? '<i class="box-dot" aria-label="受け取れるものがあります"></i>' : ''}</span>
          <span class="head-note">${done}/${daily.length} 達成${all.claimed ? '・全部クリア' : ''}</span>
          <span class="sec-chev" aria-hidden="true">›</span>
        </div>
        ${
          open
            ? `<div class="ev-box-body">
        <div class="box-note">${fmtTimeOfDay(settings.dayBoundaryMin)}に入れ替わる</div>
        ${daily.map(questRow).join('')}
        ${questRow({ key: all.key, title: '3つ全部 達成する', reward: all.reward, done: all.done, claimed: all.claimed })}
        <div class="q-row bonus-row">
          <span class="q-check" aria-hidden="true"></span>
          <span class="q-main">
            <span class="q-title">勉強ボーナス（累計3時間ごとに自動で ${STUDY_BONUS}）</span>
            <span class="q-bar"><i style="width:${pctOf(STUDY_BLOCK - left, STUDY_BLOCK)}%"></i></span>
            <span class="q-prog">次まで あと ${esc(fmtHM(left))}</span>
          </span>
          <span class="q-reward">+${STUDY_BONUS}</span>
        </div>
               </div>`
            : ''
        }
      </section>`;
  };

  /** 今日のやること（カレンダーの今日の予定と、過ぎた日の残り） */
  const todoWidget = (): string => {
    const today = todayKey();
    const list = dayPlans(today);
    const left = leftovers(today);
    const shown = left.slice(0, 4);
    return `
      <section class="sns-card ev-card home-todo">
        <div class="ev-card-head"><span>今日のやること</span><button type="button" class="head-link" data-open-cal>カレンダー<span class="chevron">›</span></button></div>
        ${list.map((p) => planRow(p, { today })).join('')}
        ${shown.map((p) => planRow(p, { today, showDate: true })).join('')}
        ${left.length > shown.length ? `<button type="button" class="home-more" data-open-cal>ほかに残りが${left.length - shown.length}件</button>` : ''}
        ${list.length + left.length === 0 ? '<p class="cal-empty">今日の予定はありません。カレンダーで予定を立てると、ここに出ます</p>' : ''}
        <div class="home-todo-foot"><button type="button" class="btn dark small" data-plan-add="${today}">＋ 予定を追加</button></div>
      </section>`;
  };

  /** 今日の勉強（今日・今週と、目標の進み具合）。押すと統計へ */
  const statsWidget = (): string => {
    const s = summarize(getSessions(), Date.now(), { boundaryMin: settings.dayBoundaryMin, weekStartsOn: settings.weekStartsOn });
    const goal = settings.dailyGoalMs;
    return `
      <button type="button" class="sns-card ev-card home-stats" data-open-stats>
        <span class="ev-card-head"><span>今日の勉強</span><span class="head-note">統計<span class="chevron">›</span></span></span>
        <span class="home-stats-nums">
          <span><small>今日</small><b>${esc(fmtHM(s.todayMs))}</b></span>
          <span><small>今週</small><b>${esc(fmtHM(s.weekMs))}</b></span>
        </span>
        ${
          goal > 0
            ? `<span class="home-goal${s.todayMs >= goal ? ' done' : ''}"><span class="q-bar"><i style="width:${pctOf(s.todayMs, goal)}%"></i></span><small>${
                s.todayMs >= goal ? '今日の目標 達成' : `目標 ${fmtHM(goal)}まで あと${fmtHM(goal - s.todayMs)}`
              }</small></span>`
            : ''
        }
      </button>`;
  };

  /** お知らせ（いちばん新しいもの） */
  const newsWidget = (): string => {
    const n = NEWS[0];
    if (!n) return '';
    const fresh = NEWS.filter((x) => isNewNews(x.id)).length;
    return `
      <section class="sns-card ev-card home-news">
        <div class="ev-card-head"><span>お知らせ${fresh ? '<i class="box-dot" aria-label="新しいお知らせがあります"></i>' : ''}</span><button type="button" class="head-link" data-open-news>すべて<span class="chevron">›</span></button></div>
        <button type="button" class="home-news-item" data-open-news>
          <span class="news-head">${isNewNews(n.id) ? '<span class="news-new">NEW</span>' : ''}<span class="news-date">${esc(n.date.replaceAll('-', '/'))}</span>${fresh > 1 ? `<span class="news-date">ほか${fresh - 1}件</span>` : ''}</span>
          <span class="news-title">${esc(n.title)}</span>
        </button>
      </section>`;
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

  /** お知らせの一覧（全画面） */
  const openNews = () => {
    document.getElementById('news-page')?.remove();
    const root = html(`
      <div id="news-page" class="fullpage" role="dialog" aria-modal="true" aria-label="お知らせ">
        <div class="sns">
          <div class="sns-head">
            <button type="button" class="sns-back" data-close aria-label="閉じる">×</button>
            <div class="sns-head-title">お知らせ</div>
            <span class="sns-head-side"></span>
          </div>
          ${newsHtml()}
        </div>
      </div>`);
    document.getElementById('app')!.append(root);
    root.querySelector<HTMLElement>('[data-close]')!.onclick = () => {
      root.remove();
      render();
    };
    markNewsSeen();
    document.dispatchEvent(new CustomEvent(GUMI_CHANGE));
  };

  const widgetHtml = (id: WidgetId): string => {
    switch (id) {
      case 'login':
        return loginCardHtml();
      case 'todo':
        return todoWidget();
      case 'stats':
        return statsWidget();
      case 'quest':
        return questWidget();
      case 'season':
        return seasonWidget();
      case 'week':
        return weekBox(Date.now());
      case 'news':
        return newsWidget();
    }
  };

  /** 編集（並べ替えと、出す・出さない） */
  const editHtml = (): string => {
    const hidden = new Set(settings.homeHidden);
    return `
      <div class="home-head"><h1>ホーム</h1><button type="button" class="home-edit" data-home-done>完了</button></div>
      <p class="sns-lead">≡ をつかんで並べ替え、スイッチで出す・出さないを決めます</p>
      <section class="sns-card home-sort">
        ${widgetOrder()
          .map((id) => {
            const w = WIDGETS.find((x) => x.id === id)!;
            const on = !hidden.has(id);
            return `
              <div class="sort-row home-sort-row" data-id="${id}">
                <button type="button" class="home-sort-main" role="switch" aria-checked="${on}" data-home-toggle="${id}">
                  <span class="switch" aria-hidden="true"></span><span>${esc(w.name)}</span>
                </button>
                <span class="sort-handle" role="button" aria-label="${esc(w.name)}を動かす">${HANDLE}</span>
              </div>`;
          })
          .join('')}
      </section>
      <button type="button" class="btn ghost small" data-home-reset>はじめの並びにもどす</button>`;
  };

  const render = () => {
    // 描き直しても、見ている位置はそのまま
    const y = view.scrollTop;
    renderInner();
    view.scrollTop = y;
  };

  const renderInner = () => {
    if (editing) {
      view.innerHTML = editHtml();
      view.querySelector<HTMLElement>('[data-home-done]')!.onclick = () => {
        editing = false;
        render();
        show();
      };
      view.querySelectorAll<HTMLElement>('[data-home-toggle]').forEach((b) => {
        b.onclick = () => {
          const id = b.dataset.homeToggle!;
          const hidden = new Set(settings.homeHidden);
          if (hidden.has(id)) hidden.delete(id);
          else hidden.add(id);
          saveSettings({ homeHidden: [...hidden] });
          render();
        };
      });
      view.querySelectorAll<HTMLElement>('.sort-handle').forEach((h) =>
        bindDrag(h, () => saveSettings({ homeOrder: [...view.querySelectorAll<HTMLElement>('.home-sort-row')].map((r) => r.dataset.id!) })),
      );
      view.querySelector<HTMLElement>('[data-home-reset]')!.onclick = () => {
        saveSettings({ homeOrder: [], homeHidden: [] });
        render();
      };
      return;
    }
    const hidden = new Set(settings.homeHidden);
    const list = widgetOrder().filter((id) => !hidden.has(id));
    view.innerHTML = `
      <div class="home-head"><h1>ホーム</h1><button type="button" class="home-edit" data-home-edit>編集</button></div>
      <div class="event-body">${list.map(widgetHtml).join('')}${
        list.length === 0 ? '<p class="sns-lead">何も出していません。右上の「編集」で選べます</p>' : ''
      }</div>`;
    view.querySelector<HTMLElement>('[data-home-edit]')!.onclick = () => {
      editing = true;
      render();
    };
    view.querySelector<HTMLElement>('[data-login]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openLogin();
    });
    bindLoginCard(view);
    bindPlanRows(view);
    view.querySelectorAll<HTMLElement>('[data-open-cal]').forEach((b) => {
      b.onclick = () => {
        openCalendarAt(todayKey());
        document.dispatchEvent(new CustomEvent(SHOW_VIEW, { detail: 'stats' }));
      };
    });
    view.querySelector<HTMLElement>('[data-open-stats]')?.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent(SHOW_VIEW, { detail: 'stats' }));
    });
    view.querySelectorAll<HTMLElement>('[data-open-news]').forEach((b) => (b.onclick = openNews));
    view.querySelectorAll<HTMLElement>('[data-box]').forEach((b) => {
      const toggle = () => {
        const k = b.dataset.box as keyof typeof boxOpen;
        boxOpen[k] = !boxOpen[k];
        const { cur } = liveSeasons();
        if (k === 'season' && boxOpen.season && cur) loadRanking(cur.id);
        render();
      };
      b.onclick = toggle;
      b.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      };
    });
    bindLimitedEntries(view);
    view.querySelector<HTMLElement>('[data-rkname]')?.addEventListener('click', () => {
      saveSettings({ eventName: !settings.eventName });
      render();
      // 名前を出す・出さないを送り直してから、ランキングを読み直す
      const { cur } = liveSeasons();
      void api
        .publishEvent()
        .catch(() => false)
        .then(() => cur && loadRanking(cur.id, true));
    });
    view.querySelector<HTMLElement>('[data-intro]')?.addEventListener('click', () => {
      const { cur } = liveSeasons();
      if (cur) playSeasonIntro(cur);
    });
    view.querySelectorAll<HTMLElement>('[data-claim]').forEach((b) => {
      b.onclick = () => {
        const now = Date.now();
        const all = dailyAllClear(now);
        const list: (Quest | typeof all)[] = [...dailyQuests(now), ...weeklyQuests(now), all, sundayBonus(now)];
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
    // シーズン中にはじめて開いたときは、シーズンのはじまりの演出
    const { cur } = liveSeasons();
    if (cur && introUnseen(cur)) playSeasonIntro(cur);
    if (api.user() && !settings.homeHidden.includes('season')) {
      // 先に自分の分を送ってから、全員の合計を読む（送ったときは読み直す）
      const { cur, prev } = liveSeasons();
      void api
        .publishEvent()
        .catch(() => false)
        .then((sent) => {
          if (cur) refreshTotal(cur.id, sent);
          if (prev) refreshTotal(prev.id, sent);
          if (cur && boxOpen.season) loadRanking(cur.id, sent);
        });
    }
  };

  document.addEventListener('event:show', show);
  // 記録が増えたとき・グミが変わったとき・予定が変わったときに、開いていれば描き直す
  const again = () => {
    if (view.classList.contains('active') && !editing) render();
  };
  document.addEventListener(GUMI_CHANGE, again);
  document.addEventListener(PLANS_CHANGE, again);
  render();
}
