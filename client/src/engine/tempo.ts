import type { ChartTiming } from './types';

const BEAT_EPS = 1e-9;

/**
 * Piecewise-constant tempo map converting between beats and ms. STOPs (imported BMS/bmson charts)
 * pause the beat clock: a note on a stop's beat is hit when the stop starts, later ones move later.
 */
export class TempoMap {
  private readonly startBeat: number[] = [];
  private readonly startMs: number[] = [];
  private readonly msPerBeat: number[] = [];
  private readonly stopBeat: number[] = [];
  private readonly stopMs: number[] = [];
  /** Total length of the stops before stop i. */
  private readonly stopBefore: number[] = [];
  private readonly stopStart: number[] = [];
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
    const stops = [...(timing.stops ?? [])].filter((s) => s.durationMs > 0).sort((a, b) => a.beat - b.beat);
    let total = 0;
    for (const s of stops) {
      this.stopBeat.push(s.beat);
      this.stopMs.push(s.durationMs);
      this.stopBefore.push(total);
      this.stopStart.push(this.plainMs(s.beat) + total);
      total += s.durationMs;
    }
  }

  beatToMs(beat: number): number {
    // stops strictly before `beat`
    let k = 0;
    while (k < this.stopBeat.length && this.stopBeat[k] < beat - BEAT_EPS) k++;
    return this.plainMs(beat) + (k > 0 ? this.stopBefore[k - 1] + this.stopMs[k - 1] : 0);
  }

  msToBeat(ms: number): number {
    if (this.stopStart.length === 0 || ms < this.stopStart[0]) return this.plainBeat(ms);
    const k = lastIndexAtOrBelow(this.stopStart, ms);
    if (ms < this.stopStart[k] + this.stopMs[k]) return this.stopBeat[k];
    return this.plainBeat(ms - this.stopBefore[k] - this.stopMs[k]);
  }

  private plainMs(beat: number): number {
    const i = this.segmentForBeat(beat);
    return this.startMs[i] + (beat - this.startBeat[i]) * this.msPerBeat[i];
  }

  private plainBeat(ms: number): number {
    const i = this.segmentForMs(ms);
    return this.startBeat[i] + (ms - this.startMs[i]) / this.msPerBeat[i];
  }

  bpmAtBeat(beat: number): number {
    return 60000 / this.msPerBeat[this.segmentForBeat(beat)];
  }

  /** Where the BPM (rounded) changes, in song ms; the first one holds from the start. */
  bpmChanges(): { ms: number; bpm: number }[] {
    const out: { ms: number; bpm: number }[] = [];
    for (let i = 0; i < this.startBeat.length; i++) {
      const bpm = Math.round(60000 / this.msPerBeat[i]);
      if (out.length === 0 || out[out.length - 1].bpm !== bpm) out.push({ ms: this.beatToMs(this.startBeat[i]), bpm });
    }
    return out;
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
