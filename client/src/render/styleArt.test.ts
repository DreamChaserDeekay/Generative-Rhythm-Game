import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deckReadouts, GEAR_STYLES, gearBorderLook, type DeckSpec, type GearStyle } from './deckArt';
import { parseManifest } from './skinArt';
import { BASE_SKIN, withParts, type SkinStyle } from './skins';
import {
  artPartsOf,
  borderLookOf,
  gearArtOf,
  isArtHit,
  longPaintOf,
  notePaintOf,
  noteShapeOf,
  noteWidthOf,
  platePaintOf,
  sideTapPaintOf,
  styleImageIds,
  styleTextures,
  type ArtImage,
} from './styleArt';
import { HIT_STYLES, LONG_OF, LONG_PAINT, NOTE_PAINT, NOTE_STRETCH, noteDepthOf, type HitStyle } from './tintArt';

const MEDIA = fileURLToPath(new URL('../../public/media/', import.meta.url));
const manifest = parseManifest(JSON.parse(readFileSync(join(MEDIA, 'manifest.json'), 'utf-8')))!;
// the mecha set's notes and hit on the arcade cabinet, as the gear tab picks them
const arcade = withParts(BASE_SKIN, { note: 'chamfer', side: 'bar', deck: 'cabinet', hit: 'mecha' }).style;

/** A picture of the size the manifest gives (drawing on a recording canvas needs nothing more), its id kept to tell it by. */
const image = (id: string): ArtImage => {
  const [width, height] = manifest.textures[id].size;
  return { width, height, id } as unknown as ArtImage;
};
const loaded = (style: SkinStyle) => Object.fromEntries(styleImageIds(style).map((id) => [id, image(id)]));

/**
 * A 2D context that records its drawImage calls (source x, y, width, height; destination x, y, width,
 * height; a call with a destination only records it as both) and the picture drawn, with the box it
 * lands in on the canvas (x, y, w, h: through the moves, scales and quarter turns made before it), and
 * its fillRect calls (as given).
 */
function recorder() {
  const draws: { id: string; sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number; x: number; y: number; w: number; h: number }[] = [];
  const fills: { x: number; y: number; w: number; h: number }[] = [];
  // the transform, as setTransform takes it, and the ones saved
  let [a, b, c, d, e, f] = [1, 0, 0, 1, 0, 0];
  const saved: number[][] = [];
  const at = (x: number, y: number) => [a * x + c * y + e, b * x + d * y + f];
  const g = new Proxy(
    {
      drawImage: (pic: { id?: string }, ...v: number[]) => {
        const [sx, sy, sw, sh, dx, dy, dw, dh] = v.length === 8 ? v : [0, 0, 0, 0, v[0], v[1], v[2], v[3]];
        const [[x0, y0], [x1, y1]] = [at(dx, dy), at(dx + dw, dy + dh)];
        draws.push({ id: pic?.id ?? '', sx, sy, sw, sh, dx, dy, dw, dh, x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
      },
      fillRect: (x: number, y: number, w: number, h: number) => fills.push({ x, y, w, h }),
      save: () => saved.push([a, b, c, d, e, f]),
      restore: () => ([a, b, c, d, e, f] = saved.pop() ?? [a, b, c, d, e, f]),
      translate: (x: number, y: number) => ([e, f] = at(x, y)),
      scale: (x: number, y: number) => ([a, b, c, d] = [a * x, b * x, c * y, d * y]),
      rotate: (r: number) => {
        const [cos, sin] = [Math.cos(r), Math.sin(r)];
        [a, b, c, d] = [a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin];
      },
    } as Record<string | symbol, unknown>,
    // everything else a paint does (paths, fills, gradients) does nothing here
    { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop: () => undefined })), set: () => true },
  ) as unknown as CanvasRenderingContext2D;
  return { g, draws, fills };
}

