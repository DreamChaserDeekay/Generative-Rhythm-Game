import { cameraConfig } from '../engine/config';
import { TempoMap } from '../engine/tempo';
import type { ChartEffect, ChartTiming } from '../engine/types';

const FX = cameraConfig.fx;
/** Largest track tilt (degrees) for a tilt or swing value of ±1 at full strength. */
export const MAX_TILT_DEG = FX.maxTiltDeg;
/** Field-of-view narrowing of a full-strength zoom pulse. */
export const ZOOM_DEPTH = FX.zoomDepth;
/** Field-of-view change of a held zoom level of ±1 (narrower for +1, wider for -1). */
export const VIEW_DEPTH = FX.viewDepth;
/** How far (degrees) the camera comes down toward the track, about the judge line, for a dive of 1 at full strength. */
export const MAX_DIVE_DEG = FX.maxDiveDeg;
/** A pulse this large or larger is led into: the view opens by this share of it over the beats before. */
export const ANTICIPATION = FX.anticipation;
/** What the play itself does to the camera: a pulse every so many combo, a level moment after a miss. */
export const PLAYER = FX.player;
/** The share of a swing spent leaning; the rest of it comes back level. */
export const SWING_ATTACK = FX.swingAttack;

interface Span {
  t: number;
  end: number;
  from: number;
  to: number;
  /** A large zoom pulse: where the view starts to open before it (see ANTICIPATION). */
  lead?: number;
}

interface Spring {
  hz: number;
  damping: number;
}

export interface CameraPoseFx {
  /** Camera roll in radians (positive tilts the track clockwise on screen). */
  roll: number;
  /** Multiplier for the field of view (< 1 zooms in). */
  fovScale: number;
  /** How far the camera comes down toward the track about the judge line, in radians (absent: not at all). */
  pitch?: number;
}

function smooth(p: number): number {
  const x = Math.min(1, Math.max(0, p));
  return x * x * (3 - 2 * x);
}

/** The eased value of held cues (tilt, view, dive) at a time: each eases from the last to its own. */
function held(spans: readonly Span[], timeMs: number): number {
  let v = 0;
  for (const s of spans) {
    if (s.t > timeMs) break;
    v = s.from + (s.to - s.from) * smooth((timeMs - s.t) / Math.max(1, s.end - s.t));
  }
  return v;
}

/** How far a spring of this damping ratio runs past a step before it settles (a share of the step). */
export function overshoot(damping: number): number {
  return damping >= 1 ? 0 : Math.exp((-Math.PI * damping) / Math.sqrt(1 - damping * damping));
}

/** One value following its target as a mass on a damped spring: late to start, a little past where it stops. */
class Follower {
  value: number;
  private velocity = 0;
  private readonly omega: number;

  constructor(
    private readonly spring: Spring,
    rest: number,
  ) {
    this.value = rest;
    this.omega = 2 * Math.PI * spring.hz;
  }

  snap(target: number): void {
    this.value = target;
    this.velocity = 0;
  }

  step(target: number, dtMs: number): void {
    // short steps: the stiffest spring (the zoom's) stays stable at any frame rate
    for (let left = dtMs; left > 0; left -= 4) {
      const dt = Math.min(4, left) / 1000;
      this.velocity += (this.omega * this.omega * (target - this.value) - 2 * this.spring.damping * this.omega * this.velocity) * dt;
      this.value += this.velocity * dt;
    }
  }
}

/** A jump in song time larger than this (a seek, a restart, a stall) is not followed: the camera is put where it belongs. */
const FOLLOW_GAP_MS = 250;

/**
 * A chart's camera cues at any song time, and the camera that follows them.
 *
 * `at` is where the cues put the camera: tilts, views (held zoom levels) and dives ease from the
 * previous value to the new one over their duration and hold; a swing leans and comes back level
 * within its duration; zooms are pulses that decay over theirs, a large one led into by the view
 * opening a little just before it. `follow` is the camera of a play: it moves toward that pose with
 * inertia (a damped spring per axis), pulses every so many combo and levels for a moment after a miss.
 * The judge line stays where it is through all of it (see TrackRenderer's frameCamera).
 */
export class CameraFx {
  private readonly tilts: Span[] = [];
  private readonly views: Span[] = [];
  private readonly zooms: Span[] = [];
  private readonly swings: Span[] = [];
  private readonly dives: Span[] = [];
  /** Pulses of the play itself (combo), by the song time they came at. */
  private readonly live: Span[] = [];
  private missAt: number | null = null;
  private readonly strength: number;
  private last: number | null = null;
  private readonly roll = new Follower(FX.inertia.roll, 0);
  private readonly fov = new Follower(FX.inertia.zoom, 1);
  private readonly pitch = new Follower(FX.inertia.dive, 0);

  constructor(effects: readonly ChartEffect[], timing: ChartTiming, strength: number) {
    this.strength = Math.min(1, Math.max(0, strength));
    const tempo = new TempoMap(timing);
    let tilt = 0;
    let view = 0;
    let dive = 0;
    for (const e of [...effects].sort((a, b) => a.t - b.t)) {
      const end = tempo.beatToMs(e.beat + Math.max(0.25, e.durationBeats));
      if (e.type === 'tilt') {
        this.tilts.push({ t: e.t, end, from: tilt, to: e.value });
        tilt = e.value;
      } else if (e.type === 'view') {
        this.views.push({ t: e.t, end, from: view, to: e.value });
        view = e.value;
      } else if (e.type === 'dive') {
        this.dives.push({ t: e.t, end, from: dive, to: e.value });
        dive = e.value;
      } else if (e.type === 'swing') {
        this.swings.push({ t: e.t, end, from: e.value, to: 0 });
      } else if (e.type === 'zoom') {
        const lead = e.value >= ANTICIPATION.from ? tempo.beatToMs(e.beat - ANTICIPATION.beats) : undefined;
        this.zooms.push({ t: e.t, end, from: e.value, to: 0, lead });
      }
    }
  }

