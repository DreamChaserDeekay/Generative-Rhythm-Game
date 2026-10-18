import instrumentsJson from '@config/instruments.json';
import { STEM_NAMES, type StemName } from '../engine/types';
import type { BufferPlacement } from './AudioEngine';

/** Keysounds of generated charts (config/instruments.json). */
export interface StemKeysoundOptions {
  /** A stem is keysounded when at least this share of the notes follow it. */
  stemShare: number;
  /** A slice ends here at the latest; the rest of its stem stays in the background. */
  maxSliceMs: number;
  /** Notes of one stem this close together share one slice (a chord). */
  chordMs: number;
  /** Fade at slice edges and where a stem leaves or rejoins the background. */
  fadeMs: number;
  /** An empty press (a "ghost note") plays this much of the start of a slice. */
  ghostMs: number;
}

export const STEM_KEYSOUND: StemKeysoundOptions = instrumentsJson.keysound;

export const STEM_LABELS: Record<StemName, string> = { drums: '드럼', bass: '베이스', vocals: '보컬', other: '멜로디' };

/** The part of a stem one hit plays: from its note to the next note of that stem. */
export interface StemSlice {
  stem: StemName;
  startMs: number;
  endMs: number;
}

/**
 * DJMAX-style keysounds for a chart generated from a song: every note plays the slice of the stem
 * it follows, from the note to the next note of that stem, and the background is the mix with
 * those slices taken out. Hitting every note plays the song exactly; a missed note leaves its
 * slice silent.
 */
export interface StemKeysoundPlan {
  stems: StemName[];
  slices: StemSlice[];
  /** Slice per note (by index into the notes given); null = no keysound, it stays in the mix. */
  noteSlice: (number | null)[];
  /** Song-ms ranges per stem where the stem leaves the background (its slices, merged). */
  ranges: Partial<Record<StemName, [number, number][]>>;
}

interface NoteLike {
  t: number;
  src?: StemName;
}

/** Stems with enough notes to be keysounded (the others stay in the background). */
export function keysoundStems(notes: readonly NoteLike[], options: StemKeysoundOptions = STEM_KEYSOUND): StemName[] {
  const counts = new Map<StemName, number>();
  for (const n of notes) if (n.src) counts.set(n.src, (counts.get(n.src) ?? 0) + 1);
  const min = Math.max(1, options.stemShare * notes.length);
  return STEM_NAMES.filter((s) => (counts.get(s) ?? 0) >= min);
}

/** `stems` fixes the keysounded stems (the ones whose audio was loaded). */
export function planStemKeysounds(
  notes: readonly NoteLike[],
  durationMs: number,
  stems: readonly StemName[] = keysoundStems(notes),
  options: StemKeysoundOptions = STEM_KEYSOUND,
): StemKeysoundPlan | null {
  const used = STEM_NAMES.filter((s) => stems.includes(s) && notes.some((n) => n.src === s));
  if (used.length === 0) return null;
  const slices: StemSlice[] = [];
  const noteSlice: (number | null)[] = notes.map(() => null);
  const ranges: Partial<Record<StemName, [number, number][]>> = {};
  for (const stem of used) {
    const order = notes.map((_, i) => i).filter((i) => notes[i].src === stem);
    order.sort((a, b) => notes[a].t - notes[b].t);
    // chords: notes close together share the slice of the first one
    const groups: number[][] = [];
    for (const i of order) {
      const last = groups[groups.length - 1];
      if (last && notes[i].t - notes[last[0]].t <= options.chordMs) last.push(i);
      else groups.push([i]);
    }
    const merged: [number, number][] = [];
    groups.forEach((group, g) => {
      const startMs = notes[group[0]].t;
      const next = g + 1 < groups.length ? notes[groups[g + 1][0]].t : durationMs;
      const endMs = Math.min(next, startMs + options.maxSliceMs, Math.max(startMs, durationMs));
      if (endMs <= startMs) return;
      const index = slices.push({ stem, startMs, endMs }) - 1;
      for (const i of group) noteSlice[i] = index;
      const prev = merged[merged.length - 1];
      // ranges closer than two fades join, so the background never flickers in between
      if (prev && startMs - prev[1] <= 2 * options.fadeMs) prev[1] = endMs;
      else merged.push([startMs, endMs]);
    });
    ranges[stem] = merged;
  }
  return { stems: used, slices, noteSlice, ranges };
}

