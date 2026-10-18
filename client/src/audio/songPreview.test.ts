import { describe, expect, it } from 'vitest';
import { PREVIEW_LENGTH_MS, previewEnvelope } from './songPreview';

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
});
