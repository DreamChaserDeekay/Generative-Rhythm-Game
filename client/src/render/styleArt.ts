import { gearBorderLook, paintDeck, type DeckSpec, type GearArt, type GearPart, type GearStyle, type SideLook } from './deckArt';
import type { SkinStyle } from './skins';
import { context2d, paintCanvas } from './paintCanvas';
import {
  coinNote,
  LONG_OF,
  LONG_PAINT,
  isLogoNote,
  logoNote,
  NOTE_PAINT,
  shapedEnd,
  NOTE_STRETCH,
  type HitStyle,
  type LongPaint,
  type LedSprites,
  type LongStyle,
  type NoteMark,
  type NotePaint,
  type NoteStyle,
  type SideStyle,
  type Paint,
} from './tintArt';

/**
 * What the styles draw from art (client/public/media/): pictures the note, long note and gear paints draw
 * in place of their code drawings, and the flipbooks of the hit effects. They load with loadSkinArt
 * (render/skinArt.ts); a part whose pictures are missing keeps its code drawing.
 *
 * The concept sets (media/styles/<set>/, made by scripts/assets/build_styles.py) were a note family with
 * its long note and side notes, and a hit. Their notes are gone (the user's, 2026-11-17: the notes with no
 * gear of their own); what is left of them is their hits (MECHA, CLUB, CRYSTAL, NEON, PIANO, each picked on
 * its own, 설정 → 기어 → 타격 효과) and CLUB's record and capsule, which the AI companies' marks play as
 * their long note (COIN).
 *
 * The gears a player picks (media/gears/<gear>/, made by scripts/assets/build_gears.py) are drawn by
 * deckArt.ts from their pictures by part (GEAR_PICTURES).
 */
/** The coin's pictures in the manifest (CLUB's record and its capsule): the long note of the AI companies' marks. */
const COIN = { notes: 'club/notes', long: 'club/long' } as const;

/**
 * The hits drawn from flipbooks, by their name in the manifest: the sets' and three of no set (FLARE,
 * BUBBLES, GRID: client/public/media/styles/<set>/ and styles/hits/), and the skins' (client/public/media/fx/:
 * each a frame-by-frame animation made with the image model, scripts/assets/build_skin_fx.py; the default
 * skin's FLASH is "basic" there, "flash" being an older sheet nothing plays). Each is drawn in code while its
 * flipbooks are missing (tintArt.ts: effectSheet).
 */
