
/**
 * The gear: the track's frame down its edges and, under the judge line, a plate. The gears a player
 * picks (설정 → 기어, GEAR_STYLES) are each one object, none of them lit per lane (the lanes and the
 * key beams show the keys; only PIANO's keys follow the lanes, going down with them: deckKeys): a red
 * judge line a little above them (GEAR_JUDGE) and the object's own panel under it, drawn from its
 * pictures where they loaded (render/styleArt.ts) and in code where not:
 *
 * - STANDARD (기본): the game's own controller, graphite rails with a cyan line, smoked glass with a
 *   glass jog dial, the game's name over a cyan light strip and a speaker grille;
 * - CABINET (오락실 기체): an arcade cabinet's control panel, embossed black ABS with chrome, a
 *   joystick, six acrylic buttons, start buttons, credit windows and the coin entry, amber LEDs down
 *   its side panels that light in FEVER;
 * - RECEIVER (빈티지 리시버): a 1970s stereo receiver, walnut sides, a brushed silver faceplate with
 *   a tuning knob, an amber tuning dial, selector switches, two meters and a volume knob;
 * - NAJEON (나전칠기): a black lacquer chest front, brass corner fittings, two lids with a
 *   mother-of-pearl crane, pearl vines and a brass lock plate;
 * - KEYBOARD (커스텀 키보드): a custom keyboard's case of bead-blasted charcoal aluminium, a
 *   volume knob in an orange light ring, an OLED window, the brass name plate, lock lights and the
 *   arrow keys' inverted T (one orange cap);
 * - RACING (레이싱 휠): a sim-racing button box of twill carbon, shift lights across it, a big
 *   rotary and a small one, rubber buttons with coloured rings, the dash's lap timer (idle); its
 *   frame carbon with a red-stitched suede strip;
 * - ORBITAL (우주선 계기판): a spacecraft's instrument panel in light grey paint, a guarded selector,
 *   guarded toggles, the master alarm lamp, a caution stripe and square push buttons, labels
 *   silk-screened in black; its frame gold foil (an insulation blanket) under a yellow handrail.
 * - PIANO (피아노): the keyboard end of a concert grand in polished ebony lacquer, the one gear with a
 *   key per lane: an ivory white key under each key lane from just under the lacquer lip with its
 *   brass inlay, the black keys of an octave between them, and a cheek block with a brass treble
 *   clef medallion under the scratch lane (a plain one under a side lane); a white key goes down
 *   while its lane's key is held; its frame the piano's rim, black lacquer with a brass line along
 *   the lanes.
 * - PRISM (프리즘): satin black anodised aluminium, a slab of smoked glass with a round lens set in it,
 *   glass light-guides along the lanes (prismPlate);
 * - RAWGLASS (달): a slab of raw glass in the silvers of a mirror's bevels with nothing set
 *   in it, its top broken into flat crystal facets that catch the light, grey where it is thick and
 *   white where the light comes through; its frame rails of the same glass.
 */
export type GearStyle = 'prism' | 'standard' | 'cabinet' | 'receiver' | 'najeon' | 'keyboard' | 'racing' | 'orbital' | 'piano' | 'rawglass';
/** The gears a player picks. */
export const GEAR_STYLES: GearStyle[] = ['standard', 'prism', 'cabinet', 'receiver', 'najeon', 'keyboard', 'racing', 'orbital', 'piano', 'rawglass'];
/** What a lane over the deck is: the scratch, a white key or another key. */
export type KeyKind = 'white' | 'other' | 'scratch';

export interface DeckLane {
  /** Left edge and width in plane px from the deck's left edge. */
  left: number;
  width: number;
  kind: KeyKind;
  /** A side lane (FX) of its own beside the keys (not one laid over them: DeckSide). */
  side?: boolean;
}

/** A side lane laid over half the keys (반쪽 덮기), none of the deck's lanes: its half, plane px from the deck's left edge. */
export interface DeckSide {
  left: number;
  width: number;
}

/** The deck in plane px (the sheets' px, 73.65 to a track unit): y runs from just under the judge line toward the camera. */
export interface DeckSpec {
  width: number;
  /** How much of it the screen shows, and all of it (a tilted camera can show more). */
  room: number;
  depth: number;
  /** How much longer along the track round things are drawn, so they look round where the camera flattens it. */
  stretch: number;
  /** The lanes over the deck (a side lane laid over the keys is none of them). */
  lanes: DeckLane[];
  /** The side lanes laid over the keys (none unless they are). */
  sides: DeckSide[];
  /** Where a gear's plate drawn in code puts the parts its lights shine on (filled when given: gearLights.ts). */
  marks?: DeckMark[];
}

