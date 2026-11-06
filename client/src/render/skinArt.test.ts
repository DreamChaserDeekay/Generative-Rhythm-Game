import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { disposeSkinArt, flipbookOffset, loadSkinArt, parseManifest, parseMediaTexture, type MediaManifest } from './skinArt';
import type { ArtImage } from './styleArt';
import { BASE_SKIN } from './skins';

const NOTE = { file: 'skins/glass/note_tap.png', bundle: 'notes', size: [256, 64] };
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
    const burst = { file: 'fx/hit_burst_ring.png', bundle: 'effects', size: [1024, 1024], flipbook: BOOK, scale: 1.7, anchorY: 0.5, span: 1.375 };
    expect(parseMediaTexture(burst)).toEqual(burst);
    expect(parseMediaTexture({ ...burst, flipbook: { ...BOOK, loop: 'yes' } })?.flipbook?.loop).toBe(false);
  });

  it('rejects paths that leave /media/, odd sizes and bad numbers', () => {
    for (const file of ['../secret.png', '/abs.png', 'http://x/y.png', 'a//b.png', 'note.svg', 'a b.png', 42]) {
      expect(parseMediaTexture({ ...NOTE, file })).toBeNull();
    }
    for (const size of [[256], [256, 0], [256.5, 64], [4096, 64], '256x64']) expect(parseMediaTexture({ ...NOTE, size })).toBeNull();
    expect(parseMediaTexture({ ...NOTE, tileAspect: -1 })).toBeNull();
    expect(parseMediaTexture({ ...NOTE, gain: Number.NaN })).toBeNull();
    expect(parseMediaTexture({ ...NOTE, anchorY: 1.5 })).toBeNull();
    expect(parseMediaTexture({ ...NOTE, span: 0 })).toBeNull();
    expect(parseMediaTexture({ ...NOTE, flipbook: { ...BOOK, frames: 17 } })).toBeNull();
    expect(parseMediaTexture({ ...NOTE, flipbook: { ...BOOK, fps: 0 } })).toBeNull();
    expect(parseMediaTexture(null)).toBeNull();
  });

  it('drops malformed entries and fills in the effect defaults', () => {
    const m = parseManifest({ version: 1, textures: { 'glass/note': NOTE, 'glass/bad': { ...NOTE, file: '../x.png' } } });
    expect(Object.keys(m?.textures ?? {})).toEqual(['glass/note']);
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
});

