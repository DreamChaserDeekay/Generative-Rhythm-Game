import { describe, expect, it } from 'vitest';
import { keyModes } from '../engine/config';
import { LANE_COLORS } from './palette';
import { GEAR_STYLES } from './deckArt';
import { BASE_SKIN, DEFAULT_HUD_TYPE, DEFAULT_PARTS, hex, HUD_FONTS, laneColorsFor, sanitizeParts, SKIN_IDS, SKIN_PARTS, skinOf, withParts, withSkin } from './skins';
import { HIT_STYLES, LONG_OF, NOTE_STYLES } from './tintArt';

describe('the track', () => {
  it('has one look (기본): its colours, the parts a player starts with, its type in a bundled font', () => {
    expect(Object.keys(BASE_SKIN).sort()).toEqual(['colors', 'style']);
    expect(BASE_SKIN.style).toEqual(DEFAULT_PARTS);
    expect(Object.keys(HUD_FONTS)).toContain(DEFAULT_HUD_TYPE.font);
    for (const colour of Object.values(BASE_SKIN.colors).filter((c) => typeof c === 'string')) expect(colour).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('colours the lanes by their colour in the key mode', () => {
    const mode = keyModes['7K+1S'];
    const lanes = laneColorsFor(BASE_SKIN, mode);
    expect(lanes[0]).toBe(hex('#ff5c8a'));
    expect(lanes[1]).toBe(hex('#eaf6ff'));
    expect(lanes[2]).toBe(hex('#4fc3ff'));
    // a lane colour the track does not set is LANE_COLORS'
    expect(laneColorsFor(BASE_SKIN, keyModes['4K+FX'])[0]).toBe(LANE_COLORS.sideL);
    // the white keys alike, the blue ones alike, the middle one gold
    expect(lanes[3]).toBe(lanes[1]);
    expect(lanes[6]).toBe(lanes[2]);
    expect(lanes[4]).toBe(hex('#ffc94f'));
  });

  it('draws the parts a player picks over it, everything else the track’s', () => {
    expect(withParts(BASE_SKIN, DEFAULT_PARTS).style).toMatchObject({ note: 'flat', side: 'bar', deck: 'standard', hit: 'flash' });
    expect(withParts(BASE_SKIN, { ...DEFAULT_PARTS, note: 'round' }).style).toMatchObject({ note: 'round', deck: 'standard', hit: 'flash' });
    // a gear has one look: no colourway rides on the style
    expect(withParts(BASE_SKIN, { ...DEFAULT_PARTS, deck: 'cabinet' }).style).not.toHaveProperty('deckColour');
    const picked = withParts(BASE_SKIN, { note: 'star4', side: 'dots', deck: 'receiver', hit: 'grid' });
    expect(picked.colors).toBe(BASE_SKIN.colors);
    expect(picked.style).toEqual({ note: 'star4', side: 'dots', deck: 'receiver', hit: 'grid' });
    // the track itself is left as it was
    expect(BASE_SKIN.style.note).toBe('flat');
  });

  it('offers the note families with their long notes, the gears and the hits, the piano note no longer', () => {
    // the skins' notes first (the plain bar a player starts with, then the crystal skin's cut glass), the bar in six finishes, then the shapes
    expect(NOTE_STYLES).toEqual(['flat', 'prism', 'chrome', 'hairline', 'glass', 'enamel', 'pearl', 'carbon', 'chamfer', 'round', 'star4', 'star5']);
    for (const note of NOTE_STYLES) expect(LONG_OF[note]).toBeDefined();
    expect(GEAR_STYLES).toEqual(['standard', 'prism', 'cabinet', 'receiver', 'najeon', 'keyboard', 'racing', 'orbital', 'piano', 'rawglass']);
    // the piano set's hit stays
    expect(HIT_STYLES).toContain('piano');
  });

  it('picks a skin’s gear, notes and hit together, whatever the side notes, and reads the skin back from the parts', () => {
    expect(SKIN_IDS).toEqual(['default', 'crystal']);
    // the default skin is what a player starts with; the crystal skin's parts are saved as 'prism'
    expect({ ...SKIN_PARTS.default, side: 'bar' }).toEqual(DEFAULT_PARTS);
    expect(SKIN_PARTS.crystal).toEqual({ note: 'prism', deck: 'prism', hit: 'prism' });
    for (const id of SKIN_IDS) {
      // every part a skin names is one a player can pick
      expect(NOTE_STYLES).toContain(SKIN_PARTS[id].note);
      expect(GEAR_STYLES).toContain(SKIN_PARTS[id].deck);
      expect(HIT_STYLES).toContain(SKIN_PARTS[id].hit);
      // the side notes are none of a skin's parts: kept as picked, and the skin read back with either
      for (const side of ['bar', 'dots'] as const) {
        const parts = withSkin({ ...DEFAULT_PARTS, note: 'round', hit: 'grid', side }, id);
        expect(parts).toEqual({ ...SKIN_PARTS[id], side });
        expect(skinOf(parts)).toBe(id);
        expect(skinOf(parts, 'gear')).toBe(id);
        // the lettering kept the track's own: not the skin whole
        expect(skinOf(parts, 'skin')).toBeNull();
      }
    }
    // one part changed, and it is no skin
    expect(skinOf({ ...DEFAULT_PARTS, hit: 'prism' })).toBeNull();
    expect(skinOf({ ...withSkin(DEFAULT_PARTS, 'crystal'), deck: 'standard' })).toBeNull();
    expect(skinOf({ note: 'star4', side: 'bar', deck: 'receiver', hit: 'grid' })).toBeNull();
  });

  it('keeps the picked parts it knows and the defaults for the rest', () => {
    expect(sanitizeParts(undefined)).toEqual(DEFAULT_PARTS);
    expect(DEFAULT_PARTS.deck).toBe('standard');
    expect(sanitizeParts({ note: 'star4', side: 'dots', deck: 'najeon', hit: 'grid' })).toEqual({ note: 'star4', side: 'dots', deck: 'najeon', hit: 'grid' });
    // an earlier version's gear colour is dropped: each gear has one look
    expect(sanitizeParts({ deck: 'receiver', deckColour: 'red', hit: 'mecha' })).toEqual({ ...DEFAULT_PARTS, deck: 'receiver', hit: 'mecha' });
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
});
