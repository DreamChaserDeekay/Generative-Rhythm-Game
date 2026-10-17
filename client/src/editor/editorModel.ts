import { TempoMap } from '../engine/tempo';
import type { Chart, ChartNote, NoteType, StemName } from '../engine/types';

/** A note being edited. Times are ms on the song timeline; `id` is stable across edits. */
export interface EditNote {
  readonly id: number;
  readonly lane: number;
  readonly t: number;
  readonly type: NoteType;
  readonly endT?: number;
  readonly src?: StemName;
  readonly snd?: number;
  readonly so?: number;
  readonly sl?: number;
}

/** Grid divisions of a beat the editor snaps to (4 = sixteenth notes in 4/4). */
export const SNAP_DIVISIONS = [1, 2, 3, 4, 6, 8, 12, 16] as const;
export type SnapDivision = (typeof SNAP_DIVISIONS)[number];

const TIME_EPS = 1e-3;
const MAX_UNDO = 200;

export type EditResult = { ok: true } | { ok: false; reason: string };

const OK: EditResult = { ok: true };

/** End of a note's footprint on its lane. */
function endOf(n: EditNote): number {
  return n.type === 'hold' && n.endT !== undefined ? n.endT : n.t;
}

/** True when two notes on the same lane touch (same time, or one inside the other's hold). */
function collide(a: EditNote, b: EditNote): boolean {
  if (a.lane !== b.lane) return false;
  return a.t <= endOf(b) + TIME_EPS && b.t <= endOf(a) + TIME_EPS;
}

function byTime(a: EditNote, b: EditNote): number {
  return a.t - b.t || a.lane - b.lane || a.id - b.id;
}

/**
 * The editor's document: notes on a fixed timing, with snapping, validation (no note may touch
 * another on its lane) and undo/redo. Every edit either applies whole or is refused with a reason.
 */
export class EditorDoc {
  readonly laneCount: number;
  readonly tempo: TempoMap;
  private notesValue: readonly EditNote[];
  private nextId: number;
  private readonly undoStack: (readonly EditNote[])[] = [];
  private readonly redoStack: (readonly EditNote[])[] = [];
  /** Changes since the last save. */
  dirty = false;

  constructor(chart: Pick<Chart, 'notes' | 'timing'>, laneCount: number) {
    this.laneCount = laneCount;
    this.tempo = new TempoMap(chart.timing);
    let id = 1;
    this.notesValue = chart.notes
      .map((n): EditNote => ({ id: id++, lane: n.lane, t: n.t, type: n.type, endT: n.type === 'hold' ? n.endT : undefined, src: n.src, snd: n.snd, so: n.so, sl: n.sl }))
      .sort(byTime);
    this.nextId = id;
  }

