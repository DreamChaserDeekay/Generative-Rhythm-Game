/** How the settings' arrows move through rows of controls: ↑↓ line to line, ←→ along a line. */

/**
 * A control as the arrows see it: the line it is on (controls of a line come one after another)
 * and its column where the line is one of lanes or of a grid's cells (null: no column).
 */
export interface NavStop {
  line: string;
  column: number | null;
}

/** The first and one past the last control of the line control `i` is on. */
function lineRange(stops: readonly NavStop[], i: number): [number, number] {
  let start = i;
  let end = i + 1;
  while (start > 0 && stops[start - 1].line === stops[i].line) start--;
  while (end < stops.length && stops[end].line === stops[i].line) end++;
  return [start, end];
}

/**
 * Where an arrow moves the focus from control `at` (-1: nowhere it can go). ↑↓ go to the next
 * line: on a line of columns the one nearest `column` (the column kept from the last line of
 * them, so a line of buttons between two lines of keys keeps the lane), else its first control.
 * ←→ go to the next control along the line, none past its ends.
 */
export function arrowTarget(stops: readonly NavStop[], at: number, key: 'up' | 'down' | 'left' | 'right', column: number | null): number {
  if (at < 0 || at >= stops.length) return -1;
  const [start, end] = lineRange(stops, at);
  if (key === 'left' || key === 'right') {
    const next = at + (key === 'right' ? 1 : -1);
    return next >= start && next < end ? next : -1;
  }
  const first = key === 'down' ? end : start - 1;
  if (first < 0 || first >= stops.length) return -1;
  const [from, to] = lineRange(stops, first);
  const want = stops[at].column ?? column;
  if (want === null || stops[from].column === null) return from;
  let best = from;
  for (let i = from; i < to; i++) {
    const c = stops[i].column ?? 0;
    if (Math.abs(c - want) < Math.abs((stops[best].column ?? 0) - want)) best = i;
  }
  return best;
}
