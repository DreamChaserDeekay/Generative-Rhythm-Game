import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { codeBorderLook, GEAR_STYLES, keyBox, moduleBox, type DeckSpec, type GearStyle } from './deckArt';
import { parseManifest } from './skinArt';
import { BUILTIN_SKINS, PART_HITS, skinById, styleOf, withParts, type SkinStyle } from './skins';
import {
  artPartsOf,
  borderLookOf,
  gearArtOf,
  isArtHit,
  longPaintOf,
  notePaintOf,
  noteShapeOf,
  platePaintOf,
  sideTapPaintOf,
  styleImageIds,
  styleTextures,
  type ArtImage,
} from './styleArt';
import { LONG_OF, LONG_PAINT, NOTE_PAINT, NOTE_STRETCH, noteDepthOf } from './tintArt';

const MEDIA = fileURLToPath(new URL('../../public/media/', import.meta.url));
const manifest = parseManifest(JSON.parse(readFileSync(join(MEDIA, 'manifest.json'), 'utf-8')))!;
// the mecha set's notes and hit on the arcade cabinet, as the gear tab picks them
const arcade = styleOf(withParts(skinById('arcade', null), { note: 'chamfer', side: 'bar', deck: 'cabinet', hit: 'mecha' }));

/** A picture of the size the manifest gives (drawing on a recording canvas needs nothing more), its id kept to tell it by. */
const image = (id: string): ArtImage => {
  const [width, height] = manifest.textures[id].size;
  return { width, height, id } as unknown as ArtImage;
};
const loaded = (style: SkinStyle) => Object.fromEntries(styleImageIds(style).map((id) => [id, image(id)]));

/**
 * A 2D context that records its drawImage calls (source x, y, width, height; destination x, y, width,
 * height; a call with a destination only records it as both) and the picture drawn.
 */
function recorder() {
  const draws: { id: string; sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number }[] = [];
  const g = new Proxy(
    {
      drawImage: (pic: { id?: string }, ...a: number[]) => {
        const [sx, sy, sw, sh, dx, dy, dw, dh] = a.length === 8 ? a : [0, 0, 0, 0, a[0], a[1], a[2], a[3]];
        draws.push({ id: pic?.id ?? '', sx, sy, sw, sh, dx, dy, dw, dh });
      },
    } as Record<string | symbol, unknown>,
    // everything else a paint does (paths, fills, gradients) does nothing here
    { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop: () => undefined })), set: () => true },
  ) as unknown as CanvasRenderingContext2D;
  return { g, draws };
}

