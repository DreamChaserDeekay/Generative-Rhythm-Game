import { describe, expect, it } from 'vitest';
import { anchorTransform } from './Hud';

describe('HUD on the track', () => {
  it('centres the combo and judgement on their anchors and turns them with a tilted track', () => {
    expect(anchorTransform(0)).toBe('translate(-50%, -50%)');
    expect(anchorTransform(Math.PI / 18)).toBe('translate(-50%, -50%) rotate(10deg)');
    expect(anchorTransform(-0.1)).toBe('translate(-50%, -50%) rotate(-5.7deg)');
    // a roll too small to see does not touch the style
    expect(anchorTransform(0.0004)).toBe('translate(-50%, -50%)');
  });
});
