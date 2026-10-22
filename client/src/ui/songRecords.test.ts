import { describe, expect, it } from 'vitest';
import type { ScoreRecord, Song } from '../api/client';
import { bestByTier, inFolder, otherBest, otherLabel, recordHeadline, recordOf, recordScore, recordsOn, sameMark, savedMark, savedRecordsOn, sortSongs, tierMark } from './songRecords';

const record = (difficulty: string, score: number, lamp: string, extra: Partial<ScoreRecord> = {}): ScoreRecord => ({
  chartId: `${difficulty}${score}`,
  songId: 's',
  keyMode: '4K',
  system: 'DJMAX',
  difficulty,
  level: 5,
  seed: 1,
  score,
  rate: score / 10_000,
  maxCombo: 10,
  lamp,
  plays: 1,
  ...extra,
});

const song = (id: string, title: string, records: ScoreRecord[] = [], extra: Partial<Song> = {}) =>
  ({ id, title, artist: 'A', bpm: null, records, ...extra }) as Song;

describe('song select folders', () => {
  const none = new Set<string>();

  it('미플레이 counts only the bests on this key mode and difficulty system', () => {
    const other = song('a', 'A', [record('NM', 900_000, 'CLEAR', { keyMode: '7K+1S' }), record('NM', 900_000, 'CLEAR', { system: 'EZ2ON' })]);
    expect(inFolder(other, 'unplayed', '4K', 'DJMAX', none)).toBe(true);
    expect(inFolder(song('b', 'B', [record('NM', 900_000, 'FAILED')]), 'unplayed', '4K', 'DJMAX', none)).toBe(false);
  });

  it('미클리어 is a tier whose every play failed; a clear on another chart of it counts', () => {
    expect(inFolder(song('a', 'A', [record('HD', 700_000, 'FAILED'), record('NM', 950_000, 'CLEAR')]), 'uncleared', '4K', 'DJMAX', none)).toBe(true);
    expect(inFolder(song('b', 'B', [record('HD', 700_000, 'FAILED'), record('HD', 650_000, 'EASY CLEAR', { chartId: 'x' })]), 'uncleared', '4K', 'DJMAX', none)).toBe(false);
    expect(inFolder(song('c', 'C'), 'uncleared', '4K', 'DJMAX', none)).toBe(false);
  });

  it('풀콤 미달 is a tier cleared short of MAX COMBO on this key mode and difficulty system', () => {
    expect(inFolder(song('a', 'A', [record('HD', 900_000, 'FAILED'), record('HD', 950_000, 'HARD CLEAR', { chartId: 'x' })]), 'noFullCombo', '4K', 'DJMAX', none)).toBe(true);
    expect(inFolder(song('b', 'B', [record('HD', 900_000, 'CLEAR'), record('HD', 990_000, 'MAX COMBO', { chartId: 'x' })]), 'noFullCombo', '4K', 'DJMAX', none)).toBe(false);
    expect(inFolder(song('c', 'C', [record('NM', 990_000, 'PERFECT PLAY'), record('HD', 700_000, 'FAILED')]), 'noFullCombo', '4K', 'DJMAX', none)).toBe(false);
    expect(inFolder(song('d', 'D', [record('NM', 900_000, 'EASY CLEAR', { keyMode: '7K+1S' })]), 'noFullCombo', '4K', 'DJMAX', none)).toBe(false);
    expect(inFolder(song('e', 'E'), 'noFullCombo', '4K', 'DJMAX', none)).toBe(false);
  });

  it('즐겨찾기 is the marked songs', () => {
    expect(inFolder(song('a', 'A'), 'favorites', '4K', 'DJMAX', new Set(['a']))).toBe(true);
    expect(inFolder(song('b', 'B'), 'favorites', '4K', 'DJMAX', new Set(['a']))).toBe(false);
  });

  it('an edited or imported chart is its own: on any difficulty system, and a folder counts it alone', () => {
    const imported = record('HARD', 800_000, 'FAILED', { system: 'GRG', kind: 'imported', chartId: 'cbms' });
    const s = song('a', 'A', [imported]);
    expect(recordsOn(s, '4K', 'GRG')).toEqual([]);
    expect(savedRecordsOn(s, '4K')).toEqual([imported]);
    expect(savedRecordsOn(s, '7K+1S')).toEqual([]);
    // played on DJMAX all the same, and not cleared there
    expect(inFolder(s, 'unplayed', '4K', 'DJMAX', none)).toBe(false);
    expect(inFolder(s, 'uncleared', '4K', 'DJMAX', none)).toBe(true);
    // a generated HARD clear does not clear the imported chart (it is no tier's)
    const both = song('b', 'B', [imported, record('HARD', 900_000, 'CLEAR', { system: 'GRG', kind: 'generated' })]);
    expect(inFolder(both, 'uncleared', '4K', 'GRG', none)).toBe(true);
    expect(inFolder(both, 'noFullCombo', '4K', 'GRG', none)).toBe(true);
    expect(recordOf(both, 'cbms')).toBe(imported);
    expect(recordOf(both, 'cnone')).toBeNull();
  });

  it('the best of a tier is its highest score', () => {
    const best = bestByTier([record('NM', 800_000, 'CLEAR'), record('NM', 910_000, 'FAILED'), record('HD', 700_000, 'CLEAR')]);
    expect(best.get('NM')?.score).toBe(910_000);
    expect(best.get('HD')?.score).toBe(700_000);
    expect(best.has('MX')).toBe(false);
  });
});