/** A part of a gear's deck drawn in code that its lights shine on: its name and its box (plane px). */
export interface DeckMark {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Notes where the plate put a lit part (see DeckSpec.marks). */
function mark(s: DeckSpec, name: string, b: Box): void {
  s.marks?.push({ name, x: b.x, y: b.y, w: b.w, h: b.h });
}

/** A lamp's box (see lamp). */
const lampBox = (x: number, y: number, r: number, st: number): Box => ({ x: x - r, y: y - r * st, w: 2 * r, h: 2 * r * st });

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

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A rectangle whose corners are round on the screen (`r` across, `st` times longer along the track). */
function rounded(g: CanvasRenderingContext2D, b: Box, r: number, st: number): void {
  g.beginPath();
  g.roundRect(b.x, b.y, b.w, b.h, [{ x: Math.min(r, b.w / 2), y: Math.min(r * st, b.h / 2) }]);
}

// ---------- the gears ----------

/** A picture a gear is drawn from (an ImageBitmap in the browser). */
export type Picture = CanvasImageSource & { readonly width: number; readonly height: number };

/**
 * A gear's pictures by part (render/styleArt.ts loads them): the materials of its plate and frame,
 * and the things on its deck. A part whose picture is missing is drawn in code.
 */
export type GearPart = 'deck' | 'glow' | 'plate' | 'frame' | 'jog' | 'joystick' | 'button' | 'coin' | 'knob' | 'switch' | 'lid' | 'lock' | 'keycap' | 'brass' | 'rotary' | 'selector' | 'toggle' | 'medallion';
export type GearArt = Partial<Record<GearPart, Picture>>;

/**
 * The judge line of the gears a player picks, as DJMAX draws its own: a thick red line (`height` plane px) with
 * a light core and a red glow both ways (`blur`), a little above the gear: `gap` plane px of the lanes
 * lie between them, where a note let through runs on until the gear covers it.
 */
export const GEAR_JUDGE = { line: '#ff2b3b', core: '#ffd2d6', glow: '#ff2b3b', height: 16, blur: 22, gap: 40 } as const;

/**
 * The judge line's colours on a gear: GEAR_JUDGE's red, but PRISM's own, a white core in azure light
 * (its scratch is a ruby: a red line would hide the gem's razor as it lands; all white, it would hide
 * the white keys' notes). Its place and size are
 * the same on every gear.
 */
export function judgeOf(style: GearStyle): { line: string; core: string; glow: string; height: number; blur: number; gap: number } {
  return style === 'prism' ? { ...GEAR_JUDGE, line: '#3f8cff', core: '#f2f8ff', glow: '#3f8cff' } : GEAR_JUDGE;
}

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

/**
 * A thing on the deck: its picture in its box, or `code` drawing it there; standing `lift` high
 * (a share of its width; none for a thing set flush in the plate), it throws its shadow on the
 * plate first (`round` or square, see dropShadow).
 */
function thing(g: CanvasRenderingContext2D, pic: Picture | undefined, b: Box, code: (b: Box) => void, lift = 0, round = true): void {
  if (lift > 0) dropShadow(g, b, lift, round);
  if (pic) picture(g, pic, b);
  else code(b);
}

/**
 * Where a thing's shadow falls on the canvas, for a thing in box `b` standing `lift` high and the
 * canvas's transform `m` (canvas px to a plane px, as getTransform gives it): down and to the
 * right of it on the screen, the light coming from the top-left, whichever way the thing is
 * drawn (mirrored too). Its shape is drawn `far` plane px to its left, off the canvas, so only the
 * shadow, offset back by as much, falls on the plate. Null for a transform it cannot read.
 */
export function shadowOf(m: { a: number; b: number; c: number; d: number }, b: Box, lift: number): { far: number; blur: number; x: number; y: number } | null {
  const kx = Math.hypot(m.a, m.b);
  const ky = Math.hypot(m.c, m.d);
  if (!(kx > 0 && ky > 0)) return null;
  const far = 8192;
  return { far, blur: b.w * 0.12 * lift * kx, x: far * m.a + b.w * 0.07 * lift * kx, y: far * m.b + b.h * 0.1 * lift * ky };
}

/** The soft shadow of a thing in box `b` standing `lift` high, `round` or square (see shadowOf). */
function dropShadow(g: CanvasRenderingContext2D, b: Box, lift: number, round: boolean): void {
  const at = shadowOf(g.getTransform(), b, lift);
  if (!at) return;
  g.save();
  g.shadowColor = black(0.5);
  g.shadowBlur = at.blur;
  g.shadowOffsetX = at.x;
  g.shadowOffsetY = at.y;
  g.beginPath();
  if (round) g.ellipse(b.x - at.far + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
  else g.roundRect(b.x - at.far, b.y, b.w, b.h, [{ x: b.w * 0.12, y: b.h * 0.12 }]);
  g.fillStyle = '#000';
  g.fill();
  g.restore();
}

/**
 * Box `b` sunk into the plate (a window, a socket), its corners `r` round on the screen: its top
 * and left inner walls in shade and a lit lip under its bottom edge, the light coming from the
 * top-left. Drawn over its ground, under what lights up in it.
 */
function recess(g: CanvasRenderingContext2D, b: Box, r: number, st: number): void {
  g.save();
  rounded(g, b, r, st);
  g.clip();
  const down = Math.min(b.h * 0.4, 5 * st);
  const top = g.createLinearGradient(0, b.y, 0, b.y + down);
  top.addColorStop(0, black(0.6));
  top.addColorStop(1, black(0));
  g.fillStyle = top;
  g.fillRect(b.x, b.y, b.w, down);
  const across = Math.min(b.w * 0.3, 4);
  const left = g.createLinearGradient(b.x, 0, b.x + across, 0);
  left.addColorStop(0, black(0.45));
  left.addColorStop(1, black(0));
  g.fillStyle = left;
  g.fillRect(b.x, b.y, across, b.h);
  g.restore();
  g.fillStyle = white(0.22);
  g.fillRect(b.x + r, b.y + b.h, Math.max(0, b.w - 2 * r), 0.9);
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
  const corner = Math.min(b.w, b.h / st) * 0.18;
  rounded(g, b, corner, st);
  g.fillStyle = '#0d0e12';
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = white(0.1);
  g.stroke();
  recess(g, b, corner, st);
  rounded(g, b, corner, st);
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
  recess(g, { x: 0, y: 0, w, h }, 2, 1);
  g.beginPath();
  g.roundRect(0, 0, w, h, 2);
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
  thing(
    g,
    art.jog,
    jog,
    (b) =>
      shadedDisc(g, b, [
        [0, '#3a3d45'],
        [1, '#101116'],
      ]),
    0.45,
  );
  mark(s, 'jog', { x: jog.x - 2, y: jog.y - 2 * st, w: jog.w + 4, h: jog.h + 4 * st });
  g.beginPath();
  g.ellipse(jog.x + jog.w / 2, jog.y + jog.h / 2, jog.w / 2 + 2, jog.h / 2 + 2 * st, 0, 0, Math.PI * 2);
  g.lineWidth = 1.2;
  g.strokeStyle = shade(CYAN, 1, 0.45);
  g.stroke();
  text(g, 'GENERATIVE RHYTHM', s.width / 2, y + h * 0.4, Math.max(9, u * 0.15), st, white(0.32), { tracking: 4 });
  const strip: Box = { x: s.width * 0.37, y: y + h * 0.62, w: s.width * 0.26, h: 2.4 * st };
  rounded(g, strip, 1.2, st);
  g.fillStyle = shade(CYAN, 1, 0.6);
  g.fill();
  mark(s, 'strip', strip);
  const speaker = boxAt(s.width * 0.86, mid, s.width * 0.17, st, (u * 0.62) / (s.width * 0.17));
  grille(g, speaker, st, Math.max(5, u * 0.075));
  mark(s, 'grille', speaker);
}

/** One of the cabinet's acrylic buttons in box `b`: its picture, its dome tinted `tint` (the milky white is left as it is). */
function arcadeButton(g: CanvasRenderingContext2D, pic: Picture | undefined, b: Box, tint: string | null): void {
  thing(
    g,
    pic,
    b,
    (bb) => {
      shadedDisc(g, bb, [
        [0, '#d9dce1'],
        [0.5, '#7d828a'],
        [1, '#2d3036'],
      ]);
      shadedDisc(g, { x: bb.x + bb.w * 0.13, y: bb.y + bb.h * 0.13, w: bb.w * 0.74, h: bb.h * 0.74 }, [
        [0, '#f4f5f8'],
        [1, '#b9bcc4'],
      ]);
    },
    0.45,
  );
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
  thing(
    g,
    art.joystick,
    boxAt(s.width * 0.12, mid, u * 0.82, st),
    (b) => {
      shadedDisc(g, b, [
        [0, '#3a3c40'],
        [1, '#0b0b0c'],
      ]);
      shadedDisc(g, { x: b.x + b.w * 0.3, y: b.y + b.h * 0.3, w: b.w * 0.4, h: b.h * 0.4 }, [
        [0, '#ff8a80'],
        [1, '#8e0f0f'],
      ]);
    },
    0.9,
  );
  // two rows of three, the lower one a little to the right, as fingers lie
  const tints: (string | null)[][] = [
    [LED_RED, AMBER, null],
    [null, LED_RED, AMBER],
  ];
  tints.forEach((row, r) =>
    row.forEach((tint, c) => {
      const b = boxAt(s.width * (0.27 + c * 0.075 + r * 0.025), y + h * (r ? 0.73 : 0.29), u * 0.36, st);
      arcadeButton(g, art.button, b, tint);
      mark(s, `button.${r * 3 + c}`, b);
    }),
  );
  // the start buttons, lit amber
  for (const [i, cx] of [0.555, 0.61].entries()) {
    const b = boxAt(s.width * cx, y + h * 0.3, u * 0.26, st, 0.55);
    mark(s, `start.${i}`, b);
    dropShadow(g, b, 0.35, false);
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
    recess(g, { x: wx, y: wy, w: ww, h: wh }, 2, st);
    g.fillStyle = 'rgba(255,42,42,0.16)';
    const dw = (wh / st) * 0.5;
    for (let i = 0; i < 2; i++) eight(g, wx + 3 + i * dw * 1.24, wy + wh * 0.16, dw, wh * 0.68);
  }
  text(g, 'GRG-2000', s.width * 0.5825, y + h * 0.9, Math.max(9, u * 0.12), st, white(0.6), { tracking: 1.5 });
  const coinAspect = art.coin ? art.coin.height / art.coin.width : 0.69;
  const coin = boxAt(s.width * 0.84, mid, Math.min(s.width * 0.24, (u * 0.84) / coinAspect), st, coinAspect);
  // its two lights, at the coin plate's picture's lamps
  for (const [i, lx] of [0.47, 0.84].entries()) mark(s, `coin.${i}`, boxAt(coin.x + coin.w * lx, coin.y + coin.h * 0.5, coin.w * 0.09, st));
  thing(
    g,
    art.coin,
    coin,
    (b) => {
      rounded(g, b, b.w * 0.06, st);
      g.fillStyle = '#9da2a9';
      g.fill();
      for (const sx of [0.33, 0.67]) {
        g.fillStyle = '#16171a';
        g.fillRect(b.x + b.w * sx - b.w * 0.03, b.y + b.h * 0.25, b.w * 0.06, b.h * 0.5);
      }
    },
    0.12,
    false,
  );
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
  recess(g, { x: x0, y: top, w: x1 - x0, h }, 3, 1);
  g.beginPath();
  g.roundRect(x0, top, x1 - x0, h, 3);
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
  thing(g, art.knob, boxAt(s.width * 0.11, mid, u * 0.86, st), knob, 0.7);
  tuningDial(g, s.width * 0.22, s.width * 0.62, y + h * 0.06, h * 0.38);
  mark(s, 'dial', { x: s.width * 0.22, y: y + h * 0.06, w: s.width * 0.4, h: h * 0.38 });
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
  [0.66, 0.775].forEach((x, i) => {
    const b: Box = { x: s.width * x, y: y + h * 0.06, w: s.width * 0.1, h: h * 0.58 };
    meter(g, b, st);
    mark(s, `meter.${i}`, b);
  });
  thing(g, art.knob, boxAt(s.width * 0.935, y + h * 0.34, u * 0.42, st), knob, 0.6);
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
  const leftLid = boxAt(s.width * 0.18, mid, lidSize, st);
  thing(g, art.lid, leftLid, lid, 0.25);
  mark(s, 'lid.0', leftLid);
  mark(s, 'lid.1', { ...leftLid, x: s.width - leftLid.x - leftLid.w });
  // the right one the left mirrored: the crane flies toward the middle on both
  g.save();
  g.translate(s.width * 0.82, 0);
  g.scale(-1, 1);
  thing(g, art.lid, boxAt(0, mid, lidSize, st), lid, 0.25);
  g.restore();
  const lock = boxAt(s.width / 2, mid, u * 0.92, st);
  thing(
    g,
    art.lock,
    lock,
    (b) =>
      shadedDisc(g, b, [
        [0, '#e2c27a'],
        [1, '#6d4f1f'],
      ]),
    0.2,
  );
  mark(s, 'lock', lock);
  // a pearl vine on each side of the lock, between gold double lines
  const thick = u * 0.22 * st;
  for (const [x0, x1] of [
    [s.width * 0.27, lock.x - 10],
    [lock.x + lock.w + 10, s.width * 0.73],
  ] as [number, number][]) {
    if (x1 - x0 < 12) continue;
    mark(s, `vine.${x0 < s.width / 2 ? 0 : 1}`, { x: x0, y: mid - thick / 2, w: x1 - x0, h: thick });
    if (art.frame) vineAcross(g, art.frame, x0, x1, mid, thick, st);
    else {
      g.fillStyle = 'rgba(232,226,240,0.45)';
      g.fillRect(x0, mid - 1.5 * st, x1 - x0, 3 * st);
    }
    g.fillStyle = shade(BRASS, 1, 0.75);
    for (const dy of [-thick / 2 - 3 * st, thick / 2 + 2 * st]) g.fillRect(x0, mid + dy, x1 - x0, 0.9);
  }
}

const ORANGE = '#ff8a1e';
/** The racing wheel's red and the orbital panel's lamp green. */
const RACE_RED = '#e3242b';
const SIGNAL_GREEN = '#3dff6e';

/** Which segments of a seven-segment digit light: a top, b top right, c bottom right, d bottom, e bottom left, f top left, g middle. */
const SEGMENTS: Readonly<Record<string, string>> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
  '5': 'afgcd',
  '6': 'afgedc',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
  '-': 'g',
};

/** A seven-segment digit `ch` in box `b` (`st` times longer along the track than it looks): its segments in `lit`, the others (their ghost) in `ghost`. */
function segDigit(g: CanvasRenderingContext2D, ch: string, b: Box, st: number, lit: string, ghost: string): void {
  const tx = b.w * 0.2;
  const ty = tx * st;
  const half = (b.h - 3 * ty) / 2;
  const segs: Record<string, [number, number, number, number]> = {
    a: [b.x + tx, b.y, b.w - 2 * tx, ty],
    b: [b.x + b.w - tx, b.y + ty, tx, half],
    c: [b.x + b.w - tx, b.y + 2 * ty + half, tx, half],
    d: [b.x + tx, b.y + b.h - ty, b.w - 2 * tx, ty],
    e: [b.x, b.y + 2 * ty + half, tx, half],
    f: [b.x, b.y + ty, tx, half],
    g: [b.x + tx, b.y + ty + half, b.w - 2 * tx, ty],
  };
  const on = SEGMENTS[ch] ?? '';
  for (const [k, [x, y, w, h]] of Object.entries(segs)) {
    g.fillStyle = on.includes(k) ? lit : ghost;
    g.fillRect(x, y, w, h);
  }
}

/** How wide a seven-segment readout of `label` (digits, '-', ':' and '.') is, its digits `w` wide. */
const readoutWidth = (label: string, w: number) => [...label].reduce((sum, ch) => sum + (ch === ':' || ch === '.' ? w * 0.6 : w * 1.3), 0) - w * 0.3;

/** A seven-segment readout of `label` about (cx, cy), its digits `w` wide and twice as deep on the screen: lit segments in `lit`, their ghosts in `ghost`. */
function segReadout(g: CanvasRenderingContext2D, label: string, cx: number, cy: number, w: number, st: number, lit: string, ghost: string): void {
  const h = 2 * w * st;
  const y = cy - h / 2;
  let x = cx - readoutWidth(label, w) / 2;
  for (const ch of label) {
    if (ch === ':' || ch === '.') {
      const d = w * 0.22;
      g.fillStyle = lit;
      if (ch === ':') g.fillRect(x + w * 0.04, y + h * 0.3 - (d * st) / 2, d, d * st);
      g.fillRect(x + w * 0.04, ch === ':' ? y + h * 0.7 - (d * st) / 2 : y + h - d * st, d, d * st);
      x += w * 0.6;
    } else {
      segDigit(g, ch, { x, y, w, h }, st, lit, ghost);
      x += w * 1.3;
    }
  }
}

/** A hex-socket screw head at (x, y), `r` across: a steel disc lit from the top-left, its socket in it. */
function hexScrew(g: CanvasRenderingContext2D, x: number, y: number, r: number, st: number): void {
  shadedDisc(g, { x: x - r, y: y - r * st, w: 2 * r, h: 2 * r * st }, [
    [0, '#c9cdd3'],
    [1, '#3b3e44'],
  ]);
  polygon(
    g,
    Array.from({ length: 6 }, (_, i): [number, number] => [x + r * 0.5 * Math.cos((i * Math.PI) / 3), y + r * 0.5 * st * Math.sin((i * Math.PI) / 3)]),
  );
  g.fillStyle = '#121315';
  g.fill();
}

/** A small round lamp at (x, y), `r` across, in its black bezel: lit in `colour` with a little light round it, or dark. */
function lamp(g: CanvasRenderingContext2D, x: number, y: number, r: number, st: number, colour: string, lit: boolean): void {
  if (lit) {
    disc(g, x, y, r * 2.1, st);
    g.fillStyle = shade(colour, 1, 0.16);
    g.fill();
  }
  disc(g, x, y, r * 1.3, st);
  g.fillStyle = '#08080a';
  g.fill();
  disc(g, x, y, r, st);
  g.fillStyle = lit ? colour : shade(colour, 0.3);
  g.fill();
  disc(g, x - r * 0.3, y - r * 0.3 * st, r * 0.32, st);
  g.fillStyle = white(lit ? 0.75 : 0.22);
  g.fill();
}

/** `colour` laid over what is drawn inside the path `path` makes (multiplied: white turns to it, black stays black). */
function dye(g: CanvasRenderingContext2D, b: Box, colour: string, path: () => void): void {
  g.save();
  path();
  g.clip();
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = colour;
  g.fillRect(b.x, b.y, b.w, b.h);
  g.restore();
}

/** The plate's material over a frame's tile at the plate's grain (PLATE_SCALE plane px to a picture px), `k` canvas px to a plane px. */
function plateGrain(g: CanvasRenderingContext2D, pic: Picture | undefined, w: number, h: number, k: number): void {
  if (!pic) return;
  const px = PLATE_SCALE * k;
  g.imageSmoothingQuality = 'high';
  g.drawImage(pic, 0, 0, Math.min(pic.width, w / px), Math.min(pic.height, h / px), 0, 0, w, h);
}

/** One of the arrow keys' caps in box `b`: its picture in `colour`, its arrow (`turn` quarter turns from up) in `legend`. */
function keycap(g: CanvasRenderingContext2D, pic: Picture | undefined, b: Box, st: number, colour: string, turn: number, legend: string): void {
  const r = b.w * 0.16;
  thing(
    g,
    pic,
    b,
    (bb) => {
      rounded(g, bb, r, st);
      g.fillStyle = '#c4c6cb';
      g.fill();
      rounded(g, { x: bb.x + bb.w * 0.15, y: bb.y + bb.h * 0.12, w: bb.w * 0.68, h: bb.h * 0.7 }, r * 0.7, st);
      g.fillStyle = '#eceef1';
      g.fill();
    },
    0.55,
    false,
  );
  dye(g, b, colour, () => rounded(g, b, r, st));
  // the arrow on the dish, which lies a little up and left of the cap's middle
  g.save();
  g.translate(b.x + b.w * 0.485, b.y + b.h * 0.465);
  g.scale(1, st);
  g.rotate((turn * Math.PI) / 2);
  const a = b.w * 0.1;
  polygon(g, [
    [0, -a],
    [a * 0.9, a * 0.6],
    [-a * 0.9, a * 0.6],
  ]);
  g.fillStyle = legend;
  g.fill();
  g.restore();
}

/** KEYBOARD: a custom keyboard's case, bead-blasted charcoal aluminium under its gasket and polished chamfer; the volume knob sunk in its orange light ring, the OLED window with a bar graph, the brass name plate, the lock lights and the arrow keys' inverted T, its up key orange. */
function keyboardPlate(g: CanvasRenderingContext2D, s: DeckSpec, art: GearArt): void {
  const st = s.stretch;
  material(g, art.plate, { x: 0, y: 0, w: s.width, h: s.depth }, PLATE_SCALE, st, '#2b2d32');
  const gasket = 2.4 * st;
  g.fillStyle = '#0b0b0c';
  g.fillRect(0, 0, s.width, gasket);
  g.fillStyle = '#b4b9c0';
  g.fillRect(0, gasket, s.width, 1.1);
  g.fillStyle = white(0.06);
  g.fillRect(0, gasket + 1.1, s.width, 1.8 * st);
  const band = bandOf(s, gasket + 1.1 + 1.8 * st);
  if (!band) return;
  const { y, h, u, mid } = band;
  // the knob sunk in the case, its light ring round it
  const knob = boxAt(s.width * 0.11, mid, u * 0.72, st);
  const [kx, ky, kr] = [knob.x + knob.w / 2, knob.y + knob.h / 2, knob.w / 2];
  disc(g, kx, ky, kr + 5, st);
  g.fillStyle = '#0c0c0e';
  g.fill();
  disc(g, kx, ky, kr + 4, st);
  g.lineWidth = 1.2;
  g.strokeStyle = shade(ORANGE, 1, 0.3);
  g.stroke();
  disc(g, kx, ky, kr + 2.4, st);
  g.lineWidth = 2;
  g.strokeStyle = ORANGE;
  g.stroke();
  mark(s, 'knob', { x: kx - kr - 2.4, y: ky - (kr + 2.4) * st, w: 2 * (kr + 2.4), h: 2 * (kr + 2.4) * st });
  thing(g, art.knob, knob, (b) =>
    shadedDisc(g, b, [
      [0, '#7a7f87'],
      [1, '#16171a'],
    ]),
  );
  // the OLED window: black glass, a bar graph in white px, one bar orange
  const oled: Box = { x: s.width * 0.21, y: y + h * 0.1, w: s.width * 0.29, h: h * 0.44 };
  rounded(g, oled, 3, st);
  g.fillStyle = '#040405';
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = white(0.14);
  g.stroke();
  recess(g, oled, 3, st);
  mark(s, 'screen', oled);
  const bars = 22;
  const pitch = (oled.w - 14) / bars;
  const cell = (oled.h - 8 * st) / 8;
  for (let i = 0; i < bars; i++) {
    const n = 1 + Math.round(6 * Math.abs(Math.sin(i * 0.7 + 0.5)) * (0.55 + 0.45 * Math.abs(Math.cos(i * 0.31))));
    g.fillStyle = i === 13 ? ORANGE : white(0.86);
    for (let j = 0; j < n; j++) g.fillRect(oled.x + 7 + i * pitch, oled.y + oled.h - 4 * st - (j + 1) * cell, pitch * 0.66, cell * 0.72);
  }
  // the brass name plate under it, its name engraved
  const brassAspect = art.brass ? art.brass.height / art.brass.width : 0.21;
  const brass = boxAt(oled.x + oled.w / 2, y + h * 0.78, Math.min(s.width * 0.17, (u * 0.3) / brassAspect), st, brassAspect);
  thing(
    g,
    art.brass,
    brass,
    (b) => {
      rounded(g, b, 2, st);
      g.fillStyle = '#c9a45c';
      g.fill();
    },
    0.12,
    false,
  );
  text(g, 'TKL-08', brass.x + brass.w / 2, brass.y + brass.h / 2, Math.max(7, (brass.h / st) * 0.5), st, '#4a3311', { tracking: 1.5, engraved: true });
  // the lock lights: caps and scroll dark, num lit
  [false, false, true].forEach((on, i) => {
    const [lx, ly, lr] = [s.width * (0.57 + i * 0.035), y + h * 0.3, Math.max(1.6, u * 0.028)];
    lamp(g, lx, ly, lr, st, ORANGE, on);
    mark(s, `lock.${i}`, lampBox(lx, ly, lr, st));
  });
  // the arrow keys' inverted T, the up key orange
  const cap = u * 0.36;
  const capAspect = art.keycap ? art.keycap.height / art.keycap.width : 1;
  const [ax, step, dy] = [s.width * 0.8, cap * 1.12, ((cap * capAspect + u * 0.08) * st) / 2];
  const cream = '#f3ece2';
  const ink = '#3a3c42';
  const up = boxAt(ax, mid - dy, cap, st, capAspect);
  const left = boxAt(ax - step, mid + dy, cap, st, capAspect);
  const down = boxAt(ax, mid + dy, cap, st, capAspect);
  const right = boxAt(ax + step, mid + dy, cap, st, capAspect);
  // their well: the case cut out round the up key and round the row under it, dark, the keys sitting in it
  const pad = cap * 0.07;
  const wells: Box[] = [
    { x: up.x - pad, y: up.y - pad * st, w: up.w + 2 * pad, h: up.h + 2 * pad * st },
    { x: left.x - pad, y: left.y - pad * st, w: right.x + right.w - left.x + 2 * pad, h: left.h + 2 * pad * st },
  ];
  wells.forEach((b, i) => {
    rounded(g, b, pad, st);
    g.fillStyle = '#0a0a0c';
    g.fill();
    mark(s, `well.${i}`, b);
  });
  for (const b of wells) recess(g, b, pad, st);
  keycap(g, art.keycap, up, st, ORANGE, 0, '#fff4e8');
  keycap(g, art.keycap, left, st, cream, 3, ink);
  keycap(g, art.keycap, down, st, cream, 2, ink);
  keycap(g, art.keycap, right, st, cream, 1, ink);
  for (const [name, b] of [
    ['key.up', up],
    ['key.right', right],
    ['key.down', down],
    ['key.left', left],
  ] as [string, Box][])
    mark(s, name, b);
}

/** One of the button box's rubber buttons in box `b`: its picture, its ring in `ring`. */
function rubberButton(g: CanvasRenderingContext2D, pic: Picture | undefined, b: Box, ring: string): void {
  thing(
    g,
    pic,
    b,
    (bb) => {
      shadedDisc(g, bb, [
        [0, '#3a3c40'],
        [1, '#050506'],
      ]);
      g.beginPath();
      g.ellipse(bb.x + bb.w / 2, bb.y + bb.h / 2, bb.w * 0.34, bb.h * 0.34, 0, 0, Math.PI * 2);
      g.lineWidth = Math.max(1, bb.w * 0.05);
      g.strokeStyle = '#f2f2f2';
      g.stroke();
    },
    0.4,
  );
  dye(g, b, ring, () => {
    g.beginPath();
    g.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
  });
}

/** RACING: a sim-racing button box of twill carbon under a clear coat, a red line along its top; the shift lights across it (the greens lit), the big rotary and a small one, rubber buttons ringed in their colours, the dash's lap timer idle. */
function racingPlate(g: CanvasRenderingContext2D, s: DeckSpec, art: GearArt): void {
  const st = s.stretch;
  material(g, art.plate, { x: 0, y: 0, w: s.width, h: s.depth }, PLATE_SCALE, st, '#141517');
  const coat = g.createLinearGradient(0, 0, 0, s.room);
  coat.addColorStop(0, white(0.05));
  coat.addColorStop(1, black(0.25));
  g.fillStyle = coat;
  g.fillRect(0, 0, s.width, s.depth);
  const groove = 2.4 * st;
  g.fillStyle = '#050506';
  g.fillRect(0, 0, s.width, groove);
  g.fillStyle = RACE_RED;
  g.fillRect(0, groove, s.width, 1.2);
  const band = bandOf(s, groove + 1.2);
  if (!band) return;
  const { y, h, u, mid } = band;
  // the shift lights: five green (lit), five red, five blue
  for (let i = 0; i < 15; i++) {
    const colour = i < 5 ? '#36e05a' : i < 10 ? '#ff2d2d' : '#3d7bff';
    const [lx, ly, lr] = [s.width * (0.27 + (0.46 * i) / 14), y + h * 0.14, Math.max(1.6, u * 0.032)];
    lamp(g, lx, ly, lr, st, colour, i < 5);
    mark(s, `led.${i}`, lampBox(lx, ly, lr, st));
  }
  const rotary = (b: Box) =>
    shadedDisc(g, b, [
      [0, '#4a4d53'],
      [1, '#08090a'],
    ]);
  thing(g, art.rotary, boxAt(s.width * 0.11, mid, u * 0.84, st), rotary, 0.6);
  thing(g, art.rotary, boxAt(s.width * 0.89, mid + h * 0.06, u * 0.56, st), rotary, 0.5);
  // the rubber buttons, ringed yellow, blue, white and green
  for (const [i, [x, ring]] of ([
    [0.27, '#ffd23f'],
    [0.355, '#3d7bff'],
    [0.645, '#ffffff'],
    [0.73, '#36e05a'],
  ] as [number, string][]).entries()) {
    const b = boxAt(s.width * x, y + h * 0.6, u * 0.34, st);
    rubberButton(g, art.button, b, ring);
    mark(s, `button.${i}`, b);
  }
  // the dash: a black LCD, its lap timer idle (dashes) over its digits' ghosts
  const dash: Box = { x: s.width * 0.41, y: y + h * 0.36, w: s.width * 0.18, h: h * 0.5 };
  rounded(g, dash, 3, st);
  g.fillStyle = '#030304';
  g.fill();
  g.lineWidth = 1.2;
  g.strokeStyle = '#2b2d31';
  g.stroke();
  recess(g, dash, 3, st);
  const label = '-:--.---';
  const digit = Math.min((dash.h * 0.6) / st / 2, (dash.w * 0.86) / readoutWidth(label, 1));
  segReadout(g, label, dash.x + dash.w / 2, dash.y + dash.h / 2, digit, st, '#f2f5f8', white(0.07));
}

/** One of the panel's square push buttons in box `b`: its picture, its lens lit in `light` or dark. */
function pushButton(g: CanvasRenderingContext2D, pic: Picture | undefined, b: Box, st: number, light: string | null): void {
  const lens: Box = { x: b.x + b.w * 0.2, y: b.y + b.h * 0.2, w: b.w * 0.6, h: b.h * 0.6 };
  thing(
    g,
    pic,
    b,
    (bb) => {
      rounded(g, bb, bb.w * 0.1, st);
      g.fillStyle = '#9ea2a8';
      g.fill();
      rounded(g, { x: bb.x + bb.w * 0.1, y: bb.y + bb.h * 0.1, w: bb.w * 0.8, h: bb.h * 0.8 }, bb.w * 0.08, st);
      g.fillStyle = '#141517';
      g.fill();
      rounded(g, lens, bb.w * 0.05, st);
      g.fillStyle = '#e9ebee';
      g.fill();
    },
    0.3,
    false,
  );
  if (!light) return;
  dye(g, lens, light, () => rounded(g, lens, b.w * 0.05, st));
  g.save();
  rounded(g, lens, b.w * 0.05, st);
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = shade(light, 1, 0.3);
  g.fill();
  g.restore();
}

/** A caution stripe in box `b`: yellow and black bands slanting as on the screen, CAUTION on a yellow plate in its middle (`size` px type). */
function cautionStripe(g: CanvasRenderingContext2D, b: Box, st: number, size: number): void {
  g.save();
  g.beginPath();
  g.rect(b.x, b.y, b.w, b.h);
  g.clip();
  g.fillStyle = '#f2c230';
  g.fillRect(b.x, b.y, b.w, b.h);
  g.fillStyle = '#141414';
  const [band, lean] = [(b.h / st) * 0.8, b.h / st];
  for (let x = b.x - lean; x < b.x + b.w; x += band * 2) {
    polygon(g, [
      [x, b.y + b.h],
      [x + band, b.y + b.h],
      [x + band + lean, b.y],
      [x + lean, b.y],
    ]);
    g.fill();
  }
  g.restore();
  const plate: Box = { x: b.x + b.w * 0.3, y: b.y + b.h * 0.12, w: b.w * 0.4, h: b.h * 0.76 };
  g.fillStyle = '#f2c230';
  g.fillRect(plate.x, plate.y, plate.w, plate.h);
  text(g, 'CAUTION', plate.x + plate.w / 2, plate.y + plate.h / 2, size, st, '#141414', { tracking: 1.5 });
}

/** ORBITAL: a spacecraft's instrument panel in light grey paint, a dark seam along its top; its screws, the guarded selector, three guarded toggles, the master alarm lamp (dark) over a caution stripe, the arm and abort buttons (arm lit), labels silk-screened in black. */
function orbitalPlate(g: CanvasRenderingContext2D, s: DeckSpec, art: GearArt): void {
  const st = s.stretch;
  material(g, art.plate, { x: 0, y: 0, w: s.width, h: s.depth }, PLATE_SCALE, st, '#c3c6cb');
  const fall = g.createLinearGradient(0, 0, 0, s.room);
  fall.addColorStop(0, white(0.05));
  fall.addColorStop(1, black(0.14));
  g.fillStyle = fall;
  g.fillRect(0, 0, s.width, s.depth);
  const seam = 2.2 * st;
  g.fillStyle = '#25272b';
  g.fillRect(0, 0, s.width, seam);
  g.fillStyle = white(0.6);
  g.fillRect(0, seam, s.width, 0.9);
  const band = bandOf(s, seam + 0.9);
  if (!band) return;
  const { y, h, u, mid } = band;
  const ink = '#15171a';
  const size = Math.max(8, u * 0.11);
  const label = (name: string, x: number, at: number) => text(g, name, x, at, size, st, ink, { tracking: 1.2 });
  for (const x of [7, s.width - 7]) for (const at of [0.2, 0.8]) hexScrew(g, x, y + h * at, 2.6, st);
  thing(
    g,
    art.selector,
    boxAt(s.width * 0.1, mid, u * 0.8, st),
    (b) => {
      shadedDisc(g, b, [
        [0, '#e3e5e8'],
        [1, '#8d9196'],
      ]);
      shadedDisc(g, { x: b.x + b.w * 0.3, y: b.y + b.h * 0.3, w: b.w * 0.4, h: b.h * 0.4 }, [
        [0, '#4a4c50'],
        [1, '#0b0b0c'],
      ]);
    },
    0.45,
  );
  const toggleAspect = art.toggle ? art.toggle.height / art.toggle.width : 1;
  ['PWR', 'COMM', 'NAV'].forEach((name, i) => {
    const x = s.width * (0.24 + i * 0.075);
    const box = boxAt(x, y + h * 0.4, u * 0.42, st, toggleAspect);
    mark(s, `toggle.${i}`, box);
    thing(
      g,
      art.toggle,
      box,
      (b) => {
        rounded(g, b, b.w * 0.06, st);
        g.fillStyle = '#b9bdc2';
        g.fill();
        disc(g, b.x + b.w / 2, b.y + b.h / 2, b.w * 0.14, st);
        g.fillStyle = '#5c6066';
        g.fill();
      },
      0.35,
      false,
    );
    label(name, x, y + h * 0.86);
  });
  // the master alarm lamp, dark: an amber lens in a black bezel, its legend on it
  const alarm: Box = { x: s.width * 0.48, y: y + h * 0.1, w: s.width * 0.14, h: h * 0.36 };
  dropShadow(g, alarm, 0.12, false);
  rounded(g, alarm, 3, st);
  g.fillStyle = '#1a1b1e';
  g.fill();
  const lens: Box = { x: alarm.x + 2.5, y: alarm.y + 2.5 * st, w: alarm.w - 5, h: alarm.h - 5 * st };
  mark(s, 'alarm', lens);
  rounded(g, lens, 2, st);
  const amber = g.createLinearGradient(0, lens.y, 0, lens.y + lens.h);
  amber.addColorStop(0, '#6e4c14');
  amber.addColorStop(1, '#3a2707');
  g.fillStyle = amber;
  g.fill();
  recess(g, lens, 2, st);
  g.fillStyle = white(0.1);
  g.fillRect(lens.x + 1, lens.y + 1, lens.w - 2, lens.h * 0.3);
  const legend = Math.min(size, (lens.h / st) * 0.32);
  for (const [word, at] of [
    ['MASTER', 0.3],
    ['ALARM', 0.72],
  ] as [string, number][]) {
    text(g, word, lens.x + lens.w / 2, lens.y + lens.h * at, legend, st, shade(AMBER, 0.95, 0.8), { tracking: 1 });
  }
  cautionStripe(g, { x: s.width * 0.46, y: y + h * 0.62, w: s.width * 0.26, h: h * 0.22 }, st, size);
  const buttonAspect = art.button ? art.button.height / art.button.width : 1;
  for (const [x, name, light] of [
    [0.8, 'ARM', SIGNAL_GREEN],
    [0.89, 'ABORT', null],
  ] as [number, string, string | null][]) {
    const box = boxAt(s.width * x, y + h * 0.4, u * 0.36, st, buttonAspect);
    pushButton(g, art.button, box, st, light);
    mark(s, name.toLowerCase(), box);
    label(name, s.width * x, y + h * 0.86);
  }
}

/** PIANO's ivory. */
const IVORY = '#efe8d8';

/**
 * Whether PIANO has a black key between its white keys `i` and `i + 1` (counted from the left, the
 * first a C): an octave's, after C, D, F, G and A, none after E and B.
 */
export function blackKeyAfter(i: number): boolean {
  return [0, 1, 3, 4, 5].includes(((i % 7) + 7) % 7);
}

/** PIANO's black keys reach this share of the white keys the screen shows. */
const BLACK_KEY_REACH = 0.58;
/** PIANO's lacquer lip toward the judge line, as deep as it looks across (plane px). */
const PIANO_LIP = 3.2;
/** The plane px between PIANO's white keys, where the lacquer shows. */
const PIANO_KEY_GAP = 1.1;

/** PIANO's keyboard on a deck (plane px): where its keys start under the lip, its white keys (each a lane's: its index in DeckSpec.lanes) and the black keys standing between them (each after white key `after`). */
interface PianoKeyboard {
  top: number;
  whites: { lane: number; box: Box }[];
  blacks: { after: number; box: Box }[];
}

/** PIANO's keyboard as its plate draws it: a white key per key lane (not the scratch's, not a side lane's), an octave's black keys between neighbours. */
function pianoKeyboard(s: DeckSpec): PianoKeyboard {
  const top = PIANO_LIP * s.stretch + 1.2;
  const reach = Math.max(0, s.room - top);
  const whites = s.lanes.flatMap((l, lane) => (l.kind !== 'scratch' && !l.side ? [{ lane, box: { x: l.left + PIANO_KEY_GAP / 2, y: top, w: l.width - PIANO_KEY_GAP, h: s.depth - top } }] : []));
  const blacks: PianoKeyboard['blacks'] = [];
  let n = 0;
  for (let i = 0; i + 1 < whites.length; i++, n++) {
    const [a, b] = [s.lanes[whites[i].lane], s.lanes[whites[i + 1].lane]];
    // only between neighbours (a side lane between them breaks the keyboard), and a C again after one
    if (Math.abs(a.left + a.width - b.left) > 0.5) {
      n = -1;
      continue;
    }
    if (!blackKeyAfter(n)) continue;
    const w = Math.min(a.width, b.width) * 0.56;
    const box: Box = { x: b.left - w / 2, y: top - 0.6, w, h: reach * BLACK_KEY_REACH };
    if (box.h >= 6) blacks.push({ after: i, box });
  }
  return { top, whites, blacks };
}

/**
 * PIANO: polished ebony lacquer under a bevelled lip with a brass inlay; an ivory white key under
 * each key lane, the black keys of an octave standing between them, a cheek block under the scratch
 * lane with the brass treble clef medallion standing on it (a plain cheek block under a side lane).
 */
function pianoPlate(g: CanvasRenderingContext2D, s: DeckSpec, art: GearArt): void {
  const st = s.stretch;
  const lacquer = g.createLinearGradient(0, 0, 0, s.room);
  lacquer.addColorStop(0, '#121113');
  lacquer.addColorStop(1, '#050405');
  g.fillStyle = lacquer;
  g.fillRect(0, 0, s.width, s.depth);
  // the lip: a dim bevel (nothing bright right under the judge line), the brass inlay at its foot
  const lip = PIANO_LIP * st;
  const bevel = g.createLinearGradient(0, 0, 0, lip);
  bevel.addColorStop(0, '#2c2a2e');
  bevel.addColorStop(0.4, '#151416');
  bevel.addColorStop(1, '#09080a');
  g.fillStyle = bevel;
  g.fillRect(0, 0, s.width, lip);
  g.fillStyle = white(0.12);
  g.fillRect(0, 0, s.width, 0.8);
  const inlay: Box = { x: 0, y: lip, w: s.width, h: 1.2 };
  g.fillStyle = shade(BRASS, 1.15, 0.95);
  g.fillRect(inlay.x, inlay.y, inlay.w, inlay.h);
  mark(s, 'inlay', inlay);
  const { top, whites, blacks } = pianoKeyboard(s);
  const reach = Math.max(0, s.room - top);
  // the white keys, the lacquer showing in the gaps between them; their far ends in the lip's shadow
  for (const { box: b } of whites) {
    const face = g.createLinearGradient(b.x, 0, b.x + b.w, 0);
    face.addColorStop(0, '#f6f1e6');
    face.addColorStop(0.2, IVORY);
    face.addColorStop(0.8, '#e6dfcd');
    face.addColorStop(1, '#c9c0ab');
    g.fillStyle = face;
    g.fillRect(b.x, b.y, b.w, b.h);
    const sheen = g.createLinearGradient(0, top, 0, s.room);
    sheen.addColorStop(0, black(0.5));
    sheen.addColorStop(Math.min(0.5, (9 * st) / Math.max(1, reach)), black(0));
    sheen.addColorStop(1, white(0.06));
    g.fillStyle = sheen;
    g.fillRect(b.x, b.y, b.w, b.h);
  }
  // the black keys standing on them, throwing their shadows down and to the right
  for (const { box: key } of blacks) {
    const w = key.w;
    dropShadow(g, key, 0.32, false);
    rounded(g, key, w * 0.08, st);
    const body = g.createLinearGradient(key.x, 0, key.x + key.w, 0);
    body.addColorStop(0, '#2e2c31');
    body.addColorStop(0.14, '#121114');
    body.addColorStop(0.86, '#0a090b');
    body.addColorStop(1, '#020202');
    g.fillStyle = body;
    g.fill();
    // its top: a lighter band between the tapered sides, the slope of its front end catching the light
    const slope = Math.min(key.h * 0.2, 5 * st);
    const face: Box = { x: key.x + w * 0.14, y: key.y, w: w * 0.72, h: key.h - slope };
    const lit = g.createLinearGradient(0, face.y, 0, face.y + face.h);
    lit.addColorStop(0, white(0.01));
    lit.addColorStop(1, white(0.09));
    g.fillStyle = lit;
    g.fillRect(face.x, face.y, face.w, face.h);
    const end = g.createLinearGradient(0, face.y + face.h, 0, key.y + key.h);
    end.addColorStop(0, white(0.2));
    end.addColorStop(1, white(0.04));
    g.fillStyle = end;
    g.fillRect(face.x, face.y + face.h, face.w, slope * 0.9);
  }
  // the cheek blocks, a little proud of the keys, the medallion on the scratch lane's
  for (const l of s.lanes.filter((k) => k.kind === 'scratch' || k.side)) {
    const block: Box = { x: l.left, y: top, w: l.width, h: s.depth - top };
    dropShadow(g, { ...block, h: Math.max(1, reach) }, 0.06, false);
    const face = g.createLinearGradient(block.x, block.y, block.x + block.w, block.y + reach);
    face.addColorStop(0, '#1e1d21');
    face.addColorStop(0.55, '#0b0a0c');
    face.addColorStop(1, '#050405');
    g.fillStyle = face;
    g.fillRect(block.x, block.y, block.w, block.h);
    g.fillStyle = white(0.1);
    g.fillRect(block.x + block.w - 0.8, block.y, 0.8, block.h);
    if (l.kind !== 'scratch' || reach < 12 * st) continue;
    const aspect = art.medallion ? art.medallion.height / art.medallion.width : 1;
    const size = Math.min(l.width * 0.58, (reach * 0.62) / (st * aspect));
    const medallion = boxAt(l.left + l.width / 2, top + reach * 0.48, size, st, aspect);
    thing(
      g,
      art.medallion,
      medallion,
      (b) => {
        shadedDisc(g, b, [
          [0, '#f0d79a'],
          [0.5, BRASS],
          [1, '#5e4318'],
        ]);
        disc(g, b.x + b.w / 2, b.y + b.h / 2, b.w * 0.36, st);
        g.lineWidth = 1;
        g.strokeStyle = black(0.45);
        g.stroke();
      },
      0.14,
    );
    mark(s, 'medallion', medallion);
  }
}

/**
 * A key on a gear's deck that goes down while its lane's key is held (PIANO's white keys): its
 * lane (its index in DeckSpec.lanes), its box from where the key starts under the lip (plane px),
 * and the black keys standing over its far corners (`notch`: how far into it from its left and
 * right edges, and how far down from its top; 0 where it has none).
 */
export interface DeckKey {
  lane: number;
  box: Box;
  notch: { left: number; right: number; depth: number };
}

/** Where PIANO's deck picture has its keys (px of the picture, `width` across): the white keys from under the lip, the black keys' near ends (build_gears.py lays it flat). */
const PIANO_PICTURE_KEYS = { width: 2048, top: 26, blackEnd: 299 } as const;

/**
 * The keys of `style`'s deck that go down with their lanes (none but PIANO's white keys), where the
 * deck shows them: as its picture drew them (`pictured`, laid as deckPicture lays it) or as its
 * plate draws them in code.
 */
export function deckKeys(style: GearStyle, s: DeckSpec, pictured: boolean): DeckKey[] {
  if (style !== 'piano') return [];
  const { top: plateTop, whites, blacks } = pianoKeyboard(s);
  // plane px down the deck for a px of the picture
  const k = ((s.width / PIANO_PICTURE_KEYS.width) * s.stretch) / DECK_PICTURE_STRETCH;
  const top = pictured ? PIANO_PICTURE_KEYS.top * k : plateTop;
  return whites.map(({ lane, box: white }, i) => {
    const box: Box = { x: white.x, y: top, w: white.w, h: s.depth - top };
    const left = blacks.find((b) => b.after === i - 1)?.box;
    const right = blacks.find((b) => b.after === i)?.box;
    const end = (b: Box) => (pictured ? PIANO_PICTURE_KEYS.blackEnd * k : b.y + b.h);
    const depth = Math.max(0, ...[left, right].map((b) => (b ? end(b) - top : 0)));
    return {
      lane,
      box,
      notch: {
        left: left ? Math.max(0, left.x + left.w - box.x) : 0,
        right: right ? Math.max(0, box.x + box.w - right.x) : 0,
        depth: Math.min(depth, box.h),
      },
    };
  });
}

/**
 * PIANO's white key held down, painted over the key as the deck shows it (a `w` × `h` canvas over its
 * box, its far end at the top): the key's outline, narrowed at its far end between the black keys
 * standing over its corners (`notch`, shares of its box), in shade, deeper toward its near end where
 * it sinks the most; the light coming from the top-left, its left neighbour, now higher, throws a
 * shadow along its left edge, a dark gap opens along its right edge, and its far end slips into the
 * lip's shadow. Drawn once; the renderer shows it while the lane's key is held.
 */
export function paintPressedKey(g: CanvasRenderingContext2D, w: number, h: number, notch: DeckKey['notch']): void {
  const [l, r, d] = [notch.left * w, w - notch.right * w, notch.depth * h];
  g.save();
  polygon(g, [
    [l, 0],
    [r, 0],
    [r, d],
    [w, d],
    [w, h],
    [0, h],
    [0, d],
    [l, d],
  ]);
  g.clip();
  const sink = g.createLinearGradient(0, 0, 0, h);
  sink.addColorStop(0, black(0.1));
  sink.addColorStop(1, black(0.3));
  g.fillStyle = sink;
  g.fillRect(0, 0, w, h);
  // along an edge at x, into the key (dir): w0 wide at y0 to w1 at y1, `alpha` at the edge
  const edge = (x: number, y0: number, y1: number, w0: number, w1: number, dir: 1 | -1, alpha: number) => {
    polygon(g, [
      [x, y0],
      [x + dir * w0, y0],
      [x + dir * w1, y1],
      [x, y1],
    ]);
    const grad = g.createLinearGradient(x, 0, x + dir * Math.max(w0, w1), 0);
    grad.addColorStop(0, black(alpha));
    grad.addColorStop(1, black(0));
    g.fillStyle = grad;
    g.fill();
  };
  // the left neighbour's shadow, wider toward the near end; the gap on the right, narrow
  const shadow = (y: number) => w * (0.04 + (0.12 * y) / h);
  const gap = (y: number) => w * (0.015 + (0.035 * y) / h);
  edge(l, 0, d, shadow(0), shadow(d), 1, 0.5);
  edge(0, d, h, shadow(d), shadow(h), 1, 0.5);
  edge(r, 0, d, gap(0), gap(d), -1, 0.6);
  edge(w, d, h, gap(d), gap(h), -1, 0.6);
  // its far end under the lip's shadow
  const lip = g.createLinearGradient(0, 0, 0, h * 0.08);
  lip.addColorStop(0, black(0.35));
  lip.addColorStop(1, black(0));
  g.fillStyle = lip;
  g.fillRect(0, 0, w, h * 0.08);
  g.restore();
}

/** RAWGLASS's glass, in the silvers of a mirror's bevels: white where it is thin, silver where the light comes through it, grey where it is thick. */
const GLASS_PALE = '#f6f8fa';
const GLASS_DEEP = '#2e3238';

/** A spark of light where a ridge of the glass catches it: a soft glow and four thin rays (`st` times longer along the track). */
function spark(g: CanvasRenderingContext2D, x: number, y: number, r: number, st: number): void {
  const glow = g.createRadialGradient(x, y, 0, x, y, r);
  glow.addColorStop(0, white(0.9));
  glow.addColorStop(0.25, 'rgba(232,238,246,0.45)');
  glow.addColorStop(1, 'rgba(232,238,246,0)');
  g.fillStyle = glow;
  g.beginPath();
  g.ellipse(x, y, r, r * st, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = white(0.85);
  polygon(g, [
    [x - r * 1.6, y],
    [x, y - 0.35 * st],
    [x + r * 1.6, y],
    [x, y + 0.35 * st],
  ]);
  g.fill();
  polygon(g, [
    [x, y - r * 1.6 * st],
    [x + 0.35, y],
    [x, y + r * 1.6 * st],
    [x - 0.35, y],
  ]);
  g.fill();
}

/**
 * RAWGLASS: a slab of raw glass in the silvers of a mirror's bevels with nothing set in it: grey where
 * it is thick, the light coming through it in soft pools, its top broken into flat facets, each
 * catching the light from the top-left as it faces it, with bright ridges where some of them meet, and
 * sparks where ridges catch the light (spark); its front edge under the judge line a ground edge of
 * the same glass.
 */
function rawGlassPlate(g: CanvasRenderingContext2D, s: DeckSpec): void {
  const st = s.stretch;
  const glass = g.createLinearGradient(0, 0, 0, s.room);
  glass.addColorStop(0, '#8f969f');
  glass.addColorStop(0.35, '#c9ced5');
  glass.addColorStop(0.7, '#8a9199');
  glass.addColorStop(1, '#6f767f');
  g.fillStyle = glass;
  g.fillRect(0, 0, s.width, s.depth);
  // thick at its sides, where the walls stand on it
  const sides = g.createLinearGradient(0, 0, s.width, 0);
  sides.addColorStop(0, shade(GLASS_DEEP, 1, 0.55));
  sides.addColorStop(0.18, shade(GLASS_DEEP, 1, 0));
  sides.addColorStop(0.82, shade(GLASS_DEEP, 1, 0));
  sides.addColorStop(1, shade(GLASS_DEEP, 1, 0.55));
  g.fillStyle = sides;
  g.fillRect(0, 0, s.width, s.depth);
  const lip = 3 * st;
  const top = lip + 0.8;
  const band = bandOf(s, top);
  const u = band ? band.u : 40;
  const rand = seeded(53);
  // the light coming through it in soft pools
  for (let i = 0; i < 6; i++) {
    const x = s.width * (0.08 + 0.84 * rand());
    const y = top + (s.room - top) * (0.15 + 0.7 * rand());
    const r = u * (0.6 + 0.6 * rand());
    const pool = g.createRadialGradient(x, y, 0, x, y, r);
    pool.addColorStop(0, 'rgba(255,255,255,0.3)');
    pool.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = pool;
    g.beginPath();
    g.ellipse(x, y, r, r * st, 0, 0, Math.PI * 2);
    g.fill();
  }
  // the top broken into flat planes: a jittered grid, each cell cut in two along one diagonal
  const cols = Math.max(4, Math.round(s.width / (u * 0.95)));
  const cw = s.width / cols;
  const rows = Math.max(2, Math.round((s.room - top) / (cw * 0.85 * st)));
  const rh = (s.room - top) / rows;
  const at: [number, number][][] = [];
  for (let r = 0; r <= rows; r++) {
    const row: [number, number][] = [];
    for (let c = 0; c <= cols; c++) {
      const jx = c === 0 || c === cols ? 0 : (rand() - 0.5) * cw * 0.7;
      const jy = r === 0 || r === rows ? 0 : (rand() - 0.5) * rh * 0.7;
      row.push([c * cw + jx, top + r * rh + jy]);
    }
    at.push(row);
  }
  const ridges: [number, number, number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const [a, b, d, e] = [at[r][c], at[r][c + 1], at[r + 1][c + 1], at[r + 1][c]];
      const halves = rand() < 0.5 ? [[a, b, d], [a, d, e]] : [[a, b, e], [b, d, e]];
      for (const tri of halves) {
        const light = rand() * 2 - 1;
        polygon(g, tri as [number, number][]);
        g.fillStyle = light > 0 ? `rgba(255,255,255,${(0.04 + 0.22 * light).toFixed(3)})` : `rgba(22,25,30,${(0.08 + 0.3 * -light).toFixed(3)})`;
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.18)';
        g.lineWidth = 0.5;
        g.stroke();
      }
      if (rand() < 0.4) ridges.push([a[0], a[1], d[0], d[1]]);
      if (rand() < 0.25) ridges.push([b[0], b[1], e[0], e[1]]);
    }
  }
  g.strokeStyle = 'rgba(255,255,255,0.65)';
  g.lineWidth = 0.7;
  for (const [x0, y0, x1, y1] of ridges) {
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
  // sparks where ridges catch the light
  const sparks = ridges.filter((_, i) => i % Math.max(1, Math.floor(ridges.length / 6)) === 0).slice(0, 6);
  sparks.forEach(([x0, y0], i) => {
    spark(g, x0, y0, u * 0.07, st);
    mark(s, `spark.${i}`, { x: x0 - u * 0.2, y: y0 - u * 0.2 * st, w: u * 0.4, h: u * 0.4 * st });
  });
  mark(s, 'slab', { x: 0, y: top, w: s.width, h: s.room - top });
  // its front edge: ground glass catching the light, the grey of the edge under it, a dark seam
  const edge = g.createLinearGradient(0, 0, 0, lip);
  edge.addColorStop(0, '#2a2e34');
  edge.addColorStop(0.45, GLASS_PALE);
  edge.addColorStop(1, '#9aa1ab');
  g.fillStyle = edge;
  g.fillRect(0, 0, s.width, lip);
  g.fillStyle = black(0.45);
  g.fillRect(0, lip, s.width, 0.8);
  mark(s, 'lip', { x: 0, y: 0, w: s.width, h: lip });
}

/** PRISM's metal (satin black anodised aluminium) and the light in its glass. */
const ANODISED = '#14161b';
const PRISM_LIGHT = '#eaf3ff';
/** White light split, red to violet (the PRISM hit's colours: tintArt.ts). */
const PRISM_SPECTRUM = ['#ff4a5e', '#ff9a3c', '#ffe45c', '#63f28a', '#4fd8ff', '#5b8cff', '#b06bff'] as const;

/** The spectrum across `x0`..`x1` at `alpha`, fading out at both ends. */
function spectrum(g: CanvasRenderingContext2D, x0: number, x1: number, alpha: number): CanvasGradient {
  const grad = g.createLinearGradient(x0, 0, x1, 0);
  grad.addColorStop(0, shade(PRISM_SPECTRUM[0], 1, 0));
  PRISM_SPECTRUM.forEach((c, i) => grad.addColorStop(0.1 + (0.8 * i) / (PRISM_SPECTRUM.length - 1), shade(c, 1, alpha)));
  grad.addColorStop(1, shade(PRISM_SPECTRUM[6], 1, 0));
  return grad;
}

/**
 * PRISM: a deck of satin black anodised aluminium, brushed across, its front edge under the judge
 * line a chamfer catching the light with a glass light-guide's white line along it; set in it a slab
 * of smoked glass with a bright edge and a slant of reflection, and in the slab's middle a round lens
 * in a machined ring; a hairline light-guide runs out from the lens to each side, the light in it
 * split into its colours at its ends.
 */
function prismPlate(g: CanvasRenderingContext2D, s: DeckSpec): void {
  const st = s.stretch;
  const metal = g.createLinearGradient(0, 0, 0, s.room);
  metal.addColorStop(0, '#1d2026');
  metal.addColorStop(0.5, ANODISED);
  metal.addColorStop(1, '#0b0c10');
  g.fillStyle = metal;
  g.fillRect(0, 0, s.width, s.depth);
  // brushed across: fine lines, lighter or darker
  const rand = seeded(71);
  for (let y = 0; y < s.depth; y += 0.9 * st) {
    g.fillStyle = rand() < 0.5 ? white(0.012 + 0.03 * rand()) : black(0.05 + 0.1 * rand());
    g.fillRect(0, y, s.width, 0.5 * st);
  }
  const lip = 3.4 * st;
  const band = bandOf(s, lip);
  if (band) {
    const u = band.u;
    // the slab of smoked glass, set flush: darker than the metal, the room's light slanting across it
    const slab: Box = { x: s.width * 0.035, y: band.y + band.h * 0.08, w: s.width * 0.93, h: band.h * 0.84 };
    g.save();
    rounded(g, slab, 5, st);
    g.clip();
    const smoke = g.createLinearGradient(0, slab.y, 0, slab.y + slab.h);
    smoke.addColorStop(0, '#2a3340');
    smoke.addColorStop(0.3, '#10141b');
    smoke.addColorStop(1, '#05070a');
    g.fillStyle = smoke;
    g.fillRect(slab.x, slab.y, slab.w, slab.h);
    for (const [at, wide, a] of [[0.14, 0.09, 0.07], [0.27, 0.025, 0.05], [0.71, 0.14, 0.045]] as const) {
      polygon(g, [
        [slab.x + slab.w * at, slab.y],
        [slab.x + slab.w * (at + wide), slab.y],
        [slab.x + slab.w * (at + wide) - slab.h / st, slab.y + slab.h],
        [slab.x + slab.w * at - slab.h / st, slab.y + slab.h],
      ]);
      g.fillStyle = white(a);
      g.fill();
    }
    g.restore();
    // its ground edge: bright along the far and left sides, dark along the near
    rounded(g, slab, 5, st);
    g.lineWidth = 1.1;
    g.strokeStyle = shade(PRISM_LIGHT, 1, 0.55);
    g.stroke();
    g.fillStyle = black(0.6);
    g.fillRect(slab.x + 5, slab.y + slab.h - 0.9 * st, slab.w - 10, 0.9 * st);
    mark(s, 'slab', slab);
    // the light-guides out from the lens: a hairline of white light, its ends split into the spectrum
    const r = u * 0.3;
    const gy = band.mid;
    const gh = Math.max(1, 0.9 * st);
    ([[-1, 'guide.l'], [1, 'guide.r']] as const).forEach(([side, name]) => {
      const x0 = s.width / 2 + side * r * 1.7;
      const x1 = s.width / 2 + side * slab.w * 0.42;
      const [from, to] = [Math.min(x0, x1), Math.max(x0, x1)];
      g.fillStyle = black(0.55);
      g.fillRect(from, gy - gh * 1.6, to - from, gh * 3.2);
      g.fillStyle = shade(PRISM_LIGHT, 1, 0.8);
      g.fillRect(from, gy - gh / 2, to - from, gh);
      const tip = (to - from) * 0.3;
      g.fillStyle = spectrum(g, side < 0 ? from + tip : to - tip, side < 0 ? from - tip * 0.1 : to + tip * 0.1, 0.95);
      g.fillRect(side < 0 ? from : to - tip, gy - gh, tip, gh * 2);
      mark(s, name, { x: from, y: gy - gh * 4, w: to - from, h: gh * 8 });
    });
    // the lens: a machined ring, dark glass in it, the light caught along its far rim
    const cx = s.width / 2;
    g.fillStyle = black(0.5);
    disc(g, cx, gy + r * 0.12 * st, r * 1.18, st);
    g.fill();
    const ring = g.createLinearGradient(0, gy - r * st, 0, gy + r * st);
    ring.addColorStop(0, '#c9d2de');
    ring.addColorStop(0.45, '#4a505b');
    ring.addColorStop(1, '#15171c');
    g.fillStyle = ring;
    disc(g, cx, gy, r * 1.12, st);
    g.fill();
    g.fillStyle = '#07090c';
    disc(g, cx, gy, r * 0.88, st);
    g.fill();
    const glass = g.createRadialGradient(cx - r * 0.25, gy - r * 0.3 * st, 0, cx, gy, r * 0.88);
    glass.addColorStop(0, 'rgba(120,160,220,0.5)');
    glass.addColorStop(0.5, 'rgba(40,60,100,0.3)');
    glass.addColorStop(1, 'rgba(8,10,14,0)');
    g.save();
    g.translate(0, gy);
    g.scale(1, st);
    g.translate(0, -gy);
    g.fillStyle = glass;
    g.beginPath();
    g.arc(cx, gy, r * 0.88, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = shade(PRISM_LIGHT, 1, 0.85);
    g.lineWidth = Math.max(0.8, r * 0.05);
    g.beginPath();
    g.arc(cx, gy, r * 0.74, Math.PI * 1.12, Math.PI * 1.6);
    g.stroke();
    g.fillStyle = white(0.9);
    g.beginPath();
    g.arc(cx + r * 0.3, gy + r * 0.28, r * 0.06, 0, Math.PI * 2);
    g.fill();
    g.restore();
    mark(s, 'lens', { x: cx - r * 1.12, y: gy - r * 1.12 * st, w: 2.24 * r, h: 2.24 * r * st });
  }
  // the front edge: the metal's chamfer catching the light, the light-guide's white line under it, a dark seam
  const edge = g.createLinearGradient(0, 0, 0, lip);
  edge.addColorStop(0, '#07080b');
  edge.addColorStop(0.3, '#8d97a6');
  edge.addColorStop(0.55, '#2b2f37');
  edge.addColorStop(0.62, PRISM_LIGHT);
  edge.addColorStop(0.82, PRISM_LIGHT);
  edge.addColorStop(1, '#3a4250');
  g.fillStyle = edge;
  g.fillRect(0, 0, s.width, lip);
  g.fillStyle = black(0.6);
  g.fillRect(0, lip, s.width, 0.8);
  mark(s, 'lip', { x: 0, y: 0, w: s.width, h: lip });
}

const GEAR_PLATES: Record<GearStyle, (g: CanvasRenderingContext2D, s: DeckSpec, art: GearArt) => void> = {
  prism: prismPlate,
  standard: standardPlate,
  cabinet: cabinetPlate,
  receiver: receiverPlate,
  najeon: najeonPlate,
  keyboard: keyboardPlate,
  racing: racingPlate,
  orbital: orbitalPlate,
  piano: pianoPlate,
  rawglass: rawGlassPlate,
};

/** Paints the plate of `style` on `g`, whose units are plane px: a gear from its pictures `art` (in code where one is missing). */
export function paintDeck(style: GearStyle, g: CanvasRenderingContext2D, spec: DeckSpec, art: GearArt = {}): void {
  if (art.deck && deckFromPicture(style, spec, art)) deckPicture(g, spec, art.deck);
  else {
    GEAR_PLATES[style](g, spec, art);
    wallShade(g, spec, GEAR_FRAMES[style](art).height);
  }
}

/**
 * How much longer along the track the deck pictures were drawn than they look (DeckSpec.stretch of
 * the camera they were painted from: SDVX's on a 16:9 screen). Each is the gear's whole deck painted
 * in that camera's perspective, its things standing up out of it, and laid flat on the deck
 * (scripts/assets/build_gears.py): a camera that flattens the deck more or less shows it as much
 * longer or shorter along the track, so it looks as it was painted from any camera near that one.
 */
export const DECK_PICTURE_STRETCH = 1.2;
/** A camera flattening the deck more than this (the plane one) sees it from too far off the pictures' angle: its deck is drawn in code. */
export const DECK_PICTURE_FLATTEST = 2;

/**
 * The row of lanes a gear's deck picture was painted over, for a gear with a part per lane (PIANO's
 * keys): its picture is laid only on a deck whose lanes are those, any other row drawn in code.
 */
const PICTURE_ROWS: Partial<Record<GearStyle, (s: Pick<DeckSpec, 'lanes' | 'sides'>) => boolean>> = {
  // 7K+1S: the scratch lane's cheek block, then seven white keys
  piano: (s) => s.sides.length === 0 && s.lanes.length === 8 && s.lanes[0].kind === 'scratch' && s.lanes.slice(1).every((l) => l.kind !== 'scratch' && !l.side),
};

/** Whether a gear's deck is laid from its picture: one loaded, a camera near the picture's angle, and a row of lanes it was painted for. */
export function deckFromPicture(style: GearStyle, spec: Pick<DeckSpec, 'stretch' | 'lanes' | 'sides'>, art: GearArt): boolean {
  return Boolean(art.deck) && spec.stretch <= DECK_PICTURE_FLATTEST && (PICTURE_ROWS[style]?.(spec) ?? true);
}

/**
 * A gear's deck from its picture, as wide as the deck, from its top edge; the plate runs on below it
 * (the picture's last row) where the screen shows more, and falls into shadow there over a fifth of
 * the picture's depth: a tall, narrow view (the settings' preview) shows a long way below the picture,
 * and its last row drawn out all that way read as the gear's foot stretched.
 */
function deckPicture(g: CanvasRenderingContext2D, s: DeckSpec, pic: Picture): void {
  const depth = ((pic.height / pic.width) * s.width * s.stretch) / DECK_PICTURE_STRETCH;
  g.imageSmoothingQuality = 'high';
  g.drawImage(pic, 0, 0, s.width, depth);
  if (depth >= s.depth) return;
  g.drawImage(pic, 0, pic.height - 1, pic.width, 1, 0, depth, s.width, s.depth - depth);
  const fall = Math.min(s.depth - depth, depth * 0.2);
  const shadow = g.createLinearGradient(0, depth, 0, depth + fall);
  shadow.addColorStop(0, black(0));
  shadow.addColorStop(1, black(0.92));
  g.fillStyle = shadow;
  g.fillRect(0, depth, s.width, s.depth - depth);
}

/**
 * The shade a picked gear's walls (`height` plane px high) throw on its deck, the light coming from
 * the top-left: the left wall's across its left edge, a dark line at the right wall's foot.
 */
function wallShade(g: CanvasRenderingContext2D, s: DeckSpec, height: number): void {
  if (height <= 0) return;
  const reach = height * 1.4;
  const left = g.createLinearGradient(0, 0, reach, 0);
  left.addColorStop(0, black(0.42));
  left.addColorStop(1, black(0));
  g.fillStyle = left;
  g.fillRect(0, 0, reach, s.depth);
  const foot = height * 0.35;
  const right = g.createLinearGradient(s.width - foot, 0, s.width, 0);
  right.addColorStop(0, black(0));
  right.addColorStop(1, black(0.3));
  g.fillStyle = right;
  g.fillRect(s.width - foot, 0, foot, s.depth);
}

/**
 * How a gear's border looks: the two lines down the track's edges, from its far end past the gear
 * (the rails), in the gear's own frame (paintBorder): as wide as it is (`width`), one picture `tile`
 * px long down the track, with a look of its own in FEVER (paint's `lit`: the renderer keeps both
 * pictures), standing `height` px high beside the lanes.
 */
export interface SideLook {
  /** The colour of the frame's inner face, under what it is made of (face). */
  body: string;
  /** Its width (plane px), one picture's length down the track, and its paint (the left frame; the right is it mirrored). */
  width: number;
  tile: number;
  paint: (g: CanvasRenderingContext2D, w: number, h: number, scale: number, lit: boolean) => void;
  /**
   * It stands this high beside the lanes (plane px): the renderer raises its top so high and stands
   * its inner face (paintFace) down to the track at the lanes' edge.
   */
  height: number;
  /** What that inner face is made of: a tile `w` along the track by `h` high, its top edge at the top (paintFace shades it). */
  face: (g: CanvasRenderingContext2D, w: number, h: number, scale: number, lit: boolean) => void;
}

/**
 * One border in `look` on a `w` × `h` canvas (a tile repeating down the track), `scale` canvas px to
 * a plane px: `side` -1 the left border (its right edge faces the lanes), 1 the right one.
 */
export function paintBorder(g: CanvasRenderingContext2D, w: number, h: number, look: SideLook, side: -1 | 1, scale: number, lit = false): void {
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
}

/**
 * A wall's inner face in `look` on a `w` × `h` canvas (a tile repeating along the track, its top
 * edge at the canvas's top), `scale` canvas px to a plane px: the gear's own face (look.face) in the
 * light from the top-left, its top edge lit, its foot in shade where it meets the track, the left
 * wall's face (`side` -1, turned from the light) darker than the right one's.
 */
export function paintFace(g: CanvasRenderingContext2D, w: number, h: number, look: SideLook, side: -1 | 1, scale: number, lit = false): void {
  g.fillStyle = look.body;
  g.fillRect(0, 0, w, h);
  look.face(g, w, h, scale, lit);
  const fall = g.createLinearGradient(0, 0, 0, h);
  fall.addColorStop(0, white(0.06));
  fall.addColorStop(0.4, white(0));
  fall.addColorStop(1, black(0.5));
  g.fillStyle = fall;
  g.fillRect(0, 0, w, h);
  g.fillStyle = side < 0 ? black(0.3) : white(0.03);
  g.fillRect(0, 0, w, h);
  g.fillStyle = white(0.3);
  g.fillRect(0, 0, w, Math.max(1, 0.7 * scale));
}

/** `pic` on a wall's face with its long side along the track (as it runs down the frame's top), `d` picture px to a canvas px. */
function grainAlong(g: CanvasRenderingContext2D, pic: Picture | undefined, w: number, h: number, d: number): void {
  if (!pic) return;
  g.save();
  g.translate(0, h);
  g.rotate(-Math.PI / 2);
  g.imageSmoothingQuality = 'high';
  g.drawImage(pic, 0, 0, Math.min(pic.width, h * d), Math.min(pic.height, w * d), 0, 0, h, w);
  g.restore();
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
/** How long a tile of ORBITAL's frame is (plane px): its foil 20 px wide is a strip of the picture as long for its width (1:6), so it is not stretched. */
const ORBITAL_TILE = 120;

/** Each gear's frame, from its pictures (in code where one is missing). */
const GEAR_FRAMES: Record<GearStyle, (art: GearArt) => SideLook> = {
  // brushed graphite with the cyan line down its inner edge
  standard: (art) => ({
    body: '#2a2c31',
    width: 14,
    tile: 56,
    height: 16,
    // brushed graphite along the track, the cyan light just under its top edge
    face: (g, w, h, k, lit) => {
      const rand = seeded(17);
      for (let y = 0; y < h; y += k) {
        g.fillStyle = white(0.012 + rand() * 0.025);
        g.fillRect(0, y, w, 0.6 * k);
      }
      g.fillStyle = shade(CYAN, lit ? 1.15 : 1, lit ? 0.95 : 0.55);
      g.fillRect(0, 2 * k, w, 1.1 * k);
    },
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
    width: 28,
    tile: 30,
    height: 30,
    // the side panel's ABS under its chrome trim
    face: (g, w, h, k) => {
      plateGrain(g, art.plate, w, h, k);
      const chrome = g.createLinearGradient(0, 0, 0, 3 * k);
      chrome.addColorStop(0, '#9a9ea6');
      chrome.addColorStop(1, '#3a3d43');
      g.fillStyle = chrome;
      g.fillRect(0, 0, w, 3 * k);
    },
    paint: (g, w, h, k, lit) => {
      g.fillStyle = '#17181b';
      g.fillRect(0, 0, w, h);
      plateGrain(g, art.plate, w, h, k);
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
    width: 30,
    tile: 60,
    height: 30,
    // the cabinet's walnut, its grain along the track, under the aluminium trim (warm in FEVER)
    face: (g, w, h, k, lit) => {
      if (art.frame) grainAlong(g, art.frame, w, h, art.frame.width / (30 * k));
      const alu = g.createLinearGradient(0, 0, 0, 3.5 * k);
      alu.addColorStop(0, lit ? '#ffd59a' : '#e6e9ed');
      alu.addColorStop(0.6, lit ? '#d9902e' : '#a2a7ae');
      alu.addColorStop(1, '#2a2b2e');
      g.fillStyle = alu;
      g.fillRect(0, 0, w, 3.5 * k);
    },
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
    width: 30,
    tile: art.frame ? Math.round((NAJEON_VINE * art.frame.height) / art.frame.width) : 48,
    height: 30,
    // black lacquer, a gold line under its top edge (brighter in FEVER)
    face: (g, w, h, k, lit) => {
      const lacquer = g.createLinearGradient(0, 0, 0, h);
      lacquer.addColorStop(0, '#17140f');
      lacquer.addColorStop(1, '#050404');
      g.fillStyle = lacquer;
      g.fillRect(0, 0, w, h);
      g.fillStyle = shade(BRASS, lit ? 1.25 : 1, 0.9);
      g.fillRect(0, 2 * k, w, 0.8 * k);
    },
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
  // the case's side in its bead-blasted charcoal: the polished chamfer along the lanes with an orange line under it (bright in FEVER), a hex screw in each tile
  keyboard: (art) => ({
    body: '#2b2d32',
    width: 26,
    tile: 64,
    height: 22,
    // the case's side wall under its polished chamfer, an orange glow under it in FEVER
    face: (g, w, h, k, lit) => {
      plateGrain(g, art.plate, w, h, k);
      const chamfer = g.createLinearGradient(0, 0, 0, 2.4 * k);
      chamfer.addColorStop(0, '#e6e9ed');
      chamfer.addColorStop(1, '#5c6168');
      g.fillStyle = chamfer;
      g.fillRect(0, 0, w, 2.4 * k);
      if (lit) {
        g.fillStyle = shade(ORANGE, 1, 0.35);
        g.fillRect(0, 2.4 * k, w, 4 * k);
      }
    },
    paint: (g, w, h, k, lit) => {
      g.fillStyle = '#2b2d32';
      g.fillRect(0, 0, w, h);
      plateGrain(g, art.plate, w, h, k);
      g.fillStyle = black(0.6);
      g.fillRect(0, 0, 1.2 * k, h);
      trim(g, w, h, 3.4, k, [
        [0, '#26282c'],
        [0.3, '#e6e9ed'],
        [0.65, '#9fa4ac'],
        [1, '#2f3237'],
      ]);
      if (lit) {
        // its light over the chamfer
        g.fillStyle = shade(ORANGE, 1, 0.3);
        g.fillRect(w - 7 * k, 0, 5 * k, h);
      }
      g.fillStyle = shade(ORANGE, lit ? 1.15 : 1, lit ? 1 : 0.6);
      g.fillRect(w - 5.2 * k, 0, 1.3 * k, h);
      hexScrew(g, (w - 6 * k) / 2, h / 2, 2.6 * k, 1);
    },
  }),
  // carbon, a strip of black suede along the lanes stitched in red, a red line at its edge (stitches and line bright in FEVER)
  racing: (art) => ({
    body: '#141517',
    width: 30,
    tile: 40,
    height: 30,
    // a suede bolster with a seam of red stitches along it (bright in FEVER)
    face: (g, w, h, k, lit) => {
      g.fillStyle = '#19191b';
      g.fillRect(0, 0, w, h);
      const rand = seeded(31);
      for (let i = 0; i < 200; i++) {
        g.fillStyle = rand() < 0.5 ? white(0.035) : black(0.2);
        g.fillRect(rand() * (w - 0.6 * k), rand() * (h - 0.6 * k), 0.6 * k, 0.6 * k);
      }
      g.fillStyle = lit ? '#ff4b52' : '#b81c22';
      for (let x = k; x + 3 * k <= w; x += 5 * k) g.fillRect(x, h * 0.32, 3 * k, 0.8 * k);
      if (lit) {
        g.fillStyle = shade(RACE_RED, 1, 0.3);
        g.fillRect(0, 0, w, 3 * k);
      }
    },
    paint: (g, w, h, k, lit) => {
      g.fillStyle = '#141517';
      g.fillRect(0, 0, w, h);
      plateGrain(g, art.plate, w, h, k);
      g.fillStyle = black(0.6);
      g.fillRect(0, 0, 1.2 * k, h);
      // the suede, dull black with a fine nap
      const [x0, x1] = [w - 15 * k, w - 3 * k];
      g.fillStyle = '#19191b';
      g.fillRect(x0, 0, x1 - x0, h);
      const rand = seeded(29);
      for (let i = 0; i < 240; i++) {
        g.fillStyle = rand() < 0.5 ? white(0.035) : black(0.2);
        g.fillRect(x0 + rand() * (x1 - x0), rand() * h, 0.6 * k, 0.6 * k);
      }
      g.fillStyle = black(0.5);
      g.fillRect(x0, 0, 0.8 * k, h);
      g.fillRect(x1 - 0.8 * k, 0, 0.8 * k, h);
      // the stitches down both its sides
      g.fillStyle = lit ? '#ff4b52' : '#b81c22';
      for (const sx of [x0 + 2 * k, x1 - 2.8 * k]) for (let sy = k; sy < h; sy += 5 * k) g.fillRect(sx, sy, 0.8 * k, 3 * k);
      if (lit) {
        // the red line's light over the suede
        g.fillStyle = shade(RACE_RED, 1, 0.3);
        g.fillRect(w - 5 * k, 0, 5 * k, h);
      }
      g.fillStyle = shade(RACE_RED, lit ? 1.15 : 0.85, lit ? 1 : 0.75);
      g.fillRect(w - 1.6 * k, 0, 1.2 * k, h);
    },
  }),
  // gold foil (an insulation blanket, stitched at each tile's ends) between a yellow handrail on the
  // outer edge and a grey painted rail along the lanes, an amber lamp on the rail in each tile (in FEVER
  // the lamps lit, the rail's edge an amber light and the rail in its glow)
  orbital: (art) => ({
    body: '#b8902c',
    width: 30,
    tile: ORBITAL_TILE,
    height: 32,
    // the strut's gold foil under the grey rail's edge (amber in FEVER)
    face: (g, w, h, k, lit) => {
      if (art.frame) grainAlong(g, art.frame, w, h, art.frame.width / (20 * k));
      g.fillStyle = lit ? '#d8c39a' : '#c3c6cb';
      g.fillRect(0, 0, w, 3 * k);
      g.fillStyle = lit ? AMBER : black(0.4);
      g.fillRect(0, 3 * k, w, 0.8 * k);
    },
    paint: (g, w, h, k, lit) => {
      const [f0, f1] = [5 * k, w - 5 * k];
      g.fillStyle = '#b8902c';
      g.fillRect(0, 0, w, h);
      if (art.frame) {
        g.imageSmoothingQuality = 'high';
        g.drawImage(art.frame, f0, 0, f1 - f0, h);
      } else {
        const foil = g.createLinearGradient(f0, 0, f1, 0);
        foil.addColorStop(0, '#7a5a14');
        foil.addColorStop(0.45, '#e8c35a');
        foil.addColorStop(1, '#8a6418');
        g.fillStyle = foil;
        g.fillRect(f0, 0, f1 - f0, h);
      }
      g.fillStyle = black(0.45);
      g.fillRect(f0, 0, f1 - f0, 1.2 * k);
      g.fillRect(f0, h - 1.2 * k, f1 - f0, 1.2 * k);
      // the handrail: its shadow on the foil, the yellow tube, a grey bracket in the tile's middle
      g.fillStyle = black(0.35);
      g.fillRect(4.6 * k, 0, 1.8 * k, h);
      const rail = g.createLinearGradient(0.6 * k, 0, 4.6 * k, 0);
      rail.addColorStop(0, '#7a5c0c');
      rail.addColorStop(0.35, '#ffe066');
      rail.addColorStop(0.6, '#f2c230');
      rail.addColorStop(1, '#6e530a');
      g.fillStyle = rail;
      g.fillRect(0.6 * k, 0, 4 * k, h);
      g.fillStyle = '#5c6066';
      g.fillRect(0, h / 2 - 2.5 * k, 6.5 * k, 5 * k);
      g.fillStyle = white(0.25);
      g.fillRect(0, h / 2 - 2.5 * k, 6.5 * k, 0.8 * k);
      // the rail along the lanes: grey paint, its seam, its lit edge, the lamp
      g.fillStyle = lit ? '#d8c39a' : '#c3c6cb';
      g.fillRect(f1, 0, w - f1, h);
      g.fillStyle = black(0.5);
      g.fillRect(f1, 0, 0.8 * k, h);
      g.fillStyle = lit ? AMBER : white(0.45);
      g.fillRect(w - 1.2 * k, 0, 0.8 * k, h);
      lamp(g, f1 + 2.4 * k, h / 2, 1.7 * k, 1, AMBER, lit);
      g.fillStyle = black(0.6);
      g.fillRect(0, 0, 0.6 * k, h);
    },
  }),
  // the piano's rim: polished ebony lacquer with a long reflection down it, a brass line along the
  // lanes (brighter, its warm light on the lacquer, in FEVER)
  piano: () => ({
    body: '#0b0a0b',
    width: 24,
    tile: 64,
    height: 26,
    // the rim's side: lacquer catching the light under its rounded top edge, the brass line just under it
    face: (g, w, h, k, lit) => {
      const lacquer = g.createLinearGradient(0, 0, 0, h);
      lacquer.addColorStop(0, '#2b292d');
      lacquer.addColorStop(0.2, '#0f0e10');
      lacquer.addColorStop(1, '#030303');
      g.fillStyle = lacquer;
      g.fillRect(0, 0, w, h);
      g.fillStyle = white(0.06);
      g.fillRect(0, h * 0.5, w, 1.2 * k);
      g.fillStyle = shade(BRASS, lit ? 1.3 : 1.05, lit ? 1 : 0.85);
      g.fillRect(0, 2.2 * k, w, 0.8 * k);
    },
    paint: (g, w, h, k, lit) => {
      const lacquer = g.createLinearGradient(0, 0, w, 0);
      lacquer.addColorStop(0, '#030303');
      lacquer.addColorStop(0.3, '#18171a');
      lacquer.addColorStop(0.42, '#3a383d');
      lacquer.addColorStop(0.56, '#121113');
      lacquer.addColorStop(1, '#060506');
      g.fillStyle = lacquer;
      g.fillRect(0, 0, w, h);
      g.fillStyle = black(0.6);
      g.fillRect(0, 0, k, h);
      if (lit) {
        g.fillStyle = shade(BRASS, 1.2, 0.22);
        g.fillRect(w - 6 * k, 0, 5.4 * k, h);
      }
      g.fillStyle = shade(BRASS, lit ? 1.35 : 1.1, lit ? 1 : 0.9);
      g.fillRect(w - 3.4 * k, 0, 1.1 * k, h);
    },
  }),
  // PRISM: a rail of satin black anodised aluminium, its outer edge chamfered, and along the lanes a
  // glass light-guide: clear glass with a hairline of white light in it (in FEVER the light split
  // into the spectrum, running down the rail, and the glass lit)
  prism: () => ({
    body: ANODISED,
    width: 20,
    tile: 128,
    height: 22,
    // the rail's side: the light-guide seen through its edge, bright under its top, the metal below
    face: (g, w, h, _k, lit) => {
      const side = g.createLinearGradient(0, 0, 0, h);
      side.addColorStop(0, PRISM_LIGHT);
      side.addColorStop(0.16, lit ? '#b9d6ff' : '#7f8da3');
      side.addColorStop(0.34, '#252a33');
      side.addColorStop(1, '#090a0d');
      g.fillStyle = side;
      g.fillRect(0, 0, w, h);
      if (lit) {
        g.fillStyle = spectrum(g, 0, w, 0.5);
        g.fillRect(0, 0, w, h * 0.3);
      }
    },
    paint: (g, w, h, k, lit) => {
      g.fillStyle = ANODISED;
      g.fillRect(0, 0, w, h);
      const guide = 6.5 * k;
      const x = w - guide;
      const metal = g.createLinearGradient(0, 0, x, 0);
      metal.addColorStop(0, '#050608');
      metal.addColorStop(0.1, '#7c8696');
      metal.addColorStop(0.2, '#23262d');
      metal.addColorStop(0.7, ANODISED);
      metal.addColorStop(1, '#0a0b0e');
      g.fillStyle = metal;
      g.fillRect(0, 0, x, h);
      // the glass: clear, darker toward the metal, a hairline of light down it
      const glass = g.createLinearGradient(x, 0, w, 0);
      glass.addColorStop(0, '#0d1117');
      glass.addColorStop(0.35, lit ? '#5f7ea8' : '#39424f');
      glass.addColorStop(1, lit ? '#b9d6ff' : '#8996a8');
      g.fillStyle = glass;
      g.fillRect(x, 0, guide, h);
      if (lit) {
        // the spectrum down the tile and back (a tile mirrors at every other: it runs on)
        const run = g.createLinearGradient(0, 0, 0, h);
        PRISM_SPECTRUM.forEach((c, i) => run.addColorStop(i / (PRISM_SPECTRUM.length - 1), c));
        g.fillStyle = run;
        g.globalAlpha = 0.55;
        g.fillRect(x, 0, guide, h);
        g.globalAlpha = 1;
      }
      g.fillStyle = lit ? '#ffffff' : PRISM_LIGHT;
      g.fillRect(x + guide * 0.42, 0, Math.max(1, 1.1 * k), h);
      g.fillStyle = white(lit ? 0.9 : 0.6);
      g.fillRect(w - Math.max(1, 0.7 * k), 0, Math.max(1, 0.7 * k), h);
    },
  }),
  // rails of the same raw glass along the lanes: a dark seam outside, a broken outer face in shade,
  // a white ridge, the top broken into flat planes slanting across it, the ground inner edge
  // catching the light (the ridges whiter and a cool light in the glass in FEVER)
  rawglass: () => ({
    body: '#b9c0c8',
    width: 22,
    tile: 96,
    height: 24,
    // the rail's side: thick glass seen through its cut edge, white under its ridge, grey below
    face: (g, w, h, k, lit) => {
      const edge = g.createLinearGradient(0, 0, 0, h);
      edge.addColorStop(0, GLASS_PALE);
      edge.addColorStop(0.12, '#c4cad2');
      edge.addColorStop(0.45, '#7d848e');
      edge.addColorStop(0.8, '#3c4148');
      edge.addColorStop(1, '#16191d');
      g.fillStyle = edge;
      g.fillRect(0, 0, w, h);
      g.fillStyle = white(0.3);
      g.fillRect(0, h * 0.38, w, 0.9 * k);
      if (lit) {
        g.fillStyle = 'rgba(214,232,255,0.22)';
        g.fillRect(0, 0, w, h);
      }
    },
    paint: (g, w, h, k, lit) => {
      const across = g.createLinearGradient(0, 0, w, 0);
      across.addColorStop(0, '#202328');
      across.addColorStop(0.08, '#5c636c');
      across.addColorStop(0.26, '#a3aab4');
      across.addColorStop(0.3, lit ? '#ffffff' : GLASS_PALE);
      across.addColorStop(0.34, '#d3d9df');
      across.addColorStop(0.62, '#b9c0c8');
      across.addColorStop(0.78, '#8e959f');
      across.addColorStop(0.84, lit ? '#ffffff' : '#eef1f4');
      across.addColorStop(1, '#c9ced5');
      g.fillStyle = across;
      g.fillRect(0, 0, w, h);
      // flat breaks slanting across its top, each catching the light or not
      const rand = seeded(61);
      for (let y = 0; y < h; y += h / 4) {
        const y1 = y + h * (0.12 + 0.1 * rand());
        polygon(g, [
          [w * 0.3, y],
          [w * 0.84, y1],
          [w * 0.84, y1 + h * 0.1],
          [w * 0.3, y + h * 0.16],
        ]);
        g.fillStyle = rand() < 0.5 ? white(0.24) : 'rgba(22,25,30,0.24)';
        g.fill();
        g.strokeStyle = white(0.6);
        g.lineWidth = 0.6 * k;
        g.beginPath();
        g.moveTo(w * 0.3, y);
        g.lineTo(w * 0.84, y1);
        g.stroke();
      }
      g.fillStyle = black(0.6);
      g.fillRect(0, 0, k, h);
      if (lit) {
        g.fillStyle = 'rgba(214,232,255,0.16)';
        g.fillRect(0, 0, w, h);
      }
    },
  }),
};

/** A gear's frame from its pictures `art` (in code where one is missing). */
export function gearBorderLook(style: GearStyle, art: GearArt): SideLook {
  return GEAR_FRAMES[style](art);
}
