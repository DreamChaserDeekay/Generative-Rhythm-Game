import type { SkinColors } from './skins';
import { ink, tone, type Paint } from './tintArt';

/**
 * The gear under the judge line, drawn in code per skin: a plate in the skin's own colours (a
 * picture in real colours, painted again when the screen shows more or less of it) and, on it, a
 * light per lane in the lane's colour that lights while its key is down (a tint picture, see
 * tintArt). Each design follows its skin: LED bars, instrument dots, arcade buttons, a mixer's
 * knobs, road chevrons, neon hexagons, crystal diamonds, candy buttons, cut gems, outlines; and
 * four for any skin (설정 → 기어): a concrete slab with a pocket per key, a cockpit panel of
 * switches, a cassette deck's keys, a grand piano's keys.
 */
export type DeckStyle =
  | 'line'
  | 'stem'
  | 'arcade'
  | 'mixer'
  | 'hazard'
  | 'neon'
  | 'crystal'
  | 'candy'
  | 'jewel'
  | 'mono'
  | 'concrete'
  | 'avionics'
  | 'cassette'
  | 'grand';
export const DECK_STYLES: DeckStyle[] = ['line', 'stem', 'arcade', 'mixer', 'hazard', 'neon', 'crystal', 'candy', 'jewel', 'mono', 'concrete', 'avionics', 'cassette', 'grand'];
/** Earlier skins named the key caps that stood here; each cap is now the deck of its skin. */
export const CAP_DECKS: Record<string, DeckStyle> = {
  flat: 'line',
  stem: 'stem',
  gloss: 'arcade',
  piano: 'mixer',
  outline: 'hazard',
  neon: 'neon',
  glass: 'crystal',
  pill: 'candy',
  jewel: 'jewel',
};

export type KeyKind = 'white' | 'other' | 'scratch';

export interface DeckLane {
  /** Left edge and width in plane px from the deck's left edge. */
  left: number;
  width: number;
  kind: KeyKind;
}

/**
 * The light of a side lane laid over half the keys (반쪽 덮기): a bar across its half under the row
 * of lane lights, which it has no place in. Plane px from the deck's left edge and top.
 */
export interface DeckSide {
  left: number;
  width: number;
  top: number;
  depth: number;
}

/** The deck in plane px (the sheets' px, 73.65 to a track unit): y runs from just under the judge line toward the camera. */
export interface DeckSpec {
  width: number;
  /** How much of it the screen shows, and all of it (a tilted camera can show more). */
  room: number;
  depth: number;
  /** Where the lane lights lie. */
  keyTop: number;
  keyDepth: number;
  /** How much longer along the track round things are drawn, so they look round where the camera flattens it. */
  stretch: number;
  /** The lanes of the row (a side lane laid over the keys is none of them). */
  lanes: DeckLane[];
  /** The side bars under the row (none unless side lanes are laid over the keys). */
  sides: DeckSide[];
  colours: SkinColors;
}

/** `hex` with its sRGB channels times `k` (as CSS mixes), or at `alpha`. */
export function shade(hex: string, k: number, alpha = 1): string {
  const v = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(Math.min(255, ((v >> s) & 255) * k));
  return `rgba(${c(16)},${c(8)},${c(0)},${alpha})`;
}

const white = (a: number) => `rgba(255,255,255,${a})`;

/** The same stream of numbers for every paint: a plate never shimmers when it is painted again. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function polygon(g: CanvasRenderingContext2D, points: [number, number][]): void {
  g.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
}

/** An ellipse `st` times longer along the track than across: round on the screen. */
function disc(g: CanvasRenderingContext2D, x: number, y: number, r: number, st: number): void {
  g.beginPath();
  g.ellipse(x, y, r, r * st, 0, 0, Math.PI * 2);
}

/** A regular polygon of `n` corners, the first at `turn` (radians from the top), stretched along the track. */
function regular(g: CanvasRenderingContext2D, x: number, y: number, r: number, st: number, n: number, turn = 0): void {
  polygon(
    g,
    Array.from({ length: n }, (_, i) => {
      const a = turn + (i * 2 * Math.PI) / n;
      return [x + r * Math.sin(a), y - r * st * Math.cos(a)] as [number, number];
    }),
  );
}

const keyBottom = (s: DeckSpec) => s.keyTop + s.keyDepth;
const centre = (l: DeckLane) => l.left + l.width / 2;
/** A round light's radius in a lane: as wide as `share` of the lane, as long as the row lets it be. */
const radius = (s: DeckSpec, l: DeckLane, share: number) => Math.min(l.width * share, (s.keyDepth / 2 / s.stretch) * 0.86);

/** Lines between the lanes, from `y0` to `y1` (dashed with `dash`). */
function separators(g: CanvasRenderingContext2D, s: DeckSpec, y0: number, y1: number, colour: string, dash?: [number, number]): void {
  g.fillStyle = colour;
  for (const l of s.lanes.slice(1)) {
    if (!dash) {
      g.fillRect(l.left - 0.5, y0, 1, y1 - y0);
      continue;
    }
    for (let y = y0; y < y1; y += dash[0] + dash[1]) g.fillRect(l.left - 0.75, y, 1.5, Math.min(dash[0], y1 - y));
  }
}

/** Where the lower part of a design may start: under the lights, and under the side bars when there are some. */
export const lowerTop = (s: DeckSpec) => Math.max(keyBottom(s), ...s.sides.map((b) => b.top + b.depth));

/** Room under the lights for the lower part of a design (none when the screen shows too little). */
const lowerRoom = (s: DeckSpec) => s.room - lowerTop(s);

/**
 * A panel with cut corners across the deck under the lights, `inset` from its sides, down to just
 * above the screen's bottom edge; the path is left for a fill or stroke. Its middle (y), or null
 * when the screen shows too little for one.
 */
function panel(g: CanvasRenderingContext2D, s: DeckSpec, inset: number, cut: number): number | null {
  const top = lowerTop(s) + 10;
  const bottom = s.room - 10;
  if (bottom - top < 18) return null;
  const cy = Math.min(cut * s.stretch, (bottom - top) / 2);
  polygon(g, [
    [inset + cut, top],
    [s.width - inset - cut, top],
    [s.width - inset, top + cy],
    [s.width - inset, bottom - cy],
    [s.width - inset - cut, bottom],
    [inset + cut, bottom],
    [inset, bottom - cy],
    [inset, top + cy],
  ]);
  return (top + bottom) / 2;
}

/** The sockets ARCADE's buttons and JEWEL's gems sit in on the plate, this much larger than they are. */
const ARCADE_SOCKET = 1.14;
const JEWEL_SOCKET = 1.16;

/** A side bar's ends lie this share of its half in from the half's ends, so the two halves' bars stay apart. */
const SIDE_INSET = 0.05;
/** At rest some designs show only a side bar's two ends, this share of it each (see ends). */
const SIDE_ENDS = 0.07;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where a design draws a side bar in its box (`w`×`h` at x, y: its half by the side row): `share` of the row deep, in its middle. */
function barBox(x: number, y: number, w: number, h: number, share: number): Box {
  return { x: x + w * SIDE_INSET, y: y + (h * (1 - share)) / 2, w: w * (1 - 2 * SIDE_INSET), h: h * share };
}

/** How deep ARCADE's side button and JEWEL's side gem are in their row: the plate sets them in sockets that size. */
const ARCADE_BAR = 0.78;
const JEWEL_BAR = 0.8;

/** How deep the new designs' side bars are in their row (their plates set them in sockets that size). */
const CONCRETE_BAR = 0.84;
const AVIONICS_BAR = 0.78;
const CASSETTE_BAR = 0.8;
const GRAND_BAR = 0.86;

/** A rectangle whose corners are round on the screen (`r` across, `st` times longer along the track). */
function rounded(g: CanvasRenderingContext2D, b: Box, r: number, st: number): void {
  g.beginPath();
  g.roundRect(b.x, b.y, b.w, b.h, [{ x: Math.min(r, b.w / 2), y: Math.min(r * st, b.h / 2) }]);
}

/** A rectangle with its corners cut at 45° on the screen, `cut` deep along the track. */
function chamfered(g: CanvasRenderingContext2D, b: Box, cut: number, st: number): void {
  const c = cut / st;
  polygon(g, [
    [b.x + c, b.y],
    [b.x + b.w - c, b.y],
    [b.x + b.w, b.y + cut],
    [b.x + b.w, b.y + b.h - cut],
    [b.x + b.w - c, b.y + b.h],
    [b.x + c, b.y + b.h],
    [b.x, b.y + b.h - cut],
    [b.x, b.y + cut],
  ]);
}

/** A bar whose ends come to a point, `reach` of its depth long (0.5: at 45° on the screen). */
function pointed(g: CanvasRenderingContext2D, b: Box, st: number, reach: number): void {
  const c = (b.h * reach) / st;
  polygon(g, [
    [b.x + c, b.y],
    [b.x + b.w - c, b.y],
    [b.x + b.w, b.y + b.h / 2],
    [b.x + b.w - c, b.y + b.h],
    [b.x + c, b.y + b.h],
    [b.x, b.y + b.h / 2],
  ]);
}

/** The side bars' sockets on the plate: `b` grown by `pad` px all round (as much along the track on the screen). */
function sideSockets(s: DeckSpec, share: number, pad: number, draw: (b: Box) => void): void {
  for (const side of s.sides) {
    const b = barBox(side.left, side.top, side.width, side.depth, share);
    draw({ x: b.x - pad, y: b.y - pad * s.stretch, w: b.w + 2 * pad, h: b.h + 2 * pad * s.stretch });
  }
}

