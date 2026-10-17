import type { GaugeSample } from '../engine/gauge';
import type { HitRecord } from '../engine/session';
import type { Chart } from '../engine/types';

const W = 640;

/** Gauge over the song, with the clear line for non-survival gauges. */
export function GaugeGraph(props: { history: GaugeSample[]; clear: number; survival: boolean; startMs: number; endMs: number; failedAtMs: number | null }) {
  const h = 80;
  const span = Math.max(1, props.endMs - props.startMs);
  const x = (t: number) => (Math.min(Math.max(t, props.startMs), props.endMs) - props.startMs) / span * W;
  const y = (v: number) => h - (v / 100) * h;
  const points: string[] = [];
  let last = props.history[0]?.value ?? 0;
  points.push(`0,${y(last).toFixed(1)}`);
  for (const s of props.history.slice(1)) {
    points.push(`${x(s.timeMs).toFixed(1)},${y(last).toFixed(1)}`, `${x(s.timeMs).toFixed(1)},${y(s.value).toFixed(1)}`);
    last = s.value;
  }
  const endX = props.failedAtMs !== null ? x(props.failedAtMs) : W;
  points.push(`${endX.toFixed(1)},${y(last).toFixed(1)}`);
  return (
    <svg className="graph gauge-graph" viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" role="img" aria-label="게이지 변화">
      {!props.survival && <line x1={0} x2={W} y1={y(props.clear)} y2={y(props.clear)} className="clear-line" />}
      <polyline points={points.join(' ')} className={props.survival ? 'gauge-line survival' : 'gauge-line'} />
      {props.failedAtMs !== null && <line x1={endX} x2={endX} y1={0} y2={h} className="fail-line" />}
    </svg>
  );
}

/** Note density with BREAK markers above and the timing error of every hit below. */
export function TimelineGraph(props: { chart: Chart; hits: HitRecord[]; breakTimes: number[]; windowMs: number; startMs: number; endMs: number }) {
  const densityH = 60;
  const scatterH = 90;
  const total = densityH + scatterH + 8;
  const span = Math.max(1, props.endMs - props.startMs);
  const x = (t: number) => ((t - props.startMs) / span) * W;
  const bins = Math.max(8, Math.min(160, Math.round(span / 2000)));
  const counts = new Array(bins).fill(0);
  for (const n of props.chart.notes) {
    const i = Math.floor(((n.t - props.startMs) / span) * bins);
    if (i >= 0 && i < bins) counts[i]++;
  }
  const max = Math.max(1, ...counts);
  const bw = W / bins;
  const mid = densityH + 8 + scatterH / 2;
  const yErr = (e: number) => mid + (Math.max(-props.windowMs, Math.min(props.windowMs, e)) / props.windowMs) * (scatterH / 2);
  return (
    <svg className="graph timeline-graph" viewBox={`0 0 ${W} ${total}`} preserveAspectRatio="none" role="img" aria-label="밀도·BREAK·타이밍 분포">
      {counts.map((c, i) => {
        const bh = (c / max) * (densityH - 6);
        return <rect key={i} className="density-bar" x={i * bw} y={densityH - bh} width={Math.max(1, bw - 1)} height={bh} />;
      })}
      {props.breakTimes.map((t, i) => (
        <line key={`b${i}`} className="break-mark" x1={x(t)} x2={x(t)} y1={0} y2={densityH} />
      ))}
      <line className="zero-line" x1={0} x2={W} y1={mid} y2={mid} />
      <line className="window-line" x1={0} x2={W} y1={yErr(-41.67)} y2={yErr(-41.67)} />
      <line className="window-line" x1={0} x2={W} y1={yErr(41.67)} y2={yErr(41.67)} />
      {props.hits.map((h, i) => (
        <circle key={`h${i}`} cx={x(h.timeMs)} cy={yErr(h.errorMs)} r={1.6} className={h.percent >= 100 ? 'dot-max' : h.errorMs < 0 ? 'dot-fast' : 'dot-slow'} />
      ))}
      <text x={4} y={densityH + 18} className="axis">FAST</text>
      <text x={4} y={total - 4} className="axis">SLOW</text>
    </svg>
  );
}

const HIST_RANGE_MS = 180;
const HIST_BINS = 36;

export function TimingHistogram({ hits, median }: { hits: HitRecord[]; median: number | null }) {
  const bins = new Array(HIST_BINS).fill(0);
  for (const h of hits) {
    const i = Math.floor(((h.errorMs + HIST_RANGE_MS) / (2 * HIST_RANGE_MS)) * HIST_BINS);
    if (i >= 0 && i < HIST_BINS) bins[i]++;
  }
  const max = Math.max(1, ...bins);
  const w = 360;
  const h = 90;
  const bw = w / HIST_BINS;
  const mx = median === null ? null : ((median + HIST_RANGE_MS) / (2 * HIST_RANGE_MS)) * w;
  return (
    <svg className="histogram" viewBox={`0 0 ${w} ${h + 16}`} role="img" aria-label="타이밍 오차 분포">
      {bins.map((count, i) => {
        const center = -HIST_RANGE_MS + (i + 0.5) * ((2 * HIST_RANGE_MS) / HIST_BINS);
        const bh = (count / max) * h;
        const cls = Math.abs(center) <= 41.67 ? 'bar-max' : center < 0 ? 'bar-fast' : 'bar-slow';
        return <rect key={i} className={cls} x={i * bw + 1} y={h - bh} width={bw - 2} height={bh} />;
      })}
      <line x1={w / 2} x2={w / 2} y1={0} y2={h} className="zero-line" />
      {mx !== null && mx >= 0 && mx <= w && <line x1={mx} x2={mx} y1={0} y2={h} className="median-line" />}
      <text x={4} y={h + 13} className="axis">FAST −{HIST_RANGE_MS}ms</text>
      <text x={w - 4} y={h + 13} className="axis" textAnchor="end">+{HIST_RANGE_MS}ms SLOW</text>
    </svg>
  );
}

/**
 * Offset suggestion from the hits: the mean error after dropping the outer 10% on each side
 * (trimmed mean), so a few wild presses do not move it. Needs enough hits to mean something.
 */
export function suggestOffset(hits: HitRecord[], minHits = 20): number | null {
  if (hits.length < minHits) return null;
  const sorted = hits.map((h) => h.errorMs).sort((a, b) => a - b);
  const cut = Math.floor(sorted.length * 0.1);
  const kept = sorted.slice(cut, sorted.length - cut);
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}
