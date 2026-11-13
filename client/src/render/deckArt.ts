import deckPanels from './deckPanels.json';


/**
 * The gear: the track's frame down its edges and, under the judge line, a plate. The gears a player
 * picks (설정 → 기어, GEAR_STYLES) are each one object, none of them lit per lane (the lanes and the
 * key beams show the keys; only PIANO's keys follow the lanes, going down with them: deckKeys): a red
 * judge line a little above them (GEAR_JUDGE) and the object's own panel under it, drawn from its
 * pictures where they loaded (render/styleArt.ts) and in code where not:
 *
 * - STANDARD (기본): the game's own controller, graphite rails with a cyan line, smoked glass with a
 *   glass jog dial, the game's name over a cyan light strip and a speaker grille;
 * - PIANO (피아노): the keyboard end of a concert grand in polished ebony lacquer, the one gear with a
 *   key per lane: an ivory white key under each key lane from just under the lacquer lip with its
 *   brass inlay, the black keys of an octave between them, and a cheek block with a brass treble
 *   clef medallion under the scratch lane (a plain one under a side lane); a white key goes down
 *   while its lane's key is held; its frame the piano's rim, black lacquer with a brass line along
 *   the lanes.
 * - PRISM (크리스털): the crystal skin's gear, as wide as the track and no wider: a row of frosted
 *   crystal key caps, one to a lane, cut as emeralds are (the held one lit ice blue: deckKeys), over a
 *   deck of broad flat facets in white, pale ice blue and pale lavender; set in it three long hexagons
 *   of sapphire glass, pointed as its gem note is, where the HUD writes the score, the speed and the
 *   rate (deckReadouts); its frame thin rails of clear glass (crystalPlate);
 * - SKY (하늘): the sky skin's gear: a thin navy strip with a dash to a lane (the held lane's lit cyan)
 *   over a deck that is a window onto the sky (a painting where it is loaded, the same in plain shapes
 *   otherwise): blue easing lighter toward the player, a cumulus at each end, thin white wind trails
 *   across it and a feather (a picture too) left of the score, which is written on the sky itself; the speed and the rate
 *   in two see-through pills; rails of pale glass with a white line; and its sky laid very faintly over
 *   the lanes with its wind trails and an altimeter's ticks along their edges (GEAR_FLOORS: skyPlate,
 *   skyFloor);
 * - FIRE (파이어스타터): the Firestarter skin's gear, a pop group's comeback stage in gloss black, chrome
 *   and one hot red: a row of polished chrome key caps (the held lane's glows orange-red) over a deck of
 *   candy-red lacquer with black wedges cut into it, the score in a window of black glass in a chrome
 *   bevel, the speed and the rate in two dark pills; rails of chrome with a red line; a white-hot judge
 *   line (firePlate). The group's illustration stands at its two sides (standees.ts);
 * - GPT, GEMINI, GROK and CLAUDE: the gears of four AI companies' skins, each in its company's key colour
 *   and manner: GPT a chat window in teal green (white key tiles, the score in a white message box with
 *   its round send button, typing dots, a reply's thumb and copy marks); GEMINI a dark material surface
 *   (pills that light blue, red, yellow, green, a light of blue through violet to pink under them, a few
 *   sparkles); GROK pure black and white (outlined boxes, a field of stars, readouts between square
 *   brackets); CLAUDE a page of cream paper with a terracotta band (warm-grey keys, the score in an ivory
 *   card, a ball of thread drawn by hand). Their notes are the company's mark and two stickers stand at
 *   their sides: pictures that come with the build (standees.ts; gptPlate, geminiPlate, grokPlate, claudePlate);
 * - AQUA (아쿠아): the aqua mecha skin's gear, the console of a clean white machine: a row of gloss key
 *   caps in a white frame (the blue lanes' aqua; the held lane's glows aqua), a white collar under it and
 *   white shoulders cut at 45° over a deck of dark teal glass, the score in a white plate with cut
 *   corners, aqua vents beside it, and in the lower row the speed, a white ring cut by three arrows and
 *   the rate, pink hatch marks between them; rails of white with an aqua line inside and a pink one
 *   outside (aquaPlate);
 * - STEEL (스틸): the gunmetal skin's gear, studio hardware in dark slate: a row of flush matte key caps
 *   embossed with a plus or a cross (the held lane's lights steel blue), a slot glowing blue under them,
 *   and two matte panels with the score, the speed and the rate in dark capsule windows; thin slate
 *   rails (steelPlate);
 * - NOIR (레드라인): the black and red skin's gear, flat cyber graphics: a row of thin hexagonal slots
 *   (the held lane's fills red) over a black deck crossed by dark-red slanting bands and thin red arcs,
 *   with clusters of red dots, a white block over a red one, white slanting stripes, red chevrons and
 *   pixel glyphs; the score, the speed and the rate written as outlined digits on black plates with
 *   corner ticks; hairline rails with ticks (noirPlate);
 * - WIRE (화이트 라인): the white line skin's gear, line art in white light on near-black: a strip of thin
 *   outlines shaped as shallow trays (the held lane's fills white) over a deck with two thin tilted
 *   orbits, a few small bars drawn as blocks and clusters of dots at its far corners, and a soft white
 *   light rising from its near edge; the readouts written with no boxes, and between the two smaller
 *   ones an open ring with two dots and a small trapezoid; hairline rails with ticks (wirePlate);
 * - ASTRAL (별밤): the starry night skin's gear, a night sky in deep navy: a row of navy key caps with cut
 *   corners in a pale rim, a small gold four-pointed star on each (the held lane's lights gold), over a
 *   deck with a faint star chart (circles, a tilted orbit, tiny stars) and a few pale flowers at its far
 *   corners; the readouts written with no boxes over a fine rule, and between the two smaller ones a
 *   white four-pointed star with a pair of pale wings under a row of moon phases; navy rails with a
 *   moon-blue line (astralPlate).
 */
export type GearStyle = 'prism' | 'sky' | 'fire' | 'gpt' | 'gemini' | 'grok' | 'claude' | 'aqua' | 'steel' | 'noir' | 'wire' | 'astral' | 'standard' | 'piano';
/** The gears a player picks: the skins' first (기본, 크리스털, 하늘, 파이어스타터, the four AI companies'), then the piano. */
export const GEAR_STYLES: GearStyle[] = ['standard', 'prism', 'sky', 'fire', 'gpt', 'gemini', 'grok', 'claude', 'aqua', 'steel', 'noir', 'wire', 'astral', 'piano'];
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
  /**
   * How much of it the screen shows, to the px (from its top edge to the screen's bottom edge; `room` is that in
   * steps): a skin's panel is laid as deep, so that all of its picture is in view whichever camera is picked
   * (panelSpan). The picture keeps its own proportions where this is not given.
   */
  shown?: number;
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
export type GearPart = 'deck' | 'panel' | 'plate' | 'frame' | 'jog' | 'medallion' | 'feather' | 'crests';
export type GearArt = Partial<Record<GearPart, Picture>>;

/**
 * The judge line of the gears a player picks, as DJMAX draws its own: a thick red line (`height` plane px) with
 * a light core and a red glow both ways (`blur`), a little above the gear: `gap` plane px of the lanes
 * lie between them at most, where a note let through runs on until the gear covers it: it is how far
 * 판정선 위치 lowers the line (−20 %), onto the gear.
 */
export const GEAR_JUDGE = { line: '#ff2b3b', core: '#ffd2d6', glow: '#ff2b3b', height: 16, blur: 22, gap: 40 } as const;
/**
 * How far under the line the gear starts (plane px of lanes between them) with the line where it is by
 * default: nearer than GEAR_JUDGE.gap, so the screen shows more of the deck (the readouts on it were
 * found too small to read). A line lowered further than this takes the gear down with it, up to
 * GEAR_JUDGE.gap, where the gear was before.
 */
export const DECK_GAP = 24;

/**
 * The judge line's colours on a gear: GEAR_JUDGE's red, but the skins' own: STANDARD's (a white core in its cyan), SKY's (in sky blue) and PRISM's, a white line edged in ice blue
 * (its scratch is a ruby: a red line would hide the gem's razor as it lands; white to its edges, it
 * would hide the white keys' notes). Its place and size are
 * the same on every gear.
 */
export function judgeOf(style: GearStyle): { line: string; core: string; glow: string; height: number; blur: number; gap: number } {
  if (style === 'prism') return { ...GEAR_JUDGE, line: CRYSTAL_LINE, core: '#ffffff', glow: CRYSTAL_ICE };
  // SKY's: a white line in a sky-blue glow, as a horizon
  if (style === 'sky') return { ...GEAR_JUDGE, line: '#6dbcf7', core: '#ffffff', glow: '#58aef0' };
  // FIRE's: a white-hot wire in a red glow
  if (style === 'fire') return { ...GEAR_JUDGE, line: '#ff3b2f', core: '#ffffff', glow: '#ff2b1f' };
  // the AI companies': GPT's white in its green, GEMINI's in its violet and blue, GROK's bare white, CLAUDE's cream in its terracotta
  if (style === 'gpt') return { ...GEAR_JUDGE, line: '#12b38b', core: '#ffffff', glow: GPT_GREEN };
  if (style === 'gemini') return { ...GEAR_JUDGE, line: GEMINI_VIOLET, core: '#ffffff', glow: '#6f8ff5' };
  if (style === 'grok') return { ...GEAR_JUDGE, line: '#ffffff', core: '#ffffff', glow: '#6a6a6a' };
  if (style === 'claude') return { ...GEAR_JUDGE, line: CLAUDE_CLAY, core: '#fff6ee', glow: CLAUDE_CLAY };
  // AQUA's: white in its aqua
  if (style === 'aqua') return { ...GEAR_JUDGE, line: '#19c9d2', core: '#ffffff', glow: AQUA_CYAN };
  // STEEL's: white in a steel blue
  if (style === 'steel') return { ...GEAR_JUDGE, line: '#6fb2e8', core: '#ffffff', glow: STEEL_BLUE };
  // NOIR's: white in its red
  if (style === 'noir') return { ...GEAR_JUDGE, line: NOIR_RED, core: '#ffffff', glow: NOIR_RED };
  // WIRE's: bare white in a faint cool glow
  if (style === 'wire') return { ...GEAR_JUDGE, line: '#ffffff', core: '#ffffff', glow: '#9fb4d8' };
  // ASTRAL's: white in a moon blue
  if (style === 'astral') return { ...GEAR_JUDGE, line: '#8fb4ff', core: '#ffffff', glow: '#7fa6f2' };
  // STANDARD's: a white core in the gear's cyan
  if (style === 'standard') return { ...GEAR_JUDGE, line: '#2bc4e4', core: '#ffffff', glow: CYAN };
  return GEAR_JUDGE;
}

