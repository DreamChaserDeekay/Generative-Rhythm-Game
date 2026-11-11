import { describe, expect, it } from 'vitest';
import {
  FADE_IN_MS,
  MenuMusic,
  MUFFLED_CUTOFF_HZ,
  MUFFLED_GAIN,
  PREVIEW_LENGTH_MS,
  previewEnvelope,
  previewLength,
  STOP_FADE_MS,
  stopFadeMs,
  type PreviewPlayer,
} from './songPreview';

describe('song preview', () => {
  it('fades the highlight in, holds it and fades it out before it loops', () => {
    expect(previewEnvelope(0)).toBe(0);
    // a second and a half in, three and a half out
    expect(previewEnvelope(FADE_IN_MS / 2)).toBeCloseTo(0.5);
    expect(previewEnvelope(FADE_IN_MS)).toBe(1);
    expect(previewEnvelope(PREVIEW_LENGTH_MS / 2)).toBe(1);
    expect(previewEnvelope(PREVIEW_LENGTH_MS - 1750)).toBeCloseTo(0.5);
    expect(previewEnvelope(PREVIEW_LENGTH_MS)).toBe(0);
    // a highlight shorter than both fades never reaches full volume
    expect(previewEnvelope(1500, 3000)).toBeCloseTo(1500 / 3500);
  });

  it('plays a minute of the highlight, or fades out before the song ends when that comes first', () => {
    expect(PREVIEW_LENGTH_MS).toBe(60000);
    expect(previewLength(240000, 50000)).toBe(PREVIEW_LENGTH_MS);
    expect(previewLength(180000, 150000)).toBe(30000);
    expect(previewEnvelope(30000 - 1750, previewLength(180000, 150000))).toBeCloseTo(0.5);
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

  it('starts the next preview only once the last one has faded out, however fast the songs go by', () => {
    let now = 0;
    const made: { url: string; delay: number }[] = [];
    // a stand-in fading out over STOP_FADE_MS from when it sounds (silent before its delay is over)
    const music = new MenuMusic(
      (url, _start, _volume, delay): PreviewPlayer => {
        const at = now;
        made.push({ url, delay });
        return { stop: () => (now >= at + delay ? STOP_FADE_MS : 0), setVolume: () => undefined, setMuffled: () => undefined };
      },
      () => now,
    );
    music.play('a', '/a', 0, 0.5);
    expect(made[0].delay).toBe(0);
    now = 10_000;
    music.play('b', '/b', 0, 0.5); // 'a' fades out first
    expect(made[1].delay).toBe(STOP_FADE_MS);
    now += 100;
    music.play('c', '/c', 0, 0.5); // 'b' never sounded: 'c' still waits for 'a' only
    expect(made[2].delay).toBe(STOP_FADE_MS - 100);
    now += 5_000;
    music.play('d', '/d', 0, 0.5); // 'c' was playing: it fades out before 'd'
    expect(made[3].delay).toBe(STOP_FADE_MS);
  });

  it('fades out faster from a quieter point', () => {
    expect(stopFadeMs(0.6, 0.6)).toBe(STOP_FADE_MS);
    expect(stopFadeMs(0.3, 0.6)).toBeCloseTo(STOP_FADE_MS / 2);
    expect(stopFadeMs(0, 0.6)).toBe(0);
    expect(STOP_FADE_MS).toBeLessThanOrEqual(1000);
  });
});