  get notes(): readonly EditNote[] {
    return this.notesValue;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Nearest grid position (ms) to `ms` at `division` steps per beat. */
  snap(ms: number, division: number): number {
    const beat = Math.round(this.tempo.msToBeat(ms) * division) / division;
    return this.tempo.beatToMs(beat);
  }

  /** The grid position `steps` grid steps away from `ms` (snapped first). */
  step(ms: number, steps: number, division: number): number {
    const beat = Math.round(this.tempo.msToBeat(ms) * division) / division + steps / division;
    return this.tempo.beatToMs(beat);
  }

  noteAt(lane: number, ms: number, toleranceMs = 0): EditNote | null {
    for (const n of this.notesValue) {
      if (n.lane === lane && ms >= n.t - toleranceMs && ms <= endOf(n) + toleranceMs) return n;
    }
    return null;
  }

  add(lane: number, t: number, endT?: number): EditResult {
    if (lane < 0 || lane >= this.laneCount) return { ok: false, reason: '레인 범위 밖입니다' };
    const hold = endT !== undefined && endT > t + TIME_EPS;
    const note: EditNote = { id: this.nextId, lane, t, type: hold ? 'hold' : 'tap', endT: hold ? endT : undefined };
    if (this.notesValue.some((n) => collide(n, note))) return { ok: false, reason: '그 자리에 이미 노트가 있습니다' };
    this.nextId++;
    this.commit([...this.notesValue, note]);
    return OK;
  }

  remove(ids: Iterable<number>): EditResult {
    const drop = new Set(ids);
    if (drop.size === 0) return { ok: false, reason: '선택한 노트가 없습니다' };
    this.commit(this.notesValue.filter((n) => !drop.has(n.id)));
    return OK;
  }

  /** Move notes by whole lanes and grid steps; refused if any would leave the track or collide. */
  move(ids: Iterable<number>, laneDelta: number, steps: number, division: number): EditResult {
    const set = new Set(ids);
    if (set.size === 0) return { ok: false, reason: '선택한 노트가 없습니다' };
    const moved: EditNote[] = [];
    for (const n of this.notesValue) {
      if (!set.has(n.id)) continue;
      const lane = n.lane + laneDelta;
      if (lane < 0 || lane >= this.laneCount) return { ok: false, reason: '레인 범위 밖으로 옮길 수 없습니다' };
      const t = steps === 0 ? n.t : this.step(n.t, steps, division);
      const endT = n.endT === undefined ? undefined : steps === 0 ? n.endT : this.step(n.endT, steps, division);
      if (t < 0) return { ok: false, reason: '곡 시작 전으로 옮길 수 없습니다' };
      moved.push({ ...n, lane, t, endT });
    }
    return this.replaceWith(set, moved);
  }

  /** Mirror notes left-right inside `lanes` (key lanes; scratch/side lanes stay put). */
  mirror(ids: Iterable<number>, lanes: readonly number[]): EditResult {
    const set = new Set(ids);
    const map = new Map(lanes.map((lane, i) => [lane, lanes[lanes.length - 1 - i]]));
    const moved = this.notesValue.filter((n) => set.has(n.id)).map((n) => ({ ...n, lane: map.get(n.lane) ?? n.lane }));
    if (moved.length === 0) return { ok: false, reason: '선택한 노트가 없습니다' };
    return this.replaceWith(set, moved);
  }

  /** Turn a tap into a hold ending at `endT`, or a hold into a tap (`endT` undefined). */
  setEnd(id: number, endT: number | undefined): EditResult {
    const n = this.notesValue.find((x) => x.id === id);
    if (!n) return { ok: false, reason: '노트가 없습니다' };
    const hold = endT !== undefined && endT > n.t + TIME_EPS;
    return this.replaceWith(new Set([id]), [{ ...n, type: hold ? 'hold' : 'tap', endT: hold ? endT : undefined }]);
  }

  /** Copy of notes positioned relative to the earliest one (in beats, so pasting follows tempo). */
  copy(ids: Iterable<number>): ClipNote[] {
    const set = new Set(ids);
    const picked = this.notesValue.filter((n) => set.has(n.id));
    if (picked.length === 0) return [];
    const base = this.tempo.msToBeat(Math.min(...picked.map((n) => n.t)));
    return picked.map((n) => ({
      lane: n.lane,
      beat: this.tempo.msToBeat(n.t) - base,
      endBeat: n.endT === undefined ? undefined : this.tempo.msToBeat(n.endT) - base,
      snd: n.snd,
      src: n.src,
    }));
  }

  /** Paste copied notes with the earliest at `atMs`; returns the new ids. */
  paste(clip: readonly ClipNote[], atMs: number): EditResult & { ids?: number[] } {
    if (clip.length === 0) return { ok: false, reason: '복사한 노트가 없습니다' };
    const base = this.tempo.msToBeat(atMs);
    const added: EditNote[] = clip.map((c) => {
      const t = this.tempo.beatToMs(base + c.beat);
      const endT = c.endBeat === undefined ? undefined : this.tempo.beatToMs(base + c.endBeat);
      return { id: this.nextId++, lane: c.lane, t, type: endT === undefined ? 'tap' : 'hold', endT, snd: c.snd, src: c.src };
    });
    if (added.some((a) => a.lane < 0 || a.lane >= this.laneCount)) return { ok: false, reason: '레인 범위 밖입니다' };
    const all = [...this.notesValue, ...added];
    if (added.some((a) => all.some((n) => n.id !== a.id && collide(n, a)))) return { ok: false, reason: '붙여 넣을 자리에 노트가 있습니다' };
    this.commit(all);
    return { ok: true, ids: added.map((a) => a.id) };
  }

  undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.redoStack.push(this.notesValue);
    this.notesValue = prev;
    this.dirty = true;
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(this.notesValue);
    this.notesValue = next;
    this.dirty = true;
    return true;
  }

  /** Notes in chart form (beats from the timing), ready to save or play. */
  toChartNotes(): ChartNote[] {
    return this.notesValue.map((n) => {
      const note: ChartNote = { beat: round6(this.tempo.msToBeat(n.t)), t: round3(n.t), lane: n.lane, type: n.type };
      if (n.type === 'hold' && n.endT !== undefined) {
        note.endBeat = round6(this.tempo.msToBeat(n.endT));
        note.endT = round3(n.endT);
      }
      if (n.src !== undefined) note.src = n.src;
      if (n.snd !== undefined) note.snd = n.snd;
      if (n.so !== undefined) note.so = n.so;
      if (n.sl !== undefined) note.sl = n.sl;
      return note;
    });
  }

  private replaceWith(ids: Set<number>, moved: EditNote[]): EditResult {
    const rest = this.notesValue.filter((n) => !ids.has(n.id));
    for (let i = 0; i < moved.length; i++) {
      if (rest.some((n) => collide(n, moved[i])) || moved.some((m, j) => j !== i && collide(m, moved[i]))) {
        return { ok: false, reason: '다른 노트와 겹칩니다' };
      }
    }
    this.commit([...rest, ...moved]);
    return OK;
  }

  private commit(next: EditNote[]): void {
    this.undoStack.push(this.notesValue);
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack.length = 0;
    this.notesValue = next.sort(byTime);
    this.dirty = true;
  }
}

/** A copied note, relative to the first copied note (beats). */
export interface ClipNote {
  lane: number;
  beat: number;
  endBeat?: number;
  snd?: number;
  src?: StemName;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}
