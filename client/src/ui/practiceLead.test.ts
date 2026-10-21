import { describe, expect, it } from 'vitest';
import { ScrollModel, type ScrollMode } from '../engine/scroll';
import type { ChartNote, ChartTiming } from '../engine/types';
import { HI_SPEED_MAX, HI_SPEED_MIN, visibleTimeMs } from '../settings/settings';
import { practicePrerollMs, practiceRunStart } from './practiceLead';

const timing: ChartTiming = { offsetMs: 0, tempoMap: [{ beat: 0, bpm: 150 }, { beat: 160, bpm: 75 }, { beat: 200, bpm: 150 }], meter: [] };
// 150 BPM, but 75 from 64 s to 96 s (BPM-linked scroll is slow there)
const notes = [20_000, 61_000, 62_000, 97_000].map((t, i) => ({ t, lane: i % 4, type: 'tap' }) as ChartNote);
const durationMs = 120_000;

/** Where the controller starts a run: its scroll for the SPEED and covers in effect. */
function runStart(mode: ScrollMode, rate: number, hiSpeed: number, sudden: number, lift: number, visualOffsetMs: number, firstNoteMs: number): number {
  const scroll = new ScrollModel({ trackLength: 400, visibleMs: visibleTimeMs(hiSpeed), lift, mode, timing, rate, durationMs });
  return practiceRunStart(firstNoteMs, scroll.timeAt(firstNoteMs, scroll.travel * (1 - sudden)) - visualOffsetMs, rate);
}

describe('practice lead-in', () => {
  it('starts 3 s before the first note, or 1 s before it comes into sight when that is earlier', () => {
    expect(practiceRunStart(10_000, 9_000, 1)).toBe(7_000);
    expect(practiceRunStart(10_000, 3_000, 1.5)).toBe(1_500);
  });

  it('keeps enough of the song in a stretched practice buffer for the lead-in, at any rate, SPEED and covers', () => {
    for (const mode of ['time', 'beat'] as const) {
      for (const rate of [0.75, 1.5]) {
        // a segment whose lead-in reaches back into the slow part (its first note at 97 s)
        const practice = { startMs: 96_000, endMs: 105_000, rate };
        const visual = 30 * rate;
        const preroll = practicePrerollMs({ notes, timing }, practice, mode, durationMs, visual);
        const origin = practice.startMs - preroll;
        for (const hiSpeed of [HI_SPEED_MIN, 1, 4, HI_SPEED_MAX]) {
          for (const [sudden, lift] of [
            [0, 0],
            [0.3, 0.1],
          ]) {
            // the song's own offset may move the display by up to 200 ms in play
            for (const songOffset of [-200, 0, 200]) {
              expect(origin).toBeLessThanOrEqual(runStart(mode, rate, hiSpeed, sudden, lift, visual - songOffset, 97_000));
            }
          }
        }
      }
    }
    // the four seconds kept before fell short at 1.5x and the slowest SPEED
    expect(runStart('time', 1.5, HI_SPEED_MIN, 0, 0, 0, 97_000)).toBeLessThan(96_000 - 4000);
  });

  it('keeps four seconds at the least, and for a segment without notes', () => {
    expect(practicePrerollMs({ notes, timing }, { startMs: 30_000, endMs: 40_000, rate: 0.75 }, 'time', durationMs, 0)).toBe(4000);
    expect(practicePrerollMs({ notes, timing }, { startMs: 96_000, endMs: 100_000, rate: 0.75 }, 'time', durationMs, 0)).toBeGreaterThan(4000);
  });
});
