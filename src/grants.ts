// 配られたタグ（古参など）。持っているかどうかは Firebase の grants/{uid} にあり、ここではその写しを端末に覚えておく。
// 受け取り・読み込みは cloud/grants.ts。

const KEY = 'studytimer:grants';

export const GRANTS_CHANGE = 'grants:change';

interface Cache {
  uid: string;
  tags: string[];
}

function read(): Cache | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Cache | null;
  } catch {
    return null;
  }
}

/** その人に配られたタグ（src/tags.ts の id） */
export function grantedTags(uid: string | undefined): string[] {
  const c = read();
  return uid && c?.uid === uid && Array.isArray(c.tags) ? c.tags.filter((t) => typeof t === 'string') : [];
}

export function saveGranted(uid: string, tags: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ uid, tags }));
  } catch {
    /* 覚えられなくても、次に読み直す */
  }
}
