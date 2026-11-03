import { KEY_PAINT, lowerTop, paintDeck, shade, type Box, type DeckLane, type DeckSpec, type DeckStyle, type KeyPaint } from './deckArt';
import type { SkinStyle, SkinTextures } from './skins';
import { ink, LONG_PAINT, NOTE_PAINT, NOTE_STRETCH, sideTap, type LongPaint, type LongStyle, type NoteMark, type NotePaint, type NoteStyle, type Paint } from './tintArt';

/**
 * The concept sets drawn from art (client/public/media/styles/<set>/, made by
 * scripts/assets/build_styles.py, whose layouts these constants follow): pictures the note, long
 * note, side note and gear paints draw in place of their code drawings, and the flipbooks of the
 * set's hit effect. They load with the skin's textures (loadSkinArt); a part whose pictures are
 * missing keeps its code drawing. MECHA is the first set: the CHAMFER notes and their rail, the
 * ARCADE gear in four colourways, the MECHA hit.
 */

/** A decoded picture of the media (an ImageBitmap in the browser). */
export type ArtImage = CanvasImageSource & { readonly width: number; readonly height: number };
/** Loaded pictures by manifest id. */
export type StyleImages = Readonly<Partial<Record<string, ArtImage>>>;

/** The colourways of the gears drawn from art, the gear's own first, with their names (설정 → 기어 → 기어 색). */
export const DECK_COLOURS: Partial<Record<DeckStyle, readonly { id: string; label: string }[]>> = {
  arcade: [
    { id: 'gunmetal', label: '건메탈' },
    { id: 'white', label: '화이트 세라믹' },
    { id: 'red', label: '레드 아노다이징' },
    { id: 'blue', label: '코발트 블루' },
  ],
};

/** The colourway a style's gear is drawn in: the one picked when the gear has it, else the gear's own (none for a gear drawn in code). */
export function deckColourOf(style: Pick<SkinStyle, 'deck' | 'deckColour'>): string | undefined {
  const ways = DECK_COLOURS[style.deck];
  if (!ways) return undefined;
  return ways.some((w) => w.id === style.deckColour) ? style.deckColour : ways[0].id;
}

const MECHA = { notes: 'mecha/notes', long: 'mecha/long', side: 'mecha/side', keys: 'mecha/keys', gear: (colour: string) => `mecha/gear_${colour}` };

/** The pictures (manifest ids) a style's parts draw from. */
export function styleImageIds(style: SkinStyle): string[] {
  const ids: string[] = [];
  if (style.note === 'chamfer') ids.push(MECHA.notes, MECHA.long, ...(style.side === 'dots' ? [] : [MECHA.side]));
  const colour = deckColourOf(style);
  if (style.deck === 'arcade' && colour) ids.push(MECHA.keys, MECHA.gear(colour));
  return ids;
}

/** The flipbook textures a style's hit effect plays. */
export function styleTextures(style: SkinStyle): SkinTextures {
  return style.hit === 'mecha' ? { hitBurst: 'mecha/hitBurst', hitHold: 'mecha/hitHold' } : {};
}

/** Draws the source columns `from` (edges, px of the picture) of a band `sy`..`sy + sh` onto the canvas columns `to`, `h` deep: each slice to whole px, so they meet. */
function slices(g: CanvasRenderingContext2D, image: ArtImage, sy: number, sh: number, from: readonly number[], to: readonly number[], h: number): void {
  const xs = to.map(Math.round);
  for (let i = 0; i + 1 < from.length; i++) {
    if (xs[i + 1] > xs[i]) g.drawImage(image, from[i], sy, from[i + 1] - from[i], sh, xs[i], 0, xs[i + 1] - xs[i], h);
  }
}

// ---------- MECHA: notes ----------

/**
 * notes.png: a row per mark (white ○, blue △, gold ◇, scratch //), each note `w` × `h` at y =
 * row × `row` + `top`; `cuts`: where its end caps and its mark start and end (x).
 */
const NOTES = { row: 256, top: 23, w: 1024, h: 210, cuts: [156, 451, 573, 868] } as const;
const NOTE_ROWS: Record<Exclude<NoteMark, 'side'>, number> = { white: 0, blue: 1, gold: 2, scratch: 3 };
/** side.png: the bar over the keys at (0, 0), its end blocks `cut` wide; the side lane's own note (a grille plate) at (0, y), its middle `tile` repeated across. */
const SIDE_BAR = { w: 1024, h: 219, cut: 80 } as const;
const SIDE_PLATE = { y: 240, w: 512, h: 265, tile: [196, 316] } as const;

