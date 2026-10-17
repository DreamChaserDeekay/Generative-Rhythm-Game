import { describe, expect, it } from 'vitest';
import { timeStretch } from './timeStretch';

const SR = 44100;

function sine(freq: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.round(SR * seconds));
  for (let i = 0; i < out.length; i++) out[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / SR);
  return out;
}

/** Frequency from upward zero crossings over the middle of the signal. */
function frequency(x: Float32Array): number {
  const from = Math.floor(x.length * 0.2);
  const to = Math.floor(x.length * 0.8);
  let crossings = 0;
  for (let i = from + 1; i < to; i++) if (x[i - 1] < 0 && x[i] >= 0) crossings++;
  return crossings / ((to - from) / SR);
}

function rms(x: Float32Array, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / (to - from));
}

describe('timeStretch (WSOLA)', () => {
  it('changes the length by 1/rate and keeps the pitch', () => {
    const input = sine(440, 2);
    for (const rate of [0.5, 0.75, 1.25, 1.5]) {
      const [out] = timeStretch([input], rate);
      expect(out.length).toBe(Math.floor(input.length / rate));
      expect(Math.abs(frequency(out) - 440)).toBeLessThan(4);
      // no dropouts or gain jumps in the body
      const mid = Math.floor(out.length / 2);
      expect(rms(out, mid - 4000, mid + 4000)).toBeGreaterThan(0.3);
      expect(rms(out, mid - 4000, mid + 4000)).toBeLessThan(0.4);
    }
  });

  it('applies one alignment to every channel and copies at rate 1', () => {
    const left = sine(330, 1);
    const right = sine(330, 1).map((v) => -v);
    const [l, r] = timeStretch([left, right], 0.8);
    for (let i = 0; i < l.length; i += 997) expect(r[i]).toBeCloseTo(-l[i], 5);
    const [same] = timeStretch([left], 1);
    expect(same).toEqual(left);
    expect(same).not.toBe(left);
  });
});
