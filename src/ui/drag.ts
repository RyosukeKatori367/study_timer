// ≡ をつかんで並べ替える（教材の並べ替え・ホームの並べ替え）。

/** つかむところの ≡ */
export const HANDLE = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 8h16M4 12h16M4 16h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

/** ≡ をつかんで、同じ一覧の中で上下に動かす。離したら onDrop */
export function bindDrag(handle: HTMLElement, onDrop: () => void): void {
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
