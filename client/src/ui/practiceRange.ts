/** How a practice segment is picked on the minimap by key: by bars, or a whole section. */

/** The bar lines of a chart up to its end, and its end (a segment can stop there). */
export function rangePoints(bars: readonly number[], durationMs: number): number[] {
  const points = bars.filter((b) => b >= 0 && b < durationMs);
  return points.length > 0 ? [...points, durationMs] : [0, durationMs];
}

/** The point nearest to `ms`. */
function nearest(points: readonly number[], ms: number): number {
  let best = 0;
  for (let i = 1; i < points.length; i++) if (Math.abs(points[i] - ms) < Math.abs(points[best] - ms)) best = i;
  return best;
}

/**
 * ←→: the segment a bar on (its length kept); Shift+←→: a bar longer or shorter (its end moves, a
 * bar at least). Null where it cannot go (the chart's start or end, one bar long).
 */
export function stepRange(points: readonly number[], [startMs, endMs]: readonly [number, number], dir: 1 | -1, resize: boolean): [number, number] | null {
  const a = nearest(points, startMs);
  const b = Math.max(a + 1, nearest(points, endMs));
  const [na, nb] = resize ? [a, b + dir] : [a + dir, b + dir];
  if (na < 0 || nb >= points.length || nb <= na) return null;
  return [points[na], points[nb]];
}

/** A section as a segment: from its first bar to the next section's (or the chart's end). */
export function sectionRange(points: readonly number[], startMs: number, endMs: number): [number, number] {
  const a = nearest(points, startMs);
  const b = Math.max(a + 1, nearest(points, endMs));
  return [points[a], points[Math.min(points.length - 1, b)]];
}