/** A box `w` across about (cx, cy), `aspect` as deep as wide on the screen (`st` times longer along the track). */
function boxAt(cx: number, cy: number, w: number, st: number, aspect = 1): Box {
  const h = w * aspect * st;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
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

/**
 * The depths of STANDARD's deck, and CRYSTAL's (plane px across, drawn `stretch` times longer along the track): its row of key caps, the seam
 * under it, its upper step with the score, its lower step with the speed and the rate.
 */
const STD = { keys: 44, seam: 3, upper: 46, lower: 44, pad: 4 } as const;

/** The readouts a deck houses (the HUD writes them there): their windows, plane px from the deck's top-left corner. */
export interface DeckReadouts {
  speed: Box;
  score: Box;
}

/** The windows a deck drawn in code has: the score's, SPEED's, and a third at the far end from SPEED's (the rate's once: it is under the judgement now, and the window is left as the plate's own). */
export interface PlateWindows extends DeckReadouts {
  rate: Box;
}

/** How long each point of CRYSTAL's readout plates is for a window `h` deep (plane px across), and how far into it the window reaches. */
const gemPoint = (h: number, st: number) => (h / st) * 0.6;
const GEM_WINDOW = 0.45;

/**
 * The depths of SKY's deck: a thin strip of key dashes, the white line under it, the step with the
 * score written in its lower part (the feather beside it), the step with the speed's and the rate's pills (`pill`:
 * how far inside that step they lie). No deeper in all than STANDARD's: the default camera on a 16:9
 * screen shows hardly more of the deck, and a deck that does not fit loses its readouts to the panel
 * beside the gear (deckReadouts).
 */
const SKY = { keys: 14, seam: 2, upper: 72, lower: 46, pad: 5, score: 34, pill: 8 } as const;

/**
 * The depths of FIRE's deck: its row of chrome key caps (the light under them in its last `glow`), the
 * chrome trim, the step with the score's window, the step with the speed's and the rate's pills. As
 * deep in all as STANDARD's.
 */
const FIRE = { keys: 42, seam: 3, upper: 48, lower: 44, pad: 4, glow: 7 } as const;

/** The depths of the AI companies' decks (GPT, GEMINI, GROK, CLAUDE): the row of keys, the seam, the step with the score, the step with the speed and the rate. As deep in all as STANDARD's. */
const BRAND = { keys: 42, seam: 3, upper: 48, lower: 44, pad: 4 } as const;

/**
 * The depths of AQUA's deck: its row of gloss key caps in their white frame, the white collar under it,
 * the step with the score's plate, the step with the speed, the emblem and the rate. As deep in all as
 * STANDARD's.
 */
const AQUA = { keys: 40, seam: 5, upper: 48, lower: 44, pad: 4 } as const;

/**
 * The depths of STEEL's deck: its row of flush key caps, the dark band with the glowing slot, the far
 * panel with the score, the near panel with the speed and the rate. As deep in all as STANDARD's.
 */
const STEEL = { keys: 38, seam: 8, upper: 46, lower: 44, pad: 4 } as const;

/**
 * The depths of NOIR's deck: its strip of thin slots, the red hairline under it, the step with the
 * score, the step with the speed and the rate. Shallower in all than STANDARD's: the deck's graphics
 * run on under them.
 */
const NOIR = { keys: 28, seam: 2, upper: 46, lower: 42, pad: 4 } as const;

/**
 * The depths of WIRE's deck: its strip of tray outlines, the white hairline under it, the step with the
 * score, the step with the speed, the mark and the rate. Shallower in all than STANDARD's.
 */
const WIRE = { keys: 26, seam: 2, upper: 46, lower: 44, pad: 4 } as const;

/**
 * The depths of ASTRAL's deck: its row of key caps, the pale hairline under it, the step with the score,
 * the step with the speed, the star and the rate. As deep in all as STANDARD's.
 */
const ASTRAL = { keys: 42, seam: 3, upper: 48, lower: 44, pad: 4 } as const;

/** How wide the speed's and the rate's windows are at a deck's two ends (share of the deck's width). */
const SMALL_WINDOW = 0.23;

/** The steps of the decks that house the readouts. */
const DECK_STEPS: Partial<Record<GearStyle, { keys: number; seam: number; upper: number; lower: number; pad: number }>> = { standard: STD, prism: STD, sky: SKY, fire: FIRE, gpt: BRAND, gemini: BRAND, grok: BRAND, claude: BRAND, aqua: AQUA, steel: STEEL, noir: NOIR, wire: WIRE, astral: ASTRAL };

/**
 * Where a skin's deck has its readouts: the score in a wide window in the middle of the upper step,
 * the speed and the rate in two at the ends of the lower step (STANDARD's pills; CRYSTAL's long
 * hexagons, whose points lie outside the windows: gemPlate; SKY's score written on the sky in the
 * lower part of its step, the feather left of it, and its two see-through pills; the AI companies'
 * decks have the speed and the rate by the middle, under the score); null where the screen
 * shows too little of the deck for them (a small preview) or the gear houses none.
 */
export function plateWindows(style: GearStyle, s: Pick<DeckSpec, 'width' | 'room' | 'stretch'>): PlateWindows | null {
  const d = DECK_STEPS[style];
  if (!d) return null;
  const st = s.stretch;
  const top = (d.keys + d.seam) * st;
  if (s.room < top + (d.upper + d.lower * 0.6) * st) return null;
  const sky = style === 'sky';
  const pad = (sky ? SKY.pill : d.pad) * st;
  const upper: Box = sky
    ? { x: s.width * 0.25, y: top + (d.upper - SKY.score - 2) * st, w: s.width * 0.5, h: SKY.score * st }
    : { x: s.width * 0.24, y: top + d.pad * st, w: s.width * 0.52, h: d.upper * st - 2 * d.pad * st };
  const y = top + d.upper * st + pad;
  const h = Math.min(d.lower * st, s.room - top - d.upper * st) - 2 * pad;
  // the AI companies' decks: the two by the deck's middle, under the score (stickers lie over these decks' near corners: standees.ts)
  if (isBrandGear(style)) {
    const w = s.width * 0.2;
    return { score: upper, speed: { x: s.width * 0.275, y, w, h }, rate: { x: s.width * 0.525, y, w, h } };
  }
  // wide enough for the rate's seven characters beside its label at the size the score's row leaves them (SMALL_WINDOW)
  const w = s.width * SMALL_WINDOW;
  // a hexagon's point outside its window: the plates start as far from the deck's edges as STANDARD's pills
  const edge = s.width * (style === 'prism' ? 0.03 : 0.035) + (style === 'prism' ? gemPoint(h, st) * (1 - GEM_WINDOW) : 0);
  return { score: upper, speed: { x: edge, y, w, h }, rate: { x: s.width - edge - w, y, w, h } };
}

/**
 * A skin's panel: the painting its deck's lower part is, under its row of keys: one picture, painted by the image model
 * as the game's camera sees that part of the screen and laid flat again (scripts/assets/build_skin_panels.py): its size
 * (px) and, for a picture that has a display, where the display's glass is in it (shares of the picture: left, top,
 * right, bottom): the score and SPEED are written on that glass. None of the skins' panels has one (each is a picture
 * all over), and a panel with no display houses no readout: its gear's stand beside it, in the HUD's column.
 */
export interface DeckPanel {
  size: readonly [number, number];
  glass?: readonly [number, number, number, number];
}
export const DECK_PANELS = deckPanels as unknown as Readonly<Partial<Record<GearStyle, DeckPanel>>>;

/** How deep a picture as wide as the deck lies on it (plane px): its own proportions, drawn as much longer along the track as the camera flattens the deck. */
const panelDepth = (size: readonly [number, number], s: Pick<DeckSpec, 'width' | 'stretch'>) => (size[1] / size[0]) * s.width * s.stretch;

/** A panel is never laid shallower than this share of its picture's own depth (a preview that shows next to none of the deck). */
const PANEL_FLATTEST = 0.25;

/**
 * Where a skin's panel lies on its deck (plane px from the deck's top edge): from under its row of keys down to the
 * screen's bottom edge (DeckSpec.shown), so that all of its picture is in view whichever camera is picked: a camera
 * that shows less of the deck than the picture is deep (the lower it looks along the track, the less it shows) has
 * the picture pressed that much shallower. Never deeper than the picture's own proportions make it across the deck,
 * drawn as much longer along the track as the camera flattens the deck (that deep where `shown` is not given): a
 * camera that shows more of the deck has the picture's last row run on (panelPainting). Null for a gear with no panel.
 */
export function panelSpan(style: GearStyle, s: Pick<DeckSpec, 'width' | 'stretch' | 'shown'>, size: readonly [number, number] | undefined = DECK_PANELS[style]?.size): { top: number; tall: number } | null {
  const d = DECK_STEPS[style];
  if (!d || !size) return null;
  const top = (d.keys + d.seam) * s.stretch;
  const own = panelDepth(size, s);
  return { top, tall: s.shown === undefined ? own : Math.min(own, Math.max(s.shown - top, own * PANEL_FLATTEST)) };
}

/** The share of a panel's display the score's row takes, of what its two rows have between them (SPEED's the rest). */
const PANEL_SCORE = 0.6;
/** The two rows are written on a panel's display where the screen shows this much of it for them, at least (px of the sheets). */
const PANEL_ROWS = 36;

/**
 * How far under a panel's far edge a light of the plate's may reach onto the panel (plane px before the stretch), for the
 * gears whose plate lights more than its seam there. GEMINI's plate has a light that rises under the keys and fades into a
 * dark deck, 20 px deep: over its panel, which is pale, the light read as a bright band across the picture's far edge, cut
 * off from the rest. Cut to what GPT's seam light reaches, it stays a glow along the seam.
 */
const PANEL_LIGHT: Partial<Record<GearStyle, number>> = { gemini: 3 };

/**
 * The parts of a skin's panel that its gear lights (gearLights.ts), by the names the lights know them by: where each is
 * in the picture, shares of it (left, top, width, height), measured on the picture itself (assets-src/gears/panels; the
 * px in the notes are of a picture 2048 across and 876 deep). The panel covers what its plate drew in code there, marks
 * and all, so a light whose part the picture does not have stays dark over it (the crystal's three plates, the sky's
 * feather).
 */
export const PANEL_MARKS: Readonly<Partial<Record<GearStyle, Readonly<Record<string, readonly [number, number, number, number]>>>>> = {
  // the light strip near its near edge: 610..1438 across, 759..795 deep
  standard: { strip: [610 / 2048, 759 / 876, 828 / 2048, 36 / 876] },
  // in FEVER the whole sky brightens, the whole stage glows hotter
  sky: { sky: [0, 0, 1, 1] },
  fire: { lacquer: [0, 0, 1, 1] },
  // the mark's lens, 300 px round (1024, 445): its light reaches the three arrows round it
  aqua: { emblem: [874 / 2048, 295 / 876, 300 / 2048, 300 / 876] },
  // the blue light window at the shelf's right end: 1513..2040 across, 350..480 deep
  steel: { side: [1513 / 2048, 350 / 876, 527 / 2048, 130 / 876] },
  // the two rows of teeth near its near edge, left and right: 323..609 and 1439..1725 across, 629..735 deep
  noir: { dots: [323 / 2048, 629 / 876, 286 / 2048, 106 / 876], 'dots.1': [1439 / 2048, 629 / 876, 286 / 2048, 106 / 876] },
  // the mark, 300 px round (1024, 400): its light reaches its ring; and the projector's light rising from the near edge
  wire: { emblem: [874 / 2048, 250 / 876, 300 / 2048, 300 / 876], rise: [424 / 2048, 600 / 876, 1200 / 2048, 276 / 876] },
  // the star's middle, 180 px round (1024, 440): its glint reaches the star's points
  astral: { emblem: [934 / 2048, 350 / 876, 180 / 2048, 180 / 876] },
};

/**
 * Where a skin's deck has its readouts: on its panel's display where the panel is laid (`panel`: its picture
 * loaded), the score across the glass's upper part and SPEED under it in the middle; otherwise in the windows
 * its plate draws in code (plateWindows). Null where the screen shows too little of the deck for them (a small
 * preview) or the gear houses none: an object gear, or a skin whose panel has no display (whether its picture is
 * in yet or not, so the readouts do not move once it is). `picture`: the gear's panel (its own, from the table).
 */
export function deckReadouts(style: GearStyle, s: Pick<DeckSpec, 'width' | 'room' | 'stretch' | 'shown'>, panel = false, picture: DeckPanel | undefined = DECK_PANELS[style]): DeckReadouts | null {
  if (picture && !picture.glass) return null;
  const display = panel ? picture?.glass : undefined;
  const span = panelSpan(style, s, picture?.size);
  if (!span || !display) {
    const windows = plateWindows(style, s);
    return windows && { score: windows.score, speed: windows.speed };
  }
  const { top, tall } = span;
  const [left, far, right, near] = display;
  const glass: Box = { x: left * s.width, y: top + far * tall, w: (right - left) * s.width, h: (near - far) * tall };
  // the two rows fill the glass but for a margin at its edges and between them, the score's the deeper; a screen that
  // shows less of the deck than the glass (a low camera) has them in the part of the glass it shows
  const [edge, gap] = [glass.h * 0.05, glass.h * 0.04];
  const rows = Math.min(glass.h, s.room - glass.y - edge) - 2 * edge - gap;
  if (rows < PANEL_ROWS * s.stretch) return null;
  const score: Box = { x: glass.x + glass.w * 0.03, y: glass.y + edge, w: glass.w * 0.94, h: rows * PANEL_SCORE };
  const wide = Math.min(glass.w * 0.56, s.width * 0.26);
  const speed: Box = { x: s.width / 2 - wide / 2, y: score.y + score.h + gap, w: wide, h: rows * (1 - PANEL_SCORE) };
  return { score, speed };
}

/**
 * Lays a skin's panel over what its plate drew in code under its keys: the picture across the deck, and on a
 * camera that shows more of the deck than the picture, its last row run on into shade. The lights of what the plate
 * drew there go with it (their marks), and the picture's own parts take theirs (PANEL_MARKS).
 */
function panelPainting(style: GearStyle, g: CanvasRenderingContext2D, s: DeckSpec, pic: Picture): void {
  const span = panelSpan(style, s, [pic.width, pic.height]);
  if (!span) return;
  const { top, tall } = span;
  g.save();
  g.beginPath();
  g.rect(0, top, s.width, s.depth - top);
  g.clip();
  g.imageSmoothingQuality = 'high';
  g.drawImage(pic, 0, top, s.width, tall);
  const under = s.depth - top - tall;
  if (under > 0) {
    g.drawImage(pic, 0, pic.height - 1, pic.width, 1, 0, top + tall, s.width, under);
    const fall = g.createLinearGradient(0, top + tall, 0, top + tall + Math.min(under, tall * 0.5));
    fall.addColorStop(0, 'rgba(0,0,0,0)');
    fall.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = fall;
    g.fillRect(0, top + tall, s.width, under);
  }
  g.restore();
  if (!s.marks) return;
  const reach = PANEL_LIGHT[style];
  const kept = s.marks.filter((m) => m.y < top).map((m) => (reach === undefined ? m : { ...m, h: Math.min(m.h, top + reach * s.stretch - m.y) }));
  s.marks.length = 0;
  s.marks.push(...kept);
  // the picture's own parts: as wide as the picture has them across the deck, as deep as the picture is laid
  for (const [name, [left, far, wide, deep]] of Object.entries(PANEL_MARKS[style] ?? {})) mark(s, name, { x: left * s.width, y: top + far * tall, w: wide * s.width, h: deep * tall });
}

/** A readout's window: a dark well with a hairline round it, `r` round at its corners. */
function well(g: CanvasRenderingContext2D, b: Box, r: number, st: number): void {
  rounded(g, b, r, st);
  g.fillStyle = '#0a0b0e';
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = white(0.1);
  g.stroke();
  g.fillStyle = black(0.5);
  g.fillRect(b.x + r, b.y, b.w - 2 * r, 1.2 * st);
}

/**
 * STANDARD (기본): the house gear, matte graphite with one accent, as wide as the track and no wider.
 * Under the judge line a row of low key caps, one to a lane, that light when their lane's key is held
 * (deckKeys); under them two steps: the upper, its ends cut back, with the score's window in its
 * middle; the lower with the speed's and the rate's pills at its ends and a cyan light strip along
 * its front edge. The HUD writes the readouts in the windows (deckReadouts).
 */
function standardPlate(g: CanvasRenderingContext2D, s: DeckSpec): void {
  const st = s.stretch;
  g.fillStyle = '#111216';
  g.fillRect(0, 0, s.width, s.depth);
  // the key caps: a graphite cap in each lane, its top edge catching the light, its foot in shade
  const kh = STD.keys * st;
  for (const lane of s.lanes) {
    const cap: Box = { x: lane.left + 2, y: 2 * st, w: lane.width - 4, h: kh - 4 * st };
    rounded(g, cap, 3, st);
    const face = g.createLinearGradient(0, cap.y, 0, cap.y + cap.h);
    face.addColorStop(0, '#4a4e58');
    face.addColorStop(0.5, '#363940');
    face.addColorStop(1, '#282a30');
    g.fillStyle = face;
    g.fill();
    g.fillStyle = white(0.2);
    g.fillRect(cap.x + 3, cap.y, cap.w - 6, Math.max(1, 0.9 * st));
    g.fillStyle = black(0.5);
    g.fillRect(cap.x + 3, cap.y + cap.h - 1.6 * st, cap.w - 6, 1.6 * st);
  }
  // the seam under the caps
  g.fillStyle = '#050608';
  g.fillRect(0, kh, s.width, STD.seam * st);
  const top = kh + STD.seam * st;
  // the upper step, its ends cut back so the lower one shows there
  const lowerFill = g.createLinearGradient(0, top, 0, s.room);
  lowerFill.addColorStop(0, '#1b1d22');
  lowerFill.addColorStop(1, '#101115');
  g.fillStyle = lowerFill;
  g.fillRect(0, top, s.width, s.depth - top);
  const uh = STD.upper * st;
  const cut = s.width * 0.2;
  const slope = Math.min(s.width * 0.035, uh / st);
  polygon(g, [
    [cut - slope, top],
    [s.width - cut + slope, top],
    [s.width - cut, top + uh],
    [cut, top + uh],
  ]);
  const upperFill = g.createLinearGradient(0, top, 0, top + uh);
  upperFill.addColorStop(0, '#2c2e35');
  upperFill.addColorStop(1, '#22242a');
  g.fillStyle = upperFill;
  g.fill();
  g.fillStyle = white(0.14);
  g.fillRect(cut - slope, top, s.width - 2 * (cut - slope), Math.max(1, 0.8 * st));
  g.fillStyle = black(0.55);
  g.fillRect(cut, top + uh - 1.4 * st, s.width - 2 * cut, 1.4 * st);
  const windows = plateWindows('standard', s);
  if (windows) {
    well(g, windows.score, 4, st);
    well(g, windows.speed, windows.speed.h / (2 * st), st);
    well(g, windows.rate, windows.rate.h / (2 * st), st);
  }
  // the light strip along the front edge of what the screen shows
  const strip: Box = { x: s.width * 0.3, y: Math.max(top + uh + 2 * st, s.room - 7 * st), w: s.width * 0.4, h: 1.6 * st };
  rounded(g, strip, 0.8, st);
  g.fillStyle = shade(CYAN, 1, 0.7);
  g.fill();
  mark(s, 'strip', { x: strip.x, y: strip.y - 4 * st, w: strip.w, h: strip.h + 8 * st });
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
  /** Lit in this colour while held (STANDARD's key caps, CRYSTAL's), where the key does not go down in shade (PIANO's). */
  lit?: string;
  /** A cap cut as a gem (CRYSTAL's), drawn this many times longer along the track (DeckSpec.stretch): lit, it keeps its cut (crystalCap). */
  gem?: number;
  /** A dash in the middle of its box (SKY's), this share of the box across and along: lit, the dash white in a glow of its colour. */
  dash?: [number, number];
  /** A cap inside its box (FIRE's: shares of the box, x, y, w, h): lit, the cap glows as heated metal and its colour's light burns under its near edge. */
  ember?: [number, number, number, number];
  /** Held, the cap is one flat colour (the AI companies' gears: BRAND_PRESS), its corners `round` plane px, a dot in its middle or none; `stretch`: DeckSpec.stretch. */
  press?: { fill: string; dot?: string; round: number; stretch: number };
}

/** Where PIANO's deck picture has its keys (px of the picture, `width` across): the white keys from under the lip, the black keys' near ends (build_gears.py lays it flat). */
const PIANO_PICTURE_KEYS = { width: 2048, top: 26, blackEnd: 299 } as const;

/**
 * The keys of `style`'s deck that go down with their lanes (none but PIANO's white keys), where the
 * deck shows them: as its picture drew them (`pictured`, laid as deckPicture lays it) or as its
 * plate draws them in code.
 */
export function deckKeys(style: GearStyle, s: DeckSpec, pictured: boolean): DeckKey[] {
  if (style === 'standard' || style === 'prism') {
    // its key caps, one to a lane (see standardPlate, crystalPlate)
    const st = s.stretch;
    const gem = style === 'prism';
    return s.lanes.map((lane, i) => ({ lane: i, box: capBox(lane, st), notch: { left: 0, right: 0, depth: 0 }, lit: gem ? CRYSTAL_ICE : CYAN, ...(gem ? { gem: st } : {}) }));
  }
  if (style === 'sky') {
    // its dashes, one to a lane (skyPlate): the lit one's light fills the lane's cell of the strip
    const st = s.stretch;
    return s.lanes.map((lane, i) => {
      const dash = dashBox(lane, st);
      const box: Box = { x: lane.left, y: 0, w: lane.width, h: SKY.keys * st };
      return { lane: i, box, notch: { left: 0, right: 0, depth: 0 }, lit: SKY_CYAN, dash: [dash.w / box.w, dash.h / box.h] as [number, number] };
    });
  }
  if (style === 'fire') {
    // its chrome caps, one to a lane (firePlate): the held one's light is over the cap and under it
    const st = s.stretch;
    return s.lanes.map((lane, i) => {
      const cap = fireCap(lane, st);
      const box: Box = { x: lane.left, y: 0, w: lane.width, h: FIRE.keys * st };
      return { lane: i, box, notch: { left: 0, right: 0, depth: 0 }, lit: FIRE_HOT, ember: [(cap.x - box.x) / box.w, cap.y / box.h, cap.w / box.w, cap.h / box.h] as [number, number, number, number] };
    });
  }
  if (isBrandGear(style)) {
    // their keys, one to a lane (gptPlate and the others): the held one in its company's flat colour
    const st = s.stretch;
    return s.lanes.map((lane, i) => ({ lane: i, box: brandCap(lane, st), notch: { left: 0, right: 0, depth: 0 }, press: { ...BRAND_PRESS[style](i), stretch: st } }));
  }
  if (style === 'aqua') {
    // its gloss caps, one to a lane (aquaPlate): the held one full of aqua light
    const st = s.stretch;
    return s.lanes.map((lane, i) => ({ lane: i, box: aquaCap(lane, st), notch: { left: 0, right: 0, depth: 0 }, lit: AQUA_CYAN }));
  }
  if (style === 'steel') {
    // its flush caps, one to a lane (steelPlate): the held one lit steel blue
    const st = s.stretch;
    return s.lanes.map((lane, i) => ({ lane: i, box: steelCap(lane, st), notch: { left: 0, right: 0, depth: 0 }, lit: STEEL_LIT }));
  }
  if (style === 'noir') {
    // its slots, one to a lane (noirPlate): the held one full of red
    const st = s.stretch;
    return s.lanes.map((lane, i) => ({ lane: i, box: noirSlot(lane, st), notch: { left: 0, right: 0, depth: 0 }, press: { fill: NOIR_RED, round: 1.5, stretch: st } }));
  }
  if (style === 'wire') {
    // its trays, one to a lane (wirePlate): the held one full of white light
    const st = s.stretch;
    return s.lanes.map((lane, i) => ({ lane: i, box: wireTray(lane, st), notch: { left: 0, right: 0, depth: 0 }, press: { fill: '#ffffff', round: 1, stretch: st } }));
  }
  if (style === 'astral') {
    // its caps, one to a lane (astralPlate): the held one full of gold light
    const st = s.stretch;
    return s.lanes.map((lane, i) => ({ lane: i, box: astralCap(lane, st), notch: { left: 0, right: 0, depth: 0 }, lit: '#f6d98a' }));
  }
  // PIANO's white keys, each cut back at its far corners where a black key stands over it
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
/**
 * A key cap lit while held, painted over the cap (a `w` × `h` canvas over its box): the cap filled with
 * its colour's light, brightest along its far edge, a rim of the colour round it; a cap cut as a gem
 * (CRYSTAL's) the same cut full of light. Drawn once; the renderer shows it while the lane's key is held.
 */
export function paintLitKey(g: CanvasRenderingContext2D, w: number, h: number, key: Pick<DeckKey, 'box' | 'lit' | 'gem' | 'dash' | 'ember' | 'press'>): void {
  if (key.press) {
    // the cap in one flat colour, round at its corners as the cap is on the screen, a dot in its middle or none
    const [kx, ky] = [w / key.box.w, h / key.box.h];
    const across = Math.min(key.box.w, key.box.h / key.press.stretch);
    const r = Math.min(key.press.round, across / 2);
    g.beginPath();
    g.roundRect(0, 0, w, h, [{ x: r * kx, y: r * key.press.stretch * ky }]);
    g.fillStyle = key.press.fill;
    g.fill();
    if (key.press.dot) {
      g.beginPath();
      g.ellipse(w / 2, h / 2, across * 0.12 * kx, across * 0.12 * key.press.stretch * ky, 0, 0, Math.PI * 2);
      g.fillStyle = key.press.dot;
      g.fill();
    }
    return;
  }
  if (key.gem) {
    g.save();
    g.scale(w / key.box.w, h / key.box.h);
    crystalCap(g, { x: 0, y: 0, w: key.box.w, h: key.box.h }, key.gem, true);
    g.restore();
    return;
  }
  const colour = key.lit ?? '#ffffff';
  if (key.ember) {
    // the cap heated: white-hot along its near edge, its colour over the rest, and the light burning out from under that edge
    const [cx, cy, cw, ch] = [key.ember[0] * w, key.ember[1] * h, key.ember[2] * w, key.ember[3] * h];
    const heat = g.createLinearGradient(0, cy, 0, cy + ch);
    heat.addColorStop(0, shade(colour, 1, 0.34));
    heat.addColorStop(0.6, shade(colour, 1.1, 0.6));
    heat.addColorStop(1, shade('#fff1d6', 1, 0.96));
    g.fillStyle = heat;
    g.fillRect(cx, cy, cw, ch);
    const under = g.createLinearGradient(0, cy + ch, 0, h);
    under.addColorStop(0, shade('#fff1d6', 1, 0.95));
    under.addColorStop(0.35, shade(colour, 1.1, 0.85));
    under.addColorStop(1, shade(colour, 1, 0));
    g.fillStyle = under;
    g.fillRect(cx - cw * 0.03, cy + ch, cw * 1.06, h - cy - ch);
    return;
  }
  if (key.dash) {
    // the dash white-hot in the middle of its cell, its colour's glow round it, melting away before the cell's edges
    const [dw, dh] = [key.dash[0] * w, Math.max(2, key.dash[1] * h * 1.25)];
    g.save();
    g.translate(w / 2, h / 2);
    g.scale(1, h / w);
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, w * 0.5);
    glow.addColorStop(0, shade(colour, 1, 0.7));
    glow.addColorStop(0.55, shade(colour, 1, 0.26));
    glow.addColorStop(1, shade(colour, 1, 0));
    g.fillStyle = glow;
    g.beginPath();
    g.arc(0, 0, w * 0.5, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.beginPath();
    g.roundRect((w - dw) / 2, (h - dh) / 2, dw, dh, dh / 2);
    g.fillStyle = shade(colour, 1.6, 1);
    g.fill();
    g.beginPath();
    g.roundRect((w - dw * 0.82) / 2, (h - dh * 0.46) / 2, dw * 0.82, dh * 0.46, dh / 4);
    g.fillStyle = white(0.95);
    g.fill();
    return;
  }
  g.beginPath();
  g.roundRect(0, 0, w, h, Math.min(w, h) * 0.12);
  const glow = g.createLinearGradient(0, 0, 0, h);
  glow.addColorStop(0, shade(colour, 1.25, 0.95));
  glow.addColorStop(0.5, shade(colour, 1, 0.75));
  glow.addColorStop(1, shade(colour, 0.8, 0.6));
  g.fillStyle = glow;
  g.fill();
  g.lineWidth = Math.max(2, w * 0.06);
  g.strokeStyle = white(0.85);
  g.stroke();
}

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

// ---------- CRYSTAL (the crystal skin's gear; its parts are saved as 'prism') ----------

/** CRYSTAL's ice blue (a held cap's light, its labels, the judge line's glow) and the judge line's edge, a little deeper so the white notes show on it. */
const CRYSTAL_ICE = '#7cc8ff';
const CRYSTAL_LINE = '#58b4ff';
/** White light split into pastels, rose to violet (the light running down CRYSTAL's rails in FEVER). */
const CRYSTAL_PASTELS = ['#ffc4dd', '#ffe2bd', '#fff5c4', '#c8f4d8', '#bfe9ff', '#c5d3ff', '#dccaff'] as const;

/** A rectangle with its corners cut off (`cut` across and along): from its far edge's left end, clockwise. */
function octagon(b: Box, cut: readonly [number, number]): [number, number][] {
  const [cx, cy] = cut;
  return [
    [b.x + cx, b.y],
    [b.x + b.w - cx, b.y],
    [b.x + b.w, b.y + cy],
    [b.x + b.w, b.y + b.h - cy],
    [b.x + b.w - cx, b.y + b.h],
    [b.x + cx, b.y + b.h],
    [b.x, b.y + b.h - cy],
    [b.x, b.y + cy],
  ];
}

/** A crystal cap's tones: its table from far to near, the bevel round it (far, right, near, left, then the corners from the far left round), its front face from its top down, and the ridges of its cut. */
interface CapTones {
  table: readonly [string, string];
  bevel: readonly [string, string, string, string];
  corner: readonly [string, string, string, string];
  front: readonly [string, string];
  ridge: string;
}
const CAP_IDLE: CapTones = {
  table: ['#f4f7fb', '#dce4f0'],
  bevel: ['#ffffff', '#bdc9dc', '#98a6bf', '#e9eff8'],
  corner: ['#f7fafd', '#d6dfec', '#a6b3c9', '#c4cfe1'],
  front: ['#7b88a1', '#4c576e'],
  ridge: 'rgba(255,255,255,0.7)',
};
const CAP_LIT: CapTones = {
  table: ['#d6f2ff', '#8ad0fc'],
  bevel: ['#f4fcff', '#62b3ec', '#4a9ad9', '#c8ecff'],
  corner: ['#e6f8ff', '#8ccdf6', '#57a6e2', '#9ad6f9'],
  front: ['#4189cb', '#28609e'],
  ridge: 'rgba(255,255,255,0.9)',
};

/** The box of a key cap over `lane`: STANDARD's and CRYSTAL's rows, a little inside the lane. */
const capBox = (lane: DeckLane, st: number): Box => ({ x: lane.left + 2, y: 2 * st, w: lane.width - 4, h: (STD.keys - 4) * st });

/**
 * One of CRYSTAL's key caps in box `b`: a block of frosted crystal cut as an emerald is, its corners
 * cut off; its table frosted, the bevel round it catching the light along its far and left sides and
 * in shade along its right and near ones, and under its near edge the block's front face, so it
 * stands up out of the deck. `lit`: the cap while its key is held, the same cut full of ice-blue
 * light, its table crossed corner to corner by two facet lines.
 */
function crystalCap(g: CanvasRenderingContext2D, b: Box, st: number, lit: boolean): void {
  const t = lit ? CAP_LIT : CAP_IDLE;
  const front = Math.min(5 * st, b.h * 0.14);
  const top: Box = { x: b.x, y: b.y, w: b.w, h: b.h - front };
  const cut: [number, number] = [Math.min(5, top.w * 0.16), Math.min(5 * st, top.h * 0.22)];
  const rim: [number, number] = [Math.min(4.5, top.w * 0.14), Math.min(4.5 * st, top.h * 0.2)];
  const o = octagon(top, cut);
  const i = octagon({ x: top.x + rim[0], y: top.y + rim[1], w: top.w - 2 * rim[0], h: top.h - 2 * rim[1] }, [cut[0] * 0.55, cut[1] * 0.55]);
  const down = ([x, y]: [number, number]): [number, number] => [x, y + front];
  // the front face under the near edge, its cut corners turned from the light
  polygon(g, [o[6], o[5], o[4], o[3], down(o[3]), down(o[4]), down(o[5]), down(o[6])]);
  const face = g.createLinearGradient(0, top.y + top.h - cut[1], 0, b.y + b.h);
  face.addColorStop(0, t.front[0]);
  face.addColorStop(1, t.front[1]);
  g.fillStyle = face;
  g.fill();
  polygon(g, [o[3], o[4], down(o[4]), down(o[3])]);
  g.fillStyle = black(0.22);
  g.fill();
  polygon(g, [o[6], o[5], down(o[5]), down(o[6])]);
  g.fillStyle = white(0.1);
  g.fill();
  // the bevel: four planes and the four cut corners between them
  const quad = (a: number, c: number, tone: string) => {
    polygon(g, [o[a], o[c], i[c], i[a]]);
    g.fillStyle = tone;
    g.fill();
  };
  quad(0, 1, t.bevel[0]);
  quad(2, 3, t.bevel[1]);
  quad(4, 5, t.bevel[2]);
  quad(6, 7, t.bevel[3]);
  quad(7, 0, t.corner[0]);
  quad(1, 2, t.corner[1]);
  quad(3, 4, t.corner[2]);
  quad(5, 6, t.corner[3]);
  // the table
  const table: Box = { x: top.x + rim[0], y: top.y + rim[1], w: top.w - 2 * rim[0], h: top.h - 2 * rim[1] };
  polygon(g, i);
  const frost = g.createLinearGradient(0, table.y, 0, table.y + table.h);
  frost.addColorStop(0, t.table[0]);
  frost.addColorStop(1, t.table[1]);
  g.fillStyle = frost;
  g.fill();
  g.save();
  polygon(g, i);
  g.clip();
  if (lit) {
    // two facet lines corner to corner: the far plane lighter, the near one deeper
    const [cx, cy] = [table.x + table.w / 2, table.y + table.h / 2];
    polygon(g, [[table.x, table.y], [table.x + table.w, table.y], [cx, cy]]);
    g.fillStyle = white(0.3);
    g.fill();
    polygon(g, [[table.x, table.y + table.h], [table.x + table.w, table.y + table.h], [cx, cy]]);
    g.fillStyle = 'rgba(40,110,190,0.22)';
    g.fill();
    polygon(g, [[table.x + table.w, table.y], [table.x + table.w, table.y + table.h], [cx, cy]]);
    g.fillStyle = 'rgba(40,110,190,0.1)';
    g.fill();
    g.lineWidth = 0.7;
    g.strokeStyle = white(0.75);
    g.beginPath();
    g.moveTo(table.x, table.y);
    g.lineTo(table.x + table.w, table.y + table.h);
    g.moveTo(table.x + table.w, table.y);
    g.lineTo(table.x, table.y + table.h);
    g.stroke();
  } else {
    // frosted: one soft slant of light, no glint
    const lean = table.h / st;
    polygon(g, [
      [table.x + table.w * 0.16 + lean * 0.5, table.y],
      [table.x + table.w * 0.46 + lean * 0.5, table.y],
      [table.x + table.w * 0.46 - lean * 0.5, table.y + table.h],
      [table.x + table.w * 0.16 - lean * 0.5, table.y + table.h],
    ]);
    g.fillStyle = white(0.34);
    g.fill();
  }
  g.restore();
  // the ridges of the cut: round the table, and from its corners out
  g.lineWidth = 0.7;
  g.strokeStyle = t.ridge;
  polygon(g, i);
  g.stroke();
  g.beginPath();
  for (let n = 0; n < 8; n++) {
    g.moveTo(o[n][0], o[n][1]);
    g.lineTo(i[n][0], i[n][1]);
  }
  g.globalAlpha = 0.55;
  g.stroke();
  g.globalAlpha = 1;
}

/**
 * One of CRYSTAL's readout plates round the window `b`: a long hexagon, pointed at both ends as the
 * skin's gem note is (its points outside the window: gemPoint), of deep sapphire glass, set in the
 * deck: a dark hairline where it meets the deck, a thin bevelled rim catching the light along its far
 * side, and one facet line inside it, with the short ridges of its points.
 */
function gemPlate(g: CanvasRenderingContext2D, b: Box, st: number): void {
  const point = gemPoint(b.h, st);
  const [x0, x1] = [b.x - point * (1 - GEM_WINDOW), b.x + b.w + point * (1 - GEM_WINDOW)];
  const [yt, yb, yc] = [b.y, b.y + b.h, b.y + b.h / 2];
  // half its depth as the screen shows it, and the hexagon `d` px inside its outline all round
  const hh = b.h / (2 * st);
  const sin = hh / Math.hypot(point, hh);
  const hexagon = (d: number): [number, number][] => {
    const tip = d / sin;
    const run = (point * (hh - d)) / hh;
    return [
      [x0 + tip, yc],
      [x0 + tip + run, yt + d * st],
      [x1 - tip - run, yt + d * st],
      [x1 - tip, yc],
      [x1 - tip - run, yb - d * st],
      [x0 + tip + run, yb - d * st],
    ];
  };
  // where it meets the deck
  polygon(g, hexagon(-1));
  g.fillStyle = 'rgba(16,26,60,0.55)';
  g.fill();
  // the rim: lit along the far side, in shade along the near
  polygon(g, hexagon(0));
  const rim = g.createLinearGradient(0, yt, 0, yb);
  rim.addColorStop(0, '#ffffff');
  rim.addColorStop(0.45, '#d5e6f8');
  rim.addColorStop(0.55, '#a9bfdf');
  rim.addColorStop(1, '#7f95bd');
  g.fillStyle = rim;
  g.fill();
  // the sapphire
  const body = hexagon(2);
  polygon(g, body);
  const glass = g.createLinearGradient(0, yt, 0, yb);
  glass.addColorStop(0, '#2a4a9a');
  glass.addColorStop(0.5, '#1f3577');
  glass.addColorStop(1, '#172553');
  g.fillStyle = glass;
  g.fill();
  // its far half a flat plane a little lighter
  g.save();
  polygon(g, body);
  g.clip();
  g.fillStyle = 'rgba(120,170,255,0.09)';
  g.fillRect(x0, yt, x1 - x0, b.h / 2);
  g.restore();
  // the facet line inside, and the ridges of the points
  const inner = hexagon(5);
  g.lineWidth = 0.8;
  g.strokeStyle = 'rgba(124,170,240,0.6)';
  polygon(g, inner);
  g.stroke();
  g.beginPath();
  g.moveTo(body[0][0], body[0][1]);
  g.lineTo(inner[0][0], inner[0][1]);
  g.moveTo(body[3][0], body[3][1]);
  g.lineTo(inner[3][0], inner[3][1]);
  g.stroke();
}

/** CRYSTAL's facets: the left half's, each by its corners (shares of the deck's width, and of the readouts' two steps down from under the caps) and its tone there and mirrored on the right, a shade deeper (the light comes from the left). */
const CRYSTAL_FACETS: readonly { at: readonly (readonly [number, number])[]; tones: readonly [string, string] }[] = [
  // beside the score's plate: two planes meeting on a ridge from the far corner
  { at: [[0, 0], [0.2, 0], [0, 0.56]], tones: ['#e7ddf1', '#d9d0ea'] },
  { at: [[0.2, 0], [0.31, 0.5], [0, 0.56]], tones: ['#d3d1ee', '#c6c5e7'] },
  // under the plate (they show at its points and along its edges)
  { at: [[0.2, 0], [0.5, 0], [0.31, 0.5]], tones: ['#cfe6f8', '#c2dbf2'] },
  { at: [[0.5, 0], [0.5, 0.62], [0.31, 0.5]], tones: ['#f4f7fb', '#e9eff7'] },
  // the near step: the plane the speed's (the rate's) plate lies in, and two meeting on the deck's middle
  { at: [[0, 0.56], [0.31, 0.5], [0.26, 1], [0, 1]], tones: ['#eef2f9', '#e1e9f4'] },
  { at: [[0.31, 0.5], [0.5, 0.62], [0.4, 1], [0.26, 1]], tones: ['#d4daf2', '#c8d0ec'] },
  { at: [[0.5, 0.62], [0.5, 1], [0.4, 1]], tones: ['#e6ebf8', '#dae2f3'] },
];

/**
 * CRYSTAL (크리스털): the crystal skin's gear, as wide as the track and no wider. Under the judge line
 * a row of frosted crystal key caps, one to a lane (crystalCap), the held one lit ice blue (deckKeys);
 * under them the deck, cut as a stone's crown is into a few broad flat facets, white, pale ice blue
 * and pale lavender, a hairline of light along each ridge and the faintest wash of pastels over them
 * (no glints, and no light moves on them: the notes are the brightest things on the screen); set in
 * it the three readout plates (gemPlate), where the HUD writes the score, the speed and the rate
 * (deckReadouts), the only parts of it that light with the music.
 */
function crystalPlate(g: CanvasRenderingContext2D, s: DeckSpec): void {
  const st = s.stretch;
  const W = s.width;
  // the bed the caps stand in: dark, so each cap's cut shows
  g.fillStyle = '#0b0f1c';
  g.fillRect(0, 0, W, s.depth);
  for (const lane of s.lanes) crystalCap(g, capBox(lane, st), st, false);
  const top = (STD.keys + STD.seam) * st;
  // the facets over the readouts' two steps; below them (a tall view shows a long way down the deck)
  // one plain plane, a ridge between
  const H = (STD.upper + STD.lower) * st;
  g.save();
  g.beginPath();
  g.rect(0, top, W, s.depth - top);
  g.clip();
  g.fillStyle = '#d3d9ea';
  g.fillRect(0, top + H, W, Math.max(0, s.depth - top - H));
  g.lineWidth = 0.8;
  g.lineJoin = 'round';
  for (const side of [0, 1] as const) {
    for (const facet of CRYSTAL_FACETS) {
      polygon(
        g,
        facet.at.map(([u, v]): [number, number] => [(side ? 1 - u : u) * W, top + v * H]),
      );
      g.fillStyle = facet.tones[side];
      g.fill();
      g.strokeStyle = white(0.75);
      g.stroke();
    }
  }
  // the faintest wash of pastels across them: rose, ice, violet
  const wash = g.createLinearGradient(0, top, W, top + H);
  wash.addColorStop(0, 'rgba(255,170,212,0.13)');
  wash.addColorStop(0.28, 'rgba(255,255,255,0)');
  wash.addColorStop(0.5, 'rgba(140,222,255,0.12)');
  wash.addColorStop(0.72, 'rgba(255,255,255,0)');
  wash.addColorStop(1, 'rgba(186,160,255,0.13)');
  g.fillStyle = wash;
  g.fillRect(0, top, W, s.depth - top);
  // that plane falls into shade
  if (s.depth > top + H) {
    const fall = g.createLinearGradient(0, top + H, 0, Math.min(s.depth, top + 2.2 * H));
    fall.addColorStop(0, 'rgba(14,20,44,0.06)');
    fall.addColorStop(1, 'rgba(14,20,44,0.78)');
    g.fillStyle = fall;
    g.fillRect(0, top + H, W, s.depth - top - H);
  }
  g.restore();
  // its far edge under the caps: their shadow on it, then the ground edge catching the light
  const shadow = g.createLinearGradient(0, top, 0, top + 5 * st);
  shadow.addColorStop(0, 'rgba(20,28,58,0.4)');
  shadow.addColorStop(1, 'rgba(20,28,58,0)');
  g.fillStyle = shadow;
  g.fillRect(0, top, W, 5 * st);
  g.fillStyle = white(0.9);
  g.fillRect(0, top, W, Math.max(1, 0.8 * st));
  const windows = plateWindows('prism', s);
  if (!windows) return;
  for (const name of ['score', 'speed', 'rate'] as const) {
    gemPlate(g, windows[name], st);
    // the sapphire takes light from inside (gearLights.ts)
    mark(s, `plate.${name}`, windows[name]);
  }
}

// ---------- FIRE (the Firestarter skin's gear, 파이어스타터) ----------

/** FIRE's one colour, and the heat of what is lit on it (a held key's light, the light under the caps). */
const FIRE_RED = '#e8112d';
const FIRE_HOT = '#ff5a1f';

/** Polished chrome down a strip from `y0` to `y1`: the sky in its upper half, the dark horizon, the floor's light below. */
function chromeDown(g: CanvasRenderingContext2D, y0: number, y1: number): CanvasGradient {
  const c = g.createLinearGradient(0, y0, 0, y1);
  c.addColorStop(0, '#f6f8fa');
  c.addColorStop(0.4, '#b4bcc7');
  c.addColorStop(0.5, '#4f5661');
  c.addColorStop(0.6, '#8d95a1');
  c.addColorStop(1, '#e3e7ec');
  return c;
}

/** How many crests FIRE's key caps carry in turn (the cells of its picture `crests`): the group's four members'. */
const FIRE_CRESTS = 4;

/** A lane's key cap on FIRE's strip: as wide as the lane less a gap, the light's room left under it. */
const fireCap = (lane: DeckLane, st: number): Box => ({ x: lane.left + 2, y: 3 * st, w: lane.width - 4, h: (FIRE.keys - 3 - FIRE.glow) * st });

/**
 * FIRE (파이어스타터): a comeback stage in gloss black, chrome and one hot red, as wide as the track and no
 * wider. Under the judge line a row of polished chrome key caps, one to a lane, each with one slant of
 * light across it and a thin orange-red light burning under its near edge (the held lane's cap glows:
 * deckKeys). Under them, past a chrome trim, a deck of candy-red lacquer with one soft straight
 * reflection: black shoulders cut into its far corners point at the ends of the score's window, a pane
 * of black glass in a chrome bevel whose ends slant inward, and two black blades run from under that
 * window's corners to the deck's near edge; the speed and the rate are in two dark pills at the near
 * corners. Nothing on it is a flame: the fire is its red and the light under the caps. The HUD writes
 * the readouts in the windows (deckReadouts).
 */
function firePlate(g: CanvasRenderingContext2D, s: DeckSpec, art: GearArt = {}): void {
  const st = s.stretch;
  const W = s.width;
  g.fillStyle = '#08080a';
  g.fillRect(0, 0, W, s.depth);
  // the key caps
  for (const lane of s.lanes) {
    const cap = fireCap(lane, st);
    g.fillStyle = chromeDown(g, cap.y - cap.h * 0.25, cap.y + cap.h * 1.1);
    g.fillRect(cap.x, cap.y, cap.w, cap.h);
    // one slant of light: the part over the cap's diagonal brighter, the part under it in shade
    polygon(g, [
      [cap.x, cap.y],
      [cap.x + cap.w, cap.y],
      [cap.x, cap.y + cap.h],
    ]);
    g.fillStyle = white(0.34);
    g.fill();
    polygon(g, [
      [cap.x + cap.w, cap.y],
      [cap.x + cap.w, cap.y + cap.h],
      [cap.x, cap.y + cap.h],
    ]);
    g.fillStyle = black(0.2);
    g.fill();
    g.fillStyle = white(0.9);
    g.fillRect(cap.x, cap.y, cap.w, Math.max(1, 0.8 * st));
    g.fillStyle = black(0.55);
    g.fillRect(cap.x, cap.y + cap.h - 1.2 * st, cap.w, 1.2 * st);
    // the light under it
    const under = g.createLinearGradient(0, cap.y + cap.h, 0, FIRE.keys * st);
    under.addColorStop(0, shade(FIRE_HOT, 1.1, 0.9));
    under.addColorStop(0.3, shade(FIRE_RED, 1, 0.55));
    under.addColorStop(1, shade(FIRE_RED, 1, 0));
    g.fillStyle = under;
    g.fillRect(cap.x + cap.w * 0.06, cap.y + cap.h, cap.w * 0.88, FIRE.keys * st - cap.y - cap.h);
  }
  // the four members' crests on the caps, in their order from the left and round again (its picture: one strip of
  // FIRE_CRESTS square cells), each in the middle of its cap and as round on the screen as it is drawn
  if (art.crests) {
    const cell = art.crests.width / FIRE_CRESTS;
    s.lanes.forEach((lane, i) => {
      const cap = fireCap(lane, st);
      const across = Math.min(cap.w * 0.44, (cap.h / st) * 0.9);
      g.drawImage(art.crests as Picture, (i % FIRE_CRESTS) * cell, 0, cell, art.crests!.height, cap.x + cap.w / 2 - across / 2, cap.y + cap.h / 2 - (across * st) / 2, across, across * st);
    });
  }
  const kh = FIRE.keys * st;
  mark(s, 'caps', { x: 0, y: kh - FIRE.glow * st, w: W, h: FIRE.glow * st });
  // the chrome trim under the caps
  g.fillStyle = chromeDown(g, kh, kh + FIRE.seam * st);
  g.fillRect(0, kh, W, FIRE.seam * st);
  const top = kh + FIRE.seam * st;
  const H = (FIRE.upper + FIRE.lower) * st;
  // the lacquer: a deep candy red, darker toward the player and toward its two sides
  const red = g.createLinearGradient(0, top, 0, top + H);
  red.addColorStop(0, '#d2122c');
  red.addColorStop(0.5, '#b60e24');
  red.addColorStop(1, '#8c0a1b');
  g.fillStyle = red;
  g.fillRect(0, top, W, s.depth - top);
  const sides = g.createLinearGradient(0, 0, W, 0);
  sides.addColorStop(0, black(0.3));
  sides.addColorStop(0.16, black(0));
  sides.addColorStop(0.84, black(0));
  sides.addColorStop(1, black(0.3));
  g.fillStyle = sides;
  g.fillRect(0, top, W, s.depth - top);
  // one soft straight reflection across it, slanting
  polygon(g, [
    [W * 0.12, top],
    [W * 0.5, top],
    [W * 0.36, top + H],
    [W * -0.02, top + H],
  ]);
  g.fillStyle = white(0.07);
  g.fill();
  polygon(g, [
    [W * 0.53, top],
    [W * 0.56, top],
    [W * 0.42, top + H],
    [W * 0.39, top + H],
  ]);
  g.fillStyle = white(0.05);
  g.fill();
  mark(s, 'lacquer', { x: 0, y: top, w: W, h: Math.min(s.depth - top, H) });
  const windows = plateWindows('fire', s);
  const score: Box = windows?.score ?? { x: W * 0.24, y: top + FIRE.pad * st, w: W * 0.52, h: (FIRE.upper - 2 * FIRE.pad) * st };
  const cut = Math.min(W * 0.04, (score.h / st) * 1.1);
  // the black shoulders at the far corners, their points at the ends of the score's window
  for (const side of [0, 1]) {
    const x = (u: number) => (side === 0 ? u : W - u);
    polygon(g, [
      [x(0), top],
      [x(score.x - W * 0.012), top],
      [x(0), top + H * 0.3],
    ]);
    g.fillStyle = '#0a0a0c';
    g.fill();
    // a blade from under the window's corner to the deck's near edge, wider as it comes
    polygon(g, [
      [x(score.x + cut + W * 0.006), score.y + score.h + 2 * st],
      [x(W * 0.462), top + H],
      [x(W * 0.39), top + H],
    ]);
    g.fill();
  }
  // the score's window: black glass in a chrome bevel, its two ends slanting inward toward the player
  const pane = (inset: number): [number, number][] => [
    [score.x + inset, score.y + inset * st],
    [score.x + score.w - inset, score.y + inset * st],
    [score.x + score.w - cut - inset * 0.6, score.y + score.h - inset * st],
    [score.x + cut + inset * 0.6, score.y + score.h - inset * st],
  ];
  polygon(g, pane(0));
  g.fillStyle = chromeDown(g, score.y, score.y + score.h);
  g.fill();
  polygon(g, pane(2));
  const glass = g.createLinearGradient(0, score.y, 0, score.y + score.h);
  glass.addColorStop(0, '#17181c');
  glass.addColorStop(1, '#060607');
  g.fillStyle = glass;
  g.fill();
  // one sheen on the glass, at its left
  g.save();
  polygon(g, pane(2));
  g.clip();
  polygon(g, [
    [score.x + score.w * 0.04, score.y],
    [score.x + score.w * 0.3, score.y],
    [score.x + score.w * 0.2, score.y + score.h],
    [score.x - score.w * 0.06, score.y + score.h],
  ]);
  g.fillStyle = white(0.07);
  g.fill();
  g.restore();
  if (!windows) return;
  // the speed's and the rate's pills: the lacquer seen through smoked glass
  for (const b of [windows.speed, windows.rate]) {
    rounded(g, b, b.h / (2 * st), st);
    g.fillStyle = 'rgba(46,3,9,0.8)';
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = black(0.45);
    g.stroke();
  }
}

// ---------- the AI companies' gears (GPT, Gemini, Grok, Claude: the four skins that took skin 4's place) ----------

/**
 * The gears of the four AI companies' skins: each in its company's key colour and with something of the
 * company's own manner. Nothing of a company's own is drawn here: its mark (the note's shape) and the
 * two stickers at the gear's sides are pictures that come with the build (public/stage, standees.ts).
 */
export const BRAND_GEARS = ['gpt', 'gemini', 'grok', 'claude'] as const satisfies readonly GearStyle[];
export type BrandGear = (typeof BRAND_GEARS)[number];
export const isBrandGear = (style: GearStyle): style is BrandGear => (BRAND_GEARS as readonly GearStyle[]).includes(style);

/** A lane's key on their strips: as wide as the lane less a gap. */
const brandCap = (lane: DeckLane, st: number): Box => ({ x: lane.left + 2.5, y: 3 * st, w: lane.width - 5, h: (BRAND.keys - 6) * st });

const GPT_GREEN = '#10a37f';
const GEMINI_BLUE = '#4285f4';
const GEMINI_VIOLET = '#9b72cb';
const GEMINI_PINK = '#d96570';
const GEMINI_SURFACE = '#131314';
const GEMINI_RAISED = '#1e1f20';
/** The four clear colours GEMINI's held keys light in, lane after lane. */
const GEMINI_FOUR = [GEMINI_BLUE, '#ea4335', '#fbbc04', '#34a853'] as const;
const CLAUDE_PAPER = '#f0eee6';
const CLAUDE_IVORY = '#faf9f5';
const CLAUDE_CLAY = '#d97757';
const CLAUDE_GREY = '#b0aea5';

/** How each of their keys looks while held: the cap in one flat colour (round at its corners as its cap is), a dot in its middle or none. */
const BRAND_PRESS: Record<BrandGear, (lane: number) => { fill: string; dot?: string; round: number }> = {
  // a black tile with a white dot: someone typing
  gpt: () => ({ fill: '#0d0d0d', dot: '#ffffff', round: 7 }),
  gemini: (lane) => ({ fill: GEMINI_FOUR[lane % GEMINI_FOUR.length], round: 99 }),
  grok: () => ({ fill: '#ffffff', round: 0 }),
  claude: () => ({ fill: CLAUDE_CLAY, dot: CLAUDE_PAPER, round: 6 }),
};

/** Draws with `st` taken out: what `draw` strokes about (x, y) is as thick along the track as across on the screen (1 px there is 1 plane px across). */
function flatAt(g: CanvasRenderingContext2D, x: number, y: number, st: number, draw: () => void): void {
  g.save();
  g.translate(x, y);
  g.scale(1, st);
  draw();
  g.restore();
}

/** An arrow pointing up the track about (0, 0), `r` long each way (drawn inside flatAt). */
function upArrow(g: CanvasRenderingContext2D, r: number, colour: string): void {
  g.beginPath();
  g.moveTo(0, r);
  g.lineTo(0, -r);
  g.moveTo(-r * 0.78, -r * 0.2);
  g.lineTo(0, -r);
  g.lineTo(r * 0.78, -r * 0.2);
  g.lineWidth = Math.max(1.2, r * 0.42);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = colour;
  g.stroke();
}

/** The score's window of a deck with BRAND's steps, where the screen shows too little of the deck for its readouts. */
const brandScore = (s: DeckSpec): Box => ({ x: s.width * 0.24, y: (BRAND.keys + BRAND.seam + BRAND.pad) * s.stretch, w: s.width * 0.52, h: (BRAND.upper - 2 * BRAND.pad) * s.stretch });

/**
 * GPT: a chat window in its well-known teal green, as wide as the track and no wider. The deck is the
 * green itself, a little deeper toward the player. Under the judge line a row of white tiles, one to a
 * lane (the held lane's goes black with a white dot: deckKeys). The score is in a white message box, a
 * grey plus at its left end and the round black send button at its right; the speed and the rate are in
 * two white chips by the deck's middle, three typing dots between them, and a thumb and a copy mark
 * beside the rate's, as under a reply. The HUD writes the readouts in the windows (deckReadouts).
 */
function gptPlate(g: CanvasRenderingContext2D, s: DeckSpec): void {
  const st = s.stretch;
  const W = s.width;
  const green = g.createLinearGradient(0, 0, 0, Math.min(s.depth, Math.max(s.room, 1)));
  green.addColorStop(0, '#13ab86');
  green.addColorStop(1, '#0b7d62');
  g.fillStyle = green;
  g.fillRect(0, 0, W, s.depth);
  for (const lane of s.lanes) {
    const cap = brandCap(lane, st);
    rounded(g, cap, 7, st);
    const face = g.createLinearGradient(0, cap.y, 0, cap.y + cap.h);
    face.addColorStop(0, '#ffffff');
    face.addColorStop(1, '#e3e8ea');
    g.fillStyle = face;
    g.fill();
  }
  const kh = BRAND.keys * st;
  g.fillStyle = '#086650';
  g.fillRect(0, kh, W, BRAND.seam * st);
  mark(s, 'glow', { x: 0, y: kh - 3 * st, w: W, h: (BRAND.seam + 6) * st });
  const windows = plateWindows('gpt', s);
  const score = windows?.score ?? brandScore(s);
  // the message box, and what a chat's has at its two ends
  const u = score.h / st;
  const mid = score.y + score.h / 2;
  rounded(g, score, u / 2, st);
  g.fillStyle = '#ffffff';
  g.fill();
  flatAt(g, score.x + u * 0.62, mid, st, () => {
    const a = u * 0.17;
    g.beginPath();
    g.moveTo(-a, 0);
    g.lineTo(a, 0);
    g.moveTo(0, -a);
    g.lineTo(0, a);
    g.lineWidth = Math.max(1.2, u * 0.055);
    g.lineCap = 'round';
    g.strokeStyle = '#9b9ba5';
    g.stroke();
  });
  const button = u * 0.36;
  disc(g, score.x + score.w - u * 0.56, mid, button, st);
  g.fillStyle = '#0d0d0d';
  g.fill();
  flatAt(g, score.x + score.w - u * 0.56, mid, st, () => upArrow(g, button * 0.46, '#ffffff'));
  if (!windows) return;
  for (const b of [windows.speed, windows.rate]) {
    rounded(g, b, b.h / (2 * st), st);
    g.fillStyle = '#ffffff';
    g.fill();
  }
  const v = windows.speed.h / st;
  const low = windows.speed.y + windows.speed.h / 2;
  // someone typing: three dots, the middle one the largest
  [0.09, 0.12, 0.09].forEach((r, i) => {
    disc(g, W / 2 + (i - 1) * v * 0.34, low, v * r, st);
    g.fillStyle = white(i === 1 ? 0.95 : 0.7);
    g.fill();
  });
  // a reply's marks: a thumb and a copy
  const size = v * 0.3;
  flatAt(g, windows.rate.x + windows.rate.w + v * 1.14, low, st, () => {
    g.lineWidth = Math.max(1.1, size * 0.16);
    g.lineJoin = 'round';
    g.strokeStyle = white(0.9);
    g.beginPath();
    g.roundRect(-size * 0.3, -size * 0.5, size * 0.8, size * 0.8, size * 0.16);
    g.stroke();
    g.beginPath();
    g.moveTo(-size * 0.3, size * 0.5);
    g.lineTo(-size * 0.52, size * 0.5);
    g.lineTo(-size * 0.52, -size * 0.26);
    g.stroke();
  });
  flatAt(g, windows.rate.x + windows.rate.w + v * 0.56, low, st, () => {
    g.lineWidth = Math.max(1.1, size * 0.16);
    g.lineJoin = 'round';
    g.strokeStyle = white(0.9);
    g.beginPath();
    g.rect(-size * 0.5, -size * 0.04, size * 0.24, size * 0.54);
    g.stroke();
    g.beginPath();
    g.moveTo(-size * 0.26, size * 0.5);
    g.lineTo(-size * 0.26, -size * 0.04);
    g.lineTo(-size * 0.02, -size * 0.52);
    g.lineTo(size * 0.14, -size * 0.44);
    g.lineTo(size * 0.08, -size * 0.1);
    g.lineTo(size * 0.5, -size * 0.1);
    g.lineTo(size * 0.4, size * 0.5);
    g.closePath();
    g.stroke();
  });
}

/** A four-pointed sparkle about (0, 0), `r` to its points, its sides curving in (drawn inside flatAt). */
function sparkle(g: CanvasRenderingContext2D, r: number): void {
  g.beginPath();
  g.moveTo(0, -r);
  g.quadraticCurveTo(r * 0.08, -r * 0.08, r, 0);
  g.quadraticCurveTo(r * 0.08, r * 0.08, 0, r);
  g.quadraticCurveTo(-r * 0.08, r * 0.08, -r, 0);
  g.quadraticCurveTo(-r * 0.08, -r * 0.08, 0, -r);
  g.closePath();
}

/** GEMINI's blue through violet to pink, across from `x0` to `x1`. */
function geminiAcross(g: CanvasRenderingContext2D, x0: number, x1: number, alpha = 1): CanvasGradient {
  const c = g.createLinearGradient(x0, 0, x1, 0);
  c.addColorStop(0, shade(GEMINI_BLUE, 1, alpha));
  c.addColorStop(0.5, shade(GEMINI_VIOLET, 1, alpha));
  c.addColorStop(1, shade(GEMINI_PINK, 1, alpha));
  return c;
}

/**
 * GEMINI: a dark material surface, as wide as the track and no wider. Under the judge line a row of
 * rounded pills, one to a lane, each a quiet shade of one of four clear colours, blue, red, yellow,
 * green, lane after lane (the held one lights in its colour: deckKeys); under them a light of blue through violet to pink rises and fades
 * into the deck, as behind a prompt box. The score is in a pill with that light for its outline and a
 * few small sparkles by it, the speed and the rate in two plain pills. The HUD writes the readouts in
 * the windows (deckReadouts).
 */
function geminiPlate(g: CanvasRenderingContext2D, s: DeckSpec): void {
  const st = s.stretch;
  const W = s.width;
  g.fillStyle = GEMINI_SURFACE;
  g.fillRect(0, 0, W, s.depth);
  s.lanes.forEach((lane, i) => {
    // each pill a quiet shade of the colour it lights in
    const cap = brandCap(lane, st);
    rounded(g, cap, cap.h / (2 * st), st);
    g.fillStyle = GEMINI_RAISED;
    g.fill();
    g.fillStyle = shade(GEMINI_FOUR[i % GEMINI_FOUR.length], 1, 0.3);
    g.fill();
    g.fillStyle = white(0.08);
    g.fillRect(cap.x + cap.h / (2 * st), cap.y, cap.w - cap.h / st, Math.max(1, 0.8 * st));
  });
  const kh = BRAND.keys * st;
  // the light under the keys: the three colours across, fading down into the surface
  const band: Box = { x: 0, y: kh, w: W, h: 20 * st };
  g.fillStyle = geminiAcross(g, 0, W, 0.62);
  g.fillRect(band.x, band.y, band.w, band.h);
  const fade = g.createLinearGradient(0, band.y, 0, band.y + band.h);
  fade.addColorStop(0, shade(GEMINI_SURFACE, 1, 0));
  fade.addColorStop(0.5, shade(GEMINI_SURFACE, 1, 0.78));
  fade.addColorStop(1, GEMINI_SURFACE);
  g.fillStyle = fade;
  g.fillRect(band.x, band.y, band.w, band.h + 1);
  g.fillStyle = geminiAcross(g, 0, W);
  g.fillRect(0, kh, W, Math.max(1, 1.2 * st));
  mark(s, 'glow', band);
  const windows = plateWindows('gemini', s);
  const score = windows?.score ?? brandScore(s);
  const u = score.h / st;
  rounded(g, score, u / 2, st);
  g.fillStyle = geminiAcross(g, score.x, score.x + score.w);
  g.fill();
  const line = Math.max(1.2, u * 0.045);
  rounded(g, { x: score.x + line, y: score.y + line * st, w: score.w - 2 * line, h: score.h - 2 * line * st }, u / 2 - line, st);
  g.fillStyle = GEMINI_RAISED;
  g.fill();
  // a few sparkles by its far right end
  for (const [dx, dy, r, a] of [
    [0.34, 0.5, 0.2, 0.9],
    [0.05, 0.16, 0.11, 0.6],
    [0.58, 0.14, 0.08, 0.5],
  ] as const) {
    flatAt(g, score.x + score.w - u * (0.5 + dx), score.y + score.h * dy, st, () => {
      sparkle(g, u * r);
      g.fillStyle = white(a);
      g.fill();
    });
  }
  if (!windows) return;
  for (const b of [windows.speed, windows.rate]) {
    rounded(g, b, b.h / (2 * st), st);
    g.fillStyle = GEMINI_RAISED;
    g.fill();
  }
}

/** A square bracket of a readout written on GROK's deck: at `x`, from `y0` to `y1`, opening toward `dir`. */
function bracket(g: CanvasRenderingContext2D, x: number, y0: number, y1: number, dir: 1 | -1, reach: number, st: number): void {
  flatAt(g, x, y0, st, () => {
    const h = (y1 - y0) / st;
    g.beginPath();
    g.moveTo(dir * reach, 0);
    g.lineTo(0, 0);
    g.lineTo(0, h);
    g.lineTo(dir * reach, h);
    g.lineWidth = 1.3;
    g.strokeStyle = white(0.9);
    g.stroke();
  });
}

/**
 * GROK: black and white and nothing else, as wide as the track and no wider: a deck of pure black in a
 * white hairline, a sparse field of stars over it and one thin line crossing it at a slant. Under the
 * judge line a row of boxes drawn in a white outline, one to a lane (the held one solid white:
 * deckKeys). The readouts have no windows: each is written on the black between two square brackets,
 * the score over a thin rule. The HUD writes them there (deckReadouts).
 */
function grokPlate(g: CanvasRenderingContext2D, s: DeckSpec): void {
  const st = s.stretch;
  const W = s.width;
  g.fillStyle = '#000000';
  g.fillRect(0, 0, W, s.depth);
  for (const lane of s.lanes) {
    const cap = brandCap(lane, st);
    g.fillStyle = white(0.86);
    g.fillRect(cap.x, cap.y, cap.w, cap.h);
    g.fillStyle = '#000000';
    g.fillRect(cap.x + 1.3, cap.y + 1.3 * st, cap.w - 2.6, cap.h - 2.6 * st);
  }
  const kh = BRAND.keys * st;
  const top = kh + BRAND.seam * st;
  const foot = Math.min(s.depth, Math.max(s.room, top + 1));
  // the stars: the same field at every paint
  const rand = seeded(29);
  for (let i = 0; i < 54; i++) {
    const [x, y, r, a] = [rand() * W, top + rand() * (foot - top), 0.45 + rand() * 0.75, 0.22 + rand() * 0.68];
    disc(g, x, y, r, st);
    g.fillStyle = white(a);
    g.fill();
  }
  // the one line across it, at a slant
  flatAt(g, 0, top, st, () => {
    const h = (foot - top) / st;
    g.beginPath();
    g.moveTo(W * 0.05, h * 0.9);
    g.lineTo(W * 0.4, h * 0.1);
    g.lineWidth = 1.1;
    g.strokeStyle = white(0.7);
    g.stroke();
  });
  // the hairline round the deck
  g.fillStyle = white(0.9);
  g.fillRect(0, top - Math.max(1, 0.9 * st), W, Math.max(1, 0.9 * st));
  mark(s, 'glow', { x: 0, y: top - 4 * st, w: W, h: 8 * st });
  const windows = plateWindows('grok', s);
  const score = windows?.score ?? brandScore(s);
  // nothing of the field under a readout: it is written on plain black
  for (const b of windows ? [score, windows.speed, windows.rate] : [score]) {
    g.fillStyle = '#000000';
    g.fillRect(b.x, b.y, b.w, b.h);
    const reach = Math.min(7, b.w * 0.05);
    bracket(g, b.x, b.y + b.h * 0.12, b.y + b.h * 0.88, 1, reach, st);
    bracket(g, b.x + b.w, b.y + b.h * 0.12, b.y + b.h * 0.88, -1, reach, st);
  }
  g.fillStyle = white(0.5);
  g.fillRect(score.x + score.w * 0.12, score.y + score.h - Math.max(1, 0.9 * st), score.w * 0.76, Math.max(1, 0.9 * st));
}

/**
 * CLAUDE: a page of warm cream paper, as wide as the track and no wider, with a band of terracotta
 * along its far edge. Under the judge line a row of softly rounded warm-grey squares, one to a lane
 * (the held one terracotta with a cream dot: deckKeys). The score is in an ivory card, as a writing
 * box, a small terracotta button with an arrow at its near right corner; the speed and the rate are
 * written on the paper itself by the deck's middle; left of them one loose line drawn by hand, a ball
 * of thread and its end running off. The HUD writes the readouts in the windows (deckReadouts).
 */
function claudePlate(g: CanvasRenderingContext2D, s: DeckSpec): void {
  const st = s.stretch;
  const W = s.width;
  g.fillStyle = CLAUDE_PAPER;
  g.fillRect(0, 0, W, s.depth);
  // the paper's grain
  const rand = seeded(83);
  g.fillStyle = 'rgba(120,104,82,0.07)';
  for (let i = 0; i < 420; i++) g.fillRect(rand() * W, rand() * s.depth, 1 + rand(), (1 + rand()) * st);
  for (const lane of s.lanes) {
    const cap = brandCap(lane, st);
    rounded(g, cap, 6, st);
    const face = g.createLinearGradient(0, cap.y, 0, cap.y + cap.h);
    face.addColorStop(0, '#c4c1b7');
    face.addColorStop(1, CLAUDE_GREY);
    g.fillStyle = face;
    g.fill();
  }
  const kh = BRAND.keys * st;
  const band: Box = { x: 0, y: kh, w: W, h: (BRAND.seam + 2.4) * st };
  g.fillStyle = CLAUDE_CLAY;
  g.fillRect(band.x, band.y, band.w, band.h);
  mark(s, 'glow', { x: 0, y: band.y - 3 * st, w: W, h: band.h + 6 * st });
  const windows = plateWindows('claude', s);
  const score = windows?.score ?? brandScore(s);
  const u = score.h / st;
  rounded(g, score, 8, st);
  g.fillStyle = '#cfccc2';
  g.fill();
  rounded(g, { x: score.x + 1, y: score.y + st, w: score.w - 2, h: score.h - 2 * st }, 7, st);
  g.fillStyle = CLAUDE_IVORY;
  g.fill();
  // the card's button, at its near right corner
  const b: Box = { x: score.x + score.w - u * 0.68, y: score.y + score.h - u * 0.68 * st, w: u * 0.5, h: u * 0.5 * st };
  rounded(g, b, 3.5, st);
  g.fillStyle = CLAUDE_CLAY;
  g.fill();
  flatAt(g, b.x + b.w / 2, b.y + b.h / 2, st, () => upArrow(g, u * 0.13, CLAUDE_PAPER));
  if (!windows) return;
  // one loose line by hand between the speed and the rate: a ball of thread, its end running off
  const v = windows.speed.h / st;
  const low = windows.speed.y + windows.speed.h / 2;
  const line = seeded(11);
  flatAt(g, W * 0.07, low, st, () => {
    const R = v * 0.44;
    g.lineWidth = 1.3;
    g.lineCap = 'round';
    g.strokeStyle = shade(CLAUDE_CLAY, 1, 0.92);
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.ellipse((line() - 0.5) * R * 0.3, (line() - 0.5) * R * 0.3, R * (0.62 + 0.38 * line()), R * (0.5 + 0.5 * line()), line() * Math.PI, 0, Math.PI * 2);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(R * 0.8, R * 0.55);
    g.bezierCurveTo(R * 2.2, R * 1.2, R * 3.1, -R * 0.7, R * 4.4, R * 0.2);
    g.bezierCurveTo(R * 5, R * 0.6, R * 5.5, R * 0.1, R * 6, R * 0.35);
    g.stroke();
  });
}

// ---------- AQUA (the aqua mecha skin's gear, 아쿠아) ----------

/** AQUA's two accents and its armour's white. */
const AQUA_CYAN = '#22e0e6';
const AQUA_PINK = '#ff3f93';
const AQUA_WHITE = '#f4f7fa';

/** A lane's key cap on AQUA's strip: as wide as the lane less a gap, inside the white frame. */
const aquaCap = (lane: DeckLane, st: number): Box => ({ x: lane.left + 1.5, y: 4 * st, w: lane.width - 3, h: (AQUA.keys - 7) * st });

/** White armour down a part from `y0` to `y1`: white, a pale blue-grey toward the player. */
function armour(g: CanvasRenderingContext2D, y0: number, y1: number): CanvasGradient {
  const c = g.createLinearGradient(0, y0, 0, y1);
  c.addColorStop(0, '#ffffff');
  c.addColorStop(0.55, '#eef2f6');
  c.addColorStop(1, '#cdd6df');
  return c;
}

/** `b` with its four corners cut at 45° on the screen, `cut` across, moved in by `inset`. */
const chamfered = (b: Box, cut: number, st: number, inset = 0): [number, number][] =>
  octagon({ x: b.x + inset, y: b.y + inset * st, w: b.w - 2 * inset, h: b.h - 2 * inset * st }, [Math.max(0, cut - inset * 0.41), Math.max(0, cut - inset * 0.41) * st]);

/**
 * AQUA (아쿠아): the console of a clean white machine with aqua and hot-pink accents, as wide as the
 * track and no wider. Under the judge line a row of gloss key caps in a white frame, one to a lane:
 * white, the blue lanes' aqua, the scratch's with a pink line (the held lane's cap fills with aqua
 * light: deckKeys). Under it a white collar and, at the far corners, white shoulders cut at 45°, a
 * pink line along their edges, over a deck of dark teal glass. The score is in a white plate with cut
 * corners round a dark window, five slanting aqua stripes at each side of it, as vents. In the lower
 * row the speed and the rate are written on the glass over an aqua line, and between them sits the
 * machine's mark: a white ring cut by three arrows round a pale disc, in an aqua glow; three pink
 * hatch strokes at each side of it. The HUD writes the readouts in the windows (deckReadouts).
 */
function aquaPlate(g: CanvasRenderingContext2D, s: DeckSpec): void {
  const st = s.stretch;
  const W = s.width;
  const kh = AQUA.keys * st;
  const top = kh + AQUA.seam * st;
  const H = (AQUA.upper + AQUA.lower) * st;
  // the glass
  g.fillStyle = '#06171a';
  g.fillRect(0, 0, W, s.depth);
  const glass = g.createLinearGradient(0, top, 0, top + H);
  glass.addColorStop(0, '#0e2d32');
  glass.addColorStop(1, '#06171a');
  g.fillStyle = glass;
  g.fillRect(0, top, W, Math.min(H, s.depth - top));
  // the key row: a white frame with a pink line along its far edge, the caps in a dark slot
  g.fillStyle = armour(g, 0, kh);
  g.fillRect(0, 0, W, kh);
  g.fillStyle = AQUA_PINK;
  g.fillRect(0, 0, W, Math.max(1, 1.1 * st));
  const [first, last] = [s.lanes[0], s.lanes[s.lanes.length - 1]];
  if (first && last) {
    g.fillStyle = '#0a2227';
    g.fillRect(first.left, 2.8 * st, last.left + last.width - first.left, kh - 4.6 * st);
  }
  for (const lane of s.lanes) {
    const cap = aquaCap(lane, st);
    const blue = lane.kind === 'other';
    rounded(g, cap, 2.5, st);
    const face = g.createLinearGradient(0, cap.y, 0, cap.y + cap.h);
    face.addColorStop(0, blue ? '#9df3f8' : '#ffffff');
    face.addColorStop(0.55, blue ? '#2bc9df' : '#eef2f6');
    face.addColorStop(1, blue ? '#1290b5' : '#bfcbd6');
    g.fillStyle = face;
    g.fill();
    // the gloss over its far half
    rounded(g, { x: cap.x + cap.w * 0.07, y: cap.y + 1.4 * st, w: cap.w * 0.86, h: cap.h * 0.4 }, 2, st);
    g.fillStyle = white(blue ? 0.3 : 0.6);
    g.fill();
    if (lane.kind === 'scratch') {
      g.fillStyle = AQUA_PINK;
      g.fillRect(cap.x + cap.w * 0.2, cap.y + cap.h - 3.6 * st, cap.w * 0.6, 1.5 * st);
    }
  }
  // the collar under the row
  g.fillStyle = armour(g, kh - 3 * st, top);
  g.fillRect(0, kh, W, AQUA.seam * st);
  g.fillStyle = black(0.22);
  g.fillRect(0, kh, W, Math.max(1, 0.7 * st));
  mark(s, 'glow', { x: 0, y: kh, w: W, h: AQUA.seam * st });
  const c = 6;
  for (const side of [0, 1]) {
    const x = (u: number) => (side === 0 ? u : W - u);
    // a shoulder at the far corner, stepping down toward the gear's edge
    const shoulder: [number, number][] = [
      [x(0), top],
      [x(W * 0.205), top],
      [x(W * 0.205 - c), top + c * st],
      [x(W * 0.075), top + c * st],
      [x(W * 0.075 - c * 1.5), top + c * 2.5 * st],
      [x(0), top + c * 2.5 * st],
    ];
    polygon(g, shoulder);
    g.fillStyle = armour(g, top - 2 * st, top + c * 2.5 * st);
    g.fill();
    g.beginPath();
    shoulder.slice(1).forEach(([px, py], i) => (i === 0 ? g.moveTo(px, py) : g.lineTo(px, py)));
    g.lineWidth = 1.4;
    g.lineJoin = 'miter';
    g.strokeStyle = AQUA_PINK;
    g.stroke();
    // the vent: five aqua stripes slanting, fainter toward the deck's middle
    const mid = top + AQUA.upper * 0.66 * st;
    const tall = 13 * st;
    for (let i = 0; i < 5; i++) {
      const x0 = W * 0.062 + i * W * 0.027;
      polygon(g, [
        [x(x0 + 7), mid - tall / 2],
        [x(x0 + 7 + W * 0.015), mid - tall / 2],
        [x(x0 + W * 0.015), mid + tall / 2],
        [x(x0), mid + tall / 2],
      ]);
      g.fillStyle = shade(AQUA_CYAN, 1, 0.95 - i * 0.12);
      g.fill();
    }
  }
  // the score's plate: white armour with cut corners in a pink line, a dark window in it
  const windows = plateWindows('aqua', s);
  const score: Box = windows?.score ?? { x: W * 0.24, y: top + AQUA.pad * st, w: W * 0.52, h: (AQUA.upper - 2 * AQUA.pad) * st };
  polygon(g, chamfered(score, 7, st));
  g.fillStyle = armour(g, score.y, score.y + score.h);
  g.fill();
  g.lineWidth = 1.4;
  g.strokeStyle = AQUA_PINK;
  g.stroke();
  polygon(g, chamfered(score, 7, st, 2.8));
  const pane = g.createLinearGradient(0, score.y, 0, score.y + score.h);
  pane.addColorStop(0, '#0b262b');
  pane.addColorStop(1, '#051416');
  g.fillStyle = pane;
  g.fill();
  g.fillStyle = shade(AQUA_CYAN, 1, 0.75);
  g.fillRect(score.x + score.w * 0.32, score.y + score.h - 5.2 * st, score.w * 0.36, Math.max(1, 0.9 * st));
  if (!windows) return;
  const low = windows.speed.y + windows.speed.h / 2;
  const v = windows.speed.h / st;
  // the speed and the rate: written on the glass, an aqua line under each, longer toward the gear's edge
  for (const [b, side] of [
    [windows.speed, 0],
    [windows.rate, 1],
  ] as const) {
    polygon(g, chamfered(b, 5, st));
    g.fillStyle = shade(AQUA_CYAN, 1, 0.07);
    g.fill();
    g.fillStyle = shade(AQUA_CYAN, 1, 0.9);
    g.fillRect(side === 0 ? b.x : b.x + b.w * 0.3, b.y + b.h - 1.3 * st, b.w * 0.7, 1.3 * st);
  }
  // the machine's mark: a white ring cut by three arrows round a pale disc, in an aqua glow
  const R = Math.min(v * 0.48, W * 0.06);
  mark(s, 'emblem', { x: W / 2 - R, y: low - R * st, w: 2 * R, h: 2 * R * st });
  flatAt(g, W / 2, low, st, () => {
    const halo = g.createRadialGradient(0, 0, R * 0.3, 0, 0, R * 1.9);
    halo.addColorStop(0, shade(AQUA_CYAN, 1, 0.36));
    halo.addColorStop(1, shade(AQUA_CYAN, 1, 0));
    g.fillStyle = halo;
    g.beginPath();
    g.arc(0, 0, R * 1.9, 0, Math.PI * 2);
    g.fill();
    for (const r of [1.4, 1.76]) {
      g.beginPath();
      g.arc(0, 0, R * r, 0, Math.PI * 2);
      g.lineWidth = 1;
      g.strokeStyle = shade(AQUA_CYAN, 1, 0.18);
      g.stroke();
    }
    for (let i = 0; i < 3; i++) {
      // an arc of the ring, an arrow's point at its end
      const from = -Math.PI / 2 + (i * 2 * Math.PI) / 3 + 0.16;
      const to = from + (2 * Math.PI) / 3 - 0.62;
      g.beginPath();
      g.arc(0, 0, R * 0.82, from, to);
      g.lineWidth = R * 0.3;
      g.lineCap = 'butt';
      g.strokeStyle = AQUA_WHITE;
      g.stroke();
      const [ca, sa] = [Math.cos(to), Math.sin(to)];
      polygon(g, [
        [ca * R * 0.56, sa * R * 0.56],
        [ca * R * 1.08, sa * R * 1.08],
        [ca * R * 0.82 - sa * R * 0.3, sa * R * 0.82 + ca * R * 0.3],
      ]);
      g.fillStyle = AQUA_WHITE;
      g.fill();
    }
    const core = g.createRadialGradient(0, -R * 0.1, 0, 0, 0, R * 0.44);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(1, '#b9f4f7');
    g.beginPath();
    g.arc(0, 0, R * 0.44, 0, Math.PI * 2);
    g.fillStyle = core;
    g.fill();
  });
  // three pink hatch strokes at each side of the mark
  for (const side of [0, 1]) {
    const x = (u: number) => (side === 0 ? u : W - u);
    const tall = 9 * st;
    for (let i = 0; i < 3; i++) {
      const x0 = W * 0.285 + i * W * 0.016;
      polygon(g, [
        [x(x0 + 5), low - tall / 2],
        [x(x0 + 5 + W * 0.007), low - tall / 2],
        [x(x0 + W * 0.007), low + tall / 2],
        [x(x0), low + tall / 2],
      ]);
      g.fillStyle = AQUA_PINK;
      g.fill();
    }
  }
}

// ---------- STEEL (the gunmetal skin's gear, 스틸) ----------

/** STEEL's one glow, and the same lit (a held key, the rails in FEVER). */
const STEEL_BLUE = '#2f7fc0';
const STEEL_LIT = '#58aaf0';

/** A lane's key cap on STEEL's strip: as wide as the lane less a seam. */
const steelCap = (lane: DeckLane, st: number): Box => ({ x: lane.left + 1, y: 2 * st, w: lane.width - 2, h: (STEEL.keys - 3) * st });

/**
 * STEEL (스틸): a piece of studio hardware in dark slate grey, as wide as the track and no wider. Under
 * the judge line a row of flush matte key caps divided by thin seams, each embossed with a small mark:
 * a plus, or a cross on the blue lanes' (the held lane's cap lights steel blue: deckKeys). Under it a
 * dark band with a shallow slot in its middle that glows dim blue from inside, then two matte panels
 * divided by a seam: the far one with the score in a dark capsule window, the near one a shade darker
 * with the speed's and the rate's capsules at its ends, an engraved rule and three small embossed
 * circles between them and a soft blue light at its right end. The HUD writes the readouts in the
 * windows (deckReadouts).
 */
function steelPlate(g: CanvasRenderingContext2D, s: DeckSpec): void {
  const st = s.stretch;
  const W = s.width;
  const kh = STEEL.keys * st;
  const top = kh + STEEL.seam * st;
  const upper = STEEL.upper * st;
  g.fillStyle = '#12171d';
  g.fillRect(0, 0, W, s.depth);
  for (const lane of s.lanes) {
    const cap = steelCap(lane, st);
    const face = g.createLinearGradient(0, cap.y, 0, cap.y + cap.h);
    face.addColorStop(0, '#374250');
    face.addColorStop(1, '#27303a');
    g.fillStyle = face;
    g.fillRect(cap.x, cap.y, cap.w, cap.h);
    g.fillStyle = white(0.1);
    g.fillRect(cap.x, cap.y, cap.w, Math.max(1, 0.8 * st));
    g.fillStyle = black(0.35);
    g.fillRect(cap.x, cap.y + cap.h - 1.2 * st, cap.w, 1.2 * st);
    // its mark, embossed (a light copy a hair nearer under the dark one): a plus, a cross on the blue lanes'
    const r = Math.min(lane.width * 0.12, 5.5);
    for (const [shift, colour] of [
      [0.9, white(0.16)],
      [0, black(0.62)],
    ] as const) {
      flatAt(g, cap.x + cap.w / 2, cap.y + cap.h / 2 + shift * st, st, () => {
        if (lane.kind === 'other') g.rotate(Math.PI / 4);
        g.beginPath();
        g.moveTo(-r, 0);
        g.lineTo(r, 0);
        g.moveTo(0, -r);
        g.lineTo(0, r);
        g.lineWidth = Math.max(1.2, r * 0.3);
        g.lineCap = 'butt';
        g.strokeStyle = colour;
        g.stroke();
      });
    }
  }
  // the band under the row, a slot in its middle lit from inside
  g.fillStyle = '#0c1015';
  g.fillRect(0, kh, W, STEEL.seam * st);
  polygon(g, [
    [W * 0.37, kh + 1.2 * st],
    [W * 0.63, kh + 1.2 * st],
    [W * 0.615, top - 1.2 * st],
    [W * 0.385, top - 1.2 * st],
  ]);
  const inside = g.createLinearGradient(0, kh, 0, top);
  inside.addColorStop(0, '#05080c');
  inside.addColorStop(1, shade(STEEL_BLUE, 0.92));
  g.fillStyle = inside;
  g.fill();
  mark(s, 'glow', { x: W * 0.37, y: kh, w: W * 0.26, h: STEEL.seam * st });
  // the two panels and the seam between them
  const far = g.createLinearGradient(0, top, 0, top + upper);
  far.addColorStop(0, '#2d3641');
  far.addColorStop(1, '#252d37');
  g.fillStyle = far;
  g.fillRect(0, top, W, upper);
  g.fillStyle = white(0.07);
  g.fillRect(0, top, W, Math.max(1, 0.8 * st));
  const near = g.createLinearGradient(0, top + upper, 0, top + upper + STEEL.lower * st);
  near.addColorStop(0, '#20272f');
  near.addColorStop(1, '#181e25');
  g.fillStyle = near;
  g.fillRect(0, top + upper, W, s.depth - top - upper);
  g.fillStyle = black(0.6);
  g.fillRect(0, top + upper - 0.7 * st, W, 1.4 * st);
  g.fillStyle = white(0.06);
  g.fillRect(0, top + upper + 0.7 * st, W, Math.max(1, 0.7 * st));
  const windows = plateWindows('steel', s);
  const score: Box = windows?.score ?? { x: W * 0.24, y: top + STEEL.pad * st, w: W * 0.52, h: (STEEL.upper - 2 * STEEL.pad) * st };
  well(g, score, score.h / (2 * st), st);
  if (!windows) return;
  const low = windows.speed.y + windows.speed.h / 2;
  // a soft blue light at the near panel's right end
  mark(s, 'side', { x: W * 0.78, y: top + upper, w: W * 0.22, h: STEEL.lower * st });
  flatAt(g, W, low, st, () => {
    const light = g.createRadialGradient(0, 0, 0, 0, 0, W * 0.2);
    light.addColorStop(0, shade(STEEL_BLUE, 1, 0.34));
    light.addColorStop(1, shade(STEEL_BLUE, 1, 0));
    g.fillStyle = light;
    g.beginPath();
    g.arc(0, 0, W * 0.2, Math.PI / 2, Math.PI * 1.5);
    g.fill();
  });
  for (const b of [windows.speed, windows.rate]) well(g, b, b.h / (2 * st), st);
  // between them: an engraved rule and three small embossed circles
  g.fillStyle = black(0.5);
  g.fillRect(W * 0.27, low - 0.6 * st, W * 0.36, 1.2 * st);
  g.fillStyle = white(0.07);
  g.fillRect(W * 0.27, low + 0.6 * st, W * 0.36, Math.max(1, 0.8 * st));
  for (const [dx, dy] of [
    [0, -1],
    [-0.87, 0.5],
    [0.87, 0.5],
  ]) {
    disc(g, W * 0.69 + dx * 4.4, low + dy * 4.4 * st, 2.7, st);
    g.fillStyle = black(0.45);
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = white(0.12);
    g.stroke();
  }
}

// ---------- NOIR (the black and red skin's gear, 레드라인) ----------

/** NOIR's one bright colour and the dark red of its large shapes. */
const NOIR_RED = '#ff1a2b';
const NOIR_DEEP = '#3a0508';

/** A lane's slot on NOIR's strip: thin, across the lane's middle. */
const noirSlot = (lane: DeckLane, st: number): Box => ({ x: lane.left + 4, y: (NOIR.keys / 2 - 5) * st, w: lane.width - 8, h: 10 * st });

/**
 * NOIR (레드라인): black and red cyber graphics, flat as a poster, as wide as the track and no wider.
 * Under the judge line a strip of thin slots with slanted ends, one to a lane, outlined in grey (the
 * held lane's fills red: deckKeys), and a red hairline. The deck is black, crossed by three dark-red
 * slanting bands and two thin red arcs; on it small flat marks: a cluster of red dots and a faint dot
 * grid at the far corners, a white block over a red one at each side, and between the two smaller
 * readouts three white slanting stripes, three red chevrons, two pixel glyphs and another cluster of
 * dots. The readouts have no boxes: black plates with corner ticks, where the HUD writes them as
 * outlined digits (deckReadouts).
 */
function noirPlate(g: CanvasRenderingContext2D, s: DeckSpec): void {
  const st = s.stretch;
  const W = s.width;
  const kh = NOIR.keys * st;
  const top = kh + NOIR.seam * st;
  const H = (NOIR.upper + NOIR.lower) * st;
  g.fillStyle = '#000000';
  g.fillRect(0, 0, W, s.depth);
  // the bands and the arcs, on the deck under the strip
  g.save();
  g.beginPath();
  g.rect(0, top, W, s.depth - top);
  g.clip();
  const E = H * 1.5;
  for (const [a, b, c, d, fill] of [
    [0.14, 0.4, 0.78, 0.52, NOIR_DEEP],
    [0.46, 0.54, 0.92, 0.84, '#2a0406'],
    [-0.1, 0.02, 0.4, 0.28, '#1c0304'],
  ] as const) {
    polygon(g, [
      [W * a, top + E],
      [W * b, top + E],
      [W * c, top],
      [W * d, top],
    ]);
    g.fillStyle = fill;
    g.fill();
  }
  flatAt(g, W * 0.62, top + H * 0.9, st, () => {
    g.beginPath();
    g.ellipse(0, 0, W * 0.44, W * 0.16, -0.5, Math.PI * 0.9, Math.PI * 1.9);
    g.lineWidth = 1.1;
    g.strokeStyle = shade(NOIR_RED, 1, 0.85);
    g.stroke();
    g.beginPath();
    g.ellipse(W * 0.03, W * 0.01, W * 0.5, W * 0.2, -0.5, Math.PI * 0.95, Math.PI * 1.8);
    g.lineWidth = 0.9;
    g.strokeStyle = shade(NOIR_RED, 1, 0.45);
    g.stroke();
  });
  g.restore();
  // the strip
  for (const lane of s.lanes) {
    const b = noirSlot(lane, st);
    const cut = Math.min(5, b.w * 0.2);
    const mid = b.y + b.h / 2;
    polygon(g, [
      [b.x + cut, b.y],
      [b.x + b.w - cut, b.y],
      [b.x + b.w, mid],
      [b.x + b.w - cut, b.y + b.h],
      [b.x + cut, b.y + b.h],
      [b.x, mid],
    ]);
    g.fillStyle = '#0d0d0f';
    g.fill();
    g.lineWidth = 1.2;
    g.strokeStyle = '#5a5d65';
    g.stroke();
  }
  g.fillStyle = NOIR_RED;
  g.fillRect(0, kh + 0.4 * st, W, Math.max(1, 1.1 * st));
  mark(s, 'glow', { x: 0, y: kh - 2 * st, w: W, h: (NOIR.seam + 4) * st });
  // rows of dots, every other row half a step along
  const dots = (x0: number, y0: number, rows: number, cols: number, r: number, fill: string) => {
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols - (j % 2); i++) {
        disc(g, x0 + (i + (j % 2) * 0.5) * r * 2.9, y0 + j * r * 2.5 * st, r, st);
        g.fillStyle = fill;
        g.fill();
      }
    }
  };
  const up = NOIR.upper * st;
  dots(W * 0.045, top + up * 0.28, 3, 6, 2.2, NOIR_RED);
  mark(s, 'dots', { x: W * 0.03, y: top + up * 0.2, w: W * 0.17, h: up * 0.42 });
  dots(W * 0.81, top + up * 0.16, 4, 7, 0.8, white(0.22));
  // a white block over a red one, offset as a glitch is
  g.fillStyle = NOIR_RED;
  g.fillRect(W * 0.83, top + up * 0.6, W * 0.12, 7 * st);
  g.fillStyle = '#ffffff';
  g.fillRect(W * 0.87, top + up * 0.6 - 4 * st, W * 0.11, 5 * st);
  g.fillStyle = '#ffffff';
  g.fillRect(W * 0.04, top + up * 0.8, W * 0.1, 4 * st);
  g.fillStyle = NOIR_RED;
  g.fillRect(W * 0.015, top + up * 0.7, W * 0.07, 5.5 * st);
  // a readout's plate: black, a tick at each corner
  const plate = (b: Box) => {
    g.fillStyle = black(0.66);
    g.fillRect(b.x, b.y, b.w, b.h);
    g.fillStyle = '#8a8f98';
    for (const [cx, cy, sx, sy] of [
      [b.x, b.y, 1, 1],
      [b.x + b.w, b.y, -1, 1],
      [b.x, b.y + b.h, 1, -1],
      [b.x + b.w, b.y + b.h, -1, -1],
    ]) {
      g.fillRect(Math.min(cx, cx + sx * 5), Math.min(cy, cy + sy * st), 5, st);
      g.fillRect(Math.min(cx, cx + sx), Math.min(cy, cy + sy * 5 * st), 1, 5 * st);
    }
  };
  const windows = plateWindows('noir', s);
  plate(windows?.score ?? { x: W * 0.24, y: top + NOIR.pad * st, w: W * 0.52, h: (NOIR.upper - 2 * NOIR.pad) * st });
  if (!windows) return;
  plate(windows.speed);
  plate(windows.rate);
  const low = windows.speed.y + windows.speed.h / 2;
  const v = windows.speed.h / st;
  for (let i = 0; i < 3; i++) {
    const x0 = W * 0.27 + i * W * 0.03;
    polygon(g, [
      [x0 + v * 0.4, low - v * 0.3 * st],
      [x0 + v * 0.4 + W * 0.016, low - v * 0.3 * st],
      [x0 + W * 0.016, low + v * 0.3 * st],
      [x0, low + v * 0.3 * st],
    ]);
    g.fillStyle = '#ffffff';
    g.fill();
  }
  for (let i = 0; i < 3; i++) {
    flatAt(g, W * 0.42 + i * W * 0.026, low, st, () => {
      const r = v * 0.2;
      g.beginPath();
      g.moveTo(-r * 0.6, -r);
      g.lineTo(r * 0.4, 0);
      g.lineTo(-r * 0.6, r);
      g.lineWidth = Math.max(1.5, r * 0.5);
      g.lineJoin = 'miter';
      g.strokeStyle = NOIR_RED;
      g.stroke();
    });
  }
  const glyph = (x0: number, y0: number, rows: readonly string[]) =>
    rows.forEach((row, j) =>
      [...row].forEach((bit, i) => {
        if (bit !== '1') return;
        g.fillStyle = white(0.9);
        g.fillRect(x0 + i * 1.6, y0 + j * 1.6 * st, 1.6, 1.6 * st);
      }),
    );
  glyph(W * 0.555, low - 4 * st, ['10101', '01110', '11011', '01110', '10101']);
  glyph(W * 0.625, low - 2.4 * st, ['111', '101', '111']);
  dots(W * 0.675, low - 3 * st, 3, 4, 1.9, NOIR_RED);
}

