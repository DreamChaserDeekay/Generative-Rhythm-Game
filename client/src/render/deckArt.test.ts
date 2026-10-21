import { describe, expect, it } from 'vitest';
import { keyModes } from '../engine/config';
import type { KeyModeId } from '../engine/types';
import { DECK_STYLES, KEY_PAINT, rowDrop, type KeyKind } from './deckArt';
import { computeTrackGeometry } from './layout';

/** A key mode's lanes as the deck has them (px of the sheets, 73.65 to a track unit). */
function deckLanes(mode: KeyModeId): { kind: KeyKind; width: number }[] {
  return computeTrackGeometry(keyModes[mode], 8, 40).lanes.map((l) => ({
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
