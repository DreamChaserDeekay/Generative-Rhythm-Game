import { describe, expect, it } from 'vitest';
import { keyModes } from '../engine/config';
import type { KeyModeId } from '../engine/types';
import { blackKeyAfter, codeBorderLook, DECK_PICTURE_FLATTEST, DECK_STYLES, deckFromPicture, GEAR_JUDGE, GEAR_STYLES, gearBorderLook, isGear, KEY_PAINT, lightsOf, lowerTop, paintBorder, paintDeck, paintFace, referenceReach, rowDrop, shadowOf, type DeckMark, type DeckSpec, type KeyKind, type LightStyle, type Picture } from './deckArt';
import { computeTrackGeometry, type SideNotes } from './layout';
import { BASE_SKIN } from './skins';
import { deckRows, deckTopZ, notesEndZ, type DeckRows } from './TrackRenderer';

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

/** The skins' own gears: a light per lane on their plates. */
const LIGHTS = DECK_STYLES.filter((s): s is LightStyle => !isGear(s));

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

describe('the lane lights under the judge line', () => {
  // rows as the cameras give them: SDVX's (72 px, drawn 1.25 times longer) and the plane camera's (deeper, flatter)
  const rows = [
    [72, 1.25],
    [40, 1.1],
    [180, 3.25],
  ];
  const modes: KeyModeId[] = ['4K', '7K+1S', '8K', '6K+FX'];

  it('lies no nearer the line than the reference hexagons in any lane: larger lights keep their size and lie lower', () => {
    for (const style of LIGHTS) {
      for (const mode of modes) {
        for (const [depth, stretch] of rows) {
          const lanes = deckLanes(mode);
          const drop = rowDrop(style, lanes, depth, stretch);
          expect(drop).toBeGreaterThanOrEqual(0);
          for (const l of lanes) {
            // how far under the row's top each light starts, against the reference hexagon in the same lane
            const top = depth / 2 - KEY_PAINT[style].reach(l.kind, l.width, depth, stretch) + drop;
            const reference = depth / 2 - referenceReach(l.width, depth, stretch);
            expect(top).toBeGreaterThanOrEqual(reference - 1e-9);
          }
          // and no lower than it needs: one lane's light starts where the reference's does
          if (drop > 0) {
            const nearest = Math.min(...lanes.map((l) => depth / 2 - KEY_PAINT[style].reach(l.kind, l.width, depth, stretch) + drop - (depth / 2 - referenceReach(l.width, depth, stretch))));
            expect(nearest).toBeCloseTo(0, 9);
          }
        }
      }
    }
  });

  it('lights the lanes on the skins’ own gears only: the ones a player picks have no lane’s key on them, their row not moved down', () => {
    const lanes = deckLanes('7K+1S');
    for (const style of LIGHTS) expect(lightsOf(style), style).toBe(KEY_PAINT[style]);
    for (const style of GEAR_STYLES) {
      expect(lightsOf(style), style).toBeNull();
      expect(deckRows(style, lanes, 320, () => 1.25).drop, style).toBe(0);
    }
    // STEM's small dots lie where they were, and every light stays inside its row (an outline at most a px past it)
    expect(rowDrop('stem', lanes, 72, 1.25)).toBeLessThan(2);
    for (const style of LIGHTS) for (const l of lanes) expect(KEY_PAINT[style].reach(l.kind, l.width, 72, 1.25)).toBeLessThan(36 + 1);
  });
});

