// 教材のページ（全画面）。「教材」のチップから開いて選ぶ・追加する・編集する。設定の教材の欄からも開く。
// 教材はジャンルごとに並べ、画像と色を付けられる。画像を選ぶと、色は画像から自動で決まる（あとから変えられる）。
// 教材を変えると、ラップ番号（次は何番から）・前回の範囲・前回平均がその教材のものに切り替わる。

import { materialColor } from '../colors';
import { DEFAULT_UNIT, UNITS, nth, unitById, unitFor } from '../units';
import { colorFromPixels } from '../imagecolor';
import { MATERIAL_COLORS } from '../palette';
import {
  activeMaterials,
  addMaterial,
  archiveMaterial,
  assignUntagged,
  currentMaterialId,
  materialById,
  materialGenres,
  materialName,
  nextLapNumber,
  reorderMaterials,
  saveSettings,
  setNextLap,
  untaggedLapSessions,
  updateMaterial,
  type Material,
} from '../store';
import { cropImage, samplePixels } from '../ui/cropper';
import { $, esc, html, setText } from '../ui/dom';
import { pickInteger, pickText } from '../ui/sheet';
import { toast } from '../ui/toast';

export const MATERIAL_CHANGE = 'material:change';
const notifyChange = () => document.dispatchEvent(new CustomEvent(MATERIAL_CHANGE));

/** 今の教材を変える（教材のチップなども変わる） */
export function setCurrentMaterial(id: string | null): void {
  saveSettings({ materialId: id });
  notifyChange();
}

/** 画像がない教材や、画像から色が取れないときの灰色 */
const GRAY = '#b0b0b0';

/** 教材の小さな絵（画像、なければ色の四角に名前の1文字）。id が null なら「教材なし」 */
export function materialThumb(id: string | null | undefined, size = 40): string {
  const m = id ? materialById(id) : undefined;
  return thumbHtml(m ? { name: m.name, img: m.img, color: materialColor(m.id) } : null, size);
}

function thumbHtml(m: { name: string; img?: string; color: string } | null, size: number): string {
  const style = `--s:${size}px`;
  if (!m) return `<span class="mthumb none" style="${style}" aria-hidden="true"></span>`;
  if (m.img) return `<span class="mthumb" style="${style}" aria-hidden="true"><img src="${esc(m.img)}" alt="" draggable="false"></span>`;
  const ch = Array.from(m.name.trim())[0] ?? '?';
  return `<span class="mthumb" style="${style};background:${esc(m.color)}" aria-hidden="true"><span>${esc(ch)}</span></span>`;
}

// ---- 全画面のページ ----

/** select：今の教材を選ぶ（チップから）、manage：編集する（設定から）、pick：選んで返すだけ（pickMaterial） */
type Mode = 'select' | 'manage' | 'pick';
let host: HTMLElement | null = null;

/** pickMaterial で選んでいるところ */
let picking: { current: string | null; title: string; lead: string; done: (id: string | null | undefined) => void } | null = null;

function openHost(): HTMLElement {
  host?.remove();
  host = html('<div id="materials" role="dialog" aria-modal="true" aria-label="教材"></div>');
  $('#app').append(host);
  return host;
}

function closeHost(): void {
  host?.remove();
  host = null;
  const p = picking;
  picking = null;
  p?.done(undefined); // 選ばずに閉じた
}

/**
 * 教材を選んでもらって返す（今の教材の設定は変えない）。選ばずに閉じたら undefined、教材なしなら null。
 * ポモドーロの途中で教材を変えるときなどに使う。
 */
export function pickMaterial(current: string | null, title: string, lead = ''): Promise<string | null | undefined> {
  return new Promise((done) => {
    const root = openHost();
    picking?.done(undefined);
    picking = { current, title, lead, done };
    listView(root, 'pick');
  });
}

/** 教材のページを開く。select なら選ぶため（チップから）、manage なら編集のため（設定から） */
export function openMaterials(mode: Mode = 'select'): void {
  listView(openHost(), mode);
}

/** 教材の編集を直接開く（id が null なら追加） */
export function openMaterialEdit(id: string | null): void {
  editView(openHost(), id, null);
}

