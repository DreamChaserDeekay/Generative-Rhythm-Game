import { describe, expect, it } from 'vitest';
import { clickBeatTimes } from '../audio/clickTrack';
import { countedBeat } from './inputSync';

describe('countedBeat', () => {
  // 120 BPM: a beat every 500 ms from 1500 ms
  const beats = clickBeatTimes({ bpm: 120, firstBeatMs: 1500, beats: 8, beatsPerMeasure: 4, tailMs: 0 });

  it('counts a beat half a beat after it sounds, never on it', () => {
    expect(countedBeat(beats, 0)).toBe(-1);
    expect(countedBeat(beats, 1500)).toBe(-1);
    expect(countedBeat(beats, 1749)).toBe(-1);
    expect(countedBeat(beats, 1750)).toBe(0);
    expect(countedBeat(beats, 2000)).toBe(0);
    expect(countedBeat(beats, 2250)).toBe(1);
  });

  it('stops at the last beat', () => {
    expect(countedBeat(beats, 99_000)).toBe(beats.length - 1);
  });
});
