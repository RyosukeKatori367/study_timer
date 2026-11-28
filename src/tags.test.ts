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
  it('古参は銀色のタグ', () => {
    expect(shownTag('someone', 'kosan')).toMatchObject({ name: '古参', look: 'silver' });
  });
});

describe('実績のタグ', () => {
  it('実績の報酬のタグがあり、名前がかぶっていない', async () => {
    const { TAGS, achTag } = await import('./tags');
    expect(achTag('total100')?.name).toBe('努力家');
    expect(achTag('secret')?.name).toBe('虹の使い');
    const ids = TAGS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(TAGS.every((t) => t.id.length <= 24)).toBe(true);
  });
  it('実績を受け取ったら、そのタグを持っている', async () => {
    const { settings } = await import('./store');
    const { ownedTags } = await import('./styles');
    settings.gumi = {};
    expect(ownedTags('x')).not.toContain('doryoku');
    settings.gumi = { 'a:total100': 200 };
    expect(ownedTags('x')).toContain('doryoku');
  });
});

describe('後ろに文字を足せるタグ', () => {
  it('保存の値と表示', async () => {
    const { tagById, tagValue, splitTag } = await import('./tags');
    expect(tagValue('hayaoki', ' 東京科学大<b> ')).toBe('hayaoki~東京科学大b');
    expect(tagValue('hayaoki', '')).toBe('hayaoki');
    expect(tagById('hayaoki~東京科学大')?.name.endsWith('東京科学大')).toBe(true);
    expect(tagById('hayaoki~東京科学大')?.id).toBe('hayaoki');
    expect(splitTag('hayaoki~abc')).toEqual(['hayaoki', 'abc']);
    expect(tagValue('hayaoki', 'あいうえおかきくけこさし').length).toBeLessThanOrEqual(24);
  });
});