const HIT_ART: Readonly<Partial<Record<HitStyle, string>>> = {
  flash: 'basic',
  prism: 'prism',
  sky: 'sky',
  fire: 'fire',
  gpt: 'gpt',
  gemini: 'gemini',
  grok: 'grok',
  claude: 'claude',
  aqua: 'aqua',
  steel: 'steel',
  noir: 'noir',
  wire: 'wire',
  astral: 'astral',
  flare: 'flare',
  bubbles: 'bubbles',
  grid: 'grid',
  mecha: 'mecha',
  club: 'club',
  crystal: 'crystal',
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
 * The gears' pictures (manifest ids) by part: the whole deck painted in the camera's perspective (on
 * the perspective cameras) and the things on the deck (the deck drawn in code: the plane camera's,
 * or where the deck's picture is missing). A part whose picture is missing is drawn in code
 * (deckArt.ts).
 */
const GEAR_PICTURES: Record<GearStyle, Readonly<Partial<Record<GearPart, string>>>> = {
  // the skins' gears: the row of keys drawn in code (it follows the lanes), the lower part a painting (panel: the
  // readouts are written on its display), in code where the painting is missing
  prism: { panel: 'prism/panel' },
  // (the sky skin's deck in code lays an older painting of its sky and a feather over its score)
  sky: { panel: 'sky/panel', plate: 'sky/plate', feather: 'sky/feather' },
  // (its key caps carry the four members' crests in their order, one strip of four cells)
  fire: { panel: 'fire/panel', crests: 'fire/crests' },
  gpt: { panel: 'gpt/panel' },
  gemini: { panel: 'gemini/panel' },
  grok: { panel: 'grok/panel' },
  claude: { panel: 'claude/panel' },
  aqua: { panel: 'aqua/panel' },
  steel: { panel: 'steel/panel' },
  noir: { panel: 'noir/panel' },
  wire: { panel: 'wire/panel' },
  astral: { panel: 'astral/panel' },
  // the default skin's gear, as the skins': its key caps light with the lanes and its panel's display houses the HUD's readouts
  standard: { panel: 'standard/panel' },
  piano: { deck: 'piano/deck', medallion: 'piano/medallion' },
};

/** The pictures (manifest ids) a style's parts draw from. */
export function styleImageIds(style: SkinStyle): string[] {
  const ids: string[] = [];
  // the AI companies' marks play the coin's long note: its pictures (the record for its ends); their inside a material
  if (isLogoNote(style.note)) ids.push(COIN.notes, COIN.long, ...(ART_MATERIALS.includes(style.note) ? [`notes/${style.note}`] : []));
  else {
    // a code note and long note drawn again with the image model
    if (ART_NOTES.includes(style.note)) ids.push(`notes/${style.note}`);
    if (ART_LONGS[LONG_OF[style.note]] !== undefined) ids.push(`longs/${LONG_OF[style.note]}`);
  }
  if (ART_SIDES.includes(style.side)) ids.push(`side/${style.side}`);
  ids.push(...Object.values(GEAR_PICTURES[style.deck]));
  return ids;
}

/** The two flipbooks of a hit drawn from art: the burst a hit plays once, and the light a held long note plays over and over. */
export type HitSlot = 'hitBurst' | 'hitHold';
export const HIT_SLOTS: readonly HitSlot[] = ['hitBurst', 'hitHold'];
/** Manifest texture id per flipbook. */
export type HitTextures = Partial<Record<HitSlot, string>>;

/** The flipbook textures a style's hit effect plays. */
export function styleTextures(style: SkinStyle): HitTextures {
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

/** A note's picture cut in five across the lane: `w` × `h` at y = row × `row` + `top`; `cuts`: where its end caps and its middle start and end (x). */
type SlabLayout = { row: number; top: number; w: number; h: number; cuts: readonly [number, number, number, number] };

/** Row `row` of a slab layout drawn w × h: its ends and its middle keep their look, what lies between stretches to the lane. */
function slabRow(g: CanvasRenderingContext2D, notes: ArtImage, layout: SlabLayout, row: number, w: number, h: number): void {
  const [c0, c1, c2, c3] = layout.cuts;
  const k = h / layout.h / NOTE_STRETCH;
  // a narrow lane: ends and mark narrower, so what lies between keeps some length
  const fit = Math.min(1, (w * 0.7) / ((c0 + c2 - c1 + layout.w - c3) * k));
  const [cap, mid] = [c0 * k * fit, (c2 - c1) * k * fit];
  const half = (w - 2 * cap - mid) / 2;
  g.imageSmoothingQuality = 'high';
  slices(g, notes, row * layout.row + layout.top, layout.h, [0, c0, c1, c2, c3, layout.w], [0, cap, cap + half, cap + half + mid, w - cap, w], h);
}

/** Where each key's coin lies in the coin's notes.png: a cell of 512 per mark, two to a row, the coin at (6, 6) in it, 500 × 500. */
const COIN_MARK: Record<Exclude<NoteMark, 'side'>, number> = { white: 0, blue: 1, gold: 2, scratch: 3 };
const COIN_CELL = { left: 6, top: 6, w: 500, h: 500 } as const;

/** The coin: a record, round, its lane's mark printed on its label; in code (coinNote) where its picture is missing, and on a side lane. */
function coinTapOf(images: StyleImages): NotePaint {
  const notes = images[COIN.notes];
  if (!notes) return coinNote;
  return (g, w, h, mark) => {
    if (mark === 'side') {
      coinNote(g, w, h, mark);
      return;
    }
    const i = COIN_MARK[mark];
    g.imageSmoothingQuality = 'high';
    g.drawImage(notes, (i % 2) * 512 + COIN_CELL.left, Math.floor(i / 2) * 512 + COIN_CELL.top, COIN_CELL.w, COIN_CELL.h, 0, 0, w, h);
  };
}

/** How much of its lane a note spans. */
export const NOTE_WIDTH = 0.9;

/** The note style's paint: drawn from art where its pictures loaded. */
export function notePaintOf(style: NoteStyle, images: StyleImages): NotePaint {
  const drawn = ART_NOTES.includes(style) || ART_MATERIALS.includes(style) ? images[`notes/${style}`] : undefined;
  // an AI company's mark: its outline the build's picture, its inside the material drawn for it
  if (drawn && isLogoNote(style)) return logoNote(style, drawn);
  return drawn ? artTap(drawn, NOTE_PAINT[style]) : NOTE_PAINT[style];
}

// ---------- long notes ----------

/**
 * A long note's picture: the body (a tile that repeats along it) at (0, 0) and held at (w, 0); its end at
 * (2w, 0) and held at (3w, 0), `end` deep (the coin's capsule ends round: COIN_END).
 */
const LONG = { w: 128, tile: 256 } as const;
const COIN_END = 78;

function artLong(image: ArtImage, end: number, width: number, tile = LONG.tile / LONG.w): LongPaint {
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
    tile: tile * NOTE_STRETCH,
    endDepth: (end / LONG.w) * NOTE_STRETCH,
    width,
    px: LONG.w,
  };
}

/** The long note of a note style (LONG_OF): drawn from art where its pictures loaded. */
export function longPaintOf(style: NoteStyle, images: StyleImages): LongPaint {
  // the AI companies' marks play the coin's long note (its ends the record's)
  if (isLogoNote(style)) return coinLong(images);
  // a code long note drawn again with the image model, where its picture loaded
  return artLongOf(LONG_OF[style], images) ?? LONG_PAINT[LONG_OF[style]];
}

/** The coin's long note: the capsule, from art where its picture loaded, its ends cut in the coin's outline. */
function coinLong(images: StyleImages): LongPaint {
  const code = LONG_PAINT.capsule;
  const long = images[COIN.long];
  return withTapEnds(coinTapOf(images), long ? artLong(long, COIN_END, code.width) : code);
}

/**
 * The long notes that were drawn in code, drawn again with the image model (scripts/assets/make_long_notes.py and
 * build_long_notes.py: media/longs/<long>.png, "longs/<long>" in the manifest, the layout of the sets' long.png),
 * each with its end's depth in that picture (px of 128 across: build_long_notes.py's end_px) and how many body
 * widths its body's tile is (one mark spaced down it, or a width of its plain middle: build_long_notes.py prints it). The code
 * draws a long note left out of this list, or whose picture did not load: take a name out to have its code drawing back.
 */
export const ART_LONGS: Partial<Record<LongStyle, { end: number; tile: number }>> = {
  solid: { end: 44, tile: 1 },
  prism: { end: 102, tile: 1 },
  sky: { end: 44, tile: 1 },
  fire: { end: 44, tile: 1 },
  aqua: { end: 44, tile: 1.5333 },
  steel: { end: 44, tile: 1.3667 },
  noir: { end: 44, tile: 0.7667 },
  wire: { end: 44, tile: 1 },
  astral: { end: 44, tile: 1 },
};

/** A long note drawn from its picture (ART_LONGS), as wide as its code's; undefined where it has none loaded. */
function artLongOf(long: LongStyle, images: StyleImages): LongPaint | undefined {
  const art = ART_LONGS[long];
  const picture = art && images[`longs/${long}`];
  return art && picture ? artLong(picture, art.end, LONG_PAINT[long].width, art.tile) : undefined;
}

/**
 * The bars that were drawn in code, drawn again with the image model with their long notes (make_long_notes.py,
 * build_long_notes.py: media/notes/<note>.png, "notes/<note>"): the key lanes' tap in the first row (every key's
 * colour and a side lane's own), the scratch's in the second, each ART_NOTE's size. Take a name out to have its code
 * drawing back; a picture that did not load is drawn in code too.
 */
export const ART_NOTES: readonly NoteStyle[] = ['flat', 'prism', 'sky', 'fire', 'aqua', 'steel', 'noir', 'wire', 'astral'];
/** The AI companies' marks whose inside is drawn from a material made with the image model (media/notes/<logo>.png, 512 × 512). */
export const ART_MATERIALS: readonly NoteStyle[] = ['gpt', 'gemini', 'grok', 'claude'];
/** media/notes/<note>.png's rows: 1024 × 224 a tap, its ends and its middle (the scratch's mark) kept as drawn. */
const ART_NOTE: SlabLayout = { row: 256, top: 16, w: 1024, h: 224, cuts: [212, 332, 692, 812] };

/**
 * The side notes laid over half the keys drawn again with the image model (scripts/assets/make_side_notes.py and
 * build_side_notes.py): 'bar' its tap, its long note's body and its end band (media/side/bar.png), 'dots' an LED dot
 * lit and dim (media/side/dots.png; the code lays them out in rows, as many as the key lanes take). Take a name out
 * to have its code drawing back; a picture that did not load is drawn in code too. The flash of their hits is code's.
 */
export const ART_SIDES: readonly SideStyle[] = ['bar', 'dots'];
/** media/side/bar.png's parts: (y, rows) in its 1024 × 512 (build_side_notes.py). */
const SIDE_ART = { tap: [0, 176], body: [192, 128], end: [336, 64] } as const;

/** The bar laid over the keys from its picture: its tap, its long note's body and end, each its part of the picture stretched over w × h. */
export function sideBarArtOf(images: StyleImages): Record<'tap' | 'body' | 'end', Paint> | undefined {
  const image = ART_SIDES.includes('bar') ? images['side/bar'] : undefined;
  if (!image) return undefined;
  const part =
    ([y, rows]: readonly [number, number]): Paint =>
    (g, w, h) => {
      g.imageSmoothingQuality = 'high';
      g.drawImage(image, 0, y, 1024, rows, 0, 0, w, h);
    };
  return { tap: part(SIDE_ART.tap), body: part(SIDE_ART.body), end: part(SIDE_ART.end) };
}

/** The LED dots from their picture (media/side/dots.png: lit and dim, 128 square, the lens 48 from the middle). */
export function ledSpritesOf(images: StyleImages): LedSprites | undefined {
  const image = ART_SIDES.includes('dots') ? images['side/dots'] : undefined;
  return image ? { image, size: 128, lens: 48 / 64 } : undefined;
}

/** A bar drawn from its picture (ART_NOTES): a key's (and a side lane's) from its first row, the scratch's from its second. */
function artTap(image: ArtImage, code: NotePaint): NotePaint {
  return (g, w, h, mark) => {
    if (!image) return code(g, w, h, mark);
    g.imageSmoothingQuality = 'high';
    slabRow(g, image, ART_NOTE, mark === 'scratch' ? 1 : 0, w, h);
  };
}

/**
 * The rows of `tap`, drawn `aspect` times deeper than wide, from its far edge, that are as wide as the body
 * (`share` of it), or as its widest where none is, and the middle of the first band of them: there the end
 * meets the body, with no square shoulder of the body beside the shape and nothing of the shape cut through
 * along its length (`row`, as a share of the tap's depth); and how wide the tap is at its widest
 * (`across`, of its picture's width). Null where there is no canvas to draw it on.
 */
function bodyRow(tap: NotePaint, aspect: number, share: number): { row: number; across: number } | null {
  if (typeof OffscreenCanvas !== 'function' && typeof document === 'undefined') return null;
  const canvas = paintCanvas();
  canvas.width = 96;
  canvas.height = Math.max(16, Math.round(96 * aspect));
  const g = context2d(canvas);
  tap(g, canvas.width, canvas.height, 'white');
  const data = g.getImageData(0, 0, canvas.width, canvas.height).data;
  const widths: number[] = [];
  for (let y = 0; y < canvas.height; y++) {
    let [first, last] = [-1, -1];
    for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] > 40) {
        if (first < 0) first = x;
        last = x;
      }
    }
    widths.push(first < 0 ? 0 : last - first + 1);
  }
  const widest = Math.max(...widths);
  const target = Math.min(widest, share * canvas.width * 0.97);
  // the middle of the band of rows that wide: the coin's middle
  const first = widths.findIndex((wd) => wd >= target);
  if (first < 0) return null;
  let last = first;
  while (last + 1 < widths.length && widths[last + 1] >= target) last++;
  return { row: Math.min(0.6, Math.max(0.15, (first + last + 1) / 2 / canvas.height)), across: widest / canvas.width };
}

