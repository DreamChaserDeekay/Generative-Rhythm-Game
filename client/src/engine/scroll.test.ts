import { describe, expect, it } from 'vitest';
import { mainBpm, ScrollModel } from './scroll';
import type { ChartTiming } from './types';

const constant: ChartTiming = { offsetMs: 0, tempoMap: [{ beat: 0, bpm: 120 }], meter: [] };
// 120 BPM for 32 beats (16 s), then 240 BPM for the rest.
const change: ChartTiming = { offsetMs: 0, tempoMap: [{ beat: 0, bpm: 120 }, { beat: 32, bpm: 240 }], meter: [] };

const model = (timing: ChartTiming, o: Partial<{ mode: 'time' | 'beat'; lift: number; rate: number }> = {}) =>
  new ScrollModel({ trackLength: 40, visibleMs: 1000, lift: o.lift ?? 0, mode: o.mode ?? 'time', timing, rate: o.rate ?? 1, durationMs: 20000 });

describe('ScrollModel', () => {
  it('moves at a constant speed in time mode', () => {
    const s = model(change);
    expect(s.distance(1500, 1000)).toBeCloseTo(20, 9);
    expect(s.distance(17500, 17000)).toBeCloseTo(20, 9);
    expect(s.z(1000, 1000)).toBe(-0);
  });

  it('matches time mode at the main BPM and speeds up with the BPM in beat mode', () => {
    expect(mainBpm(change, 20000)).toBe(120);
    const beat = model(change, { mode: 'beat' });
    expect(beat.distance(1500, 1000)).toBeCloseTo(20, 9);
    expect(beat.distance(17500, 17000)).toBeCloseTo(40, 9); // twice the BPM, twice the speed
    const flat = model(constant, { mode: 'beat' });
    expect(flat.distance(5000, 4000)).toBeCloseTo(model(constant).distance(5000, 4000), 9);
  });

  it('raises the judgement line with LIFT and shortens the travel', () => {
    const s = model(constant, { lift: 0.25 });
    expect(s.judgeZ).toBe(-10);
    expect(s.travel).toBe(30);
    expect(s.z(1000, 1000)).toBe(-10);
  });

  it('keeps the real-time speed at practice rates', () => {
    // At half speed 1000 song ms take 2000 real ms, so they cover twice the distance.
    expect(model(constant, { rate: 0.5 }).distance(2000, 1000)).toBeCloseTo(80, 9);
  });
});