  /** The camera moves in this play: by the chart's cues, and by the play's own combo. */
  get enabled(): boolean {
    return this.strength > 0;
  }

  /** The combo as it is now: every PLAYER.comboEvery of it pulses. */
  combo(count: number): void {
    if (this.last === null || count <= 0 || count % PLAYER.comboEvery !== 0) return;
    this.live.push({ t: this.last, end: this.last + PLAYER.comboMs, from: PLAYER.comboPulse, to: 0 });
    if (this.live.length > 8) this.live.shift();
  }

  /** A note was missed: the lean and the pulses level out for a moment (the lanes are to be read, not shown off). */
  miss(): void {
    if (this.last !== null) this.missAt = this.last;
  }

  /** 0 right after a miss, back to 1 past it: what the lean and the pulses are scaled by. */
  private steady(timeMs: number): number {
    if (this.missAt === null) return 1;
    const dt = timeMs - this.missAt;
    if (dt < 0) return 1;
    if (dt < PLAYER.missCalmMs) return 1 - smooth(dt / PLAYER.missEaseMs);
    return smooth((dt - PLAYER.missCalmMs) / PLAYER.missBackMs);
  }

  /**
   * The chart's pose that brings the track nearest the screen's top left (its far end turns that
   * way and the picture grows), where the song's plate lies: its deepest counter-clockwise lean and
   * its deepest zoom together, each with how far the following camera runs past it. A tilt and a
   * view ease between the values they are given, a swing and a zoom only decay; the closest view
   * and the strongest pulse count together.
   */
  peak(): CameraPoseFx {
    if (this.strength <= 0) return { roll: 0, fovScale: 1, pitch: 0 };
    const tilt = Math.min(0, ...this.tilts.map((s) => s.to)) + Math.min(0, ...this.swings.map((s) => s.from));
    const zoom = Math.max(PLAYER.comboPulse, ...this.zooms.map((s) => s.from));
    const view = Math.max(0, ...this.views.map((s) => s.to));
    const dive = Math.max(0, ...this.dives.map((s) => s.to));
    const scale = (1 - ZOOM_DEPTH * this.strength * zoom) * (1 - VIEW_DEPTH * this.strength * view);
    return {
      roll: (tilt * MAX_TILT_DEG * this.strength * Math.PI * (1 + overshoot(FX.inertia.roll.damping))) / 180,
      fovScale: 1 - (1 - scale) * (1 + overshoot(FX.inertia.zoom.damping)),
      pitch: (dive * MAX_DIVE_DEG * this.strength * Math.PI) / 180,
    };
  }

  /** Where the cues (and the play so far) put the camera at a song time, with no inertia. */
  at(timeMs: number): CameraPoseFx {
    if (this.strength <= 0) return { roll: 0, fovScale: 1, pitch: 0 };
    const steady = this.steady(timeMs);
    let tilt = held(this.tilts, timeMs);
    for (const s of this.swings) {
      if (s.t > timeMs) break;
      if (timeMs < s.end) {
        const p = (timeMs - s.t) / Math.max(1, s.end - s.t);
        // leans over the first part of it, then comes back level, slower
        tilt += s.from * (p < SWING_ATTACK ? smooth(p / SWING_ATTACK) : 1 - smooth((p - SWING_ATTACK) / (1 - SWING_ATTACK)));
      }
    }
    const view = held(this.views, timeMs);
    const dive = held(this.dives, timeMs);
    let zoom = 0;
    let open = 0;
    for (const s of this.zooms) {
      if (s.lead !== undefined && timeMs >= s.lead && timeMs < s.t) {
        // the breath before a large pulse: the view opens a little, then the pulse closes it at once
        open = Math.max(open, ANTICIPATION.depth * s.from * smooth((timeMs - s.lead) / Math.max(1, s.t - s.lead)));
      }
      if (s.t > timeMs) continue;
      if (timeMs < s.end) {
        const p = (timeMs - s.t) / Math.max(1, s.end - s.t);
        zoom = Math.max(zoom, s.from * (1 - p) * (1 - p));
      }
    }
    for (const s of this.live) {
      if (timeMs >= s.t && timeMs < s.end) {
        const p = (timeMs - s.t) / (s.end - s.t);
        zoom = Math.max(zoom, s.from * (1 - p) * (1 - p));
      }
    }
    return {
      roll: (tilt * steady * MAX_TILT_DEG * this.strength * Math.PI) / 180,
      fovScale: (1 - ZOOM_DEPTH * this.strength * (zoom * steady - open)) * (1 - VIEW_DEPTH * this.strength * view),
      pitch: (dive * MAX_DIVE_DEG * this.strength * Math.PI) / 180,
    };
  }

  /**
   * The camera of a play at a song time, called frame by frame: it follows `at` with inertia. A
   * jump in time (the first frame, a seek, a restart) puts it where it belongs.
   */
  follow(timeMs: number): CameraPoseFx {
    const target = this.at(timeMs);
    const dt = this.last === null ? -1 : timeMs - this.last;
    this.last = timeMs;
    if (this.strength <= 0) return target;
    if (dt < 0 || dt > FOLLOW_GAP_MS) {
      this.roll.snap(target.roll);
      this.fov.snap(target.fovScale);
      this.pitch.snap(target.pitch ?? 0);
    } else {
      this.roll.step(target.roll, dt);
      this.fov.step(target.fovScale, dt);
      this.pitch.step(target.pitch ?? 0, dt);
    }
    return { roll: this.roll.value, fovScale: this.fov.value, pitch: this.pitch.value };
  }
}
