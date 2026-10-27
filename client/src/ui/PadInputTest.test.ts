import { describe, expect, it } from 'vitest';
import type { PadEvent } from '../input/gamepad';
import { PAD_TEST_START, padTestStep, type PadTestState } from './PadInputTest';

const ev = (code: string, down: boolean, way?: number): PadEvent => ({ code, down, timeMs: 0, standard: false, ...(way !== undefined && { way }) });
const run = (lanes: (string | null)[], events: PadEvent[]): PadTestState => events.reduce((s, e) => padTestStep(s, e, lanes), PAD_TEST_START);

describe('the pad input check', () => {
  const lanes = ['Pad:TT0', 'Pad:B0', 'Pad:B1', null];

  it('names the controls held, bound or not, and remembers each one pressed', () => {
    const s = run(lanes, [ev('Pad:B0', true), ev('Pad:B7', true), ev('Pad:B0', false)]);
    expect(s.held).toEqual(['Pad:B7']);
    expect(s.seen).toEqual(['Pad:B0', 'Pad:B7']);
    expect(s.scratches).toBe(0);
  });

  it('counts the scratches of a turntable lane with the way the last one turned', () => {
    // one way, then back the other way (released and pressed again), then let go
    const s = run(lanes, [ev('Pad:TT0', true, 1), ev('Pad:TT0', false), ev('Pad:TT0', true, -1), ev('Pad:TT0', false)]);
    expect(s).toMatchObject({ held: [], scratches: 2, way: -1 });
    expect(run(lanes, [ev('Pad:TT0', true, 1)])).toMatchObject({ held: ['Pad:TT0'], scratches: 1, way: 1 });
  });

  it('leaves out a turntable that is no lane’s (every axis is read as one: a stick moved)', () => {
    const s = run(lanes, [ev('Pad:TT1', true, 1), ev('Pad:A1+', true)]);
    expect(s.held).toEqual(['Pad:A1+']);
    expect(s.scratches).toBe(0);
  });

  it('leaves out the direction of a turntable lane’s axis, but names a stick on another axis', () => {
    expect(run(lanes, [ev('Pad:A0+', true)]).held).toEqual([]);
    expect(run(lanes, [ev('Pad:A1+', true)]).held).toEqual(['Pad:A1+']);
  });
});
