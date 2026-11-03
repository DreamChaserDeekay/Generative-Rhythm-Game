import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DECK_STYLES, KEY_PAINT, type DeckSpec } from './deckArt';
import { parseManifest } from './skinArt';
import { BUILTIN_SKINS, skinById, styleOf, withParts, type SkinStyle } from './skins';
import {
  artPartsOf,
  DECK_COLOURS,
  deckColourOf,
  keyPaintOf,
  longPaintOf,
  mechaTurntable,
  notePaintOf,
  platePaintOf,
  sideTapPaintOf,
  styleImageIds,
  styleTextures,
  type ArtImage,
} from './styleArt';
import { LONG_PAINT, NOTE_PAINT, NOTE_STRETCH } from './tintArt';

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
  it('draws a gear in a colourway it has, else its own; a gear drawn in code has none', () => {
    expect(deckColourOf({ deck: 'arcade', deckColour: 'red' })).toBe('red');
    expect(deckColourOf({ deck: 'arcade', deckColour: 'walnut' })).toBe('gunmetal');
    expect(deckColourOf({ deck: 'arcade' })).toBe('gunmetal');
    expect(deckColourOf({ deck: 'grand', deckColour: 'red' })).toBeUndefined();
  });

  it('loads the pictures and flipbooks of the parts a style has, and only those', () => {
    expect(styleImageIds(arcade)).toEqual(['mecha/notes', 'mecha/long', 'mecha/side', 'mecha/keys', 'mecha/gear_gunmetal']);
    expect(styleImageIds({ ...arcade, side: 'dots', deck: 'grand' })).toEqual(['mecha/notes', 'mecha/long']);
    expect(styleImageIds({ ...arcade, note: 'round', deckColour: 'blue' })).toEqual(['mecha/keys', 'mecha/gear_blue']);
    expect(styleImageIds(styleOf(skinById('flat', null)))).toEqual([]);
    expect(styleTextures(arcade)).toEqual({ hitBurst: 'mecha/hitBurst', hitHold: 'mecha/hitHold' });
    expect(styleTextures({ ...arcade, hit: 'wave' })).toEqual({});
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
    expect(longPaintOf('rail', none)).toBe(LONG_PAINT.rail);
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
    const long = longPaintOf('rail', loaded(arcade));
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
