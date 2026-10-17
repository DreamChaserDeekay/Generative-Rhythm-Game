import { TempoMap } from './tempo';
import type { ChartTiming } from './types';

export type ScrollMode = 'time' | 'beat';

export interface ScrollOptions {
  trackLength: number;
  /** Real ms a note takes over the whole track length (at the main BPM in beat mode). */
  visibleMs: number;
  /** Share of the track the judgement line is raised by (LIFT). */
  lift: number;
  mode: ScrollMode;
  timing: ChartTiming;
  /** Song ms per real ms (practice playback rate). */
  rate: number;
  durationMs: number;
}

/** The BPM that lasts longest over the song (reference for BPM-linked scrolling). */
export function mainBpm(timing: ChartTiming, durationMs: number): number {
  const tempo = new TempoMap(timing);
  const points = [...timing.tempoMap].sort((a, b) => a.beat - b.beat);
  const lengths = new Map<number, number>();
  points.forEach((p, i) => {
    const start = Math.max(0, tempo.beatToMs(p.beat));
    const end = i + 1 < points.length ? tempo.beatToMs(points[i + 1].beat) : Math.max(start, durationMs);
    lengths.set(p.bpm, (lengths.get(p.bpm) ?? 0) + Math.max(0, end - start));
  });
  let best = points[0].bpm;
  for (const [bpm, ms] of lengths) if (ms > (lengths.get(best) ?? 0)) best = bpm;
  return best;
}

/**
 * Where events sit on the track. Time mode moves notes at a constant speed; beat mode moves them
 * by beat distance so faster sections scroll faster, matching the main BPM in speed.
 */
export class ScrollModel {
  readonly judgeZ: number;
  /** Track length between the far end and the judgement line. */
  readonly travel: number;
  readonly mode: ScrollMode;
  private readonly unitsPerSongMs: number;
  private readonly tempo: TempoMap;
  private readonly msPerMainBeat: number;

  constructor(o: ScrollOptions) {
    this.judgeZ = -o.lift * o.trackLength;
    this.travel = o.trackLength + this.judgeZ;
    this.mode = o.mode;
    this.unitsPerSongMs = o.trackLength / o.visibleMs / o.rate;
    this.tempo = new TempoMap(o.timing);
    this.msPerMainBeat = 60000 / mainBpm(o.timing, o.durationMs);
  }

  /** Distance up the track from the judgement line (negative once the event has passed). */
  distance(eventMs: number, nowMs: number): number {
    if (this.mode === 'time') return (eventMs - nowMs) * this.unitsPerSongMs;
    return (this.tempo.msToBeat(eventMs) - this.tempo.msToBeat(nowMs)) * this.msPerMainBeat * this.unitsPerSongMs;
  }

  z(eventMs: number, nowMs: number): number {
    return this.judgeZ - this.distance(eventMs, nowMs);
  }
}
