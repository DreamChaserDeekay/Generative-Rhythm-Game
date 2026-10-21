import { describe, expect, it } from 'vitest';
import {
  activeCovers,
  bindingLabel,
  bindingsFor,
  DEFAULT_SETTINGS,
  greenNumber,
  laneKeysFor,
  padMenuFor,
  padMenuKeysFor,
  padPlayOf,
  playKeysOf,
  rebindKey,
  sanitizeSettings,
  secondBindingsFor,
  songOffsetOf,
  withCovers,
  withDifficultySystem,
  withSongOffset,
} from './settings';

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

  it('keeps a second key per lane, none that is already a key of the mode (settings saved before them: none)', () => {
    expect(sanitizeSettings({}).secondBindings).toEqual({});
    expect(secondBindingsFor(sanitizeSettings({}), '7K+1S')).toEqual(new Array(8).fill(null));
    const s = sanitizeSettings({ secondBindings: { '7K+1S': ['ControlLeft', null, null, null, null, null, null, null], '4K': ['KeyD', 'KeyX', 'KeyX', 5 as never], '5K': ['KeyQ'] } });
    expect(secondBindingsFor(s, '7K+1S')[0]).toBe('ControlLeft');
    // D is the first key of 4K's lane 1, X is used once only
    expect(secondBindingsFor(s, '4K')).toEqual([null, 'KeyX', null, null]);
    // the wrong length for 5K: dropped
    expect(s.secondBindings['5K']).toBeUndefined();
    expect(laneKeysFor(s, '7K+1S')).toEqual([...bindingsFor(s, '7K+1S'), 'ControlLeft']);
    // a mode's keys that are not all keyboard codes fall back to the defaults
    expect(bindingsFor(sanitizeSettings({ bindings: { '4K': ['KeyA', 'Pad:B1', 'KeyJ', 'KeyK'] } }), '4K')).toEqual(['KeyD', 'KeyF', 'KeyJ', 'KeyK']);
  });

  it('binds a lane key or a second key, swapping with the key it takes, and never leaves a lane without one', () => {
    const s = { ...DEFAULT_SETTINGS };
    const scratch2 = rebindKey(s, '7K+1S', 0, true, 'ControlLeft');
    expect(secondBindingsFor(scratch2!, '7K+1S')[0]).toBe('ControlLeft');
    // the second key given to another lane's first key: they swap
    const swapped = rebindKey(scratch2!, '7K+1S', 1, false, 'ControlLeft')!;
    expect(bindingsFor(swapped, '7K+1S')[1]).toBe('ControlLeft');
    expect(secondBindingsFor(swapped, '7K+1S')[0]).toBe('KeyS');
    // a lane's only key taken for an empty second key: refused; a first key cannot be cleared
    expect(rebindKey(s, '4K', 0, true, 'KeyF')).toBe(null);
    expect(rebindKey(s, '4K', 0, false, null)).toBe(null);
    // a second key cleared: none left in the mode
    expect(rebindKey(scratch2!, '7K+1S', 0, true, null)!.secondBindings['7K+1S']).toBeUndefined();
  });

  it('keeps in-play keys that differ from the defaults, and the pad buttons and menu buttons assigned', () => {
    const s = sanitizeSettings({
      playKeys: { retry: 'KeyR', liftUp: 'Alt+PageDown', fever: 'Escape', speedUp: 'Alt+Ctrl+KeyW', speedUpBig: 'Shift+Alt+ArrowUp', nope: 'KeyQ' } as never,
      padPlay: { start: 'Pad:B11', select: null, fever: 'Pad:TT0' } as never,
      padMenu: { ok: 'Pad:B2', up: 'Pad:TT0-', down: 'Pad:A1+', left: 'Pad:A0', options: null } as never,
    });
    // a default stays unstored; Esc is no binding; Ctrl, Alt, Shift in that order
    expect(s.playKeys).toEqual({ retry: 'KeyR', speedUp: 'Ctrl+Alt+KeyW', speedUpBig: 'Alt+Shift+ArrowUp' });
    expect(playKeysOf(s)).toMatchObject({ retry: 'KeyR', fever: 'Enter', liftUp: 'Alt+PageDown', speedDownBig: 'Shift+ArrowDown' });
    // a turntable is no Start or FEVER button; null keeps "none"
    expect(s.padPlay).toEqual({ start: 'Pad:B11', select: null });
    expect(padPlayOf(s)).toEqual({ start: 'Pad:B11', select: null, fever: null });
    // a menu direction is a turntable's turn or an axis pushed one way, never an axis as a whole
    expect(s.padMenu).toEqual({ ok: 'Pad:B2', up: 'Pad:TT0-', down: 'Pad:A1+', options: null });
    expect(bindingLabel('Alt+PageUp')).toBe('Alt+PgUp');
    expect(bindingLabel('Shift+Minus')).toBe('Shift+-');
    expect(bindingLabel('ArrowDown')).toBe('↓');
  });

  it('infers the menu buttons of a controller from its lanes: keys 1–4 decide, cancel, go left and right; the turntable scrolls', () => {
    const iidx = sanitizeSettings({
      lastKeyMode: '7K+1S',
      padBindings: { '7K+1S': ['Pad:TT0', 'Pad:B0', 'Pad:B1', 'Pad:B2', 'Pad:B3', 'Pad:B4', 'Pad:B5', 'Pad:B6'] },
    });
    expect(padMenuFor(iidx)).toEqual({ ok: 'Pad:B0', back: 'Pad:B1', up: 'Pad:TT0-', down: 'Pad:TT0+', left: 'Pad:B2', right: 'Pad:B3', options: null });
    // one assigned replaces the inferred, null clears it
    const own = { ...iidx, padMenu: { ok: 'Pad:B8', back: null } };
    expect(padMenuFor(own)).toMatchObject({ ok: 'Pad:B8', back: null, up: 'Pad:TT0-' });
    expect(padMenuKeysFor(own)).toMatchObject({ 'Pad:B8': 'Enter', 'Pad:TT0-': 'ArrowUp', 'Pad:TT0+': 'ArrowDown', 'Pad:B2': 'ArrowLeft' });
    // no pad lanes anywhere: its first two buttons decide and cancel, and no axis is a direction
    expect(padMenuFor(DEFAULT_SETTINGS)).toEqual({ ok: 'Pad:B0', back: 'Pad:B1', up: null, down: null, left: null, right: null, options: null });
  });

  it('keeps the turntable sensitivity and release time, and pausing when the window is left (settings saved before them: 1 step, 120 ms, on)', () => {
    expect(sanitizeSettings({})).toMatchObject({ turntableSteps: 1, turntableReleaseMs: 120, pauseOnBlur: true });
    expect(sanitizeSettings({ turntableSteps: 9, turntableReleaseMs: 10, pauseOnBlur: false })).toMatchObject({ turntableSteps: 4, turntableReleaseMs: 40, pauseOnBlur: false });
    expect(sanitizeSettings({ turntableSteps: 2.4, pauseOnBlur: 'no' as never })).toMatchObject({ turntableSteps: 2, pauseOnBlur: true });
  });

  it('keeps a song offset per song: whole ms, capped, none of 0', () => {
    const s = sanitizeSettings({ songOffsets: { a: 3.4, b: 900, c: 0, d: 'x' as never } });
    expect(s.songOffsets).toEqual({ a: 3, b: 200 });
    expect(sanitizeSettings({ songOffsets: [1] as never }).songOffsets).toEqual({});
    expect(songOffsetOf(s, 'a')).toBe(3);
    expect(songOffsetOf(s, null)).toBe(0);
    const t = withSongOffset(s, 'a', -2);
    expect(t.songOffsets).toEqual({ a: -2, b: 200 });
    expect(withSongOffset(t, 'a', 0).songOffsets).toEqual({ b: 200 });
    expect(withSongOffset(t, 'e', -500).songOffsets.e).toBe(-200);
  });

  it('never lets the covers close the lane', () => {
    const c = activeCovers({ sudden: 0.85, hidden: 0.85, lift: 0, coversOn: true });
    expect(c.sudden + c.hidden).toBeLessThanOrEqual(0.9 + 1e-9);
  });
});
