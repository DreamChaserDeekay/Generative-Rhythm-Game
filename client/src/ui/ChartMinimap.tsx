import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { keyModes } from '../engine/config';
import { TempoMap } from '../engine/tempo';
import type { Chart } from '../engine/types';
import { LANE_PALETTES, type Palette } from '../render/palette';
import { pointText } from './format';
import { rangePoints, sectionRange, stepRange } from './practiceRange';
import { groupColor, sectionLabel } from './sections';
import { canvasFont, token } from './theme';

const HEIGHT = 112;
const SECTION_BAND = 20;

interface Props {
  chart: Chart;
  palette: Palette;
  /** Practice segment to highlight (ms); dragging selects a new one when `onSelect` is set. */
  selection?: [number, number] | null;
  onSelect?: (startMs: number, endMs: number) => void;
  /** Says what its keys do while it has the focus (the panel's foot). */
  onHelp?: (help: string) => void;
}

/**
 * Whole-chart overview: time runs left to right, one row per lane, sections along the top
 * (coloured by repetition group, so the same music has the same colour). Picking a practice
 * segment (`onSelect`) it takes the focus: ←→ move the segment a bar, Shift+←→ make it a bar
 * longer or shorter; the sections' buttons under it each pick their section.
 */
export function ChartMinimap({ chart, palette, selection, onSelect, onHelp }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(600);
  const [drag, setDrag] = useState<[number, number] | null>(null);
  const duration = Math.max(1, chart.meta.durationMs ?? Math.max(...chart.notes.map((n) => n.endT ?? n.t), 1));
  const bars = useMemo(() => new TempoMap(chart.timing).barLines(duration), [chart, duration]);
  // where a segment picked by key starts and ends, and the sections it can take whole
  const points = useMemo(() => rangePoints(bars, duration), [bars, duration]);
  const sections = useMemo(() => {
    const tempo = new TempoMap(chart.timing);
    const all = chart.sections ?? [];
    return all.map((s, i) => {
      const startMs = Math.max(0, tempo.beatToMs(s.startBeat));
      const endMs = i + 1 < all.length ? tempo.beatToMs(all[i + 1].startBeat) : duration;
      return { name: `${sectionLabel(s.label)}${s.group ? ` ${s.group}` : ''}`, range: sectionRange(points, startMs, endMs) };
    });
  }, [chart, duration, points]);

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
    const text = token('--text');
    ctx.fillStyle = token('--bg');
    ctx.fillRect(0, 0, width, HEIGHT);
    const x = (t: number) => (t / duration) * width;
    const lanes = keyModes[chart.meta.keyMode].lanes;
    const rowH = (HEIGHT - SECTION_BAND - 4) / lanes.length;
    const colors = LANE_PALETTES[palette];
    const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

    const tempo = new TempoMap(chart.timing);
    (chart.sections ?? []).forEach((s, i, all) => {
      const t0 = Math.max(0, tempo.beatToMs(s.startBeat));
      const t1 = i + 1 < all.length ? tempo.beatToMs(all[i + 1].startBeat) : duration;
      // the colour is the repetition group (the same music has the same colour), louder is brighter
      ctx.fillStyle = s.group ? groupColor(s.group) : text;
      ctx.globalAlpha = s.group ? 0.25 + 0.35 * s.energy : 0.08 + 0.22 * s.energy;
      ctx.fillRect(x(t0), 0, Math.max(1, x(t1) - x(t0) - 1), SECTION_BAND - 2);
      ctx.globalAlpha = 1;
      const name = sectionLabel(s.label);
      const room = x(t1) - x(t0);
      if (room > 40) {
        ctx.fillStyle = text;
        ctx.font = canvasFont(700, '--fs-label');
        ctx.textBaseline = 'middle';
        ctx.fillText(room > 72 && s.group ? `${name} ${s.group}` : name, x(t0) + 4, (SECTION_BAND - 2) / 2, room - 6);
      }
    });
    ctx.strokeStyle = text;
    ctx.globalAlpha = 0.06;
    for (const b of bars) {
      ctx.beginPath();
      ctx.moveTo(Math.round(x(b)) + 0.5, SECTION_BAND);
      ctx.lineTo(Math.round(x(b)) + 0.5, HEIGHT);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
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
      ctx.fillStyle = token('--bg');
      ctx.globalAlpha = 0.6;
      ctx.fillRect(0, 0, x(a), HEIGHT);
      ctx.fillRect(x(b), 0, width - x(b), HEIGHT);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = token('--accent');
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

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (!onSelect || !selection || (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight')) return;
    e.preventDefault();
    const next = stepRange(points, selection, e.code === 'ArrowRight' ? 1 : -1, e.shiftKey);
    if (next) onSelect(next[0], next[1]);
  };

  const canvas = (
    <canvas
      ref={canvasRef}
      className={`chart-minimap ${onSelect ? 'selectable' : ''}`}
      data-testid="chart-minimap"
      style={{ height: HEIGHT }}
      tabIndex={onSelect ? 0 : undefined}
      role={onSelect ? 'slider' : undefined}
      aria-label={onSelect ? '연습 구간' : undefined}
      aria-valuetext={onSelect && selection ? `${pointText(selection[0])}–${pointText(selection[1])}` : undefined}
      onKeyDown={onKeyDown}
      onFocus={() => onHelp?.('←→ 구간을 한 마디씩 옮기고, Shift+←→ 한 마디씩 늘이거나 줄입니다. 아래의 구간 이름은 그 구간을 고릅니다.')}
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
  if (!onSelect || sections.length === 0) return canvas;
  return (
    <>
      {canvas}
      <div className="row minimap-sections" data-testid="minimap-sections" aria-label="구간 고르기">
        {sections.map((s, i) => (
          <button
            key={i}
            className={`small ${selection && selection[0] === s.range[0] && selection[1] === s.range[1] ? 'active' : ''}`}
            onClick={() => onSelect(s.range[0], s.range[1])}
            onFocus={() => onHelp?.(`${s.name}: ${pointText(s.range[0])}–${pointText(s.range[1])}을 연습 구간으로 고릅니다.`)}
          >
            {s.name}
          </button>
        ))}
      </div>
    </>
  );
}