function listView(root: HTMLElement, mode: Mode): void {
  const current = mode === 'pick' ? (picking?.current ?? null) : currentMaterialId();
  const choosing = mode !== 'manage';
  const list = activeMaterials();
  const genres = materialGenres();
  const row = (m: Material | null) => {
    const id = m?.id ?? '';
    const selected = choosing && (m?.id ?? null) === current;
    return `
      <div class="mrow${selected ? ' selected' : ''}" data-id="${esc(id)}">
        <button type="button" class="mrow-main" data-pick>
          ${materialThumb(m?.id ?? null, 44)}
          <span class="mrow-text">
            <span class="mrow-name">${esc(m ? m.name : '教材なし')}</span>
            <span class="mrow-sub">次は${nth(nextLapNumber(m?.id ?? null), unitFor(m?.id ?? null))}</span>
          </span>
          ${selected ? '<span class="mrow-check" aria-label="選んでいる">✓</span>' : ''}
        </button>
        ${m ? `<button type="button" class="mrow-edit" data-edit aria-label="${esc(m.name)}を編集">編集</button>` : ''}
      </div>`;
  };
  const section = (title: string | null, items: Material[]) =>
    items.length
      ? `<section class="mgroup">${title !== null ? `<h2 class="mgroup-head">${esc(title)}</h2>` : ''}<div class="sns-card">${items
          .map(row)
          .join('')}</div></section>`
      : '';
  const noGenre = list.filter((m) => !m.genre);
  root.innerHTML = `
    <div class="sns">
      <div class="sns-head wide">
        <button type="button" class="sns-back" data-close aria-label="閉じる">×</button>
        <div class="sns-head-title">${esc(mode === 'pick' ? (picking?.title ?? '教材') : '教材')}</div>
        ${list.length >= 2 && mode !== 'pick' ? '<button type="button" class="head-text-btn" data-sort>並べ替え</button>' : '<span class="sns-head-side"></span>'}
      </div>
      ${mode === 'pick' && picking?.lead ? `<p class="sns-lead">${esc(picking.lead)}</p>` : ''}
      ${choosing ? `<div class="sns-card">${row(null)}</div>` : ''}
      ${genres.map((g) => section(g, list.filter((m) => m.genre === g))).join('')}
      ${section(genres.length ? 'ジャンルなし' : null, noGenre)}
      <button type="button" class="btn dark" data-add>＋ 教材を追加</button>
      ${
        mode === 'pick'
          ? ''
          : `<p class="sns-lead">${
              mode === 'select'
                ? 'タップで選びます。教材ごとに、次の番号・前回の範囲・前回平均を分けて記録します'
                : '教材ごとに、次の番号・前回の範囲・前回平均を分けて記録します'
            }</p>`
      }
    </div>`;

  $('[data-close]', root).onclick = closeHost;
  root.querySelector<HTMLElement>('[data-sort]')?.addEventListener('click', () => sortView(root, mode));
  $('[data-add]', root).onclick = () => editView(root, null, mode);
  root.querySelectorAll<HTMLElement>('.mrow').forEach((r) => {
    const id = r.dataset.id || null;
    $('[data-pick]', r).onclick = () => {
      if (mode === 'manage') {
        if (id) editView(root, id, mode);
        return;
      }
      if (mode === 'pick') {
        const p = picking;
        picking = null;
        closeHost();
        p?.done(id);
        return;
      }
      saveSettings({ materialId: id });
      notifyChange();
      closeHost();
    };
    r.querySelector<HTMLElement>('[data-edit]')?.addEventListener('click', () => editView(root, id, mode));
  });
}

// ---- 並べ替え ----

const HANDLE = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 8h16M4 12h16M4 16h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

/**
 * 並べ替えの画面。教材は右の ≡ をつかんで上下に動かす（同じジャンルの中で）。
 * ジャンルの順番は、見出しの ▲▼ で入れ替える。動かしたらすぐ保存する。
 */
