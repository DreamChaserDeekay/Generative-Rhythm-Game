import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { keyModes } from '../engine/config';
import { TempoMap } from '../engine/tempo';
import type { Chart } from '../engine/types';
import { LANE_PALETTES, type Palette } from '../render/palette';

const HEIGHT = 96;
const SECTION_BAND = 12;

interface Props {
  chart: Chart;
  palette: Palette;
  /** Practice segment to highlight (ms); dragging selects a new one when `onSelect` is set. */
  selection?: [number, number] | null;
  onSelect?: (startMs: number, endMs: number) => void;
}

/** Whole-chart overview: time runs left to right, one row per lane, sections along the top. */
export function ChartMinimap({ chart, palette, selection, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(600);
  const [drag, setDrag] = useState<[number, number] | null>(null);
  const duration = Math.max(1, chart.meta.durationMs ?? Math.max(...chart.notes.map((n) => n.endT ?? n.t), 1));
  const bars = useMemo(() => new TempoMap(chart.timing).barLines(duration), [chart, duration]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => setWidth(Math.max(200, Math.round(canvas.getBoundingClientRect().width))));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const shown = drag ? ([Math.min(...drag), Math.max(...drag)] as [number, number]) : selection ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = HEIGHT * dpr;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#070b1c';
    ctx.fillRect(0, 0, width, HEIGHT);
    const x = (t: number) => (t / duration) * width;
    const lanes = keyModes[chart.meta.keyMode].lanes;
    const rowH = (HEIGHT - SECTION_BAND - 4) / lanes.length;
    const colors = LANE_PALETTES[palette];
    const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

    const tempo = new TempoMap(chart.timing);
    (chart.sections ?? []).forEach((s, i, all) => {
      const t0 = tempo.beatToMs(s.startBeat);
      const t1 = i + 1 < all.length ? tempo.beatToMs(all[i + 1].startBeat) : duration;
      ctx.fillStyle = `rgba(110, 140, 255, ${0.12 + 0.35 * s.energy})`;
      ctx.fillRect(x(t0), 0, Math.max(1, x(t1) - x(t0) - 1), SECTION_BAND - 2);
      if (x(t1) - x(t0) > 40) {
        ctx.fillStyle = '#c9d4ff';
        ctx.font = '9px sans-serif';
        ctx.fillText(s.label, x(t0) + 3, 9);
      }
    });
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    for (const b of bars) {
      ctx.beginPath();
      ctx.moveTo(Math.round(x(b)) + 0.5, SECTION_BAND);
      ctx.lineTo(Math.round(x(b)) + 0.5, HEIGHT);
      ctx.stroke();
    }
    for (const n of chart.notes) {
      const lane = lanes[n.lane];
      if (!lane) continue;
      const y = SECTION_BAND + 2 + n.lane * rowH;
      ctx.fillStyle = hex(colors[lane.color]);
      if (n.type === 'hold' && n.endT !== undefined) {
        ctx.globalAlpha = 0.45;
        ctx.fillRect(x(n.t), y + rowH * 0.25, Math.max(1, x(n.endT) - x(n.t)), rowH * 0.5);
        ctx.globalAlpha = 1;
      }
      ctx.fillRect(x(n.t), y, 1.5, Math.max(1, rowH - 1));
    }
    if (shown) {
      const [a, b] = shown;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, x(a), HEIGHT);
      ctx.fillRect(x(b), 0, width - x(b), HEIGHT);
      ctx.strokeStyle = '#ffc94f';
      ctx.lineWidth = 2;
      ctx.strokeRect(x(a) + 1, 1, Math.max(2, x(b) - x(a) - 2), HEIGHT - 2);
    }
  }, [chart, palette, width, duration, bars, shown?.[0], shown?.[1]]);

  const timeAt = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.min(duration, Math.max(0, ((e.clientX - rect.left) / rect.width) * duration));
  };
  const snap = (t: number, up: boolean) => {
    // Loops start and end on bar lines so they come round in time.
    if (bars.length === 0) return t;
    const i = bars.findIndex((b) => b >= t);
    if (i < 0) return up ? duration : bars[bars.length - 1];
    if (up) return bars[i];
    return i > 0 && bars[i] > t ? bars[i - 1] : bars[i];
  };

  return (
    <canvas
      ref={canvasRef}
      className={`chart-minimap ${onSelect ? 'selectable' : ''}`}
      data-testid="chart-minimap"
      style={{ height: HEIGHT }}
      onPointerDown={(e) => {
        if (!onSelect) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const t = timeAt(e);
        setDrag([t, t]);
      }}
      onPointerMove={(e) => drag && setDrag([drag[0], timeAt(e)])}
      onPointerUp={() => {
        if (!drag || !onSelect) return;
        let a = snap(Math.min(...drag), false);
        let b = snap(Math.max(...drag), true);
        if (b - a < 2000) {
          // A click (or tiny drag) picks the four bars starting at that bar.
          const i = Math.max(0, bars.indexOf(a));
          b = bars[Math.min(bars.length - 1, i + 4)] ?? duration;
          if (b <= a) [a, b] = [Math.max(0, a - 8000), a];
        }
        setDrag(null);
        onSelect(a, b);
      }}
    />
  );
}
