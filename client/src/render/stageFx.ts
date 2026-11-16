import { cameraConfig } from '../engine/config';

/**
 * How a play's start and end show on the track. None of it is judged, heard or timed by: it is only drawn.
 *
 * A start: the lanes light one by one from the middle of the track outward, on the chart's beats, then the
 * judge line is drawn from its middle to its ends, while the camera comes down from above to where it plays
 * from. An end: the judge line draws back and the lanes go out from the outside in, the camera backing away.
 * A failed play: the lanes crack and drop away one after another. A resume's rewind draws the judge line again.
 */

/** What the renderer draws of it in a frame, by the mode's lane index. */
export interface StageFrame {
  /** How dark each lane's floor is laid over: 0 as in play … 1 gone black. */
  dark: number[];
  /** The flare of each lane as it lights: 1 as it comes on, fading. */
  flare: number[];
  /** How much of the judge line is drawn, from its middle outward: 0 … 1. */
  line: number;
  /** How far each lane has dropped away: 0 in place … 1 out of sight (a failed play's). */
  drop: number[];
  /** How far the cracks have run over the lanes: 0 … 1 (a failed play's). */
  crack: number;
}

/** A lane that is out is laid over with this share of black. */
export const LANE_DARK = 0.8;
/** A lane's floor comes up over this long, and its flare fades with this time constant (real ms). */
const LIGHT_MS = 140;
const FLARE_MS = 240;
/** A start with less room than this before the first note comes into sight shows none of it (real ms). */
export const INTRO_MIN_MS = 400;
/** The first lane lights no sooner than this after the run starts, and the judge line is whole this long before the first note comes into sight. */
const INTRO_HEAD_MS = 150;
const INTRO_TAIL_MS = 80;
/** A lane a beat, or half or a quarter of one where a beat is longer than STEP_MAX_MS, the lanes would take longer than LANES_MAX_MS, or there is no room. */
const BEAT_STEPS = [1, 0.5, 0.25] as const;
const STEP_MAX_MS = 650;
const LANES_MAX_MS = 3200;
/** The judge line is drawn over a step, no shorter and no longer than this. */
const LINE_MS = [180, 420] as const;
/** An end: the lanes are all out this long after it begins, each fading over OUT_FADE_MS. */
const OUT_MS = 720;
const OUT_FADE_MS = 240;
/** A failed play: the cracks run over the lanes in CRACK_MS, the first lane lets go at FALL_FROM_MS, the others FALL_STEP_MS apart at most, each out of sight FALL_MS later. */
const CRACK_MS = 260;
const FALL_FROM_MS = 520;
const FALL_STEP_MS = 120;
const FALL_MS = 950;
/** How long the lanes of a failed play take to be gone, at most (real ms). */
export const FAIL_FALL_MS = 2400;
/** Under 동작 줄이기 nothing runs in turn or moves: the lanes go out, or dark, together over this long. */
const STILL_MS = 400;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function smooth(p: number): number {
  const x = clamp01(p);
  return x * x * (3 - 2 * x);
}

/** Fast at first, slowing into its end. */
function easeOut(p: number): number {
  const x = 1 - clamp01(p);
  return 1 - x * x * x;
}

/** The lanes with a floor of their own, from the middle of the track outward (of a pair the left one first). */
export function lightOrder(lanes: readonly { index: number; x: number; over?: boolean }[]): number[] {
  const far = (x: number) => Math.round(Math.abs(x) * 1000);
  return lanes
    .filter((l) => !l.over)
    .sort((a, b) => far(a.x) - far(b.x) || a.x - b.x)
    .map((l) => l.index);
}

/** The order the lanes of a failed play let go in: no pattern to it, the same every time. */
export function fallOrder(order: readonly number[]): number[] {
  const hash = (i: number) => {
    const v = Math.sin((i + 1) * 12.9898) * 43758.5453;
    return v - Math.floor(v);
  };
  return [...order].sort((a, b) => hash(a) - hash(b));
}

/** Beats and song time, either way (TempoMap). */
export interface StageTempo {
  beatToMs(beat: number): number;
  msToBeat(ms: number): number;
}

/** When a start's lanes light and its judge line is drawn (song ms). */
export interface IntroPlan {
  /** By lane index; -Infinity: lit all along. */
  laneAt: number[];
  lineFrom: number;
  lineTo: number;
}

