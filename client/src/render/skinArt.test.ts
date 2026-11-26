import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { disposeSkinArt, flipbookBlend, flipbookBlendInto, flipbookOffset, flipbookOffsetInto, hitFrame, loadSkinArt, parseManifest, parseMediaTexture, type FlipbookBlend, type MediaManifest } from './skinArt';
import type { ArtImage } from './styleArt';
import { BASE_SKIN } from './skins';

const NOTE = { file: 'styles/club/notes.png', bundle: 'notes', size: [1024, 1024] };
const BOOK = { cols: 4, rows: 4, frames: 16, fps: 60, loop: false };

function fakeTexture(width: number, height: number): THREE.Texture & { disposed: boolean } {
  const t = new THREE.Texture({ width, height } as unknown as HTMLImageElement) as THREE.Texture & { disposed: boolean };
  t.disposed = false;
  t.addEventListener('dispose', () => (t.disposed = true));
  return t;
}

describe('media manifest', () => {
  it('keeps well-formed texture entries', () => {
    expect(parseMediaTexture(NOTE)).toEqual(NOTE);
    const burst = { file: 'styles/hits/flash_burst.png', bundle: 'effects', size: [1024, 1024], flipbook: BOOK, anchorY: 0.5, span: 1.375 };
    expect(parseMediaTexture(burst)).toEqual(burst);
    // what the game reads no more (the old texture sets' tiling and sizes) is left out
    expect(parseMediaTexture({ ...NOTE, tile: 2.4, gain: 2, scale: 1.7 })).toEqual(NOTE);
    expect(parseMediaTexture({ ...burst, flipbook: { ...BOOK, loop: 'yes' } })?.flipbook?.loop).toBe(false);
    // a flipbook in colours of its own, and a hold flipbook with a core of its own: said with true, and nothing else
    expect(parseMediaTexture({ ...burst, plain: true, cored: true })).toEqual({ ...burst, plain: true, cored: true });
    expect(parseMediaTexture({ ...burst, plain: 'yes', cored: 1 })).toEqual(burst);
  });

  it('rejects paths that leave /media/, odd sizes and bad numbers', () => {
    for (const file of ['../secret.png', '/abs.png', 'http://x/y.png', 'a//b.png', 'note.svg', 'a b.png', 42]) {
      expect(parseMediaTexture({ ...NOTE, file })).toBeNull();
    }
    for (const size of [[256], [256, 0], [256.5, 64], [4096, 64], '256x64']) expect(parseMediaTexture({ ...NOTE, size })).toBeNull();
    expect(parseMediaTexture({ ...NOTE, anchorY: 1.5 })).toBeNull();
    expect(parseMediaTexture({ ...NOTE, span: 0 })).toBeNull();
    expect(parseMediaTexture({ ...NOTE, span: Number.NaN })).toBeNull();
    expect(parseMediaTexture({ ...NOTE, flipbook: { ...BOOK, frames: 17 } })).toBeNull();
    expect(parseMediaTexture({ ...NOTE, flipbook: { ...BOOK, fps: 0 } })).toBeNull();
    expect(parseMediaTexture(null)).toBeNull();
  });

  it('drops malformed entries and fills in the effect defaults', () => {
    const m = parseManifest({ version: 1, textures: { 'club/notes': NOTE, 'club/bad': { ...NOTE, file: '../x.png' } } });
    expect(Object.keys(m?.textures ?? {})).toEqual(['club/notes']);
    expect(m?.effects).toEqual({ reducedFlashOpacity: 0.45, reducedFlashScale: 0.8 });
    expect(parseManifest({ textures: {}, effects: { reducedFlashOpacity: 0.3, reducedFlashScale: 'big' } })?.effects).toEqual({
      reducedFlashOpacity: 0.3,
      reducedFlashScale: 0.8,
    });
    expect(parseManifest('nope')).toBeNull();
    expect(parseManifest({ version: 1 })).toBeNull();
  });

  it('places flipbook frames row by row from the top left', () => {
    expect(flipbookOffset(BOOK, 0)).toEqual([0, 0.75]);
    expect(flipbookOffset(BOOK, 5)).toEqual([0.25, 0.5]);
    expect(flipbookOffset(BOOK, 15.9)).toEqual([0.75, 0]);
    expect(flipbookOffset(BOOK, 99)).toEqual([0.75, 0]);
    expect(flipbookOffset(BOOK, -3)).toEqual([0, 0.75]);
    const [u, v] = flipbookOffset({ ...BOOK, cols: 2, rows: 3, frames: 6 }, 3);
    expect(u).toBe(0.5);
    expect(v).toBeCloseTo(1 / 3, 12);
  });

  it('keeps where a hit starts and the colour of its light, when they are a frame of the sheet and a colour', () => {
    const book = { ...BOOK, frames: 9, fps: 28.1 };
    const burst = { file: 'fx/claude_burst.webp', bundle: 'effects', size: [1536, 1536], flipbook: { ...book, peak: 3 }, plain: true, tone: '#ffa980' };
    const parsed = parseMediaTexture(burst);
    expect(parsed?.flipbook).toEqual({ ...book, peak: 3 });
    expect(parsed?.tone).toBe(0xffa980);
    // a start that is no later frame of the sheet (past its last, a part of one, its first) is left out: it plays from its first
    for (const peak of [9, 12, 2.5, -1, 0, '3']) expect(parseMediaTexture({ ...burst, flipbook: { ...book, peak } })?.flipbook, String(peak)).toEqual(book);
    // a colour that is not one is left out: the flash drawn with the hit is white
    for (const tone of ['ffa980', '#ffa98', 'orange', 0xffa980]) expect(parseMediaTexture({ ...burst, tone }), String(tone)).toEqual({ ...burst, tone: undefined });
  });

  it('keeps a hit drawn from layers: its atlas, and how its sheet\'s light fell and spread, when they are in range', () => {
    const burst = {
      file: 'fx/claude_burst.webp',
      bundle: 'effects',
      size: [1152, 768],
      layers: { cols: 3, rows: 2, light: [1, 0.8, 0.3, 0], core: [1, 0.2, 0], grow: 1.2, reach: 0.6, body: true },
      plain: true,
      tone: '#ffa980',
    };
    expect(parseMediaTexture(burst)?.layers).toEqual(burst.layers);
    expect(parseMediaTexture({ ...burst, layers: { cols: 3, rows: 2, turn: 0, axis: 'x', late: true } })?.layers).toEqual({ cols: 3, rows: 2, turn: 0, axis: 'x', late: true });
    // an atlas too small for its six cells, or numbers out of range, is no entry (the hit is drawn in code)
    for (const layers of [
      { cols: 2, rows: 2 },
      { cols: 3, rows: 2, light: [1] },
      { cols: 3, rows: 2, light: [1, 'x'] },
      { cols: 3, rows: 2, core: [1, 2] },
      { cols: 3, rows: 2, grow: 3 },
      { cols: 3, rows: 2, turn: 9 },
      { cols: 3, rows: 2, reach: -1 },
      'layers',
    ])
      expect(parseMediaTexture({ ...burst, layers }), JSON.stringify(layers)).toBeNull();
    // what it does not know is left out
    expect(parseMediaTexture({ ...burst, layers: { cols: 3, rows: 2, axis: 'y', body: 'yes' } })?.layers).toEqual({ cols: 3, rows: 2 });
  });

  it('starts a hit where its sheet says, and shows it between two frames as a mix of them', () => {
    const book = { ...BOOK, frames: 9, fps: 28.1, peak: 3 };
    expect(hitFrame(book, 0)).toBe(3);
    // (a hit drawn in the frame it was judged in, a moment before its own time)
    expect(hitFrame(book, -4)).toBe(3);
    expect(hitFrame(book, 1000 / 28.1)).toBeCloseTo(4, 9);
    expect(hitFrame(BOOK, 50)).toBeCloseTo(3, 9);
    // between two frames: the earlier one's place, the step to the next one's, and the share of the way there
    const at = flipbookBlend(BOOK, 5.25);
    expect(at.offset).toEqual([0.25, 0.5]);
    expect(at.step).toEqual([0.25, 0]);
    expect(at.mix).toBeCloseTo(0.25, 12);
    // from the end of a row to the start of the next
    expect(flipbookBlend(BOOK, 3.5).step).toEqual([-0.75, -0.25]);
    // a sheet played once ends on its last frame; a loop goes on to its first
    expect(flipbookBlend(BOOK, 15.5)).toEqual({ offset: [0.75, 0], step: [0, 0], mix: 0 });
    expect(flipbookBlend({ ...BOOK, loop: true }, 15.5)).toEqual({ offset: [0.75, 0], step: [-0.75, 0.75], mix: 0.5 });
    expect(flipbookBlend({ ...BOOK, loop: true }, 16.25).offset).toEqual([0, 0.75]);
  });
});

