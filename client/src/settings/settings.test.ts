import { describe, expect, it } from 'vitest';
import {
  activeCovers,
  bindingLabel,
  bindingsFor,
  chartPickKey,
  chartPickOf,
  DEFAULT_SETTINGS,
  greenNumber,
  laneColorsOf,
  laneKeysFor,
  padMenuFor,
  padMenuKeysFor,
  padPlayOf,
  patternKey,
  patternOf,
  playKeysOf,
  rebindKey,
  resetSettings,
  sanitizeSettings,
  skinOf,
  secondBindingsFor,
  songOffsetOf,
  withChartPick,
  withCovers,
  withDifficultySystem,
  withoutSong,
  withPattern,
  withSongOffset,
} from './settings';
import { skinById, laneColorsFor } from '../render/skins';
import { keyModes } from '../engine/config';

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

  it('lays the side notes over half the keys whatever was saved, shows no visualizer, and starts on the game’s own difficulty system', () => {
    expect(DEFAULT_SETTINGS.sideNotes).toBe('half');
    for (const sideNotes of [undefined, 'lanes', 'half', 'djmax']) expect(sanitizeSettings({ sideNotes: sideNotes as never }).sideNotes).toBe('half');
    expect(sanitizeSettings({ visualizer: true }).visualizer).toBe(false);
    expect(DEFAULT_SETTINGS.difficultySystem).toBe('GRG');
  });

  it('keeps the judgement opacity, the judge counter and the EX-SCORE pacemaker targets (settings saved before them: solid, off)', () => {
    expect(sanitizeSettings({})).toMatchObject({ judgementOpacity: 1, judgeCounter: false });
    expect(sanitizeSettings({ judgementOpacity: 0.4, judgeCounter: true })).toMatchObject({ judgementOpacity: 0.4, judgeCounter: true });
    expect(sanitizeSettings({ judgementOpacity: 0.5, judgeCounter: 'yes' as never })).toMatchObject({ judgementOpacity: 1, judgeCounter: false });
    expect(sanitizeSettings({ pacemaker: 'AAA' }).pacemaker).toBe('AAA');
    expect(sanitizeSettings({ pacemaker: 'MAX' }).pacemaker).toBe('MAX');
    expect(sanitizeSettings({ pacemaker: '97' as never }).pacemaker).toBe('OFF');
  });

  it('shows the timing error bar only when it was saved on (settings saved before it: off)', () => {
    expect(DEFAULT_SETTINGS.errorBar).toBe(false);
    expect(sanitizeSettings({}).errorBar).toBe(false);
    expect(sanitizeSettings({ errorBar: true }).errorBar).toBe(true);
    for (const v of ['true', 1, null]) expect(sanitizeSettings({ errorBar: v as never }).errorBar).toBe(false);
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

  it('keeps the note colours picked, the player’s own presets, and draws the lanes in them', () => {
    expect([DEFAULT_SETTINGS.noteColors, DEFAULT_SETTINGS.colorPresets]).toEqual(['skin', []]);
    const own = { id: 'user-1', name: '밤', lanes: { '4K': ['#111111', '#222222', '#333333', '#444444'] } };
    const s = sanitizeSettings({ skin: 'club', noteColors: 'user-1', colorPresets: [own] as never });
    expect(s.noteColors).toBe('user-1');
    expect(laneColorsOf(s, '4K')).toEqual([0x111111, 0x222222, 0x333333, 0x444444]);
    expect(laneColorsOf({ ...s, noteColors: 'skin' }, '4K')).toEqual(laneColorsFor(skinById('club', null), 'default', keyModes['4K']));
    // a preset gone, or one no version had: 기본
    expect(sanitizeSettings({ noteColors: 'user-2', colorPresets: [own] as never }).noteColors).toBe('skin');
    expect(sanitizeSettings({ noteColors: 'neon' }).noteColors).toBe('skin');
    expect(sanitizeSettings({ noteColors: 'aurora' }).noteColors).toBe('aurora');
    // a reset keeps the player's presets (as the favourites), and goes back to 기본
    const reset = resetSettings(s);
    expect([reset.noteColors, reset.colorPresets]).toEqual(['skin', s.colorPresets]);
  });

  it('keeps the parts picked apart from the skin and draws the skin with them', () => {
    expect(DEFAULT_SETTINGS.parts).toEqual({ note: 'flat', side: 'bar', deck: 'grand', hit: 'flash' });
    const s = sanitizeSettings({ skin: 'pop', parts: { note: 'star5', side: 'dots', deck: 'grand', hit: 'nope' as never, side2: 1 } as never });
    expect(s.parts).toEqual({ note: 'star5', side: 'dots', deck: 'grand', hit: 'flash' });
    expect(skinOf(s).style).toMatchObject({ note: 'star5', side: 'dots', deck: 'grand', hit: 'flash' });
    // the skin keeps its colours
    expect(skinOf(s).colors).toBe(skinById('pop', null).colors);
  });

  it('opens a skin of an earlier version as the skin that took its place', () => {
    const renamed = Object.fromEntries(['classic', 'metal', 'glass', 'crystal', 'gel', 'sunset', 'neon', 'mono'].map((id) => [id, sanitizeSettings({ skin: id }).skin]));
    expect(renamed).toEqual({ classic: 'club', metal: 'arcade', glass: 'glass', crystal: 'jewel', gel: 'pop', sunset: 'pop', neon: 'neon', mono: 'mono' });
  });

  it('keeps the song select favourites, folder and order, dropping unknown ones', () => {
    expect(sanitizeSettings({})).toMatchObject({ favorites: [], songFolder: 'all', songSort: 'added' });
    const s = sanitizeSettings({ favorites: ['a', 'b', 'a', 3 as never], songFolder: 'favorites', songSort: 'bpm' });
    expect(s).toMatchObject({ favorites: ['a', 'b'], songFolder: 'favorites', songSort: 'bpm' });
    expect(sanitizeSettings({ songFolder: 'noFullCombo', songSort: 'recent' })).toMatchObject({ songFolder: 'noFullCombo', songSort: 'recent' });
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
      padMenu: { ok: 'Pad:B2', up: 'Pad:TT0-', down: 'Pad:A1+', left: 'Pad:A0', options: null, retry: 'Pad:B9' } as never,
    });
    // a default stays unstored; Esc is no binding; Ctrl, Alt, Shift in that order
    expect(s.playKeys).toEqual({ retry: 'KeyR', speedUp: 'Ctrl+Alt+KeyW', speedUpBig: 'Alt+Shift+ArrowUp' });
    expect(playKeysOf(s)).toMatchObject({ retry: 'KeyR', fever: 'Enter', liftUp: 'Alt+PageDown', speedDownBig: 'Shift+ArrowDown' });
    // a turntable is no Start or FEVER button; null keeps "none"
    expect(s.padPlay).toEqual({ start: 'Pad:B11', select: null });
    expect(padPlayOf(s)).toEqual({ start: 'Pad:B11', select: null, fever: null });
    // a menu direction is a turntable's turn or an axis pushed one way, never an axis as a whole
    expect(s.padMenu).toEqual({ ok: 'Pad:B2', up: 'Pad:TT0-', down: 'Pad:A1+', options: null, retry: 'Pad:B9' });
    expect(bindingLabel('Alt+PageUp')).toBe('Alt+PgUp');
    expect(bindingLabel('Shift+Minus')).toBe('Shift+-');
    expect(bindingLabel('ArrowDown')).toBe('↓');
  });

  it('infers the menu buttons of a controller from its lanes: keys 1–4 decide, cancel, go left and right; the turntable scrolls', () => {
    const iidx = sanitizeSettings({
      lastKeyMode: '7K+1S',
      padBindings: { '7K+1S': ['Pad:TT0', 'Pad:B0', 'Pad:B1', 'Pad:B2', 'Pad:B3', 'Pad:B4', 'Pad:B5', 'Pad:B6'] },
    });
    expect(padMenuFor(iidx)).toEqual({ ok: 'Pad:B0', back: 'Pad:B1', up: 'Pad:TT0-', down: 'Pad:TT0+', left: 'Pad:B2', right: 'Pad:B3', options: null, retry: null });
    // one assigned replaces the inferred, null clears it
    const own = { ...iidx, padMenu: { ok: 'Pad:B8', back: null } };
    expect(padMenuFor(own)).toMatchObject({ ok: 'Pad:B8', back: null, up: 'Pad:TT0-' });
    expect(padMenuKeysFor(own)).toMatchObject({ 'Pad:B8': 'Enter', 'Pad:TT0-': 'ArrowUp', 'Pad:TT0+': 'ArrowDown', 'Pad:B2': 'ArrowLeft' });
    // 다시 하기 only where it is assigned (a function button, say): it sends R, the result's retry
    expect(padMenuKeysFor({ ...iidx, padMenu: { retry: 'Pad:B9' } })).toMatchObject({ 'Pad:B9': 'KeyR', 'Pad:B0': 'Enter' });
    expect(Object.values(padMenuKeysFor(iidx))).not.toContain('KeyR');
    // no pad lanes anywhere: its first two buttons decide and cancel, and no axis is a direction
    expect(padMenuFor(DEFAULT_SETTINGS)).toEqual({ ok: 'Pad:B0', back: 'Pad:B1', up: null, down: null, left: null, right: null, options: null, retry: null });
  });

  it('keeps the turntable sensitivity and release time, and pausing when the window is left (settings saved before them: 1 step, 120 ms, on)', () => {
    expect(sanitizeSettings({})).toMatchObject({ turntableSteps: 1, turntableReleaseMs: 120, pauseOnBlur: true });
    expect(sanitizeSettings({ turntableSteps: 9, turntableReleaseMs: 10, pauseOnBlur: false })).toMatchObject({ turntableSteps: 4, turntableReleaseMs: 40, pauseOnBlur: false });
    expect(sanitizeSettings({ turntableSteps: 2.4, pauseOnBlur: 'no' as never })).toMatchObject({ turntableSteps: 2, pauseOnBlur: true });
  });

  it('keeps the display mode (settings saved before it, or of an unknown kind: a window)', () => {
    expect(sanitizeSettings({}).displayMode).toBe('window');
    expect(sanitizeSettings({ displayMode: 'fullscreen' }).displayMode).toBe('fullscreen');
    expect(sanitizeSettings({ displayMode: 'borderless' as never }).displayMode).toBe('window');
  });

  it('resets every setting but the favourites and what each song keeps (its pattern, its chart, its offset)', () => {
    const song = '0123456789abcdef';
    const kept = {
      favorites: [song],
      patterns: { [patternKey(song, '4K', 'DJMAX', 'NM')]: 7 },
      chartPicks: { [chartPickKey(song, '4K')]: 'c0123456789abcdef0123' },
      songOffsets: { [song]: 12 },
    };
    const s = sanitizeSettings({ ...kept, hiSpeed: 6.5, inputOffsetMs: 20, displayMode: 'fullscreen', bindings: { '4K': ['KeyA', 'KeyS', 'KeyK', 'KeyL'] } });
    const reset = resetSettings(s);
    expect(reset).toEqual({ ...DEFAULT_SETTINGS, ...kept });
    expect(reset.hiSpeed).toBe(DEFAULT_SETTINGS.hiSpeed);
    expect(bindingsFor(reset, '4K')).toEqual(bindingsFor(DEFAULT_SETTINGS, '4K'));
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

  it('keeps the pattern of a difficulty of a song and the saved chart of a key mode of a song, of their kinds', () => {
    const song = '0123456789abcdef';
    const mx = patternKey(song, '7K+1S', 'DJMAX', 'MX');
    const raw = {
      patterns: {
        [mx]: 42,
        [patternKey(song, '6K+FX', 'GRG', 'MASTER')]: 2 ** 32 - 1,
        [patternKey(song, '7K+1S', 'DJMAX', 'HD')]: `c${'d'.repeat(20)}`,
        [patternKey(song, '7K+1S', 'DJMAX', 'NM')]: 'c-not-a-chart',
        [patternKey(song, '4K', 'DJMAX', 'NM')]: -1,
        [patternKey(song, '4K', 'EZ2ON', 'SHD')]: 1.5,
        [`${song}|9K|DJMAX|MX`]: 1,
        [`${song}|4K|PUMP|NM`]: 1,
        'abc|4K|DJMAX|NM': 1,
      },
      chartPicks: { [chartPickKey(song, '7K+1S')]: `c${'a'.repeat(20)}`, [chartPickKey(song, '4K')]: 'c123', [`${song}|9K`]: `c${'b'.repeat(20)}` },
    };
    const s = sanitizeSettings(raw as never);
    // a seed (새 패턴) or a chart chosen by its id
    expect(s.patterns).toEqual({ [mx]: 42, [patternKey(song, '6K+FX', 'GRG', 'MASTER')]: 2 ** 32 - 1, [patternKey(song, '7K+1S', 'DJMAX', 'HD')]: `c${'d'.repeat(20)}` });
    expect(s.chartPicks).toEqual({ [chartPickKey(song, '7K+1S')]: `c${'a'.repeat(20)}` });
    expect(sanitizeSettings({ patterns: [1] as never, chartPicks: 'x' as never })).toMatchObject({ patterns: {}, chartPicks: {} });
    expect(patternOf(s, mx)).toBe(42);
    expect(patternOf(s, patternKey(song, '4K', 'DJMAX', 'NM'))).toBeNull();
    // back to the default pattern, and to a difficulty
    expect(patternOf(withPattern(s, mx, null), mx)).toBeNull();
    expect(withPattern(s, mx, 7).patterns[mx]).toBe(7);
    expect(chartPickOf(withChartPick(s, chartPickKey(song, '7K+1S'), null), chartPickKey(song, '7K+1S'))).toBeNull();
    expect(chartPickOf(withChartPick(s, chartPickKey(song, '4K'), `c${'c'.repeat(20)}`), chartPickKey(song, '4K'))).toBe(`c${'c'.repeat(20)}`);
  });

  it('forgets the patterns, the charts chosen and the offset of a song taken out of the library, and only its', () => {
    const song = '0123456789abcdef';
    const other = 'fedcba9876543210';
    const s = withSongOffset(
      withSongOffset(
        withChartPick(withPattern(withPattern(DEFAULT_SETTINGS, patternKey(song, '4K', 'DJMAX', 'NM'), `c${'d'.repeat(20)}`), patternKey(other, '4K', 'DJMAX', 'NM'), 5), chartPickKey(song, '7K+1S'), `c${'a'.repeat(20)}`),
        song,
        12,
      ),
      other,
      -3,
    );
    const t = withoutSong(s, song);
    expect(t.patterns).toEqual({ [patternKey(other, '4K', 'DJMAX', 'NM')]: 5 });
    expect(t.chartPicks).toEqual({});
    expect(t.songOffsets).toEqual({ [other]: -3 });
  });

  it('never lets the covers close the lane', () => {
    const c = activeCovers({ sudden: 0.85, hidden: 0.85, lift: 0, coversOn: true });
    expect(c.sudden + c.hidden).toBeLessThanOrEqual(0.9 + 1e-9);
  });
});