/**
 * A start between `startMs`, where the run begins, and `endMs`, where its first note comes into sight (song ms;
 * `rate`: song ms a real ms). The lanes light in `order`, a beat apart on the chart's beats: half or a quarter
 * of one where a beat is too long or the lanes would not all be lit in time, and evenly over the room there is
 * where no beat fits. The judge line follows. With too little room, or no lanes, there is none.
 */
export function planIntro(order: readonly number[], lanes: number, startMs: number, endMs: number, rate: number, tempo: StageTempo): IntroPlan {
  const laneAt = new Array<number>(lanes).fill(-Infinity);
  const n = order.length;
  if (n === 0 || !((endMs - startMs) / rate >= INTRO_MIN_MS)) return { laneAt, lineFrom: -Infinity, lineTo: -Infinity };
  const from = startMs + INTRO_HEAD_MS * rate;
  const until = endMs - INTRO_TAIL_MS * rate;
  const lineMs = (step: number) => Math.min(LINE_MS[1], Math.max(LINE_MS[0], step));
  for (const share of BEAT_STEPS) {
    const first = Math.ceil(tempo.msToBeat(from) / share - 1e-6) * share;
    const at = (k: number) => tempo.beatToMs(first + k * share);
    const step = (at(n) - at(0)) / n / rate;
    if (!(step > 0) || step > STEP_MAX_MS || step * n > LANES_MAX_MS) continue;
    const lineTo = at(n) + lineMs(step) * rate;
    if (lineTo > until) continue;
    order.forEach((lane, k) => (laneAt[lane] = at(k)));
    return { laneAt, lineFrom: at(n), lineTo };
  }
  const room = (until - from) / rate;
  const line = Math.min(room, lineMs((1.5 * room) / (n + 1.5)));
  const step = (room - line) / n;
  order.forEach((lane, k) => (laneAt[lane] = from + k * step * rate));
  return { laneAt, lineFrom: until - line * rate, lineTo: until };
}

/** When a start is over and nothing of it shows any more (song ms; -Infinity: there was none). */
export function introEnd(plan: IntroPlan, rate: number): number {
  return Math.max(plan.lineTo, Math.max(...plan.laneAt) + 6 * FLARE_MS * rate);
}

/** A frame with every lane lit and the judge line whole. */
export function litFrame(lanes: number): StageFrame {
  return { dark: new Array<number>(lanes).fill(0), flare: new Array<number>(lanes).fill(0), line: 1, drop: new Array<number>(lanes).fill(0), crack: 0 };
}

function clear(out: StageFrame): void {
  out.dark.fill(0);
  out.flare.fill(0);
  out.drop.fill(0);
  out.line = 1;
  out.crack = 0;
}

/** A start at song time `songMs`, written into `out`. `calm` (번쩍임 줄이기): the flares a third as bright. */
export function introFrame(out: StageFrame, plan: IntroPlan, songMs: number, rate: number, calm = false): void {
  clear(out);
  for (let i = 0; i < plan.laneAt.length; i++) {
    const since = (songMs - plan.laneAt[i]) / rate;
    out.dark[i] = (1 - (since > 0 ? smooth(since / LIGHT_MS) : 0)) * LANE_DARK;
    out.flare[i] = since > 0 && since < Infinity ? Math.exp(-since / FLARE_MS) * (calm ? 0.35 : 1) : 0;
  }
  out.line = plan.lineTo === -Infinity ? 1 : easeOut((songMs - plan.lineFrom) / Math.max(1, plan.lineTo - plan.lineFrom));
}

/**
 * How much of the judge line is drawn over a resume's rewind from `fromMs` to `untilMs` (song ms), where the play
 * is live again: drawn anew from its middle, whole as the rewind ends.
 */
export function resumeLine(fromMs: number, untilMs: number, songMs: number): number {
  return easeOut((songMs - fromMs) / Math.max(1, untilMs - fromMs));
}

/**
 * An end, `ms` (real) after it began: the lanes go out in `order` backwards, the outermost first, as the judge
 * line draws back to its middle. `still` (동작 줄이기): all of them together.
 */
export function outroFrame(out: StageFrame, order: readonly number[], ms: number, still = false): void {
  clear(out);
  const n = order.length;
  if (still) {
    const gone = smooth(ms / STILL_MS);
    for (const lane of order) out.dark[lane] = gone * LANE_DARK;
    out.line = 1 - gone;
    return;
  }
  const step = OUT_MS / Math.max(1, n);
  order.forEach((lane, k) => (out.dark[lane] = smooth((ms - (n - 1 - k) * step) / OUT_FADE_MS) * LANE_DARK));
  out.line = 1 - smooth(ms / (OUT_MS + OUT_FADE_MS));
}