describe('loading the parts’ pictures and the hit’s flipbooks', () => {
  // the mecha hit's flipbooks (no way to decode pictures: the flipbooks alone are asked for)
  const mechaHit = { ...BASE_SKIN, style: { ...BASE_SKIN.style, hit: 'mecha' as const } };
  const manifest: MediaManifest = {
    version: 1,
    textures: {
      'mecha/hitBurst': parseMediaTexture({ file: 'styles/mecha/hit_burst.png', bundle: 'effects', size: [1024, 1024], flipbook: BOOK })!,
      'mecha/hitHold': parseMediaTexture({ file: 'styles/mecha/hit_hold.png', bundle: 'effects', size: [1024, 1024], flipbook: { ...BOOK, loop: true } })!,
    },
    effects: { reducedFlashOpacity: 0.45, reducedFlashScale: 0.8 },
  };

  it('leaves out what is missing, broken or the wrong size', async () => {
    const made: ReturnType<typeof fakeTexture>[] = [];
    const art = await loadSkinArt(mechaHit, {
      manifest: async () => manifest,
      texture: async (url) => {
        // the hold's flipbook comes back at the wrong size
        const t = url.endsWith('hit_hold.png') ? fakeTexture(512, 512) : fakeTexture(1024, 1024);
        made.push(t);
        return t;
      },
    });
    expect(Object.keys(art?.slots ?? {})).toEqual(['hitBurst']);
    expect(art?.slots.hitBurst?.texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(made.filter((t) => t.disposed)).toHaveLength(1);
    const missing = await loadSkinArt(mechaHit, {
      manifest: async () => manifest,
      texture: async (url) => {
        if (url.endsWith('hit_burst.png')) throw new Error('404');
        return fakeTexture(1024, 1024);
      },
    });
    expect(Object.keys(missing?.slots ?? {})).toEqual(['hitHold']);
  });

  it('gives nothing without a manifest, or when none of what the parts draw from loads', async () => {
    const texture = async () => fakeTexture(1024, 1024);
    expect(await loadSkinArt(mechaHit, { manifest: async () => null, texture })).toBeNull();
    expect(await loadSkinArt(mechaHit, { manifest: () => Promise.reject(new Error('offline')), texture })).toBeNull();
    // the flash's flipbooks are not in this manifest
    expect(await loadSkinArt(BASE_SKIN, { manifest: async () => manifest, texture })).toBeNull();
    const failing = { manifest: async () => manifest, texture: () => Promise.reject(new Error('broken')) };
    expect(await loadSkinArt(mechaHit, failing)).toBeNull();
  });

  it('loads the pictures and flipbooks of the style’s parts drawn from art, leaving out what is missing or the wrong size', async () => {
    const entry = (file: string, size: [number, number], extra = {}) => parseMediaTexture({ file, bundle: 'notes', size, ...extra })!;
    // a company's mark on the piano with the mecha hit: the coin's record and capsule (its long note), the mark's
    // material, the gear's picture and the hit's two flipbooks
    const media: MediaManifest = {
      ...manifest,
      textures: {
        'club/notes': entry('styles/club/notes.png', [1024, 1024]),
        'club/long': entry('styles/club/long.png', [512, 256]),
        'notes/gpt': entry('notes/gpt.png', [512, 512]),
        // pictures no part of this style draws from: never asked for
        'notes/flat': entry('notes/flat.png', [1024, 512]),
        'longs/solid': entry('longs/solid.png', [512, 256]),
        'piano/deck': entry('gears/piano/deck.webp', [2048, 541]),
        'mecha/hitBurst': entry('styles/mecha/hit_burst.png', [1024, 1024], { flipbook: BOOK, anchorY: 0.7 }),
        'mecha/hitHold': entry('styles/mecha/hit_hold.png', [1024, 1024], { flipbook: { ...BOOK, loop: true } }),
      },
    };
    const asked: string[] = [];
    const sources = {
      manifest: async () => media,
      texture: async () => fakeTexture(1024, 1024),
      image: async (url: string): Promise<ArtImage> => {
        asked.push(url.slice(url.search(/(styles|gears|notes|longs)\//)));
        if (url.endsWith('long.png')) throw new Error('404');
        // the mark's material comes back at the wrong size
        const [width, height] = url.endsWith('gpt.png') ? [256, 256] : Object.values(media.textures).find((t) => url.endsWith(t.file))!.size;
        return { width, height } as unknown as ArtImage;
      },
    };
    const skin = { ...BASE_SKIN, style: { ...BASE_SKIN.style, note: 'gpt' as const, side: 'bar' as const, deck: 'piano' as const, hit: 'mecha' as const } };
    const art = await loadSkinArt(skin, sources);
    expect(asked.sort()).toEqual(['gears/piano/deck.webp', 'notes/gpt.png', 'styles/club/long.png', 'styles/club/notes.png']);
    expect(Object.keys(art?.images ?? {}).sort()).toEqual(['club/notes', 'piano/deck']);
    expect(Object.keys(art?.slots ?? {}).sort()).toEqual(['hitBurst', 'hitHold']);
    expect(art?.slots.hitBurst?.spec.anchorY).toBe(0.7);
    // the side notes are drawn in code: nothing more is asked for them, as bars or as dots
    asked.length = 0;
    disposeSkinArt(await loadSkinArt({ ...skin, style: { ...skin.style, side: 'dots' as const } }, sources));
    expect(asked).toHaveLength(4);
    // no pictures without a way to decode them, and nothing for parts the manifest has none of
    expect(Object.keys((await loadSkinArt(skin, { ...sources, image: undefined }))?.images ?? {})).toEqual([]);
    expect(await loadSkinArt(BASE_SKIN, { ...sources, manifest: async () => manifest })).toBeNull();
    disposeSkinArt(art);
  });
});

describe('a flipbook\'s frames worked out into an object kept for it', () => {
  it('give what a new one would, for frames played once and looped', () => {
    const out: FlipbookBlend = { offset: [0, 0], step: [0, 0], mix: 0 };
    const uv: [number, number] = [0, 0];
    for (const book of [{ cols: 4, rows: 3, frames: 11, fps: 30, loop: false }, { cols: 5, rows: 2, frames: 10, fps: 24, loop: true }]) {
      for (const frame of [0, 0.4, 3.75, 9.5, 10.2, 14.9, -1]) {
        expect(flipbookBlendInto(book as never, frame, out)).toBe(out);
        expect(out).toEqual(flipbookBlend(book as never, frame));
        expect(flipbookOffsetInto(book as never, frame, uv)).toBe(uv);
        expect(uv).toEqual(flipbookOffset(book as never, frame));
      }
    }
  });
});
