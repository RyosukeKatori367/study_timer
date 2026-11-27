// 教材を選ぶチップと、教材を選ぶ・作るシート。
// 教材を変えると、ラップ番号（次は何番から）・前回の範囲・前回平均がその教材のものに切り替わる。

import {
  activeMaterials,
  addMaterial,
  assignUntagged,
  currentMaterialId,
  materialName,
  nextLapNumber,
  saveSettings,
  untaggedLapSessions,
} from '../store';
import { $, html, setText } from '../ui/dom';
import { pickList, pickText } from '../ui/sheet';
import { toast } from '../ui/toast';

export const MATERIAL_CHANGE = 'material:change';

const notifyChange = () => document.dispatchEvent(new CustomEvent(MATERIAL_CHANGE));

/** 新しい教材を作る。作ったら id、やめたら null */
export async function createMaterial(): Promise<string | null> {
  const name = await pickText('新しい教材の名前', '', '例: リードα、名門の森');
  if (!name) return null;
  if (activeMaterials().some((m) => m.name === name)) {
    toast('同じ名前の教材があります');
    return null;
  }
  const first = activeMaterials().length === 0;
  const m = addMaterial(name);
  // 最初の教材なら、これまでの記録（教材なし）を引き継げるようにする
  if (
    first &&
    untaggedLapSessions() > 0 &&
    confirm(`これまでの記録（教材なし）を「${name}」の記録にしますか？\n前回の番号の続きから始められます。`)
  ) {
    assignUntagged(m.id);
  }
  return m.id;
}

/** 教材を選ぶ（新しく作ることもできる） */
export async function chooseMaterial(): Promise<void> {
  const list = activeMaterials();
  const items = [
    { label: '教材なし', sub: `次は${nextLapNumber(null)}番` },
    ...list.map((m) => ({ label: m.name, sub: `次は${nextLapNumber(m.id)}番` })),
    { label: '＋ 新しい教材' },
  ];
  const current = currentMaterialId();
  const i = await pickList('教材', items, current ? list.findIndex((m) => m.id === current) + 1 : 0);
  if (i === null) return;
  let id: string | null;
  if (i === items.length - 1) {
    id = await createMaterial();
    if (!id) return;
  } else {
    id = i === 0 ? null : list[i - 1].id;
  }
  saveSettings({ materialId: id });
  notifyChange();
}

/** 今の教材を出すチップ。タップで選び直す */
export function createMaterialChip(): { el: HTMLElement; refresh: () => void } {
  const el = html(`
    <button type="button" class="pick-chip material-chip">
      <span class="pick-text"><span class="pick-label">教材</span><span class="pick-value"></span></span>
      <span class="chevron" aria-hidden="true">›</span>
    </button>`);
  const refresh = () => {
    const id = currentMaterialId();
    setText($('.pick-value', el), materialName(id));
    el.classList.toggle('on', id !== null);
  };
  el.onclick = () => void chooseMaterial();
  document.addEventListener(MATERIAL_CHANGE, refresh);
  refresh();
  return { el, refresh };
}