/**
 * A failed play, `ms` (real) after it failed: cracks run over the lanes, which then let go one after another
 * (`falls`: fallOrder) and drop out of sight, each leaving its place black, the judge line going with them.
 * `still` (동작 줄이기): nothing drops; the cracked lanes go dark where they are.
 */
export function failFrame(out: StageFrame, falls: readonly number[], ms: number, still = false): void {
  clear(out);
  out.crack = smooth(ms / CRACK_MS);
  const n = falls.length;
  if (still) {
    const gone = smooth((ms - CRACK_MS) / (2 * STILL_MS));
    for (const lane of falls) out.dark[lane] = gone;
    out.line = 1 - gone;
    return;
  }
  const step = n > 1 ? Math.min(FALL_STEP_MS, (FAIL_FALL_MS - FALL_FROM_MS - FALL_MS) / (n - 1)) : 0;
  falls.forEach((lane, k) => {
    const since = ms - FALL_FROM_MS - k * step;
    // it speeds up as it drops
    out.drop[lane] = since > 0 ? clamp01(since / FALL_MS) ** 2 : 0;
    out.dark[lane] = since > 0 ? 1 : 0.2 * out.crack;
  });
  out.line = 1 - smooth((ms - FALL_FROM_MS) / Math.max(1, (n - 1) * step + 200));
}

/**
 * Where a damped spring let go at 1, at rest, is `ms` later on its way to 0: the camera's own inertia
 * (cameraFx's followers) in closed form, so that a time gives a place whatever the frames between.
 */
export function springRest(ms: number, spring: { hz: number; damping: number }): number {
  if (ms <= 0) return 1;
  const t = ms / 1000;
  const w = 2 * Math.PI * spring.hz;
  const z = spring.damping;
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z);
    return Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
  }
  if (z === 1) return Math.exp(-w * t) * (1 + w * t);
  const s = Math.sqrt(z * z - 1);
  const [a, b] = [-w * (z - s), -w * (z + s)];
  return (b * Math.exp(a * t) - a * Math.exp(b * t)) / (b - a);
}

/** What a start or an end adds to the camera's pose (cameraFx.CameraPoseFx's pitch and field of view). */
export interface StagePose {
  pitch: number;
  fovScale: number;
}

/** The camera's way in: from this far above where it plays from (degrees about the judge line) and this much wider a view (further back), at full strength. */
export const ENTRY = { pitchDeg: 14, wide: 0.22 } as const;
/** Its way out at an end: this far up and back, at full strength. */
export const EXIT = { pitchDeg: 3, wide: 0.2 } as const;
/** A start with this much room or more (real ms) has the whole way in; with less, less of it, down to none at ENTRY_MIN_MS. */
const ENTRY_FULL_MS = 1100;
const ENTRY_MIN_MS = 250;

const DIVE_SPRING = cameraConfig.fx.inertia.dive;
const RAD = Math.PI / 180;

/** How much of the way in a start with `room` (real ms) before its first note comes into sight has: 0 … 1. */
export function entryShare(room: number): number {
  return clamp01((room - ENTRY_MIN_MS) / (ENTRY_FULL_MS - ENTRY_MIN_MS));
}

/** The camera `ms` (real) after a start: it comes down and in on the dive's spring. `amount`: the settings' strength times entryShare. */
export function entryPose(ms: number, amount: number): StagePose {
  const k = amount * springRest(ms, DIVE_SPRING);
  return { pitch: -ENTRY.pitchDeg * RAD * k, fovScale: 1 + ENTRY.wide * k };
}

/** The camera `ms` (real) after an end began: it backs away on the same spring. */
export function exitPose(ms: number, amount: number): StagePose {
  const k = amount * (1 - springRest(ms, DIVE_SPRING));
  return { pitch: -EXIT.pitchDeg * RAD * k, fovScale: 1 + EXIT.wide * k };
}

/**
 * The song time a failed play is drawn at, `ms` (real) after it failed at `failedMs`: the notes run down with the
 * music as a tape does when its motor stops, over `stopMs`, and stand still from then on. `rate`: song ms a real ms.
 */
export function tapeStopTime(failedMs: number, ms: number, stopMs: number, rate: number): number {
  const t = Math.min(Math.max(0, ms), stopMs);
  return failedMs + rate * (t - (t * t) / (2 * stopMs));
}
