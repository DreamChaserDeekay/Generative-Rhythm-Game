import type { SkinColors } from './skins';
import { ink, tone, type NoteMark, type Paint } from './tintArt';

/**
 * The gear: the track's frame down its edges and, under the judge line, a plate. The skins' own
 * gears, LINE (LED bars) and STEM (instrument dots), have a light per lane on it in the lane's colour
 * that lights while its key is down (a tint picture, see tintArt). The four a player picks (설정 →
 * 기어, GEAR_STYLES) are each one object with no lane's key on it (the lanes and the key beams show
 * the keys): a red judge line a little above them (GEAR_JUDGE) and the object's own panel under
 * it, drawn from its pictures where they loaded (render/styleArt.ts) and in code where not:
 *
 * - STANDARD (기본): the game's own controller, graphite rails with a cyan line, smoked glass with a
 *   glass jog dial, the game's name over a cyan light strip and a speaker grille;
 * - CABINET (오락실 기체): an arcade cabinet's control panel, embossed black ABS with chrome, a
 *   joystick, six acrylic buttons, start buttons, credit windows and the coin entry, amber LEDs down
 *   its side panels that light in FEVER;
 * - RECEIVER (빈티지 리시버): a 1970s stereo receiver, walnut sides, a brushed silver faceplate with
 *   a tuning knob, an amber tuning dial, selector switches, two meters and a volume knob;
 * - NAJEON (나전칠기): a black lacquer chest front, brass corner fittings, two lids with a
 *   mother-of-pearl crane, pearl vines and a brass lock plate.
 */
