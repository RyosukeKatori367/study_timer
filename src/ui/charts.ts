// グラフの部品（統計タブと、グループの人の統計で使う）。
// 色は教材ごとに決まった色。文字は色を使わず、白と灰色で書く。

import { chartAxis, fmtAxis, fmtShort } from '../summary';
import { fmtHM, type DurationStyle } from '../time';
import { esc } from './dom';

export interface Seg {
  ms: number;
  color: string;
  label: string;
  /** 右に小さく出す補足（「12ラップ」など） */
  sub?: string;
  /** 教材の画像（あれば色の四角の代わりに出し、色はふちで見せる） */
  img?: string;
}

/**
 * 割合の円グラフ（ドーナツ）と、その説明の一覧。
 * 切れ目は 2px あけ、真ん中に合計を出す。segs は多い順に並べておく。
 */
export function donutHtml(segs: Seg[], title: string, size = 148): string {
  const total = segs.reduce((a, s) => a + s.ms, 0);
  if (total <= 0) return '';
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = segs.length > 1 ? 2 : 0;
  let at = 0;
  const arcs = segs
    .map((s) => {
      const len = (s.ms / total) * c;
      const dash = Math.max(0.5, len - gap);
      const arc = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${esc(s.color)}" stroke-width="${stroke}"
        stroke-dasharray="${dash.toFixed(2)} ${(c - dash).toFixed(2)}" stroke-dashoffset="${(-at).toFixed(2)}"></circle>`;
      at += len;
      return arc;
    })
    .join('');
  const rows = segs
    .map(
      (s) => `
      <div class="donut-row">
        ${
          s.img
            ? `<img class="donut-img" src="${esc(s.img)}" alt="" style="box-shadow:0 0 0 2px ${esc(s.color)}">`
            : `<i style="background:${esc(s.color)}"></i>`
        }
        <span class="donut-name">${esc(s.label)}</span>
        ${s.sub ? `<small>${esc(s.sub)}</small>` : ''}
        <span class="donut-ms">${esc(fmtHM(s.ms))}</span>
        <span class="donut-pct">${Math.round((s.ms / total) * 100)}%</span>
      </div>`,
    )
    .join('');
  return `
    <div class="donut-box">
      <div class="donut" style="width:${size}px;height:${size}px">
        <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true" style="transform:rotate(-90deg)">${arcs}</svg>
        <div class="donut-center"><small>${esc(title)}</small><b>${esc(fmtHM(total))}</b></div>
      </div>
      <div class="donut-list">${rows}</div>
    </div>`;
}

export interface Column {
  /** 下に出す日付（11/27） */
  label: string;
  /** その下の小さい字（金） */
  sub: string;
  /** 今日など、目立たせる日 */
  mark?: boolean;
  /** 下から積む順 */
  segs: { ms: number; color: string }[];
}

/**
 * 日ごとの縦の積み上げ棒（左に時間の目盛り、下に日付）。
 * 教材ごとに色を分けて、間を 2px あける。
 */
export function columnsHtml(cols: Column[], style: DurationStyle, height = 150): string {
  const totals = cols.map((c) => c.segs.reduce((a, s) => a + s.ms, 0));
  const axis = chartAxis(Math.max(...totals, 1));
  const y = (ms: number) => (ms / axis.top) * 100;
  const grid = [0, ...axis.ticks]
    .map((ms) => `<div class="vc-grid" style="bottom:${y(ms)}%"><span>${ms === 0 ? '0' : esc(fmtAxis(ms, style))}</span></div>`)
    .join('');
  const bars = cols
    .map((c, i) => {
      const t = totals[i];
      const segs = c.segs
        .filter((s) => s.ms > 0)
        .map((s) => `<span style="flex:${s.ms} 1 0;background:${esc(s.color)}"></span>`)
        .join('');
      return `<div class="vc-col${c.mark ? ' mark' : ''}">
        ${t > 0 ? `<div class="vc-val" style="bottom:calc(${y(t)}% + 3px)">${esc(fmtShort(t, style))}</div>` : ''}
        ${t > 0 ? `<div class="vc-bar" style="height:${y(t)}%">${segs}</div>` : ''}
      </div>`;
    })
    .join('');
  const labels = cols.map((c) => `<div class="vc-label${c.mark ? ' mark' : ''}">${esc(c.label)}<small>${esc(c.sub)}</small></div>`).join('');
  return `
    <div class="vc">
      <div class="vc-plot" style="height:${height}px">${grid}<div class="vc-cols">${bars}</div></div>
      <div class="vc-labels">${labels}</div>
    </div>`;
}
