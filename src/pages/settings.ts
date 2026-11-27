// 設定画面。ジャンルごとのカードに分けて並べる。
// 行の種類は3つ: オン／オフのスイッチ、選ぶもの（右に今の値、タップでシート）、操作（書き出しなど）。

import {
  activeMaterials,
  archiveMaterial,
  clearSessions,
  exportBackup,
  getSessions,
  importBackup,
  nextLapNumber,
  renameMaterial,
  saveSettings,
  setNextLap,
  settings,
  type Settings,
} from '../store';
import { MATERIAL_CHANGE, createMaterial } from './material';
import { HOUR, MIN, fmtHM, fmtTimeOfDay, type DurationStyle } from '../time';
import { $, esc, html, setText } from '../ui/dom';
import { pickDrums, pickInteger, pickList, pickOption, pickText } from '../ui/sheet';
import { toast } from '../ui/toast';
import { disableTilt, enableTilt } from '../tilt';

type ToggleKey = 'overrun' | 'finishHold' | 'lapAdvance' | 'keepAwake' | 'tilt' | 'sound' | 'lapSound';

interface ToggleRow {
  kind: 'toggle';
  key: ToggleKey;
  label: string;
  note?: string;
}

interface ChoiceRow {
  kind: 'choice';
  id: string;
  label: string;
  note?: string;
  /** 右に出す今の値 */
  value: () => string;
  /** タップしたとき。値が変わったら true */
  pick: () => Promise<boolean>;
}

interface ActionRow {
  kind: 'action';
  id: 'export' | 'import' | 'clear';
  label: string;
  danger?: boolean;
}

type Row = ToggleRow | ChoiceRow | ActionRow;

interface Group {
  title: string;
  /** 見出しのアイコン（24x24 の線のパス） */
  icon: string;
  rows: Row[];
  /** 中身をあとから作るグループ（教材の一覧） */
  dynamic?: 'materials';
}

/** 選択肢から選んで設定に入れる。値が変わったら true */
async function choose<K extends keyof Settings>(
  title: string,
  key: K,
  options: { label: string; value: Settings[K] }[],
): Promise<boolean> {
  const i = await pickOption(
    title,
    options.map((o) => o.label),
    options.findIndex((o) => o.value === settings[key]),
  );
  if (i === null || options[i].value === settings[key]) return false;
  saveSettings({ [key]: options[i].value } as Partial<Settings>);
  return true;
}

const ESTIMATE = [
  { label: '平均ラップ', value: 'average' as const },
  { label: 'タイマーの設定時間', value: 'timer' as const },
];
const STYLES = [
  { label: '1時間38分', value: 'hm' as DurationStyle },
  { label: '98分', value: 'm' as DurationStyle },
];
const WEEK = [
  { label: '月曜', value: 1 as const },
  { label: '日曜', value: 0 as const },
];
const BOUNDARY = [0, 1, 2, 3, 4, 5, 6].map((h) => ({ label: `${h}:00`, value: h * 60 }));

