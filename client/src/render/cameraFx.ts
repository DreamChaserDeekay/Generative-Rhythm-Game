import { cameraConfig } from '../engine/config';
import { TempoMap } from '../engine/tempo';
import type { ChartEffect, ChartTiming } from '../engine/types';

/** Largest track tilt (degrees) for a tilt value of ±1 at full strength. */
export const MAX_TILT_DEG = cameraConfig.fx.maxTiltDeg;
/** Field-of-view narrowing of a full-strength zoom pulse. */
export const ZOOM_DEPTH = cameraConfig.fx.zoomDepth;

interface Span {
  t: number;
  end: number;
  from: number;
  to: number;
}

export interface CameraPoseFx {
  /** Camera roll in radians (positive tilts the track clockwise on screen). */
  roll: number;
  /** Multiplier for the field of view (< 1 zooms in). */
  fovScale: number;
}

function smooth(p: number): number {
  const x = Math.min(1, Math.max(0, p));
  return x * x * (3 - 2 * x);
}

/**
 * Evaluates a chart's camera cues at any song time: tilts ease from the previous tilt to the
 * new one over their duration and hold; zooms are pulses that decay over theirs.
 */
export class CameraFx {
  private readonly tilts: Span[] = [];
  private readonly zooms: Span[] = [];
  private readonly strength: number;

  constructor(effects: readonly ChartEffect[], timing: ChartTiming, strength: number) {
    this.strength = Math.min(1, Math.max(0, strength));
    const tempo = new TempoMap(timing);
    let tilt = 0;
    for (const e of [...effects].sort((a, b) => a.t - b.t)) {
      const end = tempo.beatToMs(e.beat + Math.max(0.25, e.durationBeats));
      if (e.type === 'tilt') {
        this.tilts.push({ t: e.t, end, from: tilt, to: e.value });
        tilt = e.value;
      } else if (e.type === 'zoom') {
        this.zooms.push({ t: e.t, end, from: e.value, to: 0 });
      }
    }
  }

  get enabled(): boolean {
    return this.strength > 0 && (this.tilts.length > 0 || this.zooms.length > 0);
  }

  /**
   * The chart's deepest counter-clockwise tilt and deepest zoom together: the pose that brings the
   * track nearest the screen's top left (its far end turns that way and the picture grows), where
   * the song's plate lies. A tilt eases between the values it is given, and a zoom only decays.
   */
  peak(): CameraPoseFx {
    if (this.strength <= 0) return { roll: 0, fovScale: 1 };
    const tilt = Math.min(0, ...this.tilts.map((s) => s.to));
    const zoom = Math.max(0, ...this.zooms.map((s) => s.from));
    return {
      roll: (tilt * MAX_TILT_DEG * this.strength * Math.PI) / 180,
      fovScale: 1 - ZOOM_DEPTH * this.strength * zoom,
    };
  }

  at(timeMs: number): CameraPoseFx {
    if (this.strength <= 0) return { roll: 0, fovScale: 1 };
    let tilt = 0;
    for (const s of this.tilts) {
      if (s.t > timeMs) break;
      tilt = s.from + (s.to - s.from) * smooth((timeMs - s.t) / Math.max(1, s.end - s.t));
    }
    let zoom = 0;
    for (const s of this.zooms) {
      if (s.t > timeMs) break;
      if (timeMs < s.end) {
        const p = (timeMs - s.t) / Math.max(1, s.end - s.t);
        zoom = Math.max(zoom, s.from * (1 - p) * (1 - p));
      }
    }
    return {
      roll: (tilt * MAX_TILT_DEG * this.strength * Math.PI) / 180,
      fovScale: 1 - ZOOM_DEPTH * this.strength * zoom,
    };
  }
}
