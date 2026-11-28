// ⑧ 投稿の確認。計測を finish して記録したあとに、全画面で出す。
// ログインしていて、グループに入っていて、「終えたら投稿画面を出す」がオンのときだけ。
// 出すもの・投稿先は、前回の投稿の内容を初期値にする。

import { api } from '../../cloud/api';
import { count, one, range, unitFor } from '../../units';
import type { Group } from '../../cloud/groups';
import { COMMENT_MAX, DEFAULT_POST_PREFS, type PostOptions, type PostPrefs } from '../../cloud/model';
import { materialColor } from '../../colors';
import type { Session } from '../../engine';
import { materialById } from '../../store';
import { fmtHM } from '../../time';
import { $, esc, html } from '../../ui/dom';
import { toast } from '../../ui/toast';
import { MODE_LABEL, timeRange } from './fmt';

export const SESSION_SAVED = 'session:saved';

// グループ名は、オフラインでも出せるように端末にも覚えておく
const NAMES = 'studytimer:groups';

export function rememberGroups(list: Group[]): void {
  try {
    localStorage.setItem(NAMES, JSON.stringify(list.map((g) => ({ id: g.id, name: g.name, hue: g.hue }))));
  } catch {
    /* なくても、次につながったときに読む */
  }
}

function knownGroups(ids: string[]): { id: string; name: string; hue: number }[] {
  let saved: { id: string; name: string; hue: number }[] = [];
  try {
    saved = JSON.parse(localStorage.getItem(NAMES) ?? '[]');
  } catch {
    /* 空のまま */
  }
  return ids.map((id) => saved.find((g) => g.id === id) ?? { id, name: 'グループ', hue: 0 });
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

export function initCompose(): void {
  document.addEventListener(SESSION_SAVED, (e) => {
    const s = (e as CustomEvent<Session>).detail;
    if (api.user()) void maybeShow(s);
  });
}

async function maybeShow(s: Session): Promise<void> {
  const profile = api.cachedProfile() ?? (await withTimeout(api.getProfile(), 4000).catch(() => null));
  if (!profile?.name || profile.groupIds.length === 0 || !profile.postPrefs.ask) return;
  // グループ名を最新にする（オフラインなら覚えている名前で出す）
  const fresh = await withTimeout(api.listGroups(), 2500).catch(() => null);
  if (fresh) rememberGroups(fresh);
  const groups = fresh ?? knownGroups(profile.groupIds);
  if (groups.length === 0) return;
  show(s, { ...DEFAULT_POST_PREFS, ...profile.postPrefs }, groups);
}

function show(s: Session, prefs: PostPrefs, groups: { id: string; name: string; hue: number }[]): void {
  const material = materialById(s.material);
  const hasLaps = s.mode !== 'pomoCycle' && s.laps.length > 0;
  const unit = unitFor(s.material);
  const away = s.leaves ?? [];
  const awayMs = away.reduce((t, [a, b]) => t + (b - a), 0);
  const chosen = new Set(prefs.groups.filter((id) => groups.some((g) => g.id === id)));
  if (chosen.size === 0) chosen.add(groups[0].id);

  const parts = [
    material
      ? `<span class="pill">${
          material.img
            ? `<img class="pill-img" src="${esc(material.img)}" alt="" style="box-shadow:0 0 0 1.5px ${materialColor(material.id)}">`
            : `<i style="background:${materialColor(material.id)}"></i>`
        }${esc(material.name)}</span>`
      : '',
    hasLaps ? `<span class="pill">${range(s.firstLap, s.firstLap + s.laps.length - 1, unit)}・${count(s.laps.length, unit)}</span>` : '',
  ].join('');

  const toggles: { key: keyof Omit<PostOptions, 'comment'>; label: string; sub?: string; show: boolean }[] = [
    { key: 'material', label: '教材名', show: !!material },
    { key: 'laps', label: `番号と${unit.countLabel}`, show: hasLaps },
    { key: 'lapTimes', label: `${one(unit)}ごとの時間`, show: hasLaps },
    { key: 'away', label: '離脱の回数と時間', sub: `${away.length}回・${fmtHM(awayMs)}`, show: away.length > 0 },
  ];
  const opt: Omit<PostOptions, 'comment'> = { material: prefs.material, laps: prefs.laps, lapTimes: prefs.lapTimes, away: prefs.away };

  const host = html(`
    <div id="compose" role="dialog" aria-modal="true" aria-label="投稿">
      <div class="sns">
        <h1 style="font-size:26px">記録しました</h1>
        <div class="sns-card compose-sum">
          <div class="post-ms">${esc(fmtHM(s.studyMs))}</div>
          <div class="sub2">${esc(MODE_LABEL[s.mode])}・${esc(timeRange(s.start, s.end))}</div>
          ${parts ? `<div class="pills" style="justify-content:center">${parts}</div>` : ''}
        </div>
        ${
          toggles.some((t) => t.show)
            ? `<div>
                <div class="field-label" style="margin-bottom:6px">グループに出すもの</div>
                <div class="group-card">${toggles
                  .filter((t) => t.show)
                  .map(
                    (t) => `
                  <button type="button" class="row" role="switch" data-opt="${t.key}">
                    <span class="row-label">${esc(t.label)}${t.sub ? `<span class="sns-row-sub" style="margin-left:8px">${esc(t.sub)}</span>` : ''}</span>
                    <span class="switch" aria-hidden="true"></span>
                  </button>`,
                  )
                  .join('')}</div>
              </div>`
            : ''
        }
        <label class="field">
          <span class="field-label">ひとこと（なくてもいい）</span>
          <textarea class="input" rows="2" maxlength="${COMMENT_MAX}" placeholder="力学おわった！"></textarea>
        </label>
        <div>
          <div class="field-label" style="margin-bottom:8px">投稿先</div>
          <div class="chip-row">${groups
            .map((g) => `<button type="button" class="chip" data-gid="${esc(g.id)}">${esc(g.name)}</button>`)
            .join('')}</div>
        </div>
        <div class="btn-row" style="grid-template-columns:1fr 1.4fr;margin-top:6px">
          <button type="button" class="btn ghost" data-skip>投稿しない</button>
          <button type="button" class="btn primary" data-post>投稿する</button>
        </div>
        <p class="sns-lead">前回の投稿の内容を初期値にしています。この画面は、設定の「終えたら投稿画面を出す」で出さないようにできます</p>
      </div>
    </div>`);

  const render = () => {
    host.querySelectorAll<HTMLElement>('[data-opt]').forEach((b) => b.setAttribute('aria-checked', String(opt[b.dataset.opt as keyof typeof opt])));
    host.querySelectorAll<HTMLElement>('[data-gid]').forEach((b) => b.setAttribute('aria-pressed', String(chosen.has(b.dataset.gid!))));
  };
  host.querySelectorAll<HTMLElement>('[data-opt]').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.opt as keyof typeof opt;
      opt[k] = !opt[k];
      render();
    };
  });
  host.querySelectorAll<HTMLElement>('[data-gid]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.gid!;
      if (chosen.has(id)) chosen.delete(id);
      else chosen.add(id);
      render();
    };
  });
  const close = () => host.remove();
  $('[data-skip]', host).onclick = close;
  $('[data-post]', host).onclick = async () => {
    if (chosen.size === 0) return toast('投稿先のグループを選んでください');
    const comment = $<HTMLTextAreaElement>('textarea', host).value;
    try {
      await api.createPost(s, { ...opt, comment }, [...chosen]);
      close();
      toast(navigator.onLine ? '投稿しました' : 'つながったら投稿されます');
    } catch (e) {
      toast(e instanceof Error ? e.message : '投稿できませんでした');
    }
  };
  render();
  // 「記録しました」のお知らせは、この画面の見出しと同じなので消す
  document.getElementById('toast')?.classList.remove('show');
  document.getElementById('compose')?.remove();
  $('#app').append(host);
}
