import * as THREE from 'three';
import type { Skin } from './skins';
import { loadPacks, packOverrides, type PackList } from './customPacks';
import { styleImageIds, styleTextures, type ArtImage, type HitSlot, type StyleImages } from './styleArt';
import { BODY, type LayerSpec } from './layerFx';

/** A flipbook sheet: `frames` cells of a cols × rows grid, read row by row from the top left. */
export interface Flipbook {
  cols: number;
  rows: number;
  frames: number;
  fps: number;
  loop: boolean;
  /**
   * A hit's flipbook: the frame it starts at, the first about as bright as its brightest (measured from the sheet
   * when it is built: scripts/assets/flipbook_light.py). The frames before it, in which the effect swells, are not
   * played: the answer to a key is at its brightest in the first frame on the screen. 0 without it.
   */
  peak?: number;
}

/** One texture of client/public/media/manifest.json (written by scripts/assets/build_styles.py and build_gears.py). */
export interface MediaTexture {
  /** Path under /media/. */
  file: string;
  bundle: string;
  size: [number, number];
  flipbook?: Flipbook;
  /** Hit flipbooks: where the judgement line crosses a frame (0 = its bottom, 1 its top). */
  anchorY?: number;
  /** Hit flipbooks: how much larger a frame is than the effect drawn in it (room all round the whole effect). */
  span?: number;
  /**
   * Hit flipbooks: light in colours of its own, added to the screen as it is (the skins' hits, drawn frame by frame:
   * scripts/assets/build_skin_fx.py); without it the light is white and takes the lane's colour.
   */
  plain?: boolean;
  /** A hold flipbook with a core of its own: no frame of the burst glows under it. */
  cored?: boolean;
  /**
   * A hit flipbook in colours of its own: the colour of its light where it starts (flipbook_light.py), for the flash
   * drawn on the judge line with it (0xrrggbb).
   */
  tone?: number;
  /** A hit drawn from still layers moved on every frame (layerFx.ts), not from frames: its atlas and how it moves. */
  layers?: LayerSpec;
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

/** The loaded flipbooks of the hit picked, and the pictures the other parts picked draw from. Parts left out are drawn in code. */
export interface SkinArt {
  slots: Partial<Record<HitSlot, ArtTexture>>;
  /** By manifest id (render/styleArt.ts). */
  images: StyleImages;
  effects: MediaEffects;
  /** The parts drawn from the player's own packs (customPacks.ts): "note", "deck", "hit". */
  packed?: string[];
}

const DEFAULT_EFFECTS: MediaEffects = { reducedFlashOpacity: 0.45, reducedFlashScale: 0.8 };
const POSITIVE = ['span'] as const;

export function mediaUrl(file: string): string {
  return `${import.meta.env.BASE_URL}media/${file}`;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const count = (v: unknown, max: number): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= max;

const inRange = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** A manifest entry's `layers`, or null when it is malformed (layerFx.ts: an atlas of at least its six cells). */
function parseLayers(raw: unknown): LayerSpec | null {
  if (!isObject(raw) || !count(raw.cols, 4) || !count(raw.rows, 4) || raw.cols * raw.rows < BODY + 1) return null;
  const out: LayerSpec = { cols: raw.cols, rows: raw.rows };
  for (const key of ['light', 'core'] as const) {
    const curve = raw[key];
    if (curve === undefined) continue;
    if (!Array.isArray(curve) || curve.length < 2 || curve.length > 64 || !curve.every((v) => inRange(v, 0, 1.5))) return null;
    out[key] = [...curve];
  }
  if (raw.reach !== undefined) {
    if (!inRange(raw.reach, 0, 1.5)) return null;
    out.reach = raw.reach;
  }
  if (raw.grow !== undefined) {
    if (!inRange(raw.grow, 1, 2)) return null;
    out.grow = raw.grow;
  }
  if (raw.turn !== undefined) {
    if (!inRange(raw.turn, -6, 6)) return null;
    out.turn = raw.turn;
  }
  if (raw.axis === 'x') out.axis = 'x';
  if (raw.body === true) out.body = true;
  else if (raw.late === true) out.late = true;
  return out;
}

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
  if (raw.plain === true) out.plain = true;
  if (raw.cored === true) out.cored = true;
  // (a colour that is not one is left out: the flash is then white)
  if (typeof raw.tone === 'string' && /^#[0-9a-f]{6}$/i.test(raw.tone)) out.tone = Number.parseInt(raw.tone.slice(1), 16);
  if (raw.layers !== undefined) {
    const layers = parseLayers(raw.layers);
    if (!layers) return null;
    out.layers = layers;
  }
  if (raw.flipbook !== undefined) {
    const b = raw.flipbook;
    if (!isObject(b) || !count(b.cols, 16) || !count(b.rows, 16) || !count(b.frames, (b.cols as number) * (b.rows as number)) || !positive(b.fps)) return null;
    out.flipbook = { cols: b.cols, rows: b.rows, frames: b.frames, fps: b.fps, loop: b.loop === true };
    // a start past the sheet's last frame, or not a whole frame, is no start: the sheet plays from its first
    if (count(b.peak, b.frames - 1)) out.flipbook.peak = b.peak;
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

/**
 * Where a flipbook is between two of its frames at `frame` (a frame and a share of the way to the next): the
 * frame's UV offset, the step from it to the next frame's, and how much of the next shows (0..1). The sheets hold
 * 24 to 60 frames a second and the screen shows 60 to 240: drawn frame by frame an effect stands still for two
 * or three screen frames, then jumps; with each pair of frames mixed it moves on every one. A loop's last frame
 * is followed by its first; a sheet played once ends on its last frame.
 */
export function flipbookBlend(book: Flipbook, frame: number): { offset: [number, number]; step: [number, number]; mix: number } {
  const whole = Math.floor(frame);
  const wrap = (f: number) => (book.loop ? ((f % book.frames) + book.frames) % book.frames : Math.min(book.frames - 1, Math.max(0, f)));
  const from = wrap(whole);
  const to = wrap(whole + 1);
  const offset = flipbookOffset(book, from);
  const next = flipbookOffset(book, to);
  const mix = from === to ? 0 : Math.min(1, Math.max(0, frame - whole));
  return { offset, step: [next[0] - offset[0], next[1] - offset[1]], mix };
}

/** A hit's flipbook `ms` after the hit: its frame (with the share of the way to the next), from where it starts. */
export function hitFrame(book: Flipbook, ms: number): number {
  return (book.peak ?? 0) + (Math.max(0, ms) / 1000) * book.fps;
}

export interface ArtSources {
  manifest(): Promise<MediaManifest | null>;
  texture(url: string): Promise<THREE.Texture>;
  /** A picture decoded for drawing on a canvas (without it, none is loaded). */
  image?(url: string): Promise<ArtImage>;
  /** The player's own packs (customPacks.ts); without it, none. */
  packs?(): Promise<PackList>;
}

/**
 * A picture as its file holds it: no colour management (a tint picture's channels are amounts, not
 * colours), its alpha not multiplied in yet (the canvas it is drawn on does that).
 */
async function decodeImage(url: string): Promise<ArtImage> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const blob = await res.blob();
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const image = new Image();
  image.src = URL.createObjectURL(blob);
  try {
    await image.decode();
  } finally {
    URL.revokeObjectURL(image.src);
  }
  return image;
}

const BROWSER: ArtSources = {
  manifest: loadManifest,
  texture: (url) => new THREE.TextureLoader().loadAsync(url),
  image: decodeImage,
  packs: loadPacks,
};

/**
 * Loads the flipbooks of the hit picked and the pictures the other parts picked draw from
 * (styleArt.ts). Never throws: a missing manifest gives null, and a part whose entry is unknown or
 * whose file is missing, broken or not the size the manifest says is left out (the renderer draws it
 * in code).
 */
export async function loadSkinArt(skin: Skin, sources: ArtSources = BROWSER): Promise<SkinArt | null> {
  const style = skin.style;
  const wanted = Object.entries(styleTextures(style)) as [HitSlot, string][];
  const pictures = sources.image ? styleImageIds(style) : [];
  if (wanted.length === 0 && pictures.length === 0) return null;
  const media = await sources.manifest().catch(() => null);
  if (!media) return null;
  // the pictures of the player's own packs picked, in place of the game's own they stand in for (customPacks.ts)
  const packs = style.custom && sources.packs ? await sources.packs().catch(() => null) : null;
  const own = packs ? packOverrides(style, packs) : {};
  const source = (id: string): { url: string; spec: MediaTexture } | undefined => {
    if (Object.hasOwn(own, id)) return own[id];
    const spec = media.textures[id];
    return spec && { url: mediaUrl(spec.file), spec };
  };
  const slots: SkinArt['slots'] = {};
  const images: Record<string, ArtImage> = {};
  const fits = (image: { width?: number; height?: number }, size: [number, number]) => image.width === size[0] && image.height === size[1];
  await Promise.all([
    ...wanted.map(async ([slot, id]) => {
      const found = source(id);
      if (!found) return;
      const { spec } = found;
      try {
        const texture = await sources.texture(found.url);
        if (!fits(texture.image as { width?: number; height?: number }, spec.size)) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        slots[slot] = { texture, spec };
      } catch {
        // missing or broken file: this part keeps the drawn look
      }
    }),
    ...pictures.map(async (id) => {
      const found = source(id);
      if (!found || !sources.image) return;
      try {
        const image = await sources.image(found.url);
        if (fits(image, found.spec.size)) images[id] = image;
        else closeImage(image);
      } catch {
        // as a texture's: drawn in code
      }
    }),
  ]);
  // which parts the packs' pictures that loaded draw
  const fromPack = (id: string) => Object.hasOwn(own, id) && images[id] !== undefined;
  const packed = [
    ...(fromPack('notes/flat') ? ['note'] : []),
    ...(fromPack('standard/panel') ? ['deck'] : []),
    ...(Object.hasOwn(own, 'basic/hitBurst') && slots.hitBurst ? ['hit'] : []),
  ];
  return Object.keys(slots).length > 0 || Object.keys(images).length > 0 ? { slots, images, effects: media.effects, ...(packed.length ? { packed } : {}) } : null;
}

function closeImage(image: ArtImage): void {
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close();
}

export function disposeSkinArt(art: SkinArt | null | undefined): void {
  for (const a of Object.values(art?.slots ?? {})) a.texture.dispose();
  for (const image of Object.values(art?.images ?? {})) if (image) closeImage(image);
}
