import type { GaugeRule } from './config';
import { Gauge } from './gauge';
import type { Grade, JudgementTable } from './judgement';
import { TempoMap } from './tempo';
import type { Chart, NoteType } from './types';

export type JudgeKind = 'tap' | 'head' | 'tail';

export interface JudgeEvent {
  type: 'judge';
  noteIndex: number;
  lane: number;
  kind: JudgeKind;
  percent: number;
  label: string;
  isBreak: boolean;
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

export type SessionEvent = JudgeEvent | TickEvent | HoldEvent | KeyEvent;

export type ClearLamp = 'PERFECT PLAY' | 'MAX COMBO' | 'CLEAR' | 'FAILED';

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
  score: number;
  rate: number;
  maxCombo: number;
  maxPossibleCombo: number;
  judgeable: number;
  counts: GradeCount[];
  breaks: number;
  fast: number;
  slow: number;
  meanErrorMs: number | null;
  stdErrorMs: number | null;
  gauge: number;
  cleared: boolean;
  lamp: ClearLamp;
  hits: HitRecord[];
  breakTimes: number[];
}

export interface SessionOptions {
  gauge: GaugeRule;
  holdTickBeats: number;
  releaseGraceMs: number;
  missMarginMs: number;
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
  private readonly listeners: ((e: SessionEvent) => void)[] = [];
  private readonly counts = new Map<number, number>();
  private readonly hits: HitRecord[] = [];
  private readonly breakTimes: number[] = [];
  private sumPercent = 0;
  private judged = 0;
  private breaks = 0;
  private fast = 0;
  private slow = 0;
  private remaining: number;

  constructor(chart: Chart, table: JudgementTable, options: SessionOptions) {
    this.table = table;
    this.options = options;
    this.laneCount = chart.meta.lanes.length;
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

  /** Average judgement percent so far (DJMAX "Rate"). */
  get currentRate(): number {
    return this.judged > 0 ? this.sumPercent / this.judged : 100;
  }

  /** Score accumulated so far, out of 1,000,000. */
  get currentScore(): number {
    return this.judgeable > 0 ? Math.round((this.sumPercent / (this.judgeable * 100)) * 1_000_000) : 0;
  }

  isKeyDown(lane: number): boolean {
    return this.keyDown[lane] ?? false;
  }

  /** Index (chart order sorted by time) of a hold that is currently being held in `lane`. */
  heldNoteIndex(lane: number): number | null {
    return this.holding[lane]?.index ?? null;
  }

  press(lane: number, timeMs: number): void {
    if (lane < 0 || lane >= this.laneCount || this.keyDown[lane]) return;
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

    const hold = this.holding[lane];
    if (!hold) return;
    if (timeMs >= hold.endT - this.options.releaseGraceMs) {
      this.completeHold(hold, timeMs);
    } else {
      this.advanceTicks(hold, timeMs);
      this.failHold(hold, timeMs);
    }
  }

  /** Per-frame update: hold ticks, hold completion and late misses. */
  update(timeMs: number): void {
    const settled = timeMs - this.options.missMarginMs;
    for (let lane = 0; lane < this.laneCount; lane++) {
      const hold = this.holding[lane];
      if (hold) {
        if (settled >= hold.endT) this.completeHold(hold, hold.endT);
        else this.advanceTicks(hold, settled);
      }
      this.expireLane(lane, settled);
    }
  }

  result(): SessionResult {
    const timed = this.hits.map((h) => h.errorMs);
    const mean = timed.length > 0 ? timed.reduce((a, b) => a + b, 0) / timed.length : null;
    const std =
      mean !== null && timed.length > 1
        ? Math.sqrt(timed.reduce((a, b) => a + (b - mean) ** 2, 0) / (timed.length - 1))
        : null;
    const rate = this.judgeable > 0 ? this.sumPercent / this.judgeable : 0;
    const allTop = this.judged === this.judgeable && (this.counts.get(this.table.topGrade.percent) ?? 0) === this.judgeable;
    let lamp: ClearLamp;
    if (this.judged === this.judgeable && this.breaks === 0) lamp = allTop ? 'PERFECT PLAY' : 'MAX COMBO';
    else lamp = this.gauge.cleared ? 'CLEAR' : 'FAILED';

    return {
      score: this.currentScore,
      rate,
      maxCombo: this.maxCombo,
      maxPossibleCombo: this.maxPossibleCombo,
      judgeable: this.judgeable,
      counts: this.table.grades.map((g) => ({ label: g.label, percent: g.percent, count: this.counts.get(g.percent) ?? 0 })),
      breaks: this.breaks,
      fast: this.fast,
      slow: this.slow,
      meanErrorMs: mean,
      stdErrorMs: std,
      gauge: this.gauge.value,
      cleared: this.gauge.cleared,
      lamp,
      hits: [...this.hits],
      breakTimes: [...this.breakTimes],
    };
  }

  private peekLane(lane: number): SessionNote | null {
    const queue = this.laneQueues[lane];
    const i = this.laneNext[lane];
    return i < queue.length ? this.runtime[queue[i]] : null;
  }

  private expireLane(lane: number, limitMs: number): void {
    for (let note = this.peekLane(lane); note; note = this.peekLane(lane)) {
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
    this.judged++;
    this.remaining--;
    this.sumPercent += percent;
    if (isBreak) {
      this.combo = 0;
      this.breaks++;
      this.breakTimes.push(timeMs);
    } else {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.counts.set(percent, (this.counts.get(percent) ?? 0) + 1);
      if (errorMs !== null) {
        this.hits.push({ timeMs, errorMs, percent });
        if (percent < this.table.topGrade.percent) {
          if (errorMs < 0) this.fast++;
          else this.slow++;
        }
      }
    }
    this.gauge.apply(percent, isBreak);
    this.emit({
      type: 'judge',
      noteIndex: note.index,
      lane: note.lane,
      kind,
      percent,
      label,
      isBreak,
      errorMs,
      timeMs,
      combo: this.combo,
    });
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
