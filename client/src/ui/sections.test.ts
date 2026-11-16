import { describe, expect, it } from 'vitest';
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
});
