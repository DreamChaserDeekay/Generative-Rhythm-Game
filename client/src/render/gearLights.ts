import * as THREE from 'three';
import type { DeckMark, GearStyle } from './deckArt';

/**
 * The gears' lights that move with the music: glows laid over a gear's deck where its parts light (a
 * knob's ring, buttons, keys from inside their well, shift lights, windows' backlights, pearl inlay)
 * and the bars of its screen, each lit by a pattern of the bar and the beat (beatClock). The deck is
 * painted once; these are a few quads over it, added to it, whose opacity is set each frame (and a
 * small screen's picture redrawn when one of its bars changes), so they cost next to nothing in the play.
 *
 * Each light is placed where the deck's picture shows its part (the deck picture's px:
 * DECK_PICTURE_PX across, its rows as many: scripts/assets/build_gears.py) and, on a deck drawn in
 * code (the plane camera's), on the box its plate marked for the part (deckArt.ts: DeckSpec.marks).
 */

/** How many px across the decks' pictures are (build_gears.py's deck_flat). */
export const DECK_PICTURE_PX = 2048;

/** Where the music is: bars from the chart's bar lines (whole numbers at a bar's start), beats four to a bar; and whether FEVER is on. */
export interface BeatClock {
  bar: number;
  beat: number;
  /** Seconds, for what runs on its own time (the judge line's shimmer). */
  seconds: number;
  fever: boolean;
}

/** A bar's length where the chart gives none (a preview, before the first bar): 120 BPM in 4/4. */
const DEFAULT_BAR_MS = 2000;

/** The bar and beat at `timeMs` from the bars' start times (sorted), carried on at the nearest bar's length before the first and after the last. */
export function beatClock(timeMs: number, barTimes: readonly number[], fever = false): BeatClock {
  const seconds = timeMs / 1000;
  const n = barTimes.length;
  const clock = (bar: number): BeatClock => ({ bar, beat: bar * 4, seconds, fever });
  if (n === 0) return clock(timeMs / DEFAULT_BAR_MS);
  const length = (i: number) => (n > 1 ? barTimes[Math.min(n - 1, i + 1)] - barTimes[Math.min(n - 2, i)] : DEFAULT_BAR_MS) || DEFAULT_BAR_MS;
  if (timeMs < barTimes[0]) return clock((timeMs - barTimes[0]) / length(0));
  // the last bar start at or before the time
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (barTimes[mid] <= timeMs) lo = mid;
    else hi = mid - 1;
  }
  return clock(lo + (timeMs - barTimes[lo]) / length(lo));
}

const frac = (x: number) => x - Math.floor(x);

