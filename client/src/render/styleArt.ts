import { codeBorderLook, gearBorderLook, isGear, paintDeck, type DeckSpec, type DeckStyle, type GearArt, type GearStyle, type SideLook } from './deckArt';
import type { SkinColors, SkinStyle, SkinTextures } from './skins';
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
 * What the styles draw from art (client/public/media/): pictures the note, long note, side note and
 * gear paints draw in place of their code drawings, and the flipbooks of the hit effects. They load
 * with the skin's textures (loadSkinArt); a part whose pictures are missing keeps its code drawing.
 *
 * The concept sets (media/styles/<set>/, made by scripts/assets/build_styles.py, whose layouts these
 * constants follow) are a note family with its long note and side notes, and a hit, each picked on
 * its own (설정 → 기어):
 *
 * - MECHA: the CHAMFER notes (machined plates) and their rail, the MECHA hit;
 * - CLUB: the ROUND notes (records) and their capsule, the CLUB hit (rings);
 * - CRYSTAL: the STAR4 notes (cut gems) and their prism, the CRYSTAL hit (shards);
 * - NEON: the STAR5 notes (neon stars) and their tube, the NEON hit (arcs);
 * - PIANO: the PIANO notes (key fronts) and their lacquered key, the PIANO hit (musical notes
 *   bursting out).
 *
 * The four gears (media/gears/<gear>/, made by scripts/assets/build_gears.py) are drawn by
 * deckArt.ts from their pictures by part (GEAR_PICTURES).
 */
export type ArtSet = 'mecha' | 'club' | 'crystal' | 'neon' | 'piano';

/** Each set's note family. */
const SET_NOTES: Record<ArtSet, NoteStyle> = { mecha: 'chamfer', club: 'round', crystal: 'star4', neon: 'star5', piano: 'piano' };
const SET_IDS = Object.keys(SET_NOTES) as ArtSet[];
const setOf = (note: string): ArtSet | undefined => SET_IDS.find((s) => SET_NOTES[s] === note);

/**
 * The hits drawn from flipbooks (client/public/media/styles/<set>/ and styles/hits/), by their name in
 * the manifest: the sets' and four of no set (FLASH, FLARE, BUBBLES, GRID). Each is drawn in code
 * while its flipbooks are missing (tintArt.ts: effectSheet).
 */
const HIT_ART: Readonly<Partial<Record<HitStyle, string>>> = {
  flash: 'flash',
  flare: 'flare',
  bubbles: 'bubbles',
  grid: 'grid',
  mecha: 'mecha',
  club: 'club',
  crystal: 'gem',
  neon: 'neon',
  piano: 'piano',
};
const hitArtOf = (hit: string): string | undefined => (Object.hasOwn(HIT_ART, hit) ? HIT_ART[hit as HitStyle] : undefined);

/** Whether a hit effect is drawn from flipbooks (in code while they are missing). */
export const isArtHit = (hit: string): boolean => hitArtOf(hit) !== undefined;

/** A decoded picture of the media (an ImageBitmap in the browser). */
export type ArtImage = CanvasImageSource & { readonly width: number; readonly height: number };
/** Loaded pictures by manifest id. */
export type StyleImages = Readonly<Partial<Record<string, ArtImage>>>;

/**
 * A set's name in the manifest, its pictures listed as "<name>/<part>": CRYSTAL's is "gem", as
 * "crystal" already names an earlier texture set (skins/crystal/, which user skins may ask for).
 */
const MANIFEST_NAME: Record<ArtSet, string> = { mecha: 'mecha', club: 'club', crystal: 'gem', neon: 'neon', piano: 'piano' };
const artId = (set: ArtSet, part: 'notes' | 'long' | 'side') => `${MANIFEST_NAME[set]}/${part}`;

/**
 * The four gears' pictures (manifest ids) by part: the materials of the plate and the frame, a key's
 * body seen from above, the scratch's module, NAJEON's lock plate. A part whose picture is missing is
 * drawn in code (deckArt.ts).
 */
