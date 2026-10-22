import { describe, expect, it } from 'vitest';
import { optionalStep } from './optionRows';

describe('a row that may be 자동', () => {
  const r = { min: 0.5, max: 1.5, step: 0.05, bigStep: 0.25, auto: 1 };

  it('leaves 자동 at its starting value either way', () => {
    expect(optionalStep(null, 1, false, r)).toBe(1);
    expect(optionalStep(null, -1, true, r)).toBe(1);
  });

  it('steps between the ends and goes back to 자동 past them', () => {
    expect(optionalStep(1, 1, false, r)).toBe(1.05);
    expect(optionalStep(0.55, -1, false, r)).toBe(0.5);
    expect(optionalStep(0.5, -1, false, r)).toBe(null);
    expect(optionalStep(1.5, 1, false, r)).toBe(null);
  });

  it('stops a big step at the end before going past it', () => {
    expect(optionalStep(1.4, 1, true, r)).toBe(1.5);
    expect(optionalStep(1.5, 1, true, r)).toBe(null);
    expect(optionalStep(0.6, -1, true, r)).toBe(0.5);
  });
});