describe('the concept sets drawn from art', () => {
  it('keeps no gear of the sets in the media: the gears are ones of their own', () => {
    expect(Object.keys(manifest.textures).filter((id) => /\/(gear|keys)$/.test(id))).toEqual([]);
    expect(Object.values(manifest.textures).filter((t) => t.file.startsWith('styles/') && /\/(gear|keys)\.png$/.test(t.file))).toEqual([]);
  });

  it('loads the pictures and flipbooks of the parts a style has, and only those', () => {
    const cabinet = ['cabinet/deck', 'cabinet/abs', 'cabinet/joystick', 'cabinet/button', 'cabinet/coin'];
    expect(styleImageIds(arcade)).toEqual(['mecha/notes', 'mecha/long', 'mecha/side', ...cabinet]);
    expect(styleImageIds({ ...arcade, side: 'dots' })).toEqual(['mecha/notes', 'mecha/long', ...cabinet]);
    expect(styleImageIds({ ...arcade, note: 'flat' })).toEqual(cabinet);
    // the track as it starts: the default skin, its parts drawn in code (as the PRISM set's are) and its hit a flipbook
    expect(styleImageIds(BASE_SKIN.style)).toEqual([]);
    expect(styleImageIds({ note: 'prism', side: 'bar', deck: 'prism', hit: 'prism' })).toEqual([]);
    // the sky skin's too, but for two pictures: the painting of its deck's sky and the feather over its score
    expect(styleImageIds({ note: 'sky', side: 'bar', deck: 'sky', hit: 'sky' })).toEqual(['sky/plate', 'sky/feather']);
    // the Firestarter skin's parts are drawn in code too (the figures at its sides come with the build)
    expect(styleImageIds({ note: 'fire', side: 'bar', deck: 'fire', hit: 'fire' })).toEqual([]);
    expect(styleTextures(arcade)).toEqual({ hitBurst: 'mecha/hitBurst', hitHold: 'mecha/hitHold' });
    // three hits of no set have flipbooks of their own, as the sets' hits do; the default skin's FLASH plays "basic"
    expect(styleTextures(BASE_SKIN.style)).toEqual({ hitBurst: 'basic/hitBurst', hitHold: 'basic/hitHold' });
    for (const hit of ['flare', 'bubbles', 'grid', 'crystal'] as const) expect(styleTextures({ ...arcade, hit })).toEqual({ hitBurst: `${hit}/hitBurst`, hitHold: `${hit}/hitHold` });
  });

  it('has every picture and flipbook in the media, at the size its layout is drawn from', () => {
    const sizes: Record<string, [number, number]> = {
      'mecha/notes': [1024, 1024],
      'mecha/long': [512, 256],
      'mecha/side': [1024, 512],
    };
    for (const [id, size] of Object.entries(sizes)) expect(manifest.textures[id]?.size, id).toEqual(size);
    for (const style of [BASE_SKIN.style, arcade]) {
      for (const id of [...styleImageIds(style), ...Object.values(styleTextures(style))]) expect(manifest.textures[id], id).toBeDefined();
    }
    // the flipbooks spread every way from the judge line, whole, with room round them in their frames
    for (const id of ['mecha/hitBurst', 'mecha/hitHold']) {
      expect(manifest.textures[id].flipbook, id).toMatchObject({ cols: 4, rows: 4, frames: 16 });
      expect(manifest.textures[id].anchorY, id).toBe(0.5);
      expect(manifest.textures[id].span, id).toBeGreaterThan(1);
    }
    expect(manifest.textures['mecha/hitHold'].flipbook?.loop).toBe(true);
  });

  it('keeps every part in code while its pictures are missing', () => {
    const none = {};
    expect(notePaintOf('chamfer', none)).toBe(NOTE_PAINT.chamfer);
    expect(longPaintOf('chamfer', none)).toBe(LONG_PAINT.rail);
    expect(artPartsOf(arcade, none)).toEqual([]);
    expect(gearArtOf('cabinet', none)).toEqual({});
    // the gear counts as drawn from art once all of its pictures are: a part without one is drawn in code
    expect(artPartsOf(arcade, { 'cabinet/button': image('cabinet/button') })).toEqual([]);
    expect(gearArtOf('cabinet', { 'cabinet/button': image('cabinet/button') })).toEqual({ button: image('cabinet/button') });
    expect(artPartsOf(arcade, loaded(arcade))).toEqual(['notes', 'long', 'side', 'gear']);
  });

  it('cuts a note into its end caps, its mark and the metal between, meeting at whole px across the picture', () => {
    const paint = notePaintOf('chamfer', loaded(arcade));
    for (const [w, h] of [
      [384, 96],
      [180, 96],
      [512, 96],
    ]) {
      const { g, draws } = recorder();
      paint(g, w, h, 'gold');
      expect(draws).toHaveLength(5);
      // the gold key's row, all of the note's height
      for (const d of draws) expect([d.sy, d.sh, d.dy, d.dh]).toEqual([2 * 256 + 23, 210, 0, h]);
      expect(draws[0].dx).toBe(0);
      expect(draws[4].dx + draws[4].dw).toBe(w);
      for (let i = 1; i < 5; i++) expect(draws[i].dx).toBe(draws[i - 1].dx + draws[i - 1].dw);
      for (const d of draws) expect(Number.isInteger(d.dx) && Number.isInteger(d.dw)).toBe(true);
      // the caps alike; on the screen (NOTE_STRETCH flatter) as the picture draws them, in a wide enough lane
      expect(Math.abs(draws[0].dw - draws[4].dw)).toBeLessThanOrEqual(1);
      if (w >= 384) expect(draws[0].dw).toBeCloseTo((156 * h) / 210 / NOTE_STRETCH, -0.5);
    }
    // the side lane's own note is the grille plate, its slots repeated
    const { g, draws } = recorder();
    paint(g, 400, 96, 'side');
    expect(draws.every((d) => d.sy === 240 && d.sh === 265)).toBe(true);
    expect(draws.length).toBeGreaterThan(3);
    expect(draws[draws.length - 1].dx + draws[draws.length - 1].dw).toBe(400);
  });

  it('draws the rail and its held light from art, as long on the screen as in the picture', () => {
    const long = longPaintOf('chamfer', loaded(arcade));
    expect(long.held).toBeDefined();
    expect(long.px).toBe(128);
    expect(long.tile).toBeCloseTo(2 * NOTE_STRETCH, 9);
    expect(long.endDepth).toBeCloseTo((48 / 128) * NOTE_STRETCH, 9);
    const { g, draws } = recorder();
    long.held!.body(g, 128, 435);
    expect(draws[0]).toMatchObject({ sx: 128, sy: 0, sw: 128, sh: 256, dw: 128, dh: 435 });
  });

  it('lays the bar over the keys with its end blocks whole and its grille stretched', () => {
    const { g, draws } = recorder();
    sideTapPaintOf('chamfer', loaded(arcade), 0.3)(g, 512, 90);
    expect(draws).toHaveLength(3);
    expect(draws[0].dw).toBe(draws[2].dw);
    expect(draws[2].dx + draws[2].dw).toBe(512);
  });
});

