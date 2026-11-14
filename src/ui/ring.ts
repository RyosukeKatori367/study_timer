// 目盛りの円。120本の目盛りのうち、指定した角度の範囲だけ色をつける。

const TICK = 3; // 目盛り1本ぶんの角度
let seq = 0;

export interface Ring {
  el: HTMLElement;
  /** from〜to（度、12時の位置が0で時計回り）の目盛りを光らせる */
  set(from: number, to: number, over?: boolean): void;
}

export function createRing(): Ring {
  const id = `ring-mask-${seq++}`;
  const el = document.createElement('div');
  el.className = 'ring';
  const circle = 'cx="145" cy="145" r="138" fill="none" pathLength="360" transform="rotate(-90 145 145)"';
  el.innerHTML = `
    <svg viewBox="0 0 290 290" aria-hidden="true">
      <defs>
        <mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="290" height="290">
          <circle ${circle} stroke="#fff" stroke-width="16" stroke-dasharray="0 360"/>
        </mask>
      </defs>
      <circle class="ring-base" ${circle} stroke-width="12" stroke-dasharray="0.7 2.3"/>
      <circle class="ring-on" ${circle} stroke-width="12" stroke-dasharray="0.7 2.3" mask="url(#${id})"/>
    </svg>`;
  const arc = el.querySelector('mask circle') as SVGCircleElement;
  let last = '';

  return {
    el,
    set(from, to, over = false) {
      const a = Math.round(Math.min(360, Math.max(0, from)) / TICK) * TICK;
      const b = Math.round(Math.min(360, Math.max(0, to)) / TICK) * TICK;
      const key = `${a}:${b}:${over}`;
      if (key === last) return;
      last = key;
      arc.setAttribute('stroke-dasharray', `${Math.max(0, b - a)} 360`);
      arc.setAttribute('stroke-dashoffset', String(-a));
      el.classList.toggle('over', over);
    },
  };
}
