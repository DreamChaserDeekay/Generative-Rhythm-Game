import { describe, expect, it } from 'vitest';
import { activeCovers, bindingsFor, DEFAULT_SETTINGS, greenNumber, sanitizeSettings, withCovers } from './settings';

describe('settings', () => {
  it('drops unknown values and clamps numbers', () => {
    const s = sanitizeSettings({ ruleset: 'NOPE' as never, hiSpeed: 99, sudden: 3, placement: 'X' as never, generation: { density: 9 } as never });
    expect(s.ruleset).toBe(DEFAULT_SETTINGS.ruleset);
    expect(s.hiSpeed).toBe(10);
    expect(s.sudden).toBeLessThanOrEqual(0.85);
    expect(s.placement).toBe('OFF');
    expect(s.generation.density).toBe(1.5);
    expect(s.generation.style).toBe('balanced');
  });

  it('keeps the pattern engine choice and the difficulty basis, dropping unknown ones', () => {
    expect(sanitizeSettings({}).generation.patternEngine).toBe('sectioned');
    expect(sanitizeSettings({ generation: { patternEngine: 'classic' } as never }).generation.patternEngine).toBe('classic');
    expect(sanitizeSettings({ generation: { patternEngine: 'random' } as never }).generation.patternEngine).toBe('sectioned');
    // "designer" was the default before the sectioned engine; only a picked one stays
    expect(sanitizeSettings({ generation: { patternEngine: 'designer' } as never }).generation.patternEngine).toBe('sectioned');
    expect(sanitizeSettings({ generation: { patternEngine: 'designer', engineSet: true } as never }).generation.patternEngine).toBe('designer');
    const ez = sanitizeSettings({ difficultySystem: 'EZ2ON', lastDifficulty: 'NORMAL' });
    expect([ez.difficultySystem, ez.lastDifficulty]).toEqual(['EZ2ON', 'NM']);
    expect(sanitizeSettings({ difficultySystem: 'PUMP' as never }).difficultySystem).toBe(DEFAULT_SETTINGS.difficultySystem);
  });

  it('computes the green number from SUDDEN+ and LIFT (not HIDDEN+)', () => {
    const base = { ...DEFAULT_SETTINGS, hiSpeed: 4 };
    expect(greenNumber(4, activeCovers(base))).toBeCloseTo(1250, 9);
    expect(greenNumber(4, activeCovers({ ...base, sudden: 0.2 }))).toBeCloseTo(1000, 9);
    expect(greenNumber(4, activeCovers({ ...base, sudden: 0.2, hidden: 0.3 }))).toBeCloseTo(1000, 9);
    expect(greenNumber(4, activeCovers({ ...base, lift: 0.2 }))).toBeCloseTo(1000, 9);
    expect(greenNumber(4, activeCovers({ ...base, sudden: 0.5, coversOn: false }))).toBeCloseTo(1250, 9);
  });

  it('keeps the green number when covers move and visible time is locked', () => {
    const s = { ...DEFAULT_SETTINGS, hiSpeed: 4, keepVisibleTime: true };
    const before = greenNumber(s.hiSpeed, activeCovers(s));
    const next = withCovers(s, { sudden: 0.3 });
    expect(next.hiSpeed).toBeLessThan(s.hiSpeed);
    expect(greenNumber(next.hiSpeed, activeCovers(next))).toBeCloseTo(before, 0);
    const free = withCovers({ ...s, keepVisibleTime: false }, { sudden: 0.3 });
    expect(free.hiSpeed).toBe(4);
  });

  it('uses S D F K L ; as the default 6-key layout', () => {
    expect(bindingsFor(DEFAULT_SETTINGS, '6K')).toEqual(['KeyS', 'KeyD', 'KeyF', 'KeyK', 'KeyL', 'Semicolon']);
    expect(bindingsFor(DEFAULT_SETTINGS, '6K+FX').slice(1, 7)).toEqual(['KeyS', 'KeyD', 'KeyF', 'KeyK', 'KeyL', 'Semicolon']);
  });

  it('never lets the covers close the lane', () => {
    const c = activeCovers({ sudden: 0.85, hidden: 0.85, lift: 0, coversOn: true });
    expect(c.sudden + c.hidden).toBeLessThanOrEqual(0.9 + 1e-9);
  });
});
