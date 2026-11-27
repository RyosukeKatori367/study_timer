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
  matBreakdown,
  ranking,
  recentDays,
  recentMats,
  dateKey,
  weekKeys,
  replyError,
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
    const p = postFromSession(s, { material: false, laps: true, lapTimes: false, away: false, comment: ' よし ' }, { name: '数学', color: '#338ced' });
    expect(p.material).toBeUndefined();
    expect(p.laps).toEqual({ from: 12, count: s.laps.length });
    expect(p.lapMs).toBeUndefined();
    expect(p.comment).toBe('よし');
    expect(p.likes).toEqual([]);
  });
  it('ラップごとの時間も出せる', () => {
    const p = postFromSession(s, { material: true, laps: false, lapTimes: true, away: false, comment: '' }, { name: '数学', color: '#338ced' });
    expect(p.material?.name).toBe('数学');
    expect(p.laps).toBeUndefined();
    expect(p.lapMs).toEqual(s.laps);
  });
  it('離れた回数と時間は、選んだときだけ出す', () => {
    const t = { ...s, leaves: [[T0, T0 + MIN], [T0 + 5 * MIN, T0 + 7 * MIN]] as [number, number][] };
    const base = { material: false, laps: false, lapTimes: false, comment: '' };
    expect(postFromSession(t, { ...base, away: false }, null).away).toBeUndefined();
    expect(postFromSession(t, { ...base, away: true }, null).away).toEqual({ n: 2, ms: 3 * MIN });
    expect(postFromSession(s, { ...base, away: true }, null).away).toBeUndefined();
  });
  it('返信の長さ', () => {
    expect(replyError('  ')).toMatch('入れて');
    expect(replyError('あ'.repeat(141))).toMatch('140');
    expect(replyError('ナイス')).toBeNull();
  });
});

describe('ランキング', () => {
  const H = 60 * MIN;
  it('日付はその人の1日の区切りで決める', () => {
    const late = new Date(2026, 10, 28, 2, 0).getTime(); // 28日の 2:00
    expect(dateKey(late)).toBe('2026-11-28');
    expect(dateKey(late, 4 * 60)).toBe('2026-11-27'); // 4:00 区切りなら前の日
  });
  it('直近 14 日の日ごとの合計を出す', () => {
    const now = new Date(2026, 10, 27, 20, 0).getTime();
    const ss = [
      { start: new Date(2026, 10, 27, 9).getTime(), studyMs: H },
      { start: new Date(2026, 10, 27, 15).getTime(), studyMs: 2 * H },
      { start: new Date(2026, 10, 20, 9).getTime(), studyMs: H },
      { start: new Date(2026, 10, 1, 9).getTime(), studyMs: H }, // 古いので入れない
    ].map((x, i) => ({ id: String(i), mode: 'timer' as const, end: x.start + x.studyMs, laps: [], firstLap: 1, ...x }));
    expect(recentDays(ss, now)).toEqual({ '2026-11-27': 3 * H, '2026-11-20': H });
  });
  it('今週の 7 日（月曜始まり）', () => {
    const keys = weekKeys(new Date(2026, 10, 27, 20).getTime(), { weekStartsOn: 1 }); // 金曜
    expect(keys[0]).toBe('2026-11-23');
    expect(keys[6]).toBe('2026-11-29');
  });
  it('多い順、同じ時間は同じ順位', () => {
    const list: { n: string; days?: Record<string, number> }[] = [
        { n: 'a', days: { d1: H } },
        { n: 'b', days: { d1: 2 * H, d2: H } },
        { n: 'c', days: { d2: H } },
        { n: 'd' },
    ];
    const r = ranking(list, ['d1']);
    expect(r.map((x) => [x.item.n, x.rank])).toEqual([['b', 1], ['a', 2], ['c', 3], ['d', 3]]);
    expect(ranking([{ days: { d1: H } }, { days: { d1: H } }], ['d1']).map((x) => x.rank)).toEqual([1, 1]);
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

describe('ランキングの教材ごとの内訳', () => {
  const H = 3600000;
  it('日をまたいで同じ教材を足し、多い順に並べる', () => {
    const m = {
      days: { d1: 3 * H, d2: 2 * H },
      mats: {
        d1: { a: { n: 'A', c: '#1', ms: 2 * H }, b: { n: 'B', c: '#2', ms: H } },
        d2: { b: { n: 'B', c: '#2', ms: 2 * H } },
      },
    };
    expect(matBreakdown(m, ['d1', 'd2']).map((x) => [x.key, x.ms])).toEqual([['b', 3 * H], ['a', 2 * H]]);
    expect(matBreakdown(m, ['d1']).map((x) => x.key)).toEqual(['a', 'b']);
  });
  it('内訳のない古いデータは「内訳なし」にまとめる', () => {
    expect(matBreakdown({ days: { d1: H } }, ['d1'])).toEqual([{ key: '?', n: '内訳なし', c: '#5a5a5a', ms: H }]);
  });
  it('記録から日ごと・教材ごとの時間を出す', () => {
    const now = new Date(2026, 10, 27, 20).getTime();
    const ss = [
      { material: 'm1', start: new Date(2026, 10, 27, 9).getTime(), studyMs: H },
      { material: 'm1', start: new Date(2026, 10, 27, 12).getTime(), studyMs: H },
      { start: new Date(2026, 10, 27, 15).getTime(), studyMs: H },
    ].map((x, i) => ({ id: String(i), mode: 'timer' as const, end: x.start + x.studyMs, laps: [], firstLap: 1, ...x }));
    const r = recentMats(ss, now, 0, (id) => ({ n: id ?? '教材なし', c: id ? '#338ced' : '#d9d9d9' }));
    expect(r['2026-11-27']).toEqual({ m1: { n: 'm1', c: '#338ced', ms: 2 * H }, _: { n: '教材なし', c: '#d9d9d9', ms: H } });
  });
});
