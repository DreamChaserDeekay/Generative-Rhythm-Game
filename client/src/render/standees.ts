/**
 * A gear with a stage has figures standing at its two sides. Their pictures are the player's own:
 * picked on this PC and kept in its storage only (IndexedDB). The game comes with none, so neither
 * the repository nor the build holds such a picture.
 */
import type { GearStyle } from './deckArt';

/** How many figures stand by a gear; a gear not named here has no stage. */
export const STAGE_SLOTS: Partial<Record<GearStyle, number>> = { fire: 4 };

export interface StandeeFile {
  name: string;
  blob: Blob;
}

const DB_NAME = 'grg.standees.v1';
const STORE = 'pictures';
const listeners = new Set<() => void>();

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

/** One request on the store, its result (null where the storage cannot be used). */
async function store<T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result ?? null);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    });
  } finally {
    db.close();
  }
}

/**
 * The pictures picked for a gear's stage, in the order they stand (left to right across the screen):
 * by name, numbers in it counted as numbers ("2" before "10"), no more than the stage has places for.
 */
export function standeeOrder<T extends { name: string }>(files: readonly T[], slots: number): T[] {
  return [...files].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' })).slice(0, Math.max(0, slots));
}

/** The pictures kept for a gear's stage (none where it has no stage or nothing was picked). */
export async function readStandees(gear: GearStyle): Promise<StandeeFile[]> {
  if (!STAGE_SLOTS[gear]) return [];
  const kept = await store<StandeeFile[] | undefined>('readonly', (s) => s.get(gear) as IDBRequest<StandeeFile[] | undefined>);
  return Array.isArray(kept) ? kept.filter((f) => f && f.blob instanceof Blob) : [];
}

/** Keeps `files` as a gear's stage pictures in place of the ones it had (none: the stage is emptied). */
export async function writeStandees(gear: GearStyle, files: readonly StandeeFile[]): Promise<number> {
  const kept = standeeOrder(files, STAGE_SLOTS[gear] ?? 0).map((f) => ({ name: f.name, blob: f.blob }));
  if (kept.length > 0) await store('readwrite', (s) => s.put(kept, gear));
  else await store('readwrite', (s) => s.delete(gear));
  listeners.forEach((l) => l());
  return kept.length;
}