/** CLUB, CRYSTAL and NEON: their note family and hit (PIANO's notes are gone, its hit is the hits' above). */
const SETS = [
  { set: 'club', id: 'club', note: 'round', hit: 'club', end: 78, bar: 211 },
  { set: 'crystal', id: 'crystal', note: 'star4', hit: 'crystal', end: 70, bar: 206 },
  { set: 'neon', id: 'neon', note: 'star5', hit: 'neon', end: 59, bar: 248 },
] as const;
type SetCase = (typeof SETS)[number];
/** The set's parts as the gear tab picks them, on the standard gear. */
// on the default gear, which has no pictures (it is drawn in code)
const setStyle = (c: SetCase) => withParts(BASE_SKIN, { note: c.note, side: 'bar', deck: 'standard', hit: c.hit }).style;
const STANDARD: string[] = [];

/** A deck as the renderer paints it: the whole track's width (8 track units of 73.65 px), a scratch and seven keys. */
function deckSpec(room: number, stretch = 1.3): DeckSpec {
  const width = 8 * 73.65;
  const lane = (width - 68.5) / 7;
  return {
    width,
    room,
    depth: room + 40,
    stretch,
    lanes: [
      { left: 0, width: 68.5, kind: 'scratch' },
      ...Array.from({ length: 7 }, (_, i) => ({ left: 68.5 + i * lane, width: lane, kind: i % 2 ? ('other' as const) : ('white' as const) })),
    ],
    sides: [],
  };
}

