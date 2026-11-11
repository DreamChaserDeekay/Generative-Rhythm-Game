import { describe, expect, it } from 'vitest';
import { emblemBox, isBarNote, isLogoNote, laneDepthOf, LOGO_NOTES, LONG_OF, LONG_PAINT, LONG_STYLES, MATERIAL_NOTES, NOTE_PAINT, NOTE_STYLES, noteDepthOf, noteEmblemOf } from './tintArt';

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

describe('the Firestarter skin’s notes', () => {
  /** A 2D context on which everything does nothing. */
  const recorder = () => ({
    g: new Proxy({} as Record<string | symbol, unknown>, { get: () => () => ({ addColorStop: () => undefined }), set: () => true }) as unknown as CanvasRenderingContext2D,
  });

  it('are bars as the default skin’s, with a long note of their own that is a slab cut straight across, and a hit drawn in code in colours of its own', () => {
    expect(NOTE_STYLES.slice(0, 4)).toEqual(['flat', 'prism', 'sky', 'fire']);
    expect(isBarNote('fire')).toBe(true);
    expect(LONG_OF.fire).toBe('fire');
    // a tube with thickness (walls under it), as wide as the default one, its ends as shallow: nothing slanted
    expect(LONG_PAINT.fire.flat).toBeUndefined();
    expect([LONG_PAINT.fire.width, LONG_PAINT.fire.endDepth, LONG_PAINT.fire.tile]).toEqual([LONG_PAINT.solid.width, LONG_PAINT.solid.endDepth, LONG_PAINT.solid.tile]);
    expect(LONG_PAINT.fire.held).toBeDefined();
    for (const part of [LONG_PAINT.fire.body, LONG_PAINT.fire.end, LONG_PAINT.fire.held!.body, LONG_PAINT.fire.held!.end]) expect(() => part(recorder().g, 64, 64)).not.toThrow();
    for (const mark of ['white', 'blue', 'gold', 'scratch', 'side'] as const) expect(() => NOTE_PAINT.fire(recorder().g, 300, 96, mark)).not.toThrow();
  });
});

