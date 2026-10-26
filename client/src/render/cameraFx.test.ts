import { describe, expect, it } from 'vitest';
import type { ChartEffect, ChartTiming } from '../engine/types';
import { CameraFx, MAX_TILT_DEG, VIEW_DEPTH, ZOOM_DEPTH } from './cameraFx';

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

  it('holds a wider view through a quiet passage and closes in through a build-up', () => {
    const views: ChartEffect[] = [
      { beat: 0, t: 0, type: 'view', value: -1, durationBeats: 2 }, // quiet: opens out over a bar
      { beat: 8, t: 4000, type: 'view', value: 0.5, durationBeats: 4 }, // build-up, bar by bar
      { beat: 12, t: 6000, type: 'view', value: 1, durationBeats: 4 },
      { beat: 16, t: 8000, type: 'view', value: 0, durationBeats: 0.25 }, // the drop lets go at once
      { beat: 16, t: 8000, type: 'zoom', value: 1, durationBeats: 2 },
    ];
    const fx = new CameraFx(views, timing, 1);
    expect(fx.enabled).toBe(true);
    expect(fx.at(1000).fovScale).toBeCloseTo(1 + VIEW_DEPTH, 9); // wider and held
    expect(fx.at(3999).fovScale).toBeCloseTo(1 + VIEW_DEPTH, 9);
    expect(fx.at(6000).fovScale).toBeCloseTo(1 - VIEW_DEPTH * 0.5, 9);
    expect(fx.at(7999).fovScale).toBeCloseTo(1 - VIEW_DEPTH, 6); // closest just before the drop
    expect(fx.at(8125).fovScale).toBeCloseTo(1 - ZOOM_DEPTH * (1 - 0.125 / 1) ** 2, 9); // let go: only the pulse
    expect(fx.at(9500).fovScale).toBe(1);
    expect(new CameraFx(views, timing, 0.5).at(1000).fovScale).toBeCloseTo(1 + VIEW_DEPTH / 2, 9);
  });
});
