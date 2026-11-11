import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseManifest } from './skinArt';
import { BASE_SKIN } from './skins';
import { styleTextures } from './styleArt';
import { HIT_STYLES } from './tintArt';

// The built game media (scripts/assets/build_styles.py and build_gears.py → client/public/media) against its manifest.
const MEDIA = fileURLToPath(new URL('../../public/media/', import.meta.url));
const raw = JSON.parse(readFileSync(join(MEDIA, 'manifest.json'), 'utf-8')) as { textures: Record<string, unknown> };
const manifest = parseManifest(raw)!;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isPowerOfTwo = (n: number) => n > 0 && (n & (n - 1)) === 0;

/** A picture's size from its header: a PNG's, or a WebP's (lossy, lossless or extended; the gears' decks are lossy). */
function imageSize(file: string): [number, number] {
  const head = readFileSync(file).subarray(0, 30);
  if (head.subarray(0, 8).equals(PNG)) return [head.readUInt32BE(16), head.readUInt32BE(20)];
  expect(head.toString('latin1', 0, 4) + head.toString('latin1', 8, 12), `${file} is a PNG or a WebP`).toBe('RIFFWEBP');
  const chunk = head.toString('latin1', 12, 16);
  if (chunk === 'VP8 ') return [head.readUInt16LE(26) & 0x3fff, head.readUInt16LE(28) & 0x3fff];
  if (chunk === 'VP8L') {
    const bits = head.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
  }
  expect(chunk, file).toBe('VP8X');
  return [head.readUIntLE(24, 3) + 1, head.readUIntLE(27, 3) + 1];
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)]));
}

describe('game media', () => {
  it('has a well-formed entry for every texture', () => {
    expect(Object.keys(manifest.textures).sort()).toEqual(Object.keys(raw.textures).sort());
    expect(Object.keys(manifest.textures).length).toBeGreaterThan(0);
  });

  it('has every file at the size the manifest gives, in powers of two up to 2048 (a gear’s pictures any size up to it)', () => {
    for (const [id, t] of Object.entries(manifest.textures)) {
      const [w, h] = imageSize(join(MEDIA, t.file));
      expect([w, h], id).toEqual(t.size);
      // a texture the GPU samples; a gear's picture is only drawn on the deck's canvas, at its own proportions
      const canvasOnly = t.file.startsWith('gears/');
      expect((canvasOnly || (isPowerOfTwo(w) && isPowerOfTwo(h))) && w <= 2048 && h <= 2048, `${id} ${w}×${h}`).toBe(true);
      if (t.flipbook) expect(w % t.flipbook.cols === 0 && h % t.flipbook.rows === 0, `${id} cells`).toBe(true);
    }
  });

  it('stays within the 30 MB budget and holds no file the manifest does not list', () => {
    const listed = new Set(Object.values(manifest.textures).map((t) => t.file));
    const files = filesUnder(MEDIA).map((f) => relative(MEDIA, f).split('\\').join('/'));
    expect(files.filter((f) => f !== 'manifest.json' && !listed.has(f))).toEqual([]);
    const bytes = files.reduce((sum, f) => sum + statSync(join(MEDIA, f)).size, 0);
    expect(bytes).toBeLessThan(30 * 1024 * 1024);
  });

  it('has the flipbooks of every hit effect a player picks', () => {
    // the skins' (PRISM's spectrum, SKY's puff of cloud, the default skin's FLASH) are drawn in code alone (tintArt.ts)
    const drawn: readonly string[] = ['prism', 'sky', 'fire', 'gpt', 'gemini', 'grok', 'claude', 'aqua', 'flash'];
    for (const hit of HIT_STYLES.filter((h) => drawn.includes(h))) expect(styleTextures({ ...BASE_SKIN.style, hit })).toEqual({});
    for (const hit of HIT_STYLES.filter((h) => !drawn.includes(h))) {
      const ids = Object.entries(styleTextures({ ...BASE_SKIN.style, hit }));
      expect(ids.map(([slot]) => slot), hit).toEqual(['hitBurst', 'hitHold']);
      for (const [slot, id] of ids) expect(manifest.textures[id]?.flipbook, `${hit}.${slot} = ${id}`).toBeDefined();
    }
  });
});