// ---------- WIRE (the white line skin's gear, 화이트 라인) ----------

/** A lane's tray on WIRE's strip: a shallow outline across the lane's middle. */
const wireTray = (lane: DeckLane, st: number): Box => ({ x: lane.left + 4, y: 6 * st, w: lane.width - 8, h: (WIRE.keys - 12) * st });

/** Rows of dots from (x0, y0), every other row half a step along and one dot shorter: round on the screen. */
function honeycomb(g: CanvasRenderingContext2D, st: number, x0: number, y0: number, rows: number, cols: number, r: number, fill: string): void {
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols - (j % 2); i++) {
      disc(g, x0 + (i + (j % 2) * 0.5) * r * 2.9, y0 + j * r * 2.5 * st, r, st);
      g.fillStyle = fill;
      g.fill();
    }
  }
}

/**
 * WIRE (화이트 라인): the drawing of a small machine in lines of white light on near-black, as wide as the
 * track and no wider, and no colour but white. Under the judge line a strip of thin outlines shaped as
 * shallow trays, one to a lane (the held lane's fills with white: deckKeys), and a white hairline. On
 * the deck two thin tilted orbits sweep across, a soft white light rises from the middle of its near
 * edge, and at each far corner float two small bars drawn as blocks over a cluster of dots. The
 * readouts have no boxes: a faint rule under each. Between the two smaller ones, a chevron beside each
 * pointing in, sits the mark: an open ring, two dots in it and a small upright trapezoid under them.
 * The HUD writes the readouts in the windows (deckReadouts).
 */
