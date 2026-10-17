import type { Chart } from './types';

export interface AutoInput {
  lane: number;
  down: boolean;
  timeMs: number;
}

const TAP_HOLD_MS = 40;

/**
 * Generates perfectly timed presses/releases for a chart. The inputs are meant to be injected
 * through the same input path as the keyboard so that the whole timing pipeline is exercised.
 */
export class AutoPlayer {
  private readonly inputs: AutoInput[];
  private next = 0;

  constructor(chart: Chart) {
    const byLane = new Map<number, { t: number; end: number }[]>();
    for (const n of chart.notes) {
      const end = n.type === 'hold' && n.endT !== undefined ? n.endT : n.t;
      const list = byLane.get(n.lane) ?? [];
      list.push({ t: n.t, end });
      byLane.set(n.lane, list);
    }
    const inputs: AutoInput[] = [];
    for (const [lane, notes] of byLane) {
      notes.sort((a, b) => a.t - b.t);
      notes.forEach((n, i) => {
        const nextStart = i + 1 < notes.length ? notes[i + 1].t : Infinity;
        const release =
          n.end > n.t ? n.end : Math.min(n.t + TAP_HOLD_MS, n.t + Math.max(1, (nextStart - n.t) / 2));
        inputs.push({ lane, down: true, timeMs: n.t }, { lane, down: false, timeMs: release });
      });
    }
    // Releases first on ties so a lane can be pressed again at the same instant.
    inputs.sort((a, b) => a.timeMs - b.timeMs || Number(a.down) - Number(b.down));
    this.inputs = inputs;
  }

  /** Inputs due at or before `upToMs`, in time order. */
  take(upToMs: number): AutoInput[] {
    const out: AutoInput[] = [];
    while (this.next < this.inputs.length && this.inputs[this.next].timeMs <= upToMs) {
      out.push(this.inputs[this.next++]);
    }
    return out;
  }

  /** Restart from the first input at or after `fromMs` (used after seeking). */
  seek(fromMs: number): void {
    this.next = this.inputs.findIndex((i) => i.timeMs >= fromMs);
    if (this.next < 0) this.next = this.inputs.length;
  }
}