describe('the side bars under the lane lights (side lanes laid over the keys)', () => {
  // the room under the line and how much the camera flattens the track there, as the cameras give
  // them: the perspective ones (down to a small preview's under LOW), with LIFT, and the plane one
  const rooms: [number, number][] = [
    [128, 1.1],
    [144, 1.1],
    [192, 1.25],
    [320, 1.25],
    [1072, 2.3],
    [912, 3.25],
    [1808, 3.25],
  ];

  // only the skins' own gears have them: the ones a player picks have no lane lights (lightsOf)
  it('lie under the row of lane lights and inside the room the screen shows, the plates’ lower parts under them', () => {
    for (const style of LIGHTS) {
      for (const mode of ['4K+FX', '6K+FX'] as const) {
        const lanes = deckLanes(mode, 'half');
        const halves = computeTrackGeometry(keyModes[mode], 8, 40, 'half').lanes.filter((l) => l.over);
        for (const [room, flatten] of rooms) {
          const d = deckRows(style, lanes, room, () => flatten);
          // the row is as it would be without them
          expect(d).toMatchObject(deckRows(style, deckLanes(mode.replace('+FX', '') as KeyModeId), room, () => flatten));
          // a gap under the row, and all of the bar on the screen
          expect(d.sideTop).toBeGreaterThan(d.keyTop + d.keyDepth + 4);
          expect(d.sideDepth).toBeGreaterThanOrEqual(16);
          expect(d.sideTop + d.sideDepth).toBeLessThanOrEqual(room);
          const spec: DeckSpec = {
            width: 8 * 73.65,
            room,
            depth: room + 40,
            keyTop: d.keyTop,
            keyDepth: d.keyDepth,
            stretch: d.stretch,
            lanes,
            sides: halves.map((l) => ({ left: (l.x - l.width / 2 + 4) * 73.65, width: l.width * 73.65, top: d.sideTop, depth: d.sideDepth })),
            colours: BASE_SKIN.colors,
          };
          // panels, grilles and bands start under the bars; without them, under the lights as before
          expect(lowerTop(spec)).toBe(d.sideTop + d.sideDepth);
          expect(lowerTop({ ...spec, sides: [] })).toBe(d.keyTop + d.keyDepth);
        }
      }
    }
  });

  it('keep their size and their gap under the row for the track’s width where the camera flattens the track, as the row does', () => {
    const lanes = deckLanes('6K+FX', 'half');
    // FLAT's: a full row, the track not flattened beyond what the row holds
    const flat = deckRows('stem', lanes, 320, () => 1.25);
    const gap = (d: DeckRows) => d.sideTop - d.keyTop - d.keyDepth;
    for (const [room, flatten] of rooms.filter(([, f]) => f > 1.3)) {
      const d = deckRows('stem', lanes, room, () => flatten);
      // for the track's width, a plane px along the track is this many times shorter on the screen than on FLAT
      const k = d.stretch / 1.3;
      expect(Math.abs(d.keyDepth / k - flat.keyDepth)).toBeLessThan(1);
      expect(Math.abs(d.sideDepth / k - flat.sideDepth)).toBeLessThan(1);
      expect(Math.abs(gap(d) / k - gap(flat))).toBeLessThan(1);
    }
  });
});