/** A number in 0..1 from two integers, the same every time. */
export function hash(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Beats since light `i` of `n` last lit, one lighting every `every` beats in turn. */
export function sinceTurn(beat: number, i: number, n: number, every = 1): number {
  const step = beat / every;
  const k = Math.floor(step);
  const back = (((k - i) % n) + n) % n;
  return (back + step - k) * every;
}

/** A flash fading over the beats since it lit. */
const fade = (since: number, decay: number) => Math.exp(-since * decay);

/** A slow swell and ebb over `period` beats, 0..1. */
const swell = (beat: number, period: number) => 0.5 - 0.5 * Math.cos((2 * Math.PI * beat) / period);

/** Light `i` of `n` taking its turn as `sinceTurn`, but rising and falling smoothly over `every` beats each side of it (under 번쩍임 줄이기), 0..1. */
export function softTurn(beat: number, i: number, n: number, every = 1): number {
  const turns = sinceTurn(beat, i, n, every) / every;
  const away = Math.min(turns, n - turns);
  return away < 1 ? 0.5 + 0.5 * Math.cos(Math.PI * away) : 0;
}

/**
 * What a light looks like: a soft glow, an even wash with soft edges, a ring (a part's rim, or an arc
 * of it), a four-pointed glint, or even to its quad's edges (`fill`: a part's well drawn in code
 * shapes it, `codeWell`).
 */
export type LightShape = 'glow' | 'wash' | 'ring' | 'glint' | 'fill';

export interface GearLight {
  shape: LightShape;
  /** Its middle and size, deck picture px. */
  x: number;
  y: number;
  w: number;
  h: number;
  colour: number;
  /** A ring's arc that shows in the picture, degrees (0 to the right, 90 toward the camera): the rest is behind its standing part. */
  arc?: readonly [number, number];
  /** How bright, 0..1, at `c`; `calm` under 번쩍임 줄이기 (no flashes, nothing sudden). */
  level: (c: BeatClock, calm: boolean) => number;
  /** Where it is at `c`, for one that moves (a glint along a ring, a light along a strip); deck picture px. */
  at?: (c: BeatClock) => readonly [number, number];
  /** Only where the deck's glow mask lets it (light from inside a part's well, pearl that shines); none without the mask. */
  confined?: boolean;
  /**
   * On a deck drawn in code: the mark of the part it lights, its quad that box grown `grow` times
   * (across, along), its shape there `codeShape` where it differs, and only inside the boxes of
   * `codeWell.inside` outside those of `codeWell.outside` (a well round the things sitting in it).
   * Without a mark it is not lit there.
   */
  mark?: string;
  grow?: number | readonly [number, number];
  codeShape?: LightShape;
  codeWell?: { inside: readonly string[]; outside: readonly string[] };
}

/** A small screen of bars on a deck (the keyboard's OLED): its window, its grid of segments, and the bars' heights at a time. */
export interface GearScreen {
  /** The part of the window drawn over, deck picture px; on a deck drawn in code, its mark's box. */
  x: number;
  y: number;
  w: number;
  h: number;
  mark?: string;
  background: string;
  /** The bottom-left segment's middle, the step to the next column and row, a segment's size (px). */
  first: readonly [number, number];
  step: readonly [number, number];
  segment: readonly [number, number];
  columns: number;
  rows: number;
  lit: string;
  peak: string;
  /** Each column's lit segments, and the segment its peak marker is on (-1: none). */
  bars: (c: BeatClock, calm: boolean) => { heights: number[]; peaks: number[] };
}

export interface GearLightSet {
  lights: GearLight[];
  screen?: GearScreen;
}

/**
 * A spectrum of `columns` bars jumping on the eighths and lifted on the beat (calm: on the beats, no
 * lift), each with a peak marker held over it while the bar falls back (-1 where there is none).
 */
export function spectrumBars(c: BeatClock, calm: boolean, columns: number, rows: number): { heights: number[]; peaks: number[] } {
  const per = calm ? 1 : 2;
  const level = (beat: number, i: number) => {
    const step = Math.floor(beat * per);
    const shape = 0.95 - 0.35 * (i / Math.max(1, columns - 1)) + 0.12 * Math.sin(i * 1.7);
    const target = (s: number) => Math.min(1, shape * (0.55 + 0.5 * hash(s, i)));
    const blend = Math.min(1, frac(beat * per) / 0.3);
    const eased = blend * blend * (3 - 2 * blend);
    const lift = calm ? 0.95 : 0.85 + 0.25 * fade(frac(beat), 5);
    return (target(step - 1) + (target(step) - target(step - 1)) * eased) * lift;
  };
  const segments = (beat: number, i: number) => Math.max(0, Math.min(rows, Math.round(level(beat, i) * rows)));
  const heights: number[] = [];
  const peaks: number[] = [];
  for (let i = 0; i < columns; i++) {
    const now = segments(c.beat, i);
    // the highest the bar has been over the last half beat, falling a segment every eighth of a beat
    let held = 0;
    for (const back of [0.125, 0.25, 0.375, 0.5]) held = Math.max(held, segments(c.beat - back, i) - Math.round(back * 8) + 1);
    heights.push(now);
    peaks.push(held > now ? Math.min(rows - 1, held - 1) : -1);
  }
  return { heights, peaks };
}

/** A ring light's quad for its ring's radii (the ring lies at 0.84 of the quad's half-size). */
const RING_REACH = 1 / 0.84;

const ORANGE = 0xff8a24;
const CYAN = 0x39d4ff;

/** STANDARD: the jog disc's cyan ring breathing on the beat, the light strip under the name with a light running along it each bar, the speaker lit through its holes on the strong beats. */
function standardLights(): GearLightSet {
  const strip = { x0: 756, x1: 1294, y: 308.5 };
  return {
    lights: [
      {
        shape: 'ring',
        x: 260.8,
        y: 254.3,
        w: 2 * 148.2 * RING_REACH,
        h: 2 * 176.8 * RING_REACH,
        arc: [-90, 170],
        colour: CYAN,
        level: (c, calm) => (calm ? 0.25 + 0.2 * swell(c.beat, 4) : 0.2 + 0.6 * fade(frac(c.beat), 3.5)),
        mark: 'jog',
        grow: RING_REACH,
      },
      {
        shape: 'wash',
        x: (strip.x0 + strip.x1) / 2,
        y: strip.y,
        w: strip.x1 - strip.x0 + 24,
        h: 36,
        colour: CYAN,
        level: (c, calm) => (calm ? 0.3 + 0.15 * swell(c.bar, 1) : 0.25 + 0.35 * fade(frac(c.beat), 3)),
        mark: 'strip',
        grow: [1.04, 6],
      },
      {
        shape: 'glow',
        x: strip.x0,
        y: strip.y,
        w: 110,
        h: 50,
        colour: 0xc8f4ff,
        level: (c, calm) => (calm ? 0 : 0.8 * Math.sin(Math.PI * frac(c.bar)) ** 2),
        at: (c) => [strip.x0 + (strip.x1 - strip.x0) * frac(c.bar), strip.y],
      },
      {
        shape: 'wash',
        x: 1770,
        y: 255,
        w: 390,
        h: 290,
        colour: CYAN,
        confined: true,
        level: (c, calm) => (calm ? 0.15 + 0.25 * swell(c.beat, 4) : 0.08 + 0.75 * fade(sinceTurn(c.beat, 0, 2), 3)),
        mark: 'grille',
        grow: 0.96,
        codeWell: { inside: ['grille'], outside: [] },
      },
    ],
  };
}

/** CABINET: its six buttons lit round the panel in turn, the start buttons blinking turn about, the coin lights breathing. */
function cabinetLights(): GearLightSet {
  const RED = 0xff3326;
  const AMBER = 0xffa418;
  const WHITE = 0xfff0d8;
  // top row left to right, then the bottom row back: a loop round the panel (the plate's marks are row by row)
  const buttons = [
    { x: 549.6, y: 166.8, colour: RED, mark: 'button.0' },
    { x: 705, y: 166.7, colour: AMBER, mark: 'button.1' },
    { x: 860.4, y: 166.7, colour: WHITE, mark: 'button.2' },
    { x: 911.4, y: 343.8, colour: AMBER, mark: 'button.5' },
    { x: 755.9, y: 343.7, colour: RED, mark: 'button.4' },
    { x: 600.5, y: 343.7, colour: WHITE, mark: 'button.3' },
  ];
  const lights: GearLight[] = [];
  buttons.forEach((b, i) => {
    const level = (c: BeatClock, calm: boolean) => (calm ? 0.1 + 0.3 * softTurn(c.beat, i, 6, 2) : 0.08 + 0.92 * fade(sinceTurn(c.beat, i, 6), 1.8));
    lights.push({ shape: 'ring', x: b.x, y: b.y, w: 140, h: 166, colour: b.colour, level, mark: b.mark, grow: 1.2 });
    lights.push({ shape: 'glow', x: b.x, y: b.y, w: 112, h: 128, colour: b.colour, level: (c, calm) => level(c, calm) * 0.75, mark: b.mark, grow: 0.9 });
  });
  for (const [i, x] of [1140, 1255].entries()) {
    lights.push({
      shape: 'glow',
      x,
      y: 172,
      w: 120,
      h: 92,
      colour: 0xffb43c,
      level: (c, calm) => (calm ? 0.2 + 0.3 * swell(c.beat - i * 2, 4) : (Math.floor(c.beat) + i) % 2 === 0 ? 0.85 : 0.05),
      mark: `start.${i}`,
      grow: 1.3,
    });
  }
  for (const [i, x] of [1662, 1844].entries()) lights.push({ shape: 'glow', x, y: 258, w: 80, h: 80, colour: 0xff9a2a, level: (c) => 0.2 + 0.35 * swell(c.bar, 1), mark: `coin.${i}`, grow: 2.2 });
  return { lights };
}

/** RECEIVER: the tuning dial's backlight swelling over the bar, the two meters' backlights kicking on alternate beats. */
function receiverLights(): GearLightSet {
  const lights: GearLight[] = [
    {
      shape: 'wash',
      x: 860.5,
      y: 151.5,
      w: 797,
      h: 133,
      colour: 0xffb45a,
      level: (c, calm) => (calm ? 0.35 + 0.2 * swell(c.bar, 1) : 0.3 + 0.25 * swell(c.bar, 1) + 0.25 * fade(frac(c.beat), 3)),
      mark: 'dial',
      grow: [0.97, 0.9],
    },
  ];
  for (const [i, x] of [1460.5, 1694].entries()) {
    lights.push({
      shape: 'wash',
      x,
      y: 196,
      w: 180,
      h: 160,
      colour: 0xffc477,
      level: (c, calm) => (calm ? 0.25 + 0.25 * softTurn(c.beat, i, 2, 2) : 0.15 + 0.8 * fade(sinceTurn(c.beat, i, 2), 2.8)),
      mark: `meter.${i}`,
      grow: 0.85,
    });
  }
  return { lights };
}

/** NAJEON: the pearl of the cranes and vines catching the light in a wave across the chest on each bar, the lock's latch glinting on its first beat. */
function najeonLights(): GearLightSet {
  const parts = [
    { x: 363, y: 252, w: 230, h: 280, mark: 'lid.0', grow: 0.75 as number | readonly [number, number] },
    { x: 695.5, y: 251.5, w: 290, h: 115, mark: 'vine.0', grow: [1, 1.2] as const },
    { x: 1359.5, y: 251.5, w: 290, h: 115, mark: 'vine.1', grow: [1, 1.2] as const },
    { x: 1683, y: 251, w: 230, h: 280, mark: 'lid.1', grow: 0.75 },
  ];
  const lights: GearLight[] = parts.map((p, i) => ({
    shape: 'wash',
    x: p.x,
    y: p.y,
    w: p.w,
    h: p.h,
    colour: i % 2 ? 0xffe2f3 : 0xdff4ff,
    confined: true,
    level: (c, calm) => (calm ? 0.15 + 0.3 * softTurn(c.beat, i, 4, 2) : 0.1 + 0.85 * fade(sinceTurn(c.beat, i, 4), 1.4)),
    mark: p.mark,
    grow: p.grow,
    codeShape: 'glow',
  }));
  lights.push({
    shape: 'glint',
    x: 1024,
    y: 240,
    w: 130,
    h: 130,
    colour: 0xfff1c8,
    level: (c, calm) => (calm || frac(c.bar) >= 0.25 ? 0 : Math.sin(Math.PI * frac(c.bar) * 4) ** 2),
    mark: 'lock',
    grow: 0.55,
  });
  return { lights };
}

/** KEYBOARD: its knob's orange ring with glints running round it, the arrow keys lit in turn from inside their well, a lock light on the bar, the OLED's spectrum. */
function keyboardLights(): GearLightSet {
  // the knob's ring (an ellipse round its foot), the arc not behind the knob
  const ring = { x: 221, y: 253.4, rx: 130, ry: 153.6, arc: [-70, 160] as const };
  const lights: GearLight[] = [
    {
      shape: 'ring',
      x: ring.x,
      y: ring.y,
      w: ring.rx * 2 * RING_REACH,
      h: ring.ry * 2 * RING_REACH,
      arc: ring.arc,
      colour: ORANGE,
      level: (c, calm) => (calm ? 0.25 + 0.2 * swell(c.beat, 4) : 0.22 + 0.55 * fade(frac(c.beat), 4)),
      mark: 'knob',
      grow: RING_REACH,
    },
  ];
  // two glints, now and then somewhere on the ring for half a beat
  for (const g of [0, 1]) {
    const slot = (c: BeatClock) => Math.floor(c.beat * 2) + g * 7919;
    lights.push({
      shape: 'glint',
      x: ring.x,
      y: ring.y,
      w: 70,
      h: 70,
      colour: 0xffd9a8,
      level: (c, calm) => (calm || hash(slot(c), 3) > 0.38 ? 0 : Math.sin(Math.PI * frac(c.beat * 2)) ** 2),
      at: (c) => {
        const a = ((ring.arc[0] + (ring.arc[1] - ring.arc[0]) * hash(slot(c), 5)) * Math.PI) / 180;
        return [ring.x + ring.rx * Math.cos(a), ring.y + ring.ry * Math.sin(a)];
      },
    });
  }
  // the arrow keys lit from under them in turn (up, right, down, left): the light shows inside
  // their well (the gaps round each key, the well's floor), each key's part of it; on the deck drawn
  // in code its narrow gaps take the light evenly (the light's shape there is the well's)
  const keys = [
    { x: 1652, y: 175, w: 142, h: 173, mark: 'key.up' },
    { x: 1788, y: 340, w: 136, h: 163, mark: 'key.right' },
    { x: 1652, y: 340, w: 137, h: 163, mark: 'key.down' },
    { x: 1515, y: 340, w: 136, h: 163, mark: 'key.left' },
  ];
  keys.forEach((k, i) =>
    lights.push({
      shape: 'wash',
      x: k.x,
      y: k.y,
      w: k.w * 1.3,
      h: k.h * 1.3,
      colour: ORANGE,
      confined: true,
      level: (c, calm) => (calm ? 0.12 + 0.3 * softTurn(c.beat, i, 4, 2) : 0.12 + 0.88 * fade(sinceTurn(c.beat, i, 4), 2.4)),
      mark: k.mark,
      grow: 1.3,
      codeShape: 'fill',
      codeWell: { inside: ['well.0', 'well.1'], outside: keys.map((o) => o.mark) },
    }),
  );
  // the middle lock light on each bar's first beat
  lights.push({ shape: 'glow', x: 1246, y: 172, w: 60, h: 60, colour: 0xffb03c, level: (c, calm) => (calm ? 0 : frac(c.bar) < 0.125 ? 1 : 0), mark: 'lock.1', grow: 2.6 });
  const screen: GearScreen = {
    x: 445,
    y: 118,
    w: 559,
    h: 138,
    mark: 'screen',
    background: '#050506',
    first: [461.5, 241.5],
    step: [25.12, -17.92],
    segment: [17, 12],
    columns: 22,
    rows: 7,
    lit: '#e4e4e2',
    peak: '#ff8a2a',
    bars: (c, calm) => spectrumBars(c, calm, 22, 7),
  };
  return { lights, screen };
}

/** RACING: its shift lights filling up over the bar and flashing on the next one's first beat, its four buttons' rings lit in turn. */
function racingLights(): GearLightSet {
  const lights: GearLight[] = [];
  const colours = [0x4dff7c, 0xff3b30, 0x3f82ff];
  for (let i = 0; i < 15; i++) {
    lights.push({
      shape: 'glow',
      x: 551.6 + 67.6 * i,
      y: 107,
      w: 58,
      h: 66,
      colour: colours[Math.floor(i / 5)],
      level: (c, calm) => {
        const p = frac(c.bar);
        // the shift flash: all of them on the bar's first beat, blinking on its sixteenths (calm:
        // all of them fading out over it instead)
        if (p < 0.125) return calm ? 0.55 * (1 - p / 0.125) : Math.floor(p * 32) % 2 === 0 ? 1 : 0.35;
        // filling up from the left over the rest of the bar (calm: each one rising slowly)
        const on = Math.min(1, Math.max(0, (p - 0.125 - (0.82 * i) / 15) / (calm ? 0.12 : 0.03)));
        return on * (calm ? 0.55 : 0.85);
      },
      mark: `led.${i}`,
      grow: 2.6,
    });
  }
  const buttons = [
    { x: 552, y: 293, colour: 0xffd53a },
    { x: 727, y: 293, colour: 0x3a8bff },
    { x: 1321, y: 293, colour: 0xffffff },
    { x: 1497, y: 293, colour: 0x4dff7c },
  ];
  buttons.forEach((b, i) =>
    lights.push({
      shape: 'ring',
      x: b.x,
      y: b.y,
      w: 140,
      h: 168,
      colour: b.colour,
      level: (c, calm) => (calm ? 0.15 + 0.25 * softTurn(c.beat, i, 4, 2) : 0.1 + 0.8 * fade(sinceTurn(c.beat, i, 4), 2.2)),
      mark: `button.${i}`,
      grow: 1.25,
    }),
  );
  return { lights };
}

/** ORBITAL: the ARM button's green breathing on the beat, the toggles' levers glinting in turn, the MASTER ALARM blinking in FEVER only. */
function orbitalLights(): GearLightSet {
  const lights: GearLight[] = [
    {
      shape: 'wash',
      x: 1128.5,
      y: 162.5,
      w: 267,
      h: 125,
      colour: 0xffa020,
      level: (c, calm) => (!c.fever ? 0 : calm ? 0.55 : frac(c.beat) < 0.5 ? 0.95 : 0.1),
      mark: 'alarm',
    },
    {
      shape: 'wash',
      x: 1644,
      y: 210,
      w: 104,
      h: 122,
      colour: 0x4dff7a,
      level: (c, calm) => (calm ? 0.2 + 0.2 * swell(c.beat, 2) : 0.12 + 0.5 * fade(frac(c.beat), 2.5)),
      mark: 'arm',
      grow: 0.8,
    },
  ];
  for (const [i, x] of [451, 616, 780].entries()) {
    lights.push({ shape: 'glint', x, y: 109, w: 90, h: 90, colour: 0xffffff, level: (c, calm) => (calm ? 0 : 0.85 * fade(sinceTurn(c.beat, i, 3), 5)), mark: `toggle.${i}`, grow: 0.6 });
  }
  return { lights };
}

/**
 * PIANO: a glint running along the brass inlay once a bar, the inlay glowing warm in FEVER, the
 * treble clef medallion catching the light on the bar's first beat; no light on the keys, which lie
 * under the lanes and go down while their lane's key is held instead (deckArt.deckKeys).
 */
function pianoLights(): GearLightSet {
  // the inlay along the deck's top edge (the glint runs between the walls, its quad clear of them)
  const inlay = { y: 12, h: 24 };
  const run = { x0: 75, x1: 2048 - 75 };
  const medallion = { x: 184, y: 248, w: 224, h: 278 };
  return {
    lights: [
      {
        shape: 'wash',
        x: 1024,
        y: inlay.y,
        w: 2048,
        h: inlay.h,
        colour: 0xffc46a,
        level: (c, calm) => (!c.fever ? 0 : calm ? 0.45 : 0.35 + 0.45 * fade(frac(c.beat), 3)),
        mark: 'inlay',
        grow: [1, 6],
      },
      {
        shape: 'glow',
        x: 1024,
        y: inlay.y,
        w: 150,
        h: inlay.h,
        colour: 0xfff0cc,
        level: (c, calm) => (calm ? 0 : 0.85 * Math.sin(Math.PI * frac(c.bar)) ** 2),
        at: (c) => [run.x0 + (run.x1 - run.x0) * frac(c.bar), inlay.y],
      },
      {
        shape: 'glow',
        x: medallion.x,
        y: medallion.y,
        w: medallion.w * 1.3,
        h: medallion.h * 1.3,
        colour: 0xffd27a,
        level: (c, calm) => (calm ? 0.1 + 0.12 * swell(c.beat, 4) : 0.06 + 0.3 * fade(frac(c.beat), 3)),
        mark: 'medallion',
        grow: 1.3,
      },
      {
        shape: 'glint',
        x: medallion.x - medallion.w * 0.18,
        y: medallion.y - medallion.h * 0.2,
        w: 120,
        h: 120,
        colour: 0xfff4d6,
        level: (c, calm) => (calm || frac(c.bar) >= 0.25 ? 0 : Math.sin(Math.PI * frac(c.bar) * 4) ** 2),
        mark: 'medallion',
        grow: 0.55,
      },
    ],
  };
}

/** Each gear's lights. */
export const GEAR_LIGHTS: Record<GearStyle, () => GearLightSet> = {
  standard: standardLights,
  cabinet: cabinetLights,
  receiver: receiverLights,
  najeon: najeonLights,
  keyboard: keyboardLights,
  racing: racingLights,
  orbital: orbitalLights,
  piano: pianoLights,
};

/** How strongly a light's shape shows at (x, y), -1..1 across its quad (y toward the camera); `arc` the ring's that shows (null: all of it). */
function shapeAlpha(shape: LightShape, arc: readonly [number, number] | null | undefined, x: number, y: number): number {
  const r = Math.hypot(x, y);
  let a = 0;
  if (shape === 'glow') a = Math.exp(-r * r * 4.5);
  else if (shape === 'wash') a = (1 - smooth(0.45, 1, Math.abs(x))) * (1 - smooth(0.45, 1, Math.abs(y)));
  else if (shape === 'fill') a = 1;
  else if (shape === 'ring') {
    const d = r - 1 / RING_REACH;
    a = Math.exp(-((d / 0.05) ** 2)) + 0.4 * Math.exp(-((d / 0.13) ** 2));
    if (arc) {
      const deg = (Math.atan2(y, x) * 180) / Math.PI;
      const [from, to] = arc;
      const inside = (v: number) => (v >= from && v <= to) || (v + 360 >= from && v + 360 <= to);
      // soft ends: the arc's last 12 degrees fade
      const edge = Math.min(...[-12, -6, 0, 6, 12].map((o) => (inside(deg + o) ? 1 : 0)));
      a *= inside(deg) ? 0.5 + 0.5 * edge : 0;
    }
  } else {
    a = Math.exp(-r * r * 30) + 0.55 * (Math.exp(-Math.abs(x) * 22) * Math.exp(-Math.abs(y) * 4) + Math.exp(-Math.abs(y) * 22) * Math.exp(-Math.abs(x) * 4));
  }
  // nothing at the quad's edges
  return Math.max(0, Math.min(1, a * (1 - smooth(0.82, 1, Math.max(Math.abs(x), Math.abs(y))))));
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** A deck's glow mask read once: its first channel, the deck picture's size. */
interface MaskData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

type MaskImage = CanvasImageSource & { readonly width: number; readonly height: number };

function readMask(mask: MaskImage): MaskData {
  const canvas = document.createElement('canvas');
  canvas.width = mask.width;
  canvas.height = mask.height;
  const g = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  g.drawImage(mask, 0, 0);
  return { width: mask.width, height: mask.height, data: g.getImageData(0, 0, mask.width, mask.height).data };
}

/** A box on the deck (plane px or deck picture px). */
interface Quad {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A light's picture: white, its alpha `alpha` at each px of `quad` (`size` px of it), made once for
 * where it is laid.
 */
function lightTexture(size: readonly [number, number], alpha: (x: number, y: number, px: number, py: number) => number): THREE.CanvasTexture {
  const [W, H] = size;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const img = g.createImageData(W, H);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const o = (py * W + px) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(Math.max(0, Math.min(1, alpha(((px + 0.5) / W) * 2 - 1, ((py + 0.5) / H) * 2 - 1, (px + 0.5) / W, (py + 0.5) / H)) * 255));
    }
  }
  g.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** How far inside `b` the point is (plane px, negative outside), for soft edges. */
const insideBy = (b: Quad, x: number, y: number) => Math.min(x - b.x, b.x + b.w - x, y - b.y, b.y + b.h - y);

/** Where the deck is: world x of its left edge, z of its top, world units per px across and along the track (deck picture px, or plane px on a deck drawn in code), its height. */
export interface DeckPlacement {
  left: number;
  top: number;
  across: number;
  along: number;
  y: number;
}

interface LightMesh {
  light: GearLight;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  /** Whether it is laid on this deck (its part is there, its picture made). */
  on: boolean;
  /** Its quad where it is laid (px of the deck it lies on). */
  quad: Quad;
  /** Its picture over the deck's picture (made once), and over a deck drawn in code (made for the marks it lies on). */
  pictureMap: THREE.CanvasTexture | null;
  codeMap: THREE.CanvasTexture | null;
}

/**
 * A gear's lights over its deck: built once; laid where the deck's picture shows its parts, or on the
 * parts its plate drawn in code marked (`place`); lit for the clock each frame (`update`).
 */
export class GearLightLayer {
  readonly group = new THREE.Group();
  private readonly lights: LightMesh[] = [];
  private readonly screen: { spec: GearScreen; mesh: THREE.Mesh; canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; shown: string; on: boolean } | null = null;
  private placement: DeckPlacement | null = null;
  private readonly calm: boolean;
  private readonly mask: MaskData | null;
  private readonly owned: { dispose(): void }[] = [];

  /** `mask`: where the confined lights may show on the deck's picture (its glow picture, the same size); without it they are left out there. */
  constructor(set: GearLightSet, geometry: THREE.BufferGeometry, calm: boolean, mask?: MaskImage) {
    this.calm = calm;
    this.mask = mask ? readMask(mask) : null;
    for (const light of set.lights) {
      const material = new THREE.MeshBasicMaterial({ color: light.colour, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 9.07;
      mesh.visible = false;
      this.group.add(mesh);
      this.lights.push({ light, mesh, material, on: false, quad: { x: 0, y: 0, w: 0, h: 0 }, pictureMap: null, codeMap: null });
      this.owned.push(material);
    }
    if (set.screen) {
      const s = set.screen;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(s.w);
      canvas.height = Math.round(s.h);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      // transparent (though opaque) so it is drawn with the deck, after it (renderOrder)
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, fog: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 9.06;
      this.group.add(mesh);
      this.screen = { spec: s, mesh, canvas, texture, shown: '', on: false };
      this.owned.push(texture, material);
    }
    this.group.visible = false;
  }

  /**
   * Lays the lights over the deck at `p`: where its picture shows the parts (`marks` null), or on the
   * boxes its plate drawn in code marked (each light its part's; one whose part is not there stays
   * dark); null hides them.
   */
  place(p: DeckPlacement | null, marks: readonly DeckMark[] | null): void {
    this.placement = p;
    this.group.visible = p !== null;
    if (!p) return;
    const box = (name: string | undefined) => (name ? marks?.find((m) => m.name === name) : undefined);
    for (const l of this.lights) {
      const { light, material } = l;
      l.codeMap?.dispose();
      l.codeMap = null;
      material.map = null;
      l.on = false;
      if (marks === null) {
        if (light.confined && !this.mask) continue;
        l.quad = { x: light.x - light.w / 2, y: light.y - light.h / 2, w: light.w, h: light.h };
        const mask = light.confined ? this.mask : null;
        const size: [number, number] = mask ? [Math.max(2, Math.round(light.w)), Math.max(2, Math.round(light.h))] : [128, 128];
        l.pictureMap ??= lightTexture(size, (x, y, u, v) => {
          const a = shapeAlpha(light.shape, light.arc, x, y);
          if (!mask || a <= 0) return a;
          const X = Math.floor(l.quad.x + u * l.quad.w);
          const Y = Math.floor(l.quad.y + v * l.quad.h);
          return X >= 0 && Y >= 0 && X < mask.width && Y < mask.height ? (a * mask.data[(Y * mask.width + X) * 4]) / 255 : 0;
        });
        material.map = l.pictureMap;
      } else {
        const m = box(light.mark);
        if (!m) continue;
        const [gx, gy] = typeof light.grow === 'number' ? [light.grow, light.grow] : (light.grow ?? [1, 1]);
        l.quad = { x: m.x + (m.w * (1 - gx)) / 2, y: m.y + (m.h * (1 - gy)) / 2, w: m.w * gx, h: m.h * gy };
        const inside = (light.codeWell?.inside ?? []).map(box).filter((b): b is DeckMark => Boolean(b));
        const outside = (light.codeWell?.outside ?? []).map(box).filter((b): b is DeckMark => Boolean(b));
        // a ring seen from above shows all round: no arc
        l.codeMap = lightTexture([128, 128], (x, y, u, v) => {
          const a = shapeAlpha(light.codeShape ?? light.shape, null, x, y);
          if (!light.codeWell || a <= 0) return a;
          const [X, Y] = [l.quad.x + u * l.quad.w, l.quad.y + v * l.quad.h];
          const within = Math.max(...inside.map((b) => insideBy(b, X, Y)), -9);
          const under = Math.max(...outside.map((b) => insideBy(b, X, Y)), -9);
          return a * smooth(-0.6, 0.6, within) * (1 - smooth(-0.6, 0.6, under));
        });
        material.map = l.codeMap;
      }
      material.needsUpdate = true;
      l.on = true;
      this.put(l.mesh, l.quad);
    }
    if (this.screen) {
      const s = this.screen.spec;
      const m = marks === null ? { x: s.x, y: s.y, w: s.w, h: s.h } : box(s.mark);
      this.screen.on = Boolean(m);
      this.screen.mesh.visible = this.screen.on;
      if (m) {
        this.put(this.screen.mesh, m);
        this.screen.mesh.position.y = p.y + 0.0004;
      }
    }
  }

  private put(mesh: THREE.Mesh, q: Quad): void {
    const p = this.placement as DeckPlacement;
    mesh.scale.set(q.w * p.across, 1, q.h * p.along);
    mesh.position.set(p.left + (q.x + q.w / 2) * p.across, p.y + 0.0008, p.top + (q.y + q.h / 2) * p.along);
  }

  /** Lights them for `c`. */
  update(c: BeatClock): void {
    if (!this.placement) return;
    for (const l of this.lights) {
      const { light, mesh, material } = l;
      material.opacity = l.on ? Math.max(0, Math.min(1, light.level(c, this.calm))) : 0;
      mesh.visible = material.opacity > 0.003;
      // one that moves, over the deck's picture
      if (light.at && mesh.visible) {
        const [x, y] = light.at(c);
        this.put(mesh, { x: x - light.w / 2, y: y - light.h / 2, w: light.w, h: light.h });
      }
    }
    if (this.screen?.on) this.drawScreen(c);
  }

  /** The screen's bars, redrawn only when one changes (laid out as the picture's window is, over the window it lies on). */
  private drawScreen(c: BeatClock): void {
    const screen = this.screen!;
    const s = screen.spec;
    const { heights, peaks } = s.bars(c, this.calm);
    const key = `${heights.join(',')}|${peaks.join(',')}`;
    if (key === screen.shown) return;
    screen.shown = key;
    const g = screen.canvas.getContext('2d') as CanvasRenderingContext2D;
    g.fillStyle = s.background;
    g.fillRect(0, 0, screen.canvas.width, screen.canvas.height);
    const [sw, sh] = s.segment;
    for (let i = 0; i < s.columns; i++) {
      for (let k = 0; k < s.rows; k++) {
        const lit = k < heights[i];
        const peak = k === peaks[i];
        if (!lit && !peak) continue;
        g.fillStyle = peak ? s.peak : s.lit;
        const cx = s.first[0] + s.step[0] * i - s.x;
        const cy = s.first[1] + s.step[1] * k - s.y;
        g.fillRect(cx - sw / 2, cy - sh / 2, sw, sh);
      }
    }
    screen.texture.needsUpdate = true;
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
    for (const l of this.lights) {
      l.pictureMap?.dispose();
      l.codeMap?.dispose();
    }
    this.group.removeFromParent();
  }
}
