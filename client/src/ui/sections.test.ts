import { describe, expect, it } from 'vitest';
import { TempoMap } from '../engine/tempo';
import { barAt, sectionRowsValid, withBoundary, type Row } from './SectionEditor';
import { groupToken, sectionLabel } from './sections';

describe('song sections', () => {
  it('gives each repetition group a colour token, cycling after six', () => {
    expect(groupToken('A')).toBe('--section-1');
    expect(groupToken('F')).toBe('--section-6');
    expect(groupToken('G')).toBe('--section-1');
    expect(groupToken(undefined)).toBe('--section-1');
  });

  it('shows section labels in Korean and leaves unknown ones as they are', () => {
    expect(sectionLabel('pre-chorus')).toBe('프리코러스');
    expect(sectionLabel('chorus')).toBe('후렴');
    expect(sectionLabel('solo')).toBe('solo');
  });

  it('accepts edited sections only when their bars rise', () => {
    expect(sectionRowsValid([{ bar: 1 }, { bar: 5 }, { bar: 13 }])).toBe(true);
    expect(sectionRowsValid([{ bar: 1 }, { bar: 9 }, { bar: 9 }])).toBe(false);
    expect(sectionRowsValid([{ bar: 1 }, { bar: 1 }])).toBe(false);
    expect(sectionRowsValid([{ bar: 1 }, { bar: 4.5 }])).toBe(false);
    expect(sectionRowsValid([])).toBe(false);
  });

  it('puts a boundary heard while playing on the nearest bar line', () => {
    // 120 BPM from 500 ms: a 4/4 bar is 2 s, bar 1 starts at 500 ms
    const tempo = new TempoMap({ offsetMs: 500, tempoMap: [{ beat: 0, bpm: 120 }], meter: [{ measure: 0, beatsPerMeasure: 4 }] });
    expect(barAt(tempo, 500, 4)).toBe(1);
    expect(barAt(tempo, 16_400, 4)).toBe(9); // a little before bar 9 (16.5 s)
    expect(barAt(tempo, 17_300, 4)).toBe(9);
    expect(barAt(tempo, 0, 4)).toBe(1);

    const rows: Row[] = [
      { bar: 1, label: 'intro', group: 'A' },
      { bar: 9, label: 'verse', group: 'B' },
    ];
    // a new section splitting the verse: its label, a letter of its own, kept in order
    expect(withBoundary(rows, 17)).toEqual({ rows: [...rows, { bar: 17, label: 'verse', group: 'C' }], index: 2 });
    expect(withBoundary(rows, 5)).toEqual({ rows: [rows[0], { bar: 5, label: 'intro', group: 'C' }, rows[1]], index: 1 });
    // a bar that already starts a section, or the song's start, only selects it
    expect(withBoundary(rows, 9)).toEqual({ rows, index: 1 });
    expect(withBoundary(rows, 1)).toEqual({ rows, index: 0 });
  });
});
