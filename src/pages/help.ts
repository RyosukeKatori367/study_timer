// 説明書（使い方）。時計の画面の右上の「？」から開く。章 → 記事 の木の形で、画像（番号の枠つき）と文で説明する。

import { CHAPTERS, articleText, findArticle, type Article, type Block, type Chapter } from '../help/content';
import { $, esc, html } from '../ui/dom';

type View = { kind: 'home' } | { kind: 'chapter'; id: string } | { kind: 'article'; id: string } | { kind: 'search'; q: string };

const IMG = (name: string) => `${import.meta.env.BASE_URL}help/${name}.webp`;
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫';

const icon = (path: string, size = 22) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

function blockHtml(b: Block): string {
  if ('p' in b) return `<p class="help-p">${esc(b.p)}</p>`;
  if ('tip' in b) return `<div class="help-tip"><b>ヒント</b>${esc(b.tip)}</div>`;
  if ('steps' in b) return `<ol class="help-steps">${b.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
  if ('see' in b) {
    const links = b.see
      .map((id) => findArticle(id))
      .filter((x) => x !== null)
      .map((x) => `<button type="button" class="help-link" data-article="${esc(x.article.id)}">${esc(x.article.title)}<span class="chevron">›</span></button>`)
      .join('');
    return `<div class="help-see"><div class="help-see-title">関連</div>${links}</div>`;
  }
  return `
    <figure class="help-fig">
      <img src="${IMG(b.img)}" alt="${esc(b.cap ?? '画面の例')}" loading="lazy" decoding="async">
      ${b.cap ? `<figcaption>${esc(b.cap)}</figcaption>` : ''}
    </figure>
    ${
      b.marks?.length
        ? `<ol class="help-marks">${b.marks.map((m, i) => `<li><span class="help-num">${CIRCLED[i] ?? i + 1}</span><span>${esc(m)}</span></li>`).join('')}</ol>`
        : ''
    }`;
}

function homeHtml(): string {
  return `
    <label class="help-search"><input type="search" class="input" placeholder="さがす（例：ガチャ、バックアップ）" enterkeyhint="search"></label>
    <div class="help-chapters">${CHAPTERS.map(
      (c) => `
      <button type="button" class="help-chapter" data-chapter="${esc(c.id)}">
        <span class="help-chapter-icon">${icon(c.icon)}</span>
        <span class="help-chapter-main"><b>${esc(c.title)}</b><small>${esc(c.lead)}</small></span>
        <span class="chevron">›</span>
      </button>`,
    ).join('')}</div>`;
}

function chapterHtml(c: Chapter): string {
  return `
    <div class="help-lead">${esc(c.lead)}</div>
    <div class="sns-card">${c.articles
      .map(
        (a) => `<button type="button" class="sns-row" data-article="${esc(a.id)}"><span class="sns-row-main">${esc(a.title)}</span><span class="chevron">›</span></button>`,
      )
      .join('')}</div>`;
}

function articleHtml(a: Article, c: Chapter, i: number): string {
  const prev = c.articles[i - 1];
  const next = c.articles[i + 1];
  return `
    <article class="help-article">
      <div class="help-crumb">${esc(c.title)}</div>
      <h2 class="help-title">${esc(a.title)}</h2>
      ${a.blocks.map(blockHtml).join('')}
      <div class="help-pager">
        ${prev ? `<button type="button" class="help-page-btn" data-article="${esc(prev.id)}"><small>前へ</small>${esc(prev.title)}</button>` : '<span></span>'}
        ${next ? `<button type="button" class="help-page-btn next" data-article="${esc(next.id)}"><small>次へ</small>${esc(next.title)}</button>` : '<span></span>'}
      </div>
    </article>`;
}

function searchHtml(q: string): string {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hits = CHAPTERS.flatMap((c) => c.articles.map((a) => ({ c, a, text: articleText(a).toLowerCase() }))).filter((x) =>
    words.every((w) => x.text.includes(w)),
  );
  return `
    <label class="help-search"><input type="search" class="input" value="${esc(q)}" enterkeyhint="search"></label>
    ${
      hits.length
        ? `<div class="sns-card">${hits
            .map(
              (h) =>
                `<button type="button" class="sns-row" data-article="${esc(h.a.id)}"><span class="sns-row-main"><span>${esc(h.a.title)}</span><span class="sns-row-sub">${esc(h.c.title)}</span></span><span class="chevron">›</span></button>`,
            )
            .join('')}</div>`
        : '<p class="sns-lead">見つかりませんでした</p>'
    }`;
}

/** 説明書を開く（記事の id を渡すと、その記事から） */
export function openHelp(articleId?: string): void {
  const stack: View[] = [{ kind: 'home' }];
  if (articleId && findArticle(articleId)) stack.push({ kind: 'article', id: articleId });
  const host = html('<div class="fullpage help" role="dialog" aria-modal="true" aria-label="使い方"></div>');
  $('#app').append(host);

  const render = (keepFocus = false) => {
    const v = stack.at(-1)!;
    let title = '使い方';
    let body = '';
    if (v.kind === 'home') body = homeHtml();
    else if (v.kind === 'chapter') {
      const c = CHAPTERS.find((x) => x.id === v.id)!;
      title = c.title;
      body = chapterHtml(c);
    } else if (v.kind === 'article') {
      const f = findArticle(v.id)!;
      title = f.chapter.title;
      body = articleHtml(f.article, f.chapter, f.index);
    } else {
      title = 'さがす';
      body = searchHtml(v.q);
    }
    host.innerHTML = `
      <div class="sns">
        <div class="sns-head">
          <button type="button" class="sns-back" data-back aria-label="${stack.length > 1 ? '戻る' : '閉じる'}">${stack.length > 1 ? '‹' : '×'}</button>
          <div class="sns-head-title">${esc(title)}</div>
          ${stack.length > 1 ? '<button type="button" class="sns-back help-close" data-close aria-label="閉じる">×</button>' : '<span class="sns-head-side"></span>'}
        </div>
        ${body}
      </div>`;
    if (!keepFocus) host.scrollTop = 0;
    const input = host.querySelector<HTMLInputElement>('.help-search input');
    if (input) {
      if (keepFocus) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
      input.oninput = () => {
        const q = input.value;
        const top = stack.at(-1)!;
        if (!q.trim()) {
          if (top.kind === 'search') stack.pop();
        } else if (top.kind === 'search') top.q = q;
        else stack.push({ kind: 'search', q });
        render(true);
      };
    }
  };

  host.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const a = t.closest<HTMLElement>('[data-article]');
    const c = t.closest<HTMLElement>('[data-chapter]');
    if (t.closest('[data-close]')) host.remove();
    else if (t.closest('[data-back]')) {
      if (stack.length > 1) {
        stack.pop();
        render();
      } else host.remove();
    } else if (a) {
      // 前へ・次へは積み重ねずに入れ替える
      if (stack.at(-1)!.kind === 'article' && t.closest('.help-pager')) stack.pop();
      stack.push({ kind: 'article', id: a.dataset.article! });
      render();
    } else if (c) {
      stack.push({ kind: 'chapter', id: c.dataset.chapter! });
      render();
    }
  });
  render();
}
