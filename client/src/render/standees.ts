/**
 * A gear with a stage has pictures by it: figures at its two sides, or two stickers over its near
 * corners, and (the AI companies' gears) a mark their skins' notes are cut in. The pictures are a
 * build's own: the files of `stage/` beside the app (client/public/stage), each gear's in a folder of
 * its name and listed in `stage/index.json`. Whose pictures they are is written beside the licences
 * (client/public/licenses/STAGE-PICTURES.md). A build without them plays the same with empty sides and
 * coins for notes.
 */
import { BRAND_GEARS, type GearStyle } from './deckArt';
import { context2d, paintCanvas, type PaintCanvas } from './paintCanvas';

/**
 * What stands by a gear: 'figures' tall beside it and behind it (파이어스타터: up to four, or one piece
 * of an illustration a side), or two 'stickers' at its foot, one a side, laid over its two near corners
 * in front of it (the AI companies' gears: the company's two stickers). `note`: the gear's skin also
 * takes one picture as its notes' mark.
 */
export type StageKind = 'figures' | 'stickers';
export interface Stage {
  slots: number;
  kind: StageKind;
  note?: boolean;
}

/** The gears with a stage; a gear not named here has none. */
export const STAGES: Partial<Record<GearStyle, Stage>> = {
  fire: { slots: 4, kind: 'figures' },
  ...Object.fromEntries(BRAND_GEARS.map((gear) => [gear, { slots: 2, kind: 'stickers', note: true } satisfies Stage])),
};

/** How many pictures stand by a gear; a gear not named here has no stage. */
export const STAGE_SLOTS: Partial<Record<GearStyle, number>> = Object.fromEntries(Object.entries(STAGES).map(([gear, stage]) => [gear, stage.slots]));

/** A file is the notes' mark, not a picture for the gear's side, when its name says so: "note" or "logo" as a word of it. */
export function isNotePicture(name: string): boolean {
  return /(^|[^a-z])(note|logo)([^a-z]|$)/i.test(name.replace(/\.[^.]*$/, ''));
}

export interface StandeeFile {
  name: string;
  blob: Blob;
}

/**
 * A stage's pictures in the order they stand (left to right across the screen): by name, numbers in
 * it counted as numbers ("2" before "10"), no more than the stage has places for.
 */
export function standeeOrder<T extends { name: string }>(files: readonly T[], slots: number): T[] {
  return [...files].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' })).slice(0, Math.max(0, slots));
}

/** What of `files` a gear takes: its side pictures in their order, no more than it has places for, and after them its notes' mark where its skin takes one (the first so named). */
export function keptFor<T extends { name: string }>(gear: GearStyle, files: readonly T[]): T[] {
  const stage = STAGES[gear];
  if (!stage) return [];
  const marks = stage.note ? standeeOrder(files.filter((f) => isNotePicture(f.name)), 1) : [];
  const sides = standeeOrder(files.filter((f) => !(stage.note && isNotePicture(f.name))), stage.slots);
  return [...sides, ...marks];
}

/** Where the build's pictures are: `stage/index.json` beside the app names each gear's files, themselves in `stage/<gear>/`. */
const stageUrl = (path: string) => `${import.meta.env.BASE_URL}stage/${path}`;

/**
 * What `stage/index.json` lists, read with care: each gear with a stage and its files' plain names
 * (PNG, WebP or JPEG, no folders); anything else in it is left out.
 */
export function shippedNames(raw: unknown): Partial<Record<GearStyle, string[]>> {
  const out: Partial<Record<GearStyle, string[]>> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [gear, names] of Object.entries(raw)) {
    if (!(gear in STAGES) || !Array.isArray(names)) continue;
    const plain = names.filter((n): n is string => typeof n === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]*\.(png|webp|jpe?g)$/i.test(n) && !n.includes('..'));
    if (plain.length > 0) out[gear as GearStyle] = plain;
  }
  return out;
}

let shippedIndex: Promise<Partial<Record<GearStyle, string[]>>> | null = null;
const shippedFiles = new Map<GearStyle, Promise<StandeeFile[]>>();

/** A gear's pictures as the build has them: its side pictures, then its notes' mark (none where the build has none, or they cannot be read). Read once. */
function stagePictures(gear: GearStyle): Promise<StandeeFile[]> {
  let files = shippedFiles.get(gear);
  if (!files) {
    files = (async () => {
      try {
        if (!STAGES[gear] || typeof fetch === 'undefined' || typeof window === 'undefined') return [];
        shippedIndex ??= fetch(stageUrl('index.json')).then(async (r) => (r.ok ? shippedNames(await r.json()) : {}));
        const names = (await shippedIndex)[gear] ?? [];
        const read = await Promise.all(
          names.map(async (name) => {
            const r = await fetch(stageUrl(`${gear}/${name}`));
            return r.ok ? { name, blob: await r.blob() } : null;
          }),
        );
        return keptFor(gear, read.filter((f): f is StandeeFile => f !== null));
      } catch {
        return [];
      }
    })();
    shippedFiles.set(gear, files);
  }
  return files;
}