const GROUPS: Group[] = [
  {
    title: '計測',
    icon: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9.5 2.5h5"/>',
    rows: [
      { kind: 'toggle', key: 'overrun', label: 'カウントダウンで0を過ぎても数える' },
      {
        kind: 'toggle',
        key: 'finishHold',
        label: 'finish は長押しで終える',
        note: 'オフにすると1回タップで終わります。押し間違えやすいので注意',
      },
    ],
  },
  {
    title: 'ラップ',
    icon: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    rows: [
      {
        kind: 'toggle',
        key: 'lapAdvance',
        label: 'finish後は次の番号から始める',
        note: 'オフにすると、途中だったラップの番号から始めます（235番の途中で終えたら、次も235番から）',
      },
      {
        kind: 'choice',
        id: 'estimate',
        label: '残り時間の目安',
        note: '終了条件がラップ数・ラップ番号のとき、タイマーで何を元に見積もるか。ストップウォッチはいつも平均ラップです',
        value: () => ESTIMATE.find((o) => o.value === settings.lapEstimate)!.label,
        pick: () => choose('残り時間の目安（タイマー）', 'lapEstimate', ESTIMATE),
      },
    ],
  },
  {
    title: '教材',
    icon: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13z"/>',
    rows: [],
    dynamic: 'materials',
  },
  {
    title: '統計',
    icon: '<path d="M6 20v-5M12 20V9M18 20V4"/>',
    rows: [
      {
        kind: 'choice',
        id: 'goal',
        label: '1日の目標',
        value: () => (settings.dailyGoalMs > 0 ? fmtHM(settings.dailyGoalMs) : 'なし'),
        pick: async () => {
          const r = await pickDrums('1日の目標（0時間00分で目標なし）', [
            { min: 0, max: 16, value: Math.floor(settings.dailyGoalMs / HOUR), unit: '時間' },
            { min: 0, max: 59, value: Math.floor((settings.dailyGoalMs % HOUR) / MIN), unit: '分', pad: true },
          ]);
          if (!r) return false;
          saveSettings({ dailyGoalMs: r[0] * HOUR + r[1] * MIN });
          return true;
        },
      },
      {
        kind: 'choice',
        id: 'boundary',
        label: '1日の区切り',
        note: '4:00 にすると、深夜0時〜4時の勉強を前の日に数えます',
        value: () => fmtTimeOfDay(settings.dayBoundaryMin),
        pick: () => choose('1日の区切り', 'dayBoundaryMin', BOUNDARY),
      },
      {
        kind: 'choice',
        id: 'week',
        label: '週の始まり',
        value: () => WEEK.find((o) => o.value === settings.weekStartsOn)!.label,
        pick: () => choose('週の始まり', 'weekStartsOn', WEEK),
      },
    ],
  },
  {
    title: '表示',
    icon: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
    rows: [
      {
        kind: 'choice',
        id: 'style',
        label: '時間の表示',
        note: '98分を「1時間38分」と「98分」のどちらで出すか。アプリ全体に効きます',
        value: () => STYLES.find((o) => o.value === settings.durationStyle)!.label,
        pick: () => choose('時間の表示', 'durationStyle', STYLES),
      },
      { kind: 'toggle', key: 'keepAwake', label: '計測中は画面をつけたままにする' },
      { kind: 'toggle', key: 'tilt', label: '計測中、傾けたら横向きにする' },
    ],
  },
  {
    title: '音',
    icon: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
    rows: [
      { kind: 'toggle', key: 'sound', label: '終了・切り替えで音を鳴らす' },
      { kind: 'toggle', key: 'lapSound', label: 'lap を押したときに音を鳴らす' },
    ],
  },
  {
    title: 'データ',
    icon: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
    rows: [
      { kind: 'action', id: 'export', label: '記録を書き出す' },
      { kind: 'action', id: 'import', label: '記録を読み込む' },
      { kind: 'action', id: 'clear', label: '記録をすべて消す', danger: true },
    ],
  },
];

function rowHtml(row: Row): string {
  const note = 'note' in row && row.note ? `<div class="row-note">${esc(row.note)}</div>` : '';
  switch (row.kind) {
    case 'toggle':
      return `
        <button type="button" class="row" role="switch" data-toggle="${row.key}">
          <span class="row-label">${esc(row.label)}</span><span class="switch" aria-hidden="true"></span>
        </button>${note}`;
    case 'choice':
      return `
        <button type="button" class="row" data-choice="${row.id}">
          <span class="row-label">${esc(row.label)}</span>
          <span class="row-value"><span class="v"></span><span class="chevron" aria-hidden="true">›</span></span>
        </button>${note}`;
    case 'action':
      return `
        <button type="button" class="row${row.danger ? ' danger' : ''}" data-action="${row.id}">
          <span class="row-label">${esc(row.label)}</span>
          ${row.danger ? '' : '<span class="chevron" aria-hidden="true">›</span>'}
        </button>`;
  }
}