/**
 * `long` with its ends cut in the outline of `tap`, the coin (shapedEnd): each end the outer half of the tap as
 * it is drawn (from art where its picture loaded), as wide as the tap and as deep as its part beyond its
 * widest row looks at the judge line, the body running on into it inside its outline.
 */
function withTapEnds(tap: NotePaint, long: LongPaint): LongPaint {
  // the coin is round at the judge line, and as wide as any note
  const shape = 1;
  const measured = bodyRow(tap, NOTE_STRETCH * shape, long.width / NOTE_WIDTH);
  // the body no wider than the tap at its widest
  const width = measured ? Math.min(long.width, NOTE_WIDTH * measured.across) : long.width;
  const endWidth = NOTE_WIDTH / width;
  const share = 1 / endWidth;
  const plain = long.plain ?? { idle: long.body, held: long.held?.body ?? long.body };
  const widest = (measured && width < long.width ? bodyRow(tap, NOTE_STRETCH * shape, share)?.row : measured?.row) ?? 0.5;
  return {
    ...long,
    end: shapedEnd(tap, plain.idle, share, widest),
    held: { body: long.held?.body ?? long.body, end: shapedEnd(tap, plain.held, share, widest) },
    endDepth: widest * NOTE_STRETCH * shape * endWidth,
    endWidth,
    width,
  };
}