function sortView(root: HTMLElement, back: Mode): void {
  const list = activeMaterials();
  const genres = materialGenres();
  const noGenre = list.filter((m) => !m.genre);
  const sections: [string | null, Material[]][] = [...genres.map((g): [string, Material[]] => [g, list.filter((m) => m.genre === g)])];
  if (noGenre.length) sections.push([genres.length ? null : '', noGenre]);
  const movable = genres.length >= 2;
  root.innerHTML = `
    <div class="sns">
      <div class="sns-head wide">
        <span class="sns-head-side"></span>
        <div class="sns-head-title">並べ替え</div>
        <button type="button" class="head-text-btn strong" data-done>完了</button>
      </div>
      <p class="sns-lead">右の ≡ をつかんで上下に動かします${movable ? '。ジャンルの順番は ▲▼ で入れ替えます' : ''}</p>
      ${sections
        .map(
          ([g, items], i) => `
        <section class="mgroup" data-genre="${esc(g ?? '')}">
          ${
            g === ''
              ? ''
              : `<div class="mgroup-head sort-head"><span>${esc(g ?? 'ジャンルなし')}</span>${
                  movable && g !== null
                    ? `<span class="sort-genre-btns">
                        <button type="button" data-up="${i}" aria-label="${esc(g)}を上へ" ${i === 0 ? 'disabled' : ''}>▲</button>
                        <button type="button" data-down="${i}" aria-label="${esc(g)}を下へ" ${i === genres.length - 1 ? 'disabled' : ''}>▼</button>
                      </span>`
                    : ''
                }</div>`
          }
          <div class="sns-card sort-list">${items
            .map(
              (m) => `
            <div class="mrow sort-row" data-id="${esc(m.id)}">
              <span class="mrow-main">
                ${materialThumb(m.id, 40)}
                <span class="mrow-text"><span class="mrow-name">${esc(m.name)}</span></span>
              </span>
              <span class="sort-handle" role="button" aria-label="${esc(m.name)}を動かす">${HANDLE}</span>
            </div>`,
            )
            .join('')}</div>
        </section>`,
        )
        .join('')}
    </div>`;

  const save = () => {
    const ids = [...root.querySelectorAll<HTMLElement>('.sort-row')].map((r) => r.dataset.id!);
    reorderMaterials(ids);
    notifyChange();
  };
  $('[data-done]', root).onclick = () => listView(root, back);
  const moveGenre = (i: number, d: -1 | 1) => {
    const secs = [...root.querySelectorAll<HTMLElement>('.mgroup')];
    const a = secs[i];
    const b = secs[i + d];
    if (!a || !b) return;
    if (d < 0) b.before(a);
    else b.after(a);
    save();
    sortView(root, back);
  };
  root.querySelectorAll<HTMLElement>('[data-up]').forEach((b) => (b.onclick = () => moveGenre(Number(b.dataset.up), -1)));
  root.querySelectorAll<HTMLElement>('[data-down]').forEach((b) => (b.onclick = () => moveGenre(Number(b.dataset.down), 1)));
  root.querySelectorAll<HTMLElement>('.sort-handle').forEach((h) => bindDrag(h, save));
}

