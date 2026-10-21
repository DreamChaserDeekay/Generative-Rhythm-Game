import { gaugeRules, judgementConfig, sideLanesOf, type GaugeTypeId, type JudgementModeId } from './config';
import type { FeverMode } from './fever';
import { JudgementTable } from './judgement';
import { applyPlacement, type PlacementId } from './placement';
import { Ruleset, type RulesetId } from './ruleset';
import { GameSession } from './session';
import type { Chart } from './types';

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

/**
 * The score a recorded play stood at after each judgement (index: judgements so far), in the
 * unit `ruleset` shows (base score, weighted score or EX-SCORE): a pacemaker that follows a best
 * play note by note. Judged again from its inputs, on the chart as that play placed it and under
 * its own judgement settings. Null for a replay of another chart.
 */
export function replayScores(chart: Chart, replay: ReplayData, ruleset: RulesetId): number[] | null {
  if (replay.chartId !== chart.meta.chartId) return null;
  const s = replay.settings;
  const played = applyPlacement(chart, s.placement, s.placementSeed).chart;
  // the options of a play (PlayController.begin) at the song's own speed
  const session = new GameSession(played, new JudgementTable(judgementConfig, s.judgementMode), {
    gauge: gaugeRules[s.gaugeType] ?? gaugeRules.NORMAL,
    holdTickBeats: judgementConfig.hold.tickBeats,
    releaseGraceMs: judgementConfig.hold.releaseGraceMs,
    missMarginMs: judgementConfig.missMarginMs,
    ruleset: new Ruleset(ruleset),
    sideLanes: sideLanesOf(played.meta.keyMode),
    sideMissPercent: judgementConfig.sideMissPercent,
    fever: s.fever,
  });
  const scoring = session.ruleset.config.scoring;
  const scores = [0];
  session.on((e) => {
    if (e.type !== 'judge') return;
    scores.push(scoring === 'exscore' ? session.currentExScore : scoring === 'weighted' ? session.currentWeightedScore : session.currentScore);
  });
  new ReplayPlayer(replay.log).feed(session, Infinity);
  return scores;
}
