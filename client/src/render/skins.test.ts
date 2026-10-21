import { describe, expect, it } from 'vitest';
import { cameraConfig, keyModes } from '../engine/config';
import { LANE_PALETTES } from './palette';
import { BUILTIN_SKINS, DEFAULT_HUD_TYPE, hex, HUD_FONTS, laneColorsFor, sanitizeSkin, skinById } from './skins';

describe('skins', () => {
  it('keeps valid fields of a user skin and replaces the rest with defaults', () => {
    const skin = sanitizeSkin({
      label: '  내 스킨  ',
      noteShape: 'round',
      laneLayout: 'sideways',
      hitEffect: 'ring',
      colors: { judgeLine: '#ff0000', railLeft: 'red', lanes: { white: '#123456', blue: 42 } },
    });
    expect(skin).not.toBeNull();
    expect(skin?.label).toBe('내 스킨');
    expect(skin?.noteShape).toBe('round');
    expect(skin?.laneLayout).toBe('mode');
    expect(skin?.colors.judgeLine).toBe('#ff0000');
    expect(skin?.colors.railLeft).toBe(BUILTIN_SKINS[0].colors.railLeft);
    expect(skin?.colors.lanes).toEqual({ white: '#123456' });
    expect(skin?.style).toBeUndefined();
    expect(sanitizeSkin('nope')).toBeNull();
    expect(skinById('custom', null).id).toBe('flat');
  });

  it('opens a skin of an earlier version as the one that took its place', () => {
    const ids = ['neon', 'classic', 'metal', 'glass', 'crystal', 'gel', 'sunset', 'mono'].map((id) => skinById(id, null).id);
    expect(ids).toEqual(['neon', 'club', 'arcade', 'glass', 'jewel', 'pop', 'pop', 'mono']);
    expect(skinById('glass', null).label).toBe('크리스털');
    expect(skinById('nope', null).id).toBe('flat');
  });

  it('colours lanes by the skin layout', () => {
    const mode = keyModes['7K+1S'];
    const flat = laneColorsFor(skinById('flat', null), 'default', mode);
    expect(flat[0]).toBe(LANE_PALETTES.default.scratch);
    expect(flat[1]).toBe(LANE_PALETTES.default.white);
    const mono = laneColorsFor(skinById('mono', null), 'default', mode);
    expect(new Set(mono.slice(1)).size).toBe(1);
    const rainbow = laneColorsFor(sanitizeSkin({ laneLayout: 'rainbow' })!, 'default', mode);
    expect(new Set(rainbow.slice(1)).size).toBe(7);
    expect(rainbow[0]).toBe(LANE_PALETTES.default.scratch);
  });

  it('keeps texture ids and the drawing style of a user skin, dropping malformed ones', () => {
    const skin = sanitizeSkin({
      hitEffect: 'sprite',
      textures: { note: 'glass/note', floor: '../floor', rails: 7, wings: 'glass/wings', hitBurst: 'fx/hitBurstRing' },
      style: { note: 'gem', long: 'nope', rails: { width: 99, glow: 8 }, judge: { under: '#ff9f43', over: 'gold' }, camera: 'LOW' },
    });
    expect(skin?.hitEffect).toBe('sprite');
    expect(skin?.textures).toEqual({ note: 'glass/note', hitBurst: 'fx/hitBurstRing' });
    expect(skin?.style).toMatchObject({ note: 'gem', long: 'solid', rails: { width: 20, glow: 8 }, judge: { under: '#ff9f43' }, camera: 'LOW' });
    expect(skin?.style?.judge.over).toBeUndefined();
    expect(sanitizeSkin({ textures: { note: 'a b' } })?.textures).toBeUndefined();
    // every built-in skin survives a round trip through "현재 스킨 JSON 보기"
    for (const builtin of BUILTIN_SKINS) expect(sanitizeSkin(JSON.parse(JSON.stringify(builtin)))).toEqual({ ...builtin, id: 'custom' });
  });

  it('keeps a user skin’s judgement type to the bundled fonts and sane sizes', () => {
    const type = sanitizeSkin({ style: { type: { font: 'Comic Sans', size: 500, combo: 'big', max: 'red', outline: '#102030', inline: true, skew: -40 } } })?.style?.type;
    expect(type).toEqual({ ...DEFAULT_HUD_TYPE, size: 96, outline: '#102030', inline: true, skew: -20 });
    expect(sanitizeSkin({ style: { type: { font: 'Cinzel', bar: '#ffd23f', split: 'yes' } } })?.style?.type).toEqual({ ...DEFAULT_HUD_TYPE, font: 'Cinzel', bar: '#ffd23f' });
    // a style without a type writes with the default one
    expect(sanitizeSkin({ style: { note: 'gem' } })?.style?.type).toEqual(DEFAULT_HUD_TYPE);
    for (const builtin of BUILTIN_SKINS) expect(Object.keys(HUD_FONTS)).toContain(builtin.style?.type.font);
  });

  it('draws the built-in skins in code, each for its own camera; JEWEL plays the crystal set’s flipbooks', () => {
    expect(BUILTIN_SKINS.map((s) => s.id)).toEqual(['flat', 'stem', 'arcade', 'club', 'street', 'neon', 'glass', 'pop', 'jewel', 'mono']);
    for (const skin of BUILTIN_SKINS) expect(skin.style?.camera).toMatch(/^(SDVX|FLAT|LOW)$/);
    // a user skin may name any camera preset, the plane one too
    for (const id of Object.keys(cameraConfig.presets)) expect(sanitizeSkin({ style: { camera: id } })?.style?.camera).toBe(id);
    expect(skinById('arcade', null).style?.camera).toBe('FLAT');
    expect(skinById('neon', null).style?.camera).toBe('LOW');
    expect(skinById('jewel', null).textures).toEqual({ hitBurst: 'fx/hitBurstGlow', hitHold: 'fx/hitHold' });
    expect(BUILTIN_SKINS.filter((s) => s.textures).map((s) => s.id)).toEqual(['jewel']);
    // each its own gear under the judge line, and the combo over the judgement
    expect(new Set(BUILTIN_SKINS.map((s) => s.style?.deck)).size).toBe(BUILTIN_SKINS.length);
    for (const skin of BUILTIN_SKINS) expect(skin.style?.type.inline).toBeUndefined();
  });

  it('reads the key cap a skin of an earlier version names as the gear it became', () => {
    expect(sanitizeSkin({ style: { cap: 'gloss' } })?.style?.deck).toBe('arcade');
    expect(sanitizeSkin({ style: { cap: 'piano' } })?.style?.deck).toBe('mixer');
    expect(sanitizeSkin({ style: { deck: 'jewel', cap: 'gloss' } })?.style?.deck).toBe('jewel');
    expect(sanitizeSkin({ style: { cap: 'toString' } })?.style?.deck).toBe('line');
    expect(sanitizeSkin({ style: { deck: 'keys' } })?.style?.deck).toBe('line');
  });

  it('lets the colour-blind palette win over skin lane colours', () => {
    const mode = keyModes['4K'];
    const club = laneColorsFor(skinById('club', null), 'default', mode);
    expect(club[0]).toBe(hex('#f2f2f2'));
    const cb = laneColorsFor(skinById('club', null), 'colorblind', mode);
    expect(cb[0]).toBe(LANE_PALETTES.colorblind.white);
  });
});
