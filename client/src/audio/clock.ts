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
  /** Whether the offset came from an output timestamp yet (the first is taken as it is, not eased into). */
  private stamped = false;
  private readonly source: AudioTimeSource;
  private readonly now: () => number;

  constructor(source: AudioTimeSource, now: () => number = () => performance.now()) {
    this.source = source;
    this.now = now;
  }

  /** Refresh the mapping; call once per frame (cheap). */
  sample(): void {
    const { ms: measured, stamped } = this.measure();
    // the first output timestamp replaces the guess from currentTime outright: eased into, a guess
    // up to RESYNC_THRESHOLD_MS off would judge the song's first second by it
    const first = stamped && !this.stamped;
    if (this.offsetMs === null || first || Math.abs(measured - this.offsetMs) > RESYNC_THRESHOLD_MS) {
      this.offsetMs = measured;
    } else {
      this.offsetMs += (measured - this.offsetMs) * SMOOTHING;
    }
    if (stamped) this.stamped = true;
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

  private measure(): { ms: number; stamped: boolean } {
    const ts = this.source.getOutputTimestamp?.();
    if (ts && ts.contextTime !== undefined && ts.performanceTime !== undefined && ts.contextTime > 0 && ts.performanceTime > 0) {
      return { ms: ts.contextTime * 1000 - ts.performanceTime, stamped: true };
    }
    const latency = this.source.outputLatency || this.source.baseLatency || 0;
    return { ms: (this.source.currentTime - latency) * 1000 - this.now(), stamped: false };
  }
}
