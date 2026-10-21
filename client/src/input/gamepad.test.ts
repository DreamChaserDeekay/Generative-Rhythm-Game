import { describe, expect, it } from 'vitest';
import inputJson from '@config/input.json';
import { GamepadPoller, isPadCode, menuAction, padCodeLabel, padMenuKey, SELECT_PAD_KEYS, setPadMenuKeys, SHOULDER_KEYS, type PadEvent } from './gamepad';
import { InputManager } from './InputManager';

const CFG = inputJson.gamepad;

/** A mutable stand-in for a browser Gamepad. */
function fakePad(buttons = 16, axes = 4, mapping = 'standard') {
  return {
    index: 0,
    id: 'test pad',
    connected: true,
    mapping,
    timestamp: 1,
    buttons: Array.from({ length: buttons }, () => ({ pressed: false, touched: false, value: 0 })),
    axes: new Array(axes).fill(0),
  };
}

function poller(options: { turntable?: { steps: number; releaseMs: number }; axisStep?: number; mapping?: string } = {}) {
  const pad = fakePad(16, 4, options.mapping);
  const events: PadEvent[] = [];
  const p = new GamepadPoller((e) => events.push(e), { source: () => [pad as unknown as Gamepad], ...options });
  return { pad, events, p };
}

/** One step of an 8-bit axis (0–255 stretched to -1..1). */
const STEP = 2 / 255;
const at8bit = (raw: number) => (raw / 255) * 2 - 1;

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
      { code: 'Pad:B3', down: true, timeMs: 1003.5, standard: true },
      { code: 'Pad:B3', down: false, timeMs: 1100.25, standard: true },
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
    expect(events.filter((e) => e.code.startsWith('Pad:A'))).toEqual([{ code: 'Pad:A1+', down: true, timeMs: 10, standard: true, jump: true }]);
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
    expect(events.filter((e) => e.code === 'Pad:TT0')).toEqual([{ code: 'Pad:TT0', down: true, timeMs: 4, standard: true }]);
  });

  it('releases what is held when stopped', () => {
    const { pad, events, p } = poller();
    p.poll(0);
    pad.buttons[5].pressed = true;
    pad.timestamp = 2;
    p.poll(2);
    p.stop(50);
    expect(events.at(-1)).toEqual({ code: 'Pad:B5', down: false, timeMs: 50, standard: true });
  });

  it('scratches on a turntable turned one 8-bit step at a time, and holds it while it keeps turning', () => {
    const { pad, events, p } = poller();
    pad.axes[0] = at8bit(100);
    p.poll(0);
    // one step every 50 ms (under the release time): pressed at the first step, never let go
    for (let i = 1; i <= 8; i++) {
      pad.axes[0] = at8bit(100 + i);
      pad.timestamp = i * 50;
      p.poll(i * 50);
    }
    const tt = () => events.filter((e) => e.code === 'Pad:TT0').map((e) => [e.down, e.timeMs]);
    expect(tt()).toEqual([[true, 50]]);
    // one step back is a bounce (the hand stopping the platter), two are a new scratch the other way
    pad.axes[0] = at8bit(107);
    pad.timestamp = 450;
    p.poll(450);
    expect(tt()).toEqual([[true, 50]]);
    pad.axes[0] = at8bit(106);
    pad.timestamp = 500;
    p.poll(500);
    expect(tt()).toEqual([
      [true, 50],
      [false, 500],
      [true, 500],
    ]);
    // standing still for the release time lets go
    p.poll(500 + CFG.turntable.releaseMs + 10);
    expect(tt().at(-1)).toEqual([false, 500 + CFG.turntable.releaseMs + 10]);
  });

  for (const steps of [1, 2]) {
    it(`lets go of a scratch while the axis flickers a step back and forth at rest, and presses none (sensitivity ${steps})`, () => {
      const releaseMs = 120;
      const { pad, events, p } = poller({ turntable: { steps, releaseMs } });
      pad.axes[0] = at8bit(50);
      p.poll(0);
      // a turn of a few steps, then the encoder rests on an edge: 54 and 53 in turn, every read, for a second
      for (let i = 1; i <= 4; i++) {
        pad.axes[0] = at8bit(50 + i);
        p.poll(i * 4);
      }
      for (let t = 20; t <= 1020; t += 2) {
        pad.axes[0] = at8bit(t % 4 === 0 ? 54 : 53);
        p.poll(t);
      }
      const tt = events.filter((e) => e.code === 'Pad:TT0').map((e) => [e.down, e.timeMs]);
      expect(tt).toHaveLength(2);
      expect(tt[0][0]).toBe(true);
      expect(tt[1]).toEqual([false, expect.closeTo(16 + releaseMs, -1)]);
      // a real turn after it is a scratch again, from the first step on
      pad.axes[0] = at8bit(55);
      p.poll(1030);
      pad.axes[0] = at8bit(56);
      p.poll(1040);
      expect(events.filter((e) => e.code === 'Pad:TT0').map((e) => e.down)).toEqual([true, false, true]);
    });
  }

  it('presses nothing for a flicker from the first reading at a sensitivity of two steps, and once at most at one', () => {
    for (const [steps, presses] of [
      [2, 0],
      [1, 1],
    ]) {
      const { pad, events, p } = poller({ turntable: { steps, releaseMs: 120 } });
      pad.axes[0] = at8bit(80);
      p.poll(0);
      // a single step cannot be told from a first step of a turn: the flicker after it can
      for (let t = 2; t <= 1000; t += 2) {
        pad.axes[0] = at8bit(t % 4 === 0 ? 80 : 81);
        p.poll(t);
      }
      expect(events.filter((e) => e.code === 'Pad:TT0' && e.down)).toHaveLength(presses);
      expect(events.filter((e) => e.code === 'Pad:TT0').at(-1)?.down ?? false).toBe(false);
    }
  });

  it('adds up steps until the sensitivity asks for more, and forgets them once it stood still', () => {
    const { pad, events, p } = poller({ turntable: { steps: 2, releaseMs: 100 } });
    pad.axes[0] = at8bit(10);
    p.poll(0);
    pad.axes[0] = at8bit(11);
    p.poll(10);
    expect(events.filter((e) => e.code === 'Pad:TT0')).toEqual([]);
    pad.axes[0] = at8bit(12);
    p.poll(20);
    expect(events.filter((e) => e.code === 'Pad:TT0').map((e) => e.down)).toEqual([true]);
    // after a still spell, a single step is not enough again
    p.poll(200);
    pad.axes[0] = at8bit(13);
    p.poll(210);
    expect(events.filter((e) => e.code === 'Pad:TT0').map((e) => e.down)).toEqual([true, false]);
    pad.axes[0] = at8bit(14);
    p.poll(220);
    expect(events.filter((e) => e.code === 'Pad:TT0').map((e) => e.down)).toEqual([true, false, true]);
    expect(STEP).toBeCloseTo(CFG.turntable.step, 6);
  });

  it('tells an axis pushed past the middle in one read (a d-pad on axes) from one turned there', () => {
    const { pad, events, p } = poller({ mapping: '' });
    p.poll(0);
    pad.axes[1] = -1;
    p.poll(10);
    for (let v = 0.02; v <= 0.6; v += 0.02) {
      pad.axes[2] = v;
      p.poll(10 + v * 1000);
    }
    expect(events.filter((e) => e.code.startsWith('Pad:A') && e.down)).toEqual([
      { code: 'Pad:A1-', down: true, timeMs: 10, standard: false, jump: true },
      { code: 'Pad:A2+', down: true, timeMs: expect.any(Number), standard: false, jump: false },
    ]);
  });

  it('sends a menu step per movement of an axis, not per position', () => {
    const { pad, events, p } = poller({ axisStep: CFG.menu.axisStep, mapping: '' });
    p.poll(0);
    // a slow turn of three menu steps and a bit, then standing still: three steps, no more
    for (let i = 1; i <= 25; i++) {
      pad.axes[0] = i * 0.01;
      p.poll(i * 10);
    }
    for (let t = 260; t < 1000; t += 50) p.poll(t);
    const steps = events.filter((e) => e.code.startsWith('Pad:TT0+'));
    expect(steps.map((e) => e.down)).toEqual([true, false, true, false, true, false]);
    expect(steps.every((e) => !e.standard)).toBe(true);
    expect(events.some((e) => e.code === 'Pad:TT0-')).toBe(false);
  });
});

