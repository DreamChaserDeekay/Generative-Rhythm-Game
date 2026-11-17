import { describe, expect, it } from 'vitest';
import { keyModes } from '../engine/config';
import { LANE_COLORS } from './palette';
import { GEAR_STYLES } from './deckArt';
import * as skins from './skins';
import { BASE_SKIN, DEFAULT_HUD_TYPE, DEFAULT_PARTS, hex, HUD_FONTS, laneColorsFor, sanitizeParts, withParts } from './skins';
import { HIT_STYLES, LONG_OF, NOTE_STYLES } from './tintArt';

describe('the track', () => {
  it('has one look (기본): its colours, the parts a player starts with, its type in a bundled font', () => {
    expect(Object.keys(BASE_SKIN).sort()).toEqual(['colors', 'style']);
    expect(BASE_SKIN.style).toEqual(DEFAULT_PARTS);
    // the plain notes, the side notes as bars, the standard gear and the flash
    expect(DEFAULT_PARTS).toEqual({ note: 'flat', side: 'bar', deck: 'standard', hit: 'flash' });
    expect(Object.keys(HUD_FONTS)).toContain(DEFAULT_HUD_TYPE.font);
    for (const colour of Object.values(BASE_SKIN.colors).filter((c) => typeof c === 'string')) expect(colour).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('colours the lanes by their colour in the key mode', () => {
    const mode = keyModes['5K'];
    const lanes = laneColorsFor(BASE_SKIN, mode);
    expect(lanes[0]).toBe(hex('#eaf6ff'));
    expect(lanes[1]).toBe(hex('#4fc3ff'));
    // a lane colour the track does not set is LANE_COLORS'
    expect(laneColorsFor(BASE_SKIN, keyModes['4K+FX'])[0]).toBe(LANE_COLORS.sideL);
    // the white keys alike, the blue ones alike, the middle one gold
    expect(lanes[4]).toBe(lanes[0]);
    expect(lanes[3]).toBe(lanes[1]);
    expect(lanes[2]).toBe(hex('#ffc94f'));
  });

  it('draws the parts a player picks over it, everything else the track’s', () => {
    expect(withParts(BASE_SKIN, DEFAULT_PARTS).style).toMatchObject({ note: 'flat', side: 'bar', deck: 'standard', hit: 'flash' });
    expect(withParts(BASE_SKIN, { ...DEFAULT_PARTS, note: 'prism' }).style).toMatchObject({ note: 'prism', deck: 'standard', hit: 'flash' });
    // a gear has one look: no colourway rides on the style
    expect(withParts(BASE_SKIN, { ...DEFAULT_PARTS, deck: 'piano' }).style).not.toHaveProperty('deckColour');
    const picked = withParts(BASE_SKIN, { note: 'gpt', side: 'dots', deck: 'piano', hit: 'grid' });
    expect(picked.colors).toBe(BASE_SKIN.colors);
    expect(picked.style).toEqual({ note: 'gpt', side: 'dots', deck: 'piano', hit: 'grid' });
    // the track itself is left as it was
    expect(BASE_SKIN.style.note).toBe('flat');
  });

  it('offers the default bar and the skins’ notes with their long notes, the gears and the hits; the piano note and the notes with no gear of their own no longer', () => {
    // the plain bar a player starts with, then each skin's notes in the order of the gears
    expect(NOTE_STYLES).toEqual(['flat', 'prism', 'sky', 'fire', 'gpt', 'gemini', 'grok', 'claude', 'aqua', 'steel', 'noir', 'wire', 'astral']);
    for (const note of NOTE_STYLES) expect(LONG_OF[note]).toBeDefined();
    // the skins' gears, then the piano
    expect(GEAR_STYLES).toEqual(['standard', 'prism', 'sky', 'fire', 'gpt', 'gemini', 'grok', 'claude', 'aqua', 'steel', 'noir', 'wire', 'astral', 'piano']);
    // the hits of the sets whose notes are gone stay, each picked on its own (the piano set's among them)
    for (const hit of ['mecha', 'club', 'crystal', 'neon', 'piano'] as const) expect(HIT_STYLES).toContain(hit);
  });

  it('picks each part on its own: no skin sets a gear, its notes and its hit together, though every skin’s gear has notes and a hit of its name to pick', () => {
    // the row that picked them together (설정 → 기어 → 스킨) is gone, and what it read the parts back with
    for (const gone of ['SKIN_IDS', 'SKIN_PARTS', 'skinOf', 'withSkin']) expect(Object.keys(skins), gone).not.toContain(gone);
    for (const gear of GEAR_STYLES.filter((g) => g !== 'standard' && g !== 'piano')) {
      expect(NOTE_STYLES as string[], gear).toContain(gear);
      expect(HIT_STYLES as string[], gear).toContain(gear);
    }
    // any note with any gear and any hit: the parts are kept as picked
    for (const note of NOTE_STYLES) {
      for (const deck of ['standard', 'piano', 'sky'] as const) {
        const parts = { note, side: 'dots' as const, deck, hit: 'grid' as const };
        expect(sanitizeParts(parts), `${note} on ${deck}`).toEqual(parts);
        expect(withParts(BASE_SKIN, parts).style, `${note} on ${deck}`).toEqual(parts);
      }
    }
  });

  it('keeps the picked parts it knows and the defaults for the rest', () => {
    expect(sanitizeParts(undefined)).toEqual(DEFAULT_PARTS);
    expect(DEFAULT_PARTS.deck).toBe('standard');
    expect(sanitizeParts({ note: 'gpt', side: 'dots', deck: 'piano', hit: 'grid' })).toEqual({ note: 'gpt', side: 'dots', deck: 'piano', hit: 'grid' });
    // an earlier version's gear colour is dropped: each gear has one look
    expect(sanitizeParts({ deck: 'piano', deckColour: 'red', hit: 'mecha' })).toEqual({ ...DEFAULT_PARTS, deck: 'piano', hit: 'mecha' });
    // the piano note taken out: the flat notes, its hit kept
    expect(sanitizeParts({ note: 'piano', hit: 'piano' })).toEqual({ ...DEFAULT_PARTS, hit: 'piano' });
    // what earlier versions kept: a long note picked, the skin's own, and the old skins' own styles (gone)
    expect(sanitizeParts({ note: 'gloss', long: 'ray', side: 'skin', deck: 7, hit: 'flipbook' })).toEqual(DEFAULT_PARTS);
    expect(sanitizeParts({ note: 'skin', deck: 'skin', hit: 'skin' })).toEqual(DEFAULT_PARTS);
    expect(sanitizeParts({ note: 'stem', deck: 'line', hit: 'stemflash' })).toEqual(DEFAULT_PARTS);
    expect(sanitizeParts({ deck: 'stem' }).deck).toBe('standard');
    // the gears and hits taken out: the defaults (the five sets' gears among them: the default one)
    for (const deck of ['hazard', 'candy', 'jewel', 'mono', 'concrete', 'avionics', 'cassette', 'arcade', 'mixer', 'crystal', 'neon', 'grand']) expect(sanitizeParts({ deck }).deck).toBe(DEFAULT_PARTS.deck);
    for (const hit of ['star', 'bomb', 'hex', 'shards', 'wave', 'spark', 'shutter']) expect(sanitizeParts({ hit }).hit).toBe(DEFAULT_PARTS.hit);
  });

  it('reads the parts of the two skins taken out (saved as rainbow and magenta) as the default ones', () => {
    for (const gone of ['rainbow', 'magenta']) {
      // no longer offered: no note, gear or hit of that name
      expect(NOTE_STYLES as string[], gone).not.toContain(gone);
      expect(GEAR_STYLES as string[], gone).not.toContain(gone);
      expect(HIT_STYLES as string[], gone).not.toContain(gone);
      // a player who had the skin on: each of its three parts the default one (the side notes stay as picked)
      const parts = sanitizeParts({ note: gone, side: 'dots', deck: gone, hit: gone });
      expect(parts, gone).toEqual({ ...DEFAULT_PARTS, side: 'dots' });
      // one part of it picked among others: that part alone goes back, the others stay
      expect(sanitizeParts({ note: gone, side: 'bar', deck: 'piano', hit: 'grid' }), gone).toEqual({ note: DEFAULT_PARTS.note, side: 'bar', deck: 'piano', hit: 'grid' });
      expect(sanitizeParts({ note: 'steel', side: 'bar', deck: gone, hit: 'noir' }), gone).toEqual({ note: 'steel', side: 'bar', deck: DEFAULT_PARTS.deck, hit: 'noir' });
      expect(sanitizeParts({ note: 'astral', side: 'dots', deck: 'piano', hit: gone }), gone).toEqual({ note: 'astral', side: 'dots', deck: 'piano', hit: DEFAULT_PARTS.hit });
    }
  });

  it('reads the seven gears taken out (saved as cabinet, receiver, najeon, keyboard, racing, orbital, rawglass) as the default gear, the piano as it is', () => {
    for (const gone of ['cabinet', 'receiver', 'najeon', 'keyboard', 'racing', 'orbital', 'rawglass']) {
      // no longer offered
      expect(GEAR_STYLES as string[], gone).not.toContain(gone);
      // a player who had the gear on: the default gear, the notes, side notes and hit as picked
      expect(sanitizeParts({ note: 'prism', side: 'dots', deck: gone, hit: 'club' }), gone).toEqual({ note: 'prism', side: 'dots', deck: DEFAULT_PARTS.deck, hit: 'club' });
      expect(sanitizeParts({ note: 'sky', side: 'bar', deck: gone, hit: 'flare' }), gone).toEqual({ note: 'sky', side: 'bar', deck: 'standard', hit: 'flare' });
      // with the parts a player starts with otherwise, those are the parts again
      expect(sanitizeParts({ deck: gone }), gone).toEqual(DEFAULT_PARTS);
      // a gear colour an earlier version saved with it goes too
      expect(sanitizeParts({ deck: gone, deckColour: 'red', hit: 'mecha' }), gone).toEqual({ ...DEFAULT_PARTS, hit: 'mecha' });
    }
    // the old gear that stays
    expect(GEAR_STYLES).toContain('piano');
    expect(sanitizeParts({ note: 'claude', side: 'dots', deck: 'piano', hit: 'club' })).toEqual({ note: 'claude', side: 'dots', deck: 'piano', hit: 'club' });
  });

  it('reads the ten notes taken out (saved as chrome, hairline, glass, enamel, pearl, carbon, chamfer, round, star4, star5) as the default note, the rest of the parts as saved', () => {
    for (const gone of ['chrome', 'hairline', 'glass', 'enamel', 'pearl', 'carbon', 'chamfer', 'round', 'star4', 'star5']) {
      // no longer offered: no note of that name, and no long note of its own
      expect(NOTE_STYLES as string[], gone).not.toContain(gone);
      expect(Object.keys(LONG_OF), gone).not.toContain(gone);
      // a player who had the note on: the plain bar, the side notes, the gear and the hit as picked
      expect(sanitizeParts({ note: gone, side: 'dots', deck: 'piano', hit: 'club' }), gone).toEqual({ note: 'flat', side: 'dots', deck: 'piano', hit: 'club' });
      expect(sanitizeParts({ note: gone, side: 'bar', deck: 'astral', hit: 'astral' }), gone).toEqual({ note: DEFAULT_PARTS.note, side: 'bar', deck: 'astral', hit: 'astral' });
      // with the parts a player starts with otherwise, those are the parts again, and the track is drawn with them
      const parts = sanitizeParts({ note: gone });
      expect(parts, gone).toEqual(DEFAULT_PARTS);
      expect(withParts(BASE_SKIN, parts).style, gone).toEqual(BASE_SKIN.style);
    }
    // the hits that came with the sets of the shaped notes are still picked on their own
    for (const hit of ['mecha', 'club', 'crystal', 'neon'] as const) expect(sanitizeParts({ note: 'round', hit }), hit).toEqual({ ...DEFAULT_PARTS, hit });
  });
});
