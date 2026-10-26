import { describe, expect, it } from 'vitest';
import { LONG_OF, LONG_STYLES, laneDepthOf, NOTE_STYLES, noteDepthOf } from './tintArt';

describe('the note families’ depth along the track', () => {
  const bar = 0.7;

  it('keeps the bars and the plate a bar deep, and makes the coin and the stars as deep as keeps their shape at the judge line', () => {
    // SDVX shows the track about 1.54 times shorter along than across at the judge line
    for (const style of ['flat', 'stem', 'chamfer'] as const) expect(noteDepthOf(style, bar, 0.84, 1.54)).toBe(bar);
    // a coin as deep on the screen as it is wide; the five-pointed star a little less; the compass star wide
    expect(noteDepthOf('round', bar, 0.84, 1.54)).toBeCloseTo(0.84 * 1.54, 9);
    expect(noteDepthOf('star5', bar, 0.84, 1.54)).toBeCloseTo(0.84 * 0.95 * 1.54, 9);
    expect(noteDepthOf('star4', bar, 0.84, 1.54)).toBeCloseTo(0.84 * 0.62 * 1.54, 9);
  });

  it('never makes them shallower than a bar nor deeper than three: the plane camera and very wide lanes flatten them a little', () => {
    // the plane camera flattens the track nearly four times
    expect(noteDepthOf('round', bar, 0.84, 3.81)).toBe(bar * 3);
    // 4K's lanes are over twice as wide
    expect(noteDepthOf('round', bar, 1.8, 1.54)).toBe(bar * 3);
    // a camera that hardly flattens it
    expect(noteDepthOf('star4', bar, 0.84, 1)).toBe(bar);
  });

  it('keeps the families’ shape in the wider scratch lane and the narrower side lanes; the plain bars stay as deep', () => {
    const coin = noteDepthOf('round', bar, 0.84, 1.54);
    expect(laneDepthOf('round', coin, 1.6, bar)).toBeCloseTo(coin * 1.6, 9);
    expect(laneDepthOf('chamfer', bar, 1.6, bar)).toBeCloseTo(bar * 1.6, 9);
    expect(laneDepthOf('star5', 1.3, 0.75, bar)).toBeCloseTo(1.3 * 0.75, 9);
    // no deeper than three bars
    expect(laneDepthOf('round', 2, 1.6, bar)).toBe(bar * 3);
    for (const style of ['flat', 'stem'] as const) expect(laneDepthOf(style, bar, 1.6, bar)).toBe(bar);
  });

  it('gives every note style a long note of its own family', () => {
    for (const style of NOTE_STYLES) expect(LONG_STYLES).toContain(LONG_OF[style]);
    expect(new Set(NOTE_STYLES.map((s) => LONG_OF[s]))).toEqual(new Set(LONG_STYLES));
  });
});