function wirePlate(g: CanvasRenderingContext2D, s: DeckSpec): void {
  const st = s.stretch;
  const W = s.width;
  const kh = WIRE.keys * st;
  const top = kh + WIRE.seam * st;
  const up = WIRE.upper * st;
  const H = (WIRE.upper + WIRE.lower) * st;
  const night = g.createLinearGradient(0, 0, 0, top + H);
  night.addColorStop(0, '#0e1220');
  night.addColorStop(1, '#06080d');
  g.fillStyle = night;
  g.fillRect(0, 0, W, s.depth);
  g.save();
  g.beginPath();
  g.rect(0, top, W, s.depth - top);
  g.clip();
  // the light rising from the near edge, and the orbits
  mark(s, 'rise', { x: W * 0.2, y: top + H * 0.55, w: W * 0.6, h: H * 0.45 });
  flatAt(g, W / 2, top + H, st, () => {
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, W * 0.3);
    glow.addColorStop(0, white(0.5));
    glow.addColorStop(0.4, white(0.12));
    glow.addColorStop(1, white(0));
    g.fillStyle = glow;
    g.beginPath();
    g.arc(0, 0, W * 0.3, 0, Math.PI * 2);
    g.fill();
  });
  flatAt(g, W / 2, top + H * 0.62, st, () => {
    for (const [rx, ry, tilt, alpha] of [
      [0.56, 0.2, -0.16, 0.5],
      [0.44, 0.13, 0.22, 0.3],
    ]) {
      g.beginPath();
      g.ellipse(0, 0, W * rx, W * ry, tilt, 0, Math.PI * 2);
      g.lineWidth = 1;
      g.strokeStyle = white(alpha);
      g.stroke();
    }
  });
  g.restore();
  // the strip
  for (const lane of s.lanes) {
    const b = wireTray(lane, st);
    const cut = Math.min(5, b.w * 0.16);
    g.beginPath();
    g.moveTo(b.x, b.y);
    g.lineTo(b.x + cut, b.y + b.h);
    g.lineTo(b.x + b.w - cut, b.y + b.h);
    g.lineTo(b.x + b.w, b.y);
    g.lineWidth = 1.3;
    g.lineJoin = 'miter';
    g.strokeStyle = white(0.85);
    g.stroke();
  }
  g.fillStyle = white(0.9);
  g.fillRect(0, kh + 0.4 * st, W, Math.max(1, st));
  mark(s, 'glow', { x: 0, y: kh - 2 * st, w: W, h: (WIRE.seam + 4) * st });
  // a small bar as a block: its top face and, under its near edge, its front
  const block = (x: number, y: number, len: number, thick: number, lean: number) => {
    const face: [number, number][] = [
      [x, y],
      [x + len, y - lean * st],
      [x + len + thick * 0.5, y - lean * st + thick * st],
      [x + thick * 0.5, y + thick * st],
    ];
    polygon(g, face);
    g.fillStyle = white(0.9);
    g.fill();
    polygon(g, [face[3], face[2], [face[2][0], face[2][1] + thick * 0.7 * st], [face[3][0], face[3][1] + thick * 0.7 * st]]);
    g.fillStyle = white(0.4);
    g.fill();
  };
  block(W * 0.03, top + up * 0.46, W * 0.09, 3.2, 5);
  block(W * 0.135, top + up * 0.24, W * 0.045, 2.6, 3);
  block(W * 0.88, top + up * 0.3, W * 0.09, 3.2, -5);
  block(W * 0.82, top + up * 0.58, W * 0.045, 2.6, -3);
  honeycomb(g, st, W * 0.045, top + up * 0.72, 3, 5, 1.5, white(0.75));
  honeycomb(g, st, W * 0.905, top + up * 0.72, 3, 5, 1.5, white(0.75));
  // the readouts: a faint rule under each
  const rule = (b: Box) => {
    g.fillStyle = white(0.24);
    g.fillRect(b.x + b.w * 0.1, b.y + b.h - 0.7 * st, b.w * 0.8, Math.max(1, 0.7 * st));
  };
  const windows = plateWindows('wire', s);
  rule(windows?.score ?? { x: W * 0.24, y: top + WIRE.pad * st, w: W * 0.52, h: (WIRE.upper - 2 * WIRE.pad) * st });
  if (!windows) return;
  rule(windows.speed);
  rule(windows.rate);
  const low = windows.speed.y + windows.speed.h / 2;
  const v = windows.speed.h / st;
  for (const side of [0, 1]) {
    flatAt(g, side === 0 ? windows.speed.x + windows.speed.w + W * 0.022 : windows.rate.x - W * 0.022, low, st, () => {
      const r = v * 0.2;
      const d = side === 0 ? 1 : -1;
      g.beginPath();
      g.moveTo(-d * r * 0.5, -r);
      g.lineTo(d * r * 0.5, 0);
      g.lineTo(-d * r * 0.5, r);
      g.lineWidth = Math.max(1.4, r * 0.34);
      g.lineJoin = 'miter';
      g.strokeStyle = white(0.95);
      g.stroke();
    });
  }
  // the mark: an open ring, two dots, a small upright trapezoid under them
  const R = Math.min(v * 0.5, W * 0.055);
  mark(s, 'emblem', { x: W / 2 - R, y: low - R * st, w: 2 * R, h: 2 * R * st });
  flatAt(g, W / 2, low, st, () => {
    g.beginPath();
    g.arc(0, 0, R, -Math.PI * 0.1, Math.PI * 1.55);
    g.lineWidth = Math.max(1.4, R * 0.12);
    g.lineCap = 'round';
    g.strokeStyle = white(0.95);
    g.stroke();
    for (const dx of [-0.34, 0.34]) {
      g.beginPath();
      g.arc(dx * R, -R * 0.24, R * 0.09, 0, Math.PI * 2);
      g.fillStyle = '#ffffff';
      g.fill();
    }
    g.beginPath();
    g.moveTo(-R * 0.14, R * 0.08);
    g.lineTo(R * 0.14, R * 0.08);
    g.lineTo(R * 0.26, R * 0.5);
    g.lineTo(-R * 0.26, R * 0.5);
    g.closePath();
    g.lineWidth = Math.max(1.2, R * 0.08);
    g.lineJoin = 'miter';
    g.stroke();
  });
}

