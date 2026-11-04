import { KEY_PAINT, lightBox, lowerTop, paintDeck, shade, type Box, type DeckLane, type DeckSpec, type DeckStyle, type KeyKind, type KeyPaint } from './deckArt';
import type { SkinStyle, SkinTextures } from './skins';
import {
  ink,
  LONG_OF,
  LONG_PAINT,
  NOTE_PAINT,
  NOTE_STRETCH,
  noteMark,
  sideTap,
  tone,
  type HitStyle,
  type LongPaint,
  type NoteMark,
  type NotePaint,
  type NoteStyle,
  type Paint,
} from './tintArt';

/**
 * The concept sets drawn from art (client/public/media/styles/<set>/, made by
 * scripts/assets/build_styles.py, whose layouts these constants follow): pictures the note, long
 * note, side note and gear paints draw in place of their code drawings, and the flipbooks of the
 * set's hit effect. They load with the skin's textures (loadSkinArt); a part whose pictures are
 * missing keeps its code drawing. A set is a note family with its long note and side notes, a gear
 * in four colourways and a hit, each picked on its own (설정 → 기어):
 *
 * - MECHA: the CHAMFER notes (machined plates) and their rail, the ARCADE gear, the MECHA hit;
 * - CLUB: the ROUND notes (records) and their capsule, the MIXER gear, the CLUB hit (rings);
 * - CRYSTAL: the STAR4 notes (cut gems) and their prism, the CRYSTAL gear, the CRYSTAL hit (shards);
 * - NEON: the STAR5 notes (neon stars) and their tube, the NEON gear, the NEON hit (arcs);
 * - PIANO: the PIANO notes (key fronts) and their lacquered key, the GRAND gear, the PIANO hit
 *   (musical notes bursting out).
 */
export type ArtSet = 'mecha' | 'club' | 'crystal' | 'neon' | 'piano';

const SETS: Record<ArtSet, { note: NoteStyle; deck: DeckStyle; hit: HitStyle }> = {
  mecha: { note: 'chamfer', deck: 'arcade', hit: 'mecha' },
  club: { note: 'round', deck: 'mixer', hit: 'club' },
  crystal: { note: 'star4', deck: 'crystal', hit: 'crystal' },
  neon: { note: 'star5', deck: 'neon', hit: 'neon' },
  piano: { note: 'piano', deck: 'grand', hit: 'piano' },
};
const SET_IDS = Object.keys(SETS) as ArtSet[];
const setOf = (part: 'note' | 'deck' | 'hit', value: string): ArtSet | undefined => SET_IDS.find((s) => SETS[s][part] === value);

/** Whether a hit effect is a set's, drawn from its flipbooks (in code while they are missing). */
export const isArtHit = (hit: string): boolean => setOf('hit', hit) !== undefined;

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
  mixer: [
    { id: 'black', label: '매트 블랙' },
    { id: 'white', label: '화이트' },
    { id: 'silver', label: '실버 브러시드' },
    { id: 'walnut', label: '월넛 우드' },
  ],
  crystal: [
    { id: 'silver', label: '실버' },
    { id: 'rosegold', label: '로즈 골드' },
    { id: 'gold', label: '골드' },
    { id: 'smoke', label: '스모크 블랙' },
  ],
  neon: [
    { id: 'black', label: '블랙 글라스' },
    { id: 'carbon', label: '카본' },
    { id: 'navy', label: '딥 네이비' },
    { id: 'burgundy', label: '버건디 골드' },
  ],
  grand: [
    { id: 'ebony', label: '블랙 래커' },
    { id: 'white', label: '화이트 래커' },
    { id: 'mahogany', label: '마호가니' },
    { id: 'emerald', label: '에메랄드 그린' },
  ],
};

/** The colourway a style's gear is drawn in: the one picked when the gear has it, else the gear's own (none for a gear drawn in code). */
export function deckColourOf(style: Pick<SkinStyle, 'deck' | 'deckColour'>): string | undefined {
  const ways = DECK_COLOURS[style.deck];
  if (!ways) return undefined;
  return ways.some((w) => w.id === style.deckColour) ? style.deckColour : ways[0].id;
}

/**
 * A set's name in the manifest, its pictures listed as "<name>/<part>": CRYSTAL's is "gem", as
 * "crystal" already names an earlier texture set (skins/crystal/, which user skins may ask for).
 */
const MANIFEST_NAME: Record<ArtSet, string> = { mecha: 'mecha', club: 'club', crystal: 'gem', neon: 'neon', piano: 'piano' };
const artId = (set: ArtSet, part: 'notes' | 'long' | 'side' | 'keys' | 'hitBurst' | 'hitHold') => `${MANIFEST_NAME[set]}/${part}`;
const gearId = (set: ArtSet, colour: string) => `${MANIFEST_NAME[set]}/gear_${colour}`;

/** The pictures (manifest ids) a style's parts draw from. */
export function styleImageIds(style: SkinStyle): string[] {
  const ids: string[] = [];
  const notes = setOf('note', style.note);
  if (notes) ids.push(artId(notes, 'notes'), artId(notes, 'long'), ...(style.side === 'dots' ? [] : [artId(notes, 'side')]));
  const gear = setOf('deck', style.deck);
  const colour = deckColourOf(style);
  if (gear && colour) ids.push(artId(gear, 'keys'), gearId(gear, colour));
  return ids;
}

