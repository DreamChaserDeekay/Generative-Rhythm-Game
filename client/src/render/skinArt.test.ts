import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { flipbookOffset, loadSkinArt, parseManifest, parseMediaTexture, type MediaManifest } from './skinArt';
import { skinById } from './skins';

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
    const burst = { file: 'fx/hit_burst_ring.png', bundle: 'effects', size: [1024, 1024], flipbook: BOOK, scale: 1.7 };
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
    const art = await loadSkinArt(skinById('glass', null), {
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
    expect(await loadSkinArt(skinById('glass', null), { manifest: async () => null, texture })).toBeNull();
    expect(await loadSkinArt(skinById('glass', null), { manifest: () => Promise.reject(new Error('offline')), texture })).toBeNull();
    expect(await loadSkinArt(skinById('neon', null), { manifest: async () => manifest, texture })).toBeNull();
    const failing = { manifest: async () => manifest, texture: () => Promise.reject(new Error('broken')) };
    expect(await loadSkinArt(skinById('glass', null), failing)).toBeNull();
  });
});