/**
 * A machined plate (the CHAMFER family): its end caps and its mark keep the look they have in the
 * picture on the screen (the camera flattens the track NOTE_STRETCH times near the line), the
 * brushed metal and the LED slits between them stretch to the lane. A side lane's note is the set's
 * grille plate, its slots repeated across.
 */
function mechaNote(notes: ArtImage, side: ArtImage | undefined): NotePaint {
  return (g, w, h, mark) => {
    if (mark === 'side') {
      if (side) grillePlate(g, side, w, h);
      else NOTE_PAINT.chamfer(g, w, h, mark);
      return;
    }
    const [c0, c1, c2, c3] = NOTES.cuts;
    const k = h / NOTES.h / NOTE_STRETCH;
    // a narrow lane: caps and mark narrower, so the slits keep some length
    const fit = Math.min(1, (w * 0.7) / ((c0 + c2 - c1 + NOTES.w - c3) * k));
    const [cap, mid] = [c0 * k * fit, (c2 - c1) * k * fit];
    const half = (w - 2 * cap - mid) / 2;
    g.imageSmoothingQuality = 'high';
    slices(g, notes, NOTE_ROWS[mark] * NOTES.row + NOTES.top, NOTES.h, [0, c0, c1, c2, c3, NOTES.w], [0, cap, cap + half, cap + half + mid, w - cap, w], h);
  };
}

function grillePlate(g: CanvasRenderingContext2D, image: ArtImage, w: number, h: number): void {
  const [t0, t1] = SIDE_PLATE.tile;
  const k = h / SIDE_PLATE.h / NOTE_STRETCH;
  const [left, right, tile] = [t0 * k, (SIDE_PLATE.w - t1) * k, (t1 - t0) * k];
  const room = w - left - right;
  g.imageSmoothingQuality = 'high';
  if (room < tile * 0.5) {
    g.drawImage(image, 0, SIDE_PLATE.y, SIDE_PLATE.w, SIDE_PLATE.h, 0, 0, w, h);
    return;
  }
  // its left end, its middle slots n times, its right end
  const n = Math.max(1, Math.round(room / tile));
  const to = [0, left, ...Array.from({ length: n }, (_, i) => left + (room * (i + 1)) / n), w];
  const xs = to.map(Math.round);
  g.drawImage(image, 0, SIDE_PLATE.y, t0, SIDE_PLATE.h, xs[0], 0, xs[1] - xs[0], h);
  for (let i = 0; i < n; i++) g.drawImage(image, t0, SIDE_PLATE.y, t1 - t0, SIDE_PLATE.h, xs[i + 1], 0, xs[i + 2] - xs[i + 1], h);
  g.drawImage(image, t1, SIDE_PLATE.y, SIDE_PLATE.w - t1, SIDE_PLATE.h, xs[n + 1], 0, xs[n + 2] - xs[n + 1], h);
}

/** The note style's paint: drawn from art where its pictures loaded. */
export function notePaintOf(style: NoteStyle, images: StyleImages): NotePaint {
  const notes = images[MECHA.notes];
  return style === 'chamfer' && notes ? mechaNote(notes, images[MECHA.side]) : NOTE_PAINT[style];
}

// ---------- MECHA: long notes ----------

/** long.png: the rail's body (a tile that repeats along it) at (0, 0) and held at (w, 0); its end at (2w, 0) and held at (3w, 0). */
const LONG = { w: 128, tile: 256, end: 48 } as const;

function mechaLong(image: ArtImage): LongPaint {
  const part =
    (x: number, h: number): Paint =>
    (g, w, ph) => {
      g.imageSmoothingQuality = 'high';
      g.drawImage(image, x, 0, LONG.w, h, 0, 0, w, ph);
    };
  return {
    body: part(0, LONG.tile),
    end: part(2 * LONG.w, LONG.end),
    held: { body: part(LONG.w, LONG.tile), end: part(3 * LONG.w, LONG.end) },
    // drawn NOTE_STRETCH times longer along the note: on the screen as the picture is
    tile: (LONG.tile / LONG.w) * NOTE_STRETCH,
    endDepth: (LONG.end / LONG.w) * NOTE_STRETCH,
    width: LONG_PAINT.rail.width,
    px: LONG.w,
  };
}

