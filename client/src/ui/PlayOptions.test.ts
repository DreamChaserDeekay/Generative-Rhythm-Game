import { describe, expect, it } from 'vitest';
import { DEFAULT_GENERATION, type GenerationPrefs } from '../settings/settings';
import { generationChanges, generationSummary } from './PlayOptions';

const prefs = (patch: Partial<GenerationPrefs>): GenerationPrefs => ({ ...DEFAULT_GENERATION, ...patch });

describe('generationChanges', () => {
  it('names nothing on the defaults, nor for an engine picked that is the default one', () => {
    expect(generationChanges(DEFAULT_GENERATION, '4K')).toEqual([]);
    expect(generationChanges(prefs({ patternEngine: 'sectioned', engineSet: true }), '7K+1S')).toEqual([]);
  });

  it('names every option that reaches the generator, in the tab order', () => {
    const all = prefs({
      style: 'chord',
      rhythmSource: 'drum',
      density: 1.2,
      longNoteRatio: 0.3,
      maxChord: 3,
      specialRate: 0.1,
      instrumentMapping: 0.6,
      repeatConsistency: 0,
      patternEngine: 'classic',
    });
    expect(generationChanges(all, '7K+1S')).toEqual(['동치', '리듬 드럼', '밀도', '롱노트 비율', '최대 동시 노트', '악기별 레인', '이전 배치', '반복 구간', '스크래치 비율']);
    expect(generationChanges(all, '6K+FX')).toContain('사이드 비율');
  });

  it('leaves out a scratch or side rate on a key mode without those lanes (its chart is the same)', () => {
    expect(generationChanges(prefs({ specialRate: 0.1 }), '4K')).toEqual([]);
    expect(generationChanges(prefs({ specialRate: 0.1 }), '7K+1S')).toEqual(['스크래치 비율']);
  });
});

describe('generationSummary', () => {
  it('is the tab name with up to two changes and how many more', () => {
    expect(generationSummary(DEFAULT_GENERATION, '4K')).toBe('생성 옵션');
    expect(generationSummary(prefs({ patternEngine: 'designer', engineSet: true }), '4K')).toBe('생성 옵션 · 악구 배치');
    expect(generationSummary(prefs({ style: 'longnote', density: 0.8, maxChord: 2, patternEngine: 'classic' }), '4K')).toBe('생성 옵션 · 롱노트 · 밀도 외 2개');
  });
});
