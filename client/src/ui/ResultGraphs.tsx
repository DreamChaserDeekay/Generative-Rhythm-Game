import type { GaugeSample } from '../engine/gauge';
import type { HitRecord } from '../engine/session';
import { histogramBins } from './resultBreakdown';

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

/** The timing in one number and one bar: the mean error (and its spread), and FAST against SLOW. */
export function TimingSummary({ mean, std, fast, slow }: { mean: number | null; std: number | null; fast: number; slow: number }) {
  const lean = mean === null || Math.abs(mean) < 3 ? '고르게 쳤습니다' : mean > 0 ? '조금 늦게 쳤습니다' : '조금 빨리 쳤습니다';
  return (
    <div className="timing-summary">
      <p className="timing-mean">
        <span className="label">평균</span>
        <b className="num" data-testid="timing-mean">
          {mean === null ? '–' : Math.abs(mean) < 0.05 ? '0.0' : `${mean > 0 ? '+' : ''}${mean.toFixed(1)}`}
          <small>ms</small>
        </b>
        <span className="timing-lean">
          {lean}
          {std !== null && ` · 흩어짐 σ ${std.toFixed(1)}ms`}
        </span>
      </p>
      <div className="fast-slow" role="img" aria-label={`FAST ${fast}, SLOW ${slow}`}>
        <span className="fast-slow-names num">
          <span className="fast">FAST {fast}</span>
          <span className="slow">SLOW {slow}</span>
        </span>
        <span className="fast-slow-bar">
          {fast + slow > 0 ? (
            <>
              <i className="fast" style={{ flexGrow: fast }} />
              <i className="slow" style={{ flexGrow: slow }} />
            </>
          ) : (
            <i className="none" />
          )}
        </span>
      </div>
    </div>
  );
}

/**
 * Where the hits fell, early to late over the play's widest window: plain bars, the 0 line dashed,
 * the median a paper line.
 */
export function TimingSpread({ hits, median, rangeMs }: { hits: HitRecord[]; median: number | null; rangeMs: number }) {
  const { counts } = histogramBins(
    hits.map((h) => h.errorMs),
    rangeMs,
  );
  const max = Math.max(1, ...counts);
  const w = 1000;
  const h = 120;
  const bw = w / counts.length;
  const at = (ms: number) => ((ms + rangeMs) / (2 * rangeMs)) * w;
  const mx = median === null ? null : at(median);
  return (
    <div className="timing-spread">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="타이밍 분포">
        <path className="bars" d={counts.map((c, i) => (c > 0 ? `M${(i * bw + bw * 0.15).toFixed(1)} ${h}V${(h - (c / max) * (h - 8)).toFixed(1)}h${(bw * 0.7).toFixed(1)}V${h}Z` : '')).join('')} />
        <line x1={w / 2} x2={w / 2} y1={0} y2={h} className="zero-line" />
        {mx !== null && mx >= 0 && mx <= w && <line x1={mx} x2={mx} y1={0} y2={h} className="median-line" />}
      </svg>
      <div className="timing-axis">
        <span>빨리</span>
        <span>0ms</span>
        <span>늦게</span>
      </div>
    </div>
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