/** The long note style's paint: drawn from art where its pictures loaded. */
export function longPaintOf(style: LongStyle, images: StyleImages): LongPaint {
  const long = images[MECHA.long];
  return style === 'rail' && long ? mechaLong(long) : LONG_PAINT[style];
}

/**
 * A side tap laid over half the keys for the note style (see sideTap): the set's bar, its two long
 * edges glowing, its grille between them see-through, its end blocks keeping their look.
 */
export function sideTapPaintOf(style: NoteStyle, images: StyleImages, edge: number): Paint {
  const side = images[MECHA.side];
  if (style !== 'chamfer' || !side) return sideTap(edge);
  return (g, w, h) => {
    const cut = Math.min((SIDE_BAR.cut * h) / SIDE_BAR.h / NOTE_STRETCH, w * 0.2);
    g.imageSmoothingQuality = 'high';
    slices(g, side, 0, SIDE_BAR.h, [0, SIDE_BAR.cut, SIDE_BAR.w - SIDE_BAR.cut, SIDE_BAR.w], [0, cut, w - cut, w], h);
  };
}

// ---------- MECHA: the gear ----------

/** keys.png: a cap per cell, ○ △ ◇ and a blank one across, at rest in the first row and lit in the second. */
const KEY_CELL = 256;
const KEY_COLS: Record<NoteMark, number> = { white: 0, blue: 1, gold: 2, scratch: 3, side: 3 };
/**
 * gear_<colourway>.png: the turntable's module at (0, 0), `tt` px; the strip under the keys at (0,
 * strip.y), its two bolted plates and the grille between them (x), their ends `bolts` px wide.
 */
const GEAR = {
  tt: [512, 501],
  strip: { y: 512, w: 1024, h: 173, left: [0, 312], vent: [312, 704], right: [704, 1024], bolts: 60, ventEnds: 28 },
} as const;
/** The turntable's disc in its module (shares of the module's width, its middle as shares of each side). */
const DISC = { x: 0.5, y: 0.49, r: 0.41 } as const;

/** Each colourway's plate: its face round the keys, the darker trim of its recesses, its bright edge (sampled from the set's sheets). */
const MECHA_COLOURS: Record<string, { face: string; trim: string; edge: string }> = {
  gunmetal: { face: '#2b2933', trim: '#1f1e27', edge: '#f2f5fd' },
  white: { face: '#e8e6ed', trim: '#c9c7d0', edge: '#6e6c79' },
  red: { face: '#2e2b36', trim: '#24212c', edge: '#d37781' },
  blue: { face: '#201e2b', trim: '#1a1825', edge: '#c3c3cf' },
};

/**
 * The turntable's module in the scratch lane's column (plane px): as wide as the column lets it be
 * and as deep as that looks on the screen, no deeper than the room under the deck's top edge; in the
 * middle of that room when the column is narrower (it stands beside the keys and the strip under them).
 */
export function mechaTurntable(room: number, stretch: number, lane: Pick<DeckLane, 'left' | 'width'>): Box {
  const aspect = GEAR.tt[1] / GEAR.tt[0];
  const top = 4;
  let w = Math.max(8, lane.width - 4);
  let h = w * aspect * stretch;
  const fit = Math.max(8, room - top - 4);
  if (h > fit) {
    h = fit;
    w = h / aspect / stretch;
  }
  return { x: lane.left + (lane.width - w) / 2, y: top + (fit - h) / 2, w, h };
}

/** A cap's half size across, as large as the code button's socket reaches (KEY_PAINT.arcade): the row is laid out for that. */
const capHalf = (w: number, h: number, st: number) => Math.max(1, (KEY_PAINT.arcade.reach('white', w, h, st) - 0.75) / st);

