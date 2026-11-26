import { describe, expect, it } from 'vitest';
import type { SongClock } from '../audio/clock';
import { renderClickSamples } from '../audio/clickTrack';
import { InputManager } from './InputManager';

/** Song time runs 1:1 with perf time, offset by an arbitrary anchor. */
const clock: SongClock = {
  songTimeAtPerf: (perf) => perf - 12345.678,
  perfAtSongTime: (song) => song + 12345.678,
};

function setup(offset = 0) {
  const calls: [string, number, number][] = [];
  const input = new InputManager(clock, ['KeyD', 'KeyF', 'KeyJ', 'KeyK'], {
    press: (lane, t) => calls.push(['press', lane, t]),
    release: (lane, t) => calls.push(['release', lane, t]),
  }, offset);
  return { input, calls };
}

describe('InputManager', () => {
  it('converts event timestamps to song time and subtracts the input offset', () => {
    const { input, calls } = setup(20);
    input.handleKey('KeyF', true, 12345.678 + 1020);
    input.handleKey('KeyF', false, 12345.678 + 1100);
    expect(calls).toEqual([
      ['press', 1, 1000],
      ['release', 1, 1080],
    ]);
  });

  it('ignores unbound keys and repeated keydowns', () => {
    const { input, calls } = setup();
    expect(input.handleKey('KeyQ', true, 20000)).toBe(false);
    input.handleKey('KeyD', true, 20000);
    input.handleKey('KeyD', true, 20010);
    expect(calls.filter((c) => c[0] === 'press')).toHaveLength(1);
  });

  it('routes injected inputs through the same conversion (exact round trip)', () => {
    const { input, calls } = setup(35);
    input.injectAt(2, true, 2007.5);
    input.injectAt(2, false, 2241.875);
    expect(calls[0][2]).toBeCloseTo(2007.5, 9);
    expect(calls[1][2]).toBeCloseTo(2241.875, 9);
  });

  it('plays a lane from its second key too: held with the first, one press, released with the last', () => {
    const calls: [string, number, number][] = [];
    const input = new InputManager(clock, ['ShiftLeft', 'KeyS'], {
      press: (lane, t) => calls.push(['press', lane, t]),
      release: (lane, t) => calls.push(['release', lane, t]),
    }, 0, [['ControlLeft', null]]);
    const t0 = 12345.678;
    expect(input.handleKey('ControlLeft', true, t0 + 100)).toBe(true);
    input.handleKey('ShiftLeft', true, t0 + 110);
    input.handleKey('ControlLeft', false, t0 + 120);
    input.handleKey('ShiftLeft', false, t0 + 130);
    // alternating the two keys: each new press after a release is a press of its own
    input.handleKey('ControlLeft', true, t0 + 140);
    expect(calls.map((c) => [c[0], c[1], Math.round(c[2])])).toEqual([
      ['press', 0, 100],
      ['release', 0, 130],
      ['press', 0, 140],
    ]);
  });

  it('judges the presses after an offset change by the new offset', () => {
    const { input, calls } = setup(10);
    input.handleKey('KeyD', true, 12345.678 + 500);
    input.setInputOffset(13);
    input.handleKey('KeyF', true, 12345.678 + 500);
    expect(calls.map((c) => Math.round(c[2]))).toEqual([490, 487]);
  });

  it('a pause takes no key to the sink; on again, a lane held all through or again stays down, one let go of is released then', () => {
    const { input, calls } = setup();
    const t0 = 12345.678;
    input.handleKey('KeyD', true, t0 + 100);
    input.handleKey('KeyF', true, t0 + 105);
    input.handleKey('KeyJ', true, t0 + 110);
    input.suspend();
    // while paused: D let go of, F held all through, J let go of and held again, K pressed: nothing reaches the sink
    input.handleKey('KeyD', false, t0 + 400);
    input.handleKey('KeyJ', false, t0 + 450);
    input.handleKey('KeyJ', true, t0 + 500);
    input.handleKey('KeyK', true, t0 + 520);
    expect(calls).toHaveLength(3);
    input.resume(t0 + 2000);
    // D is released where play goes on; F and J are still down
    expect(calls.slice(3)).toEqual([['release', 0, 2000]]);
    // K never reached the sink: let go of, no release; pressed again, a press of its own
    input.handleKey('KeyK', false, t0 + 2100);
    input.handleKey('KeyJ', false, t0 + 2200);
    input.handleKey('KeyK', true, t0 + 2300);
    expect(calls.slice(4)).toEqual([
      ['release', 2, 2200],
      ['press', 3, 2300],
    ]);
  });

  it('releases held keys on releaseAll', () => {
    const { input, calls } = setup();
    input.handleKey('KeyJ', true, 13000);
    input.releaseAll(13500);
    expect(calls.at(-1)).toEqual(['release', 2, 13500 - 12345.678]);
  });
});

describe('click track', () => {
  it('starts each click exactly on the beat sample', () => {
    const sr = 48000;
    const data = renderClickSamples({ bpm: 120, firstBeatMs: 1000, beats: 4, beatsPerMeasure: 4, tailMs: 200 }, sr);
    for (const ms of [1000, 1500, 2000, 2500]) {
      const i = Math.round((ms / 1000) * sr);
      expect(data[i - 1]).toBe(0);
      expect(Math.abs(data[i + 2])).toBeGreaterThan(0.01);
    }
  });
});
