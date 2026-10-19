import * as THREE from 'three';
import type { Skin, TextureSlot } from './skins';

/** A flipbook sheet: `frames` cells of a cols × rows grid, read row by row from the top left. */
export interface Flipbook {
  cols: number;
  rows: number;
  frames: number;
  fps: number;
  loop: boolean;
}

/** One texture of client/public/media/manifest.json (written by scripts/assets/build_p0.py). */
export interface MediaTexture {
  /** Path under /media/. */
  file: string;
  bundle: string;
  size: [number, number];
  /** Long note body and rails: one repeat is (drawn width × tileAspect) long. */
  tileAspect?: number;
  /** Judgement line: depth of its quad on the track. */
  depth?: number;
  /** Rails: width on the track. */
  width?: number;
  /** Floor: track length of one repeat, and the gain (sRGB) that brings the tile's mean back to 1. */
  tile?: number;
  gain?: number;
  flipbook?: Flipbook;
  /** Hit effects: sprite size per lane width; hold sparks: height of the judgement line on the sprite (0 = bottom). */
  scale?: number;
  anchorY?: number;
}

/** "Reduce flashing" for the textured hit effects. */
export interface MediaEffects {
  reducedFlashOpacity: number;
  reducedFlashScale: number;
}

export interface MediaManifest {
  version: number;
  textures: Record<string, MediaTexture>;
  effects: MediaEffects;
}

export interface ArtTexture {
  texture: THREE.Texture;
  spec: MediaTexture;
}

/** The loaded textures of a skin. Parts left out are drawn in code. */
export interface SkinArt {
  slots: Partial<Record<TextureSlot, ArtTexture>>;
  effects: MediaEffects;
}

const DEFAULT_EFFECTS: MediaEffects = { reducedFlashOpacity: 0.45, reducedFlashScale: 0.8 };
const POSITIVE = ['tileAspect', 'depth', 'width', 'tile', 'gain', 'scale'] as const;

export function mediaUrl(file: string): string {
  return `${import.meta.env.BASE_URL}media/${file}`;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const count = (v: unknown, max: number): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= max;

/** A manifest texture entry, or null when it is malformed (bad path, size or numbers). */
export function parseMediaTexture(raw: unknown): MediaTexture | null {
  if (!isObject(raw)) return null;
  const { file, bundle, size } = raw;
  // a plain relative path under /media/
  if (typeof file !== 'string' || !/^[A-Za-z0-9_\-/]+\.(png|webp)$/.test(file) || file.includes('//') || file.startsWith('/')) return null;
  if (!Array.isArray(size) || size.length !== 2 || !size.every((n) => count(n, 2048))) return null;
  const out: MediaTexture = { file, bundle: typeof bundle === 'string' ? bundle : '', size: [size[0], size[1]] };
  for (const key of POSITIVE) {
    if (raw[key] === undefined) continue;
    if (!positive(raw[key])) return null;
    out[key] = raw[key];
  }
  if (raw.anchorY !== undefined) {
    if (typeof raw.anchorY !== 'number' || !(raw.anchorY >= 0 && raw.anchorY <= 1)) return null;
    out.anchorY = raw.anchorY;
  }
  if (raw.flipbook !== undefined) {
    const b = raw.flipbook;
    if (!isObject(b) || !count(b.cols, 16) || !count(b.rows, 16) || !count(b.frames, (b.cols as number) * (b.rows as number)) || !positive(b.fps)) return null;
    out.flipbook = { cols: b.cols, rows: b.rows, frames: b.frames, fps: b.fps, loop: b.loop === true };
  }
  return out;
}

/** The manifest with its malformed entries dropped, or null when it is not a manifest at all. */
export function parseManifest(raw: unknown): MediaManifest | null {
  if (!isObject(raw) || !isObject(raw.textures)) return null;
  const textures: Record<string, MediaTexture> = {};
  for (const [id, entry] of Object.entries(raw.textures)) {
    const t = parseMediaTexture(entry);
    if (t) textures[id] = t;
  }
  const e = isObject(raw.effects) ? raw.effects : {};
  const effects = {
    reducedFlashOpacity: positive(e.reducedFlashOpacity) ? e.reducedFlashOpacity : DEFAULT_EFFECTS.reducedFlashOpacity,
    reducedFlashScale: positive(e.reducedFlashScale) ? e.reducedFlashScale : DEFAULT_EFFECTS.reducedFlashScale,
  };
  return { version: typeof raw.version === 'number' ? raw.version : 0, textures, effects };
}

let manifest: Promise<MediaManifest | null> | null = null;

/** The media manifest, fetched once; null when it is missing or unreadable. */
export function loadManifest(): Promise<MediaManifest | null> {
  manifest ??= fetch(mediaUrl('manifest.json'))
    .then((res) => (res.ok ? res.json() : null))
    .then(parseManifest)
    .catch(() => null);
  return manifest;
}

/** UV offset of a flipbook frame (the texture's repeat is 1/cols × 1/rows; images load with flipY). */
export function flipbookOffset(book: Flipbook, frame: number): [number, number] {
  const f = Math.min(book.frames - 1, Math.max(0, Math.floor(frame)));
  return [(f % book.cols) / book.cols, 1 - (Math.floor(f / book.cols) + 1) / book.rows];
}

export interface ArtSources {
  manifest(): Promise<MediaManifest | null>;
  texture(url: string): Promise<THREE.Texture>;
}

const BROWSER: ArtSources = {
  manifest: loadManifest,
  texture: (url) => new THREE.TextureLoader().loadAsync(url),
};

/**
 * Loads the textures a skin names. Never throws: a missing manifest gives null, and a part whose
 * entry is unknown or whose file is missing, broken or not the size the manifest says is left out
 * (the renderer draws it in code).
 */
export async function loadSkinArt(skin: Skin, sources: ArtSources = BROWSER): Promise<SkinArt | null> {
  const wanted = Object.entries(skin.textures ?? {}) as [TextureSlot, string][];
  if (wanted.length === 0) return null;
  const media = await sources.manifest().catch(() => null);
  if (!media) return null;
  const slots: SkinArt['slots'] = {};
  await Promise.all(
    wanted.map(async ([slot, id]) => {
      const spec = media.textures[id];
      if (!spec) return;
      try {
        const texture = await sources.texture(mediaUrl(spec.file));
        const image = texture.image as { width?: number; height?: number };
        if (image.width !== spec.size[0] || image.height !== spec.size[1]) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        slots[slot] = { texture, spec };
      } catch {
        // missing or broken file: this part keeps the drawn look
      }
    }),
  );
  return Object.keys(slots).length > 0 ? { slots, effects: media.effects } : null;
}

export function disposeSkinArt(art: SkinArt | null | undefined): void {
  for (const a of Object.values(art?.slots ?? {})) a.texture.dispose();
}