// ---------- ASTRAL (the starry night skin's gear, 별밤) ----------

/** ASTRAL's light and its one accent, kept for small stars. */
const MOON_BLUE = '#a9c8ff';
const STAR_GOLD = '#f2c14e';

/** A lane's key cap on ASTRAL's strip: as wide as the lane less a gap. */
const astralCap = (lane: DeckLane, st: number): Box => ({ x: lane.left + 2.5, y: 3.5 * st, w: lane.width - 5, h: (ASTRAL.keys - 7) * st });

/**
 * ASTRAL (별밤): a night sky in deep navy, pale moon blue and a little gold, as wide as the track and no
 * wider. Under the judge line a row of navy key caps with cut corners in a pale rim, one to a lane,
 * each with a small gold four-pointed star (the held lane's cap fills with gold light: deckKeys), and
 * a pale hairline. The deck is the sky: a faint star chart drawn in thin lines (three circles, a
 * tilted orbit with two ring nodes), tiny stars scattered, and at each far corner three small pale
 * flowers on a thin ribbon. The readouts have no boxes: a fine rule under each, a small diamond at
 * its ends. Between the two smaller ones stands a white four-pointed star with long points, a pair of
 * pale wings behind it, and over it a row of moon phases. The HUD writes the readouts in the windows
 * (deckReadouts).
 */
