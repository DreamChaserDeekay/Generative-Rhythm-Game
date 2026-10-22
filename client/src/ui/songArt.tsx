import { useEffect, useRef, useState } from 'react';
import { api, type Song, type SongSketch } from '../api/client';
import { token } from './theme';

/** Colour token of the stem that leads a section. */
const STEM_TOKENS: Record<string, string> = { drums: '--stem-drums', bass: '--stem-bass', vocals: '--stem-vocals', other: '--stem-other' };
export const stemToken = (stem: string | null | undefined): string => STEM_TOKENS[stem ?? ''] ?? '--text-dim';

/** "152", "120–180" for a song that changes tempo, "-" before it is analysed. */
export function bpmLabel(song: Song): string {
  if (song.bpm === null) return '-';
  if (song.bpmMin !== null && song.bpmMax !== null && Math.abs(song.bpmMax - song.bpmMin) > 0.5) {
    return `${Math.round(song.bpmMin)}–${Math.round(song.bpmMax)}`;
  }
  return song.bpm.toFixed(song.bpm % 1 < 0.05 || song.bpm % 1 > 0.95 ? 0 : 1);
}

const sketches = new Map<string, Promise<SongSketch>>();

/** The song's sketch once it is analysed (fetched once per analysis, shared by every view of the song). */
export function useSketch(song: Song | null): SongSketch | null {
  const [sketch, setSketch] = useState<SongSketch | null>(null);
  const key = song && song.status === 'ready' ? `${song.id}:${song.analyzedAt}:${JSON.stringify(song.sections ?? null)}` : null;
  useEffect(() => {
    setSketch(null);
    if (!key || !song) return;
    let alive = true;
    if (!sketches.has(key)) sketches.set(key, api.sketch(song.id).catch((e) => {
      sketches.delete(key);
      throw e;
    }));
    sketches.get(key)?.then((s) => alive && setSketch(s)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key]);
  return sketch;
}

/** The stem that leads the most of the song (by the length of the sections it leads). */
export function leadingStem(sketch: SongSketch): string | null {
  const time = new Map<string, number>();
  for (const s of sketch.sections) if (s.leader) time.set(s.leader, (time.get(s.leader) ?? 0) + s.endT - s.t);
  return [...time.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * The cover of a song without one: a disc in the middle of the square, half of it across, in the
 * colour of the stem that leads the song (grey until it is analysed), with its grooves, the light
 * on it and the clear hub round the hole.
 */
export function drawDisc(canvas: HTMLCanvasElement, size: number, colour: string): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  const g = canvas.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const surface = token('--surface');
  const light = token('--text');
  g.fillStyle = surface;
  g.fillRect(0, 0, size, size);
  const c = size / 2;
  const r = size / 4;
  const circle = (radius: number) => {
    g.beginPath();
    g.arc(c, c, radius, 0, Math.PI * 2);
  };
  circle(r);
  g.fillStyle = colour;
  g.globalAlpha = 0.9;
  g.fill();
  // the light: two opposite wedges, soft at their edges (a wider, fainter one under each)
  g.save();
  circle(r);
  g.clip();
  g.fillStyle = light;
  for (const [from, width, alpha] of [
    [-Math.PI * 0.32, 0.36, 0.1],
    [-Math.PI * 0.28, 0.18, 0.14],
    [Math.PI * 0.68, 0.36, 0.08],
    [Math.PI * 0.72, 0.18, 0.1],
  ]) {
    g.globalAlpha = alpha;
    g.beginPath();
    g.moveTo(c, c);
    g.arc(c, c, r, from, from + width);
    g.closePath();
    g.fill();
  }
  g.restore();
  // grooves
  g.globalAlpha = 0.22;
  g.strokeStyle = surface;
  g.lineWidth = Math.max(0.5, size / 480);
  for (const k of [0.56, 0.7, 0.84]) {
    circle(r * k);
    g.stroke();
  }
  // the clear hub, the hole and the rim
  circle(r * 0.36);
  g.globalAlpha = 0.5;
  g.fillStyle = surface;
  g.fill();
  circle(r * 0.13);
  g.globalAlpha = 1;
  g.fill();
  circle(r);
  g.globalAlpha = 0.2;
  g.strokeStyle = light;
  g.lineWidth = Math.max(1, size / 240);
  g.stroke();
  g.globalAlpha = 1;
}

/** A disc cover (see drawDisc): a song's without a picture of its own, or a play's without a song. */
export function Disc({ size, stem = null, className = '' }: { size: number; stem?: string | null; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current) drawDisc(canvas.current, size, token(stem ? stemToken(stem) : '--text-dim'));
  }, [size, stem]);
  return <canvas ref={canvas} className={`song-art ${className}`} style={{ width: size, height: size }} aria-hidden="true" />;
}

/** The song's picture: its own cover when it has one, else its disc. */
export function SongArt({ song, size, className = '' }: { song: Song; size: number; className?: string }) {
  // a cover that fails to load leaves the disc, until another cover comes
  const [failed, setFailed] = useState<string | null>(null);
  const cover = api.coverUrl(song);
  const covered = song.hasCover && failed !== cover;
  const sketch = useSketch(covered ? null : song);
  // (the song list is not cut to what shows: a cover loads as its row comes into view, a large BMP off the main thread)
  if (covered) return <img className={`song-art ${className}`} style={{ width: size, height: size }} src={cover} alt="" loading="lazy" decoding="async" onError={() => setFailed(cover)} />;
  return <Disc size={size} stem={sketch ? leadingStem(sketch) : null} className={className} />;
}

/**
 * The selected song's picture read into 24 px and stretched over the screen: a soft field of its
 * colours behind the menus, with no blur filter (a disc cover's colour, evenly).
 */
export function Backdrop({ song }: { song: Song | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sketch = useSketch(song && !song.hasCover ? song : null);
  const [drawn, setDrawn] = useState<string | null>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !song) return;
    const small = c.getContext('2d');
    if (!small) return;
    let alive = true;
    const paint = (source: CanvasImageSource) => {
      if (!alive) return;
      small.clearRect(0, 0, c.width, c.height);
      small.drawImage(source, 0, 0, c.width, c.height);
      setDrawn(song.id);
    };
    if (song.hasCover) {
      const img = new Image();
      img.onload = () => paint(img);
      img.src = api.coverUrl(song);
    } else if (sketch) {
      // a disc cover tints the screen evenly in its colour (its round shape stretched would be a blob)
      const lead = leadingStem(sketch);
      const field = document.createElement('canvas');
      field.width = field.height = 4;
      const g = field.getContext('2d');
      if (g) {
        g.fillStyle = token('--surface');
        g.fillRect(0, 0, 4, 4);
        g.globalAlpha = 0.45;
        g.fillStyle = token(lead ? stemToken(lead) : '--text-dim');
        g.fillRect(0, 0, 4, 4);
        paint(field);
      }
    }
    return () => {
      alive = false;
    };
  }, [song?.id, song?.hasCover, song?.coverAt, sketch]);
  return (
    <div className="backdrop" aria-hidden="true">
      <canvas ref={canvas} width={24} height={24} className={drawn && drawn === song?.id ? 'shown' : ''} />
    </div>
  );
}
