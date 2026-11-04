import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { codeBorderLook, DECK_STYLES, KEY_PAINT, lightBox, type DeckSpec, type SideLook } from './deckArt';
import { parseManifest } from './skinArt';
import { BUILTIN_SKINS, PART_HITS, skinById, styleOf, withParts, type SkinStyle } from './skins';
import {
  artPartsOf,
  borderLookOf,
  DECK_COLOURS,
  deckColourOf,
  isArtHit,
  keyPaintOf,
  longPaintOf,
  mechaTurntable,
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
// the mecha set's parts, as the gear tab picks them
const arcade = styleOf(withParts(skinById('arcade', null), { note: 'chamfer', side: 'bar', deck: 'arcade', deckColour: 'gunmetal', hit: 'mecha' }));

/** A picture of the size the manifest gives (drawing on a recording canvas needs nothing more). */
const image = (id: string): ArtImage => {
  const [width, height] = manifest.textures[id].size;
  return { width, height } as unknown as ArtImage;
};
const loaded = (style: SkinStyle) => Object.fromEntries(styleImageIds(style).map((id) => [id, image(id)]));

/** A 2D context that records its drawImage calls (destination x, width; source x, y, width, height). */
function recorder() {
  const draws: { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number }[] = [];
  const g = new Proxy(
    {
      drawImage: (_: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) => draws.push({ sx, sy, sw, sh, dx, dy, dw, dh }),
    } as Record<string | symbol, unknown>,
    // everything else a paint does (paths, fills, gradients) does nothing here
    { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop: () => undefined })), set: () => true },
  ) as unknown as CanvasRenderingContext2D;
  return { g, draws };
}