describe('menu keys of a pad', () => {
  it('maps the standard layout on a gamepad and only the assigned buttons on any other controller', () => {
    setPadMenuKeys({ 'Pad:B2': 'Enter', 'Pad:TT0-': 'ArrowUp' });
    expect(padMenuKey({ code: 'Pad:B0', standard: true })).toBe('Enter');
    expect(padMenuKey({ code: 'Pad:A0+', standard: true })).toBe('ArrowRight');
    // an IIDX controller's turntable axis past the middle is no arrow key, its key 1 no Enter
    expect(padMenuKey({ code: 'Pad:A0+', standard: false })).toBe(null);
    expect(padMenuKey({ code: 'Pad:B0', standard: false })).toBe(null);
    expect(padMenuKey({ code: 'Pad:B2', standard: false })).toBe('Enter');
    expect(padMenuKey({ code: 'Pad:TT0-', standard: false })).toBe('ArrowUp');
    setPadMenuKeys({});
  });

  it('gives the song select X, LT and RT for its play options, song info and settings, and LB / RB as everywhere', () => {
    expect(SELECT_PAD_KEYS).toMatchObject({ 'Pad:B2': 'Space', 'Pad:B6': 'KeyI', 'Pad:B7': 'F10', ...SHOULDER_KEYS });
    // nothing of the standard layout's own (A, B, Y, Start, Back, the d-pad) is taken
    for (const code of Object.keys(SELECT_PAD_KEYS)) expect(padMenuKey({ code, standard: true })).toBe(null);
  });
});

