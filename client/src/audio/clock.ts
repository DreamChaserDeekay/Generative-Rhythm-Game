/** The subset of AudioContext the clock needs (lets tests use a fake). */
export interface AudioTimeSource {
  readonly currentTime: number;
  readonly outputLatency?: number;
  readonly baseLatency?: number;
  getOutputTimestamp?: () => AudioTimestamp;
}

/** Maps song time (ms) to and from the `performance.now()` timeline. */
export interface SongClock {
  songTimeAtPerf(perfMs: number): number;
  perfAtSongTime(songMs: number): number;
}

const RESYNC_THRESHOLD_MS = 50;
const SMOOTHING = 0.05;

/**
 * Tracks the offset between the audible audio output time and `performance.now()`.
 * `getOutputTimestamp()` pairs a context time with the moment it reaches the speakers, so the
 * mapping already includes output latency. The offset is smoothed to remove quantum jitter and
 * re-anchored immediately when it jumps (device change, suspend).
 */
export class AudioClock {
  private offsetMs: number | null = null;
  private readonly source: AudioTimeSource;
  private readonly now: () => number;

  constructor(source: AudioTimeSource, now: () => number = () => performance.now()) {
    this.source = source;
    this.now = now;
  }

  /** Refresh the mapping; call once per frame (cheap). */
  sample(): void {
    const measured = this.measure();
    if (this.offsetMs === null || Math.abs(measured - this.offsetMs) > RESYNC_THRESHOLD_MS) {
      this.offsetMs = measured;
    } else {
      this.offsetMs += (measured - this.offsetMs) * SMOOTHING;
    }
  }

  /** Audible context time (seconds) at a `performance.now()` instant. */
  contextTimeAtPerf(perfMs: number): number {
    return (perfMs + this.offset()) / 1000;
  }

  /** `performance.now()` instant at which the given context time (seconds) is audible. */
  perfAtContextTime(contextSec: number): number {
    return contextSec * 1000 - this.offset();
  }

  private offset(): number {
    if (this.offsetMs === null) this.sample();
    return this.offsetMs as number;
  }

  private measure(): number {
    const ts = this.source.getOutputTimestamp?.();
    if (ts && ts.contextTime !== undefined && ts.performanceTime !== undefined && ts.contextTime > 0 && ts.performanceTime > 0) {
      return ts.contextTime * 1000 - ts.performanceTime;
    }
    const latency = this.source.outputLatency || this.source.baseLatency || 0;
    return (this.source.currentTime - latency) * 1000 - this.now();
  }
}
