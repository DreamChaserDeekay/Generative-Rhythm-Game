import type { SkinColors } from './skins';
import { ink, tone, type NoteMark, type Paint } from './tintArt';

/**
 * The gear: the track's frame down its edges and, under the judge line, a plate with a light per
 * lane in the lane's colour that lights while its key is down (a tint picture, see tintArt). LINE
 * (LED bars) and STEM (instrument dots) are skins' own, drawn here in code. The four a player picks
 * (설정 → 기어, GEAR_STYLES) are each one object, drawn from its pictures where they loaded
 * (render/styleArt.ts) and in code where not:
 *
 * - STANDARD (기본): the game's own controller, graphite rails with a cyan line, smoked glass pads,
 *   a glass jog disc;
 * - CABINET (오락실 기체): an arcade cabinet's control deck, embossed black ABS with chrome, acrylic
 *   buttons, a turntable, amber LEDs down its side panels that light in FEVER;
 * - RECEIVER (빈티지 리시버): a 1970s stereo receiver, walnut sides, a brushed silver faceplate with
 *   piano-key switches whose lamps light, a tuning knob, an amber tuning dial;
 * - NAJEON (나전칠기): black lacquer inlaid with mother-of-pearl, a pearl tablet per key, a crane on
 *   the scratch's lid, a brass lock plate.
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

/** The side bars' sockets on the plate: `b` grown by `pad` px all round (as much along the track on the screen). */
function sideSockets(s: DeckSpec, share: number, pad: number, draw: (b: Box) => void): void {
  for (const side of s.sides) {
    const b = barBox(side.left, side.top, side.width, side.depth, share);
    draw({ x: b.x - pad, y: b.y - pad * s.stretch, w: b.w + 2 * pad, h: b.h + 2 * pad * s.stretch });
  }
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

/** A gear's pictures by part (render/styleArt.ts loads them); a part whose picture is missing is drawn in code. */
export interface GearArt {
  /** The plate's material, tiled across it. */
  plate?: Picture;
  /** The frame's material down the track's edges. */
  frame?: Picture;
  /** A key's body seen from above, drawn in its box (keyBox). */
  key?: Picture;
  /** The scratch's module seen from above (round, in the scratch lane's column: moduleBox). */
  scratch?: Picture;
  /** NAJEON's lock plate under the row. */
  badge?: Picture;
}

/** How a gear's key body lies in its lane's place in the row: a disc, or a rectangle with round corners `radius` of its shorter side, `aspect` deep for its width. */
type KeyShape = { kind: 'disc'; share: number } | { kind: 'rect'; share: number; aspect: number; radius: number };

// the rectangles' proportions are their pictures' (scripts/assets/build_gears.py)
const KEY_SHAPES: Record<GearStyle, KeyShape> = {
  standard: { kind: 'rect', share: 0.8, aspect: 1.02, radius: 0.2 },
  cabinet: { kind: 'disc', share: 0.4 },
  receiver: { kind: 'rect', share: 0.62, aspect: 1.15, radius: 0.1 },
  najeon: { kind: 'rect', share: 0.72, aspect: 1.05, radius: 0.3 },
};

/**
 * Where a gear's key body lies in its lane's place in the row (`w` × `h` px, round things `st`
 * times longer along the track): `share` of the lane wide, as deep as its shape is on the screen,
 * no deeper than the row; the plate draws the body there and the light lies over it.
 */
export function keyBox(gear: GearStyle, w: number, h: number, st: number): Box {
  const k = KEY_SHAPES[gear];
  if (k.kind === 'disc') {
    const r = Math.min(w * k.share, (h / 2 / st) * 0.94);
    return { x: w / 2 - r, y: h / 2 - r * st, w: 2 * r, h: 2 * r * st };
  }
  let bw = w * k.share;
  let bh = bw * k.aspect * st;
  if (bh > h * 0.94) {
    bh = h * 0.94;
    bw = bh / k.aspect / st;
  }
  return { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh };
}

/** A key body's outline in its box, `grow` px larger all round (as much along the track on the screen). */
function keyPath(gear: GearStyle, g: CanvasRenderingContext2D, b: Box, st: number, grow = 0): void {
  const k = KEY_SHAPES[gear];
  const bb = { x: b.x - grow, y: b.y - grow * st, w: b.w + 2 * grow, h: b.h + 2 * grow * st };
  if (k.kind === 'disc') {
    g.beginPath();
    g.ellipse(bb.x + bb.w / 2, bb.y + bb.h / 2, bb.w / 2, bb.h / 2, 0, 0, Math.PI * 2);
  } else {
    rounded(g, bb, Math.min(bb.w, bb.h / st) * k.radius, st);
  }
}

/**
 * A module in the scratch lane's column (plane px), `aspect` deep for its width in its picture: as
 * wide as the column lets it be and as deep as that looks on the screen, no deeper than the room
 * under the deck's top edge; in the middle of that room when the column is narrower (it stands beside
 * the keys and what lies under them).
 */
export function moduleBox(aspect: number): (room: number, stretch: number, lane: Pick<DeckLane, 'left' | 'width'>) => Box {
  return (room, stretch, lane) => {
    const top = 4;
    let w = Math.max(8, lane.width - 6);
    let h = w * aspect * stretch;
    const fit = Math.max(8, room - top - 4);
    if (h > fit) {
      h = fit;
      w = h / aspect / stretch;
    }
    return { x: lane.left + (lane.width - w) / 2, y: top + (fit - h) / 2, w, h };
  };
}

const roundModule = moduleBox(1);

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

/** Each key lane's body: its picture in its box, or `code` drawing it there. */
function keyBodies(gear: GearStyle, g: CanvasRenderingContext2D, s: DeckSpec, pic: Picture | undefined, code: (b: Box) => void, socket?: (b: Box) => void): void {
  for (const l of s.lanes) {
    if (l.kind === 'scratch') continue;
    const k = keyBox(gear, l.width, s.keyDepth, s.stretch);
    const b = { x: l.left + k.x, y: s.keyTop + k.y, w: k.w, h: k.h };
    socket?.(b);
    if (pic) picture(g, pic, b);
    else code(b);
  }
}

/** The scratch's module in its lane's column: its picture, or `code` drawing it. Its box, or null without a scratch lane. */
function scratchModule(g: CanvasRenderingContext2D, s: DeckSpec, pic: Picture | undefined, code: (b: Box) => void): Box | null {
  const lane = s.lanes.find((l) => l.kind === 'scratch');
  if (!lane) return null;
  const b = roundModule(s.room, s.stretch, lane);
  if (pic) picture(g, pic, b);
  else code(b);
  return b;
}

/** Where the plate's lower part may go across: past the scratch's column, `margin` in from the sides. */
function lowerSpan(s: DeckSpec, margin: number): [number, number] {
  const scratch = s.lanes.find((l) => l.kind === 'scratch');
  return [scratch ? scratch.left + scratch.width + margin : margin, s.width - margin];
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

/** STANDARD: smoked glass over graphite, a pad in each lane, a glass jog disc, the game's name engraved small under the row. */
function standardPlate(g: CanvasRenderingContext2D, s: DeckSpec, art: GearArt): void {
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
  g.fillStyle = white(0.09);
  g.fillRect(0, 0, s.width, EDGE);
  g.fillStyle = shade(CYAN, 1, 0.3);
  g.fillRect(0, 3, s.width, 1);
  keyBodies(
    'standard',
    g,
    s,
    art.key,
    (b) => {
      keyPath('standard', g, b, s.stretch);
      const grad = g.createLinearGradient(0, b.y, 0, b.y + b.h);
      grad.addColorStop(0, '#2a2d35');
      grad.addColorStop(1, '#15171c');
      g.fillStyle = grad;
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = white(0.12);
      g.stroke();
    },
    (b) => {
      keyPath('standard', g, b, s.stretch, 1.5);
      g.fillStyle = black(0.55);
      g.fill();
    },
  );
  sideSockets(s, 0.6, 1.5, (b) => {
    rounded(g, b, b.h / 2 / s.stretch, s.stretch);
    g.fillStyle = '#08090c';
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = shade(CYAN, 1, 0.22);
    g.stroke();
  });
  scratchModule(g, s, art.scratch, (b) => {
    shadedDisc(g, b, [
      [0, '#3a3d45'],
      [1, '#101116'],
    ]);
  });
  if (lowerRoom(s) < 24) return;
  const [x0, x1] = lowerSpan(s, 16);
  text(g, 'GENERATIVE RHYTHM', (x0 + x1) / 2, lowerTop(s) + Math.min(lowerRoom(s) * 0.45, 26), 10, s.stretch, white(0.24), { tracking: 3 });
}

/** CABINET: embossed black ABS under a chrome moulding, a domed acrylic button in each lane in its socket, the turntable, two LED readouts and the model's name. */
function cabinetPlate(g: CanvasRenderingContext2D, s: DeckSpec, art: GearArt): void {
  material(g, art.plate, { x: 0, y: 0, w: s.width, h: s.depth }, PLATE_SCALE, s.stretch, '#17181b');
  // a chrome moulding under the judge line, kept dim: nothing bright may read as a second line
  const chrome = g.createLinearGradient(0, 0, 0, 5);
  chrome.addColorStop(0, '#3a3d43');
  chrome.addColorStop(0.45, '#8d9198');
  chrome.addColorStop(1, '#2b2d32');
  g.fillStyle = chrome;
  g.fillRect(0, 0, s.width, 5);
  g.fillStyle = black(0.6);
  g.fillRect(0, 5, s.width, 1.5);
  keyBodies(
    'cabinet',
    g,
    s,
    art.key,
    (b) => {
      shadedDisc(g, b, [
        [0, '#d9dce1'],
        [0.5, '#7d828a'],
        [1, '#2d3036'],
      ]);
      const inner = { x: b.x + b.w * 0.13, y: b.y + b.h * 0.13, w: b.w * 0.74, h: b.h * 0.74 };
      shadedDisc(g, inner, [
        [0, '#f4f5f8'],
        [1, '#b9bcc4'],
      ]);
    },
    (b) => {
      keyPath('cabinet', g, b, s.stretch, b.w * 0.06);
      g.fillStyle = black(0.7);
      g.fill();
    },
  );
  sideSockets(s, 0.7, 2, (b) => {
    rounded(g, b, (b.h / s.stretch) * 0.4, s.stretch);
    g.fillStyle = '#0b0c0e';
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = '#7d828a';
    g.stroke();
  });
  const tt = scratchModule(g, s, art.scratch, (b) => {
    shadedDisc(g, b, [
      [0, '#c8ccd2'],
      [1, '#55595f'],
    ]);
    shadedDisc(g, { x: b.x + b.w * 0.08, y: b.y + b.h * 0.08, w: b.w * 0.84, h: b.h * 0.84 }, [
      [0, '#25262a'],
      [1, '#0b0b0c'],
    ]);
  });
  if (tt) {
    // the turntable's red LED ring, dark at rest
    g.beginPath();
    g.ellipse(tt.x + tt.w / 2, tt.y + tt.h / 2, tt.w / 2 + 2, tt.h / 2 + 2 * s.stretch, 0, 0, Math.PI * 2);
    g.lineWidth = 1.6;
    g.strokeStyle = 'rgba(120,20,20,0.9)';
    g.stroke();
  }
  if (lowerRoom(s) < 30) return;
  const [x0, x1] = lowerSpan(s, 16);
  const mid = (x0 + x1) / 2;
  const top = lowerTop(s) + 10;
  const h = Math.min(18 * s.stretch, lowerRoom(s) - 26);
  if (h >= 10) {
    // two smoked windows of red seven-segment digits (their ghosts: the gear shows no numbers)
    for (const [cx, digits] of [
      [mid - 46, 3],
      [mid + 46, 3],
    ] as [number, number][]) {
      const w = digits * (h / s.stretch) * 0.62 + 12;
      g.beginPath();
      g.roundRect(cx - w / 2, top, w, h, 2);
      g.fillStyle = '#0b0606';
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = '#2f3136';
      g.stroke();
      g.fillStyle = 'rgba(255,42,42,0.13)';
      const dw = (h / s.stretch) * 0.5;
      for (let i = 0; i < digits; i++) eight(g, cx - w / 2 + 6 + i * (dw * 1.24), top + h * 0.16, dw, h * 0.68);
    }
  }
  text(g, 'GRG-2000', mid, top + Math.max(h, 0) + 10 * s.stretch, 11, s.stretch, white(0.6), { tracking: 1.5 });
}

/** RECEIVER: a brushed silver faceplate, a piano-key switch in each lane in its slot, the tuning knob, the amber tuning dial and the model's name engraved. */
function receiverPlate(g: CanvasRenderingContext2D, s: DeckSpec, art: GearArt): void {
  material(g, art.plate, { x: 0, y: 0, w: s.width, h: s.depth }, PLATE_SCALE, s.stretch, '#c3c7cc');
  const fall = g.createLinearGradient(0, 0, 0, s.room);
  fall.addColorStop(0, black(0));
  fall.addColorStop(1, black(0.16));
  g.fillStyle = fall;
  g.fillRect(0, 0, s.width, s.depth);
  // the recess under the judge line and the lit lip of the faceplate
  g.fillStyle = '#25262a';
  g.fillRect(0, 0, s.width, 2.5);
  g.fillStyle = white(0.5);
  g.fillRect(0, 2.5, s.width, 0.8);
  keyBodies(
    'receiver',
    g,
    s,
    art.key,
    (b) => {
      keyPath('receiver', g, b, s.stretch);
      const grad = g.createLinearGradient(b.x, 0, b.x + b.w, 0);
      grad.addColorStop(0, '#e6e9ed');
      grad.addColorStop(1, '#9ca1a8');
      g.fillStyle = grad;
      g.fill();
      const { x, y, r } = lampSpot(b);
      disc(g, x, y, r * 1.5, s.stretch);
      g.fillStyle = '#2a2b2e';
      g.fill();
    },
    (b) => {
      keyPath('receiver', g, b, s.stretch, 2);
      g.fillStyle = '#2b2c30';
      g.fill();
    },
  );
  sideSockets(s, 0.6, 2, (b) => {
    rounded(g, b, (b.h / s.stretch) * 0.25, s.stretch);
    g.fillStyle = '#2b2c30';
    g.fill();
  });
  scratchModule(g, s, art.scratch, (b) => {
    shadedDisc(g, b, [
      [0, '#f1f3f5'],
      [1, '#8d939a'],
    ]);
  });
  if (lowerRoom(s) < 30) return;
  const [x0, x1] = lowerSpan(s, 18);
  const top = lowerTop(s) + 9;
  const h = Math.min(30 * s.stretch, lowerRoom(s) - 24);
  if (h >= 12) {
    // the tuning dial: black glass, an amber backlight, its scale and the red pointer
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
  text(g, 'STEREO RECEIVER   SR-7', (x0 + x1) / 2, top + Math.max(h, 0) + 9 * s.stretch, 10, s.stretch, '#4b4f56', { tracking: 2.5, engraved: true });
}

/** NAJEON: black lacquer with a long soft reflection, a gold line under the judge line, a pearl tablet in each lane, the crane's lid, the brass lock plate between gold lines. */
function najeonPlate(g: CanvasRenderingContext2D, s: DeckSpec, art: GearArt): void {
  const lacquer = g.createLinearGradient(0, 0, 0, s.room);
  lacquer.addColorStop(0, '#110f0d');
  lacquer.addColorStop(1, '#060505');
  g.fillStyle = lacquer;
  g.fillRect(0, 0, s.width, s.depth);
  const band = s.room * 0.42;
  const reflection = g.createLinearGradient(0, band - 12 * s.stretch, 0, band + 12 * s.stretch);
  reflection.addColorStop(0, white(0));
  reflection.addColorStop(0.5, white(0.045));
  reflection.addColorStop(1, white(0));
  g.fillStyle = reflection;
  g.fillRect(0, band - 12 * s.stretch, s.width, 24 * s.stretch);
  g.fillStyle = shade(BRASS, 1, 0.75);
  g.fillRect(0, 2, s.width, 1);
  keyBodies(
    'najeon',
    g,
    s,
    art.key,
    (b) => {
      keyPath('najeon', g, b, s.stretch);
      const grad = g.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
      grad.addColorStop(0, '#f3eef6');
      grad.addColorStop(0.4, '#d9e8e6');
      grad.addColorStop(0.7, '#ecd9e6');
      grad.addColorStop(1, '#bfc9d8');
      g.fillStyle = grad;
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = shade(BRASS, 1, 0.9);
      g.stroke();
    },
    (b) => {
      keyPath('najeon', g, b, s.stretch, 1.5);
      g.fillStyle = black(0.6);
      g.fill();
    },
  );
  sideSockets(s, 0.6, 1.5, (b) => {
    rounded(g, b, (b.h / s.stretch) * 0.3, s.stretch);
    g.fillStyle = '#050404';
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = shade(BRASS, 1, 0.6);
    g.stroke();
  });
  scratchModule(g, s, art.scratch, (b) => {
    shadedDisc(g, b, [
      [0, '#1c1916'],
      [1, '#050404'],
    ]);
    g.lineWidth = 1.5;
    g.strokeStyle = shade(BRASS, 1, 0.9);
    g.stroke();
  });
  if (lowerRoom(s) < 26) return;
  const [x0, x1] = lowerSpan(s, 18);
  const mid = (x0 + x1) / 2;
  const cy = lowerTop(s) + Math.min(lowerRoom(s) / 2, 44 * s.stretch);
  const size = Math.min(lowerRoom(s) - 12, 62 * s.stretch);
  const lock = { x: mid - size / s.stretch / 2, y: cy - size / 2, w: size / s.stretch, h: size };
  if (art.badge) picture(g, art.badge, lock);
  else {
    shadedDisc(g, lock, [
      [0, '#e2c27a'],
      [1, '#6d4f1f'],
    ]);
  }
  // gold double lines out from the lock plate
  g.fillStyle = shade(BRASS, 1, 0.65);
  for (const [a, b] of [
    [x0, lock.x - 10],
    [lock.x + lock.w + 10, x1],
  ] as [number, number][]) {
    if (b - a < 12) continue;
    g.fillRect(a, cy - 2, b - a, 0.9);
    g.fillRect(a, cy + 1.2, b - a, 0.9);
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
  /**
   * Where the scratch's light lies when it is not in the row: over the module the plate draws in
   * its lane (plane px from the deck's top left, for `room` of it on the screen and round things
   * drawn `stretch` times longer along the track).
   */
  scratchBox?: (room: number, stretch: number, lane: Pick<DeckLane, 'left' | 'width'>) => Box;
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

/** A tint fill over the path that is set: the lane's colour, white at `heart` toward the middle of box `b`. */
function litFill(g: CanvasRenderingContext2D, b: Box, st: number, heart: number, alpha: number): void {
  g.save();
  g.clip();
  g.translate(b.x + b.w / 2, b.y + b.h / 2);
  g.scale(1, st);
  const r = Math.max(b.w, b.h / st) / 2;
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
  grad.addColorStop(0, ink(1, heart, alpha));
  grad.addColorStop(1, ink(1, 0.05, alpha));
  g.fillStyle = grad;
  g.fillRect(-r, -r, 2 * r, 2 * r);
  g.restore();
}

/** Where the receiver's lamp window lies on a switch in box `b` (its picture's glass, measured). */
function lampSpot(b: Box): { x: number; y: number; r: number } {
  return { x: b.x + b.w * 0.491, y: b.y + b.h * 0.262, r: b.w * 0.075 };
}

/** The receiver's lamp: its window near the top of the switch, lit or dim in the lane's colour. */
function lamp(g: CanvasRenderingContext2D, b: Box, st: number, lit: boolean): void {
  const { x, y, r } = lampSpot(b);
  if (lit) halo(g, x, y, Math.min(r * 2.2, b.w / 2 / 1.7), st, 0.9);
  disc(g, x, y, r, st);
  g.fillStyle = lit ? ink(1, 0.65) : ink(0.45, 0, 0.55);
  g.fill();
}

/** A ring of light round the scratch's module (its box `w` × `h`). */
function moduleRing(g: CanvasRenderingContext2D, w: number, h: number, alpha: number, width: number): void {
  g.beginPath();
  g.ellipse(w / 2, h / 2, w / 2 - width / 2, h / 2 - (width / 2) * (h / w), 0, 0, Math.PI * 2);
  g.shadowColor = ink(1, 0.2, alpha * 0.8);
  g.shadowBlur = width * 2.5;
  g.lineWidth = width;
  g.strokeStyle = ink(1, 0.35, alpha);
  g.stroke();
  g.shadowBlur = 0;
}

/** A gear's lights: over each key body (keyBox) and round the scratch's module (moduleBox). */
function gearKeys(gear: GearStyle): KeyPaint {
  return {
    idle: (kind, st) => (g, w, h) => {
      if (kind === 'scratch') {
        // the cabinet's turntable keeps its LED ring dim in the scratch's colour
        if (gear === 'cabinet') moduleRing(g, w, h, 0.35, Math.max(1.5, w * 0.018));
        return;
      }
      const b = keyBox(gear, w, h, st);
      if (gear === 'cabinet') {
        // the milky dome tinted with the lane's colour, inside its chrome bezel
        keyPath(gear, g, b, st, -b.w * 0.13);
        g.fillStyle = ink(1, 0.3, 0.3);
        g.fill();
      } else if (gear === 'receiver') {
        lamp(g, b, st, false);
      } else if (gear === 'standard') {
        // a thin line of the lane's colour along the pad's top edge
        rounded(g, { x: b.x + b.w * 0.18, y: b.y + b.h * 0.07, w: b.w * 0.64, h: Math.max(1.5, b.h * 0.05) }, b.h * 0.025, st);
        g.fillStyle = ink(0.8, 0, 0.75);
        g.fill();
      }
    },
    down: (kind, st) => (g, w, h) => {
      if (kind === 'scratch') return moduleRing(g, w, h, 1, Math.max(2, w * 0.03));
      const b = keyBox(gear, w, h, st);
      if (gear === 'receiver') {
        // the lamp lit and the switch's face washed with its light
        keyPath(gear, g, b, st);
        litFill(g, b, st, 0.45, 0.5);
        lamp(g, b, st, true);
        return;
      }
      // the glow fades out inside the lane's place in the row (its picture's edges would cut it square)
      halo(g, b.x + b.w / 2, b.y + b.h / 2, Math.min(b.w / 2, b.h / st / 2, w / 2 / 1.7, h / st / 2 / 1.7), st, 0.5);
      keyPath(gear, g, b, st, gear === 'cabinet' ? -b.w * 0.13 : 0);
      litFill(g, b, st, gear === 'najeon' ? 0.55 : 0.75, gear === 'najeon' ? 0.72 : 0.92);
    },
    reach: (kind, w, h, st) => (kind === 'scratch' ? 0 : keyBox(gear, w, h, st).h / 2 + 1.5),
    scratchBox: roundModule,
  };
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
  standard: gearKeys('standard'),
  cabinet: gearKeys('cabinet'),
  receiver: gearKeys('receiver'),
  najeon: gearKeys('najeon'),
};

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
export function rowDrop(style: DeckStyle, lanes: readonly Pick<DeckLane, 'kind' | 'width'>[], depth: number, stretch: number): number {
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

/** A picked gear's side bar: in its socket on the plate (sideSockets, `share` of the row), only its ends at rest, lit whole. */
function gearSide(share: number, corner: number): SidePaint {
  return {
    idle: (st) => (g, w, h) => {
      const b = barBox(0, 0, w, h, share);
      ends(g, w, h, b, () => {
        rounded(g, b, (b.h / st) * corner, st);
        g.fillStyle = ink(0.45, 0, 0.8);
        g.fill();
      });
    },
    down: (st) => (g, w, h) => {
      const b = barBox(0, 0, w, h, share);
      glow(g, 0.6, h * 0.45);
      rounded(g, b, (b.h / st) * corner, st);
      g.fillStyle = ink(1, 0.35, 0.95);
      g.fill();
    },
  };
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
  standard: gearSide(0.6, 0.5),
  cabinet: gearSide(0.7, 0.4),
  receiver: gearSide(0.6, 0.25),
  najeon: gearSide(0.6, 0.3),
};
