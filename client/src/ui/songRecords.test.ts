import { describe, expect, it } from 'vitest';
import type { ScoreRecord, Song } from '../api/client';
import { bestByTier, inFolder, sortSongs } from './songRecords';

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

  it('즐겨찾기 is the marked songs', () => {
    expect(inFolder(song('a', 'A'), 'favorites', '4K', 'DJMAX', new Set(['a']))).toBe(true);
    expect(inFolder(song('b', 'B'), 'favorites', '4K', 'DJMAX', new Set(['a']))).toBe(false);
  });

  it('the best of a tier is its highest score', () => {
    const best = bestByTier([record('NM', 800_000, 'CLEAR'), record('NM', 910_000, 'FAILED'), record('HD', 700_000, 'CLEAR')]);
    expect(best.get('NM')?.score).toBe(910_000);
    expect(best.get('HD')?.score).toBe(700_000);
    expect(best.has('MX')).toBe(false);
  });
});

describe('song select order', () => {
  const list = [song('1', '봄비', [], { bpm: 140, artist: 'z' }), song('2', 'Track 10', [], { bpm: null, artist: 'b' }), song('3', 'Track 9', [], { bpm: 96, artist: 'a' })];

  it('keeps the library order for 추가순 and sorts the others', () => {
    expect(sortSongs(list, 'added').map((s) => s.id)).toEqual(['1', '2', '3']);
    // Korean order: Hangul before Latin, numbers by their value
    expect(sortSongs(list, 'title').map((s) => s.title)).toEqual(['봄비', 'Track 9', 'Track 10']);
    expect(sortSongs(list, 'artist').map((s) => s.id)).toEqual(['3', '2', '1']);
    // songs without a BPM (not analysed yet) go last
    expect(sortSongs(list, 'bpm').map((s) => s.id)).toEqual(['3', '1', '2']);
  });
});