export type DeckStyle = 'line' | 'stem' | 'standard' | 'cabinet' | 'receiver' | 'najeon';
/** The gears a player picks. */
export type GearStyle = Exclude<DeckStyle, 'line' | 'stem'>;
export const GEAR_STYLES: GearStyle[] = ['standard', 'cabinet', 'receiver', 'najeon'];
export const DECK_STYLES: DeckStyle[] = ['line', 'stem', ...GEAR_STYLES];
export const isGear = (style: DeckStyle): style is GearStyle => style !== 'line' && style !== 'stem';
/** Earlier skins named the key caps that stood here: the plain ones are LINE and STEM, the rest the standard gear. */
export const CAP_DECKS: Record<string, DeckStyle> = {
  flat: 'line',
  stem: 'stem',
  gloss: 'standard',
  piano: 'standard',
  outline: 'standard',
  neon: 'standard',
  glass: 'standard',
  pill: 'standard',
  jewel: 'standard',
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
const black = (a: number) => `rgba(0,0,0,${a})`;

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

const keyBottom = (s: DeckSpec) => s.keyTop + s.keyDepth;

/** Lines between the lanes, from `y0` to `y1`. */
function separators(g: CanvasRenderingContext2D, s: DeckSpec, y0: number, y1: number, colour: string): void {
  g.fillStyle = colour;
  for (const l of s.lanes.slice(1)) g.fillRect(l.left - 0.5, y0, 1, y1 - y0);
}

/** Where the lower part of a design may start: under the lights, and under the side bars when there are some. */
export const lowerTop = (s: DeckSpec) => Math.max(keyBottom(s), ...s.sides.map((b) => b.top + b.depth));

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

/** A side bar's ends lie this share of its half in from the half's ends, so the two halves' bars stay apart. */
const SIDE_INSET = 0.05;
/** At rest some designs show only a side bar's two ends, this share of it each (see ends). */
const SIDE_ENDS = 0.07;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where a design draws a side bar in its box (`w`×`h` at x, y: its half by the side row): `share` of the row deep, in its middle. */
function barBox(x: number, y: number, w: number, h: number, share: number): Box {
  return { x: x + w * SIDE_INSET, y: y + (h * (1 - share)) / 2, w: w * (1 - 2 * SIDE_INSET), h: h * share };
}

/** A rectangle whose corners are round on the screen (`r` across, `st` times longer along the track). */
function rounded(g: CanvasRenderingContext2D, b: Box, r: number, st: number): void {
  g.beginPath();
  g.roundRect(b.x, b.y, b.w, b.h, [{ x: Math.min(r, b.w / 2), y: Math.min(r * st, b.h / 2) }]);
}

/**
 * The deck's top edge, just under the judge line: a dim line this many px deep in every design, so
 * nothing bright under the line reads as a second one before the lights.
 */
const EDGE = 1.5;

const PLATES: Record<'line' | 'stem', (g: CanvasRenderingContext2D, s: DeckSpec) => void> = {
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
};

// ---------- the four gears ----------

/** A picture a gear is drawn from (an ImageBitmap in the browser). */
export type Picture = CanvasImageSource & { readonly width: number; readonly height: number };

/**
 * A gear's pictures by part (render/styleArt.ts loads them): the materials of its plate and frame,
 * and the things on its deck. A part whose picture is missing is drawn in code.
 */
export type GearPart = 'plate' | 'frame' | 'jog' | 'joystick' | 'button' | 'coin' | 'knob' | 'switch' | 'lid' | 'lock';
export type GearArt = Partial<Record<GearPart, Picture>>;

/**
 * The judge line of the four gears, as DJMAX draws its own: a thick red line (`height` plane px) with
 * a light core and a red glow both ways (`blur`), a little above the gear: `gap` plane px of the lanes
 * lie between them, where a note let through runs on until the gear covers it. (The skins' lines stay
 * with their own gears.)
 */
export const GEAR_JUDGE = { line: '#ff2b3b', core: '#ffd2d6', glow: '#ff2b3b', height: 16, blur: 22, gap: 40 } as const;

/** How deep the band of a gear's deck its things lie in looks (plane px across: drawn `stretch` times longer along the track). */
const BAND = 96;

/**
 * Where a gear lays its things out on its deck: under its trim (`trim` plane px), as deep as the
 * screen shows of the deck but no deeper than BAND looks, in the middle of what the screen shows
 * (the plane camera shows a deep deck). `u` is the band's depth as it looks across (plane px), the
 * size things are given in; null where the screen shows too little of the deck.
 */
function bandOf(s: DeckSpec, trim: number): { y: number; h: number; u: number; mid: number } | null {
  const pad = 4 * s.stretch;
  const room = s.room - trim - 2 * pad;
  const h = Math.min(room, BAND * s.stretch);
  const y = trim + pad + (room - h) / 2;
  const u = h / s.stretch;
  return u >= 24 ? { y, h, u, mid: y + h / 2 } : null;
}

/** A box `w` across about (cx, cy), `aspect` as deep as wide on the screen (`st` times longer along the track). */
function boxAt(cx: number, cy: number, w: number, st: number, aspect = 1): Box {
  const h = w * aspect * st;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** `pic` repeated over the box, `scale` plane px to a picture px (`st` times longer along the track), or `colour` without it. */
function material(g: CanvasRenderingContext2D, pic: Picture | undefined, b: Box, scale: number, st: number, colour: string): void {
  g.fillStyle = colour;
  g.fillRect(b.x, b.y, b.w, b.h);
  if (!pic) return;
  const [tw, th] = [pic.width * scale, pic.height * scale * st];
  g.save();
  g.beginPath();
  g.rect(b.x, b.y, b.w, b.h);
  g.clip();
  g.imageSmoothingQuality = 'high';
  for (let y = b.y; y < b.y + b.h; y += th) for (let x = b.x; x < b.x + b.w; x += tw) g.drawImage(pic, x, y, tw, th);
  g.restore();
}

function picture(g: CanvasRenderingContext2D, pic: Picture, b: Box): void {
  g.imageSmoothingQuality = 'high';
  g.drawImage(pic, b.x, b.y, b.w, b.h);
}

/** A thing on the deck: its picture in its box, or `code` drawing it there. */
function thing(g: CanvasRenderingContext2D, pic: Picture | undefined, b: Box, code: (b: Box) => void): void {
  if (pic) picture(g, pic, b);
  else code(b);
}

/** Text across the plate at (x, y), `size` px tall on the screen (drawn `st` times longer along the track). */
function text(g: CanvasRenderingContext2D, label: string, x: number, y: number, size: number, st: number, fill: string, o: { font?: string; tracking?: number; engraved?: boolean } = {}): void {
  g.save();
  g.translate(x, y);
  g.scale(1, st);
  g.font = `600 ${size}px ${o.font ?? "'Barlow Condensed', 'Pretendard Variable', sans-serif"}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${o.tracking ?? 0}px`;
  if (o.engraved) {
    g.fillStyle = white(0.35);
    g.fillText(label, 0, 0.8);
  }
  g.fillStyle = fill;
  g.fillText(label, 0, 0);
  g.restore();
}

/** A disc lit from the top-left: `stops` from its top-left to its bottom-right, as a flat colour where a gradient will not do. */
function shadedDisc(g: CanvasRenderingContext2D, b: Box, stops: [number, string][]): void {
  g.beginPath();
  g.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
  const grad = g.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
  for (const [at, c] of stops) grad.addColorStop(at, c);
  g.fillStyle = grad;
  g.fill();
}

const CYAN = '#37e2ff';
const BRASS = '#b8893b';
const AMBER = '#ffb547';
const LED_RED = '#ff2a2a';

/** A seven-segment digit 8 (every segment) in a `w` × `h` box: the ghost of an LED readout. */
function eight(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const t = w * 0.18;
  const segs: [number, number, number, number][] = [
    [x + t, y, w - 2 * t, t],
    [x + t, y + h / 2 - t / 2, w - 2 * t, t],
    [x + t, y + h - t, w - 2 * t, t],
    [x, y + t, t, h / 2 - 1.5 * t],
    [x + w - t, y + t, t, h / 2 - 1.5 * t],
    [x, y + h / 2 + t / 2, t, h / 2 - 1.5 * t],
    [x + w - t, y + h / 2 + t / 2, t, h / 2 - 1.5 * t],
  ];
  for (const [sx, sy, sw, sh] of segs) g.fillRect(sx, sy, sw, sh);
}

const PLATE_SCALE = 0.5;

/** A panel of small holes (a speaker's grille) filling box `b`, the holes `pitch` px apart across. */
function grille(g: CanvasRenderingContext2D, b: Box, st: number, pitch: number): void {
  rounded(g, b, Math.min(b.w, b.h / st) * 0.18, st);
  g.fillStyle = '#0d0e12';
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = white(0.1);
  g.stroke();
  g.save();
  g.clip();
  g.fillStyle = black(0.75);
  const r = pitch * 0.28;
  for (let row = 0, y = b.y + pitch * st * 0.6; y < b.y + b.h - pitch * st * 0.3; row++, y += pitch * st * 0.87) {
    for (let x = b.x + pitch * (row % 2 ? 1 : 0.5); x < b.x + b.w - pitch * 0.3; x += pitch) {
      disc(g, x, y, r, st);
      g.fill();
    }
  }
  g.restore();
}

/**
 * An analogue meter (the receiver's): an amber-lit face in box `b`, its scale over the needle's
 * sweep with a red zone at its top end, the needle resting at the left; drawn as on the screen
 * (`st` times longer along the track).
 */
function meter(g: CanvasRenderingContext2D, b: Box, st: number): void {
  g.save();
  g.translate(b.x, b.y);
  g.scale(1, st);
  const [w, h] = [b.w, b.h / st];
  g.beginPath();
  g.roundRect(0, 0, w, h, 2);
  const face = g.createLinearGradient(0, 0, 0, h);
  face.addColorStop(0, '#ffd58c');
  face.addColorStop(1, '#e59a3a');
  g.fillStyle = face;
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = '#c3c7cc';
  g.stroke();
  const [px, py, r] = [w / 2, h * 0.92, Math.min(w * 0.42, h * 0.72)];
  const at = (share: number, rr: number): [number, number] => {
    const a = ((-48 + 96 * share) * Math.PI) / 180;
    return [px + rr * Math.sin(a), py - rr * Math.cos(a)];
  };
  g.lineWidth = 0.8;
  g.strokeStyle = '#2a1a0c';
  g.beginPath();
  g.arc(px, py, r, ((-90 - 48) * Math.PI) / 180, ((-90 + 48) * Math.PI) / 180);
  g.stroke();
  for (let i = 0; i <= 10; i++) {
    const [x0, y0] = at(i / 10, r);
    const [x1, y1] = at(i / 10, r * (i % 5 === 0 ? 1.14 : 1.08));
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
  g.lineWidth = 2;
  g.strokeStyle = '#c0281c';
  g.beginPath();
  g.arc(px, py, r * 1.06, ((-90 + 24) * Math.PI) / 180, ((-90 + 48) * Math.PI) / 180);
  g.stroke();
  const [nx, ny] = at(0.06, r * 1.04);
  g.lineWidth = 1;
  g.strokeStyle = '#1d140c';
  g.beginPath();
  g.moveTo(px, py);
  g.lineTo(nx, ny);
  g.stroke();
  g.fillStyle = '#2a1a0c';
  g.fillRect(0, h * 0.88, w, h * 0.12);
  g.restore();
}

/**
 * NAJEON's pearl vine laid across the deck from x0 to x1, `thick` plane px deep about `cy`: the
 * frame's picture turned a quarter, as long as the strip (its proportions as on the screen).
 */
function vineAcross(g: CanvasRenderingContext2D, pic: Picture, x0: number, x1: number, cy: number, thick: number, st: number): void {
  const len = x1 - x0;
  // picture px per screen px, the vine as wide as the strip is deep on the screen
  const k = pic.width / (thick / st);
  g.save();
  g.beginPath();
  g.rect(x0, cy - thick / 2, len, thick);
  g.clip();
  g.translate(x0, cy + thick / 2);
  g.rotate(-Math.PI / 2);
  g.imageSmoothingQuality = 'high';
  for (let done = 0; done < len; ) {
    const part = Math.min(len - done, pic.height / k);
    g.drawImage(pic, 0, 0, pic.width, part * k, 0, done, thick, part);
    done += part;
  }
  g.restore();
}

/** A brass corner fitting at the deck's corner (x, y): an L of brass `size` across, its arms toward `side` (1 right, -1 left), two pins in it. */
function brassCorner(g: CanvasRenderingContext2D, x: number, y: number, size: number, st: number, side: 1 | -1): void {
  g.save();
  g.translate(x, y);
  g.scale(side, 1);
  const arm = size * 0.32;
  polygon(g, [
    [0, 0],
    [size, 0],
    [size, arm * st],
    [arm, arm * st],
    [arm, size * st],
    [0, size * st],
  ]);
  const grad = g.createLinearGradient(0, 0, size, size * st);
  grad.addColorStop(0, '#f0d79a');
  grad.addColorStop(0.5, BRASS);
  grad.addColorStop(1, '#6d4f1f');
  g.fillStyle = grad;
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = black(0.55);
  g.stroke();
  g.fillStyle = '#5a3f15';
  for (const [px, py] of [
    [size * 0.75, (arm * st) / 2],
    [arm / 2, size * 0.75 * st],
  ] as [number, number][]) {
    disc(g, px, py, arm * 0.16, st);
    g.fill();
  }
  g.restore();
}

/** STANDARD: smoked glass in a graphite trim with its cyan line; the glass jog dial, the game's name over a cyan light strip, a speaker grille. */
function standardPlate(g: CanvasRenderingContext2D, s: DeckSpec, art: GearArt): void {
  const st = s.stretch;
  const glass = g.createLinearGradient(0, 0, 0, s.room);
  glass.addColorStop(0, '#17191f');
  glass.addColorStop(1, '#0c0d11');
  g.fillStyle = glass;
  g.fillRect(0, 0, s.width, s.depth);
  // a faint sheen across the glass, slanting
  const lean = s.room * 0.5;
  for (const [x, w, a] of [
    [0.12, 0.08, 0.025],
    [0.62, 0.14, 0.02],
  ] as [number, number, number][]) {
    polygon(g, [
      [x * s.width, 0],
      [(x + w) * s.width, 0],
      [(x + w) * s.width - lean, s.room],
      [x * s.width - lean, s.room],
    ]);
    g.fillStyle = white(a);
    g.fill();
  }
  // the graphite trim along its top, the cyan line along its foot
  const trim = 5 * st;
  g.fillStyle = '#2a2c31';
  g.fillRect(0, 0, s.width, trim);
  g.fillStyle = white(0.1);
  g.fillRect(0, 0, s.width, 1);
  g.fillStyle = shade(CYAN, 1, 0.55);
  g.fillRect(0, trim - 1.2, s.width, 1.2);
  const band = bandOf(s, trim);
  if (!band) return;
  const { y, h, u, mid } = band;
  const jog = boxAt(s.width * 0.13, mid, u * 0.84, st);
  thing(g, art.jog, jog, (b) =>
    shadedDisc(g, b, [
      [0, '#3a3d45'],
      [1, '#101116'],
    ]),
  );
  g.beginPath();
  g.ellipse(jog.x + jog.w / 2, jog.y + jog.h / 2, jog.w / 2 + 2, jog.h / 2 + 2 * st, 0, 0, Math.PI * 2);
  g.lineWidth = 1.2;
  g.strokeStyle = shade(CYAN, 1, 0.45);
  g.stroke();
  text(g, 'GENERATIVE RHYTHM', s.width / 2, y + h * 0.4, Math.max(9, u * 0.15), st, white(0.32), { tracking: 4 });
  rounded(g, { x: s.width * 0.37, y: y + h * 0.62, w: s.width * 0.26, h: 2.4 * st }, 1.2, st);
  g.fillStyle = shade(CYAN, 1, 0.6);
  g.fill();
  grille(g, boxAt(s.width * 0.86, mid, s.width * 0.17, st, (u * 0.62) / (s.width * 0.17)), st, Math.max(5, u * 0.075));
}

/** One of the cabinet's acrylic buttons in box `b`: its picture, its dome tinted `tint` (the milky white is left as it is). */
function arcadeButton(g: CanvasRenderingContext2D, pic: Picture | undefined, b: Box, tint: string | null): void {
  thing(g, pic, b, (bb) => {
    shadedDisc(g, bb, [
      [0, '#d9dce1'],
      [0.5, '#7d828a'],
      [1, '#2d3036'],
    ]);
    shadedDisc(g, { x: bb.x + bb.w * 0.13, y: bb.y + bb.h * 0.13, w: bb.w * 0.74, h: bb.h * 0.74 }, [
      [0, '#f4f5f8'],
      [1, '#b9bcc4'],
    ]);
  });
  if (!tint) return;
  g.save();
  g.beginPath();
  g.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w * 0.37, b.h * 0.37, 0, 0, Math.PI * 2);
  g.clip();
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = tint;
  g.fillRect(b.x, b.y, b.w, b.h);
  g.restore();
}

/** CABINET: embossed black ABS under a chrome moulding; the joystick, six acrylic buttons, the start buttons, the credit windows and the coin entry. */
function cabinetPlate(g: CanvasRenderingContext2D, s: DeckSpec, art: GearArt): void {
  const st = s.stretch;
  material(g, art.plate, { x: 0, y: 0, w: s.width, h: s.depth }, PLATE_SCALE, st, '#17181b');
  const trim = 5 * st;
  const chrome = g.createLinearGradient(0, 0, 0, trim);
  chrome.addColorStop(0, '#3a3d43');
  chrome.addColorStop(0.45, '#8d9198');
  chrome.addColorStop(1, '#2b2d32');
  g.fillStyle = chrome;
  g.fillRect(0, 0, s.width, trim);
  g.fillStyle = black(0.6);
  g.fillRect(0, trim, s.width, 1.5);
  const band = bandOf(s, trim + 1.5);
  if (!band) return;
  const { y, h, u, mid } = band;
  thing(g, art.joystick, boxAt(s.width * 0.12, mid, u * 0.82, st), (b) => {
    shadedDisc(g, b, [
      [0, '#3a3c40'],
      [1, '#0b0b0c'],
    ]);
    shadedDisc(g, { x: b.x + b.w * 0.3, y: b.y + b.h * 0.3, w: b.w * 0.4, h: b.h * 0.4 }, [
      [0, '#ff8a80'],
      [1, '#8e0f0f'],
    ]);
  });
  // two rows of three, the lower one a little to the right, as fingers lie
  const tints: (string | null)[][] = [
    [LED_RED, AMBER, null],
    [null, LED_RED, AMBER],
  ];
  tints.forEach((row, r) =>
    row.forEach((tint, c) => arcadeButton(g, art.button, boxAt(s.width * (0.27 + c * 0.075 + r * 0.025), y + h * (r ? 0.73 : 0.29), u * 0.36, st), tint)),
  );
  // the start buttons, lit amber
  for (const cx of [0.555, 0.61]) {
    const b = boxAt(s.width * cx, y + h * 0.3, u * 0.26, st, 0.55);
    rounded(g, b, b.w * 0.18, st);
    g.fillStyle = '#0b0b0c';
    g.fill();
    rounded(g, { x: b.x + 2, y: b.y + 2 * st, w: b.w - 4, h: b.h - 4 * st }, b.w * 0.14, st);
    g.fillStyle = shade(AMBER, 1, 0.85);
    g.fill();
  }
  // the credit windows: smoked red seven-segment digits (their ghosts) and the model's name
  const wh = Math.min(h * 0.26, 16 * st);
  for (const cx of [0.555, 0.61]) {
    const ww = (wh / st) * 1.25 + 6;
    const wx = s.width * cx - ww / 2;
    const wy = y + h * 0.56;
    g.beginPath();
    g.roundRect(wx, wy, ww, wh, 2);
    g.fillStyle = '#0b0606';
    g.fill();
    g.fillStyle = 'rgba(255,42,42,0.16)';
    const dw = (wh / st) * 0.5;
    for (let i = 0; i < 2; i++) eight(g, wx + 3 + i * dw * 1.24, wy + wh * 0.16, dw, wh * 0.68);
  }
  text(g, 'GRG-2000', s.width * 0.5825, y + h * 0.9, Math.max(9, u * 0.12), st, white(0.6), { tracking: 1.5 });
  const coinAspect = art.coin ? art.coin.height / art.coin.width : 0.69;
  thing(g, art.coin, boxAt(s.width * 0.84, mid, Math.min(s.width * 0.24, (u * 0.84) / coinAspect), st, coinAspect), (b) => {
    rounded(g, b, b.w * 0.06, st);
    g.fillStyle = '#9da2a9';
    g.fill();
    for (const sx of [0.33, 0.67]) {
      g.fillStyle = '#16171a';
      g.fillRect(b.x + b.w * sx - b.w * 0.03, b.y + b.h * 0.25, b.w * 0.06, b.h * 0.5);
    }
  });
}

/** The receiver's tuning dial: black glass with an amber backlight, its scale and the red pointer, from x0 to x1. */
function tuningDial(g: CanvasRenderingContext2D, x0: number, x1: number, top: number, h: number): void {
  g.beginPath();
  g.roundRect(x0, top, x1 - x0, h, 3);
  g.fillStyle = '#0b0b0c';
  g.fill();
  const light = g.createLinearGradient(0, top, 0, top + h);
  light.addColorStop(0, shade(AMBER, 1, 0.42));
  light.addColorStop(1, shade(AMBER, 1, 0.16));
  g.fillStyle = light;
  g.fill();
  g.fillStyle = shade('#ffe2b0', 1, 0.85);
  const base = top + h * 0.62;
  for (let x = x0 + 10, i = 0; x < x1 - 8; x += 6, i++) {
    const long = i % 5 === 0;
    g.fillRect(x, base - (long ? h * 0.3 : h * 0.16), 0.9, long ? h * 0.3 : h * 0.16);
  }
  g.fillRect(x0 + 8, base, x1 - x0 - 16, 0.8);
  g.fillStyle = '#d22a1e';
  g.fillRect(x0 + (x1 - x0) * 0.62, top + 2, 1.6, h - 4);
  g.fillStyle = white(0.06);
  g.fillRect(x0 + 1, top + 1, x1 - x0 - 2, h * 0.4);
  g.lineWidth = 1;
  g.strokeStyle = black(0.6);
  g.stroke();
}

/** RECEIVER: a brushed silver faceplate; the tuning knob, the amber tuning dial, the selector switches under it, two meters and the volume knob, the model's name engraved. */
function receiverPlate(g: CanvasRenderingContext2D, s: DeckSpec, art: GearArt): void {
  const st = s.stretch;
  material(g, art.plate, { x: 0, y: 0, w: s.width, h: s.depth }, PLATE_SCALE, st, '#c3c7cc');
  const fall = g.createLinearGradient(0, 0, 0, s.room);
  fall.addColorStop(0, black(0));
  fall.addColorStop(1, black(0.16));
  g.fillStyle = fall;
  g.fillRect(0, 0, s.width, s.depth);
  // the recess along its top and the lit lip of the faceplate
  g.fillStyle = '#25262a';
  g.fillRect(0, 0, s.width, 2.5 * st);
  g.fillStyle = white(0.5);
  g.fillRect(0, 2.5 * st, s.width, 0.8);
  const band = bandOf(s, 3.3 * st);
  if (!band) return;
  const { y, h, u, mid } = band;
  const knob = (b: Box) =>
    shadedDisc(g, b, [
      [0, '#f1f3f5'],
      [1, '#8d939a'],
    ]);
  thing(g, art.knob, boxAt(s.width * 0.11, mid, u * 0.86, st), knob);
  tuningDial(g, s.width * 0.22, s.width * 0.62, y + h * 0.06, h * 0.38);
  // the selector switches, their lamps dark, at their picture's proportions
  const switchAspect = art.switch ? art.switch.height / art.switch.width : 1.15;
  for (let i = 0; i < 5; i++) {
    const b = boxAt(s.width * (0.27 + i * 0.075), y + h * 0.74, u * 0.17, st, switchAspect);
    rounded(g, { x: b.x - 1.5, y: b.y - 1.5 * st, w: b.w + 3, h: b.h + 3 * st }, b.w * 0.12, st);
    g.fillStyle = '#2b2c30';
    g.fill();
    thing(g, art.switch, b, (bb) => {
      rounded(g, bb, bb.w * 0.1, st);
      g.fillStyle = '#d8dbe0';
      g.fill();
    });
  }
  for (const x of [0.66, 0.775]) meter(g, { x: s.width * x, y: y + h * 0.06, w: s.width * 0.1, h: h * 0.58 }, st);
  thing(g, art.knob, boxAt(s.width * 0.935, y + h * 0.34, u * 0.42, st), knob);
  text(g, 'STEREO RECEIVER   SR-7', s.width * 0.8, y + h * 0.86, Math.max(8, u * 0.11), st, '#4b4f56', { tracking: 2.5, engraved: true });
}

/** NAJEON: a black lacquer chest front with a gold line along its top; brass corner fittings, the crane's lids, pearl vines and the brass lock plate between gold lines. */
function najeonPlate(g: CanvasRenderingContext2D, s: DeckSpec, art: GearArt): void {
  const st = s.stretch;
  const lacquer = g.createLinearGradient(0, 0, 0, s.room);
  lacquer.addColorStop(0, '#110f0d');
  lacquer.addColorStop(1, '#060505');
  g.fillStyle = lacquer;
  g.fillRect(0, 0, s.width, s.depth);
  const reflect = s.room * 0.42;
  const reflection = g.createLinearGradient(0, reflect - 12 * st, 0, reflect + 12 * st);
  reflection.addColorStop(0, white(0));
  reflection.addColorStop(0.5, white(0.045));
  reflection.addColorStop(1, white(0));
  g.fillStyle = reflection;
  g.fillRect(0, reflect - 12 * st, s.width, 24 * st);
  g.fillStyle = shade(BRASS, 1, 0.85);
  g.fillRect(0, 2 * st, s.width, 1.2);
  const band = bandOf(s, 3.5 * st);
  if (!band) return;
  const { u, mid } = band;
  // the corner fittings at the chest front's top corners, under the gold line
  const fitting = Math.min(u * 0.42, 40);
  brassCorner(g, 0, 5.5 * st, fitting, st, 1);
  brassCorner(g, s.width, 5.5 * st, fitting, st, -1);
  const lid = (b: Box) => {
    shadedDisc(g, b, [
      [0, '#1c1916'],
      [1, '#050404'],
    ]);
    g.lineWidth = 1.5;
    g.strokeStyle = shade(BRASS, 1, 0.9);
    g.stroke();
  };
  const lidSize = u * 0.8;
  thing(g, art.lid, boxAt(s.width * 0.18, mid, lidSize, st), lid);
  // the right one the left mirrored: the crane flies toward the middle on both
  g.save();
  g.translate(s.width * 0.82, 0);
  g.scale(-1, 1);
  thing(g, art.lid, boxAt(0, mid, lidSize, st), lid);
  g.restore();
  const lock = boxAt(s.width / 2, mid, u * 0.92, st);
  thing(g, art.lock, lock, (b) =>
    shadedDisc(g, b, [
      [0, '#e2c27a'],
      [1, '#6d4f1f'],
    ]),
  );
  // a pearl vine on each side of the lock, between gold double lines
  const thick = u * 0.22 * st;
  for (const [x0, x1] of [
    [s.width * 0.27, lock.x - 10],
    [lock.x + lock.w + 10, s.width * 0.73],
  ] as [number, number][]) {
    if (x1 - x0 < 12) continue;
    if (art.frame) vineAcross(g, art.frame, x0, x1, mid, thick, st);
    else {
      g.fillStyle = 'rgba(232,226,240,0.45)';
      g.fillRect(x0, mid - 1.5 * st, x1 - x0, 3 * st);
    }
    g.fillStyle = shade(BRASS, 1, 0.75);
    for (const dy of [-thick / 2 - 3 * st, thick / 2 + 2 * st]) g.fillRect(x0, mid + dy, x1 - x0, 0.9);
  }
}

const GEAR_PLATES: Record<GearStyle, (g: CanvasRenderingContext2D, s: DeckSpec, art: GearArt) => void> = {
  standard: standardPlate,
  cabinet: cabinetPlate,
  receiver: receiverPlate,
  najeon: najeonPlate,
};

/** Paints the plate of `style` on `g`, whose units are plane px: a gear from its pictures `art` (in code where one is missing). */
export function paintDeck(style: DeckStyle, g: CanvasRenderingContext2D, spec: DeckSpec, art: GearArt = {}): void {
  if (isGear(style)) GEAR_PLATES[style](g, spec, art);
  else PLATES[style](g, spec);
}

/**
 * How a gear's border looks: the two lines down the track's edges, from its far end past the gear
 * (the rails), in the gear's own frame (paintBorder). A skin's gear is as wide as the skin's rails, the
 * left one lit and the right one in shade; a picked gear paints its own frame (`paint`), as wide as
 * it is (`width`), one picture `tile` px long down the track, with a look of its own in FEVER (`lit`).
 */
export interface SideLook {
  /** The frame's face: a colour, or a paint that fills the strip's box (a picture). */
  body: string | ((g: CanvasRenderingContext2D, x: number, w: number, h: number) => void);
  /** Its bevel facing the lanes (#rrggbb); a glowing skin's rails glow in it. */
  edge: string;
  /** A line down its middle, the left border's and the right one's (a pinstripe, a neon tube), where it is wide enough. */
  line?: readonly [string, string];
  /** Faint lines across it (brushed metal). */
  brushed?: boolean;
  /** A gear's own frame: its width (plane px), one picture's length down the track, and its paint (the left frame; the right is it mirrored). */
  width?: number;
  tile?: number;
  paint?: (g: CanvasRenderingContext2D, w: number, h: number, scale: number, lit: boolean) => void;
  /** It looks otherwise in FEVER (paint's `lit`): the renderer keeps both pictures. */
  lit?: boolean;
}

/**
 * One border in `look` on a `w` × `h` canvas (a tile repeating down the track), `scale` canvas px to
 * a plane px: `side` -1 the left border (its right edge faces the lanes), 1 the right one.
 */
export function paintBorder(g: CanvasRenderingContext2D, w: number, h: number, look: SideLook, side: -1 | 1, scale: number, lit = false): void {
  if (look.paint) {
    g.save();
    if (side > 0) {
      g.translate(w, 0);
      g.scale(-1, 1);
    }
    look.paint(g, w, h, scale, lit);
    g.restore();
    // the right one a little in shade, the light coming from the left
    if (side > 0) {
      g.fillStyle = black(0.12);
      g.fillRect(0, 0, w, h);
    }
    return;
  }
  if (typeof look.body === 'string') {
    g.fillStyle = look.body;
    g.fillRect(0, 0, w, h);
  } else {
    look.body(g, 0, w, h);
  }
  if (look.brushed) {
    const rand = seeded(side < 0 ? 13 : 14);
    for (let y = 0; y < h; y += 2 * scale) {
      g.fillStyle = white(0.015 + rand() * 0.03);
      g.fillRect(0, y, w, scale);
    }
  }
  if (side > 0) {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 0, w, h);
  }
  const line = look.line?.[side < 0 ? 0 : 1];
  if (line && w >= 4 * scale) {
    g.fillStyle = line;
    g.fillRect(w / 2 - 0.6 * scale, 0, 1.2 * scale, h);
  }
  // the bevel facing the lanes, lit (a little light over it, so a dark frame still marks the track's edge); a dark line facing out
  const inner = side < 0 ? w - scale : 0;
  g.fillStyle = shade(look.edge, side < 0 ? 1 : 0.72, 0.9);
  g.fillRect(inner, 0, scale, h);
  g.fillStyle = white(0.14);
  g.fillRect(inner, 0, scale, h);
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(side < 0 ? 0 : w - scale, 0, scale, h);
}

/** A trim down the frame's inner edge, `px` plane px wide: `stops` across it from outside in. */
function trim(g: CanvasRenderingContext2D, w: number, h: number, px: number, scale: number, stops: [number, string][]): void {
  const x = w - px * scale;
  const grad = g.createLinearGradient(x, 0, w, 0);
  for (const [at, c] of stops) grad.addColorStop(at, c);
  g.fillStyle = grad;
  g.fillRect(x, 0, px * scale, h);
}

/** The picture `pic` stretched over the whole tile, or `colour` without it. */
function fill(g: CanvasRenderingContext2D, pic: Picture | undefined, w: number, h: number, colour: string): void {
  g.fillStyle = colour;
  g.fillRect(0, 0, w, h);
  if (!pic) return;
  g.imageSmoothingQuality = 'high';
  g.drawImage(pic, 0, 0, w, h);
}

/** How wide NAJEON's pearl vine is down its frame (plane px), between its gold lines. */
const NAJEON_VINE = 21;

/** Each gear's frame, from its pictures (in code where one is missing). */
const GEAR_FRAMES: Record<GearStyle, (art: GearArt) => SideLook> = {
  // brushed graphite with the cyan line down its inner edge
  standard: (art) => ({
    body: '#2a2c31',
    edge: CYAN,
    width: 14,
    tile: 56,
    lit: true,
    paint: (g, w, h, k, lit) => {
      fill(g, art.frame, w, h, '#2a2c31');
      g.fillStyle = black(0.55);
      g.fillRect(0, 0, k, h);
      g.fillStyle = white(0.1);
      g.fillRect(w - 4.5 * k, 0, k, h);
      g.fillStyle = shade(CYAN, 1, lit ? 0.35 : 0.18);
      g.fillRect(w - 3.6 * k, 0, 2.4 * k, h);
      g.fillStyle = shade(CYAN, lit ? 1.15 : 1, lit ? 1 : 0.85);
      g.fillRect(w - 3 * k, 0, 1.2 * k, h);
    },
  }),
  // the cabinet's ABS side panel, a chrome trim along the lanes, an amber LED in its middle (lit in FEVER)
  cabinet: (art) => ({
    body: '#17181b',
    edge: '#8d9198',
    width: 28,
    tile: 30,
    lit: true,
    paint: (g, w, h, k, lit) => {
      g.fillStyle = '#17181b';
      g.fillRect(0, 0, w, h);
      if (art.plate) {
        // the plate's ABS at the plate's grain (PLATE_SCALE plane px to a picture px)
        const px = PLATE_SCALE * k;
        g.imageSmoothingQuality = 'high';
        g.drawImage(art.plate, 0, 0, Math.min(art.plate.width, w / px), Math.min(art.plate.height, h / px), 0, 0, w, h);
      }
      g.fillStyle = black(0.6);
      g.fillRect(0, 0, 1.5 * k, h);
      trim(g, w, h, 4, k, [
        [0, '#2b2d32'],
        [0.4, '#9a9ea6'],
        [0.7, '#5c6067'],
        [1, '#24262a'],
      ]);
      const [cx, cy, r] = [(w - 4 * k) / 2, h / 2, 3.1 * k];
      g.beginPath();
      g.arc(cx, cy, r * 1.45, 0, Math.PI * 2);
      g.fillStyle = '#0a0a0b';
      g.fill();
      const lens = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
      lens.addColorStop(0, lit ? '#fff1c8' : '#7a5414');
      lens.addColorStop(0.5, lit ? '#ffb000' : '#3d2706');
      lens.addColorStop(1, lit ? '#c46a00' : '#1d1203');
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fillStyle = lens;
      g.fill();
      if (lit) {
        const halo = g.createRadialGradient(cx, cy, r, cx, cy, r * 2.6);
        halo.addColorStop(0, 'rgba(255,176,0,0.35)');
        halo.addColorStop(1, 'rgba(255,176,0,0)');
        g.fillStyle = halo;
        g.fillRect(cx - r * 2.6, cy - r * 2.6, r * 5.2, r * 5.2);
      }
    },
  }),
  // walnut, a brushed aluminium trim along the lanes (warm amber in FEVER, as the dial's light)
  receiver: (art) => ({
    body: '#4f2f1c',
    edge: '#c3c7cc',
    width: 30,
    tile: 60,
    lit: true,
    paint: (g, w, h, k, lit) => {
      fill(g, art.frame, w, h, '#4f2f1c');
      g.fillStyle = black(0.55);
      g.fillRect(0, 0, 1.2 * k, h);
      trim(g, w, h, 4.5, k, [
        [0, '#2a2b2e'],
        [0.2, lit ? '#ffd59a' : '#e6e9ed'],
        [0.65, lit ? '#d9902e' : '#a2a7ae'],
        [1, '#3a3c40'],
      ]);
    },
  }),
  // black lacquer, a pearl vine inlaid down its middle between two gold lines (the pearl brighter in FEVER)
  najeon: (art) => ({
    body: '#0b0a09',
    edge: BRASS,
    width: 30,
    tile: art.frame ? Math.round((NAJEON_VINE * art.frame.height) / art.frame.width) : 48,
    lit: true,
    paint: (g, w, h, k, lit) => {
      const lacquer = g.createLinearGradient(0, 0, w, 0);
      lacquer.addColorStop(0, '#050404');
      lacquer.addColorStop(0.5, '#15120f');
      lacquer.addColorStop(1, '#070606');
      g.fillStyle = lacquer;
      g.fillRect(0, 0, w, h);
      const [x, vw] = [(w - NAJEON_VINE * k) / 2, NAJEON_VINE * k];
      if (art.frame) {
        g.imageSmoothingQuality = 'high';
        g.drawImage(art.frame, x, 0, vw, h);
        if (lit) {
          // the pearl lit, the lacquer still black
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = 0.45;
          g.drawImage(art.frame, x, 0, vw, h);
          g.globalAlpha = 1;
          g.globalCompositeOperation = 'source-over';
        }
      } else {
        g.fillStyle = lit ? 'rgba(240,234,246,0.75)' : 'rgba(232,226,240,0.45)';
        g.fillRect(w / 2 - k, 0, 2 * k, h);
      }
      g.fillStyle = shade(BRASS, lit ? 1.25 : 1, 0.9);
      g.fillRect(x - 1.8 * k, 0, 0.8 * k, h);
      g.fillRect(x + vw + k, 0, 0.8 * k, h);
      g.fillStyle = black(0.6);
      g.fillRect(0, 0, k, h);
    },
  }),
};

/** A gear's frame from its pictures `art` (in code where one is missing). */
export function gearBorderLook(style: GearStyle, art: GearArt): SideLook {
  return GEAR_FRAMES[style](art);
}

/** The border of a gear drawn in code (the skins' LINE and STEM in their plates' colours, a picked gear without its pictures). */
export function codeBorderLook(style: DeckStyle, colours: SkinColors): SideLook {
  return isGear(style) ? GEAR_FRAMES[style]({}) : CODE_SIDES[style](colours);
}

/** The borders of the skins' gears, in their plates' colours. */
const CODE_SIDES: Record<'line' | 'stem', (c: SkinColors) => SideLook> = {
  line: (c) => ({ body: shade(c.trackFar, 0.7), edge: c.divider, line: [shade(c.railLeft, 1, 0.8), shade(c.railRight, 1, 0.8)] }),
  stem: (c) => ({ body: shade(c.trackFar, 0.7), edge: c.divider }),
};

/**
 * A lane's light at rest and lit, in a picture as large as its place in the row (lane width by
 * the row's depth, square px). Most rest dim in the lane colour mixed into black; a few rest in
 * a colour of their own (`idleColor`) and take the lane colour only when lit.
 */
export interface KeyPaint {
  /** `mark`: the lane's mark, for designs whose lights carry it. */
  idle: (kind: KeyKind, stretch: number, mark?: NoteMark) => Paint;
  down: (kind: KeyKind, stretch: number, mark?: NoteMark) => Paint;
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

/** The gears with a light per lane: the skins' own. */
export type LightStyle = Exclude<DeckStyle, GearStyle>;

export const KEY_PAINT: Record<LightStyle, KeyPaint> = {
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
};

/** A gear's lights per lane: the skins' gears have them, the four a player picks none. */
export const lightsOf = (style: DeckStyle): KeyPaint | null => (isGear(style) ? null : KEY_PAINT[style]);

/** How far a hexagon light (the reference for every row) reaches from its row's middle toward the judge line. */
export function referenceReach(w: number, h: number, st: number): number {
  const { r } = fit(w, h, st, 0.3);
  return r * st * Math.cos(Math.PI / 6) + Math.max(1.5, r * 0.1) / 2;
}

/**
 * How much lower than usual a row of `style`'s lights lies (px, a row `depth` deep stretched
 * `stretch`), so that no light comes nearer the judge line than a reference hexagon in its lane:
 * larger lights keep their size and lie lower; those no larger, where they were.
 */
export function rowDrop(style: LightStyle, lanes: readonly Pick<DeckLane, 'kind' | 'width'>[], depth: number, stretch: number): number {
  const paint = KEY_PAINT[style];
  return Math.max(0, ...lanes.map((l) => paint.reach(l.kind, l.width, depth, stretch) - referenceReach(l.width, depth, stretch)));
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
 * shadow follows a bar's shape, as KEY_PAINT's round halo cannot).
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

export const SIDE_PAINT: Record<LightStyle, SidePaint> = {
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
};