/**
 * Gain of a stem's phase-inverted copy under the mix: -1 inside its keysound ranges (the stem is
 * out of the mix), 0 outside, ramping over one fade before each change so that it crossfades with
 * the slices. Scheduled from song time `fromMs`, heard at context time `at`.
 */
export function scheduleStemCut(
  g: AudioParam,
  ranges: readonly (readonly [number, number])[],
  fromMs: number,
  at: number,
  contextTimeForSong: (songMs: number) => number,
  fade: number,
): void {
  const time = (ms: number) => Math.max(at, contextTimeForSong(ms));
  const inside = ranges.some(([a, b]) => a <= fromMs && fromMs < b);
  g.setValueAtTime(inside ? -1 : 0, at);
  for (const [a, b] of ranges) {
    if (b <= fromMs) continue;
    if (a > fromMs) {
      g.setValueAtTime(0, time(a) - fade);
      g.linearRampToValueAtTime(-1, time(a));
    }
    g.setValueAtTime(-1, time(b) - fade);
    g.linearRampToValueAtTime(0, time(b));
  }
}

/** "키음 드럼·보컬" */
export function stemKeysoundLabel(plan: StemKeysoundPlan): string {
  return `키음 ${plan.stems.map((s) => STEM_LABELS[s]).join('·')}`;
}

interface Voice {
  slice: number;
  src: AudioBufferSourceNode;
  gain: GainNode;
  end: number;
}

/**
 * Plays the slices during a play, from the stems' audio (aligned with the song buffer through
 * `placement`, so a practice run's stretched stems work the same). A new slice of a stem cuts the
 * one still playing; a slice already playing (another note of the same chord) is not restarted.
 */
export class StemKeysoundVoices {
  private readonly playing = new Map<StemName, Voice>();
  private readonly ghosts = new Map<StemName, Voice>();
  private readonly ctx: BaseAudioContext;
  private readonly destination: AudioNode;
  private readonly plan: StemKeysoundPlan;
  private readonly buffers: ReadonlyMap<StemName, AudioBuffer>;
  private readonly placement: BufferPlacement;
  private readonly fade: number;
  private readonly ghostLength: number;

  constructor(
    ctx: BaseAudioContext,
    destination: AudioNode,
    plan: StemKeysoundPlan,
    buffers: ReadonlyMap<StemName, AudioBuffer>,
    placement: BufferPlacement,
    options: StemKeysoundOptions = STEM_KEYSOUND,
  ) {
    this.ctx = ctx;
    this.destination = destination;
    this.plan = plan;
    this.buffers = buffers;
    this.placement = placement;
    this.fade = options.fadeMs / 1000;
    this.ghostLength = options.ghostMs / 1000;
  }