function astralPlate(g: CanvasRenderingContext2D, s: DeckSpec): void {
  const st = s.stretch;
  const W = s.width;
  const kh = ASTRAL.keys * st;
  const top = kh + ASTRAL.seam * st;
  const up = ASTRAL.upper * st;
  const H = (ASTRAL.upper + ASTRAL.lower) * st;
  const night = g.createLinearGradient(0, 0, 0, top + H);
  night.addColorStop(0, '#17265e');
  night.addColorStop(1, '#0a1230');
  g.fillStyle = night;
  g.fillRect(0, 0, W, s.depth);
  g.fillStyle = '#0b1434';
  g.fillRect(0, 0, W, kh);
  for (const lane of s.lanes) {
    const cap = astralCap(lane, st);
    polygon(g, octagon(cap, [3.2, 3.2 * st]));
    g.fillStyle = shade(MOON_BLUE, 1, 0.78);
    g.fill();
    const inner: Box = { x: cap.x + 1.2, y: cap.y + 1.2 * st, w: cap.w - 2.4, h: cap.h - 2.4 * st };
    polygon(g, octagon(inner, [2.6, 2.6 * st]));
    const face = g.createLinearGradient(0, cap.y, 0, cap.y + cap.h);
    face.addColorStop(0, '#2b448f');
    face.addColorStop(1, '#16265c');
    g.fillStyle = face;
    g.fill();
    g.fillStyle = white(0.12);
    g.fillRect(inner.x + 2.6, inner.y, inner.w - 5.2, Math.max(1, st));
    flatAt(g, cap.x + cap.w / 2, cap.y + cap.h / 2, st, () => {
      sparkle(g, Math.min(6, lane.width * 0.11));
      g.fillStyle = STAR_GOLD;
      g.fill();
    });
  }
  g.fillStyle = shade(MOON_BLUE, 1, 0.8);
  g.fillRect(0, kh + 0.8 * st, W, Math.max(1, 0.9 * st));
  mark(s, 'glow', { x: 0, y: kh - 2 * st, w: W, h: (ASTRAL.seam + 4) * st });
  // the star chart and the stars, on the sky under the strip
  g.save();
  g.beginPath();
  g.rect(0, top, W, s.depth - top);
  g.clip();
  flatAt(g, W / 2, top + H * 0.6, st, () => {
    g.lineWidth = 1;
    for (const [r, a] of [
      [0.2, 0.22],
      [0.34, 0.15],
      [0.5, 0.1],
    ]) {
      g.beginPath();
      g.arc(0, 0, W * r, 0, Math.PI * 2);
      g.strokeStyle = shade(MOON_BLUE, 1, a);
      g.stroke();
    }
    const tilt = -0.22;
    g.beginPath();
    g.ellipse(0, 0, W * 0.4, W * 0.1, tilt, 0, Math.PI * 2);
    g.strokeStyle = shade(MOON_BLUE, 1, 0.36);
    g.stroke();
    for (const at of [0.5, 3.5]) {
      const [ex, ey] = [Math.cos(at) * W * 0.4, Math.sin(at) * W * 0.1];
      g.beginPath();
      g.arc(ex * Math.cos(tilt) - ey * Math.sin(tilt), ex * Math.sin(tilt) + ey * Math.cos(tilt), 3, 0, Math.PI * 2);
      g.fillStyle = '#101c48';
      g.fill();
      g.strokeStyle = shade(MOON_BLUE, 1, 0.75);
      g.stroke();
    }
  });
  const rand = seeded(11);
  for (let i = 0; i < 26; i++) {
    const [x, y, r, a] = [rand() * W, top + rand() * H, 1 + rand() * 1.8, 0.25 + rand() * 0.4];
    flatAt(g, x, y, st, () => {
      sparkle(g, r);
      g.fillStyle = white(a);
      g.fill();
    });
  }
  g.restore();
  // three small flowers on a ribbon at each far corner
  const flower = (x: number, y: number, r: number, alpha: number) =>
    flatAt(g, x, y, st, () => {
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        g.beginPath();
        g.ellipse(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.5, r * 0.34, a, 0, Math.PI * 2);
        g.fillStyle = shade('#cfe0ff', 1, alpha);
        g.fill();
      }
      g.beginPath();
      g.arc(0, 0, r * 0.2, 0, Math.PI * 2);
      g.fillStyle = shade(STAR_GOLD, 1, alpha);
      g.fill();
    });
  for (const side of [0, 1]) {
    const x = (u: number) => (side === 0 ? u : W - u);
    g.beginPath();
    g.moveTo(x(W * 0.008), top + up * 0.16);
    g.bezierCurveTo(x(W * 0.09), top + up * 0.28, x(W * 0.05), top + up * 0.8, x(W * 0.2), top + up * 0.94);
    g.lineWidth = 1.2;
    g.strokeStyle = shade(MOON_BLUE, 1, 0.5);
    g.stroke();
    flower(x(W * 0.055), top + up * 0.6, 7, 0.92);
    flower(x(W * 0.12), top + up * 0.34, 5, 0.78);
    flower(x(W * 0.165), top + up * 0.78, 4, 0.64);
  }
  // the readouts: a fine rule under each, a small diamond at its ends
  const rule = (b: Box) => {
    const y = b.y + b.h - st;
    g.fillStyle = shade(MOON_BLUE, 1, 0.55);
    g.fillRect(b.x + b.w * 0.08, y, b.w * 0.84, Math.max(1, 0.7 * st));
    for (const ex of [b.x + b.w * 0.08, b.x + b.w * 0.92]) {
      flatAt(g, ex, y + 0.35 * st, st, () => {
        g.beginPath();
        g.moveTo(0, -2.2);
        g.lineTo(2.2, 0);
        g.lineTo(0, 2.2);
        g.lineTo(-2.2, 0);
        g.closePath();
        g.fillStyle = MOON_BLUE;
        g.fill();
      });
    }
  };
  const windows = plateWindows('astral', s);
  rule(windows?.score ?? { x: W * 0.24, y: top + ASTRAL.pad * st, w: W * 0.52, h: (ASTRAL.upper - 2 * ASTRAL.pad) * st });
  if (!windows) return;
  rule(windows.speed);
  rule(windows.rate);
  const low = windows.speed.y + windows.speed.h / 2;
  const v = windows.speed.h / st;
  // the star: long points, a pair of wings behind it, a soft light round it
  const R = Math.min(v * 0.56, W * 0.06);
  mark(s, 'emblem', { x: W / 2 - R, y: low - R * st, w: 2 * R, h: 2 * R * st });
  flatAt(g, W / 2, low + v * 0.06 * st, st, () => {
    for (const d of [-1, 1]) {
      for (const [len, lift, a] of [
        [1.55, -0.42, 0.78],
        [1.3, -0.12, 0.62],
        [1, 0.14, 0.46],
      ]) {
        g.beginPath();
        g.moveTo(d * R * 0.16, R * 0.06);
        g.quadraticCurveTo(d * R * len * 0.6, R * (lift - 0.34), d * R * len, R * lift);
        g.quadraticCurveTo(d * R * len * 0.6, R * (lift + 0.1), d * R * 0.16, R * 0.2);
        g.closePath();
        g.fillStyle = shade(MOON_BLUE, 1, a);
        g.fill();
      }
    }
    const halo = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.2);
    halo.addColorStop(0, white(0.34));
    halo.addColorStop(1, white(0));
    g.fillStyle = halo;
    g.beginPath();
    g.arc(0, 0, R * 1.2, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(0, -R);
    g.quadraticCurveTo(R * 0.1, -R * 0.1, R * 0.62, 0);
    g.quadraticCurveTo(R * 0.1, R * 0.1, 0, R);
    g.quadraticCurveTo(-R * 0.1, R * 0.1, -R * 0.62, 0);
    g.quadraticCurveTo(-R * 0.1, -R * 0.1, 0, -R);
    g.closePath();
    g.fillStyle = '#ffffff';
    g.fill();
  });
  // the moon's phases in a row over it: a full disc, crescents turned away from it at each side
  for (const i of [-2, -1, 0, 1, 2]) {
    flatAt(g, W / 2 + i * R * 0.44, top + up, st, () => {
      const r = i === 0 ? R * 0.13 : R * 0.1;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fillStyle = i === 0 ? '#ffffff' : MOON_BLUE;
      g.fill();
      if (i === 0) return;
      g.beginPath();
      g.arc(-Math.sign(i) * r * (Math.abs(i) === 1 ? 1 : 0.56), 0, r, 0, Math.PI * 2);
      g.fillStyle = '#111d4b';
      g.fill();
    });
  }
}

// ---------- SKY (the sky skin's gear, 하늘) ----------

/** Where SKY's feather stands across its deck (share of the deck's width): left of the score's first letter. */
const SKY_FEATHER_X = 0.312;
/** SKY's one accent, a held dash's light (its housings are a deep navy, #0c1c33: the strip here, the gauge's capsule in the HUD's styles). */
const SKY_CYAN = '#3fe3e6';
/** The deck's sky from its far edge to the foot of the readouts' steps. */
const SKY_BLUES = ['#2f7fd6', '#4d9ee6', '#8ccbf4'] as const;

/** The dash of a lane in SKY's strip: a short thin bar in the lane's middle. */
const dashBox = (lane: DeckLane, st: number): Box => ({ x: lane.left + lane.width * 0.22, y: (SKY.keys / 2 - 1.6) * st, w: lane.width * 0.56, h: 3.2 * st });