describe('loading skin textures', () => {
  // a skin on the glass set's textures, slot by slot (the track's own is drawn in code)
  const glass = { ...BASE_SKIN, textures: { note: 'glass/note', floor: 'glass/floor', rails: 'glass/rails', judgeLine: 'glass/judgeLine' } };
  const manifest: MediaManifest = {
    version: 1,
    textures: {
      'glass/note': parseMediaTexture(NOTE)!,
      'glass/floor': parseMediaTexture({ file: 'skins/glass/floor.png', bundle: 'gear', size: [512, 512], tile: 2.4, gain: 2 })!,
      'glass/rails': parseMediaTexture({ file: 'skins/glass/rail.png', bundle: 'gear', size: [64, 1024], width: 0.26 })!,
      'glass/judgeLine': parseMediaTexture({ file: 'skins/glass/judge_line.png', bundle: 'gear', size: [1024, 64] })!,
    },
    effects: { reducedFlashOpacity: 0.45, reducedFlashScale: 0.8 },
  };

  it('leaves out what is missing, broken or the wrong size', async () => {
    const made: ReturnType<typeof fakeTexture>[] = [];
    const art = await loadSkinArt(glass, {
      manifest: async () => manifest,
      texture: async (url) => {
        if (url.endsWith('rail.png')) throw new Error('404');
        // the judgement line comes back at the wrong size
        const t = url.endsWith('judge_line.png') ? fakeTexture(512, 64) : url.endsWith('floor.png') ? fakeTexture(512, 512) : fakeTexture(256, 64);
        made.push(t);
        return t;
      },
    });
    expect(Object.keys(art?.slots ?? {}).sort()).toEqual(['floor', 'note']);
    expect(art?.slots.note?.texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(made.filter((t) => t.disposed)).toHaveLength(1);
  });

  it('gives nothing without a manifest or for a skin drawn in code', async () => {
    const texture = async () => fakeTexture(256, 64);
    expect(await loadSkinArt(glass, { manifest: async () => null, texture })).toBeNull();
    expect(await loadSkinArt(glass, { manifest: () => Promise.reject(new Error('offline')), texture })).toBeNull();
    expect(await loadSkinArt(BASE_SKIN, { manifest: async () => manifest, texture })).toBeNull();
    const failing = { manifest: async () => manifest, texture: () => Promise.reject(new Error('broken')) };
    expect(await loadSkinArt(glass, failing)).toBeNull();
  });

  it('loads the pictures and flipbooks of the style’s parts drawn from art, leaving out what is missing or the wrong size', async () => {
    const entry = (file: string, size: [number, number], extra = {}) => parseMediaTexture({ file, bundle: 'notes', size, ...extra })!;
    const mecha: MediaManifest = {
      ...manifest,
      textures: {
        'mecha/notes': entry('styles/mecha/notes.png', [1024, 1024]),
        'mecha/long': entry('styles/mecha/long.png', [512, 256]),
        'mecha/side': entry('styles/mecha/side.png', [1024, 512]),
        'cabinet/abs': entry('gears/cabinet/abs.webp', [512, 512]),
        'cabinet/joystick': entry('gears/cabinet/joystick.png', [512, 512]),
        'cabinet/button': entry('gears/cabinet/button.png', [384, 384]),
        'cabinet/coin': entry('gears/cabinet/coin.png', [558, 384]),
        'mecha/hitBurst': entry('styles/mecha/hit_burst.png', [1024, 1024], { flipbook: BOOK, anchorY: 0.7 }),
        'mecha/hitHold': entry('styles/mecha/hit_hold.png', [1024, 1024], { flipbook: { ...BOOK, loop: true } }),
      },
    };
    const asked: string[] = [];
    const sources = {
      manifest: async () => mecha,
      texture: async () => fakeTexture(1024, 1024),
      image: async (url: string): Promise<ArtImage> => {
        asked.push(url.slice(url.search(/(styles|gears)\//)));
        if (url.endsWith('long.png')) throw new Error('404');
        // the side notes' picture comes back at the wrong size
        const [width, height] = url.endsWith('side.png') ? [512, 512] : Object.values(mecha.textures).find((t) => url.endsWith(t.file))!.size;
        return { width, height } as unknown as ArtImage;
      },
    };
    const mechaSkin = { ...BASE_SKIN, style: { ...BASE_SKIN.style!, note: 'chamfer' as const, side: 'bar' as const, deck: 'cabinet' as const, hit: 'mecha' as const } };
    const art = await loadSkinArt(mechaSkin, sources);
    expect(asked.sort()).toEqual(['gears/cabinet/abs.webp', 'gears/cabinet/button.png', 'gears/cabinet/coin.png', 'gears/cabinet/joystick.png', 'styles/mecha/long.png', 'styles/mecha/notes.png', 'styles/mecha/side.png']);
    expect(Object.keys(art?.images ?? {}).sort()).toEqual(['cabinet/abs', 'cabinet/button', 'cabinet/coin', 'cabinet/joystick', 'mecha/notes']);
    expect(Object.keys(art?.slots ?? {}).sort()).toEqual(['hitBurst', 'hitHold']);
    expect(art?.slots.hitBurst?.spec.anchorY).toBe(0.7);
    // nothing to draw from art without a way to decode pictures, or for a skin drawn in code
    expect(Object.keys((await loadSkinArt(mechaSkin, { ...sources, image: undefined }))?.images ?? {})).toEqual([]);
    expect(await loadSkinArt(BASE_SKIN, sources)).toBeNull();
    disposeSkinArt(art);
  });
});