function mechaKeys(keys: ArtImage): KeyPaint {
  const cap =
    (lit: boolean, st: number, mark: NoteMark = 'white'): Paint =>
    (g, w, h) => {
      const half = capHalf(w, h, st);
      const [x, y] = [w / 2, h / 2];
      if (lit) {
        // a soft glow round the lit cap
        g.save();
        g.translate(x, y);
        g.scale(1, st);
        const grad = g.createRadialGradient(0, 0, half * 0.8, 0, 0, half * 1.7);
        grad.addColorStop(0, ink(1, 0.2, 0.5));
        grad.addColorStop(1, ink(1, 0, 0));
        g.fillStyle = grad;
        g.fillRect(-half * 1.7, -half * 1.7, half * 3.4, half * 3.4);
        g.restore();
      }
      g.imageSmoothingQuality = 'high';
      g.drawImage(keys, KEY_COLS[mark] * KEY_CELL, lit ? KEY_CELL : 0, KEY_CELL, KEY_CELL, x - half, y - half * st, half * 2, half * 2 * st);
    };
  // the turntable is the plate's; lit, a ring of light round its disc and a wash over it
  const turntable: Paint = (g, w, h) => {
    const r = w * DISC.r;
    const st = h / (w * (GEAR.tt[1] / GEAR.tt[0]));
    g.save();
    g.translate(w * DISC.x, h * DISC.y);
    g.scale(1, st);
    g.beginPath();
    g.arc(0, 0, r * 0.97, 0, Math.PI * 2);
    g.fillStyle = ink(1, 0, 0.16);
    g.fill();
    for (const [width, fill] of [
      [r * 0.24, ink(1, 0.15, 0.3)],
      [r * 0.08, ink(1, 0.75)],
    ] as [number, string][]) {
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.lineWidth = width;
      g.strokeStyle = fill;
      g.stroke();
    }
    g.restore();
  };
  return {
    idle: (kind, st, mark) => (kind === 'scratch' ? () => undefined : cap(false, st, mark)),
    down: (kind, st, mark) => (kind === 'scratch' ? turntable : cap(true, st, mark)),
    reach: KEY_PAINT.arcade.reach,
    scratchBox: mechaTurntable,
  };
}

/** MECHA's gear pictures for a style: its caps and its colourway's plate, when both loaded (the gear is drawn from art whole, or in code). */
function mechaGear(style: Pick<SkinStyle, 'deck' | 'deckColour'>, images: StyleImages): { keys: ArtImage; gear: ArtImage; colour: string } | null {
  const colour = deckColourOf(style);
  const keys = images[MECHA.keys];
  const gear = colour ? images[MECHA.gear(colour)] : undefined;
  return style.deck === 'arcade' && colour && keys && gear ? { keys, gear, colour } : null;
}

/** The gear's lane lights: drawn from art where its pictures loaded. */
export function keyPaintOf(style: Pick<SkinStyle, 'deck' | 'deckColour'>, images: StyleImages): KeyPaint {
  const mecha = mechaGear(style, images);
  return mecha ? mechaKeys(mecha.keys) : KEY_PAINT[style.deck];
}

/** The same stream of numbers for every paint: a plate never shimmers when it is painted again. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Draws a strip part `from` (atlas x) to a box: its ends `end` atlas px wide keep their look, its middle stretches. */
function threeSlice(g: CanvasRenderingContext2D, image: ArtImage, sy: number, sh: number, from: readonly [number, number], end: number, x: number, y: number, w: number, h: number, k: number): void {
  const e = Math.min(end * k, w / 3);
  const xs = [x, x + e, x + w - e, x + w].map(Math.round);
  const src = [from[0], from[0] + end, from[1] - end, from[1]];
  for (let i = 0; i < 3; i++) if (xs[i + 1] > xs[i]) g.drawImage(image, src[i], sy, src[i + 1] - src[i], sh, xs[i], y, xs[i + 1] - xs[i], h);
}

/**
 * MECHA's plate in its colourway: a brushed face, a bright edge just under the judge line, a dark
 * recess round each cap, the turntable's module in the scratch lane, and under the row, room
 * allowing, the strip of the sheet: two bolted plates and a grille between them.
 */
