import { describe, expect, it } from 'vitest';
import { isBarNote, LONG_OF, LONG_PAINT, LONG_STYLES, laneDepthOf, MATERIAL_NOTES, NOTE_PAINT, NOTE_STYLES, noteDepthOf } from './tintArt';

describe('the note families’ depth along the track', () => {
  const bar = 0.7;

  it('keeps the bars and the plate a bar deep, and makes the coin and the stars as deep as keeps their shape at the judge line', () => {
    // SDVX shows the track about 1.54 times shorter along than across at the judge line
    for (const style of ['flat', 'chamfer'] as const) expect(noteDepthOf(style, bar, 0.84, 1.54)).toBe(bar);
    // a coin as deep on the screen as it is wide; the five-pointed star a little less; the four-pointed
    // star (drawn in code) as deep as it is wide, its vertical points as long as its horizontal ones
    expect(noteDepthOf('round', bar, 0.84, 1.54)).toBeCloseTo(0.84 * 1.54, 9);
    expect(noteDepthOf('star5', bar, 0.84, 1.54)).toBeCloseTo(0.84 * 0.95 * 1.54, 9);
    expect(noteDepthOf('star4', bar, 0.84, 1.54)).toBeCloseTo(0.84 * 1.54, 9);
  });

  it('never makes them shallower than a bar nor deeper than three: the plane camera and very wide lanes flatten them a little', () => {
    // the plane camera flattens the track nearly four times
    expect(noteDepthOf('round', bar, 0.84, 3.81)).toBe(bar * 3);
    // 4K's lanes are over twice as wide
    expect(noteDepthOf('round', bar, 1.8, 1.54)).toBe(bar * 3);
    // a camera that hardly flattens a narrow lane's star
    expect(noteDepthOf('star4', bar, 0.6, 1)).toBe(bar);
  });

  it('keeps the families’ shape in the wider scratch lane and the narrower side lanes; the plain bars stay as deep', () => {
    const coin = noteDepthOf('round', bar, 0.84, 1.54);
    expect(laneDepthOf('round', coin, 1.6, bar)).toBeCloseTo(coin * 1.6, 9);
    expect(laneDepthOf('chamfer', bar, 1.6, bar)).toBeCloseTo(bar * 1.6, 9);
    expect(laneDepthOf('star5', 1.3, 0.75, bar)).toBeCloseTo(1.3 * 0.75, 9);
    // no deeper than three bars
    expect(laneDepthOf('round', 2, 1.6, bar)).toBe(bar * 3);
    expect(laneDepthOf('flat', bar, 1.6, bar)).toBe(bar);
  });

  it('gives every note style a long note of its own family', () => {
    for (const style of NOTE_STYLES) expect(LONG_STYLES).toContain(LONG_OF[style]);
    expect(new Set(NOTE_STYLES.map((s) => LONG_OF[s]))).toEqual(new Set(LONG_STYLES));
  });
});

describe('the bars in a finish of their own', () => {
  /** A 2D context that records the boxes filled and the paths outlined (everything else does nothing). */
  function recorder() {
    const calls: unknown[][] = [];
    const g = new Proxy({} as Record<string | symbol, unknown>, {
      get: (_, k) =>
        (...a: unknown[]) => {
          calls.push([String(k), ...a]);
          return { addColorStop: () => undefined };
        },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;
    return { g, calls };
  }

  it('are six, each a bar as deep in every lane as the plain one, with a long note of its own', () => {
    expect([...MATERIAL_NOTES]).toEqual(['chrome', 'hairline', 'glass', 'enamel', 'pearl', 'carbon']);
    for (const style of MATERIAL_NOTES) {
      expect(NOTE_STYLES).toContain(style);
      expect(isBarNote(style)).toBe(true);
      expect(noteDepthOf(style, 0.7, 0.84, 1.54)).toBe(0.7);
      expect(laneDepthOf(style, 0.7, 1.6, 0.7)).toBe(0.7);
      // its own long note, as wide as the plain bar's
      expect(LONG_OF[style]).toBe(style);
      expect(LONG_PAINT[LONG_OF[style]].width).toBeCloseTo(0.82, 9);
    }
    for (const style of ['chamfer', 'round', 'star4', 'star5'] as const) expect(isBarNote(style)).toBe(false);
  });

  it('are painted inside the bar’s own outline, and the same every time (their grain does not change)', () => {
    for (const style of MATERIAL_NOTES) {
      const first = recorder();
      NOTE_PAINT[style](first.g, 300, 96, 'white');
      // the bar's outline (FLAT's rounded box) is the clip of everything drawn
      const clip = first.calls.findIndex((c) => c[0] === 'clip');
      expect(first.calls.findIndex((c) => c[0] === 'roundRect'), style).toBeLessThan(clip);
      expect(first.calls.slice(0, clip).find((c) => c[0] === 'roundRect'), style).toEqual(['roundRect', 0, 0, 300, 96, [expect.any(Number)]].slice(0, 5).concat([expect.anything()]));
      expect(first.calls.findIndex((c) => c[0] === 'fillRect' || c[0] === 'fill'), style).toBeGreaterThan(clip);
      const again = recorder();
      NOTE_PAINT[style](again.g, 300, 96, 'blue');
      expect(again.calls, style).toEqual(first.calls);
      // a long note's body and its ends
      for (const part of ['body', 'end'] as const) expect(() => LONG_PAINT[style][part](recorder().g, 64, 64)).not.toThrow();
    }
  });
});
