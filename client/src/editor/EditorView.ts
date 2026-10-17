import type { EditNote, EditorDoc } from './editorModel';

/** What the editor canvas shows; the editor screen owns it and redraws on change. */
export interface EditorViewState {
  doc: EditorDoc;
  cursorMs: number;
  /** Zoom: pixels per ms of song time. */
  pxPerMs: number;
  snap: number;
  selection: ReadonlySet<number>;
  laneColors: string[];
  /** Lanes drawn narrower (scratch / side lanes). */
  narrowLanes: ReadonlySet<number>;
  waveform: { frameMs: number; peaks: number[] } | null;
  durationMs: number;
  /** Where a click would put a note (or the hold being drawn). */
  ghost: { lane: number; t: number; endT?: number } | null;
  /** Selection being dragged to a new place. */
  dragPreview: readonly EditNote[] | null;
  box: { x0: number; y0: number; x1: number; y1: number } | null;
}

export interface EditorLayout {
  width: number;
  height: number;
  /** Left edge of each lane and its width. */
  laneX: number[];
  laneW: number[];
  waveX: number;
  waveW: number;
  cursorY: number;
}

const LANE_W = 46;
const NARROW = 0.75;
const WAVE_W = 90;
const NOTE_H = 10;
const HIT_SLOP_PX = 6;
/** The playhead sits this far down the view; later times are above it. */
const CURSOR_AT = 0.8;

const COLORS = {
  bg: '#090c1a',
  lane: '#111833',
  laneAlt: '#0d1329',
  measure: 'rgba(170, 190, 255, 0.75)',
  beat: 'rgba(130, 150, 220, 0.35)',
  sub: 'rgba(110, 130, 200, 0.14)',
  cursor: '#ff4d8d',
  text: 'rgba(200, 212, 255, 0.85)',
  wave: 'rgba(124, 247, 255, 0.35)',
  select: '#ffffff',
  box: 'rgba(124, 247, 255, 0.18)',
};

