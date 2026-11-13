import { describe, expect, it } from 'vitest';
import { GEAR_STYLES, paintDeck, PANEL_MARKS, type DeckMark, type DeckSpec } from './deckArt';
import { beatClock, DECK_PICTURE_PX, GEAR_LIGHTS, type BeatClock } from './gearLights';

/** The deck pictures' rows (2048 across, the SDVX 16:9 room: build_gears.py). */
const PICTURE_ROWS = 541;

/** A 2D context that takes every call and does nothing (a paint's marks are what is read). */
const nothing = new Proxy({} as Record<string | symbol, unknown>, { get: () => () => ({ addColorStop: () => undefined }), set: () => true }) as unknown as CanvasRenderingContext2D;

/** A gear's deck as the renderer paints it in code: the track's width, `room` of it on the screen, flattened `stretch` times. */
function deckSpec(room: number, stretch: number, marks: DeckMark[]): DeckSpec {
  const width = 8 * 73.65;
  const lane = (width - 68.5) / 7;
  return {
    width,
    room,
    depth: room + 40,
    stretch,
    lanes: [
      { left: 0, width: 68.5, kind: 'scratch' },
      ...Array.from({ length: 7 }, (_, i) => ({ left: 68.5 + i * lane, width: lane, kind: i % 2 ? ('other' as const) : ('white' as const) })),
    ],
    sides: [],
    marks,
  };
}

/** The clock at 150 BPM in 4/4 (a bar 1.6 s), `fever` on or off. */
const at = (seconds: number, fever = false): BeatClock => beatClock(seconds * 1000, Array.from({ length: 40 }, (_, b) => b * 1600), fever);

describe('the beat clock', () => {
  it('counts bars from the chart’s bar lines and four beats to each, carrying on before the first and after the last', () => {
    const bars = [0, 2000, 4000];
    expect(beatClock(1000, bars)).toMatchObject({ bar: 0.5, beat: 2 });
    expect(beatClock(3000, bars).bar).toBeCloseTo(1.5, 9);
    expect(beatClock(5000, bars).bar).toBeCloseTo(2.5, 9);
    expect(beatClock(-1000, bars).bar).toBeCloseTo(-0.5, 9);
    // bars of their own lengths
    expect(beatClock(2000, [0, 1000, 3000]).bar).toBeCloseTo(1.5, 9);
    // none: 120 BPM in 4/4
    expect(beatClock(3000, []).bar).toBeCloseTo(1.5, 9);
    expect(beatClock(0, [], true).fever).toBe(true);
    expect(beatClock(0, []).fever).toBe(false);
  });
});

describe.each(GEAR_STYLES.map((gear) => ({ gear })))('the $gear gear’s lights', ({ gear }) => {
  const set = GEAR_LIGHTS[gear]();

  it('lie on its deck’s picture', () => {
    expect(set.lights.length).toBeGreaterThan(0);
    for (const l of set.lights) {
      expect(l.x - l.w / 2, `${l.shape} at ${l.x}`).toBeGreaterThanOrEqual(0);
      expect(l.x + l.w / 2, `${l.shape} at ${l.x}`).toBeLessThanOrEqual(DECK_PICTURE_PX);
      expect(l.y - l.h / 2, `${l.shape} at ${l.y}`).toBeGreaterThanOrEqual(0);
      expect(l.y + l.h / 2, `${l.shape} at ${l.y}`).toBeLessThanOrEqual(PICTURE_ROWS);
    }
  });

  it('move with the bar and the beat, never past full, and under 번쩍임 줄이기 without a sudden jump', () => {
    const levels = (t: number, calm: boolean, fever: boolean) => set.lights.map((l) => l.level(at(t, fever), calm));
    let moved = false;
    for (const fever of [false, true]) {
      let calmBefore = levels(0, true, fever);
      const first = levels(0, false, fever);
      for (let t = 0; t < 6.4; t += 1 / 60) {
        const now = levels(t, false, fever);
        const calm = levels(t, true, fever);
        for (const v of [...now, ...calm]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
        calm.forEach((v, i) => expect(Math.abs(v - calmBefore[i]), `light ${i} at ${t.toFixed(2)} s`).toBeLessThan(0.12));
        calmBefore = calm;
        if (now.some((v, i) => Math.abs(v - first[i]) > 0.2)) moved = true;
      }
    }
    expect(moved).toBe(true);
  });

  it('find their parts on its deck drawn in code (the plane camera’s) or, a skin’s, in its panel’s picture, all but the ones that move over its picture', () => {
    const painted = Object.keys(PANEL_MARKS[gear] ?? {});
    for (const [room, stretch] of [
      [912, 3.25],
      [192, 1.25],
    ]) {
      const marks: DeckMark[] = [];
      paintDeck(gear, nothing, deckSpec(room, stretch, marks));
      const names = new Set(marks.map((m) => m.name));
      for (const l of set.lights) {
        if (l.at) continue;
        expect(l.mark, `${l.shape} at ${l.x}`).toBeDefined();
        // a part only the panel's picture has (the right row of teeth on NOIR's board)
        expect(names.has(l.mark!) || painted.includes(l.mark!), `${l.mark} at ${room}`).toBe(true);
      }
      for (const m of marks) {
        expect(m.w, m.name).toBeGreaterThan(0);
        expect(m.h, m.name).toBeGreaterThan(0);
      }
    }
  });

  it('light every part its panel’s picture marks for them, each part one light’s', () => {
    for (const name of Object.keys(PANEL_MARKS[gear] ?? {})) expect(set.lights.filter((l) => l.mark === name), name).toHaveLength(1);
  });
});
