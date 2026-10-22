import type { GaugeSample } from '../engine/gauge';
import type { HitRecord } from '../engine/session';
import type { Chart } from '../engine/types';
import { bandOf, histogramBins, type TimingWindows } from './resultBreakdown';

const W = 640;

/**
 * The gauge as polyline points: a step at each change from the first sample, on to `endX` (the
 * end, or where it failed). `x` and `y` place a song time and a gauge value.
 */
export function gaugePoints(history: GaugeSample[], x: (t: number) => number, y: (v: number) => number, endX: number): string {
  const points: string[] = [];
  let last = history[0]?.value ?? 0;
  points.push(`0,${y(last).toFixed(1)}`);
  for (const s of history.slice(1)) {
    points.push(`${x(s.timeMs).toFixed(1)},${y(last).toFixed(1)}`, `${x(s.timeMs).toFixed(1)},${y(s.value).toFixed(1)}`);
    last = s.value;
  }
  points.push(`${endX.toFixed(1)},${y(last).toFixed(1)}`);
  return points.join(' ');
}

/** Gauge over the song, with the clear line for non-survival gauges. */
export function GaugeGraph(props: { history: GaugeSample[]; clear: number; survival: boolean; startMs: number; endMs: number; failedAtMs: number | null }) {
  const h = 80;
  const span = Math.max(1, props.endMs - props.startMs);
  const x = (t: number) => (Math.min(Math.max(t, props.startMs), props.endMs) - props.startMs) / span * W;
  const y = (v: number) => h - (v / 100) * h;
  const endX = props.failedAtMs !== null ? x(props.failedAtMs) : W;
  return (
    <svg className="graph gauge-graph" viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" role="img" aria-label="게이지 변화">
      {!props.survival && <line x1={0} x2={W} y1={y(props.clear)} y2={y(props.clear)} className="clear-line" />}
      <polyline points={gaugePoints(props.history, x, y, endX)} className={props.survival ? 'gauge-line survival' : 'gauge-line'} />
      {props.failedAtMs !== null && <line x1={endX} x2={endX} y1={0} y2={h} className="fail-line" />}
    </svg>
  );
}

/**
 * Note density with BREAK markers above and the timing error of every hit below, out to the play's
 * MAX 1% window either side, with its MAX 100% window marked.
 */
export function TimelineGraph(props: { chart: Chart; hits: HitRecord[]; breakTimes: number[]; windows: TimingWindows; startMs: number; endMs: number }) {
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
  const { outerMs, topMs } = props.windows;
  const yErr = (e: number) => mid + (Math.max(-outerMs, Math.min(outerMs, e)) / outerMs) * (scatterH / 2);
  // the svg stretches with the panel, so its labels are HTML (svg text would stretch too)
  return (
    <div className="graph-wrap">
      <svg className="graph timeline-graph" viewBox={`0 0 ${W} ${total}`} preserveAspectRatio="none" role="img" aria-label="밀도·BREAK·타이밍 분포">
        {counts.map((c, i) => {
          const bh = (c / max) * (densityH - 6);
          return <rect key={i} className="density-bar" x={i * bw} y={densityH - bh} width={Math.max(1, bw - 1)} height={bh} />;
        })}
        {props.breakTimes.map((t, i) => (
          <line key={`b${i}`} className="break-mark" x1={x(t)} x2={x(t)} y1={0} y2={densityH} />
        ))}
        <line className="zero-line" x1={0} x2={W} y1={mid} y2={mid} />
        <line className="window-line" x1={0} x2={W} y1={yErr(-topMs)} y2={yErr(-topMs)} />
        <line className="window-line" x1={0} x2={W} y1={yErr(topMs)} y2={yErr(topMs)} />
        {props.hits.map((h, i) => (
          <circle key={`h${i}`} cx={x(h.timeMs)} cy={yErr(h.errorMs)} r={1.6} className={h.percent >= 100 ? 'dot-max' : h.errorMs < 0 ? 'dot-fast' : 'dot-slow'} />
        ))}
      </svg>
      <span className="axis" style={{ top: `${((densityH + 8) / total) * 100}%` }}>FAST</span>
      <span className="axis" style={{ bottom: 0 }}>SLOW</span>
    </div>
  );
}

/**
 * The timing errors in 2–4 ms bins over the play's MAX 1% window, each bar in the colour of the
 * grade it earns, with lines at the MAX 100% window, at 0 and at the median.
 */
export function TimingHistogram({ hits, median, windows }: { hits: HitRecord[]; median: number | null; windows: TimingWindows }) {
  const { binMs, counts } = histogramBins(
    hits.map((h) => h.errorMs),
    windows.outerMs,
  );
  const rangeMs = windows.outerMs;
  const max = Math.max(1, ...counts);
  const w = 360;
  const h = 90;
  const bw = w / counts.length;
  const at = (ms: number) => ((ms + rangeMs) / (2 * rangeMs)) * w;
  const mx = median === null ? null : at(median);
  return (
    <>
      <svg className="histogram" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="타이밍 오차 분포">
        {counts.map((count, i) => {
          if (count === 0) return null;
          const center = -rangeMs + (i + 0.5) * binMs;
          const bh = (count / max) * h;
          return <rect key={i} className={`bar ${bandOf(windows, center)}`} x={i * bw + 0.5} y={h - bh} width={Math.max(0.5, bw - 1)} height={bh} />;
        })}
        <line x1={at(-windows.topMs)} x2={at(-windows.topMs)} y1={0} y2={h} className="window-line" />
        <line x1={at(windows.topMs)} x2={at(windows.topMs)} y1={0} y2={h} className="window-line" />
        <line x1={w / 2} x2={w / 2} y1={0} y2={h} className="zero-line" />
        {mx !== null && mx >= 0 && mx <= w && <line x1={mx} x2={mx} y1={0} y2={h} className="median-line" />}
      </svg>
      <div className="histogram-axis">
        <span>FAST −{Math.round(windows.outerMs)}ms</span>
        {median !== null && <span className="median">중앙값 {median > 0 ? '+' : ''}{median.toFixed(1)}ms</span>}
        <span>+{Math.round(windows.outerMs)}ms SLOW</span>
      </div>
    </>
  );
}

/**
 * Offset suggestion from the hits' errors: the mean after dropping the outer 10% on each side
 * (trimmed mean), so a few wild presses do not move it. Needs enough hits to mean something.
 */
export function suggestOffset(errors: number[], minHits = 20): number | null {
  if (errors.length < minHits) return null;
  const sorted = [...errors].sort((a, b) => a - b);
  const cut = Math.floor(sorted.length * 0.1);
  const kept = sorted.slice(cut, sorted.length - cut);
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}
