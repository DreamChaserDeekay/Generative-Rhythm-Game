import { describe, expect, it } from 'vitest';
import type { StemName } from '../engine/types';
import { keysoundStems, planStemKeysounds, stemKeysoundLabel } from './stemKeysounds';

const OPTIONS = { stemShare: 0.1, maxSliceMs: 4000, chordMs: 30, fadeMs: 3 };

function notes(spec: [number, StemName | undefined][]) {
  return spec.map(([t, src]) => ({ t, src }));
}

describe('stem keysounds', () => {
  it('keysounds the stems enough notes follow', () => {
    const list = notes([
      ...Array.from({ length: 10 }, (_, i): [number, StemName] => [i * 100, 'vocals']),
      ...Array.from({ length: 6 }, (_, i): [number, StemName] => [i * 100 + 50, 'drums']),
      [2000, 'bass'],
      [2100, undefined],
      [2200, undefined],
      [2300, undefined],
    ]);
    expect(keysoundStems(list, OPTIONS)).toEqual(['drums', 'vocals']);
  });

  it('slices each stem from note to note, shares chords and caps long gaps', () => {
    const list = notes([
      [1000, 'vocals'],
      [1500, 'vocals'],
      [1510, 'vocals'],
      [2500, 'vocals'],
      [9000, 'vocals'],
      [3000, 'drums'],
      [3500, undefined],
      [12000, 'vocals'],
    ]);
    const plan = planStemKeysounds(list, 10000, ['vocals', 'drums'], OPTIONS)!;
    expect(plan.stems).toEqual(['drums', 'vocals']);
    const slice = (i: number) => {
      const s = plan.noteSlice[i];
      return s === null ? null : [plan.slices[s].stem, plan.slices[s].startMs, plan.slices[s].endMs];
    };
    expect(slice(0)).toEqual(['vocals', 1000, 1500]);
    expect(slice(1)).toEqual(['vocals', 1500, 2500]);
    expect(plan.noteSlice[2]).toBe(plan.noteSlice[1]);
    expect(slice(3)).toEqual(['vocals', 2500, 6500]);
    expect(slice(4)).toEqual(['vocals', 9000, 10000]);
    expect(slice(5)).toEqual(['drums', 3000, 7000]);
    expect(slice(6)).toBeNull();
    expect(slice(7)).toBeNull(); // after the end of the song
    expect(plan.ranges.vocals).toEqual([
      [1000, 6500],
      [9000, 10000],
    ]);
    expect(plan.ranges.drums).toEqual([[3000, 7000]]);
    expect(stemKeysoundLabel(plan)).toBe('키음 드럼·보컬');
  });

  it('leaves stems that were not loaded, and charts without sources, in the background', () => {
    const list = notes([
      [1000, 'vocals'],
      [2000, 'drums'],
    ]);
    const plan = planStemKeysounds(list, 5000, ['drums'], OPTIONS)!;
    expect(plan.stems).toEqual(['drums']);
    expect(plan.noteSlice).toEqual([null, 0]);
    expect(planStemKeysounds(notes([[1000, undefined]]), 5000, ['drums'], OPTIONS)).toBeNull();
  });
});
