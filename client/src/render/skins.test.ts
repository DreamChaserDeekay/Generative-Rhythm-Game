import { describe, expect, it } from 'vitest';
import { keyModes } from '../engine/config';
import { LANE_PALETTES } from './palette';
import { BUILTIN_SKINS, hex, laneColorsFor, sanitizeSkin, skinById, TEXTURE_SLOTS } from './skins';

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
    expect(sanitizeSkin('nope')).toBeNull();
    expect(skinById('custom', null).id).toBe('neon');
    expect(skinById('classic', null).id).toBe('classic');
  });

  it('colours lanes by the skin layout', () => {
    const mode = keyModes['7K+1S'];
    const neon = laneColorsFor(skinById('neon', null), 'default', mode);
    expect(neon[0]).toBe(LANE_PALETTES.default.scratch);
    expect(neon[1]).toBe(LANE_PALETTES.default.white);
    const mono = laneColorsFor(skinById('mono', null), 'default', mode);
    expect(new Set(mono.slice(1)).size).toBe(1);
    const rainbow = laneColorsFor(skinById('sunset', null), 'default', mode);
    expect(new Set(rainbow.slice(1)).size).toBe(7);
    expect(rainbow[0]).toBe(LANE_PALETTES.default.scratch);
  });

  it('keeps texture ids of a user skin and drops malformed ones', () => {
    const skin = sanitizeSkin({
      hitEffect: 'sprite',
      textures: { note: 'glass/note', floor: '../floor', rails: 7, wings: 'glass/wings', hitBurst: 'fx/hitBurstRing' },
    });
    expect(skin?.hitEffect).toBe('sprite');
    expect(skin?.textures).toEqual({ note: 'glass/note', hitBurst: 'fx/hitBurstRing' });
    expect(sanitizeSkin({ textures: { note: 'a b' } })?.textures).toBeUndefined();
    // a textured built-in skin survives a round trip through "현재 스킨 JSON 보기"
    const glass = skinById('glass', null);
    expect(sanitizeSkin(JSON.parse(JSON.stringify(glass)))).toEqual({ ...glass, id: 'custom' });
  });

  it('gives the generated sets a texture for every part', () => {
    for (const id of ['glass', 'crystal', 'metal', 'gel']) {
      const skin = skinById(id, null);
      expect(skin.id).toBe(id);
      expect(skin.hitEffect).toBe('sprite');
      expect(Object.keys(skin.textures ?? {}).sort()).toEqual([...TEXTURE_SLOTS].sort());
    }
  });

  it('lets the colour-blind palette win over skin lane colours', () => {
    const mode = keyModes['4K'];
    const classic = laneColorsFor(skinById('classic', null), 'default', mode);
    expect(classic[0]).toBe(hex('#f2f2f2'));
    const cb = laneColorsFor(skinById('classic', null), 'colorblind', mode);
    expect(cb[0]).toBe(LANE_PALETTES.colorblind.white);
  });
});
