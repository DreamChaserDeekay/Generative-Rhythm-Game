import type { JudgementConfig, JudgementModeId } from './config';

export interface Grade {
  percent: number;
  label: string;
  windowMs: number;
}

const EPSILON_MS = 1e-9;

/** DJMAX-style judgement windows, scaled for NORMAL / HARD / MAX JUDGEMENT. */
export class JudgementTable {
  readonly mode: JudgementModeId;
  /** Grades from the tightest (MAX 100%) to the widest (MAX 1%) window. */
  readonly grades: readonly Grade[];
  /** Half-width of the widest graded window (MAX 1%). */
  readonly outerMs: number;
  /** Presses earlier than this (but outside `outerMs`) still consume the note as BREAK. */
  readonly earlyBreakMs: number;
  readonly breakLabel: string;
  readonly topGrade: Grade;

  /**
   * `timeScale` converts real ms to song ms (the practice playback rate), so the windows stay the
   * same length in real time whatever the speed.
   */
  constructor(config: JudgementConfig, mode: JudgementModeId, timeScale = 1) {
    const modeScale = config.modes[mode]?.scale;
    if (modeScale === undefined) throw new Error(`unknown judgement mode: ${mode}`);
    const scale = modeScale * timeScale;
    this.mode = mode;
    this.grades = [...config.grades]
      .sort((a, b) => a.windowMs - b.windowMs)
      .map((g) => ({ percent: g.percent, label: g.label, windowMs: g.windowMs * scale }));
    this.topGrade = this.grades[0];
    this.outerMs = this.grades[this.grades.length - 1].windowMs;
    this.earlyBreakMs = this.outerMs + config.earlyBreakExtraMs * scale;
    this.breakLabel = config.breakLabel;
  }

  /** Grade for a signed timing error (+ = late); null when outside the MAX 1% window. */
  grade(errorMs: number): Grade | null {
    const abs = Math.abs(errorMs);
    for (const g of this.grades) {
      if (abs <= g.windowMs + EPSILON_MS) return g;
    }
    return null;
  }
}
