import { describe, expect, it } from 'vitest';
import { DEVELOPER_UIDS } from './cloud/model';
import { shownTag } from './tags';

describe('タグ', () => {
  const dev = DEVELOPER_UIDS[0];
  it('開発者は、決めていなければ開発者タグ', () => {
    expect(shownTag(dev, undefined)?.id).toBe('dev');
    expect(shownTag(dev, 'none')).toBeNull();
    expect(shownTag(dev, 'gouun')?.id).toBe('gouun');
  });
  it('ほかの人は開発者タグを付けられない', () => {
    expect(shownTag('someone', 'dev')).toBeNull();
    expect(shownTag('someone', undefined)).toBeNull();
    expect(shownTag('someone', 'gouun')?.name).toBe('豪運');
    expect(shownTag('someone', 'unknown')).toBeNull();
  });
});
