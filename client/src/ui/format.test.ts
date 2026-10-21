import { describe, expect, it } from 'vitest';
import { clockText, coverText, errorKind, errorText, speedText } from './format';

describe('the play numbers, written the same everywhere', () => {
  it('writes SPEED with two decimals and covers with one', () => {
    expect([speedText(4), speedText(4.1), speedText(4.37), speedText(10)]).toEqual(['4.00', '4.10', '4.37', '10.00']);
    expect([coverText(0.25), coverText(0.075), coverText(0), coverText(0.85)]).toEqual(['25.0%', '7.5%', '0.0%', '85.0%']);
    // in-play steps of 2.5 % add up without float noise
    expect(coverText(0.025 * 3)).toBe('7.5%');
  });

  it('writes the time left in minutes and seconds, the last second as 0:01', () => {
    expect(clockText(42_000)).toBe('0:42');
    expect(clockText(125_000)).toBe('2:05');
    expect(clockText(400)).toBe('0:01');
    expect(clockText(0)).toBe('0:00');
    expect(clockText(-300)).toBe('0:00');
  });

  it('writes a timing error in whole ms, exact under half a ms (unsigned, neither FAST nor SLOW colour)', () => {
    expect(errorText(12.4)).toBe('+12ms');
    expect(errorText(-8.6)).toBe('-9ms');
    expect(errorText(0)).toBe('0ms');
    expect(errorText(-0.3)).toBe('0ms');
    expect(errorText(0.49)).toBe('0ms');
    expect([errorText(0.5), errorText(-0.5)]).toEqual(['+1ms', '-1ms']);
    expect([errorKind(-0.3), errorKind(0), errorKind(0.7), errorKind(-41)]).toEqual(['exact', 'exact', 'slow', 'fast']);
  });
});
