import { describe, expect, it } from 'vitest';
import { parsePackList } from '../render/customPacks';
import { DEFAULT_PARTS } from '../render/skins';
import { promptOf, PROMPT_KINDS } from './assetPrompts';
import { packChoices, partValue, withPartValue } from './CustomAssets';

const PACKS = parsePackList({ packs: [{ id: 'a', name: 'A', parts: { panel: { status: 'ok', textures: {} } } }, { id: 'b', parts: { panel: { status: 'error', message: 'x' } } }] });

describe('the packs in the settings rows', () => {
  it('lists the packs whose part can be used after the game’s own, and the one picked even if it no longer can be', () => {
    const own: [string, string][] = [['standard', '기본']];
    expect(packChoices(own, 'deck', PACKS, undefined)).toEqual([...own, ['pack:a', '내 에셋: A']]);
    expect(packChoices(own, 'deck', PACKS, 'b').at(-1)).toEqual(['pack:b', '내 에셋: b (읽지 못함)']);
    expect(packChoices(own, 'note', PACKS, undefined)).toEqual(own);
  });

  it('picks a pack for a part and lets it go again, keeping the part picked before', () => {
    const picked = withPartValue({ ...DEFAULT_PARTS, deck: 'sky' }, 'deck', 'pack:a');
    expect(picked).toEqual({ ...DEFAULT_PARTS, deck: 'sky', custom: { deck: 'a' } });
    expect(partValue(picked, 'deck')).toBe('pack:a');
    const back = withPartValue(picked, 'deck', 'prism');
    expect(back).toEqual({ ...DEFAULT_PARTS, deck: 'prism' });
    expect(partValue(back, 'deck')).toBe('prism');
  });

  it('has a prompt for every picture in both languages, each with the place for the look and its background', () => {
    for (const kind of PROMPT_KINDS) {
      expect(promptOf(kind, 'en')).toMatch(/YOUR STYLE/);
      expect(promptOf(kind, 'ko')).toMatch(/원하는 분위기/);
      expect(promptOf(kind, 'en')).toMatch(/No text/);
    }
    expect(promptOf('note', 'en')).toMatch(/#FF00FF/);
    expect(promptOf('hit', 'en')).toMatch(/#000000/);
  });
});
