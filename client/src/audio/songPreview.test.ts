import { describe, expect, it } from 'vitest';
import { PREVIEW_LENGTH_MS, previewEnvelope, previewLength } from './songPreview';

describe('song preview', () => {
  it('fades the highlight in, holds it and fades it out before it loops', () => {
    expect(previewEnvelope(0)).toBe(0);
    expect(previewEnvelope(500)).toBeCloseTo(0.5);
    expect(previewEnvelope(1000)).toBe(1);
    expect(previewEnvelope(PREVIEW_LENGTH_MS / 2)).toBe(1);
    expect(previewEnvelope(PREVIEW_LENGTH_MS - 750)).toBeCloseTo(0.5);
    expect(previewEnvelope(PREVIEW_LENGTH_MS)).toBe(0);
    // a highlight shorter than both fades never reaches full volume
    expect(previewEnvelope(1000, 2000)).toBeCloseTo(2 / 3);
  });

  it('plays a minute of the highlight, or fades out before the song ends when that comes first', () => {
    expect(PREVIEW_LENGTH_MS).toBe(60000);
    expect(previewLength(240000, 50000)).toBe(PREVIEW_LENGTH_MS);
    expect(previewLength(180000, 150000)).toBe(30000);
    expect(previewEnvelope(30000 - 750, previewLength(180000, 150000))).toBeCloseTo(0.5);
    // length not known (yet): the full minute
    expect(previewLength(Number.NaN, 50000)).toBe(PREVIEW_LENGTH_MS);
    expect(previewLength(Number.POSITIVE_INFINITY, 50000)).toBe(PREVIEW_LENGTH_MS);
  });
});
