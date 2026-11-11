import { describe, expect, it } from 'vitest';
import { keyModes } from '../engine/config';
import type { KeyModeId } from '../engine/types';
import { blackKeyAfter, DECK_PICTURE_FLATTEST, deckFromPicture, deckKeys, deckReadouts, GEAR_FLOORS, GEAR_JUDGE, GEAR_STYLES, gearBorderLook, judgeOf, paintBorder, paintDeck, paintFace, paintLitKey, paintPressedKey, shadowOf, type DeckMark, type DeckSpec, type KeyKind, type Picture } from './deckArt';
import { computeTrackGeometry, type SideNotes } from './layout';
import { KEY_RISE_MS, notesEndZ, pressLevel } from './TrackRenderer';

/** A key mode's lanes as the deck has them (px of the sheets, 73.65 to a track unit); side lanes laid over the keys are none of them. */
function deckLanes(mode: KeyModeId, sideNotes: SideNotes = 'lanes'): { left: number; kind: KeyKind; width: number; side?: boolean }[] {
  return computeTrackGeometry(keyModes[mode], 8, 40, sideNotes)
    .lanes.filter((l) => !l.over)
    .map((l) => ({
      left: (l.x - l.width / 2 + 4) * 73.65,
      kind: l.kind === 'scratch' ? 'scratch' : l.color === 'white' ? 'white' : 'other',
      width: l.width * 73.65,
      ...(l.kind === 'side' ? { side: true } : {}),
    }));
}

