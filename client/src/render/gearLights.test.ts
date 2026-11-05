import { describe, expect, it } from 'vitest';
import { GEAR_STYLES, paintDeck, type DeckMark, type DeckSpec } from './deckArt';
import { beatClock, DECK_PICTURE_PX, GEAR_LIGHTS, sinceTurn, softTurn, spectrumBars, type BeatClock } from './gearLights';
import { BASE_SKIN } from './skins';

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
    keyTop: 8,
    keyDepth: 56,
    stretch,
    lanes: [
      { left: 0, width: 68.5, kind: 'scratch' },
      ...Array.from({ length: 7 }, (_, i) => ({ left: 68.5 + i * lane, width: lane, kind: i % 2 ? ('other' as const) : ('white' as const) })),
    ],
    sides: [],
    colours: BASE_SKIN.colors,
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

  it('lights each of n in turn: one a beat (or every few), and under 번쩍임 줄이기 a smooth rise and fall about its turn', () => {
    for (let beat = 0; beat < 12; beat++) {
      expect(sinceTurn(beat, beat % 4, 4)).toBe(0);
      expect(sinceTurn(beat + 0.5, beat % 4, 4)).toBeCloseTo(0.5, 9);
      expect(sinceTurn(beat, (beat + 1) % 4, 4)).toBe(3);
      expect(softTurn(beat, beat % 4, 4)).toBeCloseTo(1, 9);
    }
    let last = softTurn(0, 0, 4, 2);
    for (let t = 0; t < 40; t += 1 / 60) {
      const now = softTurn(t, 0, 4, 2);
      expect(Math.abs(now - last)).toBeLessThan(0.05);
      last = now;
    }
  });

  it('jumps the screen’s bars on the eighths, every bar on the screen and every peak marker over its bar', () => {
    for (let t = 0; t < 6.4; t += 0.05) {
      for (const calm of [false, true]) {
        const { heights, peaks } = spectrumBars(at(t), calm, 22, 7);
        expect(heights).toHaveLength(22);
        heights.forEach((h, i) => {
          expect(h).toBeGreaterThanOrEqual(0);
          expect(h).toBeLessThanOrEqual(7);
          if (peaks[i] >= 0) {
            expect(peaks[i]).toBeGreaterThanOrEqual(h);
            expect(peaks[i]).toBeLessThan(7);
          }
        });
      }
    }
    // they move
    expect(spectrumBars(at(0.1), false, 22, 7).heights).not.toEqual(spectrumBars(at(0.35), false, 22, 7).heights);
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

  it('find their parts on its deck drawn in code (the plane camera’s), all but the ones that move over its picture', () => {
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
        expect(names.has(l.mark!), `${l.mark} at ${room}`).toBe(true);
        for (const w of [...(l.codeWell?.inside ?? []), ...(l.codeWell?.outside ?? [])]) expect(names.has(w), `${w} at ${room}`).toBe(true);
      }
      if (set.screen?.mark) expect(names.has(set.screen.mark)).toBe(true);
      for (const m of marks) {
        expect(m.w, m.name).toBeGreaterThan(0);
        expect(m.h, m.name).toBeGreaterThan(0);
      }
    }
  });
});
