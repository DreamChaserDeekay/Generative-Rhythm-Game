import { describe, expect, it } from 'vitest';
import { BGA_OFFSET_MAX_MS, clampBgaOffset, describeBgaOffset } from './PlayBackground';

describe('background video shift', () => {
  it('says which way the video moves and how far', () => {
    expect(describeBgaOffset(13000)).toBe('영상을 13초 늦게 시작 (그동안 커버가 보입니다)');
    expect(describeBgaOffset(-1500)).toBe('영상 앞부분 1.5초 건너뛰기');
    expect(describeBgaOffset(-60000)).toBe('영상 앞부분 60초 건너뛰기');
    expect(describeBgaOffset(10)).toContain('0.01초');
    expect(describeBgaOffset(0)).toBe('곡과 영상을 같이 시작');
  });

  it('takes typed numbers within what the server allows', () => {
    expect(clampBgaOffset(13000)).toBe(13000);
    expect(clampBgaOffset(-12.6)).toBe(-13);
    expect(clampBgaOffset(999999)).toBe(BGA_OFFSET_MAX_MS);
    expect(clampBgaOffset(-999999)).toBe(-BGA_OFFSET_MAX_MS);
    expect(clampBgaOffset(Number.NaN)).toBeNull();
  });
});