describe('the hits drawn from art', () => {
  it('plays every hit a player picks from flipbooks in the media: once on a hit, looping while held, whole about the judge line', () => {
    expect(HIT_STYLES).toEqual(['flash', 'prism', 'sky', 'fire', 'gpt', 'gemini', 'grok', 'claude', 'aqua', 'steel', 'rainbow', 'noir', 'magenta', 'wire', 'astral', 'flare', 'bubbles', 'grid', 'mecha', 'club', 'crystal', 'neon', 'piano']);
    for (const hit of HIT_STYLES) expect(isArtHit(hit), hit).toBe(true);
    // the skins' hits are animations drawn frame by frame (scripts/assets/build_skin_fx.py): light in colours of their
    // own, added as it is; the default skin's FLASH is white light the lane colours ("basic": "flash" is an older sheet
    // nothing plays)
    const skins: readonly HitStyle[] = ['prism', 'sky', 'fire', 'gpt', 'gemini', 'grok', 'claude', 'aqua', 'steel', 'rainbow', 'noir', 'magenta', 'wire', 'astral', 'flash'];
    for (const hit of skins) {
      const name = hit === 'flash' ? 'basic' : hit;
      const { hitBurst, hitHold } = styleTextures({ ...arcade, hit });
      expect([hitBurst, hitHold], hit).toEqual([`${name}/hitBurst`, `${name}/hitHold`]);
      const [burst, hold] = [manifest.textures[hitBurst!], manifest.textures[hitHold!]];
      expect([burst.file, hold.file], hit).toEqual([`fx/${name}_burst.webp`, `fx/${name}_hold.webp`]);
      expect([burst.plain === true, hold.plain === true], hit).toEqual(hit === 'flash' ? [false, false] : [true, true]);
      // a hit is over in a third of a second (the user's rule: under 0.4 s), its frames the animation's own
      const book = burst.flipbook!;
      expect([book.cols, book.rows, book.loop], hit).toEqual([4, 4, false]);
      expect(book.frames, hit).toBeGreaterThanOrEqual(8);
      expect(book.frames / book.fps, hit).toBeLessThan(0.4);
      expect(book.frames / book.fps, hit).toBeGreaterThan(0.25);
      // the light while a note is held: a loop with a core of its own (no frame of the hit glows under it)
      expect(hold.flipbook, hit).toMatchObject({ cols: 4, rows: 4, fps: 24, loop: true });
      expect(hold.flipbook!.frames, hit).toBeGreaterThanOrEqual(8);
      expect([burst.cored, hold.cored], hit).toEqual([undefined, true]);
      for (const t of [burst, hold]) {
        expect(t.anchorY, hit).toBe(0.5);
        expect(t.span, hit).toBeGreaterThan(0.5);
        expect(t.span, hit).toBeLessThan(1.7);
      }
    }
    for (const hit of HIT_STYLES.filter((h) => !skins.includes(h))) {
      const { hitBurst, hitHold } = styleTextures({ ...arcade, hit });
      for (const id of [hitBurst, hitHold]) {
        expect(id && manifest.textures[id]?.size, `${hit} ${id}`).toEqual([1024, 1024]);
        expect(manifest.textures[id!].flipbook, id).toMatchObject({ cols: 4, rows: 4, frames: 16 });
        expect(manifest.textures[id!].anchorY, id).toBe(0.5);
        expect(manifest.textures[id!].span, id).toBeGreaterThan(1);
      }
      expect(manifest.textures[hitBurst!].flipbook).toMatchObject({ fps: 60, loop: false });
      expect(manifest.textures[hitHold!].flipbook).toMatchObject({ fps: 24, loop: true });
    }
    expect(isArtHit('none')).toBe(false);
  });
});