/** One soft puff of cloud about (x, y), `r` across (`st` times longer along the track, so it looks round), in `tone` at `alpha`, its edge melting away. */
function puff(g: CanvasRenderingContext2D, x: number, y: number, r: number, st: number, tone: string, alpha: number): void {
  g.save();
  g.translate(x, y);
  g.scale(1, st);
  const soft = g.createRadialGradient(0, 0, 0, 0, 0, r);
  soft.addColorStop(0, shade(tone, 1, alpha));
  soft.addColorStop(0.62, shade(tone, 1, alpha * 0.94));
  soft.addColorStop(1, shade(tone, 1, 0));
  g.fillStyle = soft;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/**
 * A cumulus cloud standing on (cx, base), `r` its largest puff: puffs side by side along a flat base,
 * the middle ones the tallest; a pale blue shade under them first, then their lit white tops, a little
 * up and to the left (the light comes from there). Flat and soft: an illustration's cloud.
 */
function cumulus(g: CanvasRenderingContext2D, cx: number, base: number, r: number, st: number, rand: () => number, puffs = 6): void {
  const row = cumulusRow(cx, r, rand, puffs);
  for (const { x, size } of row) puff(g, x, base - size * 0.5 * st, size, st, CLOUD_SHADE, 0.92);
  for (const { x, size } of row) puff(g, x - size * 0.1, base - size * 0.72 * st, size * 0.86, st, '#ffffff', 0.97);
}

/** A cloud's shade, under its lit white tops. */
const CLOUD_SHADE = '#b9d8f2';

/** A cumulus's puffs about `cx`, `r` its largest: side by side, the middle ones the tallest, each a little off its place. */
function cumulusRow(cx: number, r: number, rand: () => number, puffs: number): { x: number; size: number }[] {
  return Array.from({ length: puffs }, (_, i) => {
    const t = puffs > 1 ? i / (puffs - 1) : 0.5;
    const size = r * (0.5 + 0.5 * Math.sin(Math.PI * t)) * (0.85 + 0.3 * rand());
    return { x: cx + (t - 0.5) * r * 0.62 * puffs + (rand() - 0.5) * r * 0.2, size };
  });
}

/**
 * A cumulus seen faintly, at `alpha` (cumulus's shape): its shade and its lit tops each one soft
 * shape, evenly see-through. Puffs drawn see-through one by one would show every place two of them
 * overlap; here each layer is one outline, filled once (as a shadow thrown from off the canvas: an
 * even fill with a soft edge).
 */
function faintCumulus(g: CanvasRenderingContext2D, cx: number, base: number, r: number, st: number, rand: () => number, puffs: number, alpha: number): void {
  const row = cumulusRow(cx, r, rand, puffs);
  const away = 8192;
  const layer = (tone: string, a: number, place: (p: { x: number; size: number }) => [number, number, number]) => {
    g.save();
    g.shadowColor = shade(tone, 1, a);
    g.shadowBlur = r * 0.16;
    g.shadowOffsetX = away;
    g.fillStyle = '#000000';
    g.beginPath();
    for (const p of row) {
      const [x, y, size] = place(p);
      g.moveTo(x - away + size, y);
      g.ellipse(x - away, y, size, size * st, 0, 0, Math.PI * 2);
    }
    g.fill();
    g.restore();
  };
  layer(CLOUD_SHADE, 0.92 * alpha, ({ x, size }) => [x, base - size * 0.5 * st, size]);
  layer('#ffffff', 0.97 * alpha, ({ x, size }) => [x - size * 0.1, base - size * 0.72 * st, size * 0.86]);
}

/** A thin white hairline from `a` through `via` to `b` (a quadratic curve), fading out at both its ends: a wind trail. */
function trail(g: CanvasRenderingContext2D, a: [number, number], via: [number, number], b: [number, number], width: number, alpha: number): void {
  const fade = g.createLinearGradient(a[0], a[1], b[0], b[1]);
  fade.addColorStop(0, white(0));
  fade.addColorStop(0.18, white(alpha));
  fade.addColorStop(0.82, white(alpha));
  fade.addColorStop(1, white(0));
  g.strokeStyle = fade;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(a[0], a[1]);
  g.quadraticCurveTo(via[0], via[1], b[0], b[1]);
  g.stroke();
}

/** SKY's mark, a white feather `r` long about (cx, cy), leaning to the right: its vane, the shaft curving down out of it, two nicks in the vane's edge. */
function feather(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, st: number, notch: string): void {
  g.save();
  g.translate(cx, cy);
  g.scale(1, st);
  g.rotate(0.56);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(0, -r);
  g.bezierCurveTo(r * 0.6, -r * 0.62, r * 0.5, r * 0.2, r * 0.02, r * 0.52);
  g.bezierCurveTo(-r * 0.46, r * 0.22, -r * 0.44, -r * 0.5, 0, -r);
  g.fill();
  g.strokeStyle = '#ffffff';
  g.lineWidth = Math.max(0.6, r * 0.075);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, r * 0.2);
  g.quadraticCurveTo(r * 0.02, r * 0.75, -r * 0.16, r * 1.12);
  g.stroke();
  // the nicks: the sky showing through
  g.strokeStyle = notch;
  g.lineWidth = Math.max(0.5, r * 0.06);
  for (const [x, y] of [[r * 0.46, -r * 0.14], [-r * 0.4, 0], [r * 0.4, r * 0.16]] as const) {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x * 0.3, y + r * 0.2);
    g.stroke();
  }
  // the shaft, a faint line of shade up the vane
  g.strokeStyle = notch;
  g.globalAlpha = 0.45;
  g.lineWidth = Math.max(0.4, r * 0.04);
  g.beginPath();
  g.moveTo(0, -r * 0.78);
  g.lineTo(0, r * 0.3);
  g.stroke();
  g.restore();
}

/**
 * SKY (하늘): the sky skin's gear, as wide as the track and no wider. Under the judge line a thin navy
 * strip with a dash to a lane, the held lane's lit cyan (deckKeys); under it, past a white line, the
 * deck is a window onto the sky: a deep clear blue easing lighter toward the player, cumulus low in it
 * and toward its two ends (its middle kept clear), thin white wind trails across it, and a feather left
 * of the score. The score is written on the sky itself, a hairline under it; the speed and the rate in
 * two see-through pills (deckReadouts). A matte illustration: no sun, no rays, nothing glints. The
 * sky is its painting where that is loaded (`art.plate`), the same in plain shapes otherwise; the
 * feather its picture likewise (`art.feather`).
 */
function skyPlate(g: CanvasRenderingContext2D, s: DeckSpec, art: GearArt = {}): void {
  const st = s.stretch;
  const W = s.width;
  // the strip and its dashes
  const kh = SKY.keys * st;
  const strip = g.createLinearGradient(0, 0, 0, kh);
  strip.addColorStop(0, '#14294a');
  strip.addColorStop(1, '#0a1730');
  g.fillStyle = strip;
  g.fillRect(0, 0, W, kh);
  g.fillStyle = 'rgba(160,196,232,0.82)';
  for (const lane of s.lanes) {
    const dash = dashBox(lane, st);
    rounded(g, dash, dash.h / (2 * st), st);
    g.fill();
  }
  const top = (SKY.keys + SKY.seam) * st;
  const H = (SKY.upper + SKY.lower) * st;
  if (art.plate) skyPainting(g, s, art.plate, top);
  else skyDrawn(g, s, top, H);
  // the white line along the sky's far edge
  g.fillStyle = white(0.92);
  g.fillRect(0, kh, W, SKY.seam * st);
  mark(s, 'sky', { x: 0, y: top, w: W, h: Math.min(s.depth - top, H) });
  const windows = plateWindows('sky', s);
  if (!windows) return;
  // the feather left of the score, on its line (its picture where that is loaded; drawn in code
  // otherwise), and the hairline under the score. The score is written about the deck's middle
  // (Hud.layDeck), so its first letter stands further left the longer it is: the feather stands
  // where a seven-figure score still leaves it room (SKY_FEATHER_X), a little taller than the score's
  // line, its foot clear of the hairline
  const line = windows.score.h / st;
  const side = line * 1.12;
  const quill = side / 2.9;
  const at = { x: W * SKY_FEATHER_X, y: windows.score.y + windows.score.h / 2 - line * 0.07 * st };
  if (art.feather) {
    g.imageSmoothingQuality = 'high';
    g.drawImage(art.feather, at.x - side / 2, at.y - (side * st) / 2, side, side * st);
  } else feather(g, at.x, at.y, quill, st, SKY_BLUES[0]);
  mark(s, 'feather', { x: at.x - quill * 1.6, y: at.y - quill * 1.6 * st, w: quill * 3.2, h: quill * 3.2 * st });
  const rule = g.createLinearGradient(W * 0.28, 0, W * 0.72, 0);
  rule.addColorStop(0, white(0));
  rule.addColorStop(0.2, white(0.75));
  rule.addColorStop(0.8, white(0.75));
  rule.addColorStop(1, white(0));
  g.fillStyle = rule;
  g.fillRect(W * 0.28, windows.score.y + windows.score.h + 1.5 * st, W * 0.44, Math.max(1, 0.8 * st));
  // the speed's and the rate's pills: the sky seen through a darker glass (dark enough for white type
  // where a cloud stands behind it), a white hairline round each
  for (const pill of [windows.speed, windows.rate]) {
    rounded(g, pill, pill.h / (2 * st), st);
    g.fillStyle = 'rgba(12,38,84,0.64)';
    g.fill();
    g.lineWidth = 0.8;
    g.strokeStyle = white(0.62);
    g.stroke();
  }
}

/**
 * SKY's deck from its painting (a sky painted flat for it, a cloud standing at each end and the middle
 * clear: scripts/assets/build_gears.py): under the strip, as wide as the deck and as much longer
 * along the track as the camera flattens the deck, so it shows as it was painted; where the screen
 * shows the deck deeper than the painting, its sea of cloud runs on and falls into shade.
 */
function skyPainting(g: CanvasRenderingContext2D, s: DeckSpec, pic: Picture, top: number): void {
  const tall = (pic.height / pic.width) * s.width * s.stretch;
  g.save();
  g.beginPath();
  g.rect(0, top, s.width, s.depth - top);
  g.clip();
  g.imageSmoothingQuality = 'high';
  g.drawImage(pic, 0, top, s.width, tall);
  const under = s.depth - top - tall;
  if (under > 0) {
    g.drawImage(pic, 0, pic.height - 1, pic.width, 1, 0, top + tall, s.width, under);
    const fall = g.createLinearGradient(0, top + tall, 0, top + tall + Math.min(under, tall * 0.6));
    fall.addColorStop(0, 'rgba(24,40,72,0)');
    fall.addColorStop(1, 'rgba(24,40,72,0.94)');
    g.fillStyle = fall;
    g.fillRect(0, top + tall, s.width, under);
  }
  g.restore();
}

/** SKY's deck drawn in code (its painting not loaded): the same sky in plain shapes. */
function skyDrawn(g: CanvasRenderingContext2D, s: DeckSpec, top: number, H: number): void {
  const st = s.stretch;
  const W = s.width;
  // the sky: over the readouts' steps, and paler on below them
  const sky = g.createLinearGradient(0, top, 0, top + H);
  SKY_BLUES.forEach((c, i) => sky.addColorStop(i / (SKY_BLUES.length - 1), c));
  g.fillStyle = sky;
  g.fillRect(0, top, W, s.depth - top);
  g.save();
  g.beginPath();
  g.rect(0, top, W, s.depth - top);
  g.clip();
  // the wind trails, behind the clouds
  trail(g, [-0.02 * W, top + 0.4 * H], [0.42 * W, top + 0.02 * H], [1.02 * W, top + 0.32 * H], 0.8, 0.7);
  trail(g, [0.08 * W, top + 0.98 * H], [0.5 * W, top + 0.44 * H], [1.02 * W, top + 0.6 * H], 0.8, 0.6);
  trail(g, [-0.02 * W, top + 0.66 * H], [0.36 * W, top + 0.86 * H], [0.8 * W, top + 1.02 * H], 0.7, 0.45);
  // the clouds: a cumulus standing at each end of the deck, smaller ones behind and beside them, the
  // middle (the score's) kept clear (the same every time)
  const rand = seeded(83);
  const u = H / st / 110;
  for (const [x, y, r, n] of [
    [0.22, 0.62, 8, 4],
    [0.8, 0.56, 7, 4],
    [0.3, 1.04, 13, 4],
    [0.71, 1.06, 12, 4],
    [0.07, 1.1, 50, 4],
    [0.93, 1.1, 43, 4],
    [0.2, 1.12, 22, 4],
    [0.81, 1.14, 20, 4],
  ] as const) {
    cumulus(g, x * W, top + y * H, r * u, st, rand, n);
  }
  // below the readouts a bank of cloud, falling into shade (a tall view shows a long way down the deck)
  if (s.depth > top + H) {
    const bank = g.createLinearGradient(0, top + H, 0, Math.min(s.depth, top + 2.2 * H));
    bank.addColorStop(0, 'rgba(226,240,251,0)');
    bank.addColorStop(0.25, 'rgba(226,240,251,0.85)');
    bank.addColorStop(0.5, 'rgba(160,190,222,0.9)');
    bank.addColorStop(1, 'rgba(24,40,72,0.94)');
    g.fillStyle = bank;
    g.fillRect(0, top + H, W, s.depth - top - H);
  }
  g.restore();
}

/**
 * A gear's picture laid over the lanes, from the track's far end (the canvas's top) to the judge line
 * (its bottom): the deck's own, very faint, under the notes (docs/GEAR_NOTE_FX_RESEARCH.md 7: the
 * lanes stay plainly darker than the deck and than every note). Painted see-through over the track's
 * floor; none for a gear that leaves the lanes as they are. `st`: how many times longer along the
 * track than across it a thing is drawn to look round by the judge line (the picture's px are not
 * square on the track, and the camera flattens it). The picture is painted as the default camera
 * needs it; for another camera (`view`) the renderer then moves its rows to where that camera shows
 * them as far up the lanes (TrackRenderer.paintFloor), so the picture fills the lanes alike whichever
 * camera is picked: as long for the lanes, its clouds as tall on the screen.
 */
export type FloorPaint = (g: CanvasRenderingContext2D, w: number, h: number, st: number, view?: FloorView) => void;

/**
 * How another camera than the default one shows the lanes, for the picture laid over them (FloorPaint):
 * what the paint needs to keep a hairline a hairline, and a ruler even, once the picture's rows are
 * moved for that camera.
 */
export interface FloorView {
  /**
   * Where up the lanes (a share of their length, from the judge line) the default camera shows what
   * this camera shows `up` of the way up them: as far, on the screen, from the judge line to the top
   * of the lanes. The picture's row from there comes to lie `up` of the way up this camera's lanes.
   */
  asDefault: (up: number) => number;
  /**
   * How many times narrower, for its width at the judge line, the default camera shows the track `up`
   * of the way up its lanes than this camera shows it where that row comes to lie: a line there is
   * painted that many times less wide across the track, to be as wide on this camera's screen.
   */
  spread: (up: number) => number;
  /**
   * How many times taller, for their width at the judge line, the default camera shows the lanes than
   * this camera does: a line is painted that many times thicker along the track, to be as thick on
   * this camera's screen once its rows are moved.
   */
  aspect: number;
}
export const GEAR_FLOORS: Partial<Record<GearStyle, FloorPaint>> = {
  sky: skyFloor,
};

/**
 * SKY's wind trails over the lanes, as the skin's picture has them (design-mockups/gear-concepts/
 * r2-skin-sky-c3.jpg): three strands rising from low by the left rail to the right in a long S,
 * steep, then easing across the middle lanes, then steep again toward the right rail. The first and
 * the last are the bright ones; the second runs close under the first, thinner, and leaves it to die
 * out in the middle of the track. Each point is where a strand crosses the track: [share of the
 * track's width from its left edge, track units up from the judge line] on a track SKY_TRACK units
 * long. Read off the picture row by row (its lanes laid flat) and brought to the game's own view (the
 * default camera's, measured off a grid drawn on the lanes): on the screen they lie where the
 * picture has them.
 */
const SKY_STRANDS: readonly { alpha: number; width: number; points: readonly (readonly [number, number])[] }[] = [
  {
    alpha: 0.6,
    width: 1,
    // prettier-ignore
    points: [[0.037, 2.21], [0.055, 2.99], [0.066, 3.37], [0.08, 3.86], [0.098, 4.34], [0.117, 4.83], [0.143, 5.31], [0.169, 5.8], [0.202, 6.28], [0.241, 6.77], [0.278, 7.26], [0.328, 7.74], [0.385, 8.23], [0.438, 8.72], [0.494, 9.21], [0.548, 9.69], [0.599, 10.18], [0.64, 10.67], [0.674, 11.16], [0.705, 11.65], [0.733, 12.14], [0.759, 12.63], [0.781, 13.12], [0.801, 13.61], [0.818, 14.1], [0.833, 14.6], [0.845, 15.09], [0.858, 15.68], [0.869, 16.37]],
  },
  {
    alpha: 0.32,
    width: 0.75,
    // prettier-ignore
    points: [[0.056, 2.4], [0.07, 2.99], [0.082, 3.37], [0.1, 3.86], [0.121, 4.34], [0.145, 4.83], [0.173, 5.31], [0.2, 5.8], [0.235, 6.28], [0.276, 6.77], [0.309, 7.26], [0.353, 7.74], [0.407, 8.23], [0.46, 8.72], [0.523, 9.21], [0.587, 9.84], [0.653, 10.52], [0.703, 11.01], [0.764, 11.41]],
  },
  {
    alpha: 0.58,
    width: 1,
    // prettier-ignore
    points: [[0.164, 2.4], [0.172, 2.99], [0.179, 3.37], [0.196, 3.86], [0.216, 4.34], [0.241, 4.83], [0.27, 5.31], [0.299, 5.8], [0.337, 6.28], [0.385, 6.77], [0.44, 7.26], [0.498, 7.74], [0.559, 8.23], [0.614, 8.72], [0.662, 9.21], [0.713, 9.69], [0.751, 10.18], [0.786, 10.67], [0.818, 11.16], [0.846, 11.65], [0.87, 12.14], [0.892, 12.63], [0.908, 13.12], [0.926, 13.61], [0.942, 14.1], [0.956, 14.69], [0.968, 15.48]],
  },
];
const SKY_TRACK = 40;
/**
 * How far behind the judge line the default camera's eye is, in track units along the track (measured
 * off the same grid): a thing `z` up the track shows 1 + z / SKY_EYE times smaller than at the line,
 * and the track that much flatter again (the strands are drawn that much wider and longer, to look
 * one hairline all the way).
 */
const SKY_EYE = 14.9;
/** The ticks along the lanes' edges: one every this many track units. */
const SKY_TICK = 0.24;

/** A smooth line through `points` (Catmull-Rom), `steps` points to each span. */
function smoothed(points: readonly (readonly [number, number])[], steps: number): [number, number][] {
  const out: [number, number][] = [];
  const p = (i: number) => points[Math.min(points.length - 1, Math.max(0, i))];
  for (let i = 0; i + 1 < points.length; i++) {
    const [a, b, c, d] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const at = (n: 0 | 1) => 0.5 * (2 * b[n] + (c[n] - a[n]) * t + (2 * a[n] - 5 * b[n] + 4 * c[n] - d[n]) * t * t + (3 * b[n] - 3 * c[n] + d[n] - a[n]) * t * t * t);
      out.push([at(0), at(1)]);
    }
  }
  out.push([...points[points.length - 1]] as [number, number]);
  return out;
}

/**
 * One strand of SKY_STRANDS on the lanes' picture: a ribbon as thin on the screen all its way (drawn
 * wider and, where it runs across the track, longer the further up the track it is), fading out at
 * both its ends. `hair`: a hairline's width at the judge line, in the picture's px across.
 */
function strand(g: CanvasRenderingContext2D, w: number, h: number, st: number, s: (typeof SKY_STRANDS)[number], hair: number, view?: FloorView): void {
  const line = smoothed(s.points, 4).map(([f, z]) => {
    const grow = 1 + z / SKY_EYE;
    // another camera than the default one: as wide on its screen, once the picture's rows are moved for it (FloorView)
    const spread = view ? view.spread(z / SKY_TRACK) : 1;
    return { x: f * w, y: h * (1 - z / SKY_TRACK), wide: grow * spread, long: (st * grow * (view?.aspect ?? 1)) / spread };
  });
  const sides: [number, number][][] = [[], []];
  line.forEach((p, i) => {
    const [a, b] = [line[Math.max(0, i - 1)], line[Math.min(line.length - 1, i + 1)]];
    // its direction as the screen shows it: the track's length flattened
    const long = p.long;
    const [tx, ty] = [b.x - a.x, (b.y - a.y) / long];
    const len = Math.hypot(tx, ty) || 1;
    const half = (hair * s.width * p.wide) / 2;
    const [nx, ny] = [(-ty / len) * half, (tx / len) * half * long];
    sides[0].push([p.x + nx, p.y + ny]);
    sides[1].push([p.x - nx, p.y - ny]);
  });
  const [first, last] = [line[0], line[line.length - 1]];
  const fade = g.createLinearGradient(first.x, first.y, last.x, last.y);
  fade.addColorStop(0, white(0));
  fade.addColorStop(0.1, white(s.alpha));
  fade.addColorStop(0.84, white(s.alpha));
  fade.addColorStop(1, white(0));
  g.fillStyle = fade;
  g.beginPath();
  sides[0].forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  for (let i = sides[1].length - 1; i >= 0; i--) g.lineTo(sides[1][i][0], sides[1][i][1]);
  g.closePath();
  g.fill();
}

/**
 * SKY's lanes, as the skin's picture has them (r2-skin-sky-c3.jpg: the colours are read off its lanes
 * laid flat): a deep navy from the far end down to a quarter of the way from the judge line, easing
 * from there to a dim slate blue at the line (well under half the deck's brightness at its brightest),
 * a low bank of cloud at its palest standing on the line under the middle lanes, the three wind
 * trails (SKY_STRANDS) and an altimeter's ticks along the two edges, still: nothing on it moves, and
 * none of it is as bright as a note.
 */
