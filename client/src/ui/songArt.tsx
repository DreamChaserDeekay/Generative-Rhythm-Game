import { useEffect, useRef, useState } from 'react';
import { api, type Song, type SongSketch } from '../api/client';
import { previewLength } from '../audio/songPreview';
import { token } from './theme';

/** Colour token of the stem that leads a section. */
const STEM_TOKENS: Record<string, string> = { drums: '--stem-drums', bass: '--stem-bass', vocals: '--stem-vocals', other: '--stem-other' };
export const stemToken = (stem: string | null | undefined): string => STEM_TOKENS[stem ?? ''] ?? '--text-dim';

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

/**
 * The song's face drawn from its analysis: one band per section (width = length, height = energy,
 * colour = the stem that leads it) under a line of the waveform's peaks.
 */
export function drawSketch(canvas: HTMLCanvasElement, sketch: SongSketch, size: number): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  const g = canvas.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = token('--surface');
  g.fillRect(0, 0, size, size);
  const duration = Math.max(1, sketch.durationMs);
  const gap = Math.max(1, size / 120);
  g.globalAlpha = 0.85;
  for (const s of sketch.sections) {
    const x = (s.t / duration) * size + gap;
    const w = Math.max(1, ((s.endT - s.t) / duration) * size - gap);
    const h = (0.2 + 0.7 * s.energy) * size;
    g.fillStyle = token(stemToken(s.leader));
    g.fillRect(x, size - h, w, h);
  }
  if (sketch.peaks.length > 1) {
    g.globalAlpha = 0.4;
    g.strokeStyle = token('--text');
    g.lineWidth = Math.max(1, size / 200);
    g.beginPath();
    sketch.peaks.forEach((p, i) => {
      const x = (i / (sketch.peaks.length - 1)) * size;
      const y = size * (0.06 + 0.24 * (1 - p));
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.stroke();
  }
  g.globalAlpha = 1;
}

/** The song's picture: its own cover when it has one, else its sketch, else its first letter. */
export function SongArt({ song, size, className = '' }: { song: Song; size: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const sketch = useSketch(song.hasCover && !failed ? null : song);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (sketch && canvas.current) drawSketch(canvas.current, sketch, size);
  }, [sketch, size]);
  const style = { width: size, height: size };
  if (song.hasCover && !failed) return <img className={`song-art ${className}`} style={style} src={api.coverUrl(song.id)} alt="" onError={() => setFailed(true)} />;
  if (sketch) return <canvas ref={canvas} className={`song-art ${className}`} style={style} aria-hidden="true" />;
  return (
    <div className={`song-art placeholder ${className}`} style={style} aria-hidden="true">
      {song.title.slice(0, 1).toUpperCase()}
    </div>
  );
}

/**
 * The selected song's picture read into 24 px and stretched over the screen: a soft field of its
 * colours behind the menus, with no blur filter.
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
      img.src = api.coverUrl(song.id);
    } else if (sketch) {
      const big = document.createElement('canvas');
      drawSketch(big, sketch, 96);
      paint(big);
    }
    return () => {
      alive = false;
    };
  }, [song?.id, song?.hasCover, sketch]);
  return (
    <div className="backdrop" aria-hidden="true">
      <canvas ref={canvas} width={24} height={24} className={drawn && drawn === song?.id ? 'shown' : ''} />
    </div>
  );
}

/**
 * The song's sections in a strip (width = length, height = energy, colour = leading stem), with
 * the stretch the song select previews outlined.
 */
export function SongMap({ sketch, height = 12, showPreview = false }: { sketch: SongSketch; height?: number; showPreview?: boolean }) {
  const duration = Math.max(1, sketch.durationMs);
  const start = sketch.previewMs ?? 0;
  const length = previewLength(sketch.durationMs, start);
  return (
    <div className="song-map" style={{ height }} data-testid="song-map">
      {sketch.sections.map((s, i) => (
        <i
          key={i}
          title={s.label}
          style={{
            left: `calc(${(s.t / duration) * 100}% + 1px)`,
            width: `calc(${((s.endT - s.t) / duration) * 100}% - 2px)`,
            height: Math.round((0.35 + 0.65 * s.energy) * height),
            background: `color-mix(in srgb, var(${stemToken(s.leader)}) 70%, var(--sunken))`,
          }}
        />
      ))}
      {showPreview && sketch.previewMs !== null && (
        <b className="song-map-preview" style={{ left: `${(start / duration) * 100}%`, width: `${(length / duration) * 100}%` }} />
      )}
    </div>
  );
}
