import { describe, expect, it } from 'vitest';
import { activeCovers, bindingsFor, DEFAULT_SETTINGS, greenNumber, sanitizeSettings, withCovers, withDifficultySystem } from './settings';

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

  it('keeps the key beam length between off and twice the usual (settings saved before the option: the usual)', () => {
    expect(sanitizeSettings({}).keyBeamLength).toBe(1);
    expect(sanitizeSettings({ keyBeamLength: 0 }).keyBeamLength).toBe(0);
    expect(sanitizeSettings({ keyBeamLength: 5 }).keyBeamLength).toBe(2);
    expect(sanitizeSettings({ keyBeamLength: 'x' as never }).keyBeamLength).toBe(1);
  });

  it('keeps the hit effect size and the plane camera (settings saved before them: the usual effects, SDVX)', () => {
    expect(sanitizeSettings({})).toMatchObject({ hitEffectSize: 'normal', cameraPreset: 'SDVX' });
    expect(sanitizeSettings({ hitEffectSize: 'small' }).hitEffectSize).toBe('small');
    expect(sanitizeSettings({ hitEffectSize: 'off' }).hitEffectSize).toBe('off');
    expect(sanitizeSettings({ hitEffectSize: 'huge' as never }).hitEffectSize).toBe('normal');
    expect(sanitizeSettings({ cameraPreset: 'PLANE' }).cameraPreset).toBe('PLANE');
    expect(sanitizeSettings({ cameraPreset: 'TOP' }).cameraPreset).toBe('SDVX');
  });

  it('keeps the judgement opacity, the judge counter and the EX-SCORE pacemaker targets (settings saved before them: solid, off)', () => {
    expect(sanitizeSettings({})).toMatchObject({ judgementOpacity: 1, judgeCounter: false });
    expect(sanitizeSettings({ judgementOpacity: 0.4, judgeCounter: true })).toMatchObject({ judgementOpacity: 0.4, judgeCounter: true });
    expect(sanitizeSettings({ judgementOpacity: 0.5, judgeCounter: 'yes' as never })).toMatchObject({ judgementOpacity: 1, judgeCounter: false });
    expect(sanitizeSettings({ pacemaker: 'AAA' }).pacemaker).toBe('AAA');
    expect(sanitizeSettings({ pacemaker: 'MAX' }).pacemaker).toBe('MAX');
    expect(sanitizeSettings({ pacemaker: '97' as never }).pacemaker).toBe('OFF');
  });

  it('shows bar lines unless they were turned off (settings saved before the option too)', () => {
    expect(sanitizeSettings({}).barLines).toBe(true);
    expect(sanitizeSettings({ barLines: false }).barLines).toBe(false);
    expect(sanitizeSettings({ barLines: 'x' as never }).barLines).toBe(true);
  });

  it('opens settings saved before the textured skins, and keeps a picked one', () => {
    expect(DEFAULT_SETTINGS.skin).toBe('flat');
    expect(sanitizeSettings({ skin: 'neon', customSkin: null }).skin).toBe('neon');
    expect(sanitizeSettings({ skin: 'jewel' }).skin).toBe('jewel');
    expect(sanitizeSettings({ skin: 'chrome' as never }).skin).toBe(DEFAULT_SETTINGS.skin);
    const custom = sanitizeSettings({ skin: 'custom', customSkin: { label: '내 스킨', textures: { note: 'gel/note' } } });
    expect([custom.skin, (custom.customSkin as { textures?: unknown } | null)?.textures]).toEqual(['custom', { note: 'gel/note' }]);
  });

  it('opens a skin of an earlier version as the skin that took its place', () => {
    const renamed = Object.fromEntries(['classic', 'metal', 'glass', 'crystal', 'gel', 'sunset', 'neon', 'mono'].map((id) => [id, sanitizeSettings({ skin: id }).skin]));
    expect(renamed).toEqual({ classic: 'club', metal: 'arcade', glass: 'glass', crystal: 'jewel', gel: 'pop', sunset: 'pop', neon: 'neon', mono: 'mono' });
  });

  it('keeps the song select favourites, folder and order, dropping unknown ones', () => {
    expect(sanitizeSettings({})).toMatchObject({ favorites: [], songFolder: 'all', songSort: 'added' });
    const s = sanitizeSettings({ favorites: ['a', 'b', 'a', 3 as never], songFolder: 'favorites', songSort: 'bpm' });
    expect(s).toMatchObject({ favorites: ['a', 'b'], songFolder: 'favorites', songSort: 'bpm' });
    expect(sanitizeSettings({ favorites: 'a' as never, songFolder: 'x' as never, songSort: 'y' as never })).toMatchObject({ favorites: [], songFolder: 'all', songSort: 'added' });
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

  it('moves to another difficulty system on the same step (NORMAL → NM, MX → SHD)', () => {
    const s = { ...DEFAULT_SETTINGS, difficultySystem: 'GRG' as const, lastDifficulty: 'NORMAL' };
    expect(withDifficultySystem(s, 'DJMAX').lastDifficulty).toBe('NM');
    const mx = { ...DEFAULT_SETTINGS, difficultySystem: 'DJMAX' as const, lastDifficulty: 'MX' };
    expect(withDifficultySystem(mx, 'EZ2ON')).toMatchObject({ difficultySystem: 'EZ2ON', lastDifficulty: 'SHD' });
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