/** ≡ をつかんで、同じ一覧の中で上下に動かす。離したら onDrop */
function bindDrag(handle: HTMLElement, onDrop: () => void): void {
  handle.addEventListener('pointerdown', (e) => {
    const row = handle.closest<HTMLElement>('.sort-row');
    if (!row) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    row.classList.add('dragging');
    let startY = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      let dy = ev.clientY - startY;
      const prev = row.previousElementSibling as HTMLElement | null;
      const next = row.nextElementSibling as HTMLElement | null;
      if (next && dy > next.offsetHeight / 2) {
        next.after(row);
        startY += next.offsetHeight;
        dy -= next.offsetHeight;
        moved = true;
      } else if (prev && dy < -prev.offsetHeight / 2) {
        prev.before(row);
        startY -= prev.offsetHeight;
        dy += prev.offsetHeight;
        moved = true;
      }
      row.style.transform = `translateY(${dy}px)`;
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      row.style.transform = '';
      row.classList.remove('dragging');
      if (moved) onDrop();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
}

/** 教材の追加・編集。back が null なら、閉じるとページごと閉じる */
function editView(root: HTMLElement, id: string | null, back: Mode | null): void {
  const m = id ? materialById(id) : undefined;
  const draft = {
    name: m?.name ?? '',
    genre: m?.genre ?? '',
    img: m?.img,
    color: m ? materialColor(m.id) : undefined,
    unit: unitFor(m?.id ?? null).id,
    auto: false, // 色を画像から自動で決めた
  };

  root.innerHTML = `
    <form class="sns" novalidate>
      <div class="sns-head">
        <button type="button" class="sns-back" data-back aria-label="${back ? '戻る' : '閉じる'}">${back ? '‹' : '×'}</button>
        <div class="sns-head-title">${m ? '教材を編集' : '教材を追加'}</div>
        <span class="sns-head-side"></span>
      </div>
      <div class="medit-top">
        <button type="button" class="medit-thumb" data-image aria-label="画像を選ぶ"></button>
        <div class="medit-image-btns">
          <button type="button" class="btn dark small" data-image>画像を選ぶ</button>
          <button type="button" class="btn ghost small" data-noimage>画像をやめる</button>
        </div>
      </div>
      <input type="file" accept="image/*" hidden>
      <label class="field"><span class="field-label">名前</span>
        <input class="input" name="name" autocomplete="off" placeholder="例: リードα、名門の森" maxlength="40"></label>
      <div class="field"><span class="field-label">ジャンル（この端末の中での分け方）</span><div class="chip-row" data-genres></div></div>
      <div class="field"><span class="field-label">数え方（next を押すたびに1つ進む）</span><div class="chip-row" data-units></div><span class="field-note" data-unit-note></span></div>
      <div class="field"><span class="field-label" data-color-label>色</span><div class="mcolors" data-colors></div></div>
      ${m ? `<button type="button" class="sns-card sns-row" data-next><span class="sns-row-main">次の番号</span><span class="sns-row-end">${nth(nextLapNumber(m.id), unitFor(m.id))}から<span class="chevron">›</span></span></button>` : ''}
      <button type="submit" class="btn primary">${m ? '保存' : '追加'}</button>
      ${m ? '<button type="button" class="btn ghost" data-delete style="color:var(--red)">この教材を削除</button><p class="sns-lead">削除しても、これまでの記録は消えず、統計にも残ります</p>' : ''}
    </form>`;

  const form = $<HTMLFormElement>('form', root);
  const name = $<HTMLInputElement>('[name="name"]', root);
  const file = $<HTMLInputElement>('input[type="file"]', root);
  name.value = draft.name;

  const render = () => {
    draft.name = name.value;
    const color = draft.color ?? MATERIAL_COLORS[0];
    $('.medit-thumb', root).innerHTML = thumbHtml({ name: draft.name || '？', img: draft.img, color }, 88);
    $<HTMLButtonElement>('[data-noimage]', root).hidden = !draft.img;
    root.querySelectorAll<HTMLElement>('.medit-image-btns [data-image]').forEach((b) => (b.textContent = draft.img ? '画像を変える' : '画像を選ぶ'));
    setText($('[data-color-label]', root), draft.auto ? '色（画像から自動で選びました）' : '色');
    $('[data-units]', root).innerHTML = UNITS.map(
      (x) => `<button type="button" class="chip" data-unit="${esc(x.id)}" aria-pressed="${x.id === draft.unit}">${esc(x.name)}</button>`,
    ).join('');
    setText($('[data-unit-note]', root), `例：${unitById(draft.unit).example}`);
    $('[data-colors]', root).innerHTML = MATERIAL_COLORS.map(
      (c) => `<button type="button" class="sheet-color" style="background:${c}" data-color="${c}" aria-pressed="${c === draft.color}" aria-label="色"></button>`,
    ).join('');
    const genres = [...new Set([...materialGenres(), ...(draft.genre ? [draft.genre] : [])])];
    $('[data-genres]', root).innerHTML = [
      `<button type="button" class="chip" data-genre="" aria-pressed="${!draft.genre}">なし</button>`,
      ...genres.map((g) => `<button type="button" class="chip" data-genre="${esc(g)}" aria-pressed="${g === draft.genre}">${esc(g)}</button>`),
      '<button type="button" class="chip" data-genre-new>＋ 新しいジャンル</button>',
    ].join('');
  };

  name.oninput = () => {
    draft.name = name.value;
    if (!draft.img) $('.medit-thumb', root).innerHTML = thumbHtml({ name: draft.name || '？', color: draft.color ?? MATERIAL_COLORS[0] }, 88);
  };
  root.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const colorBtn = t.closest<HTMLElement>('[data-color]');
    const genreBtn = t.closest<HTMLElement>('[data-genre]');
    const unitBtn = t.closest<HTMLElement>('[data-unit]');
    if (unitBtn) {
      draft.unit = unitBtn.dataset.unit ?? DEFAULT_UNIT.id;
      render();
    } else if (colorBtn) {
      draft.color = colorBtn.dataset.color;
      draft.auto = false;
      render();
    } else if (genreBtn) {
      draft.genre = genreBtn.dataset.genre ?? '';
      render();
    } else if (t.closest('[data-genre-new]')) {
      const g = await pickText('新しいジャンル', '', '例: 数学、英語、物理');
      if (g) draft.genre = g.slice(0, 20);
      render();
    } else if (t.closest('[data-image]')) {
      file.click();
    } else if (t.closest('[data-noimage]')) {
      draft.img = undefined;
      draft.auto = false;
      render();
    }
  });
  file.onchange = async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    try {
      const url = await cropImage(f, { size: 96, maxLength: 12000 });
      if (!url) return;
      draft.img = url;
      draft.color = colorFromPixels(await samplePixels(url), MATERIAL_COLORS, GRAY);
      draft.auto = true;
      render();
    } catch (err) {
      toast(err instanceof Error ? err.message : '画像を読み込めませんでした');
    }
  };
  root.querySelector<HTMLElement>('[data-next]')?.addEventListener('click', async () => {
    if (!m) return;
    const u = unitById(draft.unit);
    const n = await pickInteger(`${m.name}：${u.upTo.replace('まで', 'から始める？')}`, nextLapNumber(m.id), 1, 99999, '1以上にしてください');
    if (n === null) return;
    setNextLap(n, m.id);
    notifyChange();
    $('[data-next] .sns-row-end', root).innerHTML = `${esc(nth(n, u))}から<span class="chevron">›</span>`;
  });
  root.querySelector<HTMLElement>('[data-delete]')?.addEventListener('click', () => {
    if (!m || !confirm(`「${m.name}」を削除しますか？\nこれまでの記録は消えず、統計にも残ります。`)) return;
    archiveMaterial(m.id);
    notifyChange();
    if (back) listView(root, back);
    else closeHost();
  });
  $('[data-back]', root).onclick = () => (back ? listView(root, back) : closeHost());

  form.onsubmit = (e) => {
    e.preventDefault();
    const n = name.value.trim();
    if (!n) return toast('名前を入れてください');
    if (activeMaterials().some((x) => x.name === n && x.id !== m?.id)) return toast('同じ名前の教材があります');
    const patch = {
      name: n,
      genre: draft.genre || undefined,
      img: draft.img,
      unit: draft.unit === DEFAULT_UNIT.id ? undefined : draft.unit,
      ...(draft.color ? { color: draft.color } : {}),
    };
    if (m) {
      updateMaterial(m.id, patch);
    } else {
      const first = activeMaterials().length === 0;
      const made = addMaterial(n, patch);
      // 最初の教材なら、これまでの記録（教材なし）を引き継げるようにする
      if (
        first &&
        untaggedLapSessions() > 0 &&
        confirm(`これまでの記録（教材なし）を「${n}」の記録にしますか？\n前回の番号の続きから始められます。`)
      ) {
        assignUntagged(made.id);
      }
      // 選ぶために開いていたなら、作った教材を選ぶ
      if (back === 'select') {
        saveSettings({ materialId: made.id });
        notifyChange();
        return closeHost();
      }
      if (back === 'pick') {
        const p = picking;
        picking = null;
        notifyChange();
        closeHost();
        return p?.done(made.id);
      }
    }
    notifyChange();
    if (back) listView(root, back);
    else closeHost();
  };
  render();
}

/** 今の教材を出すチップ。タップで教材のページを開く */
export function createMaterialChip(): { el: HTMLElement; refresh: () => void } {
  const el = html(`
    <button type="button" class="pick-chip material-chip">
      <span class="chip-thumb"></span>
      <span class="pick-text"><span class="pick-label">教材</span><span class="pick-value"></span></span>
      <span class="chevron" aria-hidden="true">›</span>
    </button>`);
  const refresh = () => {
    const id = currentMaterialId();
    setText($('.pick-value', el), materialName(id));
    $('.chip-thumb', el).innerHTML = id ? materialThumb(id, 26) : '';
    el.classList.toggle('on', id !== null);
  };
  el.onclick = () => openMaterials('select');
  document.addEventListener(MATERIAL_CHANGE, refresh);
  refresh();
  return { el, refresh };
}
