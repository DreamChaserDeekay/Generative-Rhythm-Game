import type { GaugeTypeId, JudgementModeId } from './config';
import type { FeverMode } from './fever';
import type { PlacementId } from './placement';
import type { RulesetId } from './ruleset';
import type { GameSession } from './session';

export const REPLAY_VERSION = 1;

/**
 * Operations reaching the judgement engine, in the order they reached it. `Update` is a per-frame
 * update that changed something (late misses, hold ticks and ends, the end of FEVER).
 */
export const ReplayOp = { Release: 0, Press: 1, Update: 2, Fever: 3 } as const;

/** Settings the judgement depends on, plus the hi-speed the player used. */
export interface ReplaySettings {
  judgementMode: JudgementModeId;
  ruleset: RulesetId;
  gaugeType: GaugeTypeId;
  fever: FeverMode;
  placement: PlacementId;
  placementSeed: number;
  hiSpeed: number;
}

export interface ReplayData {
  version: typeof REPLAY_VERSION;
  chartId: string;
  songId: string | null;
  recordedAt: number;
  settings: ReplaySettings;
  /** Flat [op, lane, judgement time ms] triples. */
  log: number[];
  result: { score: number; rate: number; maxCombo: number; lamp: string };
}

/**
 * Sits between the input and the session and logs every call that can change the outcome.
 * Feeding the same calls, in the same order, to a fresh session gives the same result exactly,
 * whatever the frame timing of the replay.
 */
export class ReplayRecorder {
  readonly log: number[] = [];
  private readonly session: GameSession;
  private events = 0;

  constructor(session: GameSession) {
    this.session = session;
    session.on(() => this.events++);
  }

  press(lane: number, timeMs: number): void {
    this.log.push(ReplayOp.Press, lane, timeMs);
    this.session.press(lane, timeMs);
  }

  release(lane: number, timeMs: number): void {
    this.log.push(ReplayOp.Release, lane, timeMs);
    this.session.release(lane, timeMs);
  }

  /** Per-frame update; logged only when it changed something (most frames do not). */
  update(timeMs: number): void {
    const before = this.events;
    this.session.update(timeMs);
    if (this.events !== before) this.log.push(ReplayOp.Update, 0, timeMs);
  }

  activateFever(timeMs: number): boolean {
    const ok = this.session.activateFever(timeMs);
    if (ok) this.log.push(ReplayOp.Fever, 0, timeMs);
    return ok;
  }
}

/** Feeds a recorded log back into a session as song time passes. */
export class ReplayPlayer {
  private readonly log: readonly number[];
  private next = 0;

  constructor(log: readonly number[]) {
    if (log.length % 3 !== 0) throw new Error('리플레이 데이터가 손상되었습니다');
    this.log = log;
  }

  get done(): boolean {
    return this.next >= this.log.length;
  }

  /** Apply the recorded calls up to `upToMs` (in recorded order); `onPress` sees every press. */
  feed(session: GameSession, upToMs: number, onPress?: (lane: number, timeMs: number) => void): void {
    const log = this.log;
    while (this.next < log.length && log[this.next + 2] <= upToMs) {
      const op = log[this.next];
      const lane = log[this.next + 1];
      const t = log[this.next + 2];
      this.next += 3;
      if (op === ReplayOp.Press) {
        session.press(lane, t);
        onPress?.(lane, t);
      } else if (op === ReplayOp.Release) session.release(lane, t);
      else if (op === ReplayOp.Update) session.update(t);
      else if (op === ReplayOp.Fever) session.activateFever(t);
    }
  }
}

/** Basic shape check for replays loaded from the server or a file. */
export function isReplay(x: unknown): x is ReplayData {
  const r = x as ReplayData;
  return (
    typeof r === 'object' &&
    r !== null &&
    r.version === REPLAY_VERSION &&
    typeof r.chartId === 'string' &&
    Array.isArray(r.log) &&
    r.log.length % 3 === 0 &&
    r.log.every((v) => typeof v === 'number' && Number.isFinite(v)) &&
    typeof r.settings === 'object' &&
    r.settings !== null
  );
}