describe('song list marks and record headlines', () => {
  const records = [record('HD', 970_000, 'HARD CLEAR', { level: 9, chartId: 'old' }), record('HD', 900_000, 'FAILED', { level: 8, chartId: 'other' })];

  it('a tier shows the level and the lamp of the chart Enter plays once known, another chart\'s lamp marked as theirs', () => {
    // its own play (FAILED), though another chart of the tier was HARD CLEARed
    expect(tierMark(records, 'HD', { chartId: 'other', level: 8, noteCount: 300, seed: 1 })).toEqual({ level: 8, levelScale: undefined, lamp: 'FAILED' });
    // never played itself: the tier's best lamp, another chart's
    expect(tierMark(records, 'HD', { chartId: 'new', level: 10, noteCount: 320, seed: 2 })).toEqual({ level: 10, levelScale: undefined, lamp: 'HARD CLEAR', other: true });
    expect(tierMark([], 'HD', { chartId: 'new', level: 10, noteCount: 320, seed: 2 })).toEqual({ level: 10, levelScale: undefined, lamp: null, other: false });
    expect(tierMark(records, 'HD', { chartId: 'sc', level: 4, levelScale: 'SC', noteCount: 320, seed: 2 }).levelScale).toBe('SC');
    // not known yet: the level of its best play, the best lamp of its charts
    expect(tierMark(records, 'HD', null)).toEqual({ level: 9, lamp: 'HARD CLEAR' });
    expect(tierMark(records, 'MX', null)).toEqual({ level: null, lamp: null });
  });

  it('two cells are the same when they show the same', () => {
    expect(sameMark({ level: 8, lamp: 'CLEAR' }, { level: 8, lamp: 'CLEAR', other: false })).toBe(true);
    expect(sameMark({ level: 8, lamp: 'CLEAR' }, { level: 8, lamp: 'CLEAR', other: true })).toBe(false);
    expect(sameMark({ level: 8, lamp: 'CLEAR' }, { level: 9, lamp: 'CLEAR' })).toBe(false);
    expect(sameMark({ level: 8, lamp: null, levelScale: 'SC' }, { level: 8, lamp: null })).toBe(false);
    expect(sameMark(null, null)).toBe(true);
    expect(sameMark(null, { level: null, lamp: null })).toBe(false);
  });

  it("a plate whose chart was never played names the tier's best on another chart, and what that chart is", () => {
    expect(otherBest(records, 'HD', 'new')?.chartId).toBe('old');
    expect(otherBest(records, 'HD', 'old')?.chartId).toBe('other');
    expect(otherBest(records, 'MX', 'new')).toBeNull();
    // the default pattern as an earlier generator made it, or another pattern
    const older = record('HD', 900_000, 'CLEAR', { defaultSeed: true, generatorVersion: '0.9.5' });
    expect(otherLabel(older, '0.9.7')).toBe('이전 생성기');
    expect(otherLabel({ ...older, defaultSeed: false }, '0.9.7')).toBe('다른 패턴');
    expect(otherLabel({ ...older, generatorVersion: '0.9.7' }, '0.9.7')).toBe('다른 패턴');
    expect(otherLabel(older, null)).toBe('다른 패턴');
  });

  it('the saved charts show their best lamp, at the level the file gives', () => {
    const bms = record('HARD', 800_000, 'CLEAR', { kind: 'imported', level: 7, sourceLevel: '9', name: 'ANOTHER' });
    const osu = record('NORMAL', 950_000, 'EASY CLEAR', { kind: 'imported', level: 5, sourceLevel: null, name: 'Insane' });
    expect(savedMark([osu, bms])).toEqual({ level: 9, lamp: 'CLEAR', name: 'ANOTHER' });
    expect(savedMark([osu])).toEqual({ level: 5, lamp: 'EASY CLEAR', name: 'Insane' });
    expect(savedMark([])).toBeNull();
  });

  it('a score rule heads a record with its own number, else its RATE', () => {
    const r = { rate: 94.813, exScore: 1234, weightedScore: 931_900 };
    expect(recordHeadline(r, 'RESPECT')).toEqual({ label: 'RATE', value: '94.81%' });
    expect(recordHeadline(r, 'GRADE')).toEqual({ label: 'S+', value: '931,900' });
    expect(recordHeadline(r, 'EXSCORE')).toEqual({ label: 'EX', value: '1,234' });
    expect(recordHeadline({ rate: 90, exScore: null, weightedScore: null }, 'EXSCORE')).toEqual({ label: 'RATE', value: '90.00%' });
    expect(recordHeadline({ rate: 90 }, 'GRADE')).toEqual({ label: 'RATE', value: '90.00%' });
  });

  it("a record's score and grade are the score rule's", () => {
    const r = { score: 912_000, exScore: 1234, weightedScore: 931_900 };
    expect(recordScore(r, 'RESPECT')).toEqual({ score: 912_000, grade: 'S' });
    expect(recordScore(r, 'GRADE')).toEqual({ score: 931_900, grade: 'S+' });
    expect(recordScore(r, 'EXSCORE')).toEqual({ score: 1234, grade: null });
    expect(recordScore({ score: 912_000, weightedScore: null }, 'GRADE')).toEqual({ score: null, grade: null });
  });
});

