import { describe, expect, it } from 'vitest';
import type { ChartEffect, ChartTiming } from '../engine/types';
import { CameraFx, MAX_TILT_DEG, ZOOM_DEPTH } from './cameraFx';

const timing: ChartTiming = { offsetMs: 0, tempoMap: [{ beat: 0, bpm: 120 }], meter: [] }; // 500 ms per beat
const effects: ChartEffect[] = [
  { beat: 8, t: 4000, type: 'zoom', value: 1, durationBeats: 2 },
  { beat: 8, t: 4000, type: 'tilt', value: 1, durationBeats: 2 },
  { beat: 24, t: 12000, type: 'tilt', value: 0, durationBeats: 2 },
];
const deg = (rad: number) => (rad * 180) / Math.PI;

describe('CameraFx', () => {
  it('eases the tilt in, holds it and eases it back', () => {
    const fx = new CameraFx(effects, timing, 1);
    expect(fx.at(3000).roll).toBe(0);
    expect(deg(fx.at(4500).roll)).toBeCloseTo(MAX_TILT_DEG / 2, 6); // halfway through a smoothstep
    expect(deg(fx.at(5000).roll)).toBeCloseTo(MAX_TILT_DEG, 6);
    expect(deg(fx.at(9000).roll)).toBeCloseTo(MAX_TILT_DEG, 6);
    expect(deg(fx.at(12500).roll)).toBeCloseTo(MAX_TILT_DEG / 2, 6);
    expect(fx.at(14000).roll).toBeCloseTo(0, 9);
  });

  it('pulses the zoom and lets it decay', () => {
    const fx = new CameraFx(effects, timing, 1);
    expect(fx.at(3999).fovScale).toBe(1);
    expect(fx.at(4000).fovScale).toBeCloseTo(1 - ZOOM_DEPTH, 9);
    expect(fx.at(4500).fovScale).toBeCloseTo(1 - ZOOM_DEPTH * 0.25, 9);
    expect(fx.at(5000).fovScale).toBe(1);
  });

  it('scales with the strength setting and turns off at zero', () => {
    expect(deg(new CameraFx(effects, timing, 0.5).at(6000).roll)).toBeCloseTo(MAX_TILT_DEG / 2, 6);
    const off = new CameraFx(effects, timing, 0);
    expect(off.enabled).toBe(false);
    expect(off.at(6000)).toEqual({ roll: 0, fovScale: 1 });
    expect(new CameraFx([], timing, 1).enabled).toBe(false);
  });
});