describe.each(SETS)('the $set set drawn from art', (c) => {
  const style = setStyle(c);
  const images = loaded(style);

  it('loads its pictures, and its hit as flipbooks', () => {
    expect(styleImageIds(style)).toEqual([`${c.id}/notes`, `${c.id}/long`, `${c.id}/side`, ...STANDARD]);
    expect(styleImageIds({ ...style, side: 'dots' })).not.toContain(`${c.id}/side`);
    expect(styleTextures(style)).toEqual({ hitBurst: `${c.id}/hitBurst`, hitHold: `${c.id}/hitHold` });
    expect(isArtHit(c.hit)).toBe(true);
    expect(artPartsOf(style, images)).toEqual(['notes', 'long', 'side', 'gear']);
  });

  it('has every picture and flipbook in the media, at the size its layout is drawn from', () => {
    const sizes: Record<string, [number, number]> = {
      [`${c.id}/notes`]: [1024, 1024],
      [`${c.id}/long`]: [512, 256],
      [`${c.id}/side`]: [1024, 512],
    };
    for (const [id, size] of Object.entries(sizes)) expect(manifest.textures[id]?.size, id).toEqual(size);
    for (const id of [`${c.id}/hitBurst`, `${c.id}/hitHold`]) {
      expect(manifest.textures[id].flipbook, id).toMatchObject({ cols: 4, rows: 4, frames: 16 });
      expect(manifest.textures[id].anchorY, id).toBe(0.5);
      expect(manifest.textures[id].span, id).toBeGreaterThan(1);
    }
    expect(manifest.textures[`${c.id}/hitHold`].flipbook?.loop).toBe(true);
  });

  it('keeps every part in code while its pictures are missing', () => {
    expect(notePaintOf(c.note, {})).toBe(NOTE_PAINT[c.note]);
    expect(longPaintOf(c.note, {})).toBe(LONG_PAINT[LONG_OF[c.note]]);
    expect(noteShapeOf(c.note, {})).toBeUndefined();
    // the default gear has no pictures to miss: all of none loaded
    expect(artPartsOf(style, {})).toEqual(['gear']);
  });

  it('draws each key’s note from its own picture, filling the note, and a side lane’s as the side plate', () => {
    const paint = notePaintOf(c.note, images);
    const marks = ['white', 'blue', 'gold', 'scratch'] as const;
    marks.forEach((mark, i) => {
      const { g, draws } = recorder();
      paint(g, 120, 96, mark);
      const d = draws[0];
      // all of the note, from the mark's cell: the record and the five-pointed star 500 wide, the
      // four-pointed star narrower than it is deep, in the middle of its cell
      expect([d.dx, d.dw, d.dy, d.dh]).toEqual([0, 120, 0, 96]);
      const cell = { club: [6, 6, 500, 500], neon: [6, 12, 500, 488], crystal: [38, 6, 435, 500] }[c.set]!;
      expect([d.sx, d.sy, d.sw, d.sh]).toEqual([(i % 2) * 512 + cell[0], Math.floor(i / 2) * 512 + cell[1], cell[2], cell[3]]);
    });
    const { g, draws } = recorder();
    paint(g, 60, 40, 'side');
    expect(draws).toHaveLength(3);
    for (const d of draws) expect(d.sy).toBe(256);
    expect(draws[2].dx + draws[2].dw).toBe(60);
    expect(draws[0].dy).toBeCloseTo((40 - draws[0].dh) / 2, 9);
  });

  it('keeps the record round and the stars as drawn at the judge line', () => {
    const shape = noteShapeOf(c.note, images);
    expect(shape).toBe({ club: 1, crystal: 500 / 435, neon: 488 / 500 }[c.set]);
    const depth = noteDepthOf(c.note, 0.7, 0.9, 1.7, shape);
    expect(depth).toBeCloseTo(0.9 * shape! * 1.7, 9);
  });

  if (c.set === 'crystal')
    it('draws the four-pointed star over the whole note and nothing under it (no band across the lane to read as a bar note)', () => {
      const { g, draws, fills } = recorder();
      notePaintOf(c.note, images)(g, 120, 200, 'white');
      expect([draws[0].dx, draws[0].dy, draws[0].dw, draws[0].dh]).toEqual([0, 0, 120, 200]);
      expect(fills).toHaveLength(0);
      // it reaches the lane's edges; every other note leaves a gap between lanes
      expect(noteWidthOf('star4')).toBeGreaterThan(0.95);
      for (const note of ['flat', 'chamfer', 'round', 'star5'] as const) expect(noteWidthOf(note)).toBe(0.9);
    });

  it('draws its long note from art, its end as deep as the picture’s, its body and end lit while held', () => {
    const long = longPaintOf(c.note, images);
    expect(long.held).toBeDefined();
    expect(long.px).toBe(128);
    expect(long.width).toBe(LONG_PAINT[LONG_OF[c.note]].width);
    expect(long.endDepth).toBeCloseTo((c.end / 128) * NOTE_STRETCH, 9);
    const { g, draws } = recorder();
    long.end(g, 128, 100);
    long.held!.end(g, 128, 100);
    expect(draws.map((d) => [d.sx, d.sh])).toEqual([
      [256, c.end],
      [384, c.end],
    ]);
  });

  it('lays its bar over the keys with its ends whole and its middle stretched', () => {
    const { g, draws } = recorder();
    sideTapPaintOf(c.note, images, 0.3)(g, 512, 90);
    expect(draws).toHaveLength(3);
    for (const d of draws) expect([d.sy, d.sh]).toEqual([0, c.bar]);
    expect(draws[0].dw).toBe(draws[2].dw);
    expect(draws[2].dx + draws[2].dw).toBe(512);
  });
});

/** Each gear's pictures by part, as the manifest lists them: its whole deck first, then where its lights shine from inside a part. */
const GEAR_PICTURES: Record<GearStyle, Record<string, string>> = {
  // drawn in code alone
  standard: {},
  cabinet: { deck: 'cabinet/deck', plate: 'cabinet/abs', joystick: 'cabinet/joystick', button: 'cabinet/button', coin: 'cabinet/coin' },
  receiver: { deck: 'receiver/deck', plate: 'receiver/silver', frame: 'receiver/walnut', knob: 'receiver/knob', switch: 'receiver/switch' },
  najeon: { deck: 'najeon/deck', glow: 'najeon/glow', frame: 'najeon/band', lid: 'najeon/lid', lock: 'najeon/lock' },
  keyboard: { deck: 'keyboard/deck', glow: 'keyboard/glow', plate: 'keyboard/alu', knob: 'keyboard/knob', keycap: 'keyboard/keycap', brass: 'keyboard/brass' },
  racing: { deck: 'racing/deck', plate: 'racing/carbon', rotary: 'racing/rotary', button: 'racing/button' },
  orbital: { deck: 'orbital/deck', plate: 'orbital/paint', frame: 'orbital/foil', selector: 'orbital/selector', toggle: 'orbital/toggle', button: 'orbital/button' },
  piano: { deck: 'piano/deck', medallion: 'piano/medallion' },
  rawglass: { deck: 'rawglass/deck' },
  // drawn in code alone
  prism: {},
  // drawn in code but for the painting of its deck's sky and the feather over its score
  sky: { plate: 'sky/plate', feather: 'sky/feather' },
  fire: {},
  gpt: {},
  gemini: {},
  grok: {},
  claude: {},
  aqua: {},
  steel: {},
  rainbow: {},
  noir: {},
  magenta: {},
  wire: {},
  astral: {},
};