describe('song select order', () => {
  const list = [song('1', '봄비', [], { bpm: 140, artist: 'z' }), song('2', 'Track 10', [], { bpm: null, artist: 'b' }), song('3', 'Track 9', [], { bpm: 96, artist: 'a' })];
  const on = { keyMode: '4K', system: 'DJMAX', difficulty: 'HD' } as const;

  it('keeps the library order for 추가순 and sorts the others', () => {
    expect(sortSongs(list, 'added', on).map((s) => s.id)).toEqual(['1', '2', '3']);
    // Korean order: Hangul before Latin, numbers by their value
    expect(sortSongs(list, 'title', on).map((s) => s.title)).toEqual(['봄비', 'Track 9', 'Track 10']);
    expect(sortSongs(list, 'artist', on).map((s) => s.id)).toEqual(['3', '2', '1']);
    // songs without a BPM (not analysed yet) go last
    expect(sortSongs(list, 'bpm', on).map((s) => s.id)).toEqual(['3', '1', '2']);
  });

  // a: HD Lv.9 HARD CLEAR 97%, played at 300; b: HD Lv.7 FAILED 70% (and a NM MAX COMBO); c: only NM; d: HD on 7K+1S
  const played = [
    song('a', 'A', [record('HD', 970_000, 'HARD CLEAR', { level: 9, lastPlayedAt: 300 })]),
    song('b', 'B', [record('HD', 700_000, 'FAILED', { level: 7, lastPlayedAt: 100 }), record('NM', 990_000, 'MAX COMBO', { level: 4, lastPlayedAt: 500 })]),
    song('c', 'C', [record('NM', 900_000, 'CLEAR', { level: 3, lastPlayedAt: 200 })]),
    song('d', 'D', [record('HD', 990_000, 'PERFECT PLAY', { keyMode: '7K+1S', level: 1, lastPlayedAt: 400 })]),
  ];

  it('orders by the selected tier: level lowest first, lamp and RATE worst first, unknown last', () => {
    expect(sortSongs(played, 'level', on).map((s) => s.id)).toEqual(['b', 'a', 'c', 'd']);
    expect(sortSongs(played, 'lamp', on).map((s) => s.id)).toEqual(['b', 'a', 'c', 'd']);
    expect(sortSongs(played, 'rate', on).map((s) => s.id)).toEqual(['b', 'a', 'c', 'd']);
    // another tier: only the songs with its records come first
    expect(sortSongs(played, 'level', { ...on, difficulty: 'NM' }).map((s) => s.id)).toEqual(['c', 'b', 'a', 'd']);
    expect(sortSongs(played, 'lamp', { ...on, difficulty: 'NM' }).map((s) => s.id)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('orders by the level of the chart Enter plays once known, and a song never played on the tier by its saved charts', () => {
    // b's HD chart is known to be Lv.11 now (a new pattern), d's Lv.2 (never played on 4K)
    const known = (s: Song) => ({ b: 11, d: 2 })[s.id] ?? null;
    expect(sortSongs(played, 'level', { ...on, knownLevel: known }).map((s) => s.id)).toEqual(['d', 'a', 'b', 'c']);
    // e has only an imported chart (BMS Lv.12 as its file says, CLEAR 88%); f nothing on 4K
    const imported = [song('e', 'E', [record('HARD', 880_000, 'CLEAR', { kind: 'imported', level: 6, sourceLevel: '12' })]), song('f', 'F')];
    const all = [...played, ...imported];
    expect(sortSongs(all, 'lamp', on).map((s) => s.id)).toEqual(['b', 'e', 'a', 'c', 'd', 'f']);
    expect(sortSongs(all, 'rate', on).map((s) => s.id)).toEqual(['b', 'e', 'a', 'c', 'd', 'f']);
    expect(sortSongs(all, 'level', on).map((s) => s.id)).toEqual(['b', 'a', 'e', 'c', 'd', 'f']);
  });

  it('orders by the last play on any key mode, newest first, songs never played last', () => {
    expect(sortSongs([...played, song('e', 'E')], 'recent', on).map((s) => s.id)).toEqual(['b', 'd', 'a', 'c', 'e']);
  });
});
