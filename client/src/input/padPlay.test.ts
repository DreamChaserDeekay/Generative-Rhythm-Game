import { describe, expect, it } from 'vitest';
import { DEFAULT_PAD_PLAY, PadPlayControls, RETRY_HOLD_MS } from './padPlay';

const LANES = ['Pad:B0', 'Pad:B1', 'Pad:B2', 'Pad:B3', 'Pad:B4'];

function controls() {
  const c = new PadPlayControls({ ...DEFAULT_PAD_PLAY, fever: 'Pad:B10' }, LANES);
  const at = (code: string, down: boolean, timeMs = 0) => c.handle({ code, down, timeMs });
  return { c, at };
}

describe('pad play controls', () => {
  it('pauses on a tap of Start alone, on its release', () => {
    const { at } = controls();
    expect(at('Pad:B9', true)).toEqual({ own: true, actions: [] });
    expect(at('Pad:B9', false)).toEqual({ own: true, actions: ['pause'] });
  });

  it('steps SPEED and SUDDEN+ with Start held and lane buttons 1–4, which then play no lane', () => {
    const { at } = controls();
    at('Pad:B9', true);
    expect(at('Pad:B0', true)).toEqual({ own: true, actions: ['speedDown'] });
    expect(at('Pad:B1', true)).toEqual({ own: true, actions: ['speedUp'] });
    expect(at('Pad:B2', true)).toEqual({ own: true, actions: ['suddenDown'] });
    expect(at('Pad:B3', true)).toEqual({ own: true, actions: ['suddenUp'] });
    // the fifth lane does nothing with Start, and plays no lane either
    expect(at('Pad:B4', true)).toEqual({ own: true, actions: [] });
    // Start let go first: the buttons' releases are still not the lanes'
    expect(at('Pad:B9', false)).toEqual({ own: true, actions: [] });
    expect(at('Pad:B0', false).own).toBe(true);
    // and afterwards the buttons are lanes again
    expect(at('Pad:B0', true)).toEqual({ own: false, actions: [] });
  });

  it('retries with Select and Start held for a second, once, without a pause on the release', () => {
    const { c, at } = controls();
    at('Pad:B8', true, 100);
    at('Pad:B9', true, 200);
    expect(c.tick(200 + RETRY_HOLD_MS - 1)).toEqual([]);
    expect(c.tick(200 + RETRY_HOLD_MS)).toEqual(['retry']);
    expect(c.tick(200 + RETRY_HOLD_MS + 500)).toEqual([]);
    expect(at('Pad:B9', false).actions).toEqual([]);
    // let go early: neither a retry nor a pause
    at('Pad:B9', true, 5000);
    at('Pad:B9', false, 5300);
    expect(c.tick(7000)).toEqual([]);
  });

  it('fires FEVER from its button, and after a reset ignores a release whose press it never saw', () => {
    const { c, at } = controls();
    expect(at('Pad:B10', true)).toEqual({ own: true, actions: ['fever'] });
    at('Pad:B9', true);
    c.reset();
    expect(at('Pad:B9', false)).toEqual({ own: true, actions: [] });
  });
});