/** The things on each gear's deck drawn from pictures, and how many of each: none is a lane's (PIANO's keys are drawn in code). */
const THINGS: Record<GearStyle, Record<string, number>> = {
  standard: {},
  cabinet: { 'cabinet/joystick': 1, 'cabinet/button': 6, 'cabinet/coin': 1 },
  receiver: { 'receiver/knob': 2, 'receiver/switch': 5 },
  najeon: { 'najeon/lid': 2, 'najeon/lock': 1 },
  // the knob, the arrow keys' inverted T, the name plate
  keyboard: { 'keyboard/knob': 1, 'keyboard/keycap': 4, 'keyboard/brass': 1 },
  // the big rotary and the small one, four buttons
  racing: { 'racing/rotary': 2, 'racing/button': 4 },
  // the selector, three toggles, the arm and abort buttons
  orbital: { 'orbital/selector': 1, 'orbital/toggle': 3, 'orbital/button': 2 },
  // the treble clef medallion on the scratch lane's cheek block
  piano: { 'piano/medallion': 1 },
  // none: its glass is all its deck
  rawglass: {},
  prism: {},
  sky: {},
  fire: {},
  gpt: {},
  gemini: {},
  grok: {},
  claude: {},
  aqua: {},
  steel: {},
  rainbow: {},
  noir: {},
  magenta: {},
  wire: {},
  astral: {},
};

/** Whether two boxes on the canvas overlap (touching is not). */
const overlap = (p: { x: number; y: number; w: number; h: number }, q: typeof p) => p.x < q.x + q.w - 1e-6 && q.x < p.x + p.w - 1e-6 && p.y < q.y + q.h - 1e-6 && q.y < p.y + p.h - 1e-6;

