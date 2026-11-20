import { describe, expect, it } from 'vitest';
import { sameMaking, songsMaking } from './makingSongs';

const chart = (songId: string, state: 'making' | 'queued', difficulty = 'HARD') => ({ chartId: `${songId}-${difficulty}`, songId, keyMode: '4K', difficulty, state });

describe('the songs the generator is making charts of', () => {
  it('marks each song with a chart in the queue, being made over waiting', () => {
    const marks = songsMaking([chart('a', 'queued', 'EASY'), chart('a', 'making'), chart('b', 'queued'), chart('a', 'queued', 'ELITE')]);
    expect([...marks]).toEqual([
      ['a', 'making'],
      ['b', 'queued'],
    ]);
    expect(songsMaking([]).size).toBe(0);
  });

  it('tells two answers apart only when a song changes', () => {
    expect(sameMaking(songsMaking([chart('a', 'making')]), songsMaking([chart('a', 'making', 'EASY')]))).toBe(true);
    expect(sameMaking(songsMaking([chart('a', 'making')]), songsMaking([chart('a', 'queued')]))).toBe(false);
    expect(sameMaking(songsMaking([chart('a', 'making')]), songsMaking([]))).toBe(false);
  });
});
