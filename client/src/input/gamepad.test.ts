import { describe, expect, it } from 'vitest';
import inputJson from '@config/input.json';
import { GamepadPoller, isPadCode, padCodeLabel, type PadEvent } from './gamepad';
import { InputManager } from './InputManager';

const CFG = inputJson.gamepad;

/** A mutable stand-in for a browser Gamepad. */
function fakePad(buttons = 16, axes = 4) {
  return {
    index: 0,
    id: 'test pad',
    connected: true,
    mapping: 'standard',
    timestamp: 1,
    buttons: Array.from({ length: buttons }, () => ({ pressed: false, touched: false, value: 0 })),
    axes: new Array(axes).fill(0),
  };
}

function poller() {
  const pad = fakePad();
  const events: PadEvent[] = [];
  const p = new GamepadPoller((e) => events.push(e), { source: () => [pad as unknown as Gamepad] });
  return { pad, events, p };
}

describe('GamepadPoller', () => {
  it('reports button changes with the pad timestamp, not the polling time', () => {
    const { pad, events, p } = poller();
    p.poll(1000); // baseline
    pad.buttons[3].pressed = true;
    pad.timestamp = 1003.5;
    p.poll(1005);
    pad.buttons[3].pressed = false;
    pad.timestamp = 1100.25;
    p.poll(1104);
    expect(events).toEqual([
      { code: 'Pad:B3', down: true, timeMs: 1003.5 },
      { code: 'Pad:B3', down: false, timeMs: 1100.25 },
    ]);
  });

  it('falls back to the polling time when the timestamp is stale or unset', () => {
    const { pad, events, p } = poller();
    p.poll(5000);
    pad.buttons[0].pressed = true;
    pad.timestamp = 5000 - CFG.maxTimestampAgeMs - 50;
    p.poll(5001);
    expect(events[0].timeMs).toBe(5001);
  });

  it('turns axes into directions and turntable spins into scratches', () => {
    const { pad, events, p } = poller();
    p.poll(0);
    pad.axes[1] = 0.9; // stick down
    pad.timestamp = 10;
    p.poll(10);
    expect(events.filter((e) => e.code.startsWith('Pad:A'))).toEqual([{ code: 'Pad:A1+', down: true, timeMs: 10 }]);
    events.length = 0;
    // axis 0 as a turntable: spin one way, reverse, then stop
    let v = 0;
    for (let t = 20; t <= 60; t += 4) {
      v += 0.02;
      pad.axes[0] = v;
      pad.timestamp = t;
      p.poll(t);
    }
    v -= 0.05;
    pad.axes[0] = v;
    pad.timestamp = 64;
    p.poll(64);
    for (let t = 68; t < 64 + CFG.turntable.releaseMs + 20; t += 4) p.poll(t); // still
    const tt = events.filter((e) => e.code === 'Pad:TT0').map((e) => [e.down, e.timeMs]);
    expect(tt.slice(0, 3)).toEqual([
      [true, 20],
      [false, 64],
      [true, 64],
    ]);
    expect(tt[3][0]).toBe(false);
    expect(tt[3][1]).toBeGreaterThan(64 + CFG.turntable.releaseMs);
  });

  it('handles the wrap-around of a turntable axis as a small move', () => {
    const { pad, events, p } = poller();
    pad.axes[0] = 0.99;
    p.poll(0);
    pad.axes[0] = -0.99; // crossed the end: +0.02, the same direction
    pad.timestamp = 4;
    p.poll(4);
    expect(events.filter((e) => e.code === 'Pad:TT0')).toEqual([{ code: 'Pad:TT0', down: true, timeMs: 4 }]);
  });

  it('releases what is held when stopped', () => {
    const { pad, events, p } = poller();
    p.poll(0);
    pad.buttons[5].pressed = true;
    pad.timestamp = 2;
    p.poll(2);
    p.stop(50);
    expect(events.at(-1)).toEqual({ code: 'Pad:B5', down: false, timeMs: 50 });
  });
});

describe('gamepad codes and lanes', () => {
  it('validates and labels codes', () => {
    expect(isPadCode('Pad:B12')).toBe(true);
    expect(isPadCode('Pad:A0-')).toBe(true);
    expect(isPadCode('Pad:TT1')).toBe(true);
    expect(isPadCode('KeyD')).toBe(false);
    expect(padCodeLabel('Pad:TT0')).toBe('턴테이블 0');
  });

  it('plays lanes from pad codes next to the keyboard keys', () => {
    const presses: [number, number][] = [];
    const clock = { songTimeAtPerf: (p: number) => p - 1000, perfAtSongTime: (s: number) => s + 1000 };
    const input = new InputManager(clock, ['KeyD', 'KeyF'], { press: (l, t) => presses.push([l, t]), release: () => undefined }, 0, [null, 'Pad:B2']);
    expect(input.handleKey('Pad:B2', true, 1500)).toBe(true);
    expect(input.handleKey('Pad:B7', true, 1500)).toBe(false);
    // the same lane held from the keyboard and the pad counts as one press
    input.handleKey('KeyF', true, 1510);
    input.handleKey('Pad:B2', false, 1520);
    input.handleKey('KeyF', false, 1530);
    expect(presses).toEqual([[1, 500]]);
  });
});