/** A 2D context that records the boxes filled and their fill (everything else does nothing). */
function fillRecorder() {
  const fills: { x: number; y: number; w: number; h: number; style: unknown }[] = [];
  const state: Record<string | symbol, unknown> = {};
  const own: Record<string | symbol, unknown> = { fillRect: (x: number, y: number, w: number, h: number) => fills.push({ x, y, w, h, style: state.fillStyle }) };
  const g = new Proxy(own, {
    get: (t, k) => (k in t ? t[k] : k in state ? state[k] : () => ({ addColorStop: () => undefined })),
    set: (_, k, v) => {
      state[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { g, fills };
}

/** A 2D context that records every call made on it and every value set, in order (numbers rounded to a millionth). */
function callRecorder() {
  const calls: unknown[][] = [];
  const round = (v: unknown) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
  const call =
    (name: string) =>
    (...a: unknown[]) => {
      calls.push([name, ...a.map(round)]);
      return { addColorStop: (...b: unknown[]) => calls.push(['addColorStop', ...b.map(round)]) };
    };
  const g = new Proxy({} as Record<string | symbol, unknown>, {
    get: (_, k) => call(String(k)),
    set: (_, k, v) => {
      calls.push(['=', String(k), round(typeof v === 'object' ? 'gradient' : v)]);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { g, calls };
}

describe('the track’s borders in a gear’s frame', () => {
  it('gives each gear its own frame, painted whole, in FEVER too, the right one mirrored and in a little shade', () => {
    const widths = GEAR_STYLES.map((style) => {
      const look = gearBorderLook(style, {});
      expect(look.paint, style).toBeTypeOf('function');
      expect(look.tile, style).toBeGreaterThan(0);
      for (const lit of [false, true]) {
        for (const side of [-1, 1] as const) {
          const { g, fills } = fillRecorder();
          paintBorder(g, look.width * 4, look.tile * 4, look, side, 4, lit);
          // the whole tile filled first, nothing outside it
          expect(fills[0], style).toMatchObject({ x: 0, y: 0, w: look.width * 4, h: look.tile * 4 });
          for (const f of fills) expect(f.x >= -1e-9 && f.x + f.w <= look.width * 4 + 1e-9, style).toBe(true);
          // the light comes from the left: the right one ends in a shade over the whole tile
          expect(fills[fills.length - 1].style === 'rgba(0,0,0,0.12)', `${style} ${side}`).toBe(side > 0);
        }
      }
      return look.width;
    });
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(14);
  });

  it('stands each gear’s frame as a wall, its inner face painted whole, in FEVER too', () => {
    for (const style of GEAR_STYLES) {
      const look = gearBorderLook(style, {});
      // as high as a short wall: more than a thin rail's lip, less than a lane
      expect(look.height, style).toBeGreaterThanOrEqual(12);
      expect(look.height, style).toBeLessThanOrEqual(40);
      expect(look.face, style).toBeTypeOf('function');
      const [w, h] = [look.tile * 4, look.height * 4];
      const shades: unknown[] = [];
      for (const side of [-1, 1] as const) {
        for (const lit of [false, true]) {
          const { g, fills } = fillRecorder();
          paintFace(g, w, h, look, side, 4, lit);
          // the whole tile filled first, nothing outside it
          expect(fills[0], style).toMatchObject({ x: 0, y: 0, w, h });
          for (const f of fills) expect(f.x >= -1e-9 && f.x + f.w <= w + 1e-9 && f.y >= -1e-9 && f.y + f.h <= h + 1e-9, `${style} ${JSON.stringify(f)}`).toBe(true);
          if (!lit) shades.push(fills.find((f) => f.w === w && f.h === h && f !== fills[0] && typeof f.style === 'string' && /^rgba\((0|255),/.test(f.style as string))?.style);
        }
      }
      // the left wall's face, turned from the light, in more shade than the right one's
      expect(shades[0], style).not.toEqual(shades[1]);
    }
  });

  it('throws a thing’s shadow down and to the right of it on the screen, however the canvas is drawn', () => {
    const box = { x: 100, y: 40, w: 60, h: 75 };
    // a canvas 2 px to a plane px: the shape far to the left, its shadow offset back by as much and a little more
    const plain = shadowOf({ a: 2, b: 0, c: 0, d: 2 }, box, 1)!;
    expect(plain.x - plain.far * 2).toBeGreaterThan(0);
    expect(plain.y).toBeGreaterThan(0);
    expect(plain.blur).toBeGreaterThan(0);
    // drawn mirrored (the najeon's right lid): still down and to the right on the screen, as far
    const mirrored = shadowOf({ a: -2, b: 0, c: 0, d: 2 }, box, 1)!;
    expect(mirrored.x + mirrored.far * 2).toBeCloseTo(plain.x - plain.far * 2, 9);
    expect(mirrored.y).toBeCloseTo(plain.y, 9);
    // a thing standing higher throws it further
    expect(shadowOf({ a: 2, b: 0, c: 0, d: 2 }, box, 2)!.y).toBeGreaterThan(plain.y);
    // a transform it cannot read (a recorder's): no shadow
    expect(shadowOf({} as never, box, 1)).toBeNull();
  });
});

describe('the decks of the gears a player picks', () => {
  /** A deck as the renderer paints it: the whole track's width, the lanes of a key mode. */
  const spec = (room: number, stretch: number, mode: KeyModeId = '7K+1S'): DeckSpec => ({
    width: 8 * 73.65,
    room,
    depth: room + 40,
    stretch,
    lanes: deckLanes(mode),
    sides: [],
  });

  /** The skins' gears: each with a key or a dash to a lane, the readouts on its deck and a judge line of its own. */
  const SKIN_GEARS: readonly string[] = ['standard', 'prism', 'sky'];

  it('is the same object whatever the key mode: nothing on it stands for a lane (but PIANO’s keys, STANDARD’s and CRYSTAL’s key caps and SKY’s dashes)', () => {
    for (const gear of GEAR_STYLES.filter((g) => g !== 'piano' && !SKIN_GEARS.includes(g))) {
      for (const [room, stretch] of [
        [96, 1.1],
        [320, 1.25],
        [912, 3.25],
      ]) {
        const [first, ...rest] = (['4K', '7K+1S', '8K', '6K+FX'] as KeyModeId[]).map((mode) => {
          const { g, calls } = callRecorder();
          paintDeck(gear, g, spec(room, stretch, mode));
          return calls;
        });
        expect(first.length, gear).toBeGreaterThan(50);
        for (const calls of rest) expect(calls, gear).toEqual(first);
      }
    }
  });

  it('PIANO: a white key under each key lane, the black keys of an octave between them from a C, a cheek block under the scratch and the side lanes', () => {
    const blackAfter = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].filter(blackKeyAfter);
    // after C, D, F, G and A of each octave
    expect(blackAfter).toEqual([0, 1, 3, 4, 5, 7, 8, 10, 11, 12]);
    for (const [mode, sideNotes, blacks] of [
      ['4K', 'lanes', 2],
      ['5K', 'lanes', 3],
      ['6K', 'lanes', 4],
      ['7K+1S', 'lanes', 5],
      ['8K', 'lanes', 5],
      ['4K+FX', 'lanes', 2],
      ['6K+FX', 'lanes', 4],
      ['6K+FX', 'half', 4],
    ] as [KeyModeId, SideNotes, number][]) {
      for (const [room, stretch] of [
        [155.55, 1.2],
        [912, 3.25],
      ]) {
        const s: DeckSpec = { ...spec(room, stretch, mode), lanes: deckLanes(mode, sideNotes), marks: [] };
        const { g, calls } = callRecorder();
        paintDeck('piano', g, s);
        const keys = s.lanes.filter((l) => l.kind !== 'scratch' && !l.side);
        // a white key filled under each key lane, a little narrower (the gaps between them)
        const rects = calls.filter((c) => c[0] === 'fillRect') as [string, number, number, number, number][];
        for (const l of keys) expect(rects.some(([, x, , w]) => Math.abs(x - l.left - 0.55) < 1e-3 && Math.abs(w - l.width + 1.1) < 1e-3), `${mode} key at ${l.left}`).toBe(true);
        // the black keys (the plate's only rounded boxes), each on the edge between two keys
        const black = calls.filter((c) => c[0] === 'roundRect') as [string, number, number, number, number][];
        expect(black.length, `${mode} ${sideNotes}`).toBe(blacks);
        for (const [, x, , w] of black) expect(keys.some((l) => Math.abs(l.left - (x + w / 2)) < 1e-6), `${mode} black key at ${x}`).toBe(true);
        // the medallion only on the scratch lane's cheek block; the brass inlay always
        const names = (s.marks as DeckMark[]).map((m) => m.name);
        expect(names, mode).toEqual(mode === '7K+1S' ? ['inlay', 'medallion'] : ['inlay']);
        const medallion = s.marks?.find((m) => m.name === 'medallion');
        if (medallion) expect(medallion.x + medallion.w).toBeLessThanOrEqual(s.lanes[0].width);
      }
    }
  });

  it('PIANO’s white keys go down with their lanes: one over each, narrowed between the black keys over its far corners, where the picture or the plate draws them', () => {
    // C D E F G A B: the black keys after C, D, F, G and A
    const notched = [
      [false, true],
      [true, true],
      [true, false],
      [false, true],
      [true, true],
      [true, true],
      [true, false],
    ];
    for (const [room, stretch] of [
      [155.55, 1.2],
      [912, 3.25],
    ]) {
      const s = spec(room, stretch);
      for (const pictured of [false, true]) {
        const keys = deckKeys('piano', s, pictured);
        expect(keys.map((k) => k.lane)).toEqual([1, 2, 3, 4, 5, 6, 7]);
        // where the keys start: under the plate's lip, or as the picture drew them (26 of its 2048 px, laid as long as the camera flattens it)
        const top = pictured ? ((26 * s.width) / 2048) * (stretch / 1.2) : 3.2 * stretch + 1.2;
        const blackEnd = pictured ? ((299 * s.width) / 2048) * (stretch / 1.2) : top - 0.6 + (room - top) * 0.58;
        keys.forEach((k, i) => {
          const lane = s.lanes[k.lane];
          expect(k.box.x).toBeCloseTo(lane.left + 0.55, 9);
          expect(k.box.w).toBeCloseTo(lane.width - 1.1, 9);
          expect(k.box.y).toBeCloseTo(top, 9);
          expect(k.box.y + k.box.h).toBeCloseTo(s.depth, 9);
          expect([k.notch.left > 0, k.notch.right > 0], `key ${i}`).toEqual(notched[i]);
          // half a black key (0.56 of a lane) into it, from its edge
          for (const n of [k.notch.left, k.notch.right]) if (n > 0) expect(n).toBeCloseTo(lane.width * 0.28 - 0.55, 6);
          expect(k.notch.depth).toBeCloseTo(blackEnd - top, 6);
        });
      }
    }
    // none under the side lanes with a place of their own, the key lanes' only; side lanes over the keys leave every key lane its key
    expect(deckKeys('piano', { ...spec(155.55, 1.2, '4K+FX'), lanes: deckLanes('4K+FX') }, false).map((k) => k.lane)).toEqual([1, 2, 3, 4]);
    expect(deckKeys('piano', { ...spec(155.55, 1.2, '6K+FX'), lanes: deckLanes('6K+FX', 'half') }, false).map((k) => k.lane)).toEqual([0, 1, 2, 3, 4, 5]);
    // STANDARD's key caps light with their lanes, one over each key lane
    expect(deckKeys('standard', spec(155.55, 1.2, '7K+1S'), false).map((k) => [k.lane, k.lit])).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((lane) => [lane, '#37e2ff']));
    // CRYSTAL's (saved as 'prism') too, in its ice blue, each keeping its cut when lit (drawn as much longer along the track as the deck is)
    expect(deckKeys('prism', spec(155.55, 1.2, '7K+1S'), false).map((k) => [k.lane, k.lit, k.gem])).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((lane) => [lane, '#7cc8ff', 1.2]));
    expect(deckKeys('prism', spec(155.55, 1.2, '4K'), false).map((k) => k.box)).toEqual(deckKeys('standard', spec(155.55, 1.2, '4K'), false).map((k) => k.box));
    // SKY's dashes, one to a lane in a thin strip under the line: a held lane's cell of the strip lights cyan, its dash white-hot in the cell's middle
    const dashes = deckKeys('sky', spec(155.55, 1.2, '7K+1S'), false);
    expect(dashes.map((k) => [k.lane, k.lit])).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((lane) => [lane, '#3fe3e6']));
    dashes.forEach((k, i) => {
      const lane = spec(155.55, 1.2, '7K+1S').lanes[i];
      expect([k.box.x, k.box.y, k.box.w], `dash ${i}`).toEqual([lane.left, 0, lane.width]);
      // thinner than a key cap by far, and the dash well inside its cell
      expect(k.box.h).toBeLessThan(deckKeys('standard', spec(155.55, 1.2, '7K+1S'), false)[i].box.h / 2);
      expect(k.dash![0]).toBeGreaterThan(0.3);
      expect(k.dash![0]).toBeLessThan(0.8);
      expect(k.dash![1]).toBeLessThan(0.3);
    });
    // the other gears have no keys
    for (const gear of GEAR_STYLES.filter((g) => g !== 'piano' && !SKIN_GEARS.includes(g))) for (const mode of ['4K', '7K+1S', '8K'] as KeyModeId[]) expect(deckKeys(gear, spec(155.55, 1.2, mode), true)).toEqual([]);
  });

  it('STANDARD and CRYSTAL house the score, the speed and the rate on their decks, CRYSTAL’s on long hexagons that stay on the deck', () => {
    for (const gear of ['standard', 'prism'] as const) {
      for (const [room, stretch] of [
        [155.55, 1.2],
        [912, 3.25],
      ]) {
        const s = spec(room, stretch);
        const r = deckReadouts(gear, s)!;
        // under the caps and their seam, the score over the other two, which mirror each other
        expect(r.score.y, gear).toBeGreaterThanOrEqual(47 * stretch);
        expect(r.score.x + r.score.w / 2, gear).toBeCloseTo(s.width / 2, 6);
        expect(r.speed.y, gear).toBeGreaterThanOrEqual(r.score.y + r.score.h);
        expect(r.speed.y + r.speed.h, gear).toBeLessThanOrEqual(room);
        expect(r.rate.x + r.rate.w, gear).toBeCloseTo(s.width - r.speed.x, 6);
        expect([r.rate.y, r.rate.w, r.rate.h], gear).toEqual([r.speed.y, r.speed.w, r.speed.h]);
      }
      // too little of the deck on the screen (a small preview): none
      expect(deckReadouts(gear, spec(96, 1.1)), gear).toBeNull();
    }
    // the other gears house none
    for (const gear of GEAR_STYLES.filter((g) => !SKIN_GEARS.includes(g))) expect(deckReadouts(gear, spec(912, 3.25)), gear).toBeNull();
    // CRYSTAL's hexagons have their points outside the windows, so its side windows start further in
    expect(deckReadouts('prism', spec(155.55, 1.2))!.speed.x).toBeGreaterThan(deckReadouts('standard', spec(155.55, 1.2))!.speed.x);
    for (const [room, stretch, mode] of [
      [155.55, 1.2, '7K+1S'],
      [912, 3.25, '4K'],
    ] as [number, number, KeyModeId][]) {
      // each window marked for the light its sapphire takes, and nothing of the deck drawn off it
      const s = { ...spec(room, stretch, mode), marks: [] as DeckMark[] };
      const { g, calls } = callRecorder();
      paintDeck('prism', g, s);
      expect(s.marks.map((m) => m.name)).toEqual(['plate.score', 'plate.speed', 'plate.rate']);
      const xs = calls.filter((c) => c[0] === 'moveTo' || c[0] === 'lineTo').map((c) => c[1] as number);
      expect(xs.length).toBeGreaterThan(100);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...xs)).toBeLessThanOrEqual(s.width);
    }
    // a deck too short for them: the caps and the facets alone, no marks
    const short = { ...spec(96, 1.1), marks: [] as DeckMark[] };
    paintDeck('prism', callRecorder().g, short);
    expect(short.marks).toEqual([]);
  });

  it('SKY writes the score on its sky, the feather left of it on its line, the speed and the rate in two pills, and marks the sky and the feather for its lights', () => {
    for (const [room, stretch, mode] of [
      [155.55, 1.2, '7K+1S'],
      [912, 3.25, '4K'],
    ] as [number, number, KeyModeId][]) {
      const s = { ...spec(room, stretch, mode), marks: [] as DeckMark[] };
      const r = deckReadouts('sky', s)!;
      // under the strip of dashes and its line (16 px of the sheets), in the lower part of its step
      expect(r.score.y).toBeGreaterThanOrEqual((16 + 34) * stretch);
      expect(r.score.x + r.score.w / 2).toBeCloseTo(s.width / 2, 6);
      expect(r.speed.y).toBeGreaterThanOrEqual(r.score.y + r.score.h);
      expect(r.speed.y + r.speed.h).toBeLessThanOrEqual(room);
      expect(r.rate.x + r.rate.w).toBeCloseTo(s.width - r.speed.x, 6);
      expect([r.rate.y, r.rate.w, r.rate.h]).toEqual([r.speed.y, r.speed.w, r.speed.h]);
      paintDeck('sky', callRecorder().g, s);
      expect(s.marks.map((m) => m.name)).toEqual(['sky', 'feather']);
      const [sky, feather] = s.marks;
      // the sky from under the strip across the whole deck; the feather on the score's line, in the left part of
      // the score's window: left of where the score's first letter stands, however long the score
      expect([sky.x, sky.w]).toEqual([0, s.width]);
      expect(sky.y).toBeCloseTo(16 * stretch, 6);
      const [fx, fy] = [feather.x + feather.w / 2, feather.y + feather.h / 2];
      expect(fx).toBeGreaterThan(r.score.x);
      expect(fx).toBeLessThan(s.width * 0.34);
      expect(fy).toBeGreaterThan(r.score.y);
      expect(fy).toBeLessThan(r.score.y + r.score.h / 2);
      // clear of the speed's pill below it and of the left cloud's end of the deck
      expect(feather.y + feather.h).toBeLessThanOrEqual(r.speed.y + 1e-6);
      expect(feather.x).toBeGreaterThan(r.speed.x + r.speed.w);
    }
    // too little of the deck on the screen: the strip and the sky alone
    expect(deckReadouts('sky', spec(96, 1.1))).toBeNull();
    const short = { ...spec(96, 1.1), marks: [] as DeckMark[] };
    paintDeck('sky', callRecorder().g, short);
    expect(short.marks.map((m) => m.name)).toEqual(['sky']);
  });

  it('SKY lays its sky over the lanes as its picture has it: dark all the way, a faint bank of cloud on the line, three hairline trails; no other gear paints the lanes', () => {
    expect(Object.keys(GEAR_FLOORS)).toEqual(['sky']);
    const [w, h, st] = [1024, 2048, 0.68];
    const paint = () => {
      const { g, calls } = callRecorder();
      GEAR_FLOORS.sky!(g, w, h, st);
      return calls;
    };
    const calls = paint();
    // the same every time
    expect(paint()).toEqual(calls);
    // the ground: its colours from the far end (0) to the judge line (1), every one plainly darker than the deck's sky
    // (whose darkest blue is #2f7fd6) and than any note, and a deep navy over the far three quarters of the track
    const ground = calls.filter((c) => c[0] === 'addColorStop' && typeof c[2] === 'string' && !(c[2] as string).startsWith('rgba(255,255,255')) as [string, number, string][];
    expect(ground.length).toBeGreaterThanOrEqual(8);
    expect(ground.map(([, at]) => at)).toEqual([...ground.map(([, at]) => at)].sort((a, b) => a - b));
    for (const [, at, colour] of ground) {
      const [r, gr, b] = colour.slice(5).split(',').map(Number);
      expect(Math.max(r, gr, b), colour).toBeLessThan(150);
      expect(b, colour).toBeGreaterThan(r);
      if (at < 0.75) expect(Math.max(r, gr, b), colour).toBeLessThan(60);
    }
    // the clouds: faint (set as a shadow's colour, each layer one even shape), kept off the picture's last rows
    // (from the judge line on to the gear the plain sky shows), their puffs as much longer along the track as asked
    const clouds = calls.filter((c) => c[0] === '=' && c[1] === 'shadowColor').map((c) => Number((c[2] as string).slice((c[2] as string).lastIndexOf(',') + 1, -1)));
    expect(clouds.length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...clouds)).toBeLessThanOrEqual(0.2);
    expect(calls).toContainEqual(['rect', 0, 0, w, h - 3]);
    const puffs = calls.filter((c) => c[0] === 'ellipse') as [string, number, number, number, number][];
    expect(puffs.length).toBeGreaterThan(10);
    for (const [, , , rx, ry] of puffs) expect(ry / rx).toBeCloseTo(st, 5);
    // the trails: three closed ribbons drawn after the clouds, each from low by the left rail up to the right,
    // a hairline across (a few px of a picture 1024 px wide), white and see-through
    const closes = calls.map((c, i) => (c[0] === 'closePath' ? i : -1)).filter((i) => i >= 0);
    expect(closes).toHaveLength(3);
    for (const close of closes) {
      const begin = calls.slice(0, close).map((c) => c[0]).lastIndexOf('beginPath');
      const path = calls.slice(begin, close).filter((c) => c[0] === 'moveTo' || c[0] === 'lineTo') as [string, number, number][];
      expect(path.length).toBeGreaterThan(100);
      expect(path.length % 2).toBe(0);
      const [, x0, y0] = path[0];
      // one side out, the other side back: the middle of the path is its far end
      const [, x1, y1] = path[path.length / 2 - 1];
      expect(x0 / w).toBeLessThan(0.2);
      expect(y0 / h).toBeGreaterThan(0.93);
      expect(x1 / w).toBeGreaterThan(0.7);
      expect(y1 / h).toBeLessThan(0.75);
      // as wide as the two sides are apart where they start and where they end
      for (const [a, b] of [[path[0], path[path.length - 1]], [path[path.length / 2 - 1], path[path.length / 2]]]) expect(Math.hypot(a[1] - b[1], a[2] - b[2])).toBeLessThan(8);
    }
    const trails = calls.filter((c) => c[0] === 'addColorStop' && typeof c[2] === 'string' && (c[2] as string).startsWith('rgba(255,255,255')).map((c) => Number((c[2] as string).slice(17, -1)));
    expect(Math.max(...trails)).toBeLessThanOrEqual(0.6);
    expect(Math.min(...trails)).toBe(0);
    // the ticks along the two edges: drawn last, in pairs that mirror each other, evenly up the track from the
    // judge line, every fifth longer, each inside the picture and short (under a twentieth of its width)
    const lastClose = closes[closes.length - 1];
    const ticks = calls.slice(lastClose).filter((c) => c[0] === 'fillRect') as [string, number, number, number, number][];
    expect(ticks.length).toBeGreaterThan(100);
    expect(ticks.length % 2).toBe(0);
    const lefts = ticks.filter((_, i) => i % 2 === 0);
    lefts.forEach(([, x, y, tw, th], i) => {
      const [, rx, ry, rw, rh] = ticks[2 * i + 1];
      expect([ry, rw, rh]).toEqual([y, tw, th]);
      expect(rx + rw).toBeCloseTo(w - x, 6);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(tw / w).toBeLessThan(0.05);
      expect(y).toBeGreaterThan(0);
      expect(y + th).toBeLessThanOrEqual(h);
      if (i > 0) expect(y).toBeLessThan(lefts[i - 1][2]);
    });
    const long = lefts.map(([, , , tw]) => tw > lefts[1][3] * 1.3);
    expect(long.slice(0, 11)).toEqual([true, false, false, false, false, true, false, false, false, false, true]);
    // fainter with the distance: the nearest about half there, the farthest all but gone
    const faint = calls.slice(lastClose).filter((c) => c[0] === '=' && c[1] === 'fillStyle').map((c) => Number((c[2] as string).slice((c[2] as string).lastIndexOf(',') + 1, -1)));
    expect(faint[0]).toBeGreaterThan(0.4);
    expect(faint[0]).toBeLessThanOrEqual(0.5);
    expect(faint[faint.length - 1]).toBeLessThan(0.02);
    expect(faint).toEqual([...faint].sort((a, b) => b - a));
  });

  it('lights a held cap in its gear’s manner: STANDARD’s a rounded glow, CRYSTAL’s keeping its cut, SKY’s a dash white-hot in its cell’s glow', () => {
    const [plain] = deckKeys('standard', spec(155.55, 1.2), false);
    const [gem] = deckKeys('prism', spec(155.55, 1.2), false);
    const a = callRecorder();
    paintLitKey(a.g, 64, 64, plain);
    expect(a.calls.some((c) => c[0] === 'roundRect')).toBe(true);
    expect(a.calls.some((c) => c[0] === 'lineTo')).toBe(false);
    const b = callRecorder();
    paintLitKey(b.g, 192, 192, gem);
    expect(b.calls.some((c) => c[0] === 'roundRect')).toBe(false);
    // drawn in the cap's own px, laid over the whole picture
    const scale = b.calls.find((c) => c[0] === 'scale') as number[];
    expect(scale[1]).toBeCloseTo(192 / gem.box.w, 5);
    expect(scale[2]).toBeCloseTo(192 / gem.box.h, 5);
    const points = b.calls.filter((c) => c[0] === 'moveTo' || c[0] === 'lineTo') as [string, number, number][];
    expect(points.length).toBeGreaterThan(40);
    for (const [, x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(-1e-6);
      expect(x).toBeLessThanOrEqual(gem.box.w + 1e-6);
      expect(y).toBeGreaterThanOrEqual(-1e-6);
      expect(y).toBeLessThanOrEqual(gem.box.h + 1e-6);
    }
    // SKY's: nothing drawn outside the picture, the dash across its middle
    const [dash] = deckKeys('sky', spec(155.55, 1.2), false);
    const c = callRecorder();
    paintLitKey(c.g, 64, 64, dash);
    const boxes = c.calls.filter((k) => k[0] === 'roundRect' || k[0] === 'fillRect') as [string, number, number, number, number][];
    expect(boxes.length).toBeGreaterThan(0);
    for (const [, x, y, w, h] of boxes) {
      expect(x).toBeGreaterThanOrEqual(-1e-6);
      expect(x + w).toBeLessThanOrEqual(64 + 1e-6);
      expect(y).toBeGreaterThanOrEqual(-1e-6);
      expect(y + h).toBeLessThanOrEqual(64 + 1e-6);
    }
  });

  it('PIANO’s key held down is shaded only inside its outline, round the black keys over its corners', () => {
    const { g, calls } = callRecorder();
    paintPressedKey(g, 64, 256, { left: 0.25, right: 0.3, depth: 0.5 });
    // its outline first, kept as the clip for everything after it
    const path = calls.slice(calls.findIndex((c) => c[0] === 'moveTo')).slice(0, 8);
    expect(path).toEqual([
      ['moveTo', 16, 0],
      ['lineTo', 44.8, 0],
      ['lineTo', 44.8, 128],
      ['lineTo', 64, 128],
      ['lineTo', 64, 256],
      ['lineTo', 0, 256],
      ['lineTo', 0, 128],
      ['lineTo', 16, 128],
    ]);
    const clip = calls.findIndex((c) => c[0] === 'clip');
    expect(clip).toBeGreaterThan(calls.findIndex((c) => c[0] === 'moveTo'));
    expect(calls.findIndex((c) => c[0] === 'fillRect' || c[0] === 'fill')).toBeGreaterThan(clip);
    expect(calls[0][0]).toBe('save');
    expect(calls[calls.length - 1][0]).toBe('restore');
  });

  it('a key held down goes down at once and comes back up over a few frames once let go', () => {
    expect(pressLevel(0, true, 16)).toBe(1);
    expect(pressLevel(0.3, true, 16)).toBe(1);
    expect(pressLevel(1, false, KEY_RISE_MS)).toBeCloseTo(Math.exp(-1), 9);
    let level = 1;
    for (let t = 0; t < 200; t += 16) level = pressLevel(level, false, 16);
    expect(level).toBeLessThan(0.01);
  });

  it('lays a deck picture only where it was painted for: a camera near its angle, and PIANO’s only on the 7K+1S row', () => {
    const deck = { width: 2048, height: 541 } as Picture;
    for (const gear of GEAR_STYLES) {
      for (const mode of ['4K', '7K+1S', '8K', '6K+FX'] as KeyModeId[]) {
        const s = spec(155.55, 1.2, mode);
        expect(deckFromPicture(gear, s, { deck }), `${gear} ${mode}`).toBe(gear !== 'piano' || mode === '7K+1S');
        expect(deckFromPicture(gear, s, {}), `${gear} ${mode} without its picture`).toBe(false);
        expect(deckFromPicture(gear, spec(912, DECK_PICTURE_FLATTEST + 0.1, mode), { deck }), `${gear} ${mode} on the plane camera`).toBe(false);
      }
      // side lanes laid over the keys: the six key lanes share the deck, not the picture's row
      expect(deckFromPicture(gear, { ...spec(155.55, 1.2, '6K+FX'), lanes: deckLanes('6K+FX', 'half') }, { deck })).toBe(gear !== 'piano');
    }
  });

  it('paints in code what it has no picture for, on any screen, without drawing pictures', () => {
    for (const gear of GEAR_STYLES) {
      for (const room of [40, 170, 320]) {
        const { g, fills } = fillRecorder();
        expect(() => paintDeck(gear, g, spec(room, 1.3))).not.toThrow();
        // the plate's ground first, across the whole deck
        expect(fills[0], gear).toMatchObject({ x: 0, y: 0, w: 8 * 73.65 });
      }
      const { g, calls } = callRecorder();
      paintDeck(gear, g, spec(320, 1.3));
      expect(calls.some((c) => c[0] === 'drawImage')).toBe(false);
    }
  });

  it('stays where it is under LIFT: notes let through are cut where LIFT’s cover starts, or at the gear', () => {
    // LIFT raises the judge line toward the track's far end (z under 0): notes let through run on
    // under the line to LIFT's cover, 0.6 under it; a line lowered toward the gear (판정선 위치 under
    // 0, z over 0) cuts them at the gear, which stays where it is (0.6 under the unlifted line)
    expect(notesEndZ(-4, 0.6)).toBeCloseTo(-3.4, 9);
    expect(notesEndZ(0, 0.6)).toBe(0.6);
    expect(notesEndZ(0.5, 0.6)).toBe(0.6);
  });

  it('has a judge line of its own, thick and red, a little above the deck', () => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(GEAR_JUDGE.line.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(200);
    expect(Math.max(g, b)).toBeLessThan(80);
    expect(GEAR_JUDGE.height).toBeGreaterThanOrEqual(8);
    // the lanes run on between the line and the deck, a strip several times the line's depth
    expect(GEAR_JUDGE.gap).toBeGreaterThan(2 * GEAR_JUDGE.height);
    // the skins' in their own colours (a white core in cyan, in ice blue, in sky blue), where and as thick as every gear's
    for (const gear of GEAR_STYLES) {
      const j = judgeOf(gear);
      expect([j.height, j.blur, j.gap], gear).toEqual([GEAR_JUDGE.height, GEAR_JUDGE.blur, GEAR_JUDGE.gap]);
      if (!SKIN_GEARS.includes(gear)) expect(j, gear).toBe(GEAR_JUDGE);
    }
    expect([judgeOf('standard').core, judgeOf('prism').core, judgeOf('sky').core]).toEqual(['#ffffff', '#ffffff', '#ffffff']);
    // SKY's edge a sky blue: bluer than it is red, as CRYSTAL's
    const [sr, , sb] = [1, 3, 5].map((i) => parseInt(judgeOf('sky').line.slice(i, i + 2), 16));
    expect(sb - sr).toBeGreaterThan(100);
    // CRYSTAL's edge is blue enough for a white note's edge to show on it
    const [cr, , cb] = [1, 3, 5].map((i) => parseInt(judgeOf('prism').line.slice(i, i + 2), 16));
    expect(cb - cr).toBeGreaterThan(120);
  });
});