  /**
   * Play a slice whose start is heard at context time `when` (as soon as possible if that has
   * passed). The source starts one fade early and fades in while the previous slice or the
   * background fades out, so slices played on time join seamlessly.
   */
  play(slice: number, when: number): void {
    const s = this.plan.slices[slice];
    const buffer = s && this.buffers.get(s.stem);
    if (!s || !buffer) return;
    const { originMs, rate } = this.placement;
    const fade = this.fade;
    const sliceStart = (s.startMs - originMs) / 1000 / rate;
    if (sliceStart < 0 || sliceStart >= buffer.duration) return;
    const offset = Math.max(0, sliceStart - fade);
    const at = Math.max(when - (sliceStart - offset), this.ctx.currentTime);
    const duration = Math.min((s.endMs - s.startMs) / 1000 / rate + (sliceStart - offset), buffer.duration - offset);
    if (duration <= 2 * fade) return;
    const end = at + duration;
    const prev = this.playing.get(s.stem);
    if (prev && prev.end > at + fade) {
      if (prev.slice === slice) return; // another note of the same chord
      prev.gain.gain.cancelAndHoldAtTime(at);
      prev.gain.gain.linearRampToValueAtTime(0, at + fade);
      prev.src.stop(at + fade);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(1, at + fade);
    gain.gain.setValueAtTime(1, end - fade);
    gain.gain.linearRampToValueAtTime(0, end);
    src.connect(gain);
    gain.connect(this.destination);
    src.start(at, offset, duration);
    const voice = { slice, src, gain, end };
    this.playing.set(s.stem, voice);
    src.onended = () => {
      gain.disconnect();
      if (this.playing.get(s.stem) === voice) this.playing.delete(s.stem);
    };
  }

  /**
   * An empty press (a "ghost note"): the start of a slice, at most `ghostMs`, from context time
   * `when`. It plays over the song and never cuts a slice that is playing, so the music stays whole;
   * a new ghost of a stem replaces the previous one, so mashing a key does not pile sounds up.
   */
  ghost(slice: number, when: number): void {
    const s = this.plan.slices[slice];
    const buffer = s && this.buffers.get(s.stem);
    if (!s || !buffer) return;
    const { originMs, rate } = this.placement;
    const offset = (s.startMs - originMs) / 1000 / rate;
    if (offset < 0 || offset >= buffer.duration) return;
    const duration = Math.min(this.ghostLength, (s.endMs - s.startMs) / 1000 / rate, buffer.duration - offset);
    const fade = this.fade;
    if (duration <= 2 * fade) return;
    const at = Math.max(when, this.ctx.currentTime);
    const end = at + duration;
    const release = Math.max(fade, Math.min(GHOST_RELEASE_S, duration / 3));
    const prev = this.ghosts.get(s.stem);
    if (prev && prev.end > at) {
      prev.gain.gain.cancelAndHoldAtTime(at);
      prev.gain.gain.linearRampToValueAtTime(0, at + fade);
      prev.src.stop(at + fade);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(1, at + fade);
    gain.gain.setValueAtTime(1, end - release);
    gain.gain.linearRampToValueAtTime(0, end);
    src.connect(gain);
    gain.connect(this.destination);
    src.start(at, offset, duration);
    const voice = { slice, src, gain, end };
    this.ghosts.set(s.stem, voice);
    src.onended = () => {
      gain.disconnect();
      if (this.ghosts.get(s.stem) === voice) this.ghosts.delete(s.stem);
    };
  }

  stopAll(): void {
    for (const v of [...this.playing.values(), ...this.ghosts.values()]) {
      try {
        v.src.stop();
      } catch {
        // already stopped
      }
      v.gain.disconnect();
    }
    this.playing.clear();
    this.ghosts.clear();
  }
}

/** Fade-out at the end of a ghost note (seconds). */
const GHOST_RELEASE_S = 0.04;

/**
 * The note an empty press sounds (a "ghost note"), DJMAX-style: the lane's next note, or its last
 * one once the lane has no notes left. `laneNotes` are the indices of one lane's notes in time
 * order, `timeOf` gives a note's time.
 */
export function emptyPressNote(laneNotes: readonly number[], timeOf: (index: number) => number, timeMs: number): number | null {
  if (laneNotes.length === 0) return null;
  let lo = 0;
  let hi = laneNotes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timeOf(laneNotes[mid]) < timeMs) lo = mid + 1;
    else hi = mid;
  }
  return laneNotes[Math.min(lo, laneNotes.length - 1)];
}