describe('the sky gear, drawn in code over a painting, a feather’s picture on it', () => {
  const style = withParts(BASE_SKIN, { note: 'sky', side: 'bar', deck: 'sky', hit: 'sky' }).style;
  const images = loaded(style);
  const spec = (room: number, stretch: number): DeckSpec => ({ width: 8 * 73.65, depth: room + 60, room, stretch, lanes: [], sides: [] });

  it('has the painting of its deck’s sky and its feather in the media, no larger than a texture may be, and nothing else', () => {
    expect(styleImageIds(style)).toEqual(['sky/plate', 'sky/feather']);
    const plate = manifest.textures['sky/plate'];
    expect(plate.file).toBe('gears/sky/plate.webp');
    expect(plate.size[0]).toBe(2048);
    // wide: on the usual cameras the deck shows its upper half and a little more
    expect(plate.size[0] / plate.size[1]).toBeGreaterThan(2);
    expect(plate.size[0] / plate.size[1]).toBeLessThan(3);
    // the feather off its ground, in a square
    const feather = manifest.textures['sky/feather'];
    expect(feather.file).toBe('gears/sky/feather.png');
    expect(feather.size).toEqual([256, 256]);
    expect(Object.keys(gearArtOf('sky', images))).toEqual(['plate', 'feather']);
    expect(artPartsOf(style, images)).toEqual(['gear']);
    // not loaded (yet): the gear is drawn in code alone, and says so
    expect(artPartsOf(style, {})).toEqual([]);
  });

  it('lays the painting under its strip of dashes, as wide as the deck and as long along the track as keeps it as painted, and the feather left of the score', () => {
    const [pw, ph] = manifest.textures['sky/plate'].size;
    for (const [room, stretch] of [
      [155.55, 1.2],
      [912, 3.25],
    ]) {
      const s = spec(room, stretch);
      const { g, draws } = recorder();
      platePaintOf(style, images)(g, s);
      const [whole, ...more] = draws;
      expect(whole.id).toBe('sky/plate');
      // under the strip and its line (16 px of the sheets), across the whole deck
      expect([whole.dx, whole.dw]).toEqual([0, s.width]);
      expect(whole.dy).toBeCloseTo(16 * stretch, 6);
      expect(whole.dh).toBeCloseTo((ph / pw) * s.width * stretch, 6);
      // where the screen shows the deck deeper than the painting: its last row, down to the deck's end
      const under = s.depth - whole.dy - whole.dh;
      const rows = more.filter((d) => d.id === 'sky/plate');
      if (under > 0) {
        expect(rows).toHaveLength(1);
        expect([rows[0].sy, rows[0].sh]).toEqual([ph - 1, 1]);
        expect(rows[0].dy + rows[0].dh).toBeCloseTo(s.depth, 6);
      } else expect(rows).toHaveLength(0);
      // the feather last: on the score's line, left of where the score's first letter stands (the score is written
      // about the deck's middle), as much longer along the track as the deck is drawn
      const feathers = more.filter((d) => d.id === 'sky/feather');
      expect(feathers).toHaveLength(1);
      expect(more[more.length - 1]).toBe(feathers[0]);
      const [f] = feathers;
      const score = deckReadouts('sky', s)!.score;
      expect(f.dh / f.dw).toBeCloseTo(stretch, 6);
      expect(f.dx).toBeGreaterThan(score.x);
      expect(f.dx + f.dw).toBeLessThan(s.width * 0.36);
      // a little taller than the score's line, its middle a touch over the line's, its foot clear of the hairline under the score
      expect(f.dh).toBeGreaterThan(score.h);
      expect(f.dh).toBeLessThan(score.h * 1.2);
      expect(f.dy + f.dh / 2).toBeLessThan(score.y + score.h / 2);
      expect(f.dy + f.dh).toBeLessThanOrEqual(score.y + score.h + 1e-6);
    }
    // a deck too short for its readouts: the painting alone, no feather
    const short = recorder();
    platePaintOf(style, images)(short.g, spec(96, 1.1));
    expect(short.draws.map((d) => d.id)).not.toContain('sky/feather');
    expect(short.draws[0].id).toBe('sky/plate');
    // without its pictures nothing is drawn from one: the same sky and a feather in plain shapes
    const plain = recorder();
    platePaintOf(style, {})(plain.g, spec(155.55, 1.2));
    expect(plain.draws).toEqual([]);
    // the painting alone loaded: the feather still in code
    const half = recorder();
    platePaintOf(style, { 'sky/plate': images['sky/plate'] })(half.g, spec(155.55, 1.2));
    expect(half.draws.map((d) => d.id)).toEqual(['sky/plate']);
  });
});