function mechaPlate(gear: ArtImage, colour: string): (g: CanvasRenderingContext2D, s: DeckSpec) => void {
  const c = MECHA_COLOURS[colour] ?? MECHA_COLOURS.gunmetal;
  return (g, s) => {
    g.fillStyle = c.face;
    g.fillRect(0, 0, s.width, s.depth);
    const rand = seeded(7);
    const light = colour === 'white' ? 'rgba(0,0,0,' : 'rgba(255,255,255,';
    for (let y = 4; y < s.depth; y += 2) {
      g.fillStyle = `${light}${(0.01 + rand() * 0.025).toFixed(3)})`;
      g.fillRect(0, y, s.width, 1);
    }
    // the bright edge under the line, a shadow under it; the frame's bevelled ends at the sides
    g.fillStyle = shade(c.edge, 1, 0.7);
    g.fillRect(0, 0, s.width, 1.5);
    g.fillStyle = shade(c.trim, 0.55);
    g.fillRect(0, 1.5, s.width, 1.5);
    for (const [x, k] of [
      [0, 1],
      [s.width - 3, 0.6],
    ] as [number, number][]) {
      g.fillStyle = shade(c.edge, k, 0.55);
      g.fillRect(x, 0, 3, s.depth);
    }
    // a recess round each cap (the cap's own picture draws its socket's rim)
    const cy = s.keyTop + s.keyDepth / 2;
    g.fillStyle = shade(c.trim, colour === 'white' ? 0.9 : 0.7);
    for (const l of s.lanes) {
      if (l.kind === 'scratch') continue;
      const half = capHalf(l.width, s.keyDepth, s.stretch) * 1.08;
      g.beginPath();
      g.roundRect(l.left + l.width / 2 - half, cy - half * s.stretch, half * 2, half * 2 * s.stretch, [{ x: half * 0.3, y: half * 0.3 * s.stretch }]);
      g.fill();
    }
    // the side bars' recesses under the row, as the code gear's
    for (const b of s.sides) {
      g.beginPath();
      g.roundRect(b.left + b.width * 0.04, b.top, b.width * 0.92, b.depth, [{ x: b.depth * 0.3, y: b.depth * 0.3 }]);
      g.fill();
    }
    g.imageSmoothingQuality = 'high';
    const scratch = s.lanes.find((l) => l.kind === 'scratch');
    if (scratch) {
      const b = mechaTurntable(s.room, s.stretch, scratch);
      g.drawImage(gear, 0, 0, GEAR.tt[0], GEAR.tt[1], b.x, b.y, b.w, b.h);
    }
    // the strip: from the scratch's column (or the frame) to the frame, as deep as the room under the row
    const top = lowerTop(s) + 6;
    const bottom = s.room - 4;
    if (bottom - top < 14) return;
    const x0 = scratch ? scratch.left + scratch.width + 2 : 5;
    const w = s.width - 5 - x0;
    const h = bottom - top;
    const st = GEAR.strip;
    // across, the ends look on the screen as in the picture: atlas px to plane px
    const k = h / st.h / s.stretch;
    const share = (span: readonly [number, number]) => (w * (span[1] - span[0])) / st.w;
    const [lw, vw] = [share(st.left), share(st.vent)];
    threeSlice(g, gear, st.y, st.h, st.left, st.bolts, x0, top, lw, h, k);
    threeSlice(g, gear, st.y, st.h, st.vent, st.ventEnds, x0 + lw, top, vw, h, k);
    threeSlice(g, gear, st.y, st.h, st.right, st.bolts, x0 + lw + vw, top, w - lw - vw, h, k);
  };
}

/** Which of a style's parts its loaded pictures draw: "notes", "long", "side", "gear:<colourway>". */
export function artPartsOf(style: SkinStyle, images: StyleImages): string[] {
  const parts: string[] = [];
  if (style.note === 'chamfer') {
    if (images[MECHA.notes]) parts.push('notes');
    if (images[MECHA.long]) parts.push('long');
    if (images[MECHA.side] && style.side !== 'dots') parts.push('side');
  }
  const gear = mechaGear(style, images);
  if (gear) parts.push(`gear:${gear.colour}`);
  return parts;
}

/** The gear's plate: drawn from art in its colourway where its pictures loaded. */
export function platePaintOf(style: Pick<SkinStyle, 'deck' | 'deckColour'>, images: StyleImages): (g: CanvasRenderingContext2D, s: DeckSpec) => void {
  const mecha = mechaGear(style, images);
  return mecha ? mechaPlate(mecha.gear, mecha.colour) : (g, s) => paintDeck(style.deck, g, s);
}
