import { describe, expect, it } from 'vitest';
import { coinNote, emblemBox, isBarNote, isLogoNote, laneDepthOf, LOGO_NOTES, LONG_OF, LONG_PAINT, LONG_STYLES, NOTE_PAINT, NOTE_STYLES, noteDepthOf, noteEmblemOf, noteThicknessOf, shapedEnd, sideDotsBody, sideDotsEnd } from './tintArt';

describe('the notes’ depth along the track', () => {
  const bar = 0.7;

  it('offers the default bar, the skins’ notes and no others: the notes with no gear of their own are gone', () => {
    expect(NOTE_STYLES).toEqual(['flat', 'prism', 'sky', 'fire', 'gpt', 'gemini', 'grok', 'claude', 'aqua', 'steel', 'noir', 'wire', 'astral']);
    for (const gone of ['chrome', 'hairline', 'glass', 'enamel', 'pearl', 'carbon', 'chamfer', 'round', 'star4', 'star5']) {
      expect(NOTE_STYLES as string[], gone).not.toContain(gone);
      expect(Object.keys(NOTE_PAINT), gone).not.toContain(gone);
      expect(Object.keys(LONG_OF), gone).not.toContain(gone);
    }
    // each is a bar or a company's mark
    for (const style of NOTE_STYLES) expect(isBarNote(style), style).toBe(!isLogoNote(style));
    expect(Object.keys(NOTE_PAINT).sort()).toEqual([...NOTE_STYLES].sort());
  });

  it('keeps the bars a bar deep, and makes the companies’ marks as deep as keeps their shape at the judge line', () => {
    // SDVX shows the track about 1.54 times shorter along than across at the judge line
    for (const style of NOTE_STYLES.filter(isBarNote)) expect(noteDepthOf(style, bar, 0.84, 1.54), style).toBe(bar);
    // a mark as deep on the screen as it is wide
    for (const style of LOGO_NOTES) expect(noteDepthOf(style, bar, 0.84, 1.54), style).toBeCloseTo(0.84 * 1.54, 9);
  });

  it('never makes a mark shallower than a bar nor deeper than three: the plane camera and very wide lanes flatten it a little', () => {
    // the plane camera flattens the track nearly four times
    expect(noteDepthOf('gpt', bar, 0.84, 3.81)).toBe(bar * 3);
    // 4K's lanes are over twice as wide
    expect(noteDepthOf('gpt', bar, 1.8, 1.54)).toBe(bar * 3);
    // a camera that hardly flattens a narrow lane's mark
    expect(noteDepthOf('claude', bar, 0.6, 1)).toBe(bar);
  });

  it('keeps the marks’ shape in the wider scratch lane and the narrower side lanes; the bars stay as deep', () => {
    const mark = noteDepthOf('gpt', bar, 0.84, 1.54);
    expect(laneDepthOf('gpt', mark, 1.6, bar)).toBeCloseTo(mark * 1.6, 9);
    expect(laneDepthOf('grok', 1.3, 0.75, bar)).toBeCloseTo(1.3 * 0.75, 9);
    // no deeper than three bars
    expect(laneDepthOf('gemini', 2, 1.6, bar)).toBe(bar * 3);
    for (const style of NOTE_STYLES.filter(isBarNote)) expect(laneDepthOf(style, bar, 1.6, bar), style).toBe(bar);
  });

  it('gives every note style a long note, and plays every long note with a note style', () => {
    for (const style of NOTE_STYLES) expect(LONG_STYLES).toContain(LONG_OF[style]);
    expect(new Set(NOTE_STYLES.map((s) => LONG_OF[s]))).toEqual(new Set(LONG_STYLES));
    expect(LONG_STYLES).toEqual(['prism', 'sky', 'fire', 'aqua', 'steel', 'noir', 'wire', 'astral', 'solid', 'capsule']);
    expect(Object.keys(LONG_PAINT).sort()).toEqual([...LONG_STYLES].sort());
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
    // a tube as wide as the default one, its ends as shallow: nothing slanted
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
    const LONGS = { aqua: 'aqua', steel: 'steel', noir: 'noir', wire: 'wire', astral: 'astral' } as const;
    for (const style of ['aqua', 'steel', 'noir', 'wire', 'astral'] as const) {
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
  });

  it('are shapes and no bars, as deep as keeps the mark’s shape, each with the coin’s long note (the capsule)', () => {
    expect([...LOGO_NOTES]).toEqual(['gpt', 'gemini', 'grok', 'claude']);
    for (const style of LOGO_NOTES) {
      expect(isLogoNote(style)).toBe(true);
      expect(isBarNote(style)).toBe(false);
      // as the coin: as deep as the note is wide where the camera flattens the track 1.7 times, no more than three bars
      expect(noteDepthOf(style, 0.7, 0.9, 1.7)).toBeCloseTo(0.9 * 1.7, 6);
      expect(noteDepthOf(style, 0.7, 2, 1.7)).toBeCloseTo(2.1, 6);
    }
    // the coin's long note (the user's: a body with the mark stuck on its ends looked awkward)
    for (const style of LOGO_NOTES) expect(LONG_OF[style], style).toBe('capsule');
    for (const style of NOTE_STYLES.filter(isBarNote)) expect(isLogoNote(style), style).toBe(false);
  });

  it('without a mark the note is the coin: nothing of a company’s is drawn by the game itself', () => {
    for (const style of LOGO_NOTES) {
      expect(noteEmblemOf(style)).toBeUndefined();
      const [a, b] = [recorder(), recorder()];
      NOTE_PAINT[style](a.g, 96, 160, 'white');
      coinNote(b.g, 96, 160, 'white');
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

  it('are bars as deep in every lane as the plain one, with a long note of their own', () => {
    expect(NOTE_STYLES.slice(0, 3)).toEqual(['flat', 'prism', 'sky']);
    expect(isBarNote('sky')).toBe(true);
    expect(noteDepthOf('sky', 0.7, 0.84, 1.54)).toBe(0.7);
    expect(laneDepthOf('sky', 0.7, 1.6, 0.7)).toBe(0.7);
    expect(LONG_OF.sky).toBe('sky');
    // a see-through band as wide as the default skin's, brighter while held; a slab as every long note is (the renderer
    // copies only its two long edges under it for its walls, so what shows through it is not darkened)
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

describe('the notes told apart by their build', () => {
  it('makes each style’s notes as thick as its look: the pillow and the wire low, the key cap and the cut glass high', () => {
    expect(noteThicknessOf('flat')).toBe(1);
    for (const style of NOTE_STYLES) {
      expect(noteThicknessOf(style), style).toBeGreaterThan(0.3);
      expect(noteThicknessOf(style), style).toBeLessThan(2);
    }
    expect(noteThicknessOf('sky')).toBeLessThan(1);
    expect(noteThicknessOf('wire')).toBeLessThan(noteThicknessOf('sky'));
    expect(noteThicknessOf('steel')).toBeGreaterThan(noteThicknessOf('prism'));
  });

  it('gives every long note’s body and ends a picture that draws, idle and held', () => {
    const g = new Proxy({} as Record<string | symbol, unknown>, { get: () => () => ({ addColorStop: () => undefined }), set: () => true }) as unknown as CanvasRenderingContext2D;
    for (const style of LONG_STYLES) {
      const long = LONG_PAINT[style];
      for (const part of [long.body, long.end, long.held?.body, long.held?.end, long.plain?.idle, long.plain?.held]) if (part) expect(() => part(g, 64, 32), style).not.toThrow();
    }
  });

  it('cuts an end in a tap’s outline: the coin’s drawn twice the end’s depth (its outer half shows), the body running into it from its inner edge', () => {
    const taps: number[][] = [];
    const necks: number[][] = [];
    const g = new Proxy({} as Record<string | symbol, unknown>, { get: () => () => undefined, set: () => true }) as unknown as CanvasRenderingContext2D;
    shapedEnd(
      (_, w, h) => taps.push([w, h]),
      (_, w, h) => necks.push([w, h]),
      0.8,
    )(g, 100, 40);
    expect(taps).toEqual([[100, 80]]);
    expect(necks.length).toBeGreaterThan(1);
    for (const n of necks) expect(n).toEqual([80, 40]);
  });

  it('cuts it at the tap’s widest row, and paints the body only inside the tap’s outline (no square shoulder, no square shading)', () => {
    const taps: number[][] = [];
    const ops: string[] = [];
    const g = new Proxy({} as Record<string | symbol, unknown>, {
      get: () => () => undefined,
      set: (_, k, v) => (k === 'globalCompositeOperation' && ops.push(v), true),
    }) as unknown as CanvasRenderingContext2D;
    shapedEnd(
      (_, w, h) => taps.push([w, h]),
      () => undefined,
      1,
      0.36,
    )(g, 100, 36);
    // cut above its middle (a tap that is widest nearer its far edge): the shape alone, the body run into none of it
    expect(taps[0][1]).toBeCloseTo(100, 9);
    expect(ops).toEqual([]);
    // cut across its middle: the body over the mark, only inside the tap's outline
    shapedEnd(
      () => undefined,
      () => undefined,
      1,
      0.5,
    )(g, 100, 36);
    expect(ops.length).toBeGreaterThan(0);
    expect(new Set(ops)).toEqual(new Set(['source-atop']));
  });
});

describe('the LED side notes drawn from a picture', () => {
  it('lay the same rows of dots as the code’s, each the lit or dim LED’s picture (lit on the bright rows), round on the screen', () => {
    const draws: number[][] = [];
    const fills: number[] = [];
    const g = new Proxy({} as Record<string | symbol, unknown>, {
      get: (_, k) => (k === 'drawImage' ? (...a: number[]) => draws.push(a.slice(1)) : k === 'fill' ? () => fills.push(1) : () => undefined),
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;
    const led = { image: {} as CanvasImageSource, size: 128, lens: 0.75 };
    sideDotsEnd(10, led)(g, 500, 40);
    expect(draws).toHaveLength(10);
    // the lit one (sx 0), each picture 1.7 times deeper than wide
    for (const [sx, , , , , , dw, dh] of draws) {
      expect(sx).toBe(0);
      expect(dh / dw).toBeCloseTo(1.7, 6);
    }
    draws.length = 0;
    sideDotsBody(10, led)(g, 500, 500);
    expect(draws.length % 10).toBe(0);
    for (const [sx] of draws) expect(sx).toBe(128);
    // without the picture, the code's dots
    draws.length = 0;
    sideDotsEnd(10)(g, 500, 40);
    expect(draws).toHaveLength(0);
    expect(fills.length).toBeGreaterThan(0);
  });
});
