import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseManifest } from './skinArt';
import { BUILTIN_SKINS } from './skins';

// The built game media (scripts/assets/build_p0.py → client/public/media) against its manifest.
const MEDIA = fileURLToPath(new URL('../../public/media/', import.meta.url));
const raw = JSON.parse(readFileSync(join(MEDIA, 'manifest.json'), 'utf-8')) as { textures: Record<string, unknown> };
const manifest = parseManifest(raw)!;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isPowerOfTwo = (n: number) => n > 0 && (n & (n - 1)) === 0;

function pngSize(file: string): [number, number] {
  const head = readFileSync(file).subarray(0, 24);
  expect(head.subarray(0, 8).equals(PNG), `${file} is a PNG`).toBe(true);
  return [head.readUInt32BE(16), head.readUInt32BE(20)];
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)]));
}

describe('game media', () => {
  it('has a well-formed entry for every texture', () => {
    expect(Object.keys(manifest.textures).sort()).toEqual(Object.keys(raw.textures).sort());
    expect(Object.keys(manifest.textures).length).toBeGreaterThan(0);
  });

  it('has every file at the size the manifest gives, in powers of two up to 2048', () => {
    for (const [id, t] of Object.entries(manifest.textures)) {
      const [w, h] = pngSize(join(MEDIA, t.file));
      expect([w, h], id).toEqual(t.size);
      expect(isPowerOfTwo(w) && isPowerOfTwo(h) && w <= 2048 && h <= 2048, `${id} ${w}×${h}`).toBe(true);
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

  it('has every texture the built-in skins use', () => {
    for (const skin of BUILTIN_SKINS) {
      for (const [slot, id] of Object.entries(skin.textures ?? {})) expect(manifest.textures[id], `${skin.id}.${slot} = ${id}`).toBeDefined();
    }
    for (const id of ['fx/hitBurstRing', 'fx/hitBurstGlow', 'fx/hitHold']) expect(manifest.textures[id].flipbook, id).toBeDefined();
  });
});
