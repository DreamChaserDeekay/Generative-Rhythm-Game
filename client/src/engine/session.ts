import type { ClearLamp, GaugeRule } from './config';
import { Fever, type FeverMode } from './fever';
import { Gauge, type GaugeSample } from './gauge';
import type { Grade, JudgementTable } from './judgement';
import { Ruleset, type RulesetId, type RulesetRow } from './ruleset';
import { TempoMap } from './tempo';
import type { Chart, NoteType, StemName } from './types';

export type { ClearLamp } from './config';

export type JudgeKind = 'tap' | 'head' | 'tail';

export interface JudgeEvent {
  type: 'judge';
  noteIndex: number;
  lane: number;
  kind: JudgeKind;
  /** DJMAX percent (0 for BREAK). */
  percent: number;
  /** Label and colour class under the active ruleset. */
  label: string;
  cls: string;
  isBreak: boolean;
  comboBreak: boolean;
  /** Signed timing error (+ = late); null when the judgement was not a timed press. */
  errorMs: number | null;
  timeMs: number;
  combo: number;
}

export interface TickEvent {
  type: 'tick';
  noteIndex: number;
  lane: number;
  timeMs: number;
  combo: number;
}

export interface HoldEvent {
  type: 'holdStart' | 'holdEnd';
  noteIndex: number;
  lane: number;
  timeMs: number;
  ok: boolean;
}

export interface KeyEvent {
  type: 'key';
  lane: number;
  down: boolean;
  timeMs: number;
}

export interface FeverEvent {
  type: 'fever';
  active: boolean;
  multiplier: number;
  timeMs: number;
}

export interface FailEvent {
  type: 'fail';
  timeMs: number;
}

export type SessionEvent = JudgeEvent | TickEvent | HoldEvent | KeyEvent | FeverEvent | FailEvent;

export interface HitRecord {
  timeMs: number;
  errorMs: number;
  percent: number;
}

export interface GradeCount {
  label: string;
  percent: number;
  count: number;
}

export interface SessionResult {
  /** Base score out of 1,000,000 from DJMAX percents (comparable across rulesets). */
  score: number;
  rate: number;
  maxCombo: number;
  maxPossibleCombo: number;
  judgeable: number;
  counts: GradeCount[];
  breaks: number;
  comboBreaks: number;
  fast: number;
  slow: number;
  meanErrorMs: number | null;
  medianErrorMs: number | null;
  stdErrorMs: number | null;
  gauge: number;
  gaugeLabel: string;
  gaugeHistory: GaugeSample[];
  cleared: boolean;
  failed: boolean;
  failedAtMs: number | null;
  lamp: ClearLamp;
  hits: HitRecord[];
  breakTimes: number[];
  ruleset: RulesetId;
  rows: RulesetRow[];
  weightedScore: number;
  exScore: number;
  exMax: number;
  rank: string;
  fever: { enabled: boolean; bonus: number; activations: number; bestMultiplier: number };
}

export interface SessionOptions {
  gauge: GaugeRule;
  holdTickBeats: number;
  releaseGraceMs: number;
  missMarginMs: number;
  ruleset?: Ruleset;
  /** Side-track lanes: a miss there counts as `sideMissPercent` instead of BREAK. */
  sideLanes?: number[];
  sideMissPercent?: number;
  fever?: FeverMode;
  /** Song ms per real ms (practice rate); reported timing errors are converted back to real ms. */
  timeScale?: number;
}

/** Runtime state of a note; `index` is its position in time order. */
export interface SessionNote {
  index: number;
  lane: number;
  t: number;
  type: NoteType;
  endT: number;
  ticks: number[];
  nextTick: number;
  headDone: boolean;
  tailDone: boolean;
  broken: boolean;
  /** Stem the note follows (stem keysound mode). */
  src?: StemName;
  /** Keysound of an imported chart (see ChartNote). */
  snd?: number;
  so?: number;
  sl?: number;
}

