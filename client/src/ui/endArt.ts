/**
 * The pictures of a play's end, made with the image model (client/public/end/, built by
 * scripts/assets/build_end_fx.py: change them together): the lettering of the lamps that show their words,
 * the seal of each clear lamp, the frames of the shockwave that runs out from a seal and of the sparks where
 * a hard clear's two halves close (each a row of frames), the cracks over the lanes of a play that fails
 * halfway, and the light that rises along a lane as it comes on at a play's start. Where they cannot be read
 * the start and the end are drawn as the styles and the renderer draw them.
 */
export interface EndArtIndex {
  /**
   * By lamp class (lamps.LAMP_CLASS), and for a play without a lamp by how it was played (AIDED_WORDS): px, and
   * where its letters stand in it (top and bottom, shares of its height).
   */
  words: Record<string, { file: string; size: [number, number]; band: [number, number] }>;
  seals: Record<string, { file: string; size: [number, number] }>;
  ring: { file: string; size: [number, number]; frames: number };
  sparks: { file: string; size: [number, number]; frames: number };
  cracks: { file: string; size: [number, number] };
  /** Grey light on black, its bottom at the judge line (TrackRenderer.setLaneLight). */
  lane: { file: string; size: [number, number] };
}

/** The words a play without a lamp ends with (PlayController), and the picture of them in the index's words. */
export const AIDED_WORDS: Readonly<Record<string, string>> = { 'AUTO PLAY': 'autoplay', 'PRACTICE END': 'practice' };

export interface EndArt {
  index: EndArtIndex;
  /** Where a picture of the index is. */
  url(file: string): string;
  /** The cracks, loaded. */
  cracks: HTMLImageElement;
  /** The lane's light, loaded. */
  lane: HTMLImageElement;
}

/**
 * How large the picture of a lamp's words is drawn for its letters to stand `cap` em tall, and how far up it
 * is moved for the letters' middle to be its box's (em): the picture's glow reaches further than the letters,
 * and further down than up where something falls from them.
 */
export function wordsBox(size: readonly [number, number], band: readonly [number, number], cap: number): { width: number; height: number; lift: number } {
  const height = cap / Math.max(0.05, band[1] - band[0]);
  return { width: (height * size[0]) / size[1], height, lift: ((band[0] + band[1]) / 2 - 0.5) * height };
}

/** The index as it must be to be used (a file from another build, or none, is not). */
export function isEndArtIndex(v: unknown): v is EndArtIndex {
  const o = v as Partial<EndArtIndex> | null;
  const picture = (p: unknown) => typeof (p as { file?: unknown })?.file === 'string' && Array.isArray((p as { size?: unknown }).size);
  const row = (p: unknown) => picture(p) && Number.isInteger((p as { frames?: unknown }).frames) && ((p as { frames: number }).frames ?? 0) > 0;
  return (
    typeof o === 'object' &&
    o !== null &&
    typeof o.words === 'object' &&
    o.words !== null &&
    Object.values(o.words).every((w) => picture(w) && Array.isArray(w.band) && w.band.length === 2) &&
    typeof o.seals === 'object' &&
    o.seals !== null &&
    Object.values(o.seals).every(picture) &&
    row(o.ring) &&
    row(o.sparks) &&
    picture(o.cracks) &&
    picture(o.lane)
  );
}

/** Where the build's pictures of the end are: `end/index.json` beside the app lists them. */
const endUrl = (file: string) => `${import.meta.env.BASE_URL}end/${file}`;

let loading: Promise<EndArt | null> | null = null;

/** The end's pictures, read once and loaded before they are shown (null: they cannot be read). */
export function loadEndArt(): Promise<EndArt | null> {
  loading ??= (async () => {
    try {
      const res = await fetch(endUrl('index.json'));
      if (!res.ok) return null;
      const index: unknown = await res.json();
      if (!isEndArtIndex(index)) return null;
      const image = (file: string) =>
        new Promise<HTMLImageElement>((done, fail) => {
          const im = new Image();
          im.onload = () => done(im);
          im.onerror = () => fail(new Error(file));
          im.src = endUrl(file);
        });
      const shown = [...Object.values(index.words), ...Object.values(index.seals), index.ring, index.sparks].map((p) => p.file);
      const [cracks, lane] = await Promise.all([image(index.cracks.file), image(index.lane.file), ...shown.map(image)]);
      return { index, url: endUrl, cracks, lane };
    } catch {
      return null;
    }
  })();
  return loading;
}