// ---------- the gears ----------

/** The pictures of a gear that loaded, by part. */
export function gearArtOf(deck: GearStyle, images: StyleImages): GearArt {
  const art: GearArt = {};
  for (const [part, id] of Object.entries(GEAR_PICTURES[deck]) as [GearPart, string][]) {
    const picture = images[id];
    if (picture) art[part] = picture;
  }
  return art;
}

/** Which of a style's parts its loaded pictures draw: "notes", "long", and "gear" when every picture of the gear loaded. */
export function artPartsOf(style: SkinStyle, images: StyleImages): string[] {
  const parts: string[] = [];
  if ((ART_NOTES.includes(style.note) || ART_MATERIALS.includes(style.note)) && images[`notes/${style.note}`]) parts.push('notes');
  if (isLogoNote(style.note) ? images[COIN.long] : images[`longs/${LONG_OF[style.note]}`]) parts.push('long');
  if (Object.keys(gearArtOf(style.deck, images)).length === Object.keys(GEAR_PICTURES[style.deck]).length) parts.push('gear');
  return parts;
}

/** The gear's plate: drawn from its pictures where they loaded. */
export function platePaintOf(style: Pick<SkinStyle, 'deck'>, images: StyleImages): (g: CanvasRenderingContext2D, s: DeckSpec) => void {
  const art = gearArtOf(style.deck, images);
  return (g, s) => paintDeck(style.deck, g, s, art);
}

/** The gear's border, the two lines down the track's edges from its far end past the gear: its frame, from its pictures where they loaded. */
export function borderLookOf(style: Pick<SkinStyle, 'deck'>, images: StyleImages): SideLook {
  return gearBorderLook(style.deck, gearArtOf(style.deck, images));
}
