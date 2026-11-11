import { describe, expect, it } from 'vitest';
import { SKIN_IDS } from '../render/skins';
import { CUSTOM_SKIN, CUSTOM_SKIN_NAME, DECK_NAMES, HIT_NAMES, NOTE_NAMES, optionalStep, PART_CHOICES, SKIN_NAMES, skinChoices } from './optionRows';

describe('a row that may be 자동', () => {
  const r = { min: 0.5, max: 1.5, step: 0.05, bigStep: 0.25, auto: 1 };

  it('leaves 자동 at its starting value either way', () => {
    expect(optionalStep(null, 1, false, r)).toBe(1);
    expect(optionalStep(null, -1, true, r)).toBe(1);
  });

  it('steps between the ends and goes back to 자동 past them', () => {
    expect(optionalStep(1, 1, false, r)).toBe(1.05);
    expect(optionalStep(0.55, -1, false, r)).toBe(0.5);
    expect(optionalStep(0.5, -1, false, r)).toBe(null);
    expect(optionalStep(1.5, 1, false, r)).toBe(null);
  });

  it('stops a big step at the end before going past it', () => {
    expect(optionalStep(1.4, 1, true, r)).toBe(1.5);
    expect(optionalStep(1.5, 1, true, r)).toBe(null);
    expect(optionalStep(0.6, -1, true, r)).toBe(0.5);
  });
});

describe('the skin row', () => {
  it('offers the skins by name, 기본 first, and 직접 고름 only while the parts are no skin’s', () => {
    expect(skinChoices('default')).toEqual([
      ['default', '기본'],
      ['crystal', '크리스털'],
      ['sky', '하늘'],
      ['fire', '파이어스타터'],
      ['gpt', 'GPT'],
      ['gemini', 'Gemini'],
      ['grok', 'Grok'],
      ['claude', 'Claude'],
      ['aqua', '아쿠아'],
      ['steel', '스틸'],
      ['rainbow', '무지개'],
      ['noir', '레드라인'],
      ['magenta', '크림슨'],
      ['wire', '화이트 라인'],
      ['astral', '별밤'],
    ]);
    expect(skinChoices('crystal')).toEqual(skinChoices('default'));
    // picked part by part: the row reads 직접 고름, the last of its choices (a step either way lands on a skin)
    expect(skinChoices(null)).toEqual([...skinChoices('default'), [CUSTOM_SKIN, CUSTOM_SKIN_NAME]]);
    expect(CUSTOM_SKIN_NAME).toBe('직접 고름');
    expect(SKIN_IDS as string[]).not.toContain(CUSTOM_SKIN);
    expect(Object.keys(SKIN_NAMES)).toEqual(SKIN_IDS);
  });

  it('names a skin as its gear and its notes are named, and lists each part’s default first', () => {
    expect([SKIN_NAMES.default, DECK_NAMES.standard, NOTE_NAMES.flat]).toEqual(['기본', '기본', '기본']);
    expect([SKIN_NAMES.crystal, DECK_NAMES.prism, NOTE_NAMES.prism, HIT_NAMES.prism]).toEqual(['크리스털', '크리스털', '크리스털', '크리스털 분광']);
    expect([SKIN_NAMES.sky, DECK_NAMES.sky, NOTE_NAMES.sky, HIT_NAMES.sky]).toEqual(['하늘', '하늘', '하늘', '구름 깃털']);
    expect([SKIN_NAMES.fire, DECK_NAMES.fire, NOTE_NAMES.fire, HIT_NAMES.fire]).toEqual(['파이어스타터', '파이어스타터', '파이어스타터', '불꽃놀이']);
    for (const [id, name] of [['gpt', 'GPT'], ['gemini', 'Gemini'], ['grok', 'Grok'], ['claude', 'Claude']] as const) expect([SKIN_NAMES[id], DECK_NAMES[id], NOTE_NAMES[id]]).toEqual([name, name, name]);
    expect([HIT_NAMES.gpt, HIT_NAMES.gemini, HIT_NAMES.grok, HIT_NAMES.claude]).toEqual(['물방울 왕관', '반짝임', '엑스 섬광', '붓 빛살']);
    expect([SKIN_NAMES.aqua, DECK_NAMES.aqua, NOTE_NAMES.aqua, HIT_NAMES.aqua]).toEqual(['아쿠아', '아쿠아', '아쿠아', '록온']);
    expect([SKIN_NAMES.steel, DECK_NAMES.steel, NOTE_NAMES.steel, HIT_NAMES.steel]).toEqual(['스틸', '스틸', '스틸', '십자 섬광']);
    expect([SKIN_NAMES.rainbow, DECK_NAMES.rainbow, NOTE_NAMES.rainbow, HIT_NAMES.rainbow]).toEqual(['무지개', '무지개', '무지개', '색종이']);
    expect([SKIN_NAMES.noir, DECK_NAMES.noir, NOTE_NAMES.noir, HIT_NAMES.noir]).toEqual(['레드라인', '레드라인', '레드라인', '글리치']);
    expect([SKIN_NAMES.magenta, DECK_NAMES.magenta, NOTE_NAMES.magenta, HIT_NAMES.magenta]).toEqual(['크림슨', '크림슨', '크림슨', '파편 섬광']);
    expect([SKIN_NAMES.wire, DECK_NAMES.wire, NOTE_NAMES.wire, HIT_NAMES.wire]).toEqual(['화이트 라인', '화이트 라인', '화이트 라인', '선 불꽃']);
    expect([SKIN_NAMES.astral, DECK_NAMES.astral, NOTE_NAMES.astral, HIT_NAMES.astral]).toEqual(['별밤', '별밤', '별밤', '별빛']);
    // the skins' parts lead each list, in the skins' order
    expect(PART_CHOICES.note.slice(0, 3).map(([id]) => id)).toEqual(['flat', 'prism', 'sky']);
    expect(PART_CHOICES.deck.slice(0, 3).map(([id]) => id)).toEqual(['standard', 'prism', 'sky']);
    expect(PART_CHOICES.hit.slice(0, 3).map(([id]) => id)).toEqual(['flash', 'prism', 'sky']);
  });
});
