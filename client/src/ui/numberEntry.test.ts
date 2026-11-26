import { describe, expect, it } from 'vitest';
import { coverText, judgeLineText, speedText } from './format';
import { pct } from './optionRows';
import { entryScale, entryText, gaugeValue, numberIn, startsEntry, typedValue } from './numberEntry';

const signedMs = (v: number) => `${v > 0 ? '+' : ''}${v}ms`;

describe('a number typed as the row shows it', () => {
  it('reads the number out of a shown value', () => {
    expect(numberIn('90%')).toBe(90);
    expect(numberIn('−20%')).toBe(-20);
    expect(numberIn('+12ms')).toBe(12);
    expect(numberIn('×1.50')).toBe(1.5);
    expect(numberIn('2칸')).toBe(2);
    expect(numberIn(' -7 ')).toBe(-7);
    expect(numberIn('1,250ms')).toBe(1250);
    expect(numberIn('끔')).toBeNull();
    expect(numberIn('')).toBeNull();
  });

  it('a percentage is typed in percents', () => {
    const s = entryScale(pct, 0, 1, 0.05)!;
    expect(s).toMatchObject({ a: 100, b: 0, decimals: 0 });
    expect(typedValue(93, s, 0, 1)).toBe(0.93);
    expect(typedValue(250, s, 0, 1)).toBe(1);
    expect(typedValue(-5, s, 0, 1)).toBe(0);
    expect(entryText(0.9, s)).toBe('90');
  });

  it('a percentage that shows 끔 at zero is still typed in percents (0 turns it off)', () => {
    const format = (v: number) => (v === 0 ? '끔' : pct(v));
    const s = entryScale(format, 0, 1, 0.05)!;
    expect(s.a).toBe(100);
    expect(typedValue(0, s, 0, 1)).toBe(0);
    expect(entryText(0, s)).toBe('0');
  });

  it('a share to a tenth of a percent, a signed percent, a speed, a rate, milliseconds', () => {
    const cover = entryScale(coverText, 0, 0.6, 0.025)!;
    expect(cover).toMatchObject({ a: 100, decimals: 1 });
    expect(typedValue(12.34, cover, 0, 0.6)).toBe(0.123);
    const line = entryScale(judgeLineText, -0.3, 0.3, 0.01)!;
    expect(typedValue(-15, line, -0.3, 0.3)).toBe(-0.15);
    expect(entryText(-0.2, line)).toBe('-20');
    const speed = entryScale(speedText, 1, 10, 0.1)!;
    expect(speed).toMatchObject({ a: 1, decimals: 2 });
    expect(typedValue(3.257, speed, 1, 10)).toBe(3.26);
    const rate = entryScale((v) => `×${v.toFixed(2)}`, 0.5, 1.5, 0.05)!;
    expect(typedValue(1.13, rate, 0.5, 1.5)).toBe(1.13);
    const ms = entryScale(signedMs, -300, 300, 1)!;
    expect(ms).toMatchObject({ a: 1, b: 0, decimals: 0 });
    expect(typedValue(-12.6, ms, -300, 300)).toBe(-13);
    expect(entryText(12, ms)).toBe('12');
  });

  it('a format that shows no number takes none', () => {
    expect(entryScale(() => '자동', 0, 1, 0.1)).toBeNull();
    expect(entryScale(() => '5', 0, 1, 0.1)).toBeNull();
  });
});

describe('the gauge under the pointer', () => {
  it('puts the value on a step of its range, the ends held', () => {
    expect(gaugeValue(0, 0, 1, 0.05)).toBe(0);
    expect(gaugeValue(1, 0, 1, 0.05)).toBe(1);
    expect(gaugeValue(0.33, 0, 1, 0.05)).toBe(0.35);
    expect(gaugeValue(-0.2, 1, 10, 0.1)).toBe(1);
    expect(gaugeValue(1.4, 1, 10, 0.1)).toBe(10);
    expect(gaugeValue(0.5, -300, 300, 1)).toBe(0);
  });
});

it('a digit, a point or a minus starts typing', () => {
  for (const k of ['0', '7', '.', '-']) expect(startsEntry(k)).toBe(true);
  for (const k of ['a', '+', 'Enter', 'ArrowLeft', ' ']) expect(startsEntry(k)).toBe(false);
});