/**
 * The deck's top edge, just under the judge line: a dim line this many px deep (neon's) in every
 * design but MONO's, which has none, so nothing bright under the line reads as a second one before
 * the lights.
 */
const EDGE = 1.5;

const PLATES: Record<DeckStyle, (g: CanvasRenderingContext2D, s: DeckSpec) => void> = {
  // LED bars under the line, the lanes' lines carried down, a panel outlined in the rails' colours
  line: (g, s) => {
    g.fillStyle = shade(s.colours.trackFar, 0.7);
    g.fillRect(0, 0, s.width, s.depth);
    g.fillStyle = white(0.1);
    g.fillRect(0, 0, s.width, EDGE);
    separators(g, s, s.keyTop, keyBottom(s), white(0.06));
    const mid = panel(g, s, 12, 12);
    if (mid === null) return;
    g.fillStyle = white(0.025);
    g.fill();
    g.lineWidth = 1.5;
    for (const [x, colour] of [
      [0, s.colours.railLeft],
      [s.width / 2, s.colours.railRight],
    ] as [number, string][]) {
      g.save();
      g.beginPath();
      g.rect(x, 0, s.width / 2, s.depth);
      g.clip();
      panel(g, s, 12, 12);
      g.strokeStyle = shade(colour, 1, 0.55);
      g.stroke();
      g.restore();
    }
    g.fillStyle = white(0.16);
    g.fillRect(s.width / 2 - 40, mid - 1.5, 80, 3);
  },
  // a dot per lane in the instrument of its next note, over a plain panel
  stem: (g, s) => {
    g.fillStyle = shade(s.colours.trackFar, 0.7);
    g.fillRect(0, 0, s.width, s.depth);
    g.fillStyle = white(0.08);
    g.fillRect(0, 0, s.width, EDGE);
    separators(g, s, s.keyTop, keyBottom(s), white(0.05));
    const mid = panel(g, s, 12, 12);
    if (mid === null) return;
    g.fillStyle = white(0.02);
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = white(0.12);
    g.stroke();
    g.fillStyle = white(0.14);
    g.fillRect(s.width / 2 - 40, mid - 1.5, 80, 3);
  },
  // a gunmetal control panel: brushed metal, a socket per button, screws and a grille
  arcade: (g, s) => {
    const grad = g.createLinearGradient(0, 0, 0, s.room);
    grad.addColorStop(0, '#1b2029');
    grad.addColorStop(0.45, '#161a22');
    grad.addColorStop(1, '#12151c');
    g.fillStyle = grad;
    g.fillRect(0, 0, s.width, s.depth);
    const rand = seeded(7);
    for (let y = 4; y < s.depth; y += 2) {
      g.fillStyle = white(0.012 + rand() * 0.03);
      g.fillRect(0, y, s.width, 1);
    }
    g.fillStyle = shade('#6b7385', 1, 0.5);
    g.fillRect(0, 0, s.width, EDGE);
    const cy = s.keyTop + s.keyDepth / 2;
    for (const l of s.lanes) {
      const r = radius(s, l, l.kind === 'scratch' ? 0.44 : 0.36) * ARCADE_SOCKET;
      disc(g, centre(l), cy, r, s.stretch);
      g.fillStyle = '#0b0d12';
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = '#4a5263';
      g.stroke();
    }
    // a long button's socket under the row for each side bar
    sideSockets(s, ARCADE_BAR, 2.5, (b) => {
      rounded(g, b, (b.h / s.stretch) * 0.4, s.stretch);
      g.fillStyle = '#0b0d12';
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = '#4a5263';
      g.stroke();
    });
    const room = lowerRoom(s);
    if (room < 30) return;
    const top = lowerTop(s) + 12;
    const bottom = s.room - 10;
    const screw = (x: number, y: number) => {
      disc(g, x, y, 4, s.stretch);
      g.fillStyle = '#4a5263';
      g.fill();
      g.strokeStyle = '#161a22';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x - 2.6, y + 2.6 * s.stretch);
      g.lineTo(x + 2.6, y - 2.6 * s.stretch);
      g.stroke();
    };
    for (const x of [14, s.width - 14]) for (const y of [top + 6, bottom - 6]) screw(x, y);
    // the grille: slots in an inset plate
    const w = Math.min(220, s.width * 0.4);
    g.beginPath();
    g.roundRect(s.width / 2 - w / 2, top, w, bottom - top, 4);
    g.fillStyle = '#10131a';
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = '#4a5263';
    g.stroke();
    g.fillStyle = '#07080c';
    for (let y = top + 6; y + 3 <= bottom - 5; y += 7) {
      g.beginPath();
      g.roundRect(s.width / 2 - w / 2 + 12, y, w - 24, 3, 1.5);
      g.fill();
    }
  },
  // a DJ mixer: knobs in the lanes, a speaker grille, the judge line's red under it
  mixer: (g, s) => {
    g.fillStyle = shade(s.colours.trackFar, 0.7);
    g.fillRect(0, 0, s.width, s.depth);
    g.fillStyle = s.colours.divider;
    g.fillRect(0, 0, s.width, EDGE);
    separators(g, s, s.keyTop, keyBottom(s), shade(s.colours.divider, 0.8));
    const room = lowerRoom(s);
    if (room < 30) return;
    const top = lowerTop(s) + 12;
    const bottom = s.room - 14;
    g.fillStyle = '#1e1e24';
    for (let row = 0, y = top; y <= bottom; row++, y += 5 * s.stretch) {
      for (let x = 10 + (row % 2) * 3; x <= s.width - 10; x += 6) {
        disc(g, x, y, 1.3, s.stretch);
        g.fill();
      }
    }
    g.fillStyle = s.colours.judgeLine;
    g.fillRect(s.width / 2 - s.width * 0.2, s.room - 7, s.width * 0.4, 2);
  },
  // asphalt with road chevrons in the lanes, dashed lane lines and a hazard band
  hazard: (g, s) => {
    g.fillStyle = shade(s.colours.trackNear, 0.75);
    g.fillRect(0, 0, s.width, s.depth);
    const rand = seeded(11);
    for (let i = 0; i < (s.width * s.depth) / 50; i++) {
      g.fillStyle = white(0.03 + rand() * 0.05);
      g.fillRect(rand() * s.width, rand() * s.depth, 1.2, 1.2);
    }
    g.fillStyle = s.colours.divider;
    g.fillRect(0, 0, s.width, EDGE);
    separators(g, s, s.keyTop, keyBottom(s), white(0.16), [8, 6]);
    if (lowerRoom(s) < 30) return;
    const h = Math.min(20, lowerRoom(s) - 14);
    const y = s.room - 6 - h;
    g.save();
    g.beginPath();
    g.rect(0, y, s.width, h);
    g.clip();
    g.fillStyle = '#111114';
    g.fillRect(0, y, s.width, h);
    g.fillStyle = s.colours.railLeft;
    // stripes at about 45° on the screen
    const lean = h / s.stretch;
    for (let x = -lean; x < s.width + lean; x += 28) {
      polygon(g, [[x, y + h], [x + 14, y + h], [x + 14 + lean, y], [x + lean, y]]);
      g.fill();
    }
    g.restore();
    g.fillStyle = '#0b0b0e';
    g.fillRect(0, y - 2, s.width, 2);
    g.fillRect(0, y + h, s.width, 2);
  },
  // a circuit traced in the rails' neon, meeting under the middle
  neon: (g, s) => {
    g.fillStyle = shade(s.colours.trackFar, 0.8);
    g.fillRect(0, 0, s.width, s.depth);
    g.fillStyle = shade(s.colours.divider, 1, 0.8);
    g.fillRect(0, 0, s.width, EDGE);
    const y = Math.max(lowerTop(s) + 8, s.room - 10);
    const turn = 18 * s.stretch;
    g.lineWidth = 2;
    g.lineJoin = 'round';
    for (const [side, colour] of [
      [-1, s.colours.railLeft],
      [1, s.colours.railRight],
    ] as [number, string][]) {
      const x = (v: number) => (side < 0 ? v : s.width - v);
      g.save();
      g.strokeStyle = colour;
      g.shadowColor = colour;
      g.shadowBlur = 4;
      g.beginPath();
      g.moveTo(x(7), 4);
      g.lineTo(x(7), y - turn);
      g.lineTo(x(7 + 18), y);
      g.lineTo(x(s.width / 2 - 26), y);
      g.stroke();
      disc(g, x(s.width / 2 - 22), y, 3, s.stretch);
      g.stroke();
      g.restore();
    }
  },
  // frosted glass: slanted sheens, a bright top edge, a border of small diamonds
  crystal: (g, s) => {
    g.fillStyle = shade(s.colours.trackNear, 0.55);
    g.fillRect(0, 0, s.width, s.depth);
    for (const [x, w, a] of [
      [0.08, 0.1, 0.05],
      [0.3, 0.05, 0.04],
      [0.55, 0.16, 0.035],
      [0.86, 0.06, 0.05],
    ]) {
      const lean = s.room * 0.6;
      polygon(g, [
        [x * s.width, 0],
        [(x + w) * s.width, 0],
        [(x + w) * s.width - lean, s.room],
        [x * s.width - lean, s.room],
      ]);
      g.fillStyle = white(a);
      g.fill();
    }
    g.fillStyle = white(0.2);
    g.fillRect(0, 0, s.width, EDGE);
    if (lowerRoom(s) < 24) return;
    const y = s.room - 11;
    g.fillStyle = white(0.22);
    for (let x = 14; x <= s.width - 14; x += 20) {
      regular(g, x, y, 3.2, s.stretch, 4);
      g.fill();
    }
  },
  // candy: soft polka dots, a wave under the buttons
  candy: (g, s) => {
    g.fillStyle = shade(s.colours.trackNear, 0.8);
    g.fillRect(0, 0, s.width, s.depth);
    g.fillStyle = shade(s.colours.railLeft, 1, 0.07);
    for (let row = 0, y = 10; y < s.depth; row++, y += 16 * s.stretch) {
      for (let x = 9 + (row % 2) * 9; x < s.width; x += 18) {
        disc(g, x, y, 2.6, s.stretch);
        g.fill();
      }
    }
    g.fillStyle = s.colours.divider;
    g.fillRect(0, 0, s.width, EDGE);
    if (lowerRoom(s) < 26) return;
    const y = s.room - 13;
    const amp = 3.5 * s.stretch;
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.strokeStyle = shade(s.colours.railRight, 1, 0.7);
    g.beginPath();
    for (let x = 8; x <= s.width - 8; x += 2) {
      const v = y + amp * Math.sin((x / 36) * Math.PI * 2);
      if (x === 8) g.moveTo(x, v);
      else g.lineTo(x, v);
    }
    g.stroke();
  },
  // a metal band holding a gem per lane, a row of filigree arcs below
  jewel: (g, s) => {
    g.fillStyle = shade(s.colours.trackNear, 0.75);
    g.fillRect(0, 0, s.width, s.depth);
    // the band is the row, the gems in its middle; no line along its top, which would read as a
    // second judge line (it lies no nearer the line than neon's hexagons: see its reach)
    const top = s.keyTop;
    const bottom = keyBottom(s);
    g.fillStyle = shade(s.colours.trackNear, 1.35);
    g.fillRect(0, top, s.width, bottom - top);
    g.fillStyle = shade(s.colours.railLeft, 1, 0.35);
    g.fillRect(0, bottom - 1, s.width, 1);
    const cy = s.keyTop + s.keyDepth / 2;
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(176,166,232,0.55)';
    for (const l of s.lanes) {
      regular(g, centre(l), cy, radius(s, l, 0.34) * JEWEL_SOCKET, s.stretch, 8, Math.PI / 8);
      g.fillStyle = shade(s.colours.trackFar, 1);
      g.fill();
      g.stroke();
    }
    // a long setting under the band for each side bar's gem
    sideSockets(s, JEWEL_BAR, 2, (b) => {
      chamfered(g, b, b.h * 0.3, s.stretch);
      g.fillStyle = shade(s.colours.trackFar, 1);
      g.fill();
      g.stroke();
    });
    if (lowerRoom(s) < 28) return;
    const y = s.room - 16;
    g.lineWidth = 1.5;
    g.strokeStyle = shade(s.colours.railRight, 1, 0.42);
    g.fillStyle = shade(s.colours.railLeft, 1, 0.5);
    for (let x = 12; x + 24 <= s.width - 8; x += 24) {
      g.beginPath();
      g.ellipse(x + 12, y, 12, 7 * s.stretch, 0, 0, Math.PI);
      g.stroke();
      disc(g, x, y, 1.6, s.stretch);
      g.fill();
    }
  },
  // black, white lines: nothing that could be mistaken
  mono: (g, s) => {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, s.width, s.depth);
    // no edge: with no halo to join it to the line, even a dim one reads as a second judge line
    separators(g, s, s.keyTop, keyBottom(s), s.colours.divider);
    if (lowerRoom(s) < 20) return;
    g.fillRect(12, s.room - 10, s.width - 24, 2);
  },
  // raw concrete cast in boards: a pocket sunk in it per key, form-tie holes in rows below
  concrete: (g, s) => {
    const grad = g.createLinearGradient(0, 0, 0, s.room);
    grad.addColorStop(0, '#2b2c2f');
    grad.addColorStop(1, '#222326');
    g.fillStyle = grad;
    g.fillRect(0, 0, s.width, s.depth);
    // the board marks of the formwork and the grain of the cast
    const rand = seeded(23);
    for (let i = 0; i < (s.width * s.depth) / 22; i++) {
      g.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${0.06 + rand() * 0.08})` : white(0.02 + rand() * 0.04);
      g.fillRect(rand() * s.width, rand() * s.depth, 1.4, 1.4 * s.stretch);
    }
    for (let y = lowerTop(s) + 14 * s.stretch; y < s.depth; y += 30 * s.stretch) {
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(0, y, s.width, 1);
      g.fillStyle = white(0.035);
      g.fillRect(0, y + 1, s.width, 1);
    }
    g.fillStyle = white(0.08);
    g.fillRect(0, 0, s.width, EDGE);
    for (const l of s.lanes) pocket(g, lightBox('concrete', l.left, s.keyTop, l.width, s.keyDepth), s.stretch);
    sideSockets(s, CONCRETE_BAR, 0, (b) => pocket(g, b, s.stretch));
    if (lowerRoom(s) < 34) return;
    // the tie holes: a row of them between the lights and the screen's bottom
    const y = (lowerTop(s) + s.room) / 2;
    for (let x = 22; x <= s.width - 22; x += Math.max(44, s.width / 12)) {
      disc(g, x, y, 4.2, s.stretch);
      g.fillStyle = '#121315';
      g.fill();
      disc(g, x + 0.8, y + 0.8 * s.stretch, 3.2, s.stretch);
      g.fillStyle = '#08090a';
      g.fill();
    }
  },
  // a cockpit panel: a well per switch, amber brackets framing a panel below, a striped strip over it
  avionics: (g, s) => {
    const grad = g.createLinearGradient(0, 0, 0, s.room);
    grad.addColorStop(0, '#181a1e');
    grad.addColorStop(1, '#121417');
    g.fillStyle = grad;
    g.fillRect(0, 0, s.width, s.depth);
    g.fillStyle = white(0.07);
    g.fillRect(0, 0, s.width, EDGE);
    const well = (b: Box) => {
      const pad = 2.5;
      g.beginPath();
      g.roundRect(b.x - pad, b.y - pad * s.stretch, b.w + 2 * pad, b.h + 2 * pad * s.stretch, [{ x: 5, y: 5 * s.stretch }]);
      g.fillStyle = '#0a0b0e';
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = '#2c3038';
      g.stroke();
    };
    for (const l of s.lanes) well(lightBox('avionics', l.left, s.keyTop, l.width, s.keyDepth));
    sideSockets(s, AVIONICS_BAR, 0, well);
    const room = lowerRoom(s);
    if (room < 34) return;
    // the strip: amber and white dashes, dim, under the row
    const top = lowerTop(s) + 6;
    const strip = Math.min(4, room * 0.08);
    for (let x = 12, i = 0; x < s.width - 12; x += 16, i++) {
      g.fillStyle = i % 2 ? 'rgba(236,238,242,0.42)' : 'rgba(255,150,40,0.6)';
      g.fillRect(x, top, 10, strip);
    }
    const mid = panel(g, { ...s, sides: [] }, 16, 12);
    if (mid === null) return;
    g.fillStyle = '#111317';
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = '#2b3038';
    g.stroke();
    g.fillStyle = white(0.12);
    g.fillRect(s.width / 2 - 30, mid - 1, 60, 2);
    // amber brackets at the panel's corners
    const p0 = lowerTop(s) + 10;
    const p1 = s.room - 10;
    if (p1 - p0 < 24) return;
    const arm = 9;
    g.fillStyle = 'rgba(255,178,30,0.85)';
    for (const [x, dx] of [
      [6, 1],
      [s.width - 6, -1],
    ] as [number, number][]) {
      for (const [y, dy] of [
        [p0 + 8, 1],
        [p1, -1],
      ] as [number, number][]) {
        g.fillRect(dx > 0 ? x : x - 2, dy > 0 ? y : y - arm * s.stretch, 2, arm * s.stretch);
        g.fillRect(dx > 0 ? x : x - arm, dy > 0 ? y : y - 2 * s.stretch, arm, 2 * s.stretch);
      }
    }
  },
  // a cassette deck: brushed black metal, a slot per key, a cassette's window with its reels below
  cassette: (g, s) => {
    g.fillStyle = '#131315';
    g.fillRect(0, 0, s.width, s.depth);
    const rand = seeded(31);
    for (let y = 2; y < s.depth; y += 2) {
      g.fillStyle = white(0.008 + rand() * 0.022);
      g.fillRect(0, y, s.width, 1);
    }
    g.fillStyle = white(0.07);
    g.fillRect(0, 0, s.width, EDGE);
    const slot = (b: Box, bottom: number) => {
      g.fillStyle = '#050506';
      g.fillRect(b.x - 2, b.y - 2 * s.stretch, b.w + 4, bottom - b.y + 2 * s.stretch);
      g.fillStyle = '#2a2a2e';
      g.fillRect(b.x - 2, bottom, b.w + 4, 1);
    };
    for (const l of s.lanes) slot(lightBox('cassette', l.left, s.keyTop, l.width, s.keyDepth), s.keyTop + s.keyDepth * 0.97);
    sideSockets(s, CASSETTE_BAR, 0, (b) => slot(b, b.y + b.h));
    const room = lowerRoom(s);
    if (room < 40) return;
    const top = lowerTop(s) + 8;
    // a dim chrome trim over the cassette's door
    g.fillStyle = '#3a3c42';
    g.fillRect(14, top, s.width - 28, 1.5);
    const bottom = s.room - 10;
    const h = bottom - top - 8;
    if (h < 24) return;
    const w = Math.min(s.width * 0.5, 280);
    const x = s.width / 2 - w / 2;
    const y = top + 8;
    g.beginPath();
    g.roundRect(x, y, w, h, [{ x: 6, y: 6 * s.stretch }]);
    g.fillStyle = '#0c0c0e';
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = '#34353a';
    g.stroke();
    // the window and the cassette behind it: the tape between the reels, the reels
    const wx = x + 10;
    const ww = w - 20;
    const wy = y + 5 * s.stretch;
    const wh = h - 10 * s.stretch;
    g.fillStyle = '#070708';
    g.fillRect(wx, wy, ww, wh);
    const r = Math.min(ww * 0.17, (wh / 2 / s.stretch) * 0.8);
    const cy = wy + wh / 2;
    g.fillStyle = '#2e2119';
    g.fillRect(wx + ww * 0.28, cy + r * s.stretch * 0.55, ww * 0.44, r * s.stretch * 0.3);
    for (const cx of [wx + ww * 0.28, wx + ww * 0.72]) {
      disc(g, cx, cy, r * 0.92, s.stretch);
      g.fillStyle = '#3a2a1f';
      g.fill();
      disc(g, cx, cy, r * 0.5, s.stretch);
      g.fillStyle = '#18181b';
      g.fill();
      g.lineWidth = 1.2;
      g.strokeStyle = '#4a4b52';
      g.stroke();
      regular(g, cx, cy, r * 0.24, s.stretch, 6);
      g.fillStyle = '#5a5b62';
      g.fill();
    }
    g.fillStyle = white(0.03);
    polygon(g, [
      [wx + ww * 0.1, wy],
      [wx + ww * 0.24, wy],
      [wx + ww * 0.12, wy + wh],
      [wx - ww * 0.02, wy + wh],
    ]);
    g.fill();
  },
  // a grand piano's keys in black lacquer: a felt strip under them, a gold line on the fallboard
  grand: (g, s) => {
    const grad = g.createLinearGradient(0, 0, 0, s.room);
    grad.addColorStop(0, '#0d0d10');
    grad.addColorStop(1, '#09090b');
    g.fillStyle = grad;
    g.fillRect(0, 0, s.width, s.depth);
    g.fillStyle = white(0.06);
    g.fillRect(0, 0, s.width, EDGE);
    // the key bed, the gaps between the keys dark
    g.fillStyle = '#040405';
    g.fillRect(0, s.keyTop, s.width, s.keyDepth);
    sideSockets(s, GRAND_BAR, 1, (b) => {
      g.fillStyle = '#040405';
      g.fillRect(b.x, b.y, b.w, b.h);
    });
    // the felt along the keys' fronts
    const felt = lowerTop(s) + 1;
    g.fillStyle = '#4a1218';
    g.fillRect(0, felt, s.width, Math.min(3 * s.stretch, Math.max(0, s.room - felt)));
    if (lowerRoom(s) < 30) return;
    const y = lowerTop(s) + 14;
    g.fillStyle = 'rgba(184,140,60,0.55)';
    g.fillRect(16, y, s.width - 32, 1.5);
    const sheen = g.createLinearGradient(0, y + 4, 0, s.room);
    sheen.addColorStop(0, white(0.035));
    sheen.addColorStop(1, white(0));
    g.fillStyle = sheen;
    g.fillRect(0, y + 4, s.width, s.room - y - 4);
  },
};

// ---------- the gears for any skin: concrete, avionics, cassette, grand ----------

/**
 * Where these designs' lights lie in a lane's place in the row (`w` × `h`, `x`, `y` its corner): a
 * share of it in from its sides and from the row's top and bottom. The plate draws the socket round
 * it (the pocket's walls, the switch's well, the key's slot); the light picture draws what is in it.
 */
const LIGHT_BOX: Record<'concrete' | 'avionics' | 'cassette' | 'grand', { side: number; top: number; bottom: number }> = {
  concrete: { side: 0.09, top: 0.07, bottom: 0.07 },
  avionics: { side: 0.11, top: 0.13, bottom: 0.13 },
  cassette: { side: 0.08, top: 0.06, bottom: 0.14 },
  grand: { side: 0.05, top: 0.04, bottom: 0.06 },
};

function lightBox(style: keyof typeof LIGHT_BOX, x: number, y: number, w: number, h: number): Box {
  const b = LIGHT_BOX[style];
  return { x: x + w * b.side, y: y + h * b.top, w: w * (1 - 2 * b.side), h: h * (1 - b.top - b.bottom) };
}

/** CONCRETE's pocket walls round `b`: `wall` across, `st` times that along (a pocket's floor is `b` less its walls). */
function pocketWall(b: Box, st: number): number {
  return Math.min(b.w * 0.17, (b.h * 0.24) / st);
}

function pocketFloor(b: Box, st: number): Box {
  const t = pocketWall(b, st);
  return { x: b.x + t, y: b.y + t * st, w: b.w - 2 * t, h: b.h - 2 * t * st };
}

/** The four walls of a pocket sunk in a slab, lit from the far left: the far and left walls in shade, the near and right ones lit. */
function pocket(g: CanvasRenderingContext2D, b: Box, st: number): void {
  const f = pocketFloor(b, st);
  const [x0, y0, x1, y1] = [b.x, b.y, b.x + b.w, b.y + b.h];
  const [fx0, fy0, fx1, fy1] = [f.x, f.y, f.x + f.w, f.y + f.h];
  for (const [points, fill] of [
    [[[x0, y0], [x1, y0], [fx1, fy0], [fx0, fy0]], '#0f1012'],
    [[[x0, y0], [fx0, fy0], [fx0, fy1], [x0, y1]], '#18191c'],
    [[[x1, y0], [x1, y1], [fx1, fy1], [fx1, fy0]], '#3a3b3f'],
    [[[x0, y1], [x1, y1], [fx1, fy1], [fx0, fy1]], '#46474c'],
  ] as [[number, number][], string][]) {
    polygon(g, points);
    g.fillStyle = fill;
    g.fill();
  }
  g.fillStyle = '#08080a';
  g.fillRect(f.x, f.y, f.w, f.h);
}

/** A switch's cap in the cockpit panel: a rounded box narrowing to its far edge. */
function capPath(g: CanvasRenderingContext2D, b: Box, st: number): void {
  const taper = b.w * 0.07;
  const r = Math.min(b.w * 0.14, (b.h * 0.2) / st);
  g.beginPath();
  g.moveTo(b.x + taper + r, b.y);
  g.lineTo(b.x + b.w - taper - r, b.y);
  g.quadraticCurveTo(b.x + b.w - taper, b.y, b.x + b.w - taper * 0.8, b.y + r * st);
  g.lineTo(b.x + b.w, b.y + b.h - r * st);
  g.quadraticCurveTo(b.x + b.w, b.y + b.h, b.x + b.w - r, b.y + b.h);
  g.lineTo(b.x + r, b.y + b.h);
  g.quadraticCurveTo(b.x, b.y + b.h, b.x, b.y + b.h - r * st);
  g.lineTo(b.x + taper * 0.8, b.y + r * st);
  g.quadraticCurveTo(b.x + taper, b.y, b.x + taper + r, b.y);
  g.closePath();
}

/**
 * AVIONICS's switch, at rest (in its amber, see idleColor) a dark cap with a lit tick and a mark
 * under it, lit the cap's face in the lane's colour.
 */
function switchCap(g: CanvasRenderingContext2D, b: Box, st: number, lit: boolean): void {
  capPath(g, b, st);
  g.fillStyle = lit ? ink(0.3) : ink(0.09);
  g.fill();
  const t = Math.min(b.w * 0.1, (b.h * 0.12) / st);
  const face: Box = { x: b.x + t, y: b.y + t * st, w: b.w - 2 * t, h: b.h - 2 * t * st };
  capPath(g, face, st);
  if (lit) {
    g.fillStyle = tone(1.08);
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = ink(1, 0.65, 0.7);
    g.fillRect(face.x, face.y, face.w, face.h * 0.22);
    g.restore();
    return;
  }
  g.fillStyle = ink(0.14);
  g.fill();
  g.lineWidth = Math.max(1, t * 0.35);
  g.strokeStyle = ink(0.26);
  g.stroke();
  // the tick and the mark under it
  const tw = Math.max(1.5, face.w * 0.06);
  g.fillStyle = ink(1, 0.05, 0.9);
  g.fillRect(face.x + face.w / 2 - tw / 2, face.y + face.h * 0.16, tw, face.h * 0.26);
  g.fillStyle = ink(0.55);
  g.fillRect(face.x + face.w * 0.32, face.y + face.h * 0.74, face.w * 0.36, Math.max(1.5, face.h * 0.06));
}

/**
 * CASSETTE's key: a grey key with ridges to grip, lit pressed down a little with light showing
 * out of the slot under it in the lane's colour.
 */
function deckKey(g: CanvasRenderingContext2D, b: Box, slotBottom: number, st: number, lit: boolean): void {
  const press = lit ? b.h * 0.05 : 0;
  const k: Box = { x: b.x, y: b.y + press, w: b.w, h: b.h - press };
  if (lit) {
    // the light out of the slot under the key
    const slot = { y: k.y + k.h, h: Math.max(2, slotBottom - (k.y + k.h)) };
    g.fillStyle = tone(1.25);
    g.fillRect(k.x, slot.y, k.w, slot.h);
    g.fillStyle = ink(1, 0.85);
    g.fillRect(k.x + k.w * 0.12, slot.y + slot.h * 0.3, k.w * 0.76, slot.h * 0.4);
  }
  const r = Math.min(k.w * 0.08, (k.h * 0.1) / st);
  g.beginPath();
  g.roundRect(k.x, k.y, k.w, k.h, [{ x: r, y: r * st }]);
  const grad = g.createLinearGradient(0, k.y, 0, k.y + k.h);
  grad.addColorStop(0, lit ? ink(0.3) : ink(0.4));
  grad.addColorStop(1, lit ? ink(0.18) : ink(0.24));
  g.fillStyle = grad;
  g.fill();
  // its edges: lit on the left and at the far end, in shade on the right
  const e = Math.max(1, k.w * 0.03);
  g.fillStyle = ink(lit ? 0.4 : 0.52);
  g.fillRect(k.x + r, k.y, k.w - 2 * r, e * st);
  g.fillRect(k.x, k.y + r * st, e, k.h - 2 * r * st);
  g.fillStyle = ink(0.12);
  g.fillRect(k.x + k.w - e, k.y + r * st, e, k.h - 2 * r * st);
  // the ridges on its near half
  g.fillStyle = ink(lit ? 0.1 : 0.15);
  const ridges = 4;
  for (let i = 0; i < ridges; i++) {
    const y = k.y + k.h * (0.5 + (0.38 * i) / (ridges - 1));
    g.fillRect(k.x + k.w * 0.18, y, k.w * 0.64, Math.max(1, k.h * 0.035));
  }
}

/**
 * GRAND's key: a piano key the length of the row, white keys pale and the others dark at rest (a
 * key's colour mixed into black), lit in the lane's colour with a bright front edge.
 */
function pianoKey(g: CanvasRenderingContext2D, b: Box, st: number, kind: KeyKind, lit: boolean): void {
  const k = kind === 'white' ? 0.48 : kind === 'scratch' ? 0.4 : 0.32;
  const r = Math.min(b.w * 0.09, (b.h * 0.08) / st);
  g.beginPath();
  g.roundRect(b.x, b.y, b.w, b.h, [0, 0, { x: r, y: r * st }, { x: r, y: r * st }]);
  g.save();
  g.clip();
  if (lit) {
    g.fillStyle = tone(1.05);
    g.fillRect(b.x, b.y, b.w, b.h);
    const grad = g.createLinearGradient(0, b.y, 0, b.y + b.h * 0.6);
    grad.addColorStop(0, ink(1, 0.75, 0.75));
    grad.addColorStop(1, ink(1, 0.75, 0));
    g.fillStyle = grad;
    g.fillRect(b.x, b.y, b.w, b.h * 0.6);
  } else {
    g.fillStyle = ink(k);
    g.fillRect(b.x, b.y, b.w, b.h);
    // under the fallboard at its far end
    g.fillStyle = ink(k * 0.55);
    g.fillRect(b.x, b.y, b.w, b.h * 0.1);
    // a sheen down its left side
    g.fillStyle = ink(Math.min(1, k * 1.25));
    g.fillRect(b.x, b.y + b.h * 0.1, b.w * 0.12, b.h * 0.76);
  }
  // its front edge, toward the player
  g.fillStyle = lit ? ink(1, 0.85) : ink(Math.min(1, k * 1.35));
  g.fillRect(b.x, b.y + b.h * 0.86, b.w, b.h * 0.14);
  g.restore();
}


/** Paints the plate of `style` on `g`, whose units are plane px. */
export function paintDeck(style: DeckStyle, g: CanvasRenderingContext2D, spec: DeckSpec): void {
  PLATES[style](g, spec);
}

/**
 * A lane's light at rest and lit, in a picture as large as its place in the row (lane width by
 * the row's depth, square px). Most rest dim in the lane colour mixed into black; a few rest in
 * a colour of their own (`idleColor`) and take the lane colour only when lit.
 */
export interface KeyPaint {
  idle: (kind: KeyKind, stretch: number) => Paint;
  down: (kind: KeyKind, stretch: number) => Paint;
  /**
   * How far a light at rest reaches from the middle of its row toward the judge line, its socket
   * on the plate and its outline included (px), in a lane `w` wide and a row `h` deep (see rowDrop).
   */
  reach: (kind: KeyKind, w: number, h: number, st: number) => number;
  idleColor?: number;
  /** Lit lights of this kind are white, not the lane colour. */
  neutralDown?: (kind: KeyKind) => boolean;
}

/** The light's centre and its radius as a share of the lane (`share`), the row's depth allowing. */
function fit(w: number, h: number, st: number, share: number): { x: number; y: number; r: number } {
  return { x: w / 2, y: h / 2, r: Math.min(w * share, (h / 2 / st) * 0.86) };
}

/** Light falling from the judge line down the lane, fading out. */
function wash(g: CanvasRenderingContext2D, w: number, h: number, alpha: number): void {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, ink(1, 0, alpha));
  grad.addColorStop(1, ink(1, 0, 0));
  g.fillStyle = grad;
  g.fillRect(w * 0.04, 0, w * 0.92, h);
}

/** A soft round glow around a lit light. */
function halo(g: CanvasRenderingContext2D, x: number, y: number, r: number, st: number, alpha: number): void {
  g.save();
  g.translate(x, y);
  g.scale(1, st);
  const grad = g.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.7);
  grad.addColorStop(0, ink(1, 0.15, alpha));
  grad.addColorStop(1, ink(1, 0, 0));
  g.fillStyle = grad;
  g.fillRect(-r * 1.7, -r * 1.7, r * 3.4, r * 3.4);
  g.restore();
}

/** A turntable: a dark platter with grooves, its rim lit with the lane colour when `lit`. */
function platter(g: CanvasRenderingContext2D, w: number, h: number, st: number, lit: boolean): void {
  const { x, y, r } = fit(w, h, st, 0.44);
  if (lit) halo(g, x, y, r, st, 0.5);
  disc(g, x, y, r, st);
  g.fillStyle = ink(0.08);
  g.fill();
  g.lineWidth = 1;
  for (const k of [0.82, 0.68, 0.54]) {
    disc(g, x, y, r * k, st);
    g.strokeStyle = ink(0.25, 0, 0.6);
    g.stroke();
  }
  disc(g, x, y, r * 0.2, st);
  g.fillStyle = lit ? ink(1, 0.5) : ink(0.45);
  g.fill();
  disc(g, x, y, r * 0.96, st);
  g.lineWidth = Math.max(1.5, r * 0.09);
  g.strokeStyle = lit ? ink(1, 0.25) : ink(0.55);
  g.stroke();
}

export const KEY_PAINT: Record<DeckStyle, KeyPaint> = {
  line: {
    // at rest a short dim tick down the lane: a bar across it would read as a note under the line
    idle: () => (g, w, h) => {
      const tw = Math.max(2, w * 0.05);
      g.fillStyle = ink(0.3);
      g.beginPath();
      g.roundRect((w - tw) / 2, h * 0.12, tw, Math.max(6, h * 0.22), tw / 2);
      g.fill();
    },
    down: () => (g, w, h) => {
      wash(g, w, h, 0.42);
      g.fillStyle = tone(1.3);
      g.beginPath();
      g.roundRect(w * 0.22, h * 0.16, w * 0.56, Math.max(4, h * 0.1), h * 0.05);
      g.fill();
    },
    reach: (_kind, _w, h) => h / 2 - h * 0.12,
  },
  stem: {
    idle: (_, st) => (g, w, h) => {
      const { x, y, r } = fit(w, h, st, 0.2);
      disc(g, x, y, r, st);
      g.lineWidth = Math.max(1.5, r * 0.16);
      g.strokeStyle = ink(0.9);
      g.stroke();
      disc(g, x, y, r * 0.55, st);
      g.fillStyle = ink(0.5);
      g.fill();
    },
    down: (_, st) => (g, w, h) => {
      const { x, y, r } = fit(w, h, st, 0.2);
      halo(g, x, y, r * 1.3, st, 0.55);
      disc(g, x, y, r, st);
      g.fillStyle = tone(1.25);
      g.fill();
    },
    reach: (_, w, h, st) => {
      const { r } = fit(w, h, st, 0.2);
      return r * st + Math.max(1.5, r * 0.16) / 2;
    },
  },
  arcade: {
    // a domed button with a gloss on top; the scratch a turntable
    idle: (kind, st) => (g, w, h) => {
      if (kind === 'scratch') return platter(g, w, h, st, false);
      const { x, y, r } = fit(w, h, st, 0.36);
      disc(g, x, y, r, st);
      const grad = g.createLinearGradient(0, y - r * st, 0, y + r * st);
      grad.addColorStop(0, ink(0.5));
      grad.addColorStop(1, ink(0.22));
      g.fillStyle = grad;
      g.fill();
      g.beginPath();
      g.ellipse(x, y - r * st * 0.38, r * 0.62, r * st * 0.26, 0, 0, Math.PI * 2);
      g.fillStyle = ink(1, 0.7, 0.3);
      g.fill();
    },
    down: (kind, st) => (g, w, h) => {
      if (kind === 'scratch') return platter(g, w, h, st, true);
      const { x, y, r } = fit(w, h, st, 0.36);
      halo(g, x, y, r, st, 0.55);
      disc(g, x, y, r, st);
      const grad = g.createLinearGradient(0, y - r * st, 0, y + r * st);
      grad.addColorStop(0, ink(1, 0.45));
      grad.addColorStop(1, tone(1));
      g.fillStyle = grad;
      g.fill();
      g.beginPath();
      g.ellipse(x, y - r * st * 0.38, r * 0.62, r * st * 0.26, 0, 0, Math.PI * 2);
      g.fillStyle = ink(1, 1, 0.55);
      g.fill();
    },
    // the socket the plate draws round it (ARCADE_SOCKET) reaches farthest
    reach: (kind, w, h, st) => fit(w, h, st, kind === 'scratch' ? 0.44 : 0.36).r * ARCADE_SOCKET * st + 0.75,
  },
  mixer: {
    // a mixer's knob in a ring of lights; the scratch a turntable
    idle: (kind, st) => (g, w, h) => (kind === 'scratch' ? platter(g, w, h, st, false) : knob(g, w, h, st, false)),
    down: (kind, st) => (g, w, h) => (kind === 'scratch' ? platter(g, w, h, st, true) : knob(g, w, h, st, true)),
    idleColor: 0xffffff,
    // the knob's ring of lights
    reach: (kind, w, h, st) => {
      if (kind === 'scratch') return fit(w, h, st, 0.44).r * st;
      const { r } = fit(w, h, st, 0.36);
      return (r * 0.92 + Math.max(1.2, r * 0.07)) * st;
    },
  },
  hazard: {
    // a road chevron pointing at the judge line
    idle: (_, st) => (g, w, h) => chevron(g, w, h, st, ink(1, 0, 0.6), false),
    down: (_, st) => (g, w, h) => {
      wash(g, w, h, 0.3);
      chevron(g, w, h, st, tone(1.2), true);
    },
    reach: (_, w, h, st) => fit(w, h, st, 0.3).r * st * 0.55,
  },
  neon: {
    idle: (_, st) => (g, w, h) => {
      const { x, y, r } = fit(w, h, st, 0.3);
      regular(g, x, y, r, st, 6, Math.PI / 6);
      g.fillStyle = ink(1, 0, 0.1);
      g.fill();
      g.lineWidth = Math.max(1.5, r * 0.1);
      g.strokeStyle = ink(1, 0, 0.7);
      g.stroke();
    },
    down: (_, st) => (g, w, h) => {
      const { x, y, r } = fit(w, h, st, 0.3);
      halo(g, x, y, r, st, 0.6);
      regular(g, x, y, r, st, 6, Math.PI / 6);
      g.fillStyle = ink(1, 0.2, 0.55);
      g.fill();
      g.lineWidth = Math.max(2, r * 0.12);
      g.strokeStyle = ink(1, 0.6);
      g.stroke();
    },
    reach: (_, w, h, st) => {
      const { r } = fit(w, h, st, 0.3);
      return r * st * Math.cos(Math.PI / 6) + Math.max(1.5, r * 0.1) / 2;
    },
  },
  crystal: {
    idle: (_, st) => (g, w, h) => {
      const { x, y, r } = fit(w, h, st, 0.26);
      regular(g, x, y, r, st, 4);
      g.fillStyle = ink(1, 0.2, 0.16);
      g.fill();
      g.lineWidth = Math.max(1.2, r * 0.08);
      g.strokeStyle = ink(1, 0.55, 0.75);
      g.stroke();
    },
    down: (_, st) => (g, w, h) => {
      const { x, y, r } = fit(w, h, st, 0.26);
      halo(g, x, y, r, st, 0.55);
      // white at the heart, the lane colour at the corners (the gradient follows the stretch)
      g.save();
      g.translate(x, y);
      g.scale(1, st);
      regular(g, 0, 0, r, 1, 4);
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0, ink(1, 0.85));
      grad.addColorStop(1, tone(1));
      g.fillStyle = grad;
      g.fill();
      g.restore();
    },
    reach: (_, w, h, st) => {
      const { r } = fit(w, h, st, 0.26);
      return r * st + Math.max(1.2, r * 0.08) / 2;
    },
  },
  candy: {
    // a round jelly button with a shine
    idle: (_, st) => (g, w, h) => jelly(g, w, h, st, false),
    down: (_, st) => (g, w, h) => jelly(g, w, h, st, true),
    reach: (_, w, h, st) => {
      const { r } = fit(w, h, st, 0.36);
      return r * st + Math.max(2, r * 0.12) / 2;
    },
  },
  jewel: {
    // a round-cut gem: a table, facets to the girdle
    idle: (_, st) => (g, w, h) => gem(g, w, h, st, false),
    down: (_, st) => (g, w, h) => gem(g, w, h, st, true),
    // the band the plate draws along the row, or the socket round the gem (JEWEL_SOCKET) where it reaches farther
    reach: (_, w, h, st) => Math.max(h / 2, fit(w, h, st, 0.34).r * JEWEL_SOCKET * st * Math.cos(Math.PI / 8) + 1),
  },
  mono: {
    idle: (_, st) => (g, w, h) => triangle(g, w, h, st, false),
    down: (_, st) => (g, w, h) => triangle(g, w, h, st, true),
    idleColor: 0xffffff,
    neutralDown: () => true,
    // its tip, the outline's mitre past it
    reach: (_, w, h, st) => {
      const { r } = fit(w, h, st, 0.26);
      return r * st * 0.8 + Math.max(2, r * 0.1);
    },
  },
  concrete: {
    // the pocket's floor: dark at rest, lit, the light spilling onto its walls
    idle: (_, st) => (g, w, h) => {
      const f = pocketFloor(lightBox('concrete', 0, 0, w, h), st);
      g.fillStyle = ink(0.12);
      g.fillRect(f.x, f.y, f.w, f.h);
    },
    down: (_, st) => (g, w, h) => {
      const b = lightBox('concrete', 0, 0, w, h);
      const f = pocketFloor(b, st);
      g.fillStyle = ink(1, 0.1, 0.32);
      g.fillRect(b.x, b.y, b.w, b.h);
      g.fillStyle = tone(1.12);
      g.fillRect(f.x, f.y, f.w, f.h);
      g.fillStyle = ink(1, 0.8);
      g.fillRect(f.x + f.w * 0.18, f.y + f.h * 0.2, f.w * 0.64, f.h * 0.6);
    },
    // the pocket the plate sinks round it
    reach: (_, _w, h) => h / 2 - h * LIGHT_BOX.concrete.top,
  },
  avionics: {
    idle: (_, st) => (g, w, h) => switchCap(g, lightBox('avionics', 0, 0, w, h), st, false),
    down: (_, st) => (g, w, h) => switchCap(g, lightBox('avionics', 0, 0, w, h), st, true),
    idleColor: 0xffb21e,
    // the well round the cap
    reach: (_, _w, h, st) => h / 2 - h * LIGHT_BOX.avionics.top + 2.5 * st + 0.5,
  },
  cassette: {
    idle: (_, st) => (g, w, h) => deckKey(g, lightBox('cassette', 0, 0, w, h), h * 0.97, st, false),
    down: (_, st) => (g, w, h) => deckKey(g, lightBox('cassette', 0, 0, w, h), h * 0.97, st, true),
    idleColor: 0xffffff,
    // the slot round the key
    reach: (_, _w, h, st) => h / 2 - h * LIGHT_BOX.cassette.top + 2 * st,
  },
  grand: {
    idle: (kind, st) => (g, w, h) => pianoKey(g, lightBox('grand', 0, 0, w, h), st, kind, false),
    down: (kind, st) => (g, w, h) => pianoKey(g, lightBox('grand', 0, 0, w, h), st, kind, true),
    reach: (_, _w, h) => h / 2 - h * LIGHT_BOX.grand.top,
  },
};

/**
 * How much lower than usual a row of `style`'s lights lies (px, a row `depth` deep stretched
 * `stretch`), so that no light comes nearer the judge line than neon's hexagon in its lane: larger
 * lights keep their size and lie lower; those no larger, where they were.
 */
export function rowDrop(style: DeckStyle, lanes: readonly Pick<DeckLane, 'kind' | 'width'>[], depth: number, stretch: number): number {
  const [paint, neon] = [KEY_PAINT[style], KEY_PAINT.neon];
  return Math.max(0, ...lanes.map((l) => paint.reach(l.kind, l.width, depth, stretch) - neon.reach(l.kind, l.width, depth, stretch)));
}

/**
 * The light of a side lane laid over the keys, at rest and lit, in a picture as large as its box
 * (its half by the side row, square px): a bar drawn as the design draws its lane lights (a tint
 * picture; KEY_PAINT's neutralDown holds for it, and its idleColor unless the bar has its own). Lit,
 * it is the whole bar in the lane's colour; at rest no lane-coloured bar across the half, which would
 * read as a side note just under the line: the bar's ends, marks along it, or a grey button.
 * `side`: -1 the left half, 1 the right.
 */
export interface SidePaint {
  idle: (stretch: number, side: number) => Paint;
  down: (stretch: number, side: number) => Paint;
  /** At rest in this colour, not the lane's. */
  idleColor?: number;
}

/**
 * The glow of the next fill: a lit light's halo, painted once with the picture (the canvas's
 * shadow follows a bar's shape, its pointed or chevroned ends, as KEY_PAINT's round halo cannot).
 */
function glow(g: CanvasRenderingContext2D, alpha: number, blur: number): void {
  g.shadowColor = ink(1, 0.15, alpha);
  g.shadowBlur = blur;
}

/** Only the two ends of the bar `draw` draws in box `b` (SIDE_ENDS of it each), in a `w`×`h` picture. */
function ends(g: CanvasRenderingContext2D, w: number, h: number, b: Box, draw: () => void): void {
  const reach = b.w * SIDE_ENDS;
  g.save();
  g.beginPath();
  g.rect(0, 0, b.x + reach, h);
  g.rect(b.x + b.w - reach, 0, w - (b.x + b.w - reach), h);
  g.clip();
  draw();
  g.restore();
}

/** A row of chevrons pointing out to the half's own side, as a road's bend is signed. */
function chevrons(g: CanvasRenderingContext2D, b: Box, st: number, side: number): void {
  const cw = (b.h * 0.55) / st;
  const t = cw * 0.45;
  const step = cw * 3;
  const count = Math.max(1, Math.floor((b.w - cw - t) / step) + 1);
  const start = b.x + (b.w - (count - 1) * step - cw - t) / 2;
  const cy = b.y + b.h / 2;
  g.beginPath();
  for (let i = 0; i < count; i++) {
    const x = start + i * step;
    // drawn pointing left, then turned for the right half
    const p = (dx: number): number => (side < 0 ? x + dx : 2 * b.x + b.w - x - dx);
    const points: [number, number][] = [
      [p(0), cy],
      [p(cw), b.y],
      [p(cw + t), b.y],
      [p(t), cy],
      [p(cw + t), b.y + b.h],
      [p(cw), b.y + b.h],
    ];
    points.forEach(([px, py], k) => (k === 0 ? g.moveTo(px, py) : g.lineTo(px, py)));
    g.closePath();
  }
}

/** The dots of an LED meter along a bar (MIXER's lights in a row rather than a ring). */
function meter(g: CanvasRenderingContext2D, b: Box, st: number, fill: (i: number, n: number) => string): void {
  const r = Math.max(1.2, (b.h / 2 / st) * 0.8);
  const step = r * 3.2;
  const n = Math.max(1, Math.floor((b.w - 2 * r) / step) + 1);
  const start = b.x + (b.w - (n - 1) * step) / 2;
  for (let i = 0; i < n; i++) {
    disc(g, start + i * step, b.y + b.h / 2, r, st);
    g.fillStyle = fill(i, n);
    g.fill();
  }
}

/** JEWEL's side gem: a baguette cut, its table in the middle and facets to its corners. */
function sideGem(g: CanvasRenderingContext2D, b: Box, st: number, lit: boolean): void {
  const cut = b.h * 0.3;
  chamfered(g, b, cut, st);
  g.fillStyle = lit ? tone(1.05) : ink(0.42);
  g.fill();
  // a lit gem's glow is its outline's (see glow)
  g.shadowBlur = 0;
  const inset = b.h * 0.3;
  const table: Box = { x: b.x + inset / st, y: b.y + inset, w: b.w - (2 * inset) / st, h: b.h - 2 * inset };
  g.lineWidth = Math.max(1, b.h * 0.05);
  g.strokeStyle = lit ? ink(1, 0.9, 0.7) : ink(1, 0.35, 0.4);
  g.beginPath();
  for (const [ox, oy, tx, ty] of [
    [b.x, b.y, table.x, table.y],
    [b.x + b.w, b.y, table.x + table.w, table.y],
    [b.x, b.y + b.h, table.x, table.y + table.h],
    [b.x + b.w, b.y + b.h, table.x + table.w, table.y + table.h],
  ]) {
    g.moveTo(ox, oy);
    g.lineTo(tx, ty);
  }
  g.stroke();
  g.fillStyle = lit ? ink(1, 0.75) : ink(0.7);
  g.fillRect(table.x, table.y, table.w, table.h);
}

export const SIDE_PAINT: Record<DeckStyle, SidePaint> = {
  line: {
    // at rest only its ends, dim as the lanes' ticks are; lit a bright LED bar
    idle: (st) => (g, w, h) => {
      const b = barBox(0, 0, w, h, 0.3);
      ends(g, w, h, b, () => {
        rounded(g, b, b.h / 2 / st, st);
        g.fillStyle = ink(0.3);
        g.fill();
      });
    },
    down: (st) => (g, w, h) => {
      const b = barBox(0, 0, w, h, 0.42);
      glow(g, 0.7, h * 0.5);
      rounded(g, b, b.h / 2 / st, st);
      g.fillStyle = tone(1.3);
      g.fill();
    },
  },
  stem: {
    // the dot's ring and core drawn long: at rest only their ends
    idle: (st) => (g, w, h) => {
      const b = barBox(0, 0, w, h, 0.6);
      const lw = Math.max(1.5, b.h * 0.16);
      ends(g, w, h, b, () => {
        rounded(g, b, b.h / 2 / st, st);
        g.lineWidth = lw;
        g.strokeStyle = ink(0.9);
        g.stroke();
        const core = barBox(0, 0, w, h, 0.26);
        rounded(g, { ...core, x: b.x + lw * 2, w: b.w - lw * 4 }, core.h / 2 / st, st);
        g.fillStyle = ink(0.5);
        g.fill();
      });
    },
    down: (st) => (g, w, h) => {
      const b = barBox(0, 0, w, h, 0.6);
      glow(g, 0.55, h * 0.5);
      rounded(g, b, b.h / 2 / st, st);
      g.fillStyle = tone(1.25);
      g.fill();
    },
  },
  arcade: {
    // a long domed button with a gloss on top (the plate sets it in a socket), grey until lit
    idle: (st) => (g, w, h) => arcadeBar(g, barBox(0, 0, w, h, ARCADE_BAR), st, false),
    down: (st) => (g, w, h) => arcadeBar(g, barBox(0, 0, w, h, ARCADE_BAR), st, true),
    idleColor: 0xffffff,
  },
  mixer: {
    // a level meter: the knobs' ring of lights in a row
    idle: (st) => (g, w, h) => meter(g, barBox(0, 0, w, h, 0.5), st, () => ink(0.2)),
    down: (st) => (g, w, h) => {
      glow(g, 0.45, h * 0.35);
      meter(g, barBox(0, 0, w, h, 0.5), st, (i, n) => (i === 0 || i === n - 1 ? ink(1, 0.6) : tone(1)));
    },
  },
  hazard: {
    // chevrons pointing out to its side, as a bend is signed
    idle: (st, side) => (g, w, h) => {
      chevrons(g, barBox(0, 0, w, h, 0.62), st, side);
      g.fillStyle = ink(1, 0, 0.6);
      g.fill();
    },
    down: (st, side) => (g, w, h) => {
      glow(g, 0.5, h * 0.4);
      chevrons(g, barBox(0, 0, w, h, 0.62), st, side);
      g.fillStyle = tone(1.2);
      g.fill();
      g.shadowBlur = 0;
      g.lineWidth = 1.5;
      g.strokeStyle = ink(1, 0.7);
      g.stroke();
    },
  },
  neon: {
    // a tube with the hexagons' pointed ends: at rest only its ends
    idle: (st) => (g, w, h) => {
      const b = barBox(0, 0, w, h, 0.62);
      ends(g, w, h, b, () => {
        pointed(g, b, st, 0.5);
        g.fillStyle = ink(1, 0, 0.1);
        g.fill();
        g.lineWidth = Math.max(1.5, b.h * 0.1);
        g.strokeStyle = ink(1, 0, 0.7);
        g.stroke();
      });
    },
    down: (st) => (g, w, h) => {
      const b = barBox(0, 0, w, h, 0.62);
      glow(g, 0.7, h * 0.5);
      pointed(g, b, st, 0.5);
      g.fillStyle = ink(1, 0.3, 0.75);
      g.fill();
      g.shadowBlur = 0;
      g.lineWidth = Math.max(2, b.h * 0.12);
      g.strokeStyle = ink(1, 0.7);
      g.stroke();
    },
  },
  crystal: {
    // a long prism, pointed as the diamonds are, white at its heart when lit: at rest only its ends
    idle: (st) => (g, w, h) => {
      const b = barBox(0, 0, w, h, 0.66);
      ends(g, w, h, b, () => {
        pointed(g, b, st, 1.2);
        g.fillStyle = ink(1, 0.2, 0.16);
        g.fill();
        g.lineWidth = Math.max(1.2, b.h * 0.08);
        g.strokeStyle = ink(1, 0.55, 0.75);
        g.stroke();
      });
    },
    down: (st) => (g, w, h) => {
      const b = barBox(0, 0, w, h, 0.66);
      glow(g, 0.55, h * 0.45);
      pointed(g, b, st, 1.2);
      const grad = g.createLinearGradient(b.x, 0, b.x + b.w, 0);
      grad.addColorStop(0, tone(1));
      grad.addColorStop(0.5, ink(1, 0.85));
      grad.addColorStop(1, tone(1));
      g.fillStyle = grad;
      g.fill();
    },
  },
  candy: {
    // a long jelly button with a shine, grey until lit
    idle: (st) => (g, w, h) => candyBar(g, barBox(0, 0, w, h, 0.74), st, false),
    down: (st) => (g, w, h) => candyBar(g, barBox(0, 0, w, h, 0.74), st, true),
    idleColor: 0xffffff,
  },
  jewel: {
    // a baguette in a setting on the plate, grey until lit
    idle: (st) => (g, w, h) => sideGem(g, barBox(0, 0, w, h, JEWEL_BAR), st, false),
    down: (st) => (g, w, h) => {
      glow(g, 0.55, h * 0.45);
      sideGem(g, barBox(0, 0, w, h, JEWEL_BAR), st, true);
    },
    idleColor: 0xffffff,
  },
  mono: {
    // an outline, filled white when lit: at rest only its ends
    idle: () => (g, w, h) => {
      const b = barBox(0, 0, w, h, 0.5);
      const lw = Math.max(2, b.h * 0.12);
      ends(g, w, h, b, () => {
        g.lineWidth = lw;
        g.strokeStyle = ink(1, 1);
        g.strokeRect(b.x + lw / 2, b.y + lw / 2, b.w - lw, b.h - lw);
      });
    },
    down: () => (g, w, h) => {
      const b = barBox(0, 0, w, h, 0.5);
      g.fillStyle = ink(1, 1);
      g.fillRect(b.x, b.y, b.w, b.h);
    },
  },
  concrete: {
    // a long pocket (the plate sinks it): its floor dark at rest, lit in the lane's colour
    idle: (st) => (g, w, h) => {
      const f = pocketFloor(barBox(0, 0, w, h, CONCRETE_BAR), st);
      g.fillStyle = ink(0.12);
      g.fillRect(f.x, f.y, f.w, f.h);
    },
    down: (st) => (g, w, h) => {
      const b = barBox(0, 0, w, h, CONCRETE_BAR);
      const f = pocketFloor(b, st);
      g.fillStyle = ink(1, 0.1, 0.32);
      g.fillRect(b.x, b.y, b.w, b.h);
      g.fillStyle = tone(1.12);
      g.fillRect(f.x, f.y, f.w, f.h);
    },
    idleColor: 0xffffff,
  },
  avionics: {
    // a long switch: at rest dark with its ticks, lit its face
    idle: (st) => (g, w, h) => switchCap(g, barBox(0, 0, w, h, AVIONICS_BAR), st, false),
    down: (st) => (g, w, h) => switchCap(g, barBox(0, 0, w, h, AVIONICS_BAR), st, true),
    idleColor: 0xffb21e,
  },
  cassette: {
    idle: (st) => (g, w, h) => {
      const b = barBox(0, 0, w, h, CASSETTE_BAR);
      deckKey(g, b, b.y + b.h, st, false);
    },
    down: (st) => (g, w, h) => {
      const b = barBox(0, 0, w, h, CASSETTE_BAR);
      deckKey(g, { ...b, h: b.h * 0.86 }, b.y + b.h, st, true);
    },
    idleColor: 0xffffff,
  },
  grand: {
    // a long key, grey until lit
    idle: (st) => (g, w, h) => pianoKey(g, barBox(0, 0, w, h, GRAND_BAR), st, 'other', false),
    down: (st) => (g, w, h) => pianoKey(g, barBox(0, 0, w, h, GRAND_BAR), st, 'other', true),
    idleColor: 0xffffff,
  },
};

function arcadeBar(g: CanvasRenderingContext2D, b: Box, st: number, lit: boolean): void {
  const r = (b.h / st) * 0.4;
  if (lit) glow(g, 0.55, b.h * 0.6);
  rounded(g, b, r, st);
  const grad = g.createLinearGradient(0, b.y, 0, b.y + b.h);
  grad.addColorStop(0, lit ? ink(1, 0.45) : ink(0.5));
  grad.addColorStop(1, lit ? tone(1) : ink(0.22));
  g.fillStyle = grad;
  g.fill();
  g.shadowBlur = 0;
  rounded(g, { x: b.x + r, y: b.y + b.h * 0.14, w: b.w - 2 * r, h: b.h * 0.26 }, (b.h * 0.13) / st, st);
  g.fillStyle = lit ? ink(1, 1, 0.55) : ink(1, 0.7, 0.3);
  g.fill();
}

function candyBar(g: CanvasRenderingContext2D, b: Box, st: number, lit: boolean): void {
  if (lit) glow(g, 0.5, b.h * 0.6);
  rounded(g, b, b.h / 2 / st, st);
  g.fillStyle = lit ? tone(1.1) : ink(0.55);
  g.fill();
  g.shadowBlur = 0;
  g.lineWidth = Math.max(2, b.h * 0.12);
  g.strokeStyle = lit ? ink(1, 0.85) : ink(1, 0.6, 0.55);
  g.stroke();
  g.beginPath();
  g.ellipse(b.x + b.w * 0.16, b.y + b.h * 0.34, b.w * 0.07, b.h * 0.16, 0, 0, Math.PI * 2);
  g.fillStyle = ink(1, 1, lit ? 0.85 : 0.5);
  g.fill();
}

function knob(g: CanvasRenderingContext2D, w: number, h: number, st: number, lit: boolean): void {
  const { x, y, r: room } = fit(w, h, st, 0.36);
  const r = room * 0.62;
  // the ring of lights: three quarters of a turn, open at the bottom
  const lights = 11;
  for (let i = 0; i < lights; i++) {
    const a = Math.PI * 0.75 + (i / (lights - 1)) * Math.PI * 1.5;
    disc(g, x + Math.cos(a) * room * 0.92, y + Math.sin(a) * room * 0.92 * st, Math.max(1.2, room * 0.07), st);
    g.fillStyle = lit ? (i === lights - 1 ? ink(1, 0.6) : tone(1)) : ink(0.2);
    g.fill();
  }
  disc(g, x, y, r, st);
  g.fillStyle = lit ? ink(0.3) : ink(0.13);
  g.fill();
  g.lineWidth = Math.max(1, r * 0.08);
  g.strokeStyle = ink(0.4);
  g.stroke();
  // its pointer, turned all the way up when lit
  const a = lit ? Math.PI * 0.25 : Math.PI * 1.5;
  g.beginPath();
  g.moveTo(x + Math.cos(a) * r * 0.25, y + Math.sin(a) * r * 0.25 * st);
  g.lineTo(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85 * st);
  g.lineWidth = Math.max(1.5, r * 0.14);
  g.lineCap = 'round';
  g.strokeStyle = ink(1, 1);
  g.stroke();
}

function chevron(g: CanvasRenderingContext2D, w: number, h: number, st: number, fill: string, lit: boolean): void {
  const { x, y, r } = fit(w, h, st, 0.3);
  const t = r * 0.42;
  const tip = y - r * st * 0.55;
  const foot = y + r * st * 0.55;
  polygon(g, [
    [x, tip],
    [x + r, foot],
    [x + r - t, foot],
    [x, tip + t * st * 1.25],
    [x - r + t, foot],
    [x - r, foot],
  ]);
  g.fillStyle = fill;
  g.fill();
  if (lit) {
    g.lineWidth = 1.5;
    g.strokeStyle = ink(1, 0.7);
    g.stroke();
  }
}

function jelly(g: CanvasRenderingContext2D, w: number, h: number, st: number, lit: boolean): void {
  const { x, y, r } = fit(w, h, st, 0.36);
  if (lit) halo(g, x, y, r, st, 0.5);
  disc(g, x, y, r, st);
  g.fillStyle = lit ? tone(1.1) : ink(0.55);
  g.fill();
  g.lineWidth = Math.max(2, r * 0.12);
  g.strokeStyle = lit ? ink(1, 0.85) : ink(1, 0.6, 0.55);
  g.stroke();
  g.beginPath();
  g.ellipse(x - r * 0.28, y - r * st * 0.36, r * 0.34, r * st * 0.2, -0.5, 0, Math.PI * 2);
  g.fillStyle = ink(1, 1, lit ? 0.85 : 0.5);
  g.fill();
}

function gem(g: CanvasRenderingContext2D, w: number, h: number, st: number, lit: boolean): void {
  const { x, y, r } = fit(w, h, st, 0.34);
  if (lit) halo(g, x, y, r, st, 0.55);
  regular(g, x, y, r, st, 8, Math.PI / 8);
  g.fillStyle = lit ? tone(1.05) : ink(0.42);
  g.fill();
  // facets from the table's corners to the girdle's
  g.lineWidth = Math.max(1, r * 0.05);
  g.strokeStyle = lit ? ink(1, 0.9, 0.7) : ink(1, 0.35, 0.4);
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    g.moveTo(x + r * 0.5 * Math.sin(a), y - r * 0.5 * st * Math.cos(a));
    g.lineTo(x + r * Math.sin(a), y - r * st * Math.cos(a));
  }
  g.stroke();
  regular(g, x, y, r * 0.5, st, 8, Math.PI / 8);
  g.fillStyle = lit ? ink(1, 0.75) : ink(0.7);
  g.fill();
}

function triangle(g: CanvasRenderingContext2D, w: number, h: number, st: number, lit: boolean): void {
  const { x, y, r } = fit(w, h, st, 0.26);
  polygon(g, [
    [x, y - r * st * 0.8],
    [x + r, y + r * st * 0.6],
    [x - r, y + r * st * 0.6],
  ]);
  if (lit) {
    g.fillStyle = ink(1, 1);
    g.fill();
    return;
  }
  g.lineWidth = Math.max(2, r * 0.1);
  g.strokeStyle = ink(1, 1);
  g.stroke();
}
