import { describe, expect, it } from 'vitest';
import type { ScoreRecord, Song } from '../api/client';
import { bestByTier, inFolder, nextSongSort, otherBest, otherLabel, recordHeadline, recordOf, recordScore, recordsOn, sameMark, savedMark, savedRecordsOn, sortSaid, sortSongs, tierMark } from './songRecords';

const record = (difficulty: string, score: number, lamp: string, extra: Partial<ScoreRecord> = {}): ScoreRecord => ({
  chartId: `${difficulty}${score}`,
  songId: 's',
  keyMode: '4K',
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

describe('which songs the song select lists', () => {
  it('전체 is every song, 즐겨찾기 the marked ones', () => {
    expect(inFolder(song('a', 'A'), 'all', new Set())).toBe(true);
    expect(inFolder(song('a', 'A'), 'favorites', new Set(['a']))).toBe(true);
    expect(inFolder(song('b', 'B'), 'favorites', new Set(['a']))).toBe(false);
  });

  it('keeps the bests of this key mode and the five tiers apart from the rest', () => {
    // records of the removed EASY tier and the DJMAX and EZ2ON difficulty systems
    const other = song('a', 'A', [record('NORMAL', 900_000, 'CLEAR', { keyMode: '7K+1S' }), record('EASY', 900_000, 'CLEAR'), record('MX', 900_000, 'CLEAR'), record('SHD', 900_000, 'CLEAR')]);
    expect(recordsOn(other, '4K')).toEqual([]);
  });

  it('an edited or imported chart is its own', () => {
    const imported = record('HARD', 800_000, 'FAILED', { kind: 'imported', chartId: 'cbms' });
    const s = song('a', 'A', [imported]);
    expect(recordsOn(s, '4K')).toEqual([]);
    expect(savedRecordsOn(s, '4K')).toEqual([imported]);
    expect(savedRecordsOn(s, '7K+1S')).toEqual([]);
    const both = song('b', 'B', [imported, record('HARD', 900_000, 'CLEAR', { kind: 'generated' })]);
    expect(recordOf(both, 'cbms')).toBe(imported);
    expect(recordOf(both, 'cnone')).toBeNull();
  });

  it('the best of a tier is its highest score', () => {
    const best = bestByTier([record('NORMAL', 800_000, 'CLEAR'), record('NORMAL', 910_000, 'FAILED'), record('HARD', 700_000, 'CLEAR')]);
    expect(best.get('NORMAL')?.score).toBe(910_000);
    expect(best.get('HARD')?.score).toBe(700_000);
    expect(best.has('MASTER')).toBe(false);
  });
});

describe('song list marks and record headlines', () => {
  const records = [record('HARD', 970_000, 'HARD CLEAR', { level: 9, chartId: 'old' }), record('HARD', 900_000, 'FAILED', { level: 8, chartId: 'other' })];

  it('a tier shows the level and the lamp of the chart Enter plays once known, another chart\'s lamp marked as theirs', () => {
    // its own play (FAILED), though another chart of the tier was HARD CLEARed
    expect(tierMark(records, 'HARD', { chartId: 'other', level: 8, noteCount: 300, seed: 1 })).toEqual({ level: 8, lamp: 'FAILED' });
    // never played itself: the tier's best lamp, another chart's
    expect(tierMark(records, 'HARD', { chartId: 'new', level: 10, noteCount: 320, seed: 2 })).toEqual({ level: 10, lamp: 'HARD CLEAR', other: true });
    expect(tierMark([], 'HARD', { chartId: 'new', level: 10, noteCount: 320, seed: 2 })).toEqual({ level: 10, lamp: null, other: false });
    // not known yet: the level of its best play, the best lamp of its charts
    expect(tierMark(records, 'HARD', null)).toEqual({ level: 9, lamp: 'HARD CLEAR' });
    expect(tierMark(records, 'MASTER', null)).toEqual({ level: null, lamp: null });
  });

  it('two cells are the same when they show the same', () => {
    expect(sameMark({ level: 8, lamp: 'CLEAR' }, { level: 8, lamp: 'CLEAR', other: false })).toBe(true);
    expect(sameMark({ level: 8, lamp: 'CLEAR' }, { level: 8, lamp: 'CLEAR', other: true })).toBe(false);
    expect(sameMark({ level: 8, lamp: 'CLEAR' }, { level: 9, lamp: 'CLEAR' })).toBe(false);
    expect(sameMark(null, null)).toBe(true);
    expect(sameMark(null, { level: null, lamp: null })).toBe(false);
  });

  it("a plate whose chart was never played names the tier's best on another chart, and what that chart is", () => {
    expect(otherBest(records, 'HARD', 'new')?.chartId).toBe('old');
    expect(otherBest(records, 'HARD', 'old')?.chartId).toBe('other');
    expect(otherBest(records, 'MASTER', 'new')).toBeNull();
    // the default pattern as an earlier generator made it, or another pattern
    const older = record('HARD', 900_000, 'CLEAR', { defaultSeed: true, generatorVersion: '0.9.5' });
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
  const list = [
    song('1', '봄비', [], { artist: 'z', album: '' }),
    song('2', 'Track 10', [], { artist: 'b', album: 'Night' }),
    song('3', 'Track 9', [], { artist: 'a', album: 'Day' }),
    song('4', 'Track 9', [], { artist: '', album: 'Day' }),
  ];
  const ids = (songs: Song[]) => songs.map((s) => s.id);

  it('keeps the library order with no order chosen (the very list, so nothing is drawn again)', () => {
    expect(sortSongs(list, null)).toBe(list);
  });

  it('orders by a name upward or downward: Hangul before Latin, numbers by their value', () => {
    expect(ids(sortSongs(list, { key: 'title', dir: 'asc' }))).toEqual(['1', '3', '4', '2']);
    expect(ids(sortSongs(list, { key: 'title', dir: 'desc' }))).toEqual(['2', '3', '4', '1']);
  });

  it('keeps a song without the name at the end, whichever way the order runs', () => {
    expect(ids(sortSongs(list, { key: 'artist', dir: 'asc' }))).toEqual(['3', '2', '1', '4']);
    expect(ids(sortSongs(list, { key: 'artist', dir: 'desc' }))).toEqual(['1', '2', '3', '4']);
    expect(ids(sortSongs(list, { key: 'album', dir: 'desc' }))).toEqual(['2', '3', '4', '1']);
  });

  it('keeps songs of one name in the library order, both ways', () => {
    expect(ids(sortSongs(list, { key: 'album', dir: 'asc' }))).toEqual(['3', '4', '2', '1']);
    expect(ids(sortSongs(list, { key: 'album', dir: 'desc' })).slice(1, 3)).toEqual(['3', '4']);
  });

  it('a press on a name orders downward, a second upward, a third not at all; another name starts over', () => {
    const down = nextSongSort(null, 'title');
    expect(down).toEqual({ key: 'title', dir: 'desc' });
    const up = nextSongSort(down, 'title');
    expect(up).toEqual({ key: 'title', dir: 'asc' });
    expect(nextSongSort(up, 'title')).toBeNull();
    expect(nextSongSort(up, 'album')).toEqual({ key: 'album', dir: 'desc' });
  });

  it('says what a press did', () => {
    expect(sortSaid('title', { key: 'title', dir: 'desc' })).toBe('곡명 내림차순');
    expect(sortSaid('artist', { key: 'artist', dir: 'asc' })).toBe('아티스트명 오름차순');
    expect(sortSaid('album', null)).toBe('앨범명 정렬 해제 · 추가한 순서');
  });
});
