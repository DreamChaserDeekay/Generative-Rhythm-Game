import { describe, expect, it } from 'vitest';
import { GEAR_STYLES } from './deckArt';
import { GAUGE_NAMES, GEAR_TYPES, HUD_TYPE_SOURCES, hudTypeFor } from './gearHud';
import { DEFAULT_HUD_TYPE, HUD_FONTS } from './skins';

describe('the HUD a gear brings', () => {
  it('writes the judgement and combo in the gear’s type unless the player keeps the track’s own (기본)', () => {
    expect(HUD_TYPE_SOURCES).toEqual(['gear', 'skin']);
    for (const gear of GEAR_STYLES) {
      expect(hudTypeFor({ deck: gear }, 'gear')).toBe(GEAR_TYPES[gear]);
      expect(hudTypeFor({ deck: gear }, 'skin')).toBe(DEFAULT_HUD_TYPE);
    }
  });

  it('writes in the fonts bundled, in plain colours, and names each gauge but the standard one', () => {
    for (const gear of GEAR_STYLES) {
      const t = GEAR_TYPES[gear];
      expect(HUD_FONTS[t.font], gear).toBeDefined();
      if (t.comboFont) expect(HUD_FONTS[t.comboFont], gear).toBeDefined();
      for (const colour of [t.max, t.outline, t.comboColor, t.comboOutline]) if (colour !== undefined) expect(colour, gear).toMatch(/^#[0-9a-f]{6}$/i);
    }
    // the cabinet's and the receiver's readouts in seven segments, the najeon's in gold serif
    expect([GEAR_TYPES.cabinet.comboFont, GEAR_TYPES.receiver.comboFont]).toEqual(['DSEG7 Classic', 'DSEG7 Classic']);
    expect(GEAR_TYPES.najeon.font).toBe('Cinzel');
    // "MAX" in white, its percent in the standard gear's cyan
    expect(GEAR_TYPES.standard.split).toBe(true);
    // the keyboard's OLED pixels and the orbital panel's stencil over its green seven segments; the
    // keyboard's and the racing wheel's judgements over a bar in their accent
    expect([GEAR_TYPES.keyboard.font, GEAR_TYPES.orbital.font, GEAR_TYPES.orbital.comboFont]).toEqual(['Silkscreen', 'Saira Stencil One', 'DSEG7 Classic']);
    expect([GEAR_TYPES.keyboard.bar, GEAR_TYPES.racing.bar]).toEqual(['#ff8a1e', '#e3242b']);
    // the piano's a Didone's bold italic, as a score prints its dynamics, over a brass bar
    expect([GEAR_TYPES.piano.font, HUD_FONTS['Bodoni Moda'].italic, GEAR_TYPES.piano.bar]).toEqual(['Bodoni Moda', true, '#c9a45c']);
    // the moon's wide geometric capitals
    expect(GEAR_TYPES.rawglass.font).toBe('Orbitron');
    expect(GAUGE_NAMES).toEqual({ standard: null, cabinet: 'GROOVE', receiver: 'SIGNAL', najeon: '흥', keyboard: 'CHARGE', racing: 'FUEL', orbital: 'O2', piano: 'FORTE', rawglass: 'CLARITY' });
  });
});