function skyFloor(g: CanvasRenderingContext2D, w: number, h: number, st: number, view?: FloorView): void {
  const sky = g.createLinearGradient(0, 0, 0, h);
  // by how far up the track (units of SKY_TRACK)
  for (const [z, colour] of [
    [40, '18,20,36'],
    [21.5, '20,22,45'],
    [11.7, '20,24,51'],
    [8.7, '22,28,56'],
    [6.8, '29,37,65'],
    [4.8, '37,50,78'],
    [3.4, '47,65,99'],
    [2.5, '54,77,111'],
    [1.7, '59,86,121'],
    [1, '64,92,128'],
    [0.4, '76,103,139'],
    [0, '82,110,146'],
  ] as const) {
    sky.addColorStop(1 - z / SKY_TRACK, `rgba(${colour},0.92)`);
  }
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  // the bank of cloud standing on the line: a cumulus under the middle lanes, a lower one to its right,
  // wisps toward the rails. The picture's last rows are left the plain sky: they are what shows on
  // from the line to the gear
  g.save();
  g.beginPath();
  g.rect(0, 0, w, h - 3);
  g.clip();
  const rand = seeded(47);
  for (const [x, r, n] of [
    [0.46, 0.09, 5],
    [0.7, 0.056, 4],
    [0.13, 0.04, 3],
    [0.9, 0.04, 3],
  ] as const) {
    faintCumulus(g, x * w, h + r * w * 0.25 * st, r * w, st, rand, n, 0.17);
  }
  g.restore();
  for (const s of SKY_STRANDS) strand(g, w, h, st, s, Math.max(1.1, w / 440), view);
  // an altimeter's ticks along the lanes' two edges, as the picture has them: one every SKY_TICK units
  // up the track, every fifth longer; a hairline on the screen all the way (drawn deeper the further
  // up the track, where the camera flattens it), fainter with the distance so they never close into a band.
  // A ruler lying on the track: on another camera than the default one they are as even up its own track,
  // as far apart on the screen by the judge line (FloorView: painted where its rows are moved from)
  const near = 1e-3;
  const tick = view ? ((SKY_TICK / SKY_TRACK) * near) / Math.max(view.asDefault(near), 1e-9) : 0;
  for (let i = 1; i < 4000 && (!view || i * tick <= 1); i++) {
    const z = view ? view.asDefault(i * tick) * SKY_TRACK : i * SKY_TICK;
    if (z >= SKY_TRACK * 0.7) break;
    const thick = Math.max(1, (h / SKY_TRACK) * 0.02 * (1 + z / SKY_EYE) ** 2 * (view?.aspect ?? 1));
    const reach = w * (i % 5 === 1 ? 0.044 : 0.027);
    const y = h * (1 - z / SKY_TRACK) - thick / 2;
    g.fillStyle = `rgba(160,198,240,${(0.5 * (1 - z / (SKY_TRACK * 0.7))).toFixed(3)})`;
    g.fillRect(w * 0.004, y, reach, thick);
    g.fillRect(w * 0.996 - reach, y, reach, thick);
  }
}

const GEAR_PLATES: Record<GearStyle, (g: CanvasRenderingContext2D, s: DeckSpec, art: GearArt) => void> = {
  prism: crystalPlate,
  sky: skyPlate,
  fire: firePlate,
  gpt: gptPlate,
  gemini: geminiPlate,
  grok: grokPlate,
  claude: claudePlate,
  aqua: aquaPlate,
  steel: steelPlate,
  noir: noirPlate,
  wire: wirePlate,
  astral: astralPlate,
  standard: standardPlate,
  piano: pianoPlate,
};

/** Paints the plate of `style` on `g`, whose units are plane px: a gear from its pictures `art` (in code where one is missing). */
export function paintDeck(style: GearStyle, g: CanvasRenderingContext2D, spec: DeckSpec, art: GearArt = {}): void {
  if (art.deck && deckFromPicture(style, spec, art)) deckPicture(g, spec, art.deck);
  else {
    GEAR_PLATES[style](g, spec, art);
    if (art.panel) panelPainting(style, g, spec, art.panel);
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

/** The picture `pic` stretched over the whole tile, or `colour` without it. */
function fill(g: CanvasRenderingContext2D, pic: Picture | undefined, w: number, h: number, colour: string): void {
  g.fillStyle = colour;
  g.fillRect(0, 0, w, h);
  if (!pic) return;
  g.imageSmoothingQuality = 'high';
  g.drawImage(pic, 0, 0, w, h);
}

/** Each gear's frame, from its pictures (in code where one is missing). */
const GEAR_FRAMES: Record<GearStyle, (art: GearArt) => SideLook> = {
  // brushed graphite with the cyan line down its inner edge
  standard: (art) => ({
    body: '#2a2c31',
    width: 14,
    tile: 56,
    height: 14,
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
      g.fillRect(w - 3.6 * k, 0, 0.8 * k, h);
      g.fillStyle = shade(CYAN, 1, lit ? 0.35 : 0.14);
      g.fillRect(w - 2.8 * k, 0, 1.8 * k, h);
      g.fillStyle = shade(CYAN, lit ? 1.15 : 1, lit ? 1 : 0.8);
      g.fillRect(w - 2.2 * k, 0, 0.7 * k, h);
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
  // CRYSTAL: a thin rail of clear glass: a dark seam outside, its outer face in shade, a white ridge,
  // its top a clear pale plane with one slant of light in each tile, and its ground inner edge the
  // brightest, an ice-blue hairline in it (in FEVER the glass takes the ice-blue light and pastels
  // run down it)
  prism: () => ({
    body: '#c7d4e6',
    width: 16,
    tile: 128,
    height: 16,
    // the rail's side: clear glass seen through its cut edge, white under its ridge, the ice-blue line, grey at its foot
    face: (g, w, h, k, lit) => {
      const side = g.createLinearGradient(0, 0, 0, h);
      side.addColorStop(0, '#ffffff');
      side.addColorStop(0.2, lit ? '#c4e8ff' : '#dfe8f3');
      side.addColorStop(0.6, lit ? '#86bfea' : '#a3b3ca');
      side.addColorStop(1, '#4b576d');
      g.fillStyle = side;
      g.fillRect(0, 0, w, h);
      g.fillStyle = shade(CRYSTAL_ICE, 1, lit ? 0.95 : 0.55);
      g.fillRect(0, 2.4 * k, w, 0.9 * k);
    },
    paint: (g, w, h, k, lit) => {
      const across = g.createLinearGradient(0, 0, w, 0);
      across.addColorStop(0, '#2c3548');
      across.addColorStop(0.07, '#7f8da7');
      across.addColorStop(0.24, '#b4c1d6');
      across.addColorStop(0.27, '#ffffff');
      across.addColorStop(0.32, '#e6eef8');
      across.addColorStop(0.7, lit ? '#cdeaff' : '#d9e4f1');
      across.addColorStop(0.88, '#f2f7fc');
      across.addColorStop(0.92, '#ffffff');
      across.addColorStop(1, '#ffffff');
      g.fillStyle = across;
      g.fillRect(0, 0, w, h);
      // one slant of light across its top in each tile
      const [x0, x1] = [w * 0.32, w * 0.86];
      polygon(g, [
        [x0, h * 0.34],
        [x1, h * 0.26],
        [x1, h * 0.31],
        [x0, h * 0.39],
      ]);
      g.fillStyle = white(0.55);
      g.fill();
      if (lit) {
        // pastels down the tile and back (a tile mirrors at every other: they run on)
        const run = g.createLinearGradient(0, 0, 0, h);
        CRYSTAL_PASTELS.forEach((c, i) => run.addColorStop(i / (CRYSTAL_PASTELS.length - 1), c));
        g.fillStyle = run;
        g.globalAlpha = 0.5;
        g.fillRect(x0, 0, x1 - x0, h);
        g.globalAlpha = 1;
      }
      g.fillStyle = shade(CRYSTAL_ICE, 1, lit ? 1 : 0.8);
      g.fillRect(w - 3.6 * k, 0, 0.9 * k, h);
      g.fillStyle = black(0.6);
      g.fillRect(0, 0, 0.8 * k, h);
    },
  }),
  // SKY: a band of pale sky-tinted glass, a dark seam outside, a white line down it nearer the lanes
  // and a cooler edge along them, plain all its length (the altimeter's ticks its picture has are on
  // the lanes: skyFloor); in FEVER the glass brighter and the line cyan
  sky: () => ({
    body: '#9dbddb',
    width: 18,
    tile: 40,
    height: 14,
    // the band's side: the glass seen through its edge, white under its top, deep blue at its foot
    face: (g, w, h, k, lit) => {
      const side = g.createLinearGradient(0, 0, 0, h);
      side.addColorStop(0, '#ffffff');
      side.addColorStop(0.22, lit ? '#c9ecff' : '#b4cfe6');
      side.addColorStop(0.65, '#5f84ad');
      side.addColorStop(1, '#1d3558');
      g.fillStyle = side;
      g.fillRect(0, 0, w, h);
      g.fillStyle = lit ? SKY_CYAN : white(0.7);
      g.fillRect(0, 2.2 * k, w, 0.9 * k);
    },
    paint: (g, w, h, k, lit) => {
      const across = g.createLinearGradient(0, 0, w, 0);
      across.addColorStop(0, '#1c3350');
      across.addColorStop(0.1, lit ? '#93c4e6' : '#86a9cb');
      across.addColorStop(0.45, lit ? '#aad6f2' : '#9dbddb');
      across.addColorStop(0.64, lit ? '#c4e6fa' : '#b4cfe6');
      across.addColorStop(0.7, lit ? SKY_CYAN : '#f4f9fd');
      across.addColorStop(0.78, lit ? SKY_CYAN : '#f4f9fd');
      across.addColorStop(0.85, lit ? '#b6dcf5' : '#a9c4de');
      across.addColorStop(1, '#7f97b3');
      g.fillStyle = across;
      g.fillRect(0, 0, w, h);
      g.fillStyle = black(0.45);
      g.fillRect(0, 0, 0.8 * k, h);
    },
  }),
  // FIRE: a strip of polished chrome, a dark seam outside, its horizon's dark band down its middle and a
  // red line along the lanes; in FEVER the red line burns orange-white
  fire: () => ({
    body: '#b4bcc7',
    width: 16,
    tile: 40,
    height: 12,
    // the strip's side: chrome under its top edge, dark at its foot
    face: (g, w, h, k, lit) => {
      const side = g.createLinearGradient(0, 0, 0, h);
      side.addColorStop(0, '#f6f8fa');
      side.addColorStop(0.3, '#aab2bd');
      side.addColorStop(0.7, '#4f5661');
      side.addColorStop(1, '#17191d');
      g.fillStyle = side;
      g.fillRect(0, 0, w, h);
      g.fillStyle = lit ? '#ffb27a' : FIRE_RED;
      g.fillRect(0, h - 2.4 * k, w, 1.2 * k);
    },
    paint: (g, w, h, k, lit) => {
      const across = g.createLinearGradient(0, 0, w, 0);
      across.addColorStop(0, '#15171b');
      across.addColorStop(0.08, '#8d95a1');
      across.addColorStop(0.3, '#f6f8fa');
      across.addColorStop(0.46, '#b4bcc7');
      across.addColorStop(0.54, '#4f5661');
      across.addColorStop(0.64, '#9aa2ae');
      across.addColorStop(0.84, '#e3e7ec');
      across.addColorStop(1, '#cfd5dc');
      g.fillStyle = across;
      g.fillRect(0, 0, w, h);
      g.fillStyle = lit ? '#ffd9b0' : FIRE_RED;
      g.fillRect(w - 2.6 * k, 0, 1.5 * k, h);
      g.fillStyle = black(0.5);
      g.fillRect(0, 0, 0.8 * k, h);
    },
  }),
  // GPT: a flat white strip, a dark seam outside and its green line along the lanes (lighter in FEVER)
  gpt: () => ({
    body: '#eef1f2',
    width: 14,
    tile: 40,
    height: 12,
    face: (g, w, h, k, lit) => {
      const side = g.createLinearGradient(0, 0, 0, h);
      side.addColorStop(0, '#ffffff');
      side.addColorStop(0.6, '#c9d0d3');
      side.addColorStop(1, '#5d6a6e');
      g.fillStyle = side;
      g.fillRect(0, 0, w, h);
      g.fillStyle = lit ? '#6ff2cd' : GPT_GREEN;
      g.fillRect(0, h - 2.6 * k, w, 1.4 * k);
    },
    paint: (g, w, h, k, lit) => {
      g.fillStyle = '#f4f6f7';
      g.fillRect(0, 0, w, h);
      g.fillStyle = lit ? '#6ff2cd' : GPT_GREEN;
      g.fillRect(w - 3.4 * k, 0, 1.8 * k, h);
      g.fillStyle = black(0.5);
      g.fillRect(0, 0, 0.8 * k, h);
    },
  }),
  // GEMINI: a strip of its raised surface, a violet line along the lanes (pale violet in FEVER)
  gemini: () => ({
    body: GEMINI_RAISED,
    width: 14,
    tile: 40,
    height: 12,
    face: (g, w, h, k, lit) => {
      const side = g.createLinearGradient(0, 0, 0, h);
      side.addColorStop(0, '#3a3c40');
      side.addColorStop(1, '#0c0c0d');
      g.fillStyle = side;
      g.fillRect(0, 0, w, h);
      g.fillStyle = lit ? '#d5c2ff' : GEMINI_VIOLET;
      g.fillRect(0, h - 2.6 * k, w, 1.3 * k);
    },
    paint: (g, w, h, k, lit) => {
      const across = g.createLinearGradient(0, 0, w, 0);
      across.addColorStop(0, '#0a0a0b');
      across.addColorStop(0.12, '#26282b');
      across.addColorStop(1, GEMINI_RAISED);
      g.fillStyle = across;
      g.fillRect(0, 0, w, h);
      const line = g.createLinearGradient(w - 3.6 * k, 0, w - 1.6 * k, 0);
      line.addColorStop(0, lit ? '#a9c4ff' : GEMINI_BLUE);
      line.addColorStop(1, lit ? '#d5c2ff' : GEMINI_VIOLET);
      g.fillStyle = line;
      g.fillRect(w - 3.6 * k, 0, 2 * k, h);
    },
  }),
  // GROK: black, one white hairline along the lanes and a fainter grey one outside it
  grok: () => ({
    body: '#000000',
    width: 14,
    tile: 40,
    height: 12,
    face: (g, w, h, k, lit) => {
      g.fillStyle = '#050505';
      g.fillRect(0, 0, w, h);
      g.fillStyle = lit ? '#ffffff' : white(0.8);
      g.fillRect(0, 0, w, 1.1 * k);
    },
    paint: (g, w, h, k, lit) => {
      g.fillStyle = '#000000';
      g.fillRect(0, 0, w, h);
      g.fillStyle = white(lit ? 0.6 : 0.34);
      g.fillRect(w - 6 * k, 0, 0.9 * k, h);
      g.fillStyle = lit ? '#ffffff' : white(0.92);
      g.fillRect(w - 2.2 * k, 0, 1.3 * k, h);
    },
  }),
  // CLAUDE: a strip of its cream paper, a dark seam outside and a terracotta line along the lanes (lighter in FEVER)
  claude: () => ({
    body: CLAUDE_PAPER,
    width: 14,
    tile: 40,
    height: 12,
    face: (g, w, h, k, lit) => {
      const side = g.createLinearGradient(0, 0, 0, h);
      side.addColorStop(0, CLAUDE_IVORY);
      side.addColorStop(0.6, '#c9c4b6');
      side.addColorStop(1, '#6b6557');
      g.fillStyle = side;
      g.fillRect(0, 0, w, h);
      g.fillStyle = lit ? '#ffb89c' : CLAUDE_CLAY;
      g.fillRect(0, h - 2.6 * k, w, 1.4 * k);
    },
    paint: (g, w, h, k, lit) => {
      g.fillStyle = CLAUDE_PAPER;
      g.fillRect(0, 0, w, h);
      g.fillStyle = lit ? '#ffb89c' : CLAUDE_CLAY;
      g.fillRect(w - 3.4 * k, 0, 1.8 * k, h);
      g.fillStyle = black(0.45);
      g.fillRect(0, 0, 0.8 * k, h);
    },
  }),
  // AQUA: a strip of white armour, a pink line along its outer edge and an aqua one along the lanes (both lighter in FEVER)
  aqua: () => ({
    body: AQUA_WHITE,
    width: 14,
    tile: 40,
    height: 12,
    face: (g, w, h, k, lit) => {
      const side = g.createLinearGradient(0, 0, 0, h);
      side.addColorStop(0, '#ffffff');
      side.addColorStop(0.6, '#c3ced8');
      side.addColorStop(1, '#4d5d68');
      g.fillStyle = side;
      g.fillRect(0, 0, w, h);
      g.fillStyle = lit ? '#b6fdff' : AQUA_CYAN;
      g.fillRect(0, h - 2.6 * k, w, 1.4 * k);
    },
    paint: (g, w, h, k, lit) => {
      g.fillStyle = AQUA_WHITE;
      g.fillRect(0, 0, w, h);
      g.fillStyle = lit ? '#ff9cc8' : AQUA_PINK;
      g.fillRect(1.2 * k, 0, 1.3 * k, h);
      g.fillStyle = lit ? '#b6fdff' : AQUA_CYAN;
      g.fillRect(w - 3.4 * k, 0, 1.8 * k, h);
      g.fillStyle = black(0.5);
      g.fillRect(0, 0, 0.8 * k, h);
    },
  }),
  // STEEL: a thin strip of dark slate, a lighter edge along the lanes (steel blue in FEVER)
  steel: () => ({
    body: '#232b35',
    width: 14,
    tile: 40,
    height: 12,
    face: (g, w, h, k, lit) => {
      const side = g.createLinearGradient(0, 0, 0, h);
      side.addColorStop(0, '#4a5664');
      side.addColorStop(1, '#161b22');
      g.fillStyle = side;
      g.fillRect(0, 0, w, h);
      g.fillStyle = lit ? STEEL_LIT : '#7d8b9b';
      g.fillRect(0, 0, w, 1.1 * k);
    },
    paint: (g, w, h, k, lit) => {
      const across = g.createLinearGradient(0, 0, w, 0);
      across.addColorStop(0, '#0c1015');
      across.addColorStop(0.2, '#2a333e');
      across.addColorStop(1, '#343e4a');
      g.fillStyle = across;
      g.fillRect(0, 0, w, h);
      g.fillStyle = lit ? STEEL_LIT : '#7d8b9b';
      g.fillRect(w - 2.4 * k, 0, 1.2 * k, h);
    },
  }),
  // NOIR: black, one grey hairline along the lanes with a tick and a small node a tile (red in FEVER)
  noir: () => ({
    body: '#050505',
    width: 14,
    tile: 40,
    height: 12,
    face: (g, w, h, k, lit) => {
      g.fillStyle = '#060606';
      g.fillRect(0, 0, w, h);
      g.fillStyle = lit ? NOIR_RED : '#b9bcc2';
      g.fillRect(0, 0, w, 1 * k);
    },
    paint: (g, w, h, k, lit) => {
      g.fillStyle = '#000000';
      g.fillRect(0, 0, w, h);
      g.fillStyle = lit ? NOIR_RED : '#b9bcc2';
      g.fillRect(w - 2.2 * k, 0, 1 * k, h);
      g.fillStyle = lit ? '#ff7f89' : '#8a8f98';
      g.fillRect(w - 7 * k, h * 0.5, 4 * k, Math.max(1, h * 0.02));
      g.fillRect(w - 3.6 * k, 0, 3.6 * k, Math.max(1, h * 0.045));
    },
  }),
  // WIRE: near-black, a white hairline along the lanes, a fainter one outside it and a tick a tile (all brighter in FEVER)
  wire: () => ({
    body: '#06080d',
    width: 14,
    tile: 40,
    height: 12,
    face: (g, w, h, k, lit) => {
      g.fillStyle = '#070a10';
      g.fillRect(0, 0, w, h);
      g.fillStyle = lit ? '#ffffff' : white(0.85);
      g.fillRect(0, 0, w, 1.1 * k);
    },
    paint: (g, w, h, k, lit) => {
      g.fillStyle = '#05070c';
      g.fillRect(0, 0, w, h);
      g.fillStyle = white(lit ? 0.55 : 0.28);
      g.fillRect(w - 6.4 * k, 0, 0.8 * k, h);
      g.fillRect(w - 6.4 * k, h * 0.5, 4 * k, Math.max(1, h * 0.02));
      g.fillStyle = lit ? '#ffffff' : white(0.9);
      g.fillRect(w - 2.4 * k, 0, 1.2 * k, h);
    },
  }),
  // ASTRAL: a strip of deep navy, a moon-blue band and a white hairline along the lanes (the hairline gold in FEVER)
  astral: () => ({
    body: '#16245a',
    width: 14,
    tile: 40,
    height: 12,
    face: (g, w, h, k, lit) => {
      const side = g.createLinearGradient(0, 0, 0, h);
      side.addColorStop(0, '#5a72bd');
      side.addColorStop(0.5, '#22357a');
      side.addColorStop(1, '#0a1230');
      g.fillStyle = side;
      g.fillRect(0, 0, w, h);
      g.fillStyle = lit ? STAR_GOLD : '#ffffff';
      g.fillRect(0, 0, w, 1.1 * k);
    },
    paint: (g, w, h, k, lit) => {
      const across = g.createLinearGradient(0, 0, w, 0);
      across.addColorStop(0, '#060c22');
      across.addColorStop(0.25, '#16245a');
      across.addColorStop(1, '#22357a');
      g.fillStyle = across;
      g.fillRect(0, 0, w, h);
      g.fillStyle = shade(MOON_BLUE, 1, 0.7);
      g.fillRect(w - 5.4 * k, 0, 2.4 * k, h);
      g.fillStyle = lit ? STAR_GOLD : '#ffffff';
      g.fillRect(w - 2.4 * k, 0, 1.1 * k, h);
    },
  }),
};

/** A gear's frame from its pictures `art` (in code where one is missing). */
export function gearBorderLook(style: GearStyle, art: GearArt): SideLook {
  return GEAR_FRAMES[style](art);
}