describe('the track’s borders in a gear’s frame', () => {
  it('paints a border tile whole: a bevel on the edge facing the lanes, a dark line on the outer one, a line down its middle where it is wide enough', () => {
    const look = { body: '#202020', edge: '#c0c0c0', line: ['#ff0000', '#00ff00'] as const, brushed: true };
    for (const side of [-1, 1] as const) {
      const { g, fills } = fillRecorder();
      paintBorder(g, 24, 256, look, side, 4);
      expect(fills[0]).toEqual({ x: 0, y: 0, w: 24, h: 256, style: '#202020' });
      const [inner, outer] = side < 0 ? [20, 0] : [0, 20];
      expect(fills.some((f) => f.x === inner && f.w === 4 && f.h === 256 && /^rgba\(\d+,\d+,\d+,0\.9\)$/.test(String(f.style)))).toBe(true);
      expect(fills.some((f) => f.x === outer && f.w === 4 && f.h === 256 && f.style === 'rgba(0,0,0,0.5)')).toBe(true);
      expect(fills.some((f) => f.style === (side < 0 ? '#ff0000' : '#00ff00'))).toBe(true);
      for (const f of fills) expect(f.x >= 0 && f.x + f.w <= 24 + 1e-9 && f.y >= 0 && f.y + f.h <= 256 + 1e-9).toBe(true);
    }
    // three plane px wide: no line down its middle
    const narrow = fillRecorder();
    paintBorder(narrow.g, 12, 256, look, -1, 4);
    expect(narrow.fills.some((f) => f.style === '#ff0000')).toBe(false);
  });

  it('gives every gear drawn in code a border in its plate’s colours', () => {
    for (const style of DECK_STYLES) expect(codeBorderLook(style, BASE_SKIN.colors).edge, style).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('gives each gear a player picks its own frame, wider than a skin’s rails, painted whole, lit in FEVER', () => {
    const widths = GEAR_STYLES.map((style) => {
      const look = gearBorderLook(style, {});
      expect(look.paint, style).toBeTypeOf('function');
      expect(look.lit, style).toBe(true);
      expect(look.tile, style).toBeGreaterThan(0);
      for (const lit of [false, true]) {
        for (const side of [-1, 1] as const) {
          const { g, fills } = fillRecorder();
          paintBorder(g, look.width! * 4, look.tile! * 4, look, side, 4, lit);
          // the whole tile filled first, nothing outside it
          expect(fills[0], style).toMatchObject({ x: 0, y: 0, w: look.width! * 4, h: look.tile! * 4 });
          for (const f of fills) expect(f.x >= -1e-9 && f.x + f.w <= look.width! * 4 + 1e-9, style).toBe(true);
        }
      }
      return look.width!;
    });
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(14);
    expect(codeBorderLook('line', BASE_SKIN.colors).paint).toBeUndefined();
  });

  it('stands each gear a player picks as a wall, its inner face painted whole, lit in FEVER; a skin’s rails lie flat', () => {
    for (const style of GEAR_STYLES) {
      const look = gearBorderLook(style, {});
      // as high as a short wall: more than a thin rail's lip, less than a lane
      expect(look.height, style).toBeGreaterThanOrEqual(12);
      expect(look.height, style).toBeLessThanOrEqual(40);
      expect(look.face, style).toBeTypeOf('function');
      const [w, h] = [look.tile! * 4, look.height! * 4];
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
    for (const style of ['line', 'stem'] as const) expect(codeBorderLook(style, BASE_SKIN.colors).height).toBeUndefined();
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
    keyTop: 8,
    keyDepth: 56,
    stretch,
    lanes: deckLanes(mode),
    sides: [],
    colours: BASE_SKIN.colors,
  });

  it('is the same object whatever the key mode: nothing on it stands for a lane (but PIANO’s keys)', () => {
    for (const gear of GEAR_STYLES.filter((g) => g !== 'piano')) {
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
    expect(deckFromPicture('line', spec(155.55, 1.2), { deck })).toBe(false);
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
    expect(isGear('line')).toBe(false);
    expect(GEAR_STYLES.every(isGear)).toBe(true);
  });

  it('stays where it is under LIFT, the raised line and LIFT’s cover above it; a skin’s own gear follows the line', () => {
    // LIFT raises the judge line toward the track's far end (z under 0); the deck starts 0.6 under the line
    for (const judgeZ of [0, -4, -20, 0.5]) expect(deckTopZ(true, judgeZ, 0.6)).toBe(0.6);
    expect(deckTopZ(false, -4, 0.6)).toBeCloseTo(-3.4, 9);
    expect(deckTopZ(false, 0, 0.6)).toBe(0.6);
    // notes let through run on under the line to LIFT's cover; a line lowered toward the gear (판정선
    // 위치 under 0, z over 0) cuts them at the gear, which stays where it is
    expect(notesEndZ(true, -4, 0.6)).toBeCloseTo(-3.4, 9);
    expect(notesEndZ(true, 0, 0.6)).toBe(0.6);
    expect(notesEndZ(true, 0.5, 0.6)).toBe(0.6);
    expect(notesEndZ(false, 0.5, 0.6)).toBeCloseTo(1.1, 9);
  });

  it('has a judge line of its own, thick and red, a little above the deck', () => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(GEAR_JUDGE.line.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(200);
    expect(Math.max(g, b)).toBeLessThan(80);
    expect(GEAR_JUDGE.height).toBeGreaterThanOrEqual(8);
    // the lanes run on between the line and the deck, a strip several times the line's depth
    expect(GEAR_JUDGE.gap).toBeGreaterThan(2 * GEAR_JUDGE.height);
  });
});
