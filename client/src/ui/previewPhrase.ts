import type { KeyModeConfig } from '../engine/config';
import type { StemName } from '../engine/types';

/** A note of the settings preview's phrase, in beats from the phrase's start. */
export interface PhraseNote {
  lane: number;
  beat: number;
  /** Long notes end here. */
  endBeat?: number;
  /** The instrument it follows (the STEM skin colours notes by it). */
  src: StemName;
}

/** Beats in the phrase (two bars of 4/4); the preview plays it over and over. */
export const PHRASE_BEATS = 8;

/**
 * Two bars over a key mode's lanes: a stair of eighth notes across the keys with a chord on every
 * other beat, a long note at the end, a scratch on each bar's first beat and a long note on each
 * side track. No note lies inside another one's span on its lane.
 */
export function previewPhrase(mode: KeyModeConfig): PhraseNote[] {
  const lanes = mode.lanes.map((l, i) => ({ kind: l.kind, i }));
  const keys = lanes.filter((l) => l.kind === 'key').map((l) => l.i);
  const scratches = lanes.filter((l) => l.kind === 'scratch').map((l) => l.i);
  const sides = lanes.filter((l) => l.kind === 'side').map((l) => l.i);
  const k = keys.length;
  const notes: PhraseNote[] = [];
  // up and down the keys, one eighth note at a time, for six beats
  const bounce = k > 1 ? [...Array(k).keys(), ...Array.from({ length: k - 2 }, (_, i) => k - 2 - i)] : [0];
  for (let step = 0; step < 12; step++) {
    const at = bounce[step % bounce.length];
    notes.push({ lane: keys[at], beat: step / 2, src: 'other' });
    if (step % 4 === 0 && k > 2) notes.push({ lane: keys[(at + Math.floor(k / 2)) % k], beat: step / 2, src: 'vocals' });
  }
  // the last two beats: a long note in the middle, eighths at both edges around it
  const middle = keys[Math.floor(k / 2)];
  notes.push({ lane: middle, beat: 6, endBeat: 7.5, src: 'bass' });
  if (k > 2) [6, 6.5, 7, 7.5].forEach((beat, i) => notes.push({ lane: keys[i % 2 === 0 ? 0 : k - 1], beat, src: 'other' }));
  for (const lane of scratches) [0, 4].forEach((beat) => notes.push({ lane, beat, src: 'drums' }));
  sides.forEach((lane, i) => notes.push({ lane, beat: 2 + 4 * (i % 2), endBeat: 3.5 + 4 * (i % 2), src: 'bass' }));
  return notes.sort((a, b) => a.beat - b.beat || a.lane - b.lane);
}