// STANDARD and PRISM have no pictures: they are drawn in code alone (SKY's two have their own tests above)
describe.each(GEAR_STYLES.filter((gear) => !['prism', 'sky', 'fire', 'gpt', 'gemini', 'grok', 'claude', 'aqua', 'steel', 'rainbow', 'noir', 'magenta', 'wire', 'astral', 'standard'].includes(gear)).map((gear) => ({ gear })))('the $gear gear drawn from its pictures', ({ gear }) => {
  const style = withParts(BASE_SKIN, { note: 'flat', side: 'bar', deck: gear, hit: 'flash' }).style;
  const images = loaded(style);
  const ids = Object.values(GEAR_PICTURES[gear]);
  const deck = GEAR_PICTURES[gear].deck;
  // its pictures but the whole deck's: the deck drawn in code, as where that picture is missing
  const parts = Object.fromEntries(Object.entries(images).filter(([id]) => id !== deck));

  it('loads its pictures, every one in the media under gears/, no larger than a texture may be', () => {
    expect(styleImageIds(style)).toEqual(ids);
    expect(artPartsOf(style, images)).toEqual(['gear']);
    for (const id of ids) {
      const t = manifest.textures[id];
      expect(t?.file, id).toMatch(new RegExp(`^gears/${gear}/`));
      expect(Math.max(...t.size), id).toBeLessThanOrEqual(2048);
    }
    expect(Object.keys(gearArtOf(gear, images)).sort()).toEqual(Object.keys(GEAR_PICTURES[gear]).sort());
  });

  it('lays its whole deck from its picture on the perspective cameras, as long along the track as they flatten it', () => {
    const [pw, ph] = manifest.textures[deck].size;
    // a small preview's, SDVX's, FLAT's, the flattest camera it is drawn on
    for (const [room, stretch] of [
      [96, 1.1],
      [192, 1.25],
      [320, 1.25],
      [140, 2],
    ]) {
      const spec = deckSpec(room, stretch);
      const { g, draws } = recorder();
      platePaintOf(style, images)(g, spec);
      // the picture alone: its things stand in it, none drawn over it
      expect(draws.map((d) => d.id).every((id) => id === deck), `${room}`).toBe(true);
      const [whole, ...rest] = draws;
      expect([whole.x, whole.y, whole.w]).toEqual([0, 0, spec.width]);
      // painted from SDVX's camera on a 16:9 screen (a 1.2 stretch): longer on a camera flattening it more
      expect(whole.h / whole.w).toBeCloseTo(((ph / pw) * stretch) / 1.2, 9);
      // the plate runs on in the picture's last row where the screen shows more of it
      if (whole.h < spec.depth) {
        expect(rest).toHaveLength(1);
        expect([rest[0].sy, rest[0].sh, rest[0].x, rest[0].w]).toEqual([ph - 1, 1, 0, spec.width]);
        expect(rest[0].y).toBeCloseTo(whole.h, 9);
        expect(rest[0].y + rest[0].h).toBeCloseTo(spec.depth, 9);
      } else expect(rest).toEqual([]);
    }
    // the plane camera sees the deck from too far off the angle it was painted from: there it is drawn in code, its things on it
    const plane = recorder();
    platePaintOf(style, images)(plane.g, deckSpec(912, 3.25));
    expect(plane.draws.some((d) => d.id === deck)).toBe(false);
    expect(plane.draws.filter((d) => d.id in THINGS[gear])).toHaveLength(Object.values(THINGS[gear]).reduce((a, b) => a + b, 0));
  });

  it('draws the things on its deck from their pictures where the deck is drawn in code: on the deck the screen shows, apart, as their pictures are on the screen', () => {
    // the rooms and flattening the cameras give: a small preview's, SDVX's, FLAT's (without the deck's
    // picture), the plane camera's (with it)
    for (const [room, stretch, pictures] of [
      [96, 1.1, parts],
      [192, 1.25, parts],
      [320, 1.25, parts],
      [912, 3.25, images],
    ] as const) {
      const spec = deckSpec(room, stretch);
      const { g, draws } = recorder();
      platePaintOf(style, pictures)(g, spec);
      const things = draws.filter((d) => d.id in THINGS[gear]);
      expect(Object.fromEntries(Object.keys(THINGS[gear]).map((id) => [id, things.filter((d) => d.id === id).length]))).toEqual(THINGS[gear]);
      for (const d of things) {
        expect(d.x, d.id).toBeGreaterThanOrEqual(-1e-6);
        expect(d.x + d.w, d.id).toBeLessThanOrEqual(spec.width + 1e-6);
        expect(d.y, d.id).toBeGreaterThanOrEqual(0);
        expect(d.y + d.h, d.id).toBeLessThanOrEqual(spec.room + 1e-6);
        // as long on the screen for its width as its picture is: round things round
        const [pw, ph] = manifest.textures[d.id].size;
        expect(d.h / d.w / stretch, d.id).toBeCloseTo(ph / pw, 2);
      }
      for (const [i, p] of things.entries()) for (const q of things.slice(i + 1)) expect(overlap(p, q), `${p.id} and ${q.id} at ${room}`).toBe(false);
      // NAJEON's pearl vines from its frame's picture, on the deck and clear of the lids and the lock
      if (gear === 'najeon') {
        const vines = draws.filter((d) => d.id === 'najeon/band');
        expect(vines.length).toBeGreaterThanOrEqual(2);
        for (const v of vines) {
          expect(v.x).toBeGreaterThanOrEqual(-1e-6);
          expect(v.x + v.w).toBeLessThanOrEqual(spec.width + 1e-6);
          for (const t of things) expect(overlap(v, t), `vine and ${t.id}`).toBe(false);
        }
      }
    }
    // without its pictures the same gear is drawn in code
    const code = recorder();
    platePaintOf(style, {})(code.g, deckSpec(170));
    expect(code.draws).toEqual([]);
  });

  it('frames the track in its own frame, as wide as it is, with a look of its own in FEVER', () => {
    const look = borderLookOf(style, images);
    const code = gearBorderLook(gear, {});
    expect(look.paint).toBeTypeOf('function');
    expect(look.width).toBe(code.width);
    expect(look.width).toBeGreaterThanOrEqual(14);
    expect(look.tile).toBeGreaterThan(0);
    expect(look.body).toMatch(/^#[0-9a-f]{6}$/i);
    // the frame's picture drawn in it where it has one: NAJEON's vine as long down the track as the picture is for its width
    if (GEAR_PICTURES[gear].frame) {
      const { g, draws } = recorder();
      look.paint(g, 120, look.tile * 4, 4, false);
      expect(draws.some((d) => d.id === GEAR_PICTURES[gear].frame)).toBe(true);
    }
    if (gear === 'najeon') {
      const [w, h] = manifest.textures['najeon/band'].size;
      expect(look.tile).toBe(Math.round((21 * h) / w));
    }
  });
});