/** Called whenever a stage's pictures change (a renderer showing them loads them again). */
export function watchStandees(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The stage as the screen shows it (px): its size, and the gear's outer edges at two heights. */
export interface StageView {
  width: number;
  height: number;
  /** The judge line's height on the screen, and the gear's outer left and right edge there. */
  lineY: number;
  line: readonly [number, number];
  /** The gear's outer left and right edge at the screen's bottom. */
  bottom: readonly [number, number];
}

/** Where a figure stands on the screen (px from the top left), and whether it stands in front of its side's other one. */
export interface StandeeBox {
  x: number;
  y: number;
  w: number;
  h: number;
  front: boolean;
}

/**
 * How the pictures stand. Their feet are at the screen's bottom.
 * - Two on a side are figures: the one by the gear leans on it (at `HIP` of its height its inner side
 *   is on the gear's outer edge, so its legs go behind the gear, which is wider further down); the
 *   one beside it is a little taller (nearer the viewer) and covers `OVERLAP` of the inner one's width.
 * - One on a side fills the side: nearly as tall as the screen and `tuck` of its width behind the gear
 *   at its hip, so a wide picture (two figures cut out together, a piece of an illustration) shows
 *   what it has at its outer side and its top, and the gear hides its inner edge. A picture that
 *   should stand smaller or less far behind the gear leaves room clear round what it shows.
 * Each is no wider than its share (`wide`) of the side's room.
 */
const STANDS = {
  alone: { tall: 0.94, wide: 1.9, tuck: 0.3 },
  inner: { tall: 0.54, wide: 0.5, tuck: 0 },
  outer: { tall: 0.6, wide: 0.56, tuck: 0 },
} as const;
const HIP = 0.36;
const OVERLAP = 0.34;
/** A side with less room than this share of the screen's width has no figure. */
const MIN_ROOM = 0.08;

/**
 * Where the pictures stand: in their order across the screen (their `aspects`, width over height),
 * half of them at each side of the gear (the odd one at the left), close against it. A side's room is
 * from the screen's edge to the gear's outer edge; a picture too wide for its share of it is made
 * smaller, and a side with next to no room (a wide gear on a narrow window, a preview) has none: null.
 */
export function standeeBoxes(aspects: readonly number[], view: StageView): (StandeeBox | null)[] {
  const n = aspects.length;
  const left = Math.ceil(n / 2);
  // the gear's outer edge on a side (0 left, 1 right) at a height: a straight line on the screen
  const edgeAt = (side: 0 | 1, y: number) => {
    const span = view.height - view.lineY;
    const t = span > 0 ? (y - view.lineY) / span : 1;
    return view.line[side] + (view.bottom[side] - view.line[side]) * t;
  };
  const boxes: (StandeeBox | null)[] = aspects.map(() => null);
  for (const side of [0, 1] as const) {
    // across the screen the left side's pictures run outer, inner and the right side's inner, outer
    const own = side === 0 ? aspects.map((_, i) => i).slice(0, left) : aspects.map((_, i) => i).slice(left);
    const [innerAt, outerAt] = side === 0 ? [own[own.length - 1], own.length > 1 ? own[0] : undefined] : [own[0], own[1]];
    if (innerAt === undefined) continue;
    const out = side === 0 ? -1 : 1;
    const roomAt = (y: number) => (side === 0 ? edgeAt(side, y) : view.width - edgeAt(side, y));
    if (!(roomAt(view.height) >= view.width * MIN_ROOM)) continue;
    const sized = (aspect: number, stand: { tall: number; wide: number }) => {
      if (!(aspect > 0)) return null;
      let h = view.height * stand.tall;
      let w = h * aspect;
      const most = roomAt(view.height - h * HIP) * stand.wide;
      if (w > most) {
        h *= most / w;
        w = most;
      }
      return { w, h };
    };
    const stand = outerAt === undefined ? STANDS.alone : STANDS.inner;
    const inner = sized(aspects[innerAt], stand);
    if (!inner) continue;
    // the inner picture's side on the gear's edge at its hip, or that much of it behind the gear
    const lean = edgeAt(side, view.height - inner.h * HIP) - out * inner.w * stand.tuck;
    const innerX = side === 0 ? lean - inner.w : lean;
    boxes[innerAt] = { x: innerX, y: view.height - inner.h, w: inner.w, h: inner.h, front: false };
    const outer = outerAt === undefined ? null : sized(aspects[outerAt], STANDS.outer);
    if (!outer || outerAt === undefined) continue;
    // the outer one beside it, over a part of it
    const seam = (side === 0 ? innerX : innerX + inner.w) - out * inner.w * OVERLAP;
    boxes[outerAt] = { x: side === 0 ? seam - outer.w : seam, y: view.height - outer.h, w: outer.w, h: outer.h, front: true };
  }
  return boxes;
}

/** A figure's picture is drawn no taller than this (px). */
const STANDEE_PX = 1024;

/**
 * A picked picture made ready to stand: no taller than STANDEE_PX, its feet fading into the floor; one
 * with no see-through part (a photograph, not a cut-out) also fades at its top and its two sides, so
 * it stands as a soft-edged banner and not as a hard rectangle.
 */
export function standeeCanvas(picture: CanvasImageSource & { width: number; height: number }): HTMLCanvasElement {
  const k = Math.min(1, STANDEE_PX / picture.height);
  const [w, h] = [Math.max(1, Math.round(picture.width * k)), Math.max(1, Math.round(picture.height * k))];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  g.imageSmoothingQuality = 'high';
  g.drawImage(picture, 0, 0, w, h);
  const alphaAt = (x: number, y: number) => g.getImageData(Math.min(w - 1, Math.max(0, Math.round(x))), Math.min(h - 1, Math.max(0, Math.round(y))), 1, 1).data[3];
  const opaque = [[0, 0], [w - 1, 0], [w / 2, 0], [0, h / 2], [w - 1, h / 2]].every(([x, y]) => alphaAt(x, y) > 250);
  g.globalCompositeOperation = 'destination-out';
  const fade = (x0: number, y0: number, x1: number, y1: number, box: [number, number, number, number], most: number) => {
    const away = g.createLinearGradient(x0, y0, x1, y1);
    away.addColorStop(0, `rgba(0,0,0,${most})`);
    away.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = away;
    g.fillRect(...box);
  };
  if (opaque) {
    fade(0, 0, w * 0.16, 0, [0, 0, w * 0.16, h], 1);
    fade(w, 0, w * 0.84, 0, [w * 0.84, 0, w * 0.16, h], 1);
    fade(0, 0, 0, h * 0.12, [0, 0, w, h * 0.12], 1);
  }
  fade(0, h, 0, h * 0.93, [0, h * 0.93, w, h * 0.07], 0.9);
  g.globalCompositeOperation = 'source-over';
  return canvas;
}
