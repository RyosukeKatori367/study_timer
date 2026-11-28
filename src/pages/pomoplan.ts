// ポモドーロで、途中から教材を変える（セットごとの教材）。
// 1セットずつ選ぶのではなく「数学 ×2 → 英語 ×2 → …」のように、まとまりで決める。
// 1つ目のまとまりの教材は、いつも今の教材（教材のチップと同じ）。最後のまとまりは、そのあとずっと続く。
// 計測中も、休憩のあいだに次のセットの教材を変えられる（src/run.ts）。

import { setsFromPlan, type Run } from '../engine';
import { currentMaterialId, materialById, materialName, saveSettings, settings, type PlanBlock } from '../store';
import { $, esc, html, setText } from '../ui/dom';
import { MATERIAL_CHANGE, materialThumb, pickMaterial, setCurrentMaterial } from './material';

export const PLAN_CHANGE = 'pomoplan:change';
const notify = () => document.dispatchEvent(new CustomEvent(PLAN_CHANGE));

/** 使える教材の id（削除した教材は教材なしにする） */
const live = (id: string | null | undefined): string | null => {
  const m = id ? materialById(id) : null;
  return m && !m.archived ? m.id : null;
};

/** 今の並び。1つ目はいつも今の教材。並べていなければ1つだけ */
export function currentPlan(): PlanBlock[] {
  const rest = settings.pomoPlan.slice(1).map((b) => ({ m: live(b.m), n: Math.max(1, Math.round(b.n) || 1) }));
  const first = { m: currentMaterialId(), n: Math.max(1, Math.round(settings.pomoPlan[0]?.n ?? 1) || 1) };
  return rest.length ? [first, ...rest] : [first];
}

/** 計測の教材（1セット目と、変えるところ） */
export function planForRun(): Pick<Run, 'material' | 'sets'> {
  return setsFromPlan(currentPlan().map((b) => ({ ...(b.m ? { material: b.m } : {}), n: b.n })));
}

function savePlan(plan: PlanBlock[]): void {
  saveSettings({ pomoPlan: plan.length >= 2 ? plan.map((b) => ({ m: b.m, n: b.n })) : [] });
  notify();
}

/** 「3〜4セット目」「5セット目から」 */
function rangeLabel(plan: PlanBlock[], i: number): { text: string; from: number } {
  const from = 1 + plan.slice(0, i).reduce((t, b) => t + b.n, 0);
  if (i === plan.length - 1) return { text: `${from}セット目から`, from };
  const to = from + plan[i].n - 1;
  return { text: to === from ? `${from}セット目` : `${from}〜${to}セット目`, from };
}

/** ポモドーロのページの「途中で変える」のチップ */
export function createPlanChip(): { el: HTMLElement; refresh: () => void } {
  const el = html(`
    <button type="button" class="pick-chip plan-chip">
      <span class="pick-text"><span class="pick-label">途中で変える</span><span class="pick-value"></span></span>
      <span class="chevron" aria-hidden="true">›</span>
    </button>`);
  const refresh = () => {
    const plan = currentPlan();
    let text = 'しない';
    if (plan.length === 2) text = `${rangeLabel(plan, 1).from}セット目から ${materialName(plan[1].m)}`;
    else if (plan.length > 2) text = plan.map((b) => materialName(b.m)).join(' → ');
    setText($('.pick-value', el), text);
    el.classList.toggle('on', plan.length >= 2);
  };
  el.onclick = () => openPlan();
  document.addEventListener(MATERIAL_CHANGE, refresh);
  document.addEventListener(PLAN_CHANGE, refresh);
  refresh();
  return { el, refresh };
}

