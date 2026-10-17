import type { SongClock } from '../audio/clock';

export interface LaneInputSink {
  press(lane: number, timeMs: number): void;
  release(lane: number, timeMs: number): void;
}

/** Event timestamps further than this from "now" are treated as unreliable. */
const MAX_TIMESTAMP_SKEW_MS = 1000;

/**
 * Maps physical keys (`KeyboardEvent.code`, so Korean IME state does not matter) and gamepad
 * controls (`Pad:…` codes fed through `handleKey`) to lanes, and converts event timestamps to
 * judgement time: song time minus the input offset.
 */
export class InputManager {
  enabled = true;
  private readonly clock: SongClock;
  private readonly sink: LaneInputSink;
  private readonly inputOffsetMs: number;
  private readonly laneByCode = new Map<string, number>();
  private readonly downCodes = new Set<string>();
  private readonly laneDown: number[];
  private target: Window | null = null;

  constructor(clock: SongClock, bindings: string[], sink: LaneInputSink, inputOffsetMs: number, padBindings: readonly (string | null)[] = []) {
    this.clock = clock;
    this.sink = sink;
    this.inputOffsetMs = inputOffsetMs;
    bindings.forEach((code, lane) => this.laneByCode.set(code, lane));
    padBindings.forEach((code, lane) => code && this.laneByCode.set(code, lane));
    this.laneDown = new Array(bindings.length).fill(0);
  }

  attach(target: Window = window): void {
    this.target = target;
    target.addEventListener('keydown', this.onKeyDown, { capture: true });
    target.addEventListener('keyup', this.onKeyUp, { capture: true });
    target.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    if (!this.target) return;
    this.target.removeEventListener('keydown', this.onKeyDown, { capture: true });
    this.target.removeEventListener('keyup', this.onKeyUp, { capture: true });
    this.target.removeEventListener('blur', this.onBlur);
    this.target = null;
  }

  /** Release every held key, e.g. when pausing or losing focus. */
  releaseAll(perfMs: number = performance.now()): void {
    for (const code of [...this.downCodes]) this.handleKey(code, false, perfMs);
  }

  /** Feed a key transition stamped on the `performance.now()` timeline. Returns true if bound. */
  handleKey(code: string, down: boolean, perfMs: number): boolean {
    const lane = this.laneByCode.get(code);
    if (lane === undefined) return false;
    if (down) {
      if (this.downCodes.has(code)) return true;
      this.downCodes.add(code);
      this.laneDown[lane]++;
      if (this.laneDown[lane] === 1) this.dispatch(lane, true, perfMs);
    } else {
      if (!this.downCodes.delete(code)) return true;
      this.laneDown[lane]--;
      if (this.laneDown[lane] === 0) this.dispatch(lane, false, perfMs);
    }
    return true;
  }

  /** Inject a lane transition at a song time through the same timestamp conversion as real keys. */
  injectAt(lane: number, down: boolean, songMs: number): void {
    this.dispatch(lane, down, this.clock.perfAtSongTime(songMs + this.inputOffsetMs));
  }

  private dispatch(lane: number, down: boolean, perfMs: number): void {
    if (!this.enabled) return;
    const timeMs = this.clock.songTimeAtPerf(perfMs) - this.inputOffsetMs;
    if (down) this.sink.press(lane, timeMs);
    else this.sink.release(lane, timeMs);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.laneByCode.has(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    this.handleKey(e.code, true, eventTime(e));
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (!this.laneByCode.has(e.code)) return;
    e.preventDefault();
    this.handleKey(e.code, false, eventTime(e));
  };

  private readonly onBlur = (): void => this.releaseAll();
}

function eventTime(e: Event): number {
  const now = performance.now();
  return Math.abs(e.timeStamp - now) <= MAX_TIMESTAMP_SKEW_MS ? e.timeStamp : now;
}