export class EditorView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private layoutValue: EditorLayout | null = null;
  private laneCount = 0;
  private narrow: ReadonlySet<number> = new Set();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('캔버스를 쓸 수 없습니다');
    this.ctx = ctx;
  }

  /** Recompute sizes (call on resize and when the lane setup changes). */
  layout(laneCount: number, narrow: ReadonlySet<number>): EditorLayout {
    this.laneCount = laneCount;
    this.narrow = narrow;
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const widths = Array.from({ length: laneCount }, (_, i) => (narrow.has(i) ? LANE_W * NARROW : LANE_W));
    const total = widths.reduce((a, b) => a + b, 0);
    let x = Math.max(16, (width - total - WAVE_W - 24) / 2);
    const laneX: number[] = [];
    for (const w of widths) {
      laneX.push(x);
      x += w;
    }
    this.layoutValue = { width, height, laneX, laneW: widths, waveX: x + 24, waveW: WAVE_W, cursorY: Math.round(height * CURSOR_AT) };
    return this.layoutValue;
  }

  private get l(): EditorLayout {
    if (!this.layoutValue) return this.layout(this.laneCount, this.narrow);
    return this.layoutValue;
  }

  yAt(t: number, s: Pick<EditorViewState, 'cursorMs' | 'pxPerMs'>): number {
    return this.l.cursorY - (t - s.cursorMs) * s.pxPerMs;
  }

  timeAt(y: number, s: Pick<EditorViewState, 'cursorMs' | 'pxPerMs'>): number {
    return s.cursorMs + (this.l.cursorY - y) / s.pxPerMs;
  }

  laneAt(x: number): number {
    const { laneX, laneW } = this.l;
    for (let i = 0; i < laneX.length; i++) if (x >= laneX[i] && x < laneX[i] + laneW[i]) return i;
    return -1;
  }

  /** The note under a point: its body, or the end handle of a hold. */
  hitNote(x: number, y: number, s: EditorViewState): { note: EditNote; part: 'body' | 'end' } | null {
    const lane = this.laneAt(x);
    if (lane < 0) return null;
    for (const n of s.doc.notes) {
      if (n.lane !== lane) continue;
      const y0 = this.yAt(n.t, s);
      if (n.type === 'hold' && n.endT !== undefined) {
        const y1 = this.yAt(n.endT, s);
        if (Math.abs(y - y1) <= HIT_SLOP_PX) return { note: n, part: 'end' };
        if (y <= y0 + NOTE_H / 2 + HIT_SLOP_PX / 2 && y >= y1) return { note: n, part: 'body' };
      } else if (Math.abs(y - y0) <= NOTE_H / 2 + HIT_SLOP_PX / 2) {
        return { note: n, part: 'body' };
      }
    }
    return null;
  }

  /** Notes whose head lies inside a screen rectangle. */
  notesInBox(box: { x0: number; y0: number; x1: number; y1: number }, s: EditorViewState): number[] {
    const [xa, xb] = [Math.min(box.x0, box.x1), Math.max(box.x0, box.x1)];
    const [ya, yb] = [Math.min(box.y0, box.y1), Math.max(box.y0, box.y1)];
    const { laneX, laneW } = this.l;
    return s.doc.notes
      .filter((n) => {
        const cx = laneX[n.lane] + laneW[n.lane] / 2;
        const y = this.yAt(n.t, s);
        return cx >= xa && cx <= xb && y >= ya && y <= yb;
      })
      .map((n) => n.id);
  }

  draw(s: EditorViewState): void {
    const { ctx } = this;
    const { width, height, laneX, laneW, waveX, waveW, cursorY } = this.l;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);
    const tMin = this.timeAt(height, s);
    const tMax = this.timeAt(0, s);
    const left = laneX[0] ?? 0;
    const right = (laneX[laneX.length - 1] ?? 0) + (laneW[laneW.length - 1] ?? 0);

    laneX.forEach((x, i) => {
      ctx.fillStyle = i % 2 ? COLORS.laneAlt : COLORS.lane;
      ctx.fillRect(x, 0, laneW[i], height);
    });

    // grid: sub-beat lines at the snap division, beats and measures with numbers
    const tempo = s.doc.tempo;
    const firstBeat = Math.floor(tempo.msToBeat(Math.max(tMin, -60000)) * s.snap) / s.snap;
    const barList = tempo.barLines(Math.max(0, tMax));
    const bars = new Map(barList.map((t, i) => [Math.round(t * 1000), i]));
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    for (let k = 0; k < 4000; k++) {
      const beat = firstBeat + k / s.snap;
      const t = tempo.beatToMs(beat);
      if (t > tMax) break;
      if (t < tMin) continue;
      const y = Math.round(this.yAt(t, s)) + 0.5;
      const bar = bars.get(Math.round(t * 1000));
      const isBar = bar !== undefined;
      const isBeat = Math.abs(beat - Math.round(beat)) < 1e-6;
      ctx.strokeStyle = isBar ? COLORS.measure : isBeat ? COLORS.beat : COLORS.sub;
      ctx.lineWidth = isBar ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      if (isBar) {
        ctx.fillStyle = COLORS.text;
        ctx.fillText(String(bar + 1), left - 6, y + 4);
      }
    }

    // waveform beside the lanes
    if (s.waveform && s.waveform.peaks.length > 0) {
      const { frameMs, peaks } = s.waveform;
      ctx.fillStyle = COLORS.wave;
      for (let y = 0; y < height; y += 2) {
        const i = Math.floor(this.timeAt(y, s) / frameMs);
        if (i < 0 || i >= peaks.length) continue;
        const w = Math.min(1, peaks[i]) * waveW;
        ctx.fillRect(waveX + (waveW - w) / 2, y, w, 2);
      }
    }

    // song end
    if (s.durationMs > 0 && s.durationMs < tMax) {
      const y = this.yAt(s.durationMs, s);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(left, 0, right - left, Math.max(0, y));
    }

    const drawNote = (n: { lane: number; t: number; endT?: number; type?: string }, color: string, alpha: number, selected: boolean) => {
      if (n.lane < 0 || n.lane >= laneX.length) return;
      const x = laneX[n.lane] + 3;
      const w = laneW[n.lane] - 6;
      const y0 = this.yAt(n.t, s);
      ctx.globalAlpha = alpha;
      if (n.endT !== undefined && n.endT > n.t) {
        const y1 = this.yAt(n.endT, s);
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha * 0.45;
        ctx.fillRect(x + w * 0.18, y1, w * 0.64, y0 - y1);
        ctx.globalAlpha = alpha;
        ctx.fillRect(x, y1 - 2, w, 4);
      }
      ctx.fillStyle = color;
      ctx.fillRect(x, y0 - NOTE_H / 2, w, NOTE_H);
      if (selected) {
        ctx.strokeStyle = COLORS.select;
        ctx.lineWidth = 2;
        const top = n.endT !== undefined && n.endT > n.t ? this.yAt(n.endT, s) - 3 : y0 - NOTE_H / 2 - 1;
        ctx.strokeRect(x - 1, top, w + 2, y0 + NOTE_H / 2 + 1 - top);
      }
      ctx.globalAlpha = 1;
    };

    const moving = s.dragPreview ? new Set(s.dragPreview.map((n) => n.id)) : null;
    for (const n of s.doc.notes) {
      const end = n.endT ?? n.t;
      if (end < tMin - 50 || n.t > tMax + 50) continue;
      drawNote(n, s.laneColors[n.lane] ?? '#ffffff', moving?.has(n.id) ? 0.3 : 1, s.selection.has(n.id));
    }
    if (s.dragPreview) for (const n of s.dragPreview) drawNote(n, s.laneColors[n.lane] ?? '#fff', 0.85, true);
    if (s.ghost) drawNote(s.ghost, s.laneColors[s.ghost.lane] ?? '#fff', 0.4, false);

    if (s.box) {
      const { x0, y0, x1, y1 } = s.box;
      ctx.fillStyle = COLORS.box;
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.strokeStyle = COLORS.select;
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }

    // playhead
    ctx.strokeStyle = COLORS.cursor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left - 30, cursorY);
    ctx.lineTo(waveX + waveW, cursorY);
    ctx.stroke();
    ctx.fillStyle = COLORS.cursor;
    ctx.textAlign = 'left';
    ctx.fillText(formatMs(s.cursorMs), waveX + waveW + 6, cursorY + 4);
  }
}

export function formatMs(ms: number): string {
  const sign = ms < 0 ? '-' : '';
  const s = Math.abs(ms) / 1000;
  return `${sign}${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`;
}
