import { describe, expect, it } from 'vitest';
import { BGA_OFFSET_MAX_MS, clampBgaOffset, coverPlacement, describeBgaOffset } from './PlayBackground';

describe('background video shift', () => {
  it('says which way the video moves and how far', () => {
    expect(describeBgaOffset(13000)).toBe('영상을 13초 늦게 시작 (그동안 검은 화면)');
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

describe('the jacket as the background', () => {
  it('covers the field past each edge, in the middle, whatever its shape', () => {
    // square on 16:9: as wide as the field and its margins, cut top and bottom
    expect(coverPlacement(500, 500, 160, 90, 12)).toEqual({ x: -12, y: -47, w: 184, h: 184 });
    // wide on 16:9: as high as the field and its margins
    const wide = coverPlacement(1000, 200, 160, 90, 12);
    expect(wide.h).toBeCloseTo(114, 9);
    expect(wide.y).toBeCloseTo(-12, 9);
    expect(wide.x + wide.w / 2).toBeCloseTo(80, 9);
  });
});