describe('the AI companies’ notes: the company’s mark, a picture the player brings', () => {
  const recorder = () => {
    const calls: string[] = [];
    const g = new Proxy({} as Record<string, unknown>, {
      get: (target, prop: string) => (prop in target ? target[prop] : prop === 'canvas' ? { width: 64, height: 64 } : (...args: unknown[]) => (calls.push(prop), args.length > 3 && prop.startsWith('create') ? { addColorStop: () => undefined } : undefined)),
      set: (target, prop: string, value) => ((target[prop] = value), true),
    }) as unknown as CanvasRenderingContext2D;
    return { g, calls };
  };

  it('the notes of the skins after the reference panels are bars, each with a long note cut straight across and a mark on the scratch’s', () => {
    const LONGS = { aqua: 'aqua', steel: 'steel', rainbow: 'rainbow', noir: 'noir', magenta: 'magenta', wire: 'wire', astral: 'sky' } as const;
    for (const style of ['aqua', 'steel', 'rainbow', 'noir', 'magenta', 'wire', 'astral'] as const) {
      expect(isBarNote(style), style).toBe(true);
      expect(isLogoNote(style), style).toBe(false);
      expect(noteDepthOf(style, 0.7, 0.84, 1.54), style).toBe(0.7);
      expect(laneDepthOf(style, 0.7, 1.6, 0.7), style).toBe(0.7);
      expect(LONG_OF[style], style).toBe(LONGS[style]);
      const long = LONG_PAINT[LONG_OF[style]];
      // no cap at its ends: each end is a thin slice of the body with a rim along the cut
      expect(long.endDepth, style).toBeLessThanOrEqual(0.2);
      expect(long.held, style).toBeDefined();
      for (const part of [long.body, long.end, long.held!.body, long.held!.end]) expect(() => part(recorder().g, 64, 64)).not.toThrow();
      // the scratch's note is told from a key's by something drawn on it
      const [key, scratch] = [recorder(), recorder()];
      NOTE_PAINT[style](key.g, 96, 40, 'white');
      NOTE_PAINT[style](scratch.g, 96, 40, 'scratch');
      expect(key.calls.length, style).toBeGreaterThan(8);
      expect(scratch.calls, style).not.toEqual(key.calls);
      for (const mark of ['blue', 'gold', 'side'] as const) expect(() => NOTE_PAINT[style](recorder().g, 96, 40, mark)).not.toThrow();
    }
    // the see-through ones lie flat, with no walls under them
    expect(['aqua', 'steel', 'rainbow', 'noir', 'magenta', 'wire'].filter((l) => LONG_PAINT[l as 'aqua'].flat)).toEqual(['aqua', 'noir', 'wire']);
  });

  it('are shapes and no bars, as deep as keeps the mark’s shape, each with a long note of a family', () => {
    expect([...LOGO_NOTES]).toEqual(['gpt', 'gemini', 'grok', 'claude']);
    for (const style of LOGO_NOTES) {
      expect(isLogoNote(style)).toBe(true);
      expect(isBarNote(style)).toBe(false);
      // as the coin: as deep as the note is wide where the camera flattens the track 1.7 times, no more than three bars
      expect(noteDepthOf(style, 0.7, 0.9, 1.7)).toBeCloseTo(0.9 * 1.7, 6);
      expect(noteDepthOf(style, 0.7, 2, 1.7)).toBeCloseTo(2.1, 6);
    }
    // each company's own long note, its mark a tile down the body and none on its ends (cut straight across); the
    // band of light and the two lines lie flat, the soft band and the paper ribbon are slabs
    expect([LONG_OF.gpt, LONG_OF.gemini, LONG_OF.grok, LONG_OF.claude]).toEqual(['gpt', 'gemini', 'grok', 'claude']);
    for (const style of LOGO_NOTES) {
      const long = LONG_PAINT[LONG_OF[style]];
      expect([long.endDepth, long.width, long.px], style).toEqual([0.2, 0.8, 128]);
      expect(long.held, style).toBeDefined();
      const calls = (paint: (g: CanvasRenderingContext2D, w: number, h: number) => void) => {
        const r = recorder();
        paint(r.g, 128, Math.round(128 * long.tile));
        return r.calls.length;
      };
      // the body draws its mark over the band, the end the band and its rim alone
      expect(calls(long.body), style).toBeGreaterThan(calls(long.end) - 2);
      for (const part of [long.body, long.end, long.held!.body, long.held!.end]) expect(() => part(recorder().g, 128, 64), style).not.toThrow();
    }
    expect(LOGO_NOTES.filter((style) => LONG_PAINT[LONG_OF[style]].flat)).toEqual(['gemini', 'grok']);
    expect(isLogoNote('round')).toBe(false);
  });

  it('without a mark the note is the coin: nothing of a company’s is drawn by the game itself', () => {
    for (const style of LOGO_NOTES) {
      expect(noteEmblemOf(style)).toBeUndefined();
      const [a, b] = [recorder(), recorder()];
      NOTE_PAINT[style](a.g, 96, 160, 'white');
      NOTE_PAINT.round(b.g, 96, 160, 'white');
      expect(a.calls, style).toEqual(b.calls);
      expect(a.calls).not.toContain('drawImage');
    }
  });

  it('a mark keeps its shape on the screen: it fills a note as deep as its lane lets it be, and lies in the middle of a shallower one', () => {
    // a note 1.7 times deeper than wide looks square: a square mark fills it
    expect(emblemBox(100, 170, 1)).toEqual({ x: 0, y: 0, w: 100, h: 170 });
    // a wide mark is as wide and less deep, a tall one as deep and narrower, each in the middle
    expect(emblemBox(100, 170, 2)).toEqual({ x: 0, y: 42.5, w: 100, h: 85 });
    expect(emblemBox(100, 170, 0.5)).toEqual({ x: 25, y: 0, w: 50, h: 170 });
    // a shallow note (a wide lane's, held to three bars): the mark as tall as the note is deep, in its middle
    const wide = emblemBox(200, 170, 1);
    expect(wide.w).toBeCloseTo(100, 6);
    expect([wide.x, wide.y, wide.h]).toEqual([50, 0, 170]);
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
    // (and the aqua mecha skin's light rail, see-through too)
    for (const style of LONG_STYLES.filter((l) => !['sky', 'aqua', 'noir', 'wire', 'gemini', 'grok'].includes(l))) expect(LONG_PAINT[style].flat, style).toBeUndefined();
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
