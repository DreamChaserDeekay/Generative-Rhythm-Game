import { ScrollModel, type ScrollMode } from '../engine/scroll';
import type { Chart } from '../engine/types';
import { HI_SPEED_MIN, visibleTimeMs } from '../settings/settings';

/** A practice run (and every loop) starts at least this long (real ms) before its first note, and this long before it comes into sight. */
export const PRACTICE_LEAD_MS = 3000;
export const PRACTICE_SIGHT_MS = 1000;
/** The least of the song a stretched practice buffer keeps before A (song ms). */
const MIN_PREROLL_MS = 4000;
/** Room for the display offset, which the song's own offset moves in play (song ms). */
const PREROLL_MARGIN_MS = 500;

/** Where a practice run starts (song ms), given when its first note comes into sight below SUDDEN+. */
export function practiceRunStart(firstNoteMs: number, firstInSight: number, rate: number): number {
  return Math.min(firstNoteMs - PRACTICE_LEAD_MS * rate, firstInSight - PRACTICE_SIGHT_MS * rate);
}

/**
 * How much of the song before A (song ms) a stretched practice buffer keeps: the lead-in of a run
 * however SPEED and the covers are set in play (the slowest SPEED, no covers), so that the music
 * never cuts in halfway through it. `visualOffsetMs`: how much earlier notes are drawn (song ms).
 */
export function practicePrerollMs(
  chart: Pick<Chart, 'notes' | 'timing'>,
  practice: { startMs: number; endMs: number; rate: number },
  scrollMode: ScrollMode,
  durationMs: number,
  visualOffsetMs: number,
): number {
  const heads = chart.notes.filter((n) => n.t >= practice.startMs && n.t <= practice.endMs).map((n) => n.t);
  if (heads.length === 0) return MIN_PREROLL_MS;
  const first = Math.min(...heads);
  // the track's length drops out: what counts is how long a note takes over it
  const scroll = new ScrollModel({ trackLength: 1, visibleMs: visibleTimeMs(HI_SPEED_MIN), lift: 0, mode: scrollMode, timing: chart.timing, rate: practice.rate, durationMs });
  const start = practiceRunStart(first, scroll.timeAt(first, scroll.travel) - visualOffsetMs, practice.rate);
  return Math.max(MIN_PREROLL_MS, practice.startMs - start + PREROLL_MARGIN_MS);
}