/**
 * Judges presses/releases against a chart. Times are song times in ms (already corrected by the
 * judgement offset). Input may be fed from event handlers at any moment; `update` is called per frame.
 */
export class GameSession {
  readonly laneCount: number;
  readonly judgeable: number;
  readonly maxPossibleCombo: number;
  readonly gauge: Gauge;
  readonly fever: Fever;
  readonly ruleset: Ruleset;
  combo = 0;
  maxCombo = 0;

  private readonly table: JudgementTable;
  private readonly options: SessionOptions;
  /** Notes in time order with live judgement state (read-only for renderers). */
  readonly notes: readonly Readonly<SessionNote>[];
  private readonly runtime: SessionNote[];
  private readonly laneQueues: number[][];
  private readonly laneNext: number[];
  private readonly holding: (SessionNote | null)[];
  private readonly keyDown: boolean[];
  private readonly sideLanes: Set<number>;
  private readonly sideGrade: Grade | null;
  private readonly listeners: ((e: SessionEvent) => void)[] = [];
  private readonly counts = new Map<number, number>();
  private readonly hits: HitRecord[] = [];
  private readonly breakTimes: number[] = [];
  private sumPercent = 0;
  private sumWeight = 0;
  private exScore = 0;
  private judged = 0;
  private breaks = 0;
  private comboBreaks = 0;
  private fast = 0;
  private slow = 0;
  private remaining: number;
  private failed = false;

  constructor(chart: Chart, table: JudgementTable, options: SessionOptions) {
    this.table = table;
    this.options = options;
    this.ruleset = options.ruleset ?? new Ruleset();
    this.laneCount = chart.meta.lanes.length;
    this.sideLanes = new Set(options.sideLanes ?? []);
    this.sideGrade = table.grades.find((g) => g.percent === (options.sideMissPercent ?? 1)) ?? null;
    const tempo = new TempoMap(chart.timing);

    const sorted = chart.notes
      .map((n, i) => ({ n, i }))
      .sort((a, b) => a.n.t - b.n.t || a.n.lane - b.n.lane || a.i - b.i);
    this.runtime = sorted.map(({ n }, index) => {
      if (n.lane < 0 || n.lane >= this.laneCount) throw new Error(`note lane out of range: ${n.lane}`);
      const isHold = n.type === 'hold' && n.endT !== undefined && n.endT > n.t;
      const endT = isHold ? (n.endT as number) : n.t;
      return {
        index,
        lane: n.lane,
        t: n.t,
        type: isHold ? 'hold' : 'tap',
        endT,
        ticks: isHold ? holdTicks(tempo, n.beat, n.endBeat ?? tempo.msToBeat(endT), options.holdTickBeats) : [],
        nextTick: 0,
        headDone: false,
        tailDone: !isHold,
        broken: false,
        src: n.src,
        snd: n.snd,
        so: n.so,
        sl: n.sl,
      };
    });
    this.notes = this.runtime;

    this.laneQueues = Array.from({ length: this.laneCount }, () => [] as number[]);
    for (const note of this.runtime) this.laneQueues[note.lane].push(note.index);
    this.laneNext = new Array(this.laneCount).fill(0);
    this.holding = new Array(this.laneCount).fill(null);
    this.keyDown = new Array(this.laneCount).fill(false);

    const holds = this.runtime.filter((n) => n.type === 'hold');
    this.judgeable = this.runtime.length + holds.length;
    this.maxPossibleCombo = this.judgeable + holds.reduce((sum, n) => sum + n.ticks.length, 0);
    this.remaining = this.judgeable;
    this.gauge = new Gauge(options.gauge, this.judgeable);
    this.fever = new Fever(options.fever ?? 'OFF', this.judgeable);
    for (const g of table.grades) this.counts.set(g.percent, 0);
  }

