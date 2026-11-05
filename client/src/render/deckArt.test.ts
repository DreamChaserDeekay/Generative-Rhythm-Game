import { describe, expect, it } from 'vitest';
import { keyModes } from '../engine/config';
import type { KeyModeId } from '../engine/types';
import { codeBorderLook, DECK_STYLES, GEAR_JUDGE, GEAR_STYLES, gearBorderLook, isGear, KEY_PAINT, lightsOf, lowerTop, paintBorder, paintDeck, referenceReach, rowDrop, type DeckSpec, type KeyKind, type LightStyle } from './deckArt';
import { computeTrackGeometry, type SideNotes } from './layout';
import { BUILTIN_SKINS } from './skins';
import { deckRows, deckTopZ, notesEndZ, type DeckRows } from './TrackRenderer';

/** A key mode's lanes as the deck has them (px of the sheets, 73.65 to a track unit); side lanes laid over the keys are none of them. */
function deckLanes(mode: KeyModeId, sideNotes: SideNotes = 'lanes'): { left: number; kind: KeyKind; width: number }[] {
  return computeTrackGeometry(keyModes[mode], 8, 40, sideNotes)
    .lanes.filter((l) => !l.over)
    .map((l) => ({
      left: (l.x - l.width / 2 + 4) * 73.65,
      kind: l.kind === 'scratch' ? 'scratch' : l.color === 'white' ? 'white' : 'other',
      width: l.width * 73.65,
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

  it('lights the lanes on the skins’ own gears only: the four a player picks have no lane’s key on them, their row not moved down', () => {
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

  // only the skins' own gears have them: the four a player picks have no lane lights (lightsOf)
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
            colours: BUILTIN_SKINS[0].colors,
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
    for (const style of DECK_STYLES) expect(codeBorderLook(style, BUILTIN_SKINS[0].colors).edge, style).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('gives each of the four gears its own frame, wider than a skin’s rails, painted whole, lit in FEVER', () => {
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
    expect(codeBorderLook('line', BUILTIN_SKINS[0].colors).paint).toBeUndefined();
  });
});

describe('the four gears’ decks', () => {
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
    colours: BUILTIN_SKINS[0].colors,
  });

  it('is the same object whatever the key mode: nothing on it stands for a lane', () => {
    for (const gear of GEAR_STYLES) {
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