describe('the concept sets drawn from art', () => {
  it('keeps no gear of the sets in the media: the gears are the four of their own', () => {
    expect(Object.keys(manifest.textures).filter((id) => /\/(gear|keys)$/.test(id))).toEqual([]);
    expect(Object.values(manifest.textures).filter((t) => t.file.startsWith('styles/') && /\/(gear|keys)\.png$/.test(t.file))).toEqual([]);
  });

  it('loads the pictures and flipbooks of the parts a style has, and only those', () => {
    const cabinet = ['cabinet/abs', 'cabinet/button', 'cabinet/turntable'];
    expect(styleImageIds(arcade)).toEqual(['mecha/notes', 'mecha/long', 'mecha/side', ...cabinet]);
    expect(styleImageIds({ ...arcade, side: 'dots', deck: 'line' })).toEqual(['mecha/notes', 'mecha/long']);
    expect(styleImageIds({ ...arcade, note: 'flat' })).toEqual(cabinet);
    expect(styleImageIds(styleOf(skinById('flat', null)))).toEqual([]);
    expect(styleTextures(arcade)).toEqual({ hitBurst: 'mecha/hitBurst', hitHold: 'mecha/hitHold' });
    // the four hits of no set have flipbooks of their own; the skins' own STEMFLASH is drawn in code
    for (const hit of ['flash', 'flare', 'bubbles', 'grid'] as const) expect(styleTextures({ ...arcade, hit })).toEqual({ hitBurst: `${hit}/hitBurst`, hitHold: `${hit}/hitHold` });
    expect(styleTextures({ ...arcade, hit: 'crystal' })).toEqual({ hitBurst: 'gem/hitBurst', hitHold: 'gem/hitHold' });
    for (const hit of ['stemflash', 'none', 'flipbook'] as const) expect(styleTextures({ ...arcade, hit })).toEqual({});
  });

  it('has every picture and flipbook in the media, at the size its layout is drawn from', () => {
    const sizes: Record<string, [number, number]> = {
      'mecha/notes': [1024, 1024],
      'mecha/long': [512, 256],
      'mecha/side': [1024, 512],
    };
    for (const [id, size] of Object.entries(sizes)) expect(manifest.textures[id]?.size, id).toEqual(size);
    for (const style of [...BUILTIN_SKINS.map((s) => styleOf(s)), arcade]) {
      for (const id of [...styleImageIds(style), ...Object.values(styleTextures(style))]) expect(manifest.textures[id], id).toBeDefined();
    }
    // the flipbooks spread from the judge line down over the gear
    for (const id of ['mecha/hitBurst', 'mecha/hitHold']) {
      expect(manifest.textures[id].flipbook, id).toMatchObject({ cols: 4, rows: 4, frames: 16 });
      expect(manifest.textures[id].anchorY, id).toBeGreaterThan(0.5);
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
    expect(gearArtOf('cabinet', { 'cabinet/button': image('cabinet/button') })).toEqual({ key: image('cabinet/button') });
    expect(artPartsOf(arcade, loaded(arcade))).toEqual(['notes', 'long', 'side', 'gear']);
    // a skin's own gear has no pictures
    expect(gearArtOf('line', loaded(arcade))).toEqual({});
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

/** CLUB, CRYSTAL, NEON and PIANO: their note family and hit. */
const SETS = [
  { set: 'club', id: 'club', note: 'round', hit: 'club', end: 78, bar: 211 },
  // listed as "gem": "crystal" names an earlier texture set
  { set: 'crystal', id: 'gem', note: 'star4', hit: 'crystal', end: 70, bar: 206 },
  { set: 'neon', id: 'neon', note: 'star5', hit: 'neon', end: 59, bar: 248 },
  { set: 'piano', id: 'piano', note: 'piano', hit: 'piano', end: 57, bar: 175 },
] as const;
type SetCase = (typeof SETS)[number];
/** The set's parts as the gear tab picks them, on the standard gear. */
const setStyle = (c: SetCase) => styleOf(withParts(skinById('flat', null), { note: c.note, side: 'bar', deck: 'standard', hit: c.hit }));
const STANDARD = ['standard/graphite', 'standard/pad', 'standard/jog'];

/** A deck with the scratch at the left and seven keys, `room` px of it on the screen. */
function deckSpec(room: number): DeckSpec {
  return {
    width: 400,
    room,
    depth: 180,
    keyTop: 8,
    keyDepth: 56,
    stretch: 1.3,
    lanes: [
      { left: 0, width: 70, kind: 'scratch' },
      ...Array.from({ length: 7 }, (_, i) => ({ left: 70 + i * 47, width: 47, kind: i % 2 ? ('other' as const) : ('white' as const) })),
    ],
    sides: [],
    colours: skinById('flat', null).colors,
  };
}

describe('the hits drawn from art', () => {
  it('plays every hit a player picks from flipbooks in the media: once on a hit, looping while held, from the judge line down', () => {
    expect(PART_HITS).toEqual(['flash', 'flare', 'bubbles', 'grid', 'mecha', 'club', 'crystal', 'neon', 'piano']);
    for (const hit of PART_HITS) {
      expect(isArtHit(hit), hit).toBe(true);
      const { hitBurst, hitHold } = styleTextures({ ...arcade, hit });
      for (const id of [hitBurst, hitHold]) {
        expect(id && manifest.textures[id]?.size, `${hit} ${id}`).toEqual([1024, 1024]);
        expect(manifest.textures[id!].flipbook, id).toMatchObject({ cols: 4, rows: 4, frames: 16 });
        expect(manifest.textures[id!].anchorY, id).toBeGreaterThan(0.5);
      }
      expect(manifest.textures[hitBurst!].flipbook).toMatchObject({ fps: 60, loop: false });
      expect(manifest.textures[hitHold!].flipbook).toMatchObject({ fps: 24, loop: true });
    }
    // the STEM skin's own is drawn in code only
    expect(isArtHit('stemflash')).toBe(false);
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
      expect(manifest.textures[id].anchorY, id).toBeGreaterThan(0.5);
    }
    expect(manifest.textures[`${c.id}/hitHold`].flipbook?.loop).toBe(true);
  });

  it('keeps every part in code while its pictures are missing', () => {
    expect(notePaintOf(c.note, {})).toBe(NOTE_PAINT[c.note]);
    expect(longPaintOf(c.note, {})).toBe(LONG_PAINT[LONG_OF[c.note]]);
    expect(noteShapeOf(c.note, {})).toBeUndefined();
    expect(artPartsOf(style, {})).toEqual([]);
  });

  it('draws each key’s note from its own picture, filling the note, and a side lane’s as the side plate', () => {
    const paint = notePaintOf(c.note, images);
    const marks = ['white', 'blue', 'gold', 'scratch'] as const;
    marks.forEach((mark, i) => {
      const { g, draws } = recorder();
      paint(g, 120, 96, mark);
      const d = draws[0];
      if (c.set === 'piano') {
        // its rounded ends and its inlaid mark whole, the inlay between stretched, slices meeting at whole px
        expect(draws).toHaveLength(5);
        for (const e of draws) expect([e.sy, e.sh, e.dy, e.dh]).toEqual([i * 256 + 28, 200, 0, 96]);
        expect(draws[0].dx).toBe(0);
        for (let k = 1; k < 5; k++) expect(draws[k].dx).toBe(draws[k - 1].dx + draws[k - 1].dw);
        expect(draws[4].dx + draws[4].dw).toBe(120);
        return;
      }
      // all of the lane's width; the gem in a row of its own, the record and the star in a cell
      expect([d.dx, d.dw]).toEqual([0, 120]);
      if (c.set === 'crystal') {
        expect([d.sx, d.sy, d.sw, d.sh]).toEqual([0, i * 256 + 1, 1024, 253]);
        // a long flat gem across a bar's depth, about its middle, fuller than drawn but not twice
        expect(d.dh).toBeLessThanOrEqual(96);
        expect(d.dy).toBeCloseTo((96 - d.dh) / 2, 9);
        expect(d.dh / d.dw).toBeLessThan((2 * 253 * NOTE_STRETCH) / 1024);
      } else {
        expect([d.sx, d.sy]).toEqual([(i % 2) * 512 + 6, Math.floor(i / 2) * 512 + (c.set === 'club' ? 6 : 12)]);
        expect([d.dy, d.dh]).toEqual([0, 96]);
      }
    });
    const { g, draws } = recorder();
    paint(g, 60, 40, 'side');
    expect(draws).toHaveLength(3);
    for (const d of draws) expect(d.sy).toBe(256);
    expect(draws[2].dx + draws[2].dw).toBe(60);
    expect(draws[0].dy).toBeCloseTo((40 - draws[0].dh) / 2, 9);
  });

  it('keeps the record round and the star as drawn at the judge line; the gem lies in a bar’s depth', () => {
    const shape = noteShapeOf(c.note, images);
    expect(shape).toBe({ club: 1, crystal: null, neon: 488 / 500, piano: null }[c.set]);
    const depth = noteDepthOf(c.note, 0.7, 1.2, 1.7, shape);
    if (shape === null) expect(depth).toBe(0.7);
    else expect(depth).toBeCloseTo(1.2 * shape! * 1.7, 9);
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

/** Each gear's pictures by part, as the manifest lists them. */
const GEAR_PICTURES: Record<GearStyle, Record<string, string>> = {
  standard: { frame: 'standard/graphite', key: 'standard/pad', scratch: 'standard/jog' },
  cabinet: { plate: 'cabinet/abs', key: 'cabinet/button', scratch: 'cabinet/turntable' },
  receiver: { plate: 'receiver/silver', frame: 'receiver/walnut', key: 'receiver/switch', scratch: 'receiver/knob' },
  najeon: { frame: 'najeon/band', key: 'najeon/tablet', scratch: 'najeon/lid', badge: 'najeon/lock' },
};

describe.each(GEAR_STYLES.map((gear) => ({ gear })))('the $gear gear drawn from its pictures', ({ gear }) => {
  const style = styleOf(withParts(skinById('flat', null), { note: 'flat', side: 'bar', deck: gear, hit: 'flash' }));
  const images = loaded(style);
  const ids = Object.values(GEAR_PICTURES[gear]);

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

  it('draws a key body from its picture in each key lane’s place in the row, and the scratch’s module in its column', () => {
    const spec = deckSpec(170);
    const { g, draws } = recorder();
    platePaintOf(style, images)(g, spec);
    const keys = draws.filter((d) => d.id === GEAR_PICTURES[gear].key);
    expect(keys).toHaveLength(7);
    for (const [i, d] of keys.entries()) {
      const lane = spec.lanes[i + 1];
      const b = keyBox(gear, lane.width, spec.keyDepth, spec.stretch);
      expect(d.dx).toBeCloseTo(lane.left + b.x, 9);
      expect(d.dy).toBeCloseTo(spec.keyTop + b.y, 9);
      expect([d.dw, d.dh].map((v) => Math.round(v * 1e6))).toEqual([b.w, b.h].map((v) => Math.round(v * 1e6)));
      // inside the lane and the row, as long on the screen for its width as its picture is
      expect(d.dx).toBeGreaterThanOrEqual(lane.left);
      expect(d.dx + d.dw).toBeLessThanOrEqual(lane.left + lane.width + 1e-9);
      expect(d.dy + d.dh).toBeLessThanOrEqual(spec.keyTop + spec.keyDepth + 1e-9);
      const [pw, ph] = manifest.textures[GEAR_PICTURES[gear].key].size;
      expect(d.dh / d.dw / spec.stretch).toBeCloseTo(ph / pw, 1);
    }
    const scratch = draws.filter((d) => d.id === GEAR_PICTURES[gear].scratch);
    expect(scratch).toHaveLength(1);
    const box = moduleBox(1)(spec.room, spec.stretch, spec.lanes[0]);
    expect([scratch[0].dx, scratch[0].dy, scratch[0].dw, scratch[0].dh]).toEqual([box.x, box.y, box.w, box.h]);
    expect(scratch[0].dx).toBeGreaterThanOrEqual(0);
    expect(scratch[0].dx + scratch[0].dw).toBeLessThanOrEqual(70 + 1e-9);
    // round on the screen: as much longer along the track as the camera flattens it
    expect(scratch[0].dh / scratch[0].dw).toBeCloseTo(spec.stretch, 9);
    if (gear === 'najeon') expect(draws.filter((d) => d.id === 'najeon/lock')).toHaveLength(1);
    // without its pictures the same gear is drawn in code
    const code = recorder();
    platePaintOf(style, {})(code.g, spec);
    expect(code.draws).toEqual([]);
  });

  it('frames the track in its own frame, as wide as it is, with a look of its own in FEVER', () => {
    const colours = skinById('flat', null).colors;
    const look = borderLookOf(style, images, colours);
    const code = codeBorderLook(gear, colours);
    expect(look.paint).toBeTypeOf('function');
    expect(look.lit).toBe(true);
    expect(look.width).toBe(code.width);
    expect(look.width).toBeGreaterThanOrEqual(14);
    expect(look.tile).toBeGreaterThan(0);
    expect(look.edge).toMatch(/^#[0-9a-f]{6}$/i);
    // the frame's picture drawn in it where it has one: NAJEON's vine as long down the track as the picture is for its width
    if (GEAR_PICTURES[gear].frame) {
      const { g, draws } = recorder();
      look.paint!(g, 120, (look.tile ?? 0) * 4, 4, false);
      expect(draws.some((d) => d.id === GEAR_PICTURES[gear].frame)).toBe(true);
    }
    if (gear === 'najeon') {
      const [w, h] = manifest.textures['najeon/band'].size;
      expect(look.tile).toBe(Math.round((21 * h) / w));
    }
  });
});
