import { describe, expect, it } from 'vitest';
import { keyModes } from '../engine/config';
import type { KeyModeId } from '../engine/types';
import { DECK_STYLES, KEY_PAINT, lowerTop, rowDrop, type DeckSpec, type KeyKind } from './deckArt';
import { computeTrackGeometry, type SideNotes } from './layout';
import { BUILTIN_SKINS } from './skins';
import { deckRows, type DeckRows } from './TrackRenderer';

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

describe('the lane lights under the judge line', () => {
  // rows as the cameras give them: SDVX's (72 px, drawn 1.25 times longer) and the plane camera's (deeper, flatter)
  const rows = [
    [72, 1.25],
    [40, 1.1],
    [180, 3.25],
  ];
  const modes: KeyModeId[] = ['4K', '7K+1S', '8K', '6K+FX'];

  it('lies no nearer the line than neon’s hexagons in any lane: larger lights keep their size and lie lower', () => {
    for (const style of DECK_STYLES) {
      for (const mode of modes) {
        for (const [depth, stretch] of rows) {
          const lanes = deckLanes(mode);
          const drop = rowDrop(style, lanes, depth, stretch);
          expect(drop).toBeGreaterThanOrEqual(0);
          for (const l of lanes) {
            // how far under the row's top each light starts, against neon's in the same lane
            const top = depth / 2 - KEY_PAINT[style].reach(l.kind, l.width, depth, stretch) + drop;
            const neon = depth / 2 - KEY_PAINT.neon.reach(l.kind, l.width, depth, stretch);
            expect(top).toBeGreaterThanOrEqual(neon - 1e-9);
          }
          // and no lower than it needs: one lane's light starts where neon's does
          if (drop > 0) {
            const nearest = Math.min(...lanes.map((l) => depth / 2 - KEY_PAINT[style].reach(l.kind, l.width, depth, stretch) + drop - (depth / 2 - KEY_PAINT.neon.reach(l.kind, l.width, depth, stretch))));
            expect(nearest).toBeCloseTo(0, 9);
          }
        }
      }
    }
  });

  it('moves the large buttons and gems down, and leaves neon’s and the small lights where they were', () => {
    const lanes = deckLanes('7K+1S');
    for (const style of ['neon', 'hazard', 'mono'] as const) expect(rowDrop(style, lanes, 72, 1.25)).toBe(0);
    for (const style of ['arcade', 'candy', 'jewel', 'mixer'] as const) expect(rowDrop(style, lanes, 72, 1.25)).toBeGreaterThan(4);
    // every light stays inside its row (an outline at most a px past it)
    for (const style of DECK_STYLES) for (const l of lanes) expect(KEY_PAINT[style].reach(l.kind, l.width, 72, 1.25)).toBeLessThan(36 + 1);
    // JEWEL's band is the row: its top lies no nearer the line than neon's hexagons either
    for (const l of lanes) expect(KEY_PAINT.jewel.reach(l.kind, l.width, 72, 1.25)).toBeGreaterThanOrEqual(36);
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

  it('lie under the row of lane lights and inside the room the screen shows, the plates’ lower parts under them', () => {
    for (const style of DECK_STYLES) {
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
    const flat = deckRows('neon', lanes, 320, () => 1.25);
    const gap = (d: DeckRows) => d.sideTop - d.keyTop - d.keyDepth;
    for (const [room, flatten] of rooms.filter(([, f]) => f > 1.3)) {
      const d = deckRows('neon', lanes, room, () => flatten);
      // for the track's width, a plane px along the track is this many times shorter on the screen than on FLAT
      const k = d.stretch / 1.3;
      expect(Math.abs(d.keyDepth / k - flat.keyDepth)).toBeLessThan(1);
      expect(Math.abs(d.sideDepth / k - flat.sideDepth)).toBeLessThan(1);
      expect(Math.abs(gap(d) / k - gap(flat))).toBeLessThan(1);
    }
  });
});
