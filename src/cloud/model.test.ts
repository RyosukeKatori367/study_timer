import { describe, expect, it } from 'vitest';
import { finish, lap, newRun } from '../engine';
import { credentialError, errorMessage } from './account';
import {
  CODE_LENGTH,
  chunkKey,
  firstGrapheme,
  formatCode,
  fromCloud,
  iconColors,
  isChunkKey,
  memberToday,
  newInviteCode,
  normalizeCode,
  postFromSession,
  profileError,
  toCloud,
  validIcon,
} from './model';

const MIN = 60000;
const T0 = new Date(2026, 10, 27, 15, 0).getTime();

describe('招待コード', () => {
  it('見間違えやすい文字を使わず、8文字', () => {
    for (let i = 0; i < 200; i++) {
      const c = newInviteCode();
      expect(c).toHaveLength(CODE_LENGTH);
      expect(c).toMatch(/^[A-HJKMNP-Z2-9]{8}$/); // firestore.rules の validCode と同じ
    }
  });
  it('小文字・ハイフン・空白を許して整える', () => {
    expect(normalizeCode('abcd-ef23')).toBe('ABCDEF23');
    expect(normalizeCode(' ABCD EF23 ')).toBe('ABCDEF23');
    expect(normalizeCode('ABCDEF2')).toBeNull();
    expect(normalizeCode('ABCDEF20')).toBeNull(); // 0 は使わない
    expect(formatCode('ABCDEF23')).toBe('ABCD-EF23');
  });
});

describe('アイコン', () => {
  it('最初の1文字（絵文字は1つ）だけ取る', () => {
    expect(firstGrapheme('りょう')).toBe('り');
    expect(firstGrapheme(' 👨‍👩‍👧 ')).toBe('👨‍👩‍👧');
    expect(firstGrapheme('')).toBe('');
  });
  it('黄緑のあたりは暗めにして、白い文字が読めるようにする', () => {
    const l = (h: number) => Number(/(\d+)%\)$/.exec(iconColors(h).bg)![1]);
    expect(l(100)).toBeLessThan(l(220));
    expect(iconColors(360).bg).toBe(iconColors(0).bg);
  });
  it('形を確かめる', () => {
    expect(validIcon({ c: '🐱', h: 30 })).toBe(true);
    expect(validIcon({ c: '', h: 30 })).toBe(false);
    expect(validIcon({ c: 'a', h: 360 })).toBe(false);
    expect(validIcon({ c: 'a', h: 1.5 })).toBe(false);
    expect(validIcon({ c: 'a', h: 1, img: 'http://x' })).toBe(false);
  });
  it('プロフィールの確かめ', () => {
    expect(profileError({ name: ' ', bio: '', icon: { c: 'a', h: 0 } })).toMatch('表示名');
    expect(profileError({ name: 'あ'.repeat(21), bio: '', icon: { c: 'a', h: 0 } })).toMatch('20文字');
    expect(profileError({ name: 'りょう', bio: '', icon: { c: 'a', h: 0 } })).toBeNull();
  });
});

describe('バックアップの形', () => {
  it('配列の中の配列を平らにして、元に戻せる', () => {
    const r = newRun('stopwatch', T0, { firstLap: 3, material: 'm1' });
    lap(r, T0 + 10 * MIN);
    const s = finish(r, T0 + 25 * MIN)!;
    s.leaves = [[T0 + MIN, T0 + 2 * MIN]];
    const c = toCloud(s);
    expect(c.spans!.every((v) => typeof v === 'number')).toBe(true);
    expect(fromCloud(JSON.parse(JSON.stringify(c)))).toEqual(s);
  });
  it('半月ごとの文書に分ける', () => {
    expect(chunkKey(new Date(2026, 10, 15, 23).getTime())).toBe('2026-11a');
    expect(chunkKey(new Date(2026, 10, 16, 0).getTime())).toBe('2026-11b');
    expect(isChunkKey('2026-11b')).toBe(true);
    expect(isChunkKey('state')).toBe(false);
  });
});

describe('投稿', () => {
  const r = newRun('timer', T0, { firstLap: 12, durationMs: 10 * MIN });
  lap(r, T0 + 10 * MIN);
  lap(r, T0 + 20 * MIN);
  const s = finish(r, T0 + 30 * MIN)!;
  it('選んだものだけ出す', () => {
    const p = postFromSession(s, { material: false, laps: true, lapTimes: false, comment: ' よし ' }, { name: '数学', color: '#338ced' });
    expect(p.material).toBeUndefined();
    expect(p.laps).toEqual({ from: 12, count: s.laps.length });
    expect(p.lapMs).toBeUndefined();
    expect(p.comment).toBe('よし');
    expect(p.likes).toEqual([]);
  });
  it('ラップごとの時間も出せる', () => {
    const p = postFromSession(s, { material: true, laps: false, lapTimes: true, comment: '' }, { name: '数学', color: '#338ced' });
    expect(p.material?.name).toBe('数学');
    expect(p.laps).toBeUndefined();
    expect(p.lapMs).toEqual(s.laps);
  });
  it('今日の時間は日付が変わると 0', () => {
    expect(memberToday({ todayStart: 1, todayMs: 5 }, 1)).toBe(5);
    expect(memberToday({ todayStart: 1, todayMs: 5 }, 2)).toBe(0);
  });
});

describe('ログインの入力とエラー', () => {
  it('入力を確かめる', () => {
    expect(credentialError('a@b', '12345678')).toMatch('メール');
    expect(credentialError('a@b.jp', '1234567')).toMatch('8文字');
    expect(credentialError(' a@b.jp ', '12345678')).toBeNull();
  });
  it('エラーを日本語にする', () => {
    expect(errorMessage({ code: 'auth/invalid-credential' })).toMatch('違います');
    expect(errorMessage({ code: 'auth/email-already-in-use' })).toMatch('登録されています');
    expect(errorMessage(new Error('先にプロフィール'))).toBe('先にプロフィール');
    expect(errorMessage({ code: 'something' })).toMatch('うまくいきません');
  });
});
