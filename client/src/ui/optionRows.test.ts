import { describe, expect, it } from 'vitest';
import { GEAR_STYLES } from '../render/deckArt';
import { HIT_STYLES, NOTE_STYLES } from '../render/tintArt';
import * as rows from './optionRows';
import { DECK_NAMES, HIT_NAMES, NOTE_NAMES, optionalStep, PART_CHOICES } from './optionRows';

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

describe('the parts’ rows (설정 → 기어, 노트)', () => {
  it('offers the notes by name, 기본 first and then each skin’s: the ten with no gear of their own are not among them', () => {
    expect(PART_CHOICES.note).toEqual([
      ['flat', '기본'],
      ['prism', '크리스털'],
      ['sky', '하늘'],
      ['fire', '파이어스타터'],
      ['gpt', 'GPT'],
      ['gemini', 'Gemini'],
      ['grok', 'Grok'],
      ['claude', 'Claude'],
      ['aqua', '아쿠아'],
      ['steel', '스틸'],
      ['noir', '레드라인'],
      ['wire', '화이트 라인'],
      ['astral', '별밤'],
    ]);
    expect(Object.keys(NOTE_NAMES).sort()).toEqual([...NOTE_STYLES].sort());
    for (const gone of ['chrome', 'hairline', 'glass', 'enamel', 'pearl', 'carbon', 'chamfer', 'round', 'star4', 'star5']) expect(Object.keys(NOTE_NAMES), gone).not.toContain(gone);
    for (const gone of ['크롬 베벨', '헤어라인', '유리', '에나멜', '펄', '카본', '메카 챔퍼', '원형', '별 (4각)', '별 (5각)']) expect(Object.values(NOTE_NAMES), gone).not.toContain(gone);
  });

  it('has no row that picks a gear, its notes and its hit together: each part is picked in its own row', () => {
    for (const gone of ['SKIN_NAMES', 'CUSTOM_SKIN', 'CUSTOM_SKIN_NAME', 'skinChoices']) expect(Object.keys(rows), gone).not.toContain(gone);
    expect(Object.keys(PART_CHOICES).sort()).toEqual(['deck', 'hit', 'note', 'side']);
    expect(PART_CHOICES.deck.map(([id]) => id)).toEqual(GEAR_STYLES);
    expect(PART_CHOICES.hit.map(([id]) => id)).toEqual(HIT_STYLES);
    expect(PART_CHOICES.side).toEqual([
      ['bar', '기본'],
      ['dots', '도트 매트릭스'],
    ]);
    // the hits of the sets whose notes are gone are still offered, under their own names
    expect([HIT_NAMES.mecha, HIT_NAMES.club, HIT_NAMES.crystal, HIT_NAMES.neon, HIT_NAMES.piano]).toEqual(['메카 섬광', '클럽 링', '크리스털 파편', '네온 아크', '피아노 음표']);
  });

  it('names a gear and its notes alike, and lists each part’s default first', () => {
    expect([DECK_NAMES.standard, NOTE_NAMES.flat]).toEqual(['기본', '기본']);
    expect([DECK_NAMES.prism, NOTE_NAMES.prism, HIT_NAMES.prism]).toEqual(['크리스털', '크리스털', '크리스털 분광']);
    expect([DECK_NAMES.sky, NOTE_NAMES.sky, HIT_NAMES.sky]).toEqual(['하늘', '하늘', '구름 깃털']);
    expect([DECK_NAMES.fire, NOTE_NAMES.fire, HIT_NAMES.fire]).toEqual(['파이어스타터', '파이어스타터', '불꽃놀이']);
    for (const [id, name] of [['gpt', 'GPT'], ['gemini', 'Gemini'], ['grok', 'Grok'], ['claude', 'Claude']] as const) expect([DECK_NAMES[id], NOTE_NAMES[id]]).toEqual([name, name]);
    expect([HIT_NAMES.gpt, HIT_NAMES.gemini, HIT_NAMES.grok, HIT_NAMES.claude]).toEqual(['물방울 왕관', '반짝임', '엑스 섬광', '붓 빛살']);
    expect([DECK_NAMES.aqua, NOTE_NAMES.aqua, HIT_NAMES.aqua]).toEqual(['아쿠아', '아쿠아', '록온']);
    expect([DECK_NAMES.steel, NOTE_NAMES.steel, HIT_NAMES.steel]).toEqual(['스틸', '스틸', '십자 섬광']);
    expect([DECK_NAMES.noir, NOTE_NAMES.noir, HIT_NAMES.noir]).toEqual(['레드라인', '레드라인', '글리치']);
    expect([DECK_NAMES.wire, NOTE_NAMES.wire, HIT_NAMES.wire]).toEqual(['화이트 라인', '화이트 라인', '선 불꽃']);
    expect([DECK_NAMES.astral, NOTE_NAMES.astral, HIT_NAMES.astral]).toEqual(['별밤', '별밤', '별빛']);
    // every note is named as the gear it was made for (the piano, the one gear with no notes of its own, comes last)
    expect(PART_CHOICES.note.map(([, name]) => name)).toEqual(PART_CHOICES.deck.slice(0, -1).map(([, name]) => name));
    expect(PART_CHOICES.deck[PART_CHOICES.deck.length - 1]).toEqual(['piano', '피아노']);
    // the default parts lead each list, then the skins' in the same order
    expect(PART_CHOICES.note.slice(0, 3).map(([id]) => id)).toEqual(['flat', 'prism', 'sky']);
    expect(PART_CHOICES.deck.slice(0, 3).map(([id]) => id)).toEqual(['standard', 'prism', 'sky']);
    expect(PART_CHOICES.hit.slice(0, 3).map(([id]) => id)).toEqual(['flash', 'prism', 'sky']);
  });
});