const GEAR_PICTURES: Record<GearStyle, Readonly<Partial<Record<keyof GearArt, string>>>> = {
  standard: { frame: 'standard/graphite', key: 'standard/pad', scratch: 'standard/jog' },
  cabinet: { plate: 'cabinet/abs', key: 'cabinet/button', scratch: 'cabinet/turntable' },
  receiver: { plate: 'receiver/silver', frame: 'receiver/walnut', key: 'receiver/switch', scratch: 'receiver/knob' },
  najeon: { frame: 'najeon/band', key: 'najeon/tablet', scratch: 'najeon/lid', badge: 'najeon/lock' },
};

/** The pictures (manifest ids) a style's parts draw from. */
export function styleImageIds(style: SkinStyle): string[] {
  const ids: string[] = [];
  const notes = setOf(style.note);
  if (notes) ids.push(artId(notes, 'notes'), artId(notes, 'long'), ...(style.side === 'dots' ? [] : [artId(notes, 'side')]));
  if (isGear(style.deck)) ids.push(...Object.values(GEAR_PICTURES[style.deck]));
  return ids;
}

/** The flipbook textures a style's hit effect plays. */
export function styleTextures(style: SkinStyle): SkinTextures {
  const name = hitArtOf(style.hit);
  return name ? { hitBurst: `${name}/hitBurst`, hitHold: `${name}/hitHold` } : {};
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
  const set = setOf(style);
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
  const set = setOf(style);
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
  const set = setOf(style);
  const long = set && images[artId(set, 'long')];
  return set && long ? artLong(long, LONG_END[set], code.width) : code;
}

/**
 * A side tap laid over half the keys for the note style (see sideTap): the set's bar, its two long
 * edges glowing, the middle between them see-through, its ends keeping their look.
 */
export function sideTapPaintOf(style: NoteStyle, images: StyleImages, edge: number): Paint {
  const set = setOf(style);
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

/** The pictures of a gear that loaded, by part (none for a skin's LINE or STEM). */
export function gearArtOf(deck: DeckStyle, images: StyleImages): GearArt {
  if (!isGear(deck)) return {};
  const art: GearArt = {};
  for (const [part, id] of Object.entries(GEAR_PICTURES[deck]) as [keyof GearArt, string][]) {
    const picture = images[id];
    if (picture) art[part] = picture;
  }
  return art;
}

/** Which of a style's parts its loaded pictures draw: "notes", "long", "side", and "gear" when every picture of the gear loaded. */
export function artPartsOf(style: SkinStyle, images: StyleImages): string[] {
  const parts: string[] = [];
  const set = setOf(style.note);
  if (set) {
    if (images[artId(set, 'notes')]) parts.push('notes');
    if (images[artId(set, 'long')]) parts.push('long');
    if (images[artId(set, 'side')] && style.side !== 'dots') parts.push('side');
  }
  if (isGear(style.deck) && Object.keys(gearArtOf(style.deck, images)).length === Object.keys(GEAR_PICTURES[style.deck]).length) parts.push('gear');
  return parts;
}

/** The gear's plate: drawn from its pictures where they loaded. */
export function platePaintOf(style: Pick<SkinStyle, 'deck'>, images: StyleImages): (g: CanvasRenderingContext2D, s: DeckSpec) => void {
  const art = gearArtOf(style.deck, images);
  return (g, s) => paintDeck(style.deck, g, s, art);
}

/**
 * The gear's border, the two lines down the track's edges from its far end past the gear (where a
 * skin's rails were): a picked gear's own frame, from its pictures where they loaded; a skin's LINE or
 * STEM in the skin's plate colours (`colours`).
 */
export function borderLookOf(style: Pick<SkinStyle, 'deck'>, images: StyleImages, colours: SkinColors): SideLook {
  return isGear(style.deck) ? gearBorderLook(style.deck, gearArtOf(style.deck, images)) : codeBorderLook(style.deck, colours);
}
