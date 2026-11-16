import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AIDED_WORDS, isEndArtIndex, wordsBox } from './endArt';
import { LAMP_CLASS } from './lamps';

const MEDIA = new URL('../../public/end/', import.meta.url);
const index: unknown = JSON.parse(readFileSync(new URL('index.json', MEDIA), 'utf-8'));

describe('the pictures of a play\'s end', () => {
  it('are listed as the game reads them, and every file listed is there', () => {
    expect(isEndArtIndex(index)).toBe(true);
    if (!isEndArtIndex(index)) return;
    const files = [...Object.values(index.words), ...Object.values(index.seals), index.ring, index.sparks, index.cracks, index.lane].map((p) => p.file);
    expect(new Set(files).size).toBe(files.length);
    for (const file of files) expect(existsSync(new URL(file, MEDIA)), file).toBe(true);
  });

  it('give every lamp its words or its seal: the lamps that show words their lettering, the clears a seal', () => {
    if (!isEndArtIndex(index)) throw new Error('no index');
    expect(Object.keys(index.words).sort()).toEqual(['autoplay', 'failed', 'maxcombo', 'perfect', 'practice']);
    expect(Object.keys(index.seals).sort()).toEqual(['assist', 'clear', 'easy', 'exhard', 'hard']);
    for (const lamp of Object.values(LAMP_CLASS)) expect(lamp in index.words || lamp in index.seals, lamp).toBe(true);
    // a play without a lamp: the words of how it was played
    for (const words of Object.values(AIDED_WORDS)) expect(words in index.words, words).toBe(true);
  });

  it('light a lane from its bottom: a column of light far longer than it is wide', () => {
    if (!isEndArtIndex(index)) throw new Error('no index');
    expect(index.lane.size[1]).toBeGreaterThan(2 * index.lane.size[0]);
  });

  it('say where the letters stand in each picture of words, and lay each sheet\'s frames in one row', () => {
    if (!isEndArtIndex(index)) throw new Error('no index');
    for (const words of Object.values(index.words)) {
      const [top, bottom] = words.band;
      expect(top).toBeGreaterThan(0);
      expect(bottom).toBeLessThan(1);
      // the letters are most of the picture's height: its glow is the rest
      expect(bottom - top).toBeGreaterThan(0.4);
      expect(words.size[0]).toBeGreaterThan(2 * words.size[1]);
    }
    for (const sheet of [index.ring, index.sparks]) {
      expect(sheet.frames).toBeGreaterThanOrEqual(6);
      expect(sheet.size[0]).toBe(sheet.frames * sheet.size[1]);
    }
    for (const seal of Object.values(index.seals)) expect(seal.size[0]).toBe(seal.size[1]);
  });

  it('are not read from an index of another shape', () => {
    if (!isEndArtIndex(index)) throw new Error('no index');
    expect(isEndArtIndex(null)).toBe(false);
    expect(isEndArtIndex({})).toBe(false);
    expect(isEndArtIndex({ ...index, ring: { file: 'ring.webp', size: [1, 1] } })).toBe(false);
    expect(isEndArtIndex({ ...index, ring: { ...index.ring, frames: 0 } })).toBe(false);
    expect(isEndArtIndex({ ...index, words: { perfect: { file: 'x.webp', size: [1, 1] } } })).toBe(false);
    expect(isEndArtIndex({ ...index, cracks: undefined })).toBe(false);
    expect(isEndArtIndex({ ...index, lane: undefined })).toBe(false);
  });
});

describe('the size a lamp\'s words are drawn at', () => {
  it('has the letters as tall as asked, whatever glow the picture has round them', () => {
    // letters over the middle 60 % of a picture 4 times as wide as tall
    const box = wordsBox([1200, 300], [0.2, 0.8], 1);
    expect(box.height).toBeCloseTo(1 / 0.6, 6);
    expect(box.width).toBeCloseTo(4 / 0.6, 6);
    expect(box.lift).toBeCloseTo(0, 6);
    // twice as tall for twice the cap
    expect(wordsBox([1200, 300], [0.2, 0.8], 2).height).toBeCloseTo(2 / 0.6, 6);
  });

  it('moves the picture up where the letters stand above its middle... down where below, so their middle is the lamp\'s', () => {
    // letters in the upper part (something falls from them below): their middle is above the picture's, so the picture goes down
    const high = wordsBox([900, 300], [0.15, 0.75], 1);
    expect(high.lift).toBeLessThan(0);
    expect(high.lift).toBeCloseTo((0.45 - 0.5) * high.height, 6);
    const low = wordsBox([900, 300], [0.3, 0.9], 1);
    expect(low.lift).toBeGreaterThan(0);
  });

  it('never divides by nothing', () => {
    const box = wordsBox([900, 300], [0.5, 0.5], 1);
    expect(Number.isFinite(box.height)).toBe(true);
    expect(Number.isFinite(box.width)).toBe(true);
  });
});