describe('gamepad codes and lanes', () => {
  it('validates and labels codes', () => {
    expect(isPadCode('Pad:B12')).toBe(true);
    expect(isPadCode('Pad:A0-')).toBe(true);
    expect(isPadCode('Pad:TT1')).toBe(true);
    expect(isPadCode('KeyD')).toBe(false);
    expect(padCodeLabel('Pad:TT0')).toBe('턴테이블 0');
    expect(padCodeLabel('Pad:TT1-')).toBe('턴테이블 1 −');
  });

  it('plays lanes from pad codes next to the keyboard keys', () => {
    const presses: [number, number][] = [];
    const clock = { songTimeAtPerf: (p: number) => p - 1000, perfAtSongTime: (s: number) => s + 1000 };
    const input = new InputManager(clock, ['KeyD', 'KeyF'], { press: (l, t) => presses.push([l, t]), release: () => undefined }, 0, [[null, 'Pad:B2']]);
    expect(input.handleKey('Pad:B2', true, 1500)).toBe(true);
    expect(input.handleKey('Pad:B7', true, 1500)).toBe(false);
    // the same lane held from the keyboard and the pad counts as one press
    input.handleKey('KeyF', true, 1510);
    input.handleKey('Pad:B2', false, 1520);
    input.handleKey('KeyF', false, 1530);
    expect(presses).toEqual([[1, 500]]);
  });
});

describe('menu keys from a pad', () => {
  it('press buttons, move the focus, and step sliders and drop-downs', () => {
    expect(menuAction('button', 'Enter')).toBe('press');
    expect(menuAction('none', 'Enter')).toBe(null);
    expect(menuAction('slider', 'Enter')).toBe(null);
    expect(menuAction('button', 'ArrowDown')).toBe('next');
    expect(menuAction('none', 'ArrowUp')).toBe('prev');
    expect(menuAction('text', 'Tab')).toBe('next');
    expect(menuAction('button', 'ArrowRight')).toBe('next');
    expect(menuAction('slider', 'ArrowRight')).toBe('increase');
    expect(menuAction('select', 'ArrowLeft')).toBe('decrease');
    expect(menuAction('slider', 'ArrowUp')).toBe('prev');
    expect(menuAction('button', 'Escape')).toBe(null);
  });
});
