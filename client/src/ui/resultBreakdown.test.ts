import { describe, expect, it } from 'vitest';
import type { ScoreRecord } from '../api/client';
import { Ruleset } from '../engine/ruleset';
import { accuracyLabel, densityBins, judgeCells, lossTimes, recordChange, sectionScores, signedPercent } from './resultBreakdown';

const PERCENTS = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 1];
const counts = (n: number[]) => PERCENTS.map((percent, i) => ({ label: `MAX ${percent}%`, percent, count: n[i] }));

const best = (over: Partial<ScoreRecord>): ScoreRecord => ({
  chartId: 'c',
  songId: 's',
  keyMode: '4K',
  difficulty: 'HARD',
  level: 9,
  seed: 1,
  score: 983_000,
  rate: 98.3,
  maxCombo: 100,
  lamp: 'EASY CLEAR',
  plays: 3,
  ...over,
});

describe('result breakdown', () => {
  it('folds the DJMAX percents into their four colours, BREAK last', () => {
    const rows = new Ruleset('RESPECT').rows(counts([500, 20, 10, 5, 4, 3, 2, 1, 1, 1, 6]), 2);
    expect(judgeCells(rows)).toEqual([
      { label: 'MAX 100%', cls: 'g-max', count: 500 },
      { label: 'MAX 90–80%', cls: 'g-high', count: 30 },
      { label: 'MAX 70–40%', cls: 'g-mid', count: 14 },
      { label: 'MAX 30–1%', cls: 'g-low', count: 9 },
      { label: 'BREAK', cls: 'g-break', count: 2 },
    ]);
  });

  it("keeps a ruleset's own grades as they are", () => {
    const rows = new Ruleset('EXSCORE').rows(counts([500, 20, 10, 5, 4, 3, 2, 1, 1, 1, 6]), 2);
    expect(judgeCells(rows).map((c) => [c.label, c.count])).toEqual([
      ['PERFECT', 500],
      ['GREAT', 30],
      ['GOOD', 17],
      ['BAD', 6],
      ['POOR', 2],
    ]);
  });

  it('counts notes into the bars of the run strip, the last note on the end included', () => {
    expect(densityBins([{ t: 0 }, { t: 499 }, { t: 500 }, { t: 1000 }, { t: 1001 }, { t: -1 }], 0, 1000, 2)).toEqual([2, 2]);
  });

  it("marks where points were lost in the ruleset's colours", () => {
    const marks = [
      { noteMs: 100, percent: 100 },
      { noteMs: 200, percent: 70 },
      { noteMs: 300, percent: 30 },
      { noteMs: 400, percent: 0 },
      { noteMs: 500, percent: 80 },
    ];
    expect(lossTimes(marks, 'RESPECT')).toEqual({ 'g-mid': [200], 'g-low': [300], 'g-break': [400] });
    // 등급형: 70% is still GREAT, 30% only GOOD
    expect(lossTimes(marks, 'GRADE')).toEqual({ 'g-mid': [300], 'g-low': [], 'g-break': [400] });
  });

  it('scores each section by the notes judged in it, clipped to the span played', () => {
    // 120 BPM: a beat is 500 ms
    const chart = {
      timing: { offsetMs: 0, tempoMap: [{ beat: 0, bpm: 120 }], meter: [] },
      sections: [
        { startBeat: 0, label: 'intro', group: 'A', energy: 0.2 },
        { startBeat: 8, label: 'verse', group: 'B', energy: 0.5 },
        { startBeat: 16, endBeat: 24, label: 'chorus', group: 'C', energy: 0.9 },
      ],
    };
    const marks = [
      { noteMs: 4000, percent: 90 },
      { noteMs: 4500, percent: 70 },
      { noteMs: 8000, percent: 100 },
      { noteMs: 11_000, percent: 0 },
      { noteMs: 12_000, percent: 100 },
    ];
    expect(sectionScores(chart, marks, 0, 12_000)).toEqual([
      { from: 0, to: 1 / 3, label: 'intro', color: '--section-1', accuracy: null },
      { from: 1 / 3, to: 2 / 3, label: 'verse', color: '--section-2', accuracy: 80 },
      { from: 2 / 3, to: 1, label: 'chorus', color: '--section-3', accuracy: (100 + 0 + 100) / 3 },
    ]);
    // a practice segment from 5 s to 9 s: the verse's end and the chorus's start
    expect(sectionScores(chart, marks, 5000, 9000).map((s) => [s.label, s.from, s.to])).toEqual([
      ['verse', 0, 0.75],
      ['chorus', 0.75, 1],
    ]);
    expect(sectionScores({ ...chart, sections: [] }, marks, 0, 12_000)).toEqual([]);
  });

  it('writes 100% only for a perfect section', () => {
    expect(accuracyLabel(100)).toBe('100%');
    expect(accuracyLabel(99.96)).toBe('99.9%');
    expect(accuracyLabel(96.14)).toBe('96.1%');
    expect(accuracyLabel(null)).toBe('–');
  });

  it("compares a play with the chart's record: a tie is no record, a better lamp is", () => {
    expect(recordChange({ score: 900_000, rate: 90, lamp: 'CLEAR' }, null)).toEqual({ first: true, newBest: false, lampUp: null, rateDelta: null });
    expect(recordChange({ score: 987_200, rate: 98.72, lamp: 'CLEAR' }, best({}))).toEqual({
      first: false,
      newBest: true,
      lampUp: ['EASY CLEAR', 'CLEAR'],
      rateDelta: 0.42,
    });
    const tie = recordChange({ score: 983_000, rate: 98.3, lamp: 'EASY CLEAR' }, best({}));
    expect([tie.newBest, tie.lampUp, tie.rateDelta]).toEqual([false, null, 0]);
    const worse = recordChange({ score: 977_700, rate: 97.774, lamp: 'FAILED' }, best({}));
    expect([worse.newBest, worse.lampUp, worse.rateDelta]).toEqual([false, null, -0.53]);
  });

  it('signs a rate change', () => {
    expect(signedPercent(0.42)).toBe('+0.42%');
    expect(signedPercent(-0.53)).toBe('−0.53%');
    expect(signedPercent(0)).toBe('±0.00%');
  });
});
