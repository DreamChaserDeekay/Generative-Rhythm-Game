import { describe, expect, it } from 'vitest';
import { keyModes } from '../engine/config';
import type { KeyModeId } from '../engine/types';
import { PHRASE_BEATS, previewPhrase } from './previewPhrase';

describe('settings preview phrase', () => {
  it.each(Object.keys(keyModes) as KeyModeId[])('keeps every note of %s on its own stretch of its lane', (id) => {
    const mode = keyModes[id];
    const notes = previewPhrase(mode);
    expect(notes.length).toBeGreaterThan(12);
    for (const n of notes) {
      expect(n.lane).toBeGreaterThanOrEqual(0);
      expect(n.lane).toBeLessThan(mode.lanes.length);
      expect(n.beat).toBeGreaterThanOrEqual(0);
      // played over and over: nothing may run into the next phrase
      expect(n.endBeat ?? n.beat).toBeLessThan(PHRASE_BEATS);
    }
    // on each lane a note starts only after the one before it has ended
    mode.lanes.forEach((_, lane) => {
      const own = notes.filter((n) => n.lane === lane);
      own.slice(1).forEach((n, i) => expect(n.beat).toBeGreaterThan(own[i].endBeat ?? own[i].beat));
    });
    // every key lane is played, and the scratch and side lanes too
    expect(new Set(notes.map((n) => n.lane)).size).toBe(mode.lanes.length);
  });

  it('is in time order', () => {
    const notes = previewPhrase(keyModes['7K+1S']);
    notes.slice(1).forEach((n, i) => expect(n.beat).toBeGreaterThanOrEqual(notes[i].beat));
  });
});