/** セットごとの教材のページ */
export function openPlan(): void {
  document.getElementById('pomoplan')?.remove();
  const root = html('<div id="pomoplan" class="fullpage" role="dialog" aria-modal="true" aria-label="セットごとの教材"></div>');
  document.getElementById('app')!.append(root);
  const close = () => root.remove();
  let plan = currentPlan();

  const render = () => {
    const count = settings.endKind === 'count' ? settings.endCount : null;
    root.innerHTML = `
      <div class="sns">
        <div class="sns-head">
          <button type="button" class="sns-back" data-close aria-label="閉じる">×</button>
          <div class="sns-head-title">セットごとの教材</div>
          <span class="sns-head-side"></span>
        </div>
        <p class="sns-lead">休憩をはさんで、途中から教材を変えられます。教材と、それを何セットやるかを並べます</p>
        <div class="sns-card plan-list">
          ${plan
            .map((b, i) => {
              const r = rangeLabel(plan, i);
              const last = i === plan.length - 1;
              const unused = count !== null && r.from > count;
              return `
            <div class="plan-row${unused ? ' unused' : ''}">
              <div class="plan-top">
                <span class="plan-range">${r.text}${unused ? `（${count}セットで終わるので使いません）` : ''}</span>
                ${plan.length >= 2 ? `<button type="button" class="plan-del" data-del="${i}" aria-label="${esc(materialName(b.m))}をやめる">×</button>` : ''}
              </div>
              <div class="plan-main">
                <button type="button" class="plan-mat" data-mat="${i}">
                  ${materialThumb(b.m, 32)}
                  <span class="plan-name">${esc(materialName(b.m))}</span>
                  <span class="chevron" aria-hidden="true">›</span>
                </button>
                ${
                  last
                    ? `<span class="plan-rest">${plan.length >= 2 ? 'あとはずっと' : 'ずっと'}</span>`
                    : `<span class="stepper">
                        <button type="button" data-minus="${i}" aria-label="減らす" ${b.n <= 1 ? 'disabled' : ''}>−</button>
                        <b>${b.n}</b>
                        <button type="button" data-plus="${i}" aria-label="増やす" ${b.n >= 20 ? 'disabled' : ''}>＋</button>
                      </span>`
                }
              </div>
            </div>`;
            })
            .join('')}
        </div>
        ${plan.length < 8 ? '<button type="button" class="btn dark" data-add>＋ 次の教材を足す</button>' : ''}
        <button type="button" class="btn primary" data-close>完了</button>
        <p class="sns-lead">計測中も、休憩のあいだに「次のセットの教材」を変えられます。記録は教材ごとに分けて残ります</p>
      </div>`;

    root.querySelectorAll<HTMLElement>('[data-close]').forEach((b) => (b.onclick = close));
    root.querySelectorAll<HTMLElement>('[data-mat]').forEach((b) => {
      b.onclick = async () => {
        const i = Number(b.dataset.mat);
        const id = await pickMaterial(plan[i].m, `${rangeLabel(plan, i).text}の教材`);
        if (id === undefined) return;
        plan[i] = { ...plan[i], m: id };
        if (i === 0) setCurrentMaterial(id); // 1つ目は今の教材
        commit();
      };
    });
    root.querySelectorAll<HTMLElement>('[data-minus]').forEach((b) => {
      b.onclick = () => step(Number(b.dataset.minus), -1);
    });
    root.querySelectorAll<HTMLElement>('[data-plus]').forEach((b) => {
      b.onclick = () => step(Number(b.dataset.plus), 1);
    });
    root.querySelectorAll<HTMLElement>('[data-del]').forEach((b) => {
      b.onclick = () => {
        const i = Number(b.dataset.del);
        plan = plan.filter((_, j) => j !== i);
        if (i === 0) setCurrentMaterial(plan[0]?.m ?? null);
        commit();
      };
    });
    root.querySelector<HTMLElement>('[data-add]')?.addEventListener('click', async () => {
      const id = await pickMaterial(null, `${rangeLabel([...plan, { m: null, n: 1 }], plan.length).text}の教材`, '前の教材のあと、このセットからこの教材にします');
      if (id === undefined) return;
      plan = [...plan, { m: id, n: 1 }];
      commit();
    });
  };

  const step = (i: number, d: number) => {
    plan[i] = { ...plan[i], n: Math.min(20, Math.max(1, plan[i].n + d)) };
    commit();
  };
  const commit = () => {
    // 同じ教材が続いたら1つにまとめる
    const out: PlanBlock[] = [];
    for (const b of plan) {
      const prev = out[out.length - 1];
      if (prev && prev.m === b.m) prev.n += b.n;
      else out.push({ ...b });
    }
    plan = out;
    savePlan(plan);
    render();
  };

  render();
}
