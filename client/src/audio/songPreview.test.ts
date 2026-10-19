import { describe, expect, it } from 'vitest';
import { MenuMusic, MUFFLED_CUTOFF_HZ, MUFFLED_GAIN, PREVIEW_LENGTH_MS, previewEnvelope, previewLength, type PreviewPlayer } from './songPreview';

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

  it('plays on behind the settings, quieter and muffled, and keeps going when the song select is back', () => {
    const made: { url: string; log: string[] }[] = [];
    const music = new MenuMusic((url): PreviewPlayer => {
      const log: string[] = [];
      made.push({ url, log });
      return { stop: () => log.push('stop'), setVolume: (v) => log.push(`volume ${v}`), setMuffled: (on) => log.push(on ? 'muffled' : 'open') };
    });
    music.play('a', '/a', 0, 0.5);
    music.muffle(true); // into the settings
    music.setVolume(0.3); // the music volume edited there
    music.muffle(false); // back to the song select
    music.play('a', '/a', 0, 0.5); // the same song: the preview goes on
    expect(made).toHaveLength(1);
    expect(made[0].log).toEqual(['muffled', 'volume 0.3', 'open']);
    music.play('b', '/b', 0, 0.5); // another song starts over
    expect(made.map((m) => m.url)).toEqual(['/a', '/b']);
    expect(made[0].log.at(-1)).toBe('stop');
    music.muffle(true);
    music.stop(); // a play, the editor or the calibration
    expect(music.playing('b')).toBe(false);
    music.play('c', '/c', 0, 0.5); // started while muffled (the settings still open)
    expect(made[1].log).toEqual(['muffled', 'stop']);
    expect(made[2].log).toEqual(['muffled']);
    // a little quieter, and only the low end left
    expect(MUFFLED_GAIN).toBeGreaterThanOrEqual(0.5);
    expect(MUFFLED_GAIN).toBeLessThan(1);
    expect(MUFFLED_CUTOFF_HZ).toBeLessThan(1500);
  });
});
