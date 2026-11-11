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
    // the crystal skin's letters cut into flat planes (its styles colour the judgements), "MAX" apart from its percent; no other gear's
    expect([GEAR_TYPES.prism.font, GEAR_TYPES.prism.fill, GEAR_TYPES.prism.split]).toEqual(['Exo 2', 'crystal', true]);
    // the sky skin's letters round and slanted, white easing to sky blue (its styles': the fill 'sky'), "MAX" apart from its percent
    expect([GEAR_TYPES.sky.font, GEAR_TYPES.sky.fill, GEAR_TYPES.sky.split, HUD_FONTS.Nunito]).toEqual(['Nunito', 'sky', true, { weight: 800, italic: true }]);
    // the Firestarter skin's tall and tight, heavy and slanted, in a heat of its own (the fill 'fire'), "MAX" apart from its percent
    expect([GEAR_TYPES.fire.font, GEAR_TYPES.fire.fill, GEAR_TYPES.fire.split, HUD_FONTS['Barlow Condensed Italic']]).toEqual(['Barlow Condensed Italic', 'fire', true, { weight: 800, italic: true }]);
    // the AI companies' skins': GPT's plain heavy sans (the app's own), GEMINI's rounded sans in its three colours across, GROK's monospace all white, CLAUDE's serif cream to terracotta
    expect([GEAR_TYPES.gpt.font, GEAR_TYPES.gemini.font, GEAR_TYPES.grok.font, GEAR_TYPES.claude.font]).toEqual(['Pretendard Variable', 'Outfit', 'JetBrains Mono', 'Source Serif 4']);
    expect([GEAR_TYPES.gpt.fill, GEAR_TYPES.gemini.fill, GEAR_TYPES.grok.fill, GEAR_TYPES.claude.fill]).toEqual([undefined, 'gemini', undefined, 'claude']);
    expect([GEAR_TYPES.grok.max, GEAR_TYPES.grok.split]).toEqual(['#ffffff', undefined]);
    for (const font of ['Pretendard Variable', 'Outfit', 'JetBrains Mono', 'Source Serif 4'] as const) expect(HUD_FONTS[font].italic, font).toBe(false);
    // the aqua mecha skin's squared and slanted, white in an aqua outline (the fill 'aqua')
    expect([GEAR_TYPES.aqua.font, GEAR_TYPES.aqua.fill, GEAR_TYPES.aqua.split]).toEqual(['Chakra Petch', 'aqua', true]);
    for (const gear of GEAR_STYLES.filter((g) => !['prism', 'sky', 'fire', 'gemini', 'claude', 'aqua', 'steel', 'rainbow', 'noir', 'magenta', 'wire', 'astral'].includes(g))) expect(GEAR_TYPES[gear].fill, gear).toBeUndefined();
    expect(GAUGE_NAMES).toEqual({ standard: 'FEVER', prism: 'FEVER', sky: 'FEVER', fire: 'FEVER', gpt: 'FEVER', gemini: 'FEVER', grok: 'FEVER', claude: 'FEVER', aqua: 'FEVER', steel: 'FEVER', rainbow: 'FEVER', noir: 'FEVER', magenta: 'FEVER', wire: 'FEVER', astral: 'FEVER', cabinet: 'GROOVE', receiver: 'SIGNAL', najeon: '흥', keyboard: 'CHARGE', racing: 'FUEL', orbital: 'O2', piano: 'FORTE', rawglass: 'CLARITY' });
  });
});
