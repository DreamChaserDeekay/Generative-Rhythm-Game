import { describe, expect, it } from 'vitest';
import { sectionRowsValid } from './SectionEditor';
import { groupToken, sectionLabel } from './sections';

describe('song sections', () => {
  it('gives each repetition group a colour token, cycling after six', () => {
    expect(groupToken('A')).toBe('--section-1');
    expect(groupToken('F')).toBe('--section-6');
    expect(groupToken('G')).toBe('--section-1');
    expect(groupToken(undefined)).toBe('--section-1');
  });

  it('shows section labels in Korean and leaves unknown ones as they are', () => {
    expect(sectionLabel('pre-chorus')).toBe('프리코러스');
    expect(sectionLabel('chorus')).toBe('후렴');
    expect(sectionLabel('solo')).toBe('solo');
  });

  it('accepts edited sections only when their bars rise', () => {
    expect(sectionRowsValid([{ bar: 1 }, { bar: 5 }, { bar: 13 }])).toBe(true);
    expect(sectionRowsValid([{ bar: 1 }, { bar: 9 }, { bar: 9 }])).toBe(false);
    expect(sectionRowsValid([{ bar: 1 }, { bar: 1 }])).toBe(false);
    expect(sectionRowsValid([{ bar: 1 }, { bar: 4.5 }])).toBe(false);
    expect(sectionRowsValid([])).toBe(false);
  });
});