/** The flipbook textures a style's hit effect plays. */
export function styleTextures(style: SkinStyle): SkinTextures {
  const set = setOf('hit', style.hit);
  return set ? { hitBurst: artId(set, 'hitBurst'), hitHold: artId(set, 'hitHold') } : {};
}

/** Draws the source columns `from` (edges, px of the picture) of a band `sy`..`sy + sh` onto the canvas columns `to`, `h` deep from `y`: each slice to whole px, so they meet. */
function slices(g: CanvasRenderingContext2D, image: ArtImage, sy: number, sh: number, from: readonly number[], to: readonly number[], h: number, y = 0): void {
  const xs = to.map(Math.round);
  for (let i = 0; i + 1 < from.length; i++) {
    if (xs[i + 1] > xs[i]) g.drawImage(image, from[i], sy, from[i + 1] - from[i], sh, xs[i], y, xs[i + 1] - xs[i], h);
  }
}

// ---------- notes ----------

/** Where each key's note lies in a set's notes.png: a row (MECHA, CRYSTAL) or a cell (CLUB, NEON) per mark. */
const MARK_CELL: Record<Exclude<NoteMark, 'side'>, number> = { white: 0, blue: 1, gold: 2, scratch: 3 };

/**
 * MECHA's notes.png: a row per mark (white ○, blue △, gold ◇, scratch //), each note `w` × `h` at
 * y = row × `row` + `top`; `cuts`: where its end caps and its mark start and end (x).
 */
type SlabLayout = { row: number; top: number; w: number; h: number; cuts: readonly [number, number, number, number] };
const NOTES: SlabLayout = { row: 256, top: 23, w: 1024, h: 210, cuts: [156, 451, 573, 868] };
/** PIANO's notes.png: as MECHA's, a key front per row; `cuts`: its rounded ends and the mark with the inlay's break round it. */
const PIANO_NOTES: SlabLayout = { row: 256, top: 28, w: 1024, h: 200, cuts: [24, 440, 584, 1000] };
/** MECHA's side.png: the bar over the keys at (0, 0), its end blocks `cut` wide; the side lane's own note (a grille plate) at (0, y), its middle `tile` repeated across. */
const SIDE_BAR = { w: 1024, h: 219, cut: 80 } as const;
const SIDE_PLATE = { y: 240, w: 512, h: 265, tile: [196, 316] } as const;

/**
 * The other sets' side.png: the bar over the keys at (0, 0), 1024 wide and `h` deep, its round or
 * cut ends `cut` wide; the side lane's own note at (0, 256), 512 wide, `plate.h` deep, its ends
 * `plate.cut` wide.
 */
const SET_SIDE: Record<Exclude<ArtSet, 'mecha'>, { h: number; cut: number; plate: { h: number; cut: number } }> = {
  piano: { h: 175, cut: 59, plate: { h: 175, cut: 60 } },
  club: { h: 211, cut: 108, plate: { h: 210, cut: 108 } },
  crystal: { h: 206, cut: 41, plate: { h: 203, cut: 36 } },
  neon: { h: 248, cut: 41, plate: { h: 146, cut: 82 } },
};
const PLATE_Y = 256;

/**
 * A slab across the lane, cut in five: its ends and its mark keep the look they have in the picture
 * on the screen (the camera flattens the track NOTE_STRETCH times near the line), what lies between
 * them stretches to the lane (slices meet at whole px).
 */
function slab(g: CanvasRenderingContext2D, notes: ArtImage, layout: SlabLayout, mark: Exclude<NoteMark, 'side'>, w: number, h: number): void {
  const [c0, c1, c2, c3] = layout.cuts;
  const k = h / layout.h / NOTE_STRETCH;
  // a narrow lane: ends and mark narrower, so what lies between keeps some length
  const fit = Math.min(1, (w * 0.7) / ((c0 + c2 - c1 + layout.w - c3) * k));
  const [cap, mid] = [c0 * k * fit, (c2 - c1) * k * fit];
  const half = (w - 2 * cap - mid) / 2;
  g.imageSmoothingQuality = 'high';
  slices(g, notes, MARK_CELL[mark] * layout.row + layout.top, layout.h, [0, c0, c1, c2, c3, layout.w], [0, cap, cap + half, cap + half + mid, w - cap, w], h);
}

/**
 * A machined plate (the CHAMFER family): its end caps and its mark keep their look, the brushed
 * metal and the LED slits between them stretch to the lane. A side lane's note is the set's grille
 * plate, its slots repeated across.
 */
function mechaNote(notes: ArtImage, side: ArtImage | undefined): NotePaint {
  return (g, w, h, mark) => {
    if (mark === 'side') {
      if (side) grillePlate(g, side, w, h);
      else NOTE_PAINT.chamfer(g, w, h, mark);
      return;
    }
    slab(g, notes, NOTES, mark, w, h);
  };
}

