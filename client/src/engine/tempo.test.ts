import { describe, expect, it } from 'vitest';
import { TempoMap } from './tempo';

describe('TempoMap', () => {
  it('converts beats and ms for a constant tempo', () => {
    const tempo = new TempoMap({ offsetMs: 132.5, tempoMap: [{ beat: 0, bpm: 128 }], meter: [] });
    expect(tempo.beatToMs(0)).toBeCloseTo(132.5, 9);
    expect(tempo.beatToMs(4)).toBeCloseTo(2007.5, 9);
    expect(tempo.beatToMs(4.5)).toBeCloseTo(2241.875, 9);
    expect(tempo.msToBeat(2945)).toBeCloseTo(6, 9);
    expect(tempo.beatToMs(-1)).toBeCloseTo(132.5 - 468.75, 9);
  });

  it('handles tempo changes', () => {
    const tempo = new TempoMap({
      offsetMs: 0,
      tempoMap: [
        { beat: 0, bpm: 120 },
        { beat: 8, bpm: 240 },
      ],
      meter: [],
    });
    expect(tempo.beatToMs(8)).toBeCloseTo(4000, 9);
    expect(tempo.beatToMs(10)).toBeCloseTo(4500, 9);
    expect(tempo.msToBeat(4500)).toBeCloseTo(10, 9);
    expect(tempo.bpmAtBeat(9)).toBe(240);
  });

  it('lists bar lines with meter changes', () => {
    const tempo = new TempoMap({
      offsetMs: 1000,
      tempoMap: [{ beat: 0, bpm: 120 }],
      meter: [
        { measure: 0, beatsPerMeasure: 4 },
        { measure: 2, beatsPerMeasure: 3 },
      ],
    });
    expect(tempo.barLines(6000)).toEqual([1000, 3000, 5000]);
    expect(tempo.barLines(7000)).toEqual([1000, 3000, 5000, 6500]);
  });
});
