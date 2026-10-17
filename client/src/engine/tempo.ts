import type { ChartTiming } from './types';

/** Piecewise-constant tempo map converting between beats and ms. */
export class TempoMap {
  private readonly startBeat: number[] = [];
  private readonly startMs: number[] = [];
  private readonly msPerBeat: number[] = [];
  private readonly timing: ChartTiming;

  constructor(timing: ChartTiming) {
    this.timing = timing;
    const points = [...timing.tempoMap].sort((a, b) => a.beat - b.beat);
    if (points.length === 0 || points[0].beat > 0) {
      throw new Error('tempoMap must start at beat 0');
    }
    let ms = timing.offsetMs;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (i > 0) {
        const prev = points[i - 1];
        ms += (p.beat - prev.beat) * (60000 / prev.bpm);
      }
      this.startBeat.push(p.beat);
      this.startMs.push(ms);
      this.msPerBeat.push(60000 / p.bpm);
    }
  }

  beatToMs(beat: number): number {
    const i = this.segmentForBeat(beat);
    return this.startMs[i] + (beat - this.startBeat[i]) * this.msPerBeat[i];
  }

  msToBeat(ms: number): number {
    const i = this.segmentForMs(ms);
    return this.startBeat[i] + (ms - this.startMs[i]) / this.msPerBeat[i];
  }

  bpmAtBeat(beat: number): number {
    return 60000 / this.msPerBeat[this.segmentForBeat(beat)];
  }

  /** Measure start times (ms) from beat 0 up to `untilMs`. */
  barLines(untilMs: number): number[] {
    const meter = [...this.timing.meter].sort((a, b) => a.measure - b.measure);
    const out: number[] = [];
    let beat = 0;
    let measure = 0;
    let m = 0;
    let beatsPerMeasure = meter.length > 0 && meter[0].measure <= 0 ? meter[0].beatsPerMeasure : 4;
    for (;;) {
      while (m < meter.length && meter[m].measure <= measure) {
        beatsPerMeasure = meter[m].beatsPerMeasure;
        m++;
      }
      const t = this.beatToMs(beat);
      if (t > untilMs) break;
      out.push(t);
      beat += beatsPerMeasure;
      measure++;
    }
    return out;
  }

  private segmentForBeat(beat: number): number {
    return lastIndexAtOrBelow(this.startBeat, beat);
  }

  private segmentForMs(ms: number): number {
    return lastIndexAtOrBelow(this.startMs, ms);
  }
}

/** Index of the last element <= value (0 when value precedes all elements). */
function lastIndexAtOrBelow(sorted: number[], value: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (sorted[mid] <= value) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
