import type { CustomPart, SkinStyle } from './skins';
import { parseMediaTexture, type MediaTexture } from './skinArt';

/**
 * The player's own asset packs (docs/CUSTOM_ASSETS.md): folders of pictures in the data folder's skins/, built by the
 * server into the game's own layouts (server/rhythm_server/skins.py, GET /api/skins). A pack's pictures stand in for
 * the game's own of the part they go on (skins.ts: CUSTOM_BASE), in the same sizes: the default note and its long
 * note, the default gear's panel, the default flash's flipbooks. So they load as those do (skinArt.ts: loadSkinArt)
 * and the renderer draws them as those, with no texture or draw call of their own.
 */

/** A part of a pack: built, or why it cannot be used (Korean, for the settings), or not in the pack. */
export interface PackPart {
  status: 'ok' | 'error' | 'missing';
  message: string;
  warnings: string[];
  textures: Record<string, Record<string, unknown> & { version?: string }>;
}

export interface Pack {
  /** The pack's folder name. */
  id: string;
  name: string;
  author: string;
  /** What is wrong with the pack as a whole (its pack.json). */
  problems: string[];
  parts: Partial<Record<'note' | 'panel' | 'hit', PackPart>>;
}

export interface PackList {
  /** Where the packs are (the server's path, shown where the folder cannot be opened). */
  folder: string;
  packs: Pack[];
}

/** The pack's part that a setting's part draws from. */
export const PACK_PART: Record<CustomPart, 'note' | 'panel' | 'hit'> = { note: 'note', deck: 'panel', hit: 'hit' };

/** The game's pictures (manifest ids) each built picture of a pack stands in for. */
const STANDS_FOR: Record<string, string> = {
  note: 'notes/flat',
  long: 'longs/solid',
  panel: 'standard/panel',
  hitBurst: 'basic/hitBurst',
  hitHold: 'basic/hitHold',
};
/** The built files (skins.py: FILES). */
const FILES: Record<string, string> = { note: 'note.png', long: 'long.png', panel: 'panel.webp', hitBurst: 'hit_burst.webp', hitHold: 'hit_hold.webp' };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

function parsePart(raw: unknown): PackPart | undefined {
  if (!isObject(raw)) return undefined;
  const status = raw.status === 'ok' || raw.status === 'error' ? raw.status : 'missing';
  return {
    status,
    message: typeof raw.message === 'string' ? raw.message : '',
    warnings: strings(raw.warnings),
    textures: isObject(raw.textures) ? (raw.textures as PackPart['textures']) : {},
  };
}

/** The server's list of packs; what is not of its shape is left out. */
export function parsePackList(raw: unknown): PackList {
  const r = isObject(raw) ? raw : {};
  const packs: Pack[] = [];
  for (const p of Array.isArray(r.packs) ? r.packs : []) {
    if (!isObject(p) || typeof p.id !== 'string') continue;
    const parts = isObject(p.parts) ? p.parts : {};
    packs.push({
      id: p.id,
      name: typeof p.name === 'string' && p.name ? p.name : p.id,
      author: typeof p.author === 'string' ? p.author : '',
      problems: strings(p.problems),
      parts: { note: parsePart(parts.note), panel: parsePart(parts.panel), hit: parsePart(parts.hit) },
    });
  }
  return { folder: typeof r.folder === 'string' ? r.folder : '', packs };
}

let list: Promise<PackList> | null = null;

/** The packs, asked of the server once (again after reloadPacks); none where the server cannot be asked. */
export function loadPacks(): Promise<PackList> {
  list ??= fetch('/api/skins', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then(parsePackList)
    .catch(() => ({ folder: '', packs: [] }));
  return list;
}

/** Asks the server again (설정's 다시 읽기: a pack put in or changed since). */
export function reloadPacks(): Promise<PackList> {
  list = null;
  return loadPacks();
}

/** A pack's part that can be drawn: built with no error. */
export function usablePart(pack: Pack | undefined, part: CustomPart): PackPart | undefined {
  const p = pack?.parts[PACK_PART[part]];
  return p?.status === 'ok' ? p : undefined;
}

/** A built picture of a pack: where it is served, and its manifest entry (its file the game's own it stands for). */
export interface PackTexture {
  url: string;
  spec: MediaTexture;
}

/**
 * The pictures of the packs a style picked that stand in for the game's own, by the game's manifest id: none for a
 * part whose pack is not in the list or cannot be used (that part draws the game's own).
 */
export function packOverrides(style: SkinStyle, packs: PackList): Record<string, PackTexture> {
  const out: Record<string, PackTexture> = {};
  for (const [part, name] of Object.entries(style.custom ?? {}) as [CustomPart, string][]) {
    const built = usablePart(
      packs.packs.find((p) => p.id === name),
      part,
    );
    if (!built) continue;
    for (const [key, entry] of Object.entries(built.textures)) {
      const id = STANDS_FOR[key];
      if (!id || !FILES[key]) continue;
      // checked as a manifest entry is: its numbers (sizes, flipbook) in range
      const spec = parseMediaTexture({ ...entry, file: FILES[key], bundle: 'pack' });
      if (!spec) continue;
      const version = typeof entry.version === 'string' ? `?v=${encodeURIComponent(entry.version)}` : '';
      out[id] = { url: `/api/skins/${encodeURIComponent(name)}/files/${FILES[key]}${version}`, spec };
    }
  }
  return out;
}

/** The prompts' layout templates (GET /api/skins/templates/<kind>.png). */
export const templateUrl = (kind: 'panel' | 'note'): string => `/api/skins/templates/${kind}.png`;