  on(listener: (e: SessionEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  get finished(): boolean {
    return this.remaining === 0;
  }

  get hasFailed(): boolean {
    return this.failed;
  }

  /** Judgement events recorded so far (heads, taps and tails). */
  get judgedCount(): number {
    return this.judged;
  }

  /** Average judgement percent so far (DJMAX "Rate"). */
  get currentRate(): number {
    return this.judged > 0 ? this.sumPercent / this.judged : 100;
  }

  /** Base score accumulated so far, out of 1,000,000. */
  get currentScore(): number {
    return this.judgeable > 0 ? Math.round((this.sumPercent / (this.judgeable * 100)) * 1_000_000) : 0;
  }

  /** Grade-weighted score so far (등급형 ruleset), out of 1,000,000. */
  get currentWeightedScore(): number {
    return this.judgeable > 0 ? Math.round((this.sumWeight / this.judgeable) * 1_000_000) : 0;
  }

  get currentExScore(): number {
    return this.exScore;
  }

  /** EX-SCORE of the notes judged so far if they had all been perfect. */
  get exPace(): number {
    return this.judged * 2;
  }

  isKeyDown(lane: number): boolean {
    return this.keyDown[lane] ?? false;
  }

  /** Index (chart order sorted by time) of a hold that is currently being held in `lane`. */
  heldNoteIndex(lane: number): number | null {
    return this.holding[lane]?.index ?? null;
  }

  press(lane: number, timeMs: number): void {
    if (this.failed || lane < 0 || lane >= this.laneCount || this.keyDown[lane]) return;
    this.keyDown[lane] = true;
    this.emit({ type: 'key', lane, down: true, timeMs });

    this.expireLane(lane, timeMs);
    const note = this.peekLane(lane);
    if (!note) return;
    const error = timeMs - note.t;
    if (error < -this.table.earlyBreakMs) return;
    if (error < -this.table.outerMs) {
      this.breakNote(note, timeMs, error);
      return;
    }
    const grade = this.table.grade(error);
    if (!grade) {
      this.breakNote(note, timeMs, error);
      return;
    }
    this.judgeHead(note, grade, error, timeMs);
  }

  release(lane: number, timeMs: number): void {
    if (lane < 0 || lane >= this.laneCount || !this.keyDown[lane]) return;
    this.keyDown[lane] = false;
    this.emit({ type: 'key', lane, down: false, timeMs });
    if (this.failed) return;

    const hold = this.holding[lane];
    if (!hold) return;
    if (timeMs >= hold.endT - this.options.releaseGraceMs) {
      this.completeHold(hold, timeMs);
    } else {
      this.advanceTicks(hold, timeMs);
      this.failHold(hold, timeMs);
    }
  }

  /** Per-frame update: hold ticks, hold completion, late misses and FEVER timing. */
  update(timeMs: number): void {
    if (this.failed) return;
    const settled = timeMs - this.options.missMarginMs;
    for (let lane = 0; lane < this.laneCount; lane++) {
      const hold = this.holding[lane];
      if (hold) {
        if (settled >= hold.endT) this.completeHold(hold, hold.endT);
        else this.advanceTicks(hold, settled);
      }
      this.expireLane(lane, settled);
    }
    const wasActive = this.fever.active;
    this.fever.update(timeMs);
    if (wasActive && !this.fever.active) this.emit({ type: 'fever', active: false, multiplier: 1, timeMs });
  }

  /** MANUAL fever key. */
  activateFever(timeMs: number): boolean {
    if (this.failed || !this.fever.activate(timeMs)) return false;
    this.emit({ type: 'fever', active: true, multiplier: this.fever.multiplier, timeMs });
    return true;
  }

  result(): SessionResult {
    const timed = this.hits.map((h) => h.errorMs);
    const mean = timed.length > 0 ? timed.reduce((a, b) => a + b, 0) / timed.length : null;
    const std =
      mean !== null && timed.length > 1
        ? Math.sqrt(timed.reduce((a, b) => a + (b - mean) ** 2, 0) / (timed.length - 1))
        : null;
    const sortedErrors = [...timed].sort((a, b) => a - b);
    const median = sortedErrors.length > 0 ? sortedErrors[Math.floor(sortedErrors.length / 2)] : null;
    const rate = this.judgeable > 0 ? this.sumPercent / this.judgeable : 0;
    const complete = this.judged === this.judgeable && !this.failed;
    const allTop = complete && (this.counts.get(this.table.topGrade.percent) ?? 0) === this.judgeable;
    let lamp: ClearLamp;
    if (this.failed) lamp = 'FAILED';
    else if (complete && this.comboBreaks === 0) lamp = allTop ? 'PERFECT PLAY' : 'MAX COMBO';
    else lamp = this.gauge.cleared && complete ? this.gauge.rule.lamp : 'FAILED';
    const counts = this.table.grades.map((g) => ({ label: g.label, percent: g.percent, count: this.counts.get(g.percent) ?? 0 }));
    const exMax = this.judgeable * 2;

    return {
      score: this.currentScore,
      rate,
      maxCombo: this.maxCombo,
      maxPossibleCombo: this.maxPossibleCombo,
      judgeable: this.judgeable,
      counts,
      breaks: this.breaks,
      comboBreaks: this.comboBreaks,
      fast: this.fast,
      slow: this.slow,
      meanErrorMs: mean,
      medianErrorMs: median,
      stdErrorMs: std,
      gauge: this.gauge.value,
      gaugeLabel: this.gauge.rule.label,
      gaugeHistory: [...this.gauge.history],
      cleared: this.gauge.cleared,
      failed: this.failed,
      failedAtMs: this.gauge.failedAt,
      lamp,
      hits: [...this.hits],
      breakTimes: [...this.breakTimes],
      ruleset: this.ruleset.id,
      rows: this.ruleset.rows(counts, this.breaks),
      weightedScore: this.currentWeightedScore,
      exScore: this.exScore,
      exMax,
      rank: this.ruleset.rank(exMax > 0 ? this.exScore / exMax : 0),
      fever: {
        enabled: this.fever.enabled,
        bonus: Math.round(this.fever.bonus),
        activations: this.fever.activations,
        bestMultiplier: this.fever.bestMultiplier,
      },
    };
  }

  private peekLane(lane: number): SessionNote | null {
    const queue = this.laneQueues[lane];
    const i = this.laneNext[lane];
    return i < queue.length ? this.runtime[queue[i]] : null;
  }

  private expireLane(lane: number, limitMs: number): void {
    for (let note = this.peekLane(lane); note && !this.failed; note = this.peekLane(lane)) {
      if (note.t + this.table.outerMs >= limitMs) break;
      this.breakNote(note, note.t + this.table.outerMs, null);
    }
  }

  private judgeHead(note: SessionNote, grade: Grade, errorMs: number, timeMs: number): void {
    note.headDone = true;
    this.laneNext[note.lane]++;
    this.record(note, note.type === 'hold' ? 'head' : 'tap', grade.percent, grade.label, false, errorMs, timeMs);
    if (note.type === 'hold') {
      this.holding[note.lane] = note;
      this.emit({ type: 'holdStart', noteIndex: note.index, lane: note.lane, timeMs, ok: true });
    }
  }

  private breakNote(note: SessionNote, timeMs: number, errorMs: number | null): void {
    note.headDone = true;
    note.broken = true;
    this.laneNext[note.lane]++;
    this.record(note, note.type === 'hold' ? 'head' : 'tap', 0, this.table.breakLabel, true, errorMs, timeMs);
    if (note.type === 'hold') {
      note.tailDone = true;
      this.record(note, 'tail', 0, this.table.breakLabel, true, null, timeMs);
    }
  }

  private completeHold(hold: SessionNote, timeMs: number): void {
    this.advanceTicks(hold, hold.endT);
    hold.tailDone = true;
    this.holding[hold.lane] = null;
    const top = this.table.topGrade;
    this.record(hold, 'tail', top.percent, top.label, false, null, timeMs);
    this.emit({ type: 'holdEnd', noteIndex: hold.index, lane: hold.lane, timeMs, ok: true });
  }

  private failHold(hold: SessionNote, timeMs: number): void {
    hold.tailDone = true;
    hold.broken = true;
    this.holding[hold.lane] = null;
    this.record(hold, 'tail', 0, this.table.breakLabel, true, null, timeMs);
    this.emit({ type: 'holdEnd', noteIndex: hold.index, lane: hold.lane, timeMs, ok: false });
  }

  private advanceTicks(hold: SessionNote, upToMs: number): void {
    while (hold.nextTick < hold.ticks.length && hold.ticks[hold.nextTick] <= upToMs) {
      const tickTime = hold.ticks[hold.nextTick];
      hold.nextTick++;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.fever.onTick(tickTime);
      this.emitFeverStart(tickTime);
      this.emit({ type: 'tick', noteIndex: hold.index, lane: hold.lane, timeMs: tickTime, combo: this.combo });
    }
  }

  private record(
    note: SessionNote,
    kind: JudgeKind,
    percent: number,
    label: string,
    isBreak: boolean,
    errorMs: number | null,
    timeMs: number,
  ): void {
    if (errorMs !== null) errorMs /= this.options.timeScale ?? 1;
    if (isBreak && this.sideGrade && this.sideLanes.has(note.lane)) {
      // DJMAX (PC): a missed side-track note is MAX 1%, never BREAK.
      percent = this.sideGrade.percent;
      label = this.sideGrade.label;
      isBreak = false;
      errorMs = null;
    }
    const c = this.ruleset.classify(percent, isBreak, label);
    this.judged++;
    this.remaining--;
    this.sumPercent += percent;
    this.sumWeight += c.weight;
    this.exScore += c.ex;
    if (isBreak) {
      this.breaks++;
      this.breakTimes.push(timeMs);
    } else {
      this.counts.set(percent, (this.counts.get(percent) ?? 0) + 1);
      if (errorMs !== null) {
        this.hits.push({ timeMs, errorMs, percent });
        if (percent < this.table.topGrade.percent) {
          if (errorMs < 0) this.fast++;
          else this.slow++;
        }
      }
    }
    if (c.breaksCombo) {
      this.combo = 0;
      this.comboBreaks++;
    } else {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
    }
    const feverWasActive = this.fever.active;
    this.fever.onJudge(percent, isBreak, timeMs);
    if (feverWasActive && !this.fever.active) this.emit({ type: 'fever', active: false, multiplier: 1, timeMs });
    this.emitFeverStart(timeMs);
    this.gauge.apply(percent, isBreak, timeMs);
    this.emit({
      type: 'judge',
      noteIndex: note.index,
      lane: note.lane,
      kind,
      percent,
      label: c.label,
      cls: c.cls,
      isBreak,
      comboBreak: c.breaksCombo,
      errorMs,
      timeMs,
      combo: this.combo,
    });
    if (this.gauge.hasFailed && !this.failed) {
      this.failed = true;
      this.emit({ type: 'fail', timeMs });
    }
  }

  private feverAnnounced = 0;

  /** Emit a fever start once per activation (AUTO mode fires inside onJudge/onTick). */
  private emitFeverStart(timeMs: number): void {
    if (this.fever.active && this.fever.activations !== this.feverAnnounced) {
      this.feverAnnounced = this.fever.activations;
      this.emit({ type: 'fever', active: true, multiplier: this.fever.multiplier, timeMs });
    }
  }

  private emit(event: SessionEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

/** Tick times strictly between the head and the tail, on multiples of `tickBeats`. */
function holdTicks(tempo: TempoMap, startBeat: number, endBeat: number, tickBeats: number): number[] {
  const ticks: number[] = [];
  if (tickBeats <= 0) return ticks;
  const first = Math.floor(startBeat / tickBeats + 1e-6) + 1;
  for (let k = first; k * tickBeats < endBeat - 1e-6; k++) ticks.push(tempo.beatToMs(k * tickBeats));
  return ticks;
}
