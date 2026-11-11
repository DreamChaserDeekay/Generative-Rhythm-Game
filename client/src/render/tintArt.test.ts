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

describe('the sky skin’s notes', () => {
  /** A 2D context that records every call made on it (everything does nothing). */
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

  it('are bars as deep in every lane as the plain one, with a long note of their own lying flat', () => {
    expect(NOTE_STYLES.slice(0, 3)).toEqual(['flat', 'prism', 'sky']);
    expect(isBarNote('sky')).toBe(true);
    expect(noteDepthOf('sky', 0.7, 0.84, 1.54)).toBe(0.7);
    expect(laneDepthOf('sky', 0.7, 1.6, 0.7)).toBe(0.7);
    expect(LONG_OF.sky).toBe('sky');
    // a see-through band: no walls under it (the other long notes are slabs), as wide as the default skin's, brighter while held
    expect(LONG_PAINT.sky.flat).toBe(true);
    for (const style of LONG_STYLES.filter((l) => l !== 'sky')) expect(LONG_PAINT[style].flat, style).toBeUndefined();
    expect(LONG_PAINT.sky.width).toBe(LONG_PAINT.solid.width);
    expect(LONG_PAINT.sky.held).toBeDefined();
    for (const part of [LONG_PAINT.sky.body, LONG_PAINT.sky.end, LONG_PAINT.sky.held!.body, LONG_PAINT.sky.held!.end]) expect(() => part(recorder().g, 64, 64)).not.toThrow();
  });

  it('have round corners, as round on the screen along the track as across it, and everything on them inside that outline', () => {
    const { g, calls } = recorder();
    NOTE_PAINT.sky(g, 300, 96, 'white');
    const clip = calls.findIndex((c) => c[0] === 'clip');
    // the outline: four quarter ellipses, 1.7 times as long along the track as across it
    const corners = calls.slice(0, clip).filter((c) => c[0] === 'ellipse') as [string, number, number, number, number][];
    expect(corners).toHaveLength(4);
    for (const [, , , rx, ry] of corners) expect(ry / rx).toBeCloseTo(1.7, 6);
    expect(new Set(corners.map(([, x]) => x)).size).toBe(2);
    expect(calls.findIndex((c) => c[0] === 'fillRect' || c[0] === 'fill')).toBeGreaterThan(clip);
    // every key's bar is the same picture (its lane's colour tells it apart)
    for (const mark of ['blue', 'gold', 'side'] as const) {
      const other = recorder();
      NOTE_PAINT.sky(other.g, 300, 96, mark);
      expect(other.calls, mark).toEqual(calls);
    }
  });

  it('mark the scratch with a pair of wings over the same bar, one the mirror of the other', () => {
    const key = recorder();
    NOTE_PAINT.sky(key.g, 480, 96, 'white');
    const scratch = recorder();
    NOTE_PAINT.sky(scratch.g, 480, 96, 'scratch');
    // the bar first, as a key's, then the wings
    expect(scratch.calls.slice(0, key.calls.length)).toEqual(key.calls);
    const wings = scratch.calls.slice(key.calls.length);
    const flips = wings.filter((c) => c[0] === 'scale') as [string, number, number][];
    expect(flips.map(([, x]) => x)).toEqual([-1, 1]);
    for (const [, , y] of flips) expect(y).toBeCloseTo(1.7, 6);
    // each wing a shade under it and the wing itself: one closed outline with its feathers' curves
    expect(wings.filter((c) => c[0] === 'fill')).toHaveLength(4);
    expect(wings.filter((c) => c[0] === 'quadraticCurveTo').length).toBeGreaterThanOrEqual(4 * 5);
  });
});