/** The pictures at a gear's sides, in the order they stand (none where it has no stage, or the build has none for it). */
export async function readStandees(gear: GearStyle): Promise<StandeeFile[]> {
  const stage = STAGES[gear];
  if (!stage) return [];
  return (await stagePictures(gear)).filter((f) => !(stage.note && isNotePicture(f.name)));
}

/** The mark a gear's skin's notes are cut in (null: its skin takes none, or the build has none for it). */
export async function readNotePicture(gear: GearStyle): Promise<StandeeFile | null> {
  if (!STAGES[gear]?.note) return null;
  return (await stagePictures(gear)).find((f) => isNotePicture(f.name)) ?? null;
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

/** Where a figure stands on the screen (px from the top left), and whether it stands in front of its side's other one (a sticker: in front of the gear). */
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
 * - A sticker (a stage of 'stickers': one a side) sits at the gear's foot, a third of the screen tall
 *   at most, in FRONT of the gear and over its near corner: STICKER_FRONT of its width over the gear
 *   at its hip (the user: the gear's foot may be hidden, the stickers closer in). What of it stands
 *   as high as the judge line stays outside the gear, so the line and the lanes over it are never
 *   hidden: it is moved in no further than its own outline allows (StickerShape). The one at the right
 *   stays under the judge line altogether: the gauge's value is written beside the gear just over it,
 *   and a sticker under those letters would hide them.
 * Each is no wider than its share (`wide`) of the side's room.
 */
const STANDS = {
  sticker: { tall: 0.32, wide: 1.3, tuck: 0 },
  alone: { tall: 0.94, wide: 1.9, tuck: 0.3 },
  inner: { tall: 0.54, wide: 0.5, tuck: 0 },
  outer: { tall: 0.6, wide: 0.56, tuck: 0 },
} as const;
const HIP = 0.36;
/** How far under the judge line the right sticker's top stays, and what of a sticker stands higher than this under the line stays outside the gear (share of the screen's height). */
const STICKER_CLEAR = 0.008;
/** How much of a sticker's width lies over the gear at its hip. */
const STICKER_FRONT = 0.3;
/** The room left between the gear and what of a sticker stands beside the judge line (share of the screen's width). */
const STICKER_GAP = 0.003;

/**
 * A sticker's outline: in each of its bands from top to bottom, where it begins and ends across (shares
 * of its picture's width); NaN where the band is empty. Without one a sticker is taken for its whole box.
 */
export interface StickerShape {
  left: number[];
  right: number[];
}
const OVERLAP = 0.34;
/** A side with less room than this share of the screen's width has no figure. */
const MIN_ROOM = 0.08;

/**
 * Where the pictures stand: in their order across the screen (their `aspects`, width over height),
 * half of them at each side of the gear (the odd one at the left), close against it. A side's room is
 * from the screen's edge to the gear's outer edge; a picture too wide for its share of it is made
 * smaller, and a side with next to no room (a wide gear on a narrow window, a preview) has none: null.
 */
export function standeeBoxes(aspects: readonly number[], view: StageView, kind: StageKind = 'figures', shapes: readonly (StickerShape | undefined)[] = []): (StandeeBox | null)[] {
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
      if (kind === 'stickers' && side === 1) h = Math.min(h, Math.max(0, view.height - view.lineY - view.height * STICKER_CLEAR));
      let w = h * aspect;
      const most = roomAt(view.height - h * HIP) * stand.wide;
      if (w > most) {
        h *= most / w;
        w = most;
      }
      return { w, h };
    };
    const stand = kind === 'stickers' ? STANDS.sticker : outerAt === undefined ? STANDS.alone : STANDS.inner;
    const inner = sized(aspects[innerAt], stand);
    if (!inner) continue;
    // the inner picture's side on the gear's edge at its hip, or that much of it behind the gear
    if (kind === 'stickers') {
      // over the gear's near corner; what of it stands beside the judge line or higher, outside the gear
      const top = view.height - inner.h;
      let x = edgeAt(side, view.height - inner.h * HIP) - (side === 0 ? inner.w * (1 - STICKER_FRONT) : inner.w * STICKER_FRONT);
      const shape = shapes[innerAt];
      const bands = shape?.left.length ?? 24;
      const gap = view.width * STICKER_GAP;
      for (let k = 0; k < bands; k++) {
        const y = top + ((k + 0.5) / bands) * inner.h;
        if (y >= view.lineY + view.height * STICKER_CLEAR) break;
        const [from, to] = shape ? [shape.left[k], shape.right[k]] : [0, 1];
        if (!(to > from)) continue;
        x = side === 0 ? Math.min(x, edgeAt(0, y) - gap - to * inner.w) : Math.max(x, edgeAt(1, y) + gap - from * inner.w);
      }
      boxes[innerAt] = { x, y: top, w: inner.w, h: inner.h, front: true };
      continue;
    }
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
/** A sticker's (it stands a third of the screen tall at most). */
const STICKER_PX = 640;

/**
 * A picture made a sticker: its own outline (a picture with no see-through part: a square with
 * round corners) with a white rim round it as a die-cut sticker has, and a soft shadow under it. Room
 * for the rim is left at its top and its two sides; none at its foot, which stands on the screen's
 * bottom edge.
 */
export function stickerCanvas(picture: CanvasImageSource & { width: number; height: number }): PaintCanvas {
  const k = Math.min(1, STICKER_PX / picture.height);
  const [w, h] = [Math.max(1, Math.round(picture.width * k)), Math.max(1, Math.round(picture.height * k))];
  const rim = Math.max(2, Math.round(h * 0.022));
  const room = rim * 3;
  // the picture itself, a square one cut round at its corners
  const cut = paintCanvas();
  cut.width = w;
  cut.height = h;
  const c = context2d(cut);
  c.imageSmoothingQuality = 'high';
  c.drawImage(picture, 0, 0, w, h);
  const alphaAt = (x: number, y: number) => c.getImageData(Math.min(w - 1, Math.max(0, Math.round(x))), Math.min(h - 1, Math.max(0, Math.round(y))), 1, 1).data[3];
  if ([[0, 0], [w - 1, 0], [w / 2, 0], [0, h / 2], [w - 1, h / 2]].every(([x, y]) => alphaAt(x, y) > 250)) {
    c.globalCompositeOperation = 'destination-in';
    c.beginPath();
    c.roundRect(0, 0, w, h + Math.min(w, h), Math.min(w, h) * 0.1);
    c.fill();
    c.globalCompositeOperation = 'source-over';
  }
  // its outline in white, spread round itself by the rim
  const white = paintCanvas();
  white.width = w + 2 * room;
  white.height = h + room;
  const o = context2d(white);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    o.drawImage(cut, room + Math.cos(a) * rim, room + Math.sin(a) * rim);
  }
  o.globalCompositeOperation = 'source-in';
  o.fillStyle = '#ffffff';
  o.fillRect(0, 0, white.width, white.height);
  const canvas = paintCanvas();
  canvas.width = white.width;
  canvas.height = white.height;
  const g = context2d(canvas);
  g.shadowColor = 'rgba(0,0,0,0.5)';
  g.shadowBlur = rim * 1.6;
  g.shadowOffsetY = rim * 0.6;
  g.drawImage(white, 0, 0);
  g.shadowColor = 'transparent';
  g.drawImage(cut, room, room);
  return canvas;
}

/** A sticker's outline read off its picture (its shadow left out): see StickerShape. */
export function stickerShape(canvas: PaintCanvas, bands = 40): StickerShape {
  const { width: w, height: h } = canvas;
  const data = context2d(canvas).getImageData(0, 0, w, h).data;
  const shape: StickerShape = { left: [], right: [] };
  for (let k = 0; k < bands; k++) {
    let [from, to] = [w, -1];
    for (let y = Math.floor((k * h) / bands); y < Math.floor(((k + 1) * h) / bands); y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] <= 200) continue;
        if (x < from) from = x;
        if (x > to) to = x;
      }
    }
    shape.left.push(to < 0 ? NaN : from / w);
    shape.right.push(to < 0 ? NaN : (to + 1) / w);
  }
  return shape;
}

/**
 * A picture made ready to stand: no taller than STANDEE_PX, its feet fading into the floor; one
 * with no see-through part (a photograph, not a cut-out) also fades at its top and its two sides, so
 * it stands as a soft-edged banner and not as a hard rectangle.
 */
export function standeeCanvas(picture: CanvasImageSource & { width: number; height: number }): PaintCanvas {
  const k = Math.min(1, STANDEE_PX / picture.height);
  const [w, h] = [Math.max(1, Math.round(picture.width * k)), Math.max(1, Math.round(picture.height * k))];
  const canvas = paintCanvas();
  canvas.width = w;
  canvas.height = h;
  const g = context2d(canvas);
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
