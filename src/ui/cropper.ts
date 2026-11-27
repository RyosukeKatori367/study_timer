// 画像を正方形に切り抜く画面（教材の画像・プロフィールのアイコン）。
// 指で動かす・2本指で広げる、またはスライダーで拡大。外にはみ出さないようにする。

import { $, html } from './dom';

export interface CropOptions {
  /** 書き出す大きさ（px 四方） */
  size?: number;
  /** 丸く見せる（プロフィール用。書き出しは四角のまま） */
  round?: boolean;
  /** 書き出す文字数の上限（data URL の長さ）。超えたら画質を下げる */
  maxLength?: number;
}

/** 画像を選んで切り抜く。やめたら null */
export async function cropImage(file: File, opt: CropOptions = {}): Promise<string | null> {
  if (!file.type.startsWith('image/')) throw new Error('画像を選んでください');
  const bitmap = await createImageBitmap(file);
  try {
    return await openCropper(bitmap, opt);
  } finally {
    bitmap.close();
  }
}

function openCropper(img: ImageBitmap, { size = 96, round = false, maxLength = 20000 }: CropOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const host = html(`
      <div id="cropper" role="dialog" aria-modal="true" aria-label="画像を切り抜く">
        <div class="crop-title">動かして、広げて、位置を決めます</div>
        <div class="crop-stage${round ? ' round' : ''}"><canvas></canvas></div>
        <input class="crop-zoom" type="range" min="1" max="4" step="0.01" value="1" aria-label="拡大">
        <div class="btn-row">
          <button type="button" class="btn ghost" data-cancel>やめる</button>
          <button type="button" class="btn primary" data-ok>決める</button>
        </div>
      </div>`);
    document.body.append(host);
    const stage = $('.crop-stage', host);
    const canvas = $<HTMLCanvasElement>('canvas', host);
    const zoomInput = $<HTMLInputElement>('.crop-zoom', host);
    const S = stage.clientWidth; // 見えている枠の大きさ
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = canvas.height = Math.round(S * dpr);
    const ctx = canvas.getContext('2d')!;

    // 拡大 1 のとき、画像の短い辺が枠にぴったり
    const base = S / Math.min(img.width, img.height);
    let zoom = 1;
    let cx = img.width / 2; // 枠の中心に来る、画像の中の点
    let cy = img.height / 2;

    const clamp = () => {
      const half = S / 2 / (base * zoom);
      cx = Math.min(Math.max(cx, half), img.width - half);
      cy = Math.min(Math.max(cy, half), img.height - half);
    };
    const draw = (target: CanvasRenderingContext2D, px: number) => {
      const k = (base * zoom * px) / S;
      target.imageSmoothingQuality = 'high';
      target.clearRect(0, 0, px, px);
      target.drawImage(img, px / 2 - cx * k, px / 2 - cy * k, img.width * k, img.height * k);
    };
    const render = () => {
      clamp();
      draw(ctx, canvas.width);
    };
    const setZoom = (z: number, fx = S / 2, fy = S / 2) => {
      // 指の下の点がずれないように拡大する
      const before = base * zoom;
      const nz = Math.min(Math.max(z, 1), 4);
      const after = base * nz;
      cx += (fx - S / 2) / before - (fx - S / 2) / after;
      cy += (fy - S / 2) / before - (fy - S / 2) / after;
      zoom = nz;
      zoomInput.value = String(nz);
      render();
    };

    // 指の動き
    const points = new Map<number, { x: number; y: number }>();
    let pinch: { dist: number; zoom: number } | null = null;
    const local = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    stage.addEventListener('pointerdown', (e) => {
      stage.setPointerCapture(e.pointerId);
      points.set(e.pointerId, local(e));
      if (points.size === 2) {
        const [a, b] = [...points.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      }
    });
    stage.addEventListener('pointermove', (e) => {
      const prev = points.get(e.pointerId);
      if (!prev) return;
      const now = local(e);
      points.set(e.pointerId, now);
      if (points.size === 1) {
        cx -= (now.x - prev.x) / (base * zoom);
        cy -= (now.y - prev.y) / (base * zoom);
        render();
      } else if (points.size === 2 && pinch) {
        const [a, b] = [...points.values()];
        setZoom((pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
    });
    const up = (e: PointerEvent) => {
      points.delete(e.pointerId);
      if (points.size < 2) pinch = null;
    };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = stage.getBoundingClientRect();
        setZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), e.clientX - r.left, e.clientY - r.top);
      },
      { passive: false },
    );
    zoomInput.oninput = () => setZoom(Number(zoomInput.value));

    const done = (v: string | null) => {
      host.remove();
      resolve(v);
    };
    $('[data-cancel]', host).onclick = () => done(null);
    $('[data-ok]', host).onclick = () => {
      const out = document.createElement('canvas');
      out.width = out.height = size;
      draw(out.getContext('2d')!, size);
      for (const q of [0.82, 0.7, 0.55, 0.4]) {
        const url = out.toDataURL('image/jpeg', q);
        if (url.length <= maxLength) return done(url);
      }
      done(out.toDataURL('image/jpeg', 0.3));
    };
    render();
  });
}

/** data URL の画像から、色を決めるための小さなピクセルの並びを取り出す */
export async function samplePixels(dataUrl: string, px = 32): Promise<Uint8ClampedArray> {
  const im = new Image();
  im.src = dataUrl;
  await im.decode();
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(im, 0, 0, px, px);
  return ctx.getImageData(0, 0, px, px).data;
}
