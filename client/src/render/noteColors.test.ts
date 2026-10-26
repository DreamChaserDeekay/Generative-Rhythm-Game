import { describe, expect, it } from 'vitest';
import { keyModes } from '../engine/config';
import type { KeyModeId } from '../engine/types';
import {
  BUILTIN_PRESETS,
  fromHsv,
  hexString,
  lanesOf,
  lightColour,
  MAX_USER_PRESETS,
  newPreset,
  noteColorsFor,
  parseColour,
  presetById,
  sanitizePresets,
  SKIN_COLORS,
  toHsv,
  withLaneColor,
} from './noteColors';
import { LANE_PALETTES } from './palette';
import { BUILTIN_SKINS, laneColorsFor, skinById } from './skins';

const MODES = Object.keys(keyModes) as KeyModeId[];

describe('note colour presets', () => {
  it('give every lane of every key mode a colour', () => {
    for (const p of BUILTIN_PRESETS) {
      for (const m of MODES) {
        expect(p.lanes[m]).toHaveLength(keyModes[m].lanes.length);
        for (const c of p.lanes[m]) expect(c).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
    expect(new Set(BUILTIN_PRESETS.map((p) => p.id)).size).toBe(BUILTIN_PRESETS.length);
  });

  it('repeat neither the palettes’ nor any skin’s lane colours', () => {
    const taken = new Set<string>();
    for (const palette of ['default', 'colorblind'] as const) for (const m of MODES) taken.add(laneColorsFor(skinById('flat', null), palette, keyModes[m]).join());
    for (const skin of BUILTIN_SKINS) for (const m of MODES) taken.add(laneColorsFor(skin, 'default', keyModes[m]).join());
    for (const p of BUILTIN_PRESETS) {
      for (const m of MODES) expect(taken.has(p.lanes[m].map((c) => parseInt(c.slice(1), 16)).join())).toBe(false);
    }
  });

  it('colour 좌우 손 by the hand that plays a lane: blues on the left, oranges on the right, the middle key white', () => {
    const hands = presetById('hands', [])!;
    // 7K+1S: the scratch and keys 1–3 are the left hand's, 4 the middle, 5–7 the right hand's
    const [scratch, k1, k2, k3, k4, k5, k6, k7] = hands.lanes['7K+1S'];
    expect([k1, k3]).toEqual(['#cfe2ff', '#cfe2ff']);
    expect([scratch, k2]).toEqual(['#4f8dff', '#4f8dff']);
    expect(k4).toBe('#f4f4f4');
    expect([k5, k7, k6]).toEqual(['#ffe0c4', '#ffe0c4', '#ff9a3c']);
    // 8K: the middle two keys are one of each hand
    expect(hands.lanes['8K'].slice(3, 5)).toEqual(['#4f8dff', '#ff9a3c']);
    expect(hands.lanes['6K+FX'][0]).toBe('#4f8dff');
    expect(hands.lanes['6K+FX'][7]).toBe('#ff9a3c');
  });

  it('draws 기본 in the palette’s and the skin’s colours, any other in the preset’s', () => {
    const club = skinById('club', null);
    expect(noteColorsFor(club, 'default', '4K', SKIN_COLORS, [])).toEqual(laneColorsFor(club, 'default', keyModes['4K']));
    expect(noteColorsFor(club, 'colorblind', '4K', SKIN_COLORS, [])[0]).toBe(LANE_PALETTES.colorblind.white);
    // a preset is its own colours whatever the palette or the skin
    const amber = presetById('amber', [])!;
    expect(noteColorsFor(club, 'colorblind', '5K', 'amber', []).map(hexString)).toEqual(amber.lanes['5K']);
    // a preset no longer there: 기본
    expect(noteColorsFor(club, 'default', '4K', 'user-9', [])).toEqual(laneColorsFor(club, 'default', keyModes['4K']));
  });

  it('starts a preset of the player’s own from what is shown, on the next number, and changes one lane of one key mode', () => {
    const flat = skinById('flat', null);
    const first = newPreset([], lanesOf(flat, 'default', SKIN_COLORS, []));
    expect([first.id, first.name]).toEqual(['user-1', '내 색 1']);
    expect(first.lanes['7K+1S']).toEqual(laneColorsFor(flat, 'default', keyModes['7K+1S']).map(hexString));
    const second = newPreset([first, { ...first, id: 'user-4' }], lanesOf(flat, 'default', 'aurora', []));
    expect([second.id, second.name]).toEqual(['user-5', '내 색 5']);
    expect(second.lanes).toEqual(presetById('aurora', [])!.lanes);
    const edited = withLaneColor(first, '7K+1S', 2, '#123456');
    expect(edited.lanes['7K+1S'][2]).toBe('#123456');
    expect(edited.lanes['7K+1S'].filter((c, i) => c !== first.lanes['7K+1S'][i])).toHaveLength(1);
    expect(edited.lanes['8K']).toBe(first.lanes['8K']);
    expect(first.lanes['7K+1S'][2]).not.toBe('#123456');
  });

  it('keeps the player’s presets as saved, mending a lane without a colour and leaving out what is not a preset', () => {
    const lanes = Object.fromEntries(MODES.map((m) => [m, keyModes[m].lanes.map(() => '#abcdef')]));
    const good = { id: 'user-2', name: '  밤  ', lanes };
    const kept = sanitizePresets([good, { ...good, id: 'user-2' }, { id: 'aurora', name: 'x', lanes }, 'nope', { id: 'user-3', lanes: { '4K': ['#000000', 'red'] } }]);
    expect(kept.map((p) => [p.id, p.name])).toEqual([
      ['user-2', '밤'],
      ['user-3', '내 색 3'],
    ]);
    expect(kept[1].lanes['4K']).toEqual(['#000000', hexString(LANE_PALETTES.default.blue), hexString(LANE_PALETTES.default.blue), hexString(LANE_PALETTES.default.white)]);
    expect(kept[1].lanes['7K+1S']).toHaveLength(8);
    expect(sanitizePresets(Array.from({ length: 30 }, (_, i) => ({ ...good, id: `user-${i + 1}` })))).toHaveLength(MAX_USER_PRESETS);
    expect(sanitizePresets(undefined)).toEqual([]);
  });

  it('reads a colour typed in, and turns colours to hue, saturation and value and back', () => {
    expect(parseColour('#FF8800')).toBe('#ff8800');
    expect(parseColour('f80')).toBe('#ff8800');
    expect(parseColour(' #1a2B3c ')).toBe('#1a2b3c');
    expect(parseColour('#12345')).toBeNull();
    expect(parseColour('orange')).toBeNull();
    expect(toHsv('#ff0000')).toEqual({ h: 0, s: 100, v: 100 });
    expect(toHsv('#2ee0a0')).toEqual({ h: 158, s: 79, v: 88 });
    expect(toHsv('#808080')).toEqual({ h: 0, s: 0, v: 50 });
    expect(fromHsv({ h: 120, s: 100, v: 100 })).toBe('#00ff00');
    expect(fromHsv({ h: 300, s: 0, v: 100 })).toBe('#ffffff');
    // every built-in colour comes back within a step of each channel
    for (const p of BUILTIN_PRESETS) {
      for (const c of p.lanes['7K+1S']) {
        const back = parseInt(fromHsv(toHsv(c)).slice(1), 16);
        const n = parseInt(c.slice(1), 16);
        for (const shift of [16, 8, 0]) expect(Math.abs(((back >> shift) & 255) - ((n >> shift) & 255))).toBeLessThanOrEqual(3);
      }
    }
  });

  it('writes dark letters on a light swatch and light ones on a dark swatch', () => {
    expect(lightColour('#d4fff0')).toBe(true);
    expect(lightColour('#ffcd45')).toBe(true);
    // a mid blue reads better with dark letters too (relative luminance about 0.28)
    expect(lightColour('#4f8dff')).toBe(true);
    expect(lightColour('#2f3fbf')).toBe(false);
    expect(lightColour('#1a1a1a')).toBe(false);
  });
});
