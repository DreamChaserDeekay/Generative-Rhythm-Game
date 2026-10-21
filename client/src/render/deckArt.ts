import type { SkinColors } from './skins';
import { ink, tone, type Paint } from './tintArt';

/**
 * The gear under the judge line, drawn in code per skin: a plate in the skin's own colours (a
 * picture in real colours, painted again when the screen shows more or less of it) and, on it, a
 * light per lane in the lane's colour that lights while its key is down (a tint picture, see
 * tintArt). Each design follows its skin: LED bars, instrument dots, arcade buttons, a mixer's
 * knobs, road chevrons, neon hexagons, crystal diamonds, candy buttons, cut gems, outlines.
 */
export type DeckStyle = 'line' | 'stem' | 'arcade' | 'mixer' | 'hazard' | 'neon' | 'crystal' | 'candy' | 'jewel' | 'mono';
export const DECK_STYLES: DeckStyle[] = ['line', 'stem', 'arcade', 'mixer', 'hazard', 'neon', 'crystal', 'candy', 'jewel', 'mono'];
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
  lanes: DeckLane[];
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

/** Room under the lights for the lower part of a design (none when the screen shows too little). */
const lowerRoom = (s: DeckSpec) => s.room - keyBottom(s);

/**
 * A panel with cut corners across the deck under the lights, `inset` from its sides, down to just
 * above the screen's bottom edge; the path is left for a fill or stroke. Its middle (y), or null
 * when the screen shows too little for one.
 */
function panel(g: CanvasRenderingContext2D, s: DeckSpec, inset: number, cut: number): number | null {
  const top = keyBottom(s) + 10;
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

const PLATES: Record<DeckStyle, (g: CanvasRenderingContext2D, s: DeckSpec) => void> = {
  // LED bars under the line, the lanes' lines carried down, a panel outlined in the rails' colours
  line: (g, s) => {
    g.fillStyle = shade(s.colours.trackFar, 0.7);
    g.fillRect(0, 0, s.width, s.depth);
    g.fillStyle = white(0.1);
    g.fillRect(0, 0, s.width, 2);
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
    g.fillRect(0, 0, s.width, 2);
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
    grad.addColorStop(0, '#2b313d');
    grad.addColorStop(0.45, '#161a22');
    grad.addColorStop(1, '#12151c');
    g.fillStyle = grad;
    g.fillRect(0, 0, s.width, s.depth);
    const rand = seeded(7);
    for (let y = 4; y < s.depth; y += 2) {
      g.fillStyle = white(0.012 + rand() * 0.03);
      g.fillRect(0, y, s.width, 1);
    }
    g.fillStyle = '#6b7385';
    g.fillRect(0, 0, s.width, 3);
    g.fillStyle = '#0b0d12';
    g.fillRect(0, 3, s.width, 1);
    const cy = s.keyTop + s.keyDepth / 2;
    for (const l of s.lanes) {
      const r = radius(s, l, l.kind === 'scratch' ? 0.44 : 0.36) * 1.14;
      disc(g, centre(l), cy, r, s.stretch);
      g.fillStyle = '#0b0d12';
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = '#4a5263';
      g.stroke();
    }
    const room = lowerRoom(s);
    if (room < 30) return;
    const top = keyBottom(s) + 12;
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
    g.fillRect(0, 0, s.width, 2);
    separators(g, s, s.keyTop, keyBottom(s), shade(s.colours.divider, 0.8));
    const room = lowerRoom(s);
    if (room < 30) return;
    const top = keyBottom(s) + 12;
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
    g.fillRect(0, 0, s.width, 2);
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
    g.fillRect(0, 0, s.width, 1.5);
    const y = Math.max(keyBottom(s) + 8, s.room - 10);
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
    g.fillStyle = white(0.4);
    g.fillRect(0, 0, s.width, 1);
    g.fillStyle = white(0.1);
    g.fillRect(0, 1, s.width, 3);
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
    g.fillRect(0, 0, s.width, 3);
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
    const top = s.keyTop - 4;
    const bottom = keyBottom(s) + 4;
    g.fillStyle = shade(s.colours.trackNear, 1.35);
    g.fillRect(0, top, s.width, bottom - top);
    g.fillStyle = shade(s.colours.railRight, 1, 0.6);
    g.fillRect(0, top, s.width, 1);
    g.fillStyle = shade(s.colours.railLeft, 1, 0.35);
    g.fillRect(0, bottom - 1, s.width, 1);
    const cy = s.keyTop + s.keyDepth / 2;
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(176,166,232,0.55)';
    for (const l of s.lanes) {
      regular(g, centre(l), cy, radius(s, l, 0.34) * 1.16, s.stretch, 8, Math.PI / 8);
      g.fillStyle = shade(s.colours.trackFar, 1);
      g.fill();
      g.stroke();
    }
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
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s.width, 2);
    separators(g, s, s.keyTop, keyBottom(s), s.colours.divider);
    if (lowerRoom(s) < 20) return;
    g.fillRect(12, s.room - 10, s.width - 24, 2);
  },
};

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
  },
  mixer: {
    // a mixer's knob in a ring of lights; the scratch a turntable
    idle: (kind, st) => (g, w, h) => (kind === 'scratch' ? platter(g, w, h, st, false) : knob(g, w, h, st, false)),
    down: (kind, st) => (g, w, h) => (kind === 'scratch' ? platter(g, w, h, st, true) : knob(g, w, h, st, true)),
    idleColor: 0xffffff,
  },
  hazard: {
    // a road chevron pointing at the judge line
    idle: (_, st) => (g, w, h) => chevron(g, w, h, st, ink(1, 0, 0.6), false),
    down: (_, st) => (g, w, h) => {
      wash(g, w, h, 0.3);
      chevron(g, w, h, st, tone(1.2), true);
    },
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
  },
  candy: {
    // a round jelly button with a shine
    idle: (_, st) => (g, w, h) => jelly(g, w, h, st, false),
    down: (_, st) => (g, w, h) => jelly(g, w, h, st, true),
  },
  jewel: {
    // a round-cut gem: a table, facets to the girdle
    idle: (_, st) => (g, w, h) => gem(g, w, h, st, false),
    down: (_, st) => (g, w, h) => gem(g, w, h, st, true),
  },
  mono: {
    idle: (_, st) => (g, w, h) => triangle(g, w, h, st, false),
    down: (_, st) => (g, w, h) => triangle(g, w, h, st, true),
    idleColor: 0xffffff,
    neutralDown: () => true,
  },
};

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
