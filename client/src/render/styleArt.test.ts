import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { plateWindows, GEAR_STYLES, gearBorderLook, type DeckSpec, type GearStyle } from './deckArt';
import { parseManifest } from './skinArt';
import { BASE_SKIN, withParts, type SkinStyle } from './skins';
import {
  ART_LONGS,
  ART_SIDES,
  ledSpritesOf,
  sideBarArtOf,
  ART_MATERIALS,
  ART_NOTES,
  artPartsOf,
  borderLookOf,
  gearArtOf,
  isArtHit,
  longPaintOf,
  NOTE_WIDTH,
  notePaintOf,
  platePaintOf,
  styleImageIds,
  styleTextures,
  type ArtImage,
} from './styleArt';
import { HIT_STYLES, isBarNote, LOGO_NOTES, LONG_OF, LONG_PAINT, LONG_STYLES, NOTE_PAINT, NOTE_STRETCH, NOTE_STYLES, type HitStyle } from './tintArt';

const MEDIA = fileURLToPath(new URL('../../public/media/', import.meta.url));
/** A style's pictures but its notes' and long notes' own (the bars drawn with the image model: ART_NOTES, ART_LONGS). */
const gearIds = (style: SkinStyle) => styleImageIds(style).filter((id) => !/^(notes|longs|side)\//.test(id));
const manifest = parseManifest(JSON.parse(readFileSync(join(MEDIA, 'manifest.json'), 'utf-8')))!;
// the plain notes with the mecha set's hit on the piano, as the notes and gear tabs pick them
const mecha = withParts(BASE_SKIN, { note: 'flat', side: 'bar', deck: 'piano', hit: 'mecha' }).style;

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

describe('the pictures and flipbooks a style’s parts load', () => {
  it('keeps no gear of the sets in the media: the gears are ones of their own', () => {
    expect(Object.keys(manifest.textures).filter((id) => /\/(gear|keys)$/.test(id))).toEqual([]);
    expect(Object.values(manifest.textures).filter((t) => t.file.startsWith('styles/') && /\/(gear|keys)\.png$/.test(t.file))).toEqual([]);
  });

  it('loads the pictures and flipbooks of the parts a style has, and only those', () => {
    const piano = ['piano/deck'];
    // the plain bar and its long note (drawn again with the image model), then the gear's
    expect(styleImageIds(mecha)).toEqual(['notes/flat', 'longs/solid', 'side/bar', ...piano]);
    // the side notes laid over the keys, as bars or as dots: each its own picture (drawn again with the image model)
    expect(styleImageIds({ ...mecha, side: 'dots' })).toEqual(['notes/flat', 'longs/solid', 'side/dots', ...piano]);
    expect(gearIds(mecha)).toEqual(piano);
    // the track as it starts: the default skin, its notes and its row of keys drawn in code (as the PRISM set's are),
    // its deck's lower part a painting (its panel) and its hit a flipbook
    expect(gearIds(BASE_SKIN.style)).toEqual(['standard/panel']);
    expect(gearIds({ note: 'prism', side: 'bar', deck: 'prism', hit: 'prism' })).toEqual(['prism/panel']);
    // the sky skin's too, with the two pictures its deck drawn in code lays where its panel is missing: an older
    // painting of its sky and the feather over its score
    expect(gearIds({ note: 'sky', side: 'bar', deck: 'sky', hit: 'sky' })).toEqual(['sky/panel', 'sky/plate', 'sky/feather']);
    // the Firestarter skin's parts are drawn in code too, but for its panel and the crests its key caps carry (the
    // figures at its sides come with the build)
    expect(styleImageIds({ note: 'fire', side: 'bar', deck: 'fire', hit: 'fire' })).toEqual(['notes/fire', 'longs/fire', 'side/bar', 'fire/panel', 'fire/crests']);
    expect(styleTextures(mecha)).toEqual({ hitBurst: 'mecha/hitBurst', hitHold: 'mecha/hitHold' });
    // three hits of no set have flipbooks of their own, as the sets' hits do; the default skin's FLASH plays "basic"
    expect(styleTextures(BASE_SKIN.style)).toEqual({ hitBurst: 'basic/hitBurst', hitHold: 'basic/hitHold' });
    for (const hit of ['flare', 'bubbles', 'grid', 'crystal'] as const) expect(styleTextures({ ...mecha, hit })).toEqual({ hitBurst: `${hit}/hitBurst`, hitHold: `${hit}/hitHold` });
  });

  it('never loads a picture of the notes taken out: of the sets’ notes only the coin’s record and capsule are left in the media, and no bar in another finish', () => {
    const ids = Object.keys(manifest.textures);
    expect(ids.filter((id) => /^(mecha|club|crystal|neon|piano)\/(notes|long|side)$/.test(id)).sort()).toEqual(['club/long', 'club/notes']);
    for (const gone of ['chrome', 'hairline', 'glass', 'enamel', 'pearl', 'carbon']) {
      expect(manifest.textures[`notes/${gone}`], gone).toBeUndefined();
      expect(manifest.textures[`longs/${gone}`], gone).toBeUndefined();
    }
    // every note's and long note's picture left is one a note style a player can pick draws from
    const drawn = new Set(NOTE_STYLES.flatMap((note) => styleImageIds(withParts(BASE_SKIN, { note, side: 'bar', deck: 'standard', hit: 'flash' }).style)));
    for (const id of ids.filter((i) => /^(notes|longs)\//.test(i) || /\/(notes|long|side)$/.test(i))) expect(drawn, id).toContain(id);
    // the sets' hits are all still there, each picked on its own
    for (const hit of ['mecha', 'club', 'crystal', 'neon', 'piano'] as const) {
      for (const id of Object.values(styleTextures({ ...mecha, hit }))) expect(manifest.textures[id], id).toBeDefined();
    }
  });

  it('has every picture and flipbook in the media, at the size its layout is drawn from', () => {
    const sizes: Record<string, [number, number]> = {
      'notes/flat': [1024, 256],
      'longs/solid': [512, 256],
      'club/notes': [1024, 1024],
      'club/long': [512, 256],
    };
    for (const [id, size] of Object.entries(sizes)) expect(manifest.textures[id]?.size, id).toEqual(size);
    for (const style of [BASE_SKIN.style, mecha]) {
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
    expect(notePaintOf('flat', none)).toBe(NOTE_PAINT.flat);
    expect(longPaintOf('flat', none)).toBe(LONG_PAINT.solid);
    expect(artPartsOf(mecha, none)).toEqual([]);
    expect(gearArtOf('piano', none)).toEqual({});
    // the gear counts as drawn from art once its picture is loaded
    expect(artPartsOf(mecha, { 'piano/deck': image('piano/deck') })).toEqual(['gear']);
    expect(gearArtOf('piano', { 'piano/deck': image('piano/deck') })).toEqual({ deck: image('piano/deck') });
    // the notes and the long note each count by their own picture (the side notes have none)
    expect(artPartsOf(mecha, { 'notes/flat': image('notes/flat') })).toEqual(['notes']);
    expect(artPartsOf(mecha, { 'longs/solid': image('longs/solid') })).toEqual(['long']);
    expect(artPartsOf(mecha, loaded(mecha))).toEqual(['notes', 'long', 'gear']);
    expect(artPartsOf({ ...mecha, side: 'dots' }, loaded(mecha))).toEqual(['notes', 'long', 'gear']);
  });

  it('spans every note 0.9 of its lane: none reaches the lane’s edges', () => {
    expect(NOTE_WIDTH).toBe(0.9);
  });
});

/** A deck as the renderer paints it: the whole track's width (8 track units of 73.65 px), 8K's eight keys. */
function deckSpec(room: number, stretch = 1.3): DeckSpec {
  const width = 8 * 73.65;
  return {
    width,
    room,
    depth: room + 40,
    stretch,
    lanes: (['white', 'other', 'white', 'other', 'other', 'white', 'other', 'white'] as const).map((kind, i) => ({ left: (i * width) / 8, width: width / 8, kind })),
    sides: [],
  };
}

describe('the hits drawn from art', () => {
  it('plays every hit a player picks from flipbooks in the media: once on a hit, looping while held, whole about the judge line', () => {
    expect(HIT_STYLES).toEqual(['flash', 'prism', 'sky', 'fire', 'gpt', 'gemini', 'grok', 'claude', 'aqua', 'steel', 'noir', 'wire', 'astral', 'flare', 'bubbles', 'grid', 'mecha', 'club', 'crystal', 'neon', 'piano']);
    for (const hit of HIT_STYLES) expect(isArtHit(hit), hit).toBe(true);
    // the skins' hits are animations drawn frame by frame (scripts/assets/build_skin_fx.py): light in colours of their
    // own, added as it is; the default skin's FLASH is white light the lane colours ("basic": "flash" is an older sheet
    // nothing plays)
    const skins: readonly HitStyle[] = ['prism', 'sky', 'fire', 'gpt', 'gemini', 'grok', 'claude', 'aqua', 'steel', 'noir', 'wire', 'astral', 'flash'];
    for (const hit of skins) {
      const name = hit === 'flash' ? 'basic' : hit;
      const { hitBurst, hitHold } = styleTextures({ ...mecha, hit });
      expect([hitBurst, hitHold], hit).toEqual([`${name}/hitBurst`, `${name}/hitHold`]);
      const [burst, hold] = [manifest.textures[hitBurst!], manifest.textures[hitHold!]];
      expect([burst.file, hold.file], hit).toEqual([`fx/${name}_burst.webp`, `fx/${name}_hold.webp`]);
      expect([burst.plain === true, hold.plain === true], hit).toEqual(hit === 'flash' ? [false, false] : [true, true]);
      // a hit is over in 0.27 s (the user's rule: under 0.4 s), its frames the animation's own
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
      const { hitBurst, hitHold } = styleTextures({ ...mecha, hit });
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

/** Each gear's pictures by part, as the manifest lists them: its whole deck first. */
const GEAR_PICTURES: Record<GearStyle, Record<string, string>> = {
  // drawn in code alone
  standard: {},
  piano: { deck: 'piano/deck' },
  // drawn in code alone
  prism: {},
  // drawn in code but for the painting of its deck's sky and the feather over its score
  sky: { plate: 'sky/plate', feather: 'sky/feather' },
  // drawn in code but for the crests its key caps carry
  fire: { crests: 'fire/crests' },
  gpt: {},
  gemini: {},
  grok: {},
  claude: {},
  aqua: {},
  steel: {},
  noir: {},
  wire: {},
  astral: {},
};

// (where its panel is missing: with it, the panel lies over both, as on every skin's deck)
describe('the fire gear, drawn in code, the crests on its key caps a picture', () => {
  const style = withParts(BASE_SKIN, { note: 'fire', side: 'bar', deck: 'fire', hit: 'fire' }).style;

  it('has the strip of its four crests in the media, four square cells, beside its panel', () => {
    expect(styleImageIds(style)).toEqual(['notes/fire', 'longs/fire', 'side/bar', 'fire/panel', 'fire/crests']);
    const crests = manifest.textures['fire/crests'];
    expect(crests.file).toBe('gears/fire/crests.png');
    expect(crests.size).toEqual([1024, 256]);
    expect(Object.keys(gearArtOf('fire', loaded(style)))).toEqual(['panel', 'crests']);
    expect(artPartsOf(style, loaded(style))).toEqual(['notes', 'long', 'gear']);
    // not loaded (yet): its caps are bare, and the gear is drawn in code alone
    expect(Object.keys(gearArtOf('fire', {}))).toEqual([]);
    expect(artPartsOf(style, {})).toEqual([]);
  });
});

describe('the sky gear, drawn in code over a painting, a feather’s picture on it', () => {
  const style = withParts(BASE_SKIN, { note: 'sky', side: 'bar', deck: 'sky', hit: 'sky' }).style;
  const images = Object.fromEntries(Object.entries(loaded(style)).filter(([id]) => id !== 'sky/panel'));
  const spec = (room: number, stretch: number): DeckSpec => ({ width: 8 * 73.65, depth: room + 60, room, stretch, lanes: [], sides: [] });

  it('has the painting of its deck’s sky and its feather in the media, no larger than a texture may be, and nothing else', () => {
    expect(gearIds(style)).toEqual(['sky/panel', 'sky/plate', 'sky/feather']);
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
    expect(Object.keys(gearArtOf('sky', loaded(style)))).toEqual(['panel', 'plate', 'feather']);
    expect(artPartsOf(style, loaded(style))).toEqual(['notes', 'long', 'gear']);
    expect(artPartsOf(style, images)).toEqual(['notes', 'long']);
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
      const score = plateWindows('sky', s)!.score;
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
describe.each(GEAR_STYLES.filter((gear) => !['prism', 'sky', 'fire', 'gpt', 'gemini', 'grok', 'claude', 'aqua', 'steel', 'noir', 'wire', 'astral', 'standard'].includes(gear)).map((gear) => ({ gear })))('the $gear gear drawn from its pictures', ({ gear }) => {
  const style = withParts(BASE_SKIN, { note: 'flat', side: 'bar', deck: gear, hit: 'flash' }).style;
  const images = loaded(style);
  const ids = Object.values(GEAR_PICTURES[gear]);
  const deck = GEAR_PICTURES[gear].deck;
  it('loads its pictures, every one in the media under gears/, no larger than a texture may be', () => {
    expect(gearIds(style)).toEqual(ids);
    expect(artPartsOf(style, images)).toEqual(['notes', 'long', 'gear']);
    for (const id of ids) {
      const t = manifest.textures[id];
      expect(t?.file, id).toMatch(new RegExp(`^gears/${gear}/`));
      expect(Math.max(...t.size), id).toBeLessThanOrEqual(2048);
    }
    expect(Object.keys(gearArtOf(gear, images)).sort()).toEqual(Object.keys(GEAR_PICTURES[gear]).sort());
  });

  it('draws its deck in code on every row the game has: its picture was painted over 7K+1S’s row', () => {
    // a small preview's, SDVX's, FLAT's, the flattest perspective camera's, the plane camera's
    for (const [room, stretch] of [
      [96, 1.1],
      [192, 1.25],
      [320, 1.25],
      [140, 2],
      [912, 3.25],
    ]) {
      const { g, draws } = recorder();
      platePaintOf(style, images)(g, deckSpec(room, stretch));
      expect(draws, `${room}`).toEqual([]);
    }
    expect(deck).toBe(`${gear}/deck`);
  });

  it('frames the track in its own frame, as wide as it is, with a look of its own in FEVER', () => {
    const look = borderLookOf(style, images);
    const code = gearBorderLook(gear, {});
    expect(look.paint).toBeTypeOf('function');
    expect(look.width).toBe(code.width);
    expect(look.width).toBeGreaterThanOrEqual(14);
    expect(look.tile).toBeGreaterThan(0);
    expect(look.body).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('the AI companies’ long notes: the coin’s (the record and its capsule)', () => {
  const coin = { 'club/notes': image('club/notes'), 'club/long': image('club/long') };

  it('load the record and the capsule with their skins, beside the mark’s material and the gear’s panel', () => {
    expect(manifest.textures['club/notes']).toMatchObject({ file: 'styles/club/notes.png', size: [1024, 1024] });
    expect(manifest.textures['club/long']).toMatchObject({ file: 'styles/club/long.png', size: [512, 256] });
    for (const note of LOGO_NOTES) {
      const style = withParts(BASE_SKIN, { note, side: 'bar', deck: note, hit: note }).style;
      expect(styleImageIds(style), note).toEqual(['club/notes', 'club/long', `notes/${note}`, 'side/bar', `${note}/panel`]);
      expect(styleImageIds({ ...style, side: 'dots' }), note).toEqual(['club/notes', 'club/long', `notes/${note}`, 'side/dots', `${note}/panel`]);
      // the long note counts as drawn from art by the capsule's picture, the notes by the mark's material
      expect(artPartsOf(style, loaded(style)), note).toEqual(['notes', 'long', 'gear']);
      expect(artPartsOf(style, { 'club/long': image('club/long') }), note).toEqual(['long']);
      expect(artPartsOf(style, { 'club/notes': image('club/notes') }), note).toEqual([]);
    }
  });

  it('draw the body from the capsule’s picture, lit while held, and cut the ends in the record’s outline: the record as drawn beyond its widest row, the body running into it', () => {
    for (const note of LOGO_NOTES) {
      const long = longPaintOf(note, coin);
      expect(long.held, note).toBeDefined();
      expect(long.px, note).toBe(128);
      expect(long.width, note).toBe(LONG_PAINT.capsule.width);
      // as long on the screen as in the picture
      expect(long.tile, note).toBeCloseTo(2 * NOTE_STRETCH, 9);
      // an end as wide as the tap, and as deep as half the record looks at the judge line (it is round there)
      expect(long.endWidth, note).toBeCloseTo(NOTE_WIDTH / long.width, 9);
      expect(long.endDepth, note).toBeCloseTo(0.5 * NOTE_STRETCH * long.endWidth!, 9);
      const body = recorder();
      long.body(body.g, 128, 435);
      long.held!.body(body.g, 128, 435);
      expect(body.draws.map((d) => [d.id, d.sx, d.sy, d.sw, d.sh, d.dw, d.dh]), note).toEqual([
        ['club/long', 0, 0, 128, 256, 128, 435],
        ['club/long', 128, 0, 128, 256, 128, 435],
      ]);
      const { g, draws } = recorder();
      long.end(g, 128, 100);
      // the record's picture (a key's: its first cell, all of it) with its widest row on the end's inner edge (its
      // outer half shows), then the body's (the capsule's body, not its end) run into it
      expect(draws[0], note).toMatchObject({ id: 'club/notes', sx: 6, sy: 6, sw: 500, sh: 500, dx: 0, dy: 0, dw: 128 });
      expect(draws[0].dh, note).toBeCloseTo(100 / 0.5, 9);
      expect(draws.length, note).toBeGreaterThan(1);
      expect(draws.slice(1).every((d) => d.id === 'club/long' && d.sx === 0 && d.sh === 256), note).toBe(true);
      const held = recorder();
      long.held!.end(held.g, 128, 100);
      expect(held.draws[0], note).toMatchObject({ id: 'club/notes', sx: 6, sy: 6 });
      expect(held.draws.slice(1).every((d) => d.id === 'club/long' && d.sx === 128), note).toBe(true);
    }
    // the same long note for each of the four
    const [first, ...rest] = LOGO_NOTES.map((note) => longPaintOf(note, coin));
    for (const other of rest) expect([other.width, other.tile, other.endDepth, other.endWidth, other.px]).toEqual([first.width, first.tile, first.endDepth, first.endWidth, first.px]);
  });

  it('play the coin’s long note in code while its pictures are missing: the capsule, its ends cut in the coin’s outline', () => {
    const code = LONG_PAINT.capsule;
    for (const note of LOGO_NOTES) {
      expect(LONG_OF[note], note).toBe('capsule');
      const long = longPaintOf(note, {});
      expect([long.body, long.width, long.tile], note).toEqual([code.body, code.width, code.tile]);
      // its ends are the coin's outer half, not the capsule's own round end; nothing of them is a picture
      expect(long.end, note).not.toBe(code.end);
      expect(long.held!.body, note).toBe(code.body);
      expect([long.endWidth, long.endDepth], note).toEqual([NOTE_WIDTH / code.width, 0.5 * NOTE_STRETCH * (NOTE_WIDTH / code.width)]);
      const none = recorder();
      long.end(none.g, 128, 100);
      long.held!.end(none.g, 128, 100);
      expect(none.draws, note).toEqual([]);
      // the record alone loaded: the ends are cut in its picture, the capsule still in code
      const record = longPaintOf(note, { 'club/notes': image('club/notes') });
      expect(record.body, note).toBe(code.body);
      const ends = recorder();
      record.end(ends.g, 128, 100);
      expect(ends.draws.map((d) => d.id), note).toEqual(['club/notes']);
      // the capsule alone loaded: its body a picture, its ends the coin drawn in code with that body run into it
      const capsule = longPaintOf(note, { 'club/long': image('club/long') });
      expect(capsule.px, note).toBe(128);
      const run = recorder();
      capsule.end(run.g, 128, 100);
      expect(run.draws.length, note).toBeGreaterThan(0);
      expect(run.draws.every((d) => d.id === 'club/long' && d.sx === 0), note).toBe(true);
    }
  });
});

describe('the long notes drawn in code, drawn again with the image model', () => {

  it('are in the media as the coin’s capsule is (512 × 256), one for every long note but the capsule', () => {
    expect(Object.keys(ART_LONGS).sort()).toEqual(LONG_STYLES.filter((long) => long !== 'capsule').sort());
    for (const long of Object.keys(ART_LONGS) as (keyof typeof ART_LONGS)[]) {
      expect(manifest.textures[`longs/${long}`]?.size, long).toEqual([512, 256]);
      expect(manifest.textures[`longs/${long}`]?.file, long).toBe(`longs/${long}.png`);
    }
    // no picture in the media for a long note that is not in the list
    expect(Object.keys(manifest.textures).filter((id) => id.startsWith('longs/')).sort()).toEqual(Object.keys(ART_LONGS).map((long) => `longs/${long}`).sort());
  });

  it('draw a long note from its picture where it loaded, from code where it did not (so taking one out of the list brings its code drawing back)', () => {
    for (const long of Object.keys(ART_LONGS) as (keyof typeof ART_LONGS)[]) {
      const note = (Object.keys(LONG_OF) as (keyof typeof LONG_OF)[]).find((n) => LONG_OF[n] === long && !['gpt', 'gemini', 'grok', 'claude'].includes(n))!;
      expect(longPaintOf(note, {}), long).toBe(LONG_PAINT[long]);
      const art = longPaintOf(note, { [`longs/${long}`]: { id: `longs/${long}`, width: 512, height: 256 } } as never);
      expect(art.px, long).toBe(128);
      expect(art.width, long).toBe(LONG_PAINT[long].width);
      expect(art.endDepth, long).toBeCloseTo((ART_LONGS[long]!.end / 128) * NOTE_STRETCH, 9);
      expect(art.tile, long).toBeCloseTo(ART_LONGS[long]!.tile * NOTE_STRETCH, 9);
      const { g, draws } = recorder();
      art.end(g, 128, 50);
      art.held!.end(g, 128, 50);
      expect(draws.map((d) => [d.sx, d.sh])).toEqual([
        [256, ART_LONGS[long]!.end],
        [384, ART_LONGS[long]!.end],
      ]);
      // its body a tile of the picture, the held one beside it, drawn as long as the renderer asks
      const body = recorder();
      art.body(body.g, 128, 435);
      art.held!.body(body.g, 128, 435);
      expect(body.draws.map((d) => [d.sx, d.sy, d.sw, d.sh, d.dw, d.dh]), long).toEqual([
        [0, 0, 128, 256, 128, 435],
        [128, 0, 128, 256, 128, 435],
      ]);
      expect(styleImageIds(withParts(BASE_SKIN, { note, side: 'bar', deck: 'standard', hit: 'flash' }).style)).toContain(`longs/${long}`);
    }
  });
});

describe('the bars drawn in code, drawn again with the image model with their long notes', () => {
  it('are in the media (a tap each), one for every bar and none for a company’s mark', () => {
    expect([...ART_NOTES]).toEqual(NOTE_STYLES.filter(isBarNote));
    for (const note of ART_NOTES) {
      expect(manifest.textures[`notes/${note}`]?.size, note).toEqual([1024, 256]);
      expect(manifest.textures[`notes/${note}`]?.file, note).toBe(`notes/${note}.png`);
      expect(LOGO_NOTES as readonly string[], note).not.toContain(note);
    }
    // no picture in the media for a note that is neither a bar nor a mark's material
    expect(Object.keys(manifest.textures).filter((id) => id.startsWith('notes/')).sort()).toEqual([...ART_NOTES, ...ART_MATERIALS].map((note) => `notes/${note}`).sort());
  });

  it('cut a bar’s picture into its end caps, its middle and what lies between, meeting at whole px across the note', () => {
    const paint = notePaintOf('flat', { 'notes/flat': image('notes/flat') });
    for (const [w, h] of [
      [384, 96],
      [180, 96],
      [512, 96],
    ]) {
      const { g, draws } = recorder();
      paint(g, w, h, 'gold');
      expect(draws).toHaveLength(5);
      // the tap, all of the note's height
      for (const d of draws) expect([d.id, d.sy, d.sh, d.dy, d.dh]).toEqual(['notes/flat', 16, 224, 0, h]);
      // the picture's columns in order, none left out
      expect(draws.map((d) => [d.sx, d.sx + d.sw])).toEqual([[0, 212], [212, 332], [332, 692], [692, 812], [812, 1024]]);
      expect(draws[0].dx).toBe(0);
      expect(draws[4].dx + draws[4].dw).toBe(w);
      for (let i = 1; i < 5; i++) expect(draws[i].dx).toBe(draws[i - 1].dx + draws[i - 1].dw);
      for (const d of draws) expect(Number.isInteger(d.dx) && Number.isInteger(d.dw)).toBe(true);
      // the caps alike; on the screen (NOTE_STRETCH flatter) as the picture draws them, in a wide enough lane
      expect(Math.abs(draws[0].dw - draws[4].dw)).toBeLessThanOrEqual(1);
      if (w >= 384) expect(draws[0].dw).toBeCloseTo((212 * h) / 224 / NOTE_STRETCH, -0.5);
      // a narrow lane: its caps narrower, so what lies between them keeps some length
      else expect(draws[0].dw).toBeLessThan((212 * h) / 224 / NOTE_STRETCH - 2);
    }
  });

  it('draw a key’s and a side lane’s tap from the picture, its ends and middle kept as drawn; in code without the picture', () => {
    for (const note of ART_NOTES) {
      expect(notePaintOf(note, {}), note).toBe(NOTE_PAINT[note]);
      const picture = { id: `notes/${note}`, width: 1024, height: 256 };
      const paint = notePaintOf(note, { [`notes/${note}`]: picture } as never);
      for (const mark of ['white', 'blue', 'gold', 'side'] as const) {
        const { g, draws } = recorder();
        paint(g, 400, 96, mark);
        expect(draws.length, `${note} ${mark}`).toBe(5);
        for (const d of draws) expect(d.sy, `${note} ${mark}`).toBe(16);
        // its ends as drawn (as wide for their depth), the rest stretched
        expect(draws[0].dw).toBeCloseTo(draws[4].dw, 0);
        expect(draws[4].dx + draws[4].dw).toBeCloseTo(400, 0);
      }
      expect(styleImageIds(withParts(BASE_SKIN, { note, side: 'bar', deck: 'standard', hit: 'flash' }).style)).toContain(`notes/${note}`);
    }
  });

  it('give an AI company’s mark a material inside it, never another outline', () => {
    for (const logo of ART_MATERIALS) {
      expect(manifest.textures[`notes/${logo}`]?.size, logo).toEqual([512, 512]);
      expect(styleImageIds(withParts(BASE_SKIN, { note: logo, side: 'bar', deck: logo as 'gpt', hit: logo as 'gpt' }).style)).toContain(`notes/${logo}`);
      // without the mark loaded the note is the coin, material or not
      const { g, draws } = recorder();
      notePaintOf(logo, { [`notes/${logo}`]: { id: `notes/${logo}`, width: 512, height: 512 } } as never)(g, 96, 160, 'white');
      expect(draws, logo).toHaveLength(0);
    }
  });
});

describe('the side notes laid over the keys, drawn again with the image model', () => {
  it('are in the media, and each side style loads its own picture', () => {
    expect(manifest.textures['side/bar']?.size).toEqual([1024, 512]);
    expect(manifest.textures['side/dots']?.size).toEqual([256, 128]);
    for (const side of ART_SIDES) expect(styleImageIds(withParts(BASE_SKIN, { note: 'flat', side, deck: 'standard', hit: 'flash' }).style)).toContain(`side/${side}`);
  });

  it('draw the bar’s tap, body and end from their parts of the picture, and the code’s without it', () => {
    expect(sideBarArtOf({})).toBeUndefined();
    const art = sideBarArtOf({ 'side/bar': { id: 'side/bar', width: 1024, height: 512 } } as never)!;
    const rows = { tap: [0, 176], body: [192, 128], end: [336, 64] } as const;
    for (const part of ['tap', 'body', 'end'] as const) {
      const { g, draws } = recorder();
      art[part](g, 512, 90);
      expect([draws[0].sy, draws[0].sh, draws[0].dw, draws[0].dh], part).toEqual([...rows[part], 512, 90]);
    }
  });

  it('give the dots their LEDs only where the picture loaded', () => {
    expect(ledSpritesOf({})).toBeUndefined();
    expect(ledSpritesOf({ 'side/dots': { id: 'side/dots', width: 256, height: 128 } } as never)).toMatchObject({ size: 128, lens: 0.75 });
  });
});