/** PIANO: the front of a piano key across the lane, its rounded ends and its inlaid mark keeping their look, its inlay line stretched between. */
function pianoNote(notes: ArtImage, side: ArtImage | undefined): NotePaint {
  return (g, w, h, mark) => {
    if (mark === 'side') {
      if (side) sidePlate(g, side, 'piano', w, h);
      else NOTE_PAINT.piano(g, w, h, mark);
      return;
    }
    slab(g, notes, PIANO_NOTES, mark, w, h);
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

/**
 * A side lane's own note in CLUB, CRYSTAL and NEON: the set's short side plate as long as the note
 * is wide, its ends keeping their look and its middle stretched, PLATE_FULL times as deep on the
 * screen as the picture draws it for that length (a side lane is narrow: so it reads), no deeper
 * than the note, about the note's middle.
 */
const PLATE_FULL = 1.6;

function sidePlate(g: CanvasRenderingContext2D, side: ArtImage, set: Exclude<ArtSet, 'mecha'>, w: number, h: number): void {
  const { plate } = SET_SIDE[set];
  const ph = Math.min(h, (w * plate.h * NOTE_STRETCH * PLATE_FULL) / 512);
  const cut = Math.min((plate.cut * ph) / plate.h / NOTE_STRETCH, w * 0.3);
  g.imageSmoothingQuality = 'high';
  slices(g, side, PLATE_Y, plate.h, [0, plate.cut, 512 - plate.cut, 512], [0, cut, w - cut, w], ph, (h - ph) / 2);
}

/** CLUB's and NEON's notes.png: a cell of 512 per mark, two to a row, the note at (6, `top`) in it, 500 × `h` (its own proportions). */
const NOTE_CELL: Record<'club' | 'neon', { top: number; h: number }> = {
  club: { top: 6, h: 500 },
  neon: { top: 12, h: 488 },
};

/** CLUB: a record, as round as the coin it stands for, its lane's mark printed on its label. */
function clubNote(notes: ArtImage, side: ArtImage | undefined): NotePaint {
  return (g, w, h, mark) => {
    if (mark === 'side') {
      if (side) sidePlate(g, side, 'club', w, h);
      else NOTE_PAINT.round(g, w, h, mark);
      return;
    }
    const i = MARK_CELL[mark];
    g.imageSmoothingQuality = 'high';
    g.drawImage(notes, (i % 2) * 512 + 6, Math.floor(i / 2) * 512 + NOTE_CELL.club.top, 500, NOTE_CELL.club.h, 0, 0, w, h);
  };
}

/** Where NEON's star has room for its lane's mark: under the tube across it, between its legs (shares of the note). */
const NEON_MARK = { y: 0.66, r: 0.062 } as const;

/** NEON: a star of neon tube, a tube across its middle, its lane's mark lit in tube under it. */
function neonNote(notes: ArtImage, side: ArtImage | undefined): NotePaint {
  return (g, w, h, mark) => {
    if (mark === 'side') {
      if (side) sidePlate(g, side, 'neon', w, h);
      else NOTE_PAINT.star5(g, w, h, mark);
      return;
    }
    const i = MARK_CELL[mark];
    g.imageSmoothingQuality = 'high';
    g.drawImage(notes, (i % 2) * 512 + 6, Math.floor(i / 2) * 512 + NOTE_CELL.neon.top, 500, NOTE_CELL.neon.h, 0, 0, w, h);
    noteMark(g, mark, w / 2, h * NEON_MARK.y, Math.min(w * NEON_MARK.r, (h * NEON_MARK.r) / NOTE_STRETCH), ink(1, 0.78), false);
  };
}

/** CRYSTAL's notes.png: a gem per mark, a row of 256 each, 1024 × 253 from y = row × 256 + 1. */
const GEM = { w: 1024, h: 253, top: 1 } as const;
/**
 * How much deeper on the screen than the picture CRYSTAL draws its gem across a note (it lies in a
 * bar's depth, a long flat gem: a little fuller than drawn, it reads at speed), at most the note's depth.
 */
const GEM_FULL = 1.75;

/** CRYSTAL: a long cut gem across the lane, its points at the lane's edges, its lane's mark cut in its heart. */
function crystalNote(notes: ArtImage, side: ArtImage | undefined): NotePaint {
  return (g, w, h, mark) => {
    if (mark === 'side') {
      if (side) sidePlate(g, side, 'crystal', w, h);
      else NOTE_PAINT.star4(g, w, h, mark);
      return;
    }
    const gh = Math.min(h, (w * GEM.h * NOTE_STRETCH * GEM_FULL) / GEM.w);
    g.imageSmoothingQuality = 'high';
    g.drawImage(notes, 0, MARK_CELL[mark] * 256 + GEM.top, GEM.w, GEM.h, 0, (h - gh) / 2, w, gh);
    noteMark(g, mark, w / 2, h / 2, Math.min(w * 0.042, (gh * 0.2) / NOTE_STRETCH), tone(0.34), false);
  };
}

/** The note style's paint: drawn from art where its pictures loaded. */
export function notePaintOf(style: NoteStyle, images: StyleImages): NotePaint {
  const set = setOf('note', style);
  const notes = set && images[artId(set, 'notes')];
  if (!set || !notes) return NOTE_PAINT[style];
  const side = images[artId(set, 'side')];
  return { mecha: mechaNote, club: clubNote, crystal: crystalNote, neon: neonNote, piano: pianoNote }[set](notes, side);
}

/**
 * How tall a note drawn from art looks for its width at the judge line (see noteDepthOf): CLUB's
 * record round, NEON's star as drawn; null where it lies in a bar's depth (CRYSTAL's long gem, as
 * MECHA's plate does); undefined while the style is drawn in code.
 */
export function noteShapeOf(style: NoteStyle, images: StyleImages): number | null | undefined {
  const set = setOf('note', style);
  if (!set || !images[artId(set, 'notes')]) return undefined;
  return { mecha: null, club: 1, crystal: null, neon: NOTE_CELL.neon.h / 500, piano: null }[set];
}

// ---------- long notes ----------

/**
 * long.png: the body (a tile that repeats along it) at (0, 0) and held at (w, 0); its end at (2w, 0)
 * and held at (3w, 0), `end` deep (each set's own: MECHA's cut end, CLUB's round one, CRYSTAL's
 * point, NEON's capped tube).
 */
const LONG = { w: 128, tile: 256 } as const;
const LONG_END: Record<ArtSet, number> = { mecha: 48, club: 78, crystal: 70, neon: 59, piano: 57 };

function artLong(image: ArtImage, end: number, width: number): LongPaint {
  const part =
    (x: number, h: number): Paint =>
    (g, w, ph) => {
      g.imageSmoothingQuality = 'high';
      g.drawImage(image, x, 0, LONG.w, h, 0, 0, w, ph);
    };
  return {
    body: part(0, LONG.tile),
    end: part(2 * LONG.w, end),
    held: { body: part(LONG.w, LONG.tile), end: part(3 * LONG.w, end) },
    // drawn NOTE_STRETCH times longer along the note: on the screen as the picture is
    tile: (LONG.tile / LONG.w) * NOTE_STRETCH,
    endDepth: (end / LONG.w) * NOTE_STRETCH,
    width,
    px: LONG.w,
  };
}

/** The long note of a note style (its family's, LONG_OF): drawn from art where its pictures loaded. */
export function longPaintOf(style: NoteStyle, images: StyleImages): LongPaint {
  const code = LONG_PAINT[LONG_OF[style]];
  const set = setOf('note', style);
  const long = set && images[artId(set, 'long')];
  return set && long ? artLong(long, LONG_END[set], code.width) : code;
}

/**
 * A side tap laid over half the keys for the note style (see sideTap): the set's bar, its two long
 * edges glowing, the middle between them see-through, its ends keeping their look.
 */
export function sideTapPaintOf(style: NoteStyle, images: StyleImages, edge: number): Paint {
  const set = setOf('note', style);
  const side = set && images[artId(set, 'side')];
  if (!set || !side) return sideTap(edge);
  const { h: bh, cut: bc } = set === 'mecha' ? SIDE_BAR : SET_SIDE[set];
  return (g, w, h) => {
    const cut = Math.min((bc * h) / bh / NOTE_STRETCH, w * 0.2);
    g.imageSmoothingQuality = 'high';
    slices(g, side, 0, bh, [0, bc, 1024 - bc, 1024], [0, cut, w - cut, w], h);
  };
}

// ---------- the gears ----------

/** keys.png: a picture per cell. MECHA's: a cap per cell, ○ △ ◇ and a blank one across, at rest in the first row and lit in the second; the other sets': the light at rest, then lit. */
const KEY_CELL = 256;
const KEY_COLS: Record<NoteMark, number> = { white: 0, blue: 1, gold: 2, scratch: 3, side: 3 };
/**
 * MECHA's gear_<colourway>.png: the turntable's module at (0, 0), `tt` px; the strip under the keys
 * at (0, strip.y), its two bolted plates and the grille between them (x), their ends `bolts` px wide.
 */
const GEAR = {
  tt: [512, 501],
  strip: { y: 512, w: 1024, h: 173, left: [0, 312], vent: [312, 704], right: [704, 1024], bolts: 60, ventEnds: 28 },
} as const;
/** Where the scratch lights its module: a ring of light round the disc (shares of the module's width, its middle as shares of each side). */
type Disc = { x: number; y: number; r: number };
const DISC: Disc = { x: 0.5, y: 0.49, r: 0.41 };

/** Each colourway's plate: its face round the keys, the darker trim of its recesses, its bright edge (sampled from the set's sheets). */
const MECHA_COLOURS: Record<string, { face: string; trim: string; edge: string }> = {
  gunmetal: { face: '#2b2933', trim: '#1f1e27', edge: '#f2f5fd' },
  white: { face: '#e8e6ed', trim: '#c9c7d0', edge: '#6e6c79' },
  red: { face: '#2e2b36', trim: '#24212c', edge: '#d37781' },
  blue: { face: '#201e2b', trim: '#1a1825', edge: '#c3c3cf' },
};

/**
 * A module in the scratch lane's column (plane px), `aspect` deep for its width in its picture: as
 * wide as the column lets it be and as deep as that looks on the screen, no deeper than the room
 * under the deck's top edge; in the middle of that room when the column is narrower (it stands
 * beside the keys and what lies under them).
 */
function moduleBox(aspect: number): (room: number, stretch: number, lane: Pick<DeckLane, 'left' | 'width'>) => Box {
  return (room, stretch, lane) => {
    const top = 4;
    let w = Math.max(8, lane.width - 4);
    let h = w * aspect * stretch;
    const fit = Math.max(8, room - top - 4);
    if (h > fit) {
      h = fit;
      w = h / aspect / stretch;
    }
    return { x: lane.left + (lane.width - w) / 2, y: top + (fit - h) / 2, w, h };
  };
}

/** MECHA's turntable in the scratch lane's column (see moduleBox). */
export const mechaTurntable = moduleBox(GEAR.tt[1] / GEAR.tt[0]);

/** The scratch lit over its module (`aspect` deep for its width): a ring of light round its disc and a wash over it. */
function discLight(aspect: number, disc: Disc): Paint {
  return (g, w, h) => {
    const r = w * disc.r;
    const st = h / (w * aspect);
    g.save();
    g.translate(w * disc.x, h * disc.y);
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
  const turntable = discLight(GEAR.tt[1] / GEAR.tt[0], DISC);
  return {
    idle: (kind, st, mark) => (kind === 'scratch' ? () => undefined : cap(false, st, mark)),
    down: (kind, st, mark) => (kind === 'scratch' ? turntable : cap(true, st, mark)),
    reach: KEY_PAINT.arcade.reach,
    scratchBox: mechaTurntable,
  };
}

/**
 * The other sets' lights (keys.png: at rest, then lit): `light`, where the light at rest lies in its
 * cell (px: its left and top, its width and height); `disc`, where the scratch's module lights.
 * PIANO's keys fill the code grand piano's key (lightBox) and rest in ivory, lit in the lane colour.
 */
const SET_KEYS: Record<Exclude<ArtSet, 'mecha'>, { light: readonly [number, number, number, number]; disc: Disc; fill?: true }> = {
  club: { light: [48, 48, 160, 160], disc: { x: 0.5, y: 0.5, r: 0.47 } },
  crystal: { light: [60, 30, 135, 196], disc: { x: 0.5, y: 0.5, r: 0.44 } },
  neon: { light: [46, 36, 163, 184], disc: { x: 0.5, y: 0.5, r: 0.34 } },
  piano: { light: [31, 37, 194, 182], disc: { x: 0.5, y: 0.5, r: 0.45 }, fill: true },
};

/**
 * CLUB's, CRYSTAL's and NEON's lights: the light at rest reaches as far along the track as the code
 * gear's does (its reach: the row is laid out for that), as wide as its picture makes it within the
 * lane; lit, the same picture's lit light, its glow round it. The scratch is the plate's module.
 */
function setKeys(set: Exclude<ArtSet, 'mecha'>, deck: DeckStyle, keys: ArtImage, aspect: number): KeyPaint {
  const { light, disc, fill } = SET_KEYS[set];
  const [lx, ly, lw, lh] = light;
  const reach = KEY_PAINT[deck].reach;
  const lamp =
    (lit: boolean, kind: KeyKind, st: number): Paint =>
    (g, w, h) => {
      g.imageSmoothingQuality = 'high';
      if (fill) {
        // the light at rest on the code key's box, the cell (and a lit key's glow) round it in step
        const b = lightBox('grand', 0, 0, w, h);
        const [sx, sy] = [b.w / lw, b.h / lh];
        g.drawImage(keys, lit ? KEY_CELL : 0, 0, KEY_CELL, KEY_CELL, b.x - lx * sx, b.y - ly * sy, KEY_CELL * sx, KEY_CELL * sy);
        return;
      }
      const s = Math.min((2 * reach(kind, w, h, st)) / (lh * st), (0.94 * w) / lw);
      const [cw, ch] = [KEY_CELL * s, KEY_CELL * s * st];
      g.drawImage(keys, lit ? KEY_CELL : 0, 0, KEY_CELL, KEY_CELL, (w - cw) / 2, (h - ch) / 2, cw, ch);
    };
  const module = discLight(aspect, disc);
  return {
    idle: (kind, st) => (kind === 'scratch' ? () => undefined : lamp(false, kind, st)),
    down: (kind, st) => (kind === 'scratch' ? module : lamp(true, kind, st)),
    reach,
    scratchBox: moduleBox(aspect),
    // the piano's keys rest in ivory
    ...(fill && { idleColor: 0xf4ead8 }),
  };
}

/**
 * The other sets' gear_<colourway>.png: the scratch's module fitted into (0, 0, 512, 512) at its
 * proportions (`module`: its size as cut), CLUB's fader fitted into (512, 0, 256, 512), CRYSTAL's
 * and NEON's strip under the row at (0, 512), 1024 wide and `strip` deep; and the colours its plate is
 * painted in (sampled from the set's sheets).
 */
type ClubWay = { module: readonly [number, number]; fader: readonly [number, number]; face: string; edge: string; veneer?: true };
type CrystalWay = { module: readonly [number, number]; strip: number; glass: string; panel: string; edge: string };
type NeonWay = { module: readonly [number, number]; strip: number; face: string; edge: string };
type PianoWay = { module: readonly [number, number]; face: string; brass: string; felt: string; veneer?: true };
const CLUB_GEAR: Record<string, ClubWay> = {
  black: { module: [674, 674], fader: [150, 311], face: '#333136', edge: '#3f3e43' },
  white: { module: [678, 676], fader: [151, 313], face: '#e1dfe7', edge: '#eeebf6' },
  silver: { module: [696, 695], fader: [155, 321], face: '#afacb5', edge: '#d2d0d8' },
  // its strips walnut veneer (gear_walnut.png at (0, 512), 1024 × 512, the grain running down them)
  walnut: { module: [674, 674], fader: [150, 312], face: '#262429', edge: '#7d5b54', veneer: true },
};
const CRYSTAL_GEAR: Record<string, CrystalWay> = {
  silver: { module: [430, 430], strip: 99, glass: '#656873', panel: '#14131e', edge: '#aab3bf' },
  rosegold: { module: [430, 430], strip: 99, glass: '#967472', panel: '#2f1b1f', edge: '#f4b8a9' },
  gold: { module: [430, 430], strip: 99, glass: '#9f815c', panel: '#221911', edge: '#efce87' },
  smoke: { module: [430, 430], strip: 99, glass: '#37363d', panel: '#0e0c14', edge: '#565867' },
};
/** PIANO's: the dial fitted into (0, 0, 512, 512); its case's lacquer (the mahogany one's veneer at (0, 512), 1024 × 512, the grain running across), brass pinstripes and the felt under the keys. */
const PIANO_GEAR: Record<string, PianoWay> = {
  ebony: { module: [408, 408], face: '#0d0d0d', brass: '#e2c9a1', felt: '#510c19' },
  // its pinstripes are as thin as the sample is wide: the ebony one's brass
  white: { module: [410, 410], face: '#f2f1f2', brass: '#e2c9a1', felt: '#5b1122' },
  mahogany: { module: [408, 408], face: '#6c2616', brass: '#b39770', felt: '#580f22', veneer: true },
  emerald: { module: [410, 410], face: '#123f2b', brass: '#efd8ae', felt: '#581122' },
};
const NEON_GEAR: Record<string, NeonWay> = {
  black: { module: [578, 638], strip: 102, face: '#0a0a0b', edge: '#979da9' },
  carbon: { module: [729, 822], strip: 134, face: '#212123', edge: '#a0a1ad' },
  navy: { module: [580, 641], strip: 103, face: '#0b1129', edge: '#d1d1dc' },
  burgundy: { module: [577, 640], strip: 103, face: '#280b11', edge: '#e2c68b' },
};

/** Where a picture `size` fitted into a box `w` × `h` at (x, y) lies, at its proportions, in the box's middle (as build_styles.py fits it). */
function fitted(size: readonly [number, number], x: number, y: number, w: number, h: number): Box {
  const k = Math.min(w / size[0], h / size[1]);
  const [fw, fh] = [Math.max(1, Math.round(size[0] * k)), Math.max(1, Math.round(size[1] * k))];
  return { x: x + Math.floor((w - fw) / 2), y: y + Math.floor((h - fh) / 2), w: fw, h: fh };
}

/** A set's gear pictures for a style: its lights and its colourway's plate, when both loaded (the gear is drawn from art whole, or in code). */
function gearArt(style: Pick<SkinStyle, 'deck' | 'deckColour'>, images: StyleImages): { set: ArtSet; keys: ArtImage; gear: ArtImage; colour: string } | null {
  const set = setOf('deck', style.deck);
  const colour = deckColourOf(style);
  if (!set || !colour) return null;
  const keys = images[artId(set, 'keys')];
  const gear = images[gearId(set, colour)];
  return keys && gear ? { set, keys, gear, colour } : null;
}

/** How deep a set's module is for its width, in a colourway. */
function moduleAspect(set: Exclude<ArtSet, 'mecha'>, colour: string): number {
  const ways: Record<string, { module: readonly [number, number] }> = { club: CLUB_GEAR, crystal: CRYSTAL_GEAR, neon: NEON_GEAR, piano: PIANO_GEAR }[set];
  const [w, h] = (ways[colour] ?? Object.values(ways)[0]).module;
  return h / w;
}

/** The gear's lane lights: drawn from art where its pictures loaded. */
export function keyPaintOf(style: Pick<SkinStyle, 'deck' | 'deckColour'>, images: StyleImages): KeyPaint {
  const art = gearArt(style, images);
  if (!art) return KEY_PAINT[style.deck];
  return art.set === 'mecha' ? mechaKeys(art.keys) : setKeys(art.set, style.deck, art.keys, moduleAspect(art.set, art.colour));
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
    sideRecesses(g, s);
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

/** The side bars' recesses under the row, as the code gears have (the bars' lights are drawn over them), in the fill set. */
function sideRecesses(g: CanvasRenderingContext2D, s: DeckSpec): void {
  for (const b of s.sides) {
    g.beginPath();
    g.roundRect(b.left + b.width * 0.04, b.top, b.width * 0.92, b.depth, [{ x: b.depth * 0.3, y: b.depth * 0.3 }]);
    g.fill();
  }
}

/** The set's module in the scratch lane's column (see moduleBox), from its place in the colourway's picture. */
function drawModule(g: CanvasRenderingContext2D, gear: ArtImage, s: DeckSpec, size: readonly [number, number]): DeckLane | undefined {
  const scratch = s.lanes.find((l) => l.kind === 'scratch');
  if (scratch) {
    const b = moduleBox(size[1] / size[0])(s.room, s.stretch, scratch);
    const src = fitted(size, 0, 0, 512, 512);
    g.imageSmoothingQuality = 'high';
    g.drawImage(gear, src.x, src.y, src.w, src.h, b.x, b.y, b.w, b.h);
  }
  return scratch;
}

/** The frame round the plate: a fine line in its colour just under the judge line, its two ends `side` wide at the sides (with the grain of wood when `wood`). */
function frame(g: CanvasRenderingContext2D, s: DeckSpec, edge: string, side = 3, wood = false): void {
  g.fillStyle = shade(edge, 1, 0.7);
  g.fillRect(0, 0, s.width, 1.5);
  for (const [x, k] of [
    [0, 1],
    [s.width - side, 0.7],
  ] as [number, number][]) {
    g.fillStyle = shade(edge, k, 0.85);
    g.fillRect(x, 0, side, s.depth);
    if (!wood) continue;
    g.fillStyle = shade(edge, k * 0.62, 0.85);
    for (const at of [0.22, 0.5, 0.78]) g.fillRect(x + side * at, 0, 0.8, s.depth);
  }
}

/**
 * CLUB's plate, a DJ mixer in its colourway: a channel strip down each lane, grooves between them,
 * the turntable on its own panel in the scratch lane, under the row a fader in each key lane, the
 * frame at its sides (walnut wood on the walnut one).
 */
function clubPlate(gear: ArtImage, way: ClubWay, colour: string): (g: CanvasRenderingContext2D, s: DeckSpec) => void {
  const bright = colour === 'white' || colour === 'silver';
  return (g, s) => {
    g.fillStyle = shade(way.face, bright ? 0.8 : 0.45);
    g.fillRect(0, 0, s.width, s.depth);
    const rand = seeded(5);
    const grain = bright ? 'rgba(0,0,0,' : 'rgba(255,255,255,';
    if (way.veneer) {
      // the grooves between walnut strips: the wood's own dark
      g.fillStyle = shade(way.edge, 0.32);
      g.fillRect(0, 0, s.width, s.depth);
    }
    for (const l of s.lanes) {
      const [x, w] = [l.left + 1.25, l.width - 2.5];
      g.fillStyle = way.face;
      g.beginPath();
      g.roundRect(x, 3, w, s.depth, [{ x: 2.5, y: 2.5 * s.stretch }, { x: 2.5, y: 2.5 * s.stretch }, 0, 0]);
      g.fill();
      if (way.veneer) {
        // one sheet of veneer across the plate, each strip showing its own part of it
        g.save();
        g.clip();
        g.imageSmoothingQuality = 'high';
        g.drawImage(gear, 0, 512, 1024, 512, 0, 0, s.width, s.depth);
        g.restore();
      } else {
        // brushed down the strip
        for (let gx = x + 2; gx < x + w - 1; gx += 2) {
          g.fillStyle = `${grain}${(0.012 + rand() * 0.03).toFixed(3)})`;
          g.fillRect(gx, 4, 1, s.depth);
        }
      }
      // a lit edge along its top and down its left side
      g.fillStyle = bright ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.09)';
      g.fillRect(x + 2, 3, w - 4, 1);
      g.fillRect(x, 3 + 2.5 * s.stretch, 1, s.depth);
    }
    frame(g, s, way.edge, colour === 'walnut' ? 8 : 3, colour === 'walnut');
    g.fillStyle = way.veneer ? shade(way.edge, 0.3) : shade(way.face, bright ? 0.82 : 0.6);
    sideRecesses(g, s);
    const scratch = drawModule(g, gear, s, way.module);
    // a fader in each key lane under the row, as long on the screen as in the picture (shorter where the room is)
    const top = lowerTop(s) + 6;
    const bottom = s.room - 4;
    if (bottom - top < 16) return;
    const src = fitted(way.fader, 512, 0, 256, 512);
    for (const l of s.lanes) {
      if (l === scratch) continue;
      let fw = Math.min(l.width * 0.42, 34);
      let fh = (fw * src.h * s.stretch) / src.w;
      if (fh > bottom - top) {
        fh = bottom - top;
        fw = (fh * src.w) / src.h / s.stretch;
      }
      g.drawImage(gear, src.x, src.y, src.w, src.h, l.left + (l.width - fw) / 2, top, fw, fh);
    }
  };
}

/** Light sheens across CRYSTAL's glass, slanting down to the left: x and width as shares of the plate, and how bright. */
const SHEENS: readonly [number, number, number][] = [
  [0.08, 0.1, 0.07],
  [0.3, 0.05, 0.05],
  [0.55, 0.16, 0.045],
  [0.86, 0.06, 0.06],
];

/**
 * CRYSTAL's plate in its colourway: tinted glass behind the row with light sheens across it, the
 * dark board under it with the sheet's circuit traced across, the metal frame, the gem in its
 * ring in the scratch lane.
 */
function crystalPlate(gear: ArtImage, way: CrystalWay): (g: CanvasRenderingContext2D, s: DeckSpec) => void {
  return (g, s) => {
    g.fillStyle = way.panel;
    g.fillRect(0, 0, s.width, s.depth);
    const glass = lowerTop(s) + 2;
    g.fillStyle = shade(way.glass, 1, 0.62);
    g.fillRect(0, 0, s.width, glass);
    g.save();
    g.beginPath();
    g.rect(0, 0, s.width, glass);
    g.clip();
    const lean = glass * 0.6;
    for (const [x, w, a] of SHEENS) {
      g.beginPath();
      g.moveTo(x * s.width, 0);
      g.lineTo((x + w) * s.width, 0);
      g.lineTo((x + w) * s.width - lean, glass);
      g.lineTo(x * s.width - lean, glass);
      g.closePath();
      g.fillStyle = `rgba(255,255,255,${a})`;
      g.fill();
    }
    g.restore();
    g.fillStyle = shade(way.edge, 1, 0.4);
    g.fillRect(0, glass - 1, s.width, 1);
    frame(g, s, way.edge);
    g.fillStyle = shade(way.panel, 0.6);
    sideRecesses(g, s);
    const scratch = drawModule(g, gear, s, way.module);
    board(g, gear, s, scratch, way.strip, glass + 4);
  };
}

/** The set's circuit strip (gear_<colourway>.png at (0, 512), `strip` deep) across the plate under the row, room allowing, from the scratch's column (or the frame) to the frame. */
function board(g: CanvasRenderingContext2D, gear: ArtImage, s: DeckSpec, scratch: DeckLane | undefined, strip: number, top: number): void {
  const bottom = s.room - 4;
  if (bottom - top < 14) return;
  const x0 = scratch ? scratch.left + scratch.width + 2 : 5;
  g.imageSmoothingQuality = 'high';
  g.drawImage(gear, 0, 512, 1024, strip, x0, top, s.width - 5 - x0, bottom - top);
}

/**
 * NEON's plate in its colourway: the dark circuit board (carbon on the carbon one), the sheet's
 * traces across it under the row, the metal frame (gold on the burgundy one), the module of rings
 * in the scratch lane.
 */
function neonPlate(gear: ArtImage, way: NeonWay): (g: CanvasRenderingContext2D, s: DeckSpec) => void {
  return (g, s) => {
    g.fillStyle = way.face;
    g.fillRect(0, 0, s.width, s.depth);
    frame(g, s, way.edge);
    g.fillStyle = shade(way.face, 0.6);
    sideRecesses(g, s);
    const scratch = drawModule(g, gear, s, way.module);
    board(g, gear, s, scratch, way.strip, lowerTop(s) + 4);
  };
}

/**
 * PIANO's plate, a concert grand's keybed in its colourway: the case in mirror lacquer (or mahogany
 * veneer) with a crisp reflection across it, brass pinstripes under the judge line and over the
 * keys, a dark key bed under them and the red felt along their fronts with a pinstripe under it,
 * the brass dial in the scratch lane.
 */
function pianoPlate(gear: ArtImage, way: PianoWay): (g: CanvasRenderingContext2D, s: DeckSpec) => void {
  return (g, s) => {
    if (way.veneer) {
      g.imageSmoothingQuality = 'high';
      g.drawImage(gear, 0, 512, 1024, 512, 0, 0, s.width, s.depth);
    } else {
      g.fillStyle = way.face;
      g.fillRect(0, 0, s.width, s.depth);
    }
    // the lacquer's mirror: a soft band across the case under the keys, a crisp line along its top
    const under = lowerTop(s);
    const band = under + (s.room - under) * 0.4;
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(0, band, s.width, Math.max(4, (s.room - under) * 0.18));
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(0, band, s.width, 1);
    const scratch = s.lanes.find((l) => l.kind === 'scratch');
    const bed = scratch ? scratch.left + scratch.width : 0;
    g.fillStyle = shade(way.brass, 1, 0.85);
    g.fillRect(0, 0, s.width, 1.5);
    if (s.keyTop > 5) g.fillRect(bed, s.keyTop - 3, s.width - bed, 1);
    // the keys lie on a dark bed (the gaps between them), the felt along their fronts
    g.fillStyle = shade(way.felt, 0.25);
    g.fillRect(bed, s.keyTop, s.width - bed, s.keyDepth);
    const felt = Math.min(3 * s.stretch, Math.max(0, s.room - under));
    g.fillStyle = way.felt;
    g.fillRect(bed, under, s.width - bed, felt);
    g.fillStyle = shade(way.brass, 1, 0.7);
    if (s.room - under > felt + 4) g.fillRect(0, under + felt + 2, s.width, 1);
    frame(g, s, way.brass, 2);
    g.fillStyle = shade(way.felt, 0.25);
    sideRecesses(g, s);
    drawModule(g, gear, s, way.module);
  };
}

/** Which of a style's parts its loaded pictures draw: "notes", "long", "side", "gear:<colourway>". */
export function artPartsOf(style: SkinStyle, images: StyleImages): string[] {
  const parts: string[] = [];
  const set = setOf('note', style.note);
  if (set) {
    if (images[artId(set, 'notes')]) parts.push('notes');
    if (images[artId(set, 'long')]) parts.push('long');
    if (images[artId(set, 'side')] && style.side !== 'dots') parts.push('side');
  }
  const gear = gearArt(style, images);
  if (gear) parts.push(`gear:${gear.colour}`);
  return parts;
}

/** The gear's plate: drawn from art in its colourway where its pictures loaded. */
export function platePaintOf(style: Pick<SkinStyle, 'deck' | 'deckColour'>, images: StyleImages): (g: CanvasRenderingContext2D, s: DeckSpec) => void {
  const art = gearArt(style, images);
  if (!art) return (g, s) => paintDeck(style.deck, g, s);
  const { set, gear, colour } = art;
  if (set === 'mecha') return mechaPlate(gear, colour);
  if (set === 'club') return clubPlate(gear, CLUB_GEAR[colour] ?? CLUB_GEAR.black, colour);
  if (set === 'crystal') return crystalPlate(gear, CRYSTAL_GEAR[colour] ?? CRYSTAL_GEAR.silver);
  if (set === 'piano') return pianoPlate(gear, PIANO_GEAR[colour] ?? PIANO_GEAR.ebony);
  return neonPlate(gear, NEON_GEAR[colour] ?? NEON_GEAR.black);
}