/** 記録を JSON ファイルとして渡す。iPhone では共有シート、それ以外はダウンロード。 */
async function exportFile(): Promise<void> {
  const name = `gumiben-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([exportBackup()], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch {
      // 共有をキャンセルしただけなら何もしない
    }
    return;
  }
  const url = URL.createObjectURL(file);
  const a = html<HTMLAnchorElement>(`<a download="${name}"></a>`);
  a.href = url;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function initSettingsPage(view: HTMLElement, onDataChange: () => void): void {
  view.append(html(`<h1>設定</h1>`));
  for (const g of GROUPS) {
    view.append(
      html(`
        <section class="group" aria-label="${esc(g.title)}">
          <h2 class="group-head">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${g.icon}</svg>
            ${esc(g.title)}
          </h2>
          <div class="group-card"${g.dynamic ? ` data-dynamic="${g.dynamic}"` : ''}>${g.rows.map(rowHtml).join('')}</div>
        </section>`),
    );
  }
  view.append(
    html(`<input type="file" accept="application/json,.json" hidden>`),
    html(`<div class="settings-foot">記録はこの端末の中にだけ保存されます</div>`),
  );

  const choices = GROUPS.flatMap((g) => g.rows).filter((r): r is ChoiceRow => r.kind === 'choice');
  const toggles = view.querySelectorAll<HTMLElement>('[data-toggle]');

  const render = () => {
    toggles.forEach((b) => b.setAttribute('aria-checked', String(settings[b.dataset.toggle as ToggleKey])));
    for (const c of choices) setText($(`[data-choice="${c.id}"] .v`, view), c.value());
  };

  toggles.forEach((b) => {
    b.onclick = async () => {
      const key = b.dataset.toggle as ToggleKey;
      const on = !settings[key];
      if (key === 'tilt') {
        // 傾きセンサーは許可が要る。断られたらオフのままにする
        if (on && !(await enableTilt())) return toast('モーションセンサーを使えませんでした');
        if (!on) disableTilt();
      }
      saveSettings({ [key]: on });
      render();
    };
  });

  for (const c of choices) {
    $(`[data-choice="${c.id}"]`, view).onclick = async () => {
      if (!(await c.pick())) return;
      render();
      onDataChange(); // 時間の表示や統計の区切りは、ほかの画面にも効く
    };
  }

  const fileInput = $<HTMLInputElement>('input[type="file"]', view);
  $('[data-action="export"]', view).onclick = () => {
    if (getSessions().length === 0) return toast('まだ記録がありません');
    void exportFile();
  };
  $('[data-action="import"]', view).onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const added = importBackup(await file.text());
      toast(`${added}件の記録を読み込みました`);
      onDataChange();
    } catch (e) {
      toast(e instanceof Error && e.message.includes('グミ勉') ? e.message : 'ファイルを読み込めませんでした');
    }
  };
  $('[data-action="clear"]', view).onclick = () => {
    if (!confirm('これまでの記録をすべて消します。元に戻せません。よろしいですか？')) return;
    clearSessions();
    toast('記録を消しました');
    onDataChange();
  };

  // ---- 教材の一覧 ----
  const materialCard = $('[data-dynamic="materials"]', view);
  const renderMaterials = () => {
    const list = activeMaterials();
    materialCard.innerHTML = `
      ${list
        .map(
          (m) => `
        <button type="button" class="row" data-material="${m.id}">
          <span class="row-label">${esc(m.name)}</span>
          <span class="row-value"><span>次は${nextLapNumber(m.id)}番</span><span class="chevron" aria-hidden="true">›</span></span>
        </button>`,
        )
        .join('')}
      <button type="button" class="row add" data-material-add><span class="row-label">＋ 教材を追加</span></button>
      <div class="row-note">教材ごとに、ラップ番号（次は何番から）・前回の範囲・前回平均を分けて記録します。タイマーやストップウォッチの「教材」から切り替えます</div>`;

    materialCard.querySelectorAll<HTMLElement>('[data-material]').forEach((b) => {
      const m = list.find((x) => x.id === b.dataset.material)!;
      b.onclick = async () => {
        const i = await pickList(m.name, [
          { label: '名前を変える' },
          { label: '次のラップ番号を変える', sub: `今は${nextLapNumber(m.id)}番` },
          { label: '削除する', danger: true },
        ]);
        if (i === 0) {
          const name = await pickText('教材の名前', m.name);
          if (!name || name === m.name) return;
          if (activeMaterials().some((x) => x.name === name)) return toast('同じ名前の教材があります');
          renameMaterial(m.id, name);
        } else if (i === 1) {
          const n = await pickInteger(`${m.name}の次のラップ番号`, nextLapNumber(m.id), 1, 99999, '1以上にしてください');
          if (n === null) return;
          setNextLap(n, m.id);
        } else if (i === 2) {
          if (!confirm(`「${m.name}」を削除しますか？\nこれまでの記録は消えず、統計にも残ります。`)) return;
          archiveMaterial(m.id);
        } else {
          return;
        }
        document.dispatchEvent(new CustomEvent(MATERIAL_CHANGE));
      };
    });
    $('[data-material-add]', materialCard).onclick = async () => {
      if (await createMaterial()) document.dispatchEvent(new CustomEvent(MATERIAL_CHANGE));
    };
  };
  document.addEventListener(MATERIAL_CHANGE, renderMaterials);
  // 計測が終わると「次は何番」が変わるので、設定を開くたびに作り直す
  document.addEventListener('settings:show', renderMaterials);
  renderMaterials();

  render();
}
