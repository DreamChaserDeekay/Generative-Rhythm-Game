import { describe, expect, it } from 'vitest';
import { keyModes } from '../engine/config';
import { LANE_COLORS } from './palette';
import { GEAR_STYLES } from './deckArt';
import { BASE_SKIN, DEFAULT_HUD_TYPE, DEFAULT_PARTS, hex, HUD_FONTS, laneColorsFor, sanitizeParts, withParts } from './skins';
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
    // the bar in six finishes after the plain one, then the shapes
    expect(NOTE_STYLES).toEqual(['flat', 'chrome', 'hairline', 'glass', 'enamel', 'pearl', 'carbon', 'chamfer', 'round', 'star4', 'star5']);
    for (const note of NOTE_STYLES) expect(LONG_OF[note]).toBeDefined();
    expect(GEAR_STYLES).toEqual(['standard', 'cabinet', 'receiver', 'najeon', 'keyboard', 'racing', 'orbital', 'piano', 'rawglass']);
    // the piano set's hit stays
    expect(HIT_STYLES).toContain('piano');
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
    // the gears and hits taken out: the defaults (the five sets' gears among them: the standard gear)
    for (const deck of ['hazard', 'candy', 'jewel', 'mono', 'concrete', 'avionics', 'cassette', 'arcade', 'mixer', 'crystal', 'neon', 'grand']) expect(sanitizeParts({ deck }).deck).toBe('standard');
    for (const hit of ['star', 'bomb', 'hex', 'shards', 'wave', 'spark', 'shutter']) expect(sanitizeParts({ hit }).hit).toBe('flash');
  });
});
