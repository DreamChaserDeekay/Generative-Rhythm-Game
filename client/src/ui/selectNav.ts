/** How the song select's keys move through the list and through its panels. */

/**
 * The list cursor `delta` rows on: a single step of a fresh press wraps around the ends, a held
 * key (or a page) stops at them. -1 (no song under the cursor) starts on the first.
 */
export function cursorStep(index: number, count: number, delta: number, wrap: boolean): number {
  if (count === 0) return -1;
  if (index < 0) return 0;
  const next = index + delta;
  if (wrap && Math.abs(delta) === 1) return (next + count) % count;
  return Math.min(count - 1, Math.max(0, next));
}

/** A random index other than `current` (when there is another): RANDOM in the folder or the search. */
export function randomIndex(count: number, current: number, random: () => number = Math.random): number {
  if (count <= 1) return count - 1;
  const others = current >= 0 && current < count ? count - 1 : count;
  const pick = Math.min(others - 1, Math.floor(random() * others));
  return current >= 0 && pick >= current ? pick + 1 : pick;
}

/** Shift alone changes the folder only while no lane of the key mode is played with a Shift key. */
export function shiftChangesFolder(laneKeys: readonly string[]): boolean {
  return !laneKeys.includes('ShiftLeft') && !laneKeys.includes('ShiftRight');
}

/**
 * A panel's controls in order as its arrows go through them: `lines[i]` is the line control i is
 * on (an option row, a segmented choice, a row of buttons), `chosen[i]` marks the chosen button of
 * a segmented choice (the focus lands on it, and ←→ pick its neighbours).
 */
export interface PanelLines {
  lines: readonly unknown[];
  chosen: readonly boolean[];
}

/** The first and one past the last control of the line control `i` is on. */
function lineRange({ lines }: PanelLines, i: number): [number, number] {
  let start = i;
  let end = i + 1;
  while (start > 0 && lines[start - 1] === lines[i]) start--;
  while (end < lines.length && lines[end] === lines[i]) end++;
  return [start, end];
}

/** The chosen button of the line control `i` is on (-1: the line is no choice). */
function chosenOn(p: PanelLines, i: number): number {
  const [start, end] = lineRange(p, i);
  for (let j = start; j < end; j++) if (p.chosen[j]) return j;
  return -1;
}

/** Where the focus lands on the line control `i` is on: its chosen button, else its first control. */
export function landing(p: PanelLines, i: number): number {
  const chosen = chosenOn(p, i);
  return chosen >= 0 ? chosen : lineRange(p, i)[0];
}

/** ↑↓: where the focus lands on the next (or previous) line from control `at`; -1 past either end. */
export function lineStep(p: PanelLines, at: number, dir: 1 | -1): number {
  const [start, end] = lineRange(p, at);
  const next = dir > 0 ? end : start - 1;
  return next < 0 || next >= p.lines.length ? -1 : landing(p, next);
}

/** Home / End: where the focus lands on the first or the last line; -1 when there is none. */
export function edgeLine(p: PanelLines, last: boolean): number {
  return p.lines.length === 0 ? -1 : landing(p, last ? p.lines.length - 1 : 0);
}

/**
 * ←→ on a line: a choice's neighbour of its chosen button (the ends wrap round, as an option row's
 * values do), or the next control along a row of buttons (none past its ends); -1 for none.
 */
export function alongLine(p: PanelLines, at: number, dir: 1 | -1): number {
  const [start, end] = lineRange(p, at);
  const chosen = chosenOn(p, at);
  if (chosen >= 0) return end - start > 1 ? start + ((chosen - start + dir + (end - start)) % (end - start)) : -1;
  const next = at + dir;
  return next >= start && next < end ? next : -1;
}

/** The focusable controls of a panel's part, in order (the ‹ › of an option row are the row's). */
export function panelStops(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')].filter(
    (el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled && !(el instanceof HTMLInputElement && el.type === 'hidden') && el.getClientRects().length > 0,
  );
}

/** The line a control is on: its option row, its segmented choice, or its row of buttons. */
export function lineOf(el: HTMLElement): HTMLElement {
  return el.closest<HTMLElement>('.opt, .segmented, .row') ?? el;
}

/** The lines of a panel's controls (see PanelLines): a segmented choice's active button is its chosen one. */
export function panelLines(stops: readonly HTMLElement[]): PanelLines {
  const lines = stops.map(lineOf);
  return { lines, chosen: stops.map((el, i) => lines[i].classList.contains('segmented') && el.classList.contains('active')) };
}

/** Focuses where a panel's first line lands (from an effect: a panel opened, a tab changed). */
export function focusFirstStop(root: HTMLElement | null): void {
  if (!root) return;
  const stops = panelStops(root);
  stops[edgeLine(panelLines(stops), false)]?.focus({ preventScroll: true });
}

/**
 * Whether Enter presses a panel's focused control: a button, a link or a box does, a segmented
 * choice's button leaves Enter to the play (as an option row does), and so does anything else.
 */
export function pressesOnEnter(el: Element | null): boolean {
  const pressable = el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement || (el instanceof HTMLInputElement && el.type === 'checkbox');
  return pressable && !el.closest('.segmented');
}
