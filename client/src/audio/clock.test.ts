import { describe, expect, it } from 'vitest';
import { AudioClock, type AudioTimeSource } from './clock';

class FakeContext implements AudioTimeSource {
  currentTime = 0;
  outputLatency = 0.02;
  stamp: AudioTimestamp | null = null;
  getOutputTimestamp = () => this.stamp ?? { contextTime: 0, performanceTime: 0 };
}

describe('AudioClock', () => {
  it('maps perf time to audible context time with output timestamps', () => {
    const ctx = new FakeContext();
    // Speakers play context time 10.000s at perf 5000ms.
    ctx.stamp = { contextTime: 10, performanceTime: 5000 };
    const clock = new AudioClock(ctx, () => 5000);
    clock.sample();
    expect(clock.contextTimeAtPerf(5500)).toBeCloseTo(10.5, 9);
    expect(clock.perfAtContextTime(11)).toBeCloseTo(6000, 9);
  });

  it('round-trips between perf time and context time', () => {
    const ctx = new FakeContext();
    ctx.stamp = { contextTime: 3.21, performanceTime: 1234.5 };
    const clock = new AudioClock(ctx, () => 1234.5);
    clock.sample();
    for (const perf of [0, 999.25, 1234.5, 98765.4321]) {
      expect(clock.perfAtContextTime(clock.contextTimeAtPerf(perf))).toBeCloseTo(perf, 6);
    }
  });

  it('smooths small jitter and re-anchors on large jumps', () => {
    const ctx = new FakeContext();
    ctx.stamp = { contextTime: 10, performanceTime: 5000 };
    const clock = new AudioClock(ctx, () => 5000);
    clock.sample();
    ctx.stamp = { contextTime: 10.003, performanceTime: 5000 }; // +3ms quantum jitter
    clock.sample();
    expect(clock.contextTimeAtPerf(5000)).toBeCloseTo(10 + 0.003 * 0.05, 9);
    ctx.stamp = { contextTime: 10.2, performanceTime: 5000 }; // +200ms: device change
    clock.sample();
    expect(clock.contextTimeAtPerf(5000)).toBeCloseTo(10.2, 9);
  });

  it('falls back to currentTime minus output latency without timestamps', () => {
    const ctx = new FakeContext();
    ctx.currentTime = 2;
    const clock = new AudioClock(ctx, () => 1000);
    clock.sample();
    expect(clock.contextTimeAtPerf(1000)).toBeCloseTo(1.98, 9);
  });
});
