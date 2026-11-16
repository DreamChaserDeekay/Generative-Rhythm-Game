import { describe, expect, it } from 'vitest';
import { uiScaleFor } from './uiScale';

describe('uiScaleFor', () => {
  it('is 1 at the size the menus are drawn for', () => {
    expect(uiScaleFor(1280, 720)).toBe(1);
  });

  it('grows with a larger window, by the side that has less room', () => {
    expect(uiScaleFor(1920, 1080)).toBe(1.5);
    expect(uiScaleFor(3840, 2160)).toBe(3);
    // an ultrawide window: the height decides
    expect(uiScaleFor(2560, 1080)).toBe(1.5);
    // a tall window: the width decides
    expect(uiScaleFor(1280, 1080)).toBe(1);
    expect(uiScaleFor(1600, 1200)).toBe(1.25);
  });

  it('never shrinks the type on a smaller window', () => {
    expect(uiScaleFor(1024, 768)).toBe(1);
    expect(uiScaleFor(960, 540)).toBe(1);
    expect(uiScaleFor(1920, 600)).toBe(1);
  });

  it('is 1 for a window that has no size yet', () => {
    expect(uiScaleFor(0, 0)).toBe(1);
    expect(uiScaleFor(Number.NaN, 720)).toBe(1);
  });
});