describe('the concept sets drawn from art', () => {
  it('draws a gear in a colourway it has, else its own; a skin’s own gear drawn in code has none', () => {
    expect(deckColourOf({ deck: 'arcade', deckColour: 'red' })).toBe('red');
    expect(deckColourOf({ deck: 'arcade', deckColour: 'walnut' })).toBe('gunmetal');
    expect(deckColourOf({ deck: 'arcade' })).toBe('gunmetal');
    expect(deckColourOf({ deck: 'line', deckColour: 'red' })).toBeUndefined();
  });

  it('loads the pictures and flipbooks of the parts a style has, and only those', () => {
    expect(styleImageIds(arcade)).toEqual(['mecha/notes', 'mecha/long', 'mecha/side', 'mecha/keys', 'mecha/gear_gunmetal']);
    expect(styleImageIds({ ...arcade, side: 'dots', deck: 'line' })).toEqual(['mecha/notes', 'mecha/long']);
    expect(styleImageIds({ ...arcade, note: 'flat', deckColour: 'blue' })).toEqual(['mecha/keys', 'mecha/gear_blue']);
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
      'mecha/keys': [1024, 512],
      ...Object.fromEntries((DECK_COLOURS.arcade ?? []).map((c) => [`mecha/gear_${c.id}`, [1024, 1024] as [number, number]])),
    };
    for (const [id, size] of Object.entries(sizes)) expect(manifest.textures[id]?.size, id).toEqual(size);
    for (const style of [...BUILTIN_SKINS.map((s) => styleOf(s)), ...(DECK_COLOURS.arcade ?? []).map((c) => ({ ...arcade, deckColour: c.id }))]) {
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
    expect(keyPaintOf(arcade, none)).toBe(KEY_PAINT.arcade);
    expect(artPartsOf(arcade, none)).toEqual([]);
    // the gear goes to art whole: its caps without its plate's colourway stay in code
    expect(keyPaintOf(arcade, { 'mecha/keys': image('mecha/keys') })).toBe(KEY_PAINT.arcade);
    expect(artPartsOf({ ...arcade, deckColour: 'red' }, loaded({ ...arcade, deckColour: 'red' }))).toEqual(['notes', 'long', 'side', 'gear:red']);
    for (const deck of DECK_STYLES) if (deck !== 'arcade') expect(keyPaintOf({ ...arcade, deck }, loaded(arcade))).toBe(KEY_PAINT[deck]);
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

  it('puts the turntable in the scratch lane’s column, as wide as it lets it be and no deeper than the room', () => {
    const lane = { left: 10, width: 60 };
    for (const [room, stretch] of [
      [200, 1.3],
      [60, 1.3],
      [300, 3.2],
    ]) {
      const b = mechaTurntable(room, stretch, lane);
      expect(b.x).toBeGreaterThanOrEqual(lane.left);
      expect(b.x + b.w).toBeLessThanOrEqual(lane.left + lane.width + 1e-9);
      expect(b.y + b.h).toBeLessThanOrEqual(room);
      // as round on the screen as the picture: its depth is its width (for the picture's shape) times the stretch
      expect(b.h / b.w).toBeCloseTo((501 / 512) * stretch, 9);
    }
    expect(KEY_PAINT.arcade.scratchBox).toBeUndefined();
    expect(keyPaintOf(arcade, loaded(arcade)).scratchBox).toBe(mechaTurntable);
  });

  it('gives the track’s borders the arcade gear’s anodised frame in each colourway, and the code gear’s while its pictures are missing', () => {
    const colours = skinById('flat', null).colors;
    const looks = ['gunmetal', 'white', 'red', 'blue'].map((way) => borderLookOf({ ...arcade, deckColour: way }, loaded({ ...arcade, deckColour: way }), colours));
    expect(new Set(looks.map((l) => l.body)).size).toBe(4);
    for (const l of looks) expect(l.edge).toMatch(/^#[0-9a-f]{6}$/);
    expect(borderLookOf(arcade, {}, colours)).toEqual(codeBorderLook('arcade', colours));
  });

  it('paints the plate in its colourway from art, and the turntable where the scratch is', () => {
    const style = { ...arcade, deckColour: 'blue' };
    const spec: DeckSpec = {
      width: 400,
      room: 160,
      depth: 180,
      keyTop: 8,
      keyDepth: 56,
      stretch: 1.3,
      lanes: [
        { left: 0, width: 70, kind: 'scratch' },
        ...Array.from({ length: 7 }, (_, i) => ({ left: 70 + i * 47, width: 47, kind: i % 2 ? ('other' as const) : ('white' as const) })),
      ],
      sides: [],
      colours: skinById('arcade', null).colors,
    };
    const { g, draws } = recorder();
    platePaintOf(style, loaded(style))(g, spec);
    // the turntable's module, then the strip's three parts in three slices each
    expect(draws[0]).toMatchObject({ sx: 0, sy: 0, sw: 512, sh: 501 });
    expect(draws.slice(1)).toHaveLength(9);
    for (const d of draws.slice(1)) expect([d.sy, d.sh]).toEqual([512, 173]);
    expect(draws[1].dx).toBeGreaterThanOrEqual(70);
    const last = draws[draws.length - 1];
    expect(last.dx + last.dw).toBeLessThanOrEqual(400);
  });
});

/** CLUB, CRYSTAL and NEON: their note family, gear and hit, and the gear's colourways (its own first). */
const SETS = [
  { set: 'club', id: 'club', note: 'round', deck: 'mixer', hit: 'club', ways: ['black', 'white', 'silver', 'walnut'], end: 78, bar: 211 },
  // listed as "gem": "crystal" names an earlier texture set
  { set: 'crystal', id: 'gem', note: 'star4', deck: 'crystal', hit: 'crystal', ways: ['silver', 'rosegold', 'gold', 'smoke'], end: 70, bar: 206 },
  { set: 'neon', id: 'neon', note: 'star5', deck: 'neon', hit: 'neon', ways: ['black', 'carbon', 'navy', 'burgundy'], end: 59, bar: 248 },
  { set: 'piano', id: 'piano', note: 'piano', deck: 'grand', hit: 'piano', ways: ['ebony', 'white', 'mahogany', 'emerald'], end: 57, bar: 175 },
] as const;
type SetCase = (typeof SETS)[number];
/** The set's parts as the gear tab picks them, its gear in `way`. */
const setStyle = (c: SetCase, way: string = c.ways[1]) => styleOf(withParts(skinById('flat', null), { note: c.note, side: 'bar', deck: c.deck, deckColour: way, hit: c.hit }));

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

  it('loads its pictures in the colourway picked, and its hit as flipbooks', () => {
    expect(styleImageIds(style)).toEqual([`${c.id}/notes`, `${c.id}/long`, `${c.id}/side`, `${c.id}/keys`, `${c.id}/gear_${c.ways[1]}`]);
    expect(styleImageIds({ ...style, side: 'dots' })).not.toContain(`${c.id}/side`);
    expect(styleTextures(style)).toEqual({ hitBurst: `${c.id}/hitBurst`, hitHold: `${c.id}/hitHold` });
    expect(isArtHit(c.hit)).toBe(true);
    expect((DECK_COLOURS[c.deck] ?? []).map((w) => w.id)).toEqual([...c.ways]);
    // a colourway another gear has: the gear's own
    expect(deckColourOf({ deck: c.deck, deckColour: 'gunmetal' })).toBe(c.ways[0]);
    expect(artPartsOf(style, images)).toEqual(['notes', 'long', 'side', `gear:${c.ways[1]}`]);
  });

  it('has every picture and flipbook in the media, at the size its layout is drawn from', () => {
    const sizes: Record<string, [number, number]> = {
      [`${c.id}/notes`]: [1024, 1024],
      [`${c.id}/long`]: [512, 256],
      [`${c.id}/side`]: [1024, 512],
      [`${c.id}/keys`]: [512, 256],
      ...Object.fromEntries(c.ways.map((w) => [`${c.id}/gear_${w}`, [1024, 1024] as [number, number]])),
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
    expect(keyPaintOf(style, {})).toBe(KEY_PAINT[c.deck]);
    expect(noteShapeOf(c.note, {})).toBeUndefined();
    expect(artPartsOf(style, {})).toEqual([]);
    // the gear goes to art whole: its lights without its plate's colourway stay in code
    expect(keyPaintOf(style, { [`${c.id}/keys`]: image(`${c.id}/keys`) })).toBe(KEY_PAINT[c.deck]);
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

  it('lights its keys as far as the code gear’s do, from the light’s own picture; the scratch over its module', () => {
    const keys = keyPaintOf(style, images);
    expect(keys).not.toBe(KEY_PAINT[c.deck]);
    // the row is laid out as for the code gear
    expect(keys.reach).toBe(KEY_PAINT[c.deck].reach);
    if (c.set === 'piano') {
      // a key front on the code grand piano's key, resting in ivory
      expect(keys.idleColor).toBe(0xf4ead8);
      const { g, draws } = recorder();
      keys.idle('white', 1.3)(g, 60, 56);
      const [d, b] = [draws[0], lightBox('grand', 0, 0, 60, 56)];
      // the key at rest (31, 37, 194 × 182 in its cell) lies on the box
      expect(d.dx + (31 * d.dw) / 256).toBeCloseTo(b.x, 9);
      expect(d.dy + (37 * d.dh) / 256).toBeCloseTo(b.y, 9);
      expect((194 * d.dw) / 256).toBeCloseTo(b.w, 9);
      expect((182 * d.dh) / 256).toBeCloseTo(b.h, 9);
    } else expect(keys.idleColor).toBeUndefined();
    for (const lit of [false, true]) {
      if (c.set === 'piano') break;
      const { g, draws } = recorder();
      (lit ? keys.down : keys.idle)('white', 1.3)(g, 60, 56);
      expect(draws).toHaveLength(1);
      const d = draws[0];
      expect([d.sx, d.sy, d.sw, d.sh]).toEqual([lit ? 256 : 0, 0, 256, 256]);
      // in the middle of its place in the row, drawn as much longer along the track as round things are
      expect(d.dx + d.dw / 2).toBeCloseTo(30, 9);
      expect(d.dy + d.dh / 2).toBeCloseTo(28, 9);
      expect(d.dh / d.dw).toBeCloseTo(1.3, 9);
      // no wider than its picture's light lets it be in the lane, nor longer than the code light reaches
      expect(d.dh / 2).toBeLessThanOrEqual(KEY_PAINT[c.deck].reach('white', 60, 56, 1.3) * (256 / 140) + 1e-9);
    }
    // the scratch's light at rest is the plate's module; it lies over it, shaped as the colourway's module is
    const { g, draws } = recorder();
    keys.idle('scratch', 1.3)(g, 70, 70);
    expect(draws).toHaveLength(0);
    const lane = { left: 10, width: 60 };
    for (const way of c.ways) {
      const box = keyPaintOf(setStyle(c, way), loaded(setStyle(c, way))).scratchBox!(300, 1.3, lane);
      expect(box.x).toBeGreaterThanOrEqual(lane.left);
      expect(box.x + box.w).toBeLessThanOrEqual(lane.left + lane.width + 1e-9);
      expect(box.y + box.h).toBeLessThanOrEqual(300);
    }
  });

  it('gives the track’s borders its frame in each colourway (its wood where it is veneer), the code gear’s without its pictures', () => {
    const colours = skinById('flat', null).colors;
    const looks = c.ways.map((way) => borderLookOf(setStyle(c, way), loaded(setStyle(c, way)), colours));
    const key = (l: SideLook) => JSON.stringify({ ...l, body: typeof l.body === 'string' ? l.body : 'wood' });
    expect(new Set(looks.map(key)).size).toBe(c.ways.length);
    c.ways.forEach((way, i) => {
      const look = looks[i];
      expect(look.edge, way).toMatch(/^#[0-9a-f]{6}$/);
      expect(typeof look.body === 'function', way).toBe(way === 'walnut' || way === 'mahogany');
      if (typeof look.body === 'function') {
        // the veneer's grain from the sheet's edge, down the whole tile
        const { g, draws } = recorder();
        look.body(g, 0, 24, 256);
        expect(draws).toEqual([{ sx: 0, sy: 512, sw: 64, sh: 512, dx: 0, dy: 0, dw: 24, dh: 256 }]);
      }
    });
    expect(borderLookOf(style, {}, colours)).toEqual(codeBorderLook(c.deck, colours));
  });

  it('paints its plate in the colourway from art: the module in the scratch’s column, its own parts under the row', () => {
    for (const way of c.ways) {
      const st = setStyle(c, way);
      const { g, draws } = recorder();
      platePaintOf(st, loaded(st))(g, deckSpec(170));
      // the module from its place in the picture's first square, in the scratch's column
      const modules = draws.filter((d) => d.sx + d.sw <= 512 && d.sy + d.sh <= 512);
      expect(modules).toHaveLength(1);
      const [m] = modules;
      expect(m.dx).toBeGreaterThanOrEqual(0);
      expect(m.dx + m.dw).toBeLessThanOrEqual(70 + 1e-9);
      const under = draws.filter((d) => d !== m);
      // the wood of a colourway in veneer: its sheet (at (0, 512)) across the whole plate
      const veneer = under.filter((d) => d.sy === 512 && d.sh === 512);
      for (const d of veneer) expect([d.sx, d.sw, d.dx, d.dy, d.dw, d.dh]).toEqual([0, 1024, 0, 0, 400, 180]);
      if (c.set === 'club') {
        // a fader in each key lane; the walnut one's strips in veneer, one a lane
        expect(under.filter((d) => d.sx >= 512)).toHaveLength(7);
        expect(veneer).toHaveLength(way === 'walnut' ? 8 : 0);
      } else if (c.set === 'piano') {
        // the case: lacquer painted in code, or the mahogany one's veneer
        expect(under).toEqual(way === 'mahogany' ? veneer : []);
        expect(veneer).toHaveLength(way === 'mahogany' ? 1 : 0);
      } else {
        // the board's strip, from the scratch's column to the frame
        expect(under).toHaveLength(1);
        expect(under[0].sy).toBe(512);
        expect(under[0].dx).toBeGreaterThanOrEqual(70);
        expect(under[0].dx + under[0].dw).toBeLessThanOrEqual(400);
      }
      // a screen that shows little of the gear: the module alone (and the wood, where there is some)
      const small = recorder();
      platePaintOf(st, loaded(st))(small.g, deckSpec(70));
      expect(small.draws.filter((d) => d.sy < 512)).toHaveLength(1);
    }
  });
});
