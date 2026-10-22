import { describe, expect, it } from 'vitest';
import type { ModeRecord, ScoreRecord } from '../api/client';
import { Ruleset } from '../engine/ruleset';
import type { KeyModeId } from '../engine/types';
import { bindingsFor, DEFAULT_SETTINGS, secondBindingsFor } from '../settings/settings';
import {
  accuracyLabel,
  bandOf,
  densityBins,
  errorsAtEnd,
  histogramBins,
  isLaneKey,
  judgeCells,
  lossTimes,
  nextGrade,
  nextGradeText,
  offsetFix,
  recordChange,
  sectionScores,
  shiftIsLane,
  signedCount,
  signedPercent,
  timingWindows,
  type PlayNumbers,
} from './resultBreakdown';

const PERCENTS = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 1];
const counts = (n: number[]) => PERCENTS.map((percent, i) => ({ label: `MAX ${percent}%`, percent, count: n[i] }));

const play = (over: Partial<PlayNumbers>): PlayNumbers => ({ rate: 98, weightedScore: 950_000, exScore: 300, breaks: 3, failedAtMs: null, lamp: 'CLEAR', ...over });
const mode = (over: Partial<ModeRecord>): ModeRecord => ({ score: 983_000, rate: 98.3, maxCombo: 100, lamp: 'EASY CLEAR', plays: 1, ...over });
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

  it("marks where points were lost in the ruleset's colours, MAX 90–80% (GREAT) too", () => {
    const marks = [
      { noteMs: 100, percent: 100 },
      { noteMs: 200, percent: 70 },
      { noteMs: 300, percent: 30 },
      { noteMs: 400, percent: 0 },
      { noteMs: 500, percent: 80 },
      { noteMs: 600, percent: 90 },
    ];
    expect(lossTimes(marks, 'RESPECT')).toEqual({ 'g-high': [500, 600], 'g-mid': [200], 'g-low': [300], 'g-break': [400] });
    // 등급형: 70% is still GREAT, 30% only GOOD
    expect(lossTimes(marks, 'GRADE')).toEqual({ 'g-high': [200, 500, 600], 'g-mid': [300], 'g-low': [], 'g-break': [400] });
    // EX-SCORE: GREAT is 80–99%
    expect(lossTimes(marks, 'EXSCORE')['g-high']).toEqual([500, 600]);
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

  it("compares a play with the chart's record on RATE: a tie is no record, a better lamp is", () => {
    expect(recordChange(play({ rate: 90, lamp: 'CLEAR' }), null, 'NORMAL', 'RESPECT')).toEqual({
      first: 'chart',
      newBest: false,
      lampUp: null,
      delta: null,
      breaksDelta: null,
      before: null,
    });
    expect(recordChange(play({ rate: 98.72, lamp: 'CLEAR', breaks: 2 }), best({ minBreaks: 5 }), 'NORMAL', 'RESPECT')).toEqual({
      first: null,
      newBest: true,
      lampUp: ['EASY CLEAR', 'CLEAR'],
      delta: 0.42,
      breaksDelta: -3,
      before: { headline: 98.3, breaks: 5 },
    });
    const tie = recordChange(play({ rate: 98.3, lamp: 'EASY CLEAR' }), best({}), 'NORMAL', 'RESPECT');
    expect([tie.newBest, tie.lampUp, tie.delta]).toEqual([false, null, 0]);
    // compared as saved, to 0.01
    const worse = recordChange(play({ rate: 97.774, lamp: 'FAILED' }), best({}), 'NORMAL', 'RESPECT');
    expect([worse.newBest, worse.lampUp, worse.delta]).toEqual([false, null, -0.53]);
  });

  it('compares on the number the score rule leads with, not the base score', () => {
    // EX-SCORE up while the RATE went down: a record (GREAT to PERFECT is worth more than its percent)
    const ex = recordChange(play({ rate: 97, exScore: 412, breaks: 4 }), best({ rate: 98.3, exScore: 400, minBreaks: 3 }), 'NORMAL', 'EXSCORE');
    expect([ex.newBest, ex.delta, ex.breaksDelta, ex.before?.headline]).toEqual([true, 12, 1, 400]);
    const down = recordChange(play({ rate: 99, exScore: 390 }), best({ exScore: 400 }), 'NORMAL', 'EXSCORE');
    expect([down.newBest, down.delta]).toEqual([false, -10]);
    const weighted = recordChange(play({ weightedScore: 954_321.4 }), best({ weightedScore: 950_000 }), 'NORMAL', 'GRADE');
    expect([weighted.newBest, weighted.delta]).toEqual([true, 4321]);
    // played before, never under this score rule: its first record there
    const rule = recordChange(play({ exScore: 300, breaks: 2 }), best({ minBreaks: 3 }), 'NORMAL', 'EXSCORE');
    expect([rule.first, rule.newBest, rule.delta, rule.breaksDelta]).toEqual(['rule', false, null, -1]);
  });

  it("compares with the plays of the same judgement mode, the lamp with the chart's", () => {
    const record = best({
      rate: 99,
      lamp: 'CLEAR',
      byMode: { NORMAL: mode({ rate: 99, lamp: 'CLEAR', minBreaks: 1 }), HARD: mode({ rate: 95, lamp: 'EASY CLEAR', minBreaks: 6 }) },
    });
    const hard = recordChange(play({ rate: 96, lamp: 'CLEAR', breaks: 4 }), record, 'HARD', 'RESPECT');
    // a record of HARD JUDGEMENT, though under the NORMAL best; the chart's lamp (the song select's) was CLEAR already
    expect([hard.first, hard.newBest, hard.delta, hard.breaksDelta, hard.lampUp]).toEqual([null, true, 1, -2, null]);
    expect(recordChange(play({ rate: 96, lamp: 'HARD CLEAR' }), record, 'HARD', 'RESPECT').lampUp).toEqual(['CLEAR', 'HARD CLEAR']);
    // the first play under MAX JUDGEMENT: nothing to compare its headline with, though the chart's lamp went up
    const max = recordChange(play({ rate: 90, lamp: 'HARD CLEAR' }), record, 'MAX', 'RESPECT');
    expect([max.first, max.newBest, max.before, max.lampUp]).toEqual(['mode', false, null, ['CLEAR', 'HARD CLEAR']]);
  });

  it('measures the BREAKs only between runs that reached the end', () => {
    // a run its gauge stopped partway never judged the rest: its BREAKs are compared with nothing
    const failed = recordChange(play({ rate: 40, breaks: 1, failedAtMs: 31_000, lamp: 'FAILED' }), best({ minBreaks: 16 }), 'NORMAL', 'RESPECT');
    expect([failed.delta, failed.breaksDelta]).toEqual([-58.3, null]);
    // and none of the mode's plays reached the end (the server keeps no fewest)
    expect(recordChange(play({ breaks: 16 }), best({ minBreaks: null }), 'NORMAL', 'RESPECT').breaksDelta).toBeNull();
    expect(recordChange(play({ breaks: 16 }), best({ minBreaks: 12 }), 'NORMAL', 'RESPECT').breaksDelta).toBe(4);
  });

  it('judges each hit as the offsets at the end do: a song offset changed in play moves the hits before it', () => {
    const hits = [20, 22, 18, 10, 12, 8].map((errorMs) => ({ errorMs }));
    expect(errorsAtEnd(hits, [], 1)).toEqual([20, 22, 18, 10, 12, 8]);
    // +10 after the third hit: the first three were judged 10 ms later than the end's offset would
    expect(errorsAtEnd(hits, [{ hits: 3, ms: 10 }], 1)).toEqual([10, 12, 8, 10, 12, 8]);
    // two changes add up for the hits before both; song ms at a practice's 0.5x are twice the real ms
    expect(errorsAtEnd(hits, [{ hits: 1, ms: 4 }, { hits: 3, ms: -2 }], 0.5)).toEqual([16, 26, 22, 10, 12, 8]);
  });

  it('knows the key modes whose lanes take Shift by default (R there stays R)', () => {
    const modes: KeyModeId[] = ['4K', '4K+FX', '5K', '6K', '6K+FX', '7K+1S', '8K'];
    const lanes = (mode: KeyModeId) => new Set([...bindingsFor(DEFAULT_SETTINGS, mode), ...secondBindingsFor(DEFAULT_SETTINGS, mode).filter((c): c is string => c !== null)]);
    expect(modes.filter((m) => shiftIsLane(lanes(m)))).toEqual(['4K+FX', '6K+FX', '7K+1S']);
    // a lane moved onto Shift by the player counts too
    expect(shiftIsLane(new Set(['KeyD', 'KeyF', 'ShiftRight', 'KeyK']))).toBe(true);
  });

  it("tells the play's lanes as the result shows: their keys, and any key a pad sends from a pad lane (its X's R too)", () => {
    const keys = new Set(['KeyD', 'KeyF', 'KeyJ', 'KeyK']);
    // a pad played 4K on ← ↑ ↓ and X
    const pad = new Set(['Pad:B14', 'Pad:B12', 'Pad:B13', 'Pad:B2']);
    expect(isLaneKey('KeyR', 'Pad:B2', keys, pad)).toBe(true);
    expect(isLaneKey('ArrowUp', 'Pad:B12', keys, pad)).toBe(true);
    // the keyboard's R is no lane, nor X where the pad plays on other buttons, nor a key the bridge sent for no lane
    expect(isLaneKey('KeyR', null, keys, pad)).toBe(false);
    expect(isLaneKey('KeyR', 'Pad:B2', keys, new Set(['Pad:B0', 'Pad:B1']))).toBe(false);
    expect(isLaneKey('Enter', 'Pad:B0', keys, pad)).toBe(false);
    // a lane key is the lane's whoever sent it
    expect(isLaneKey('KeyJ', null, keys, pad)).toBe(true);
    expect(isLaneKey('KeyJ', 'Pad:B0', keys, new Set())).toBe(true);
  });

  it('signs a change', () => {
    expect(signedPercent(0.42)).toBe('+0.42%');
    expect(signedPercent(-0.53)).toBe('−0.53%');
    expect(signedPercent(0)).toBe('±0.00%');
    expect([signedCount(1234), signedCount(-23), signedCount(0)]).toEqual(['+1,234', '−23', '±0']);
  });

  it('tells how far the next grade is, in the unit of the headline', () => {
    // S++ at 990,116: S+++ is 990,909, 793 points or 0.08% (rounded up) away
    const respect = nextGrade({ ruleset: 'RESPECT', score: 990_116, weightedScore: 0, exScore: 0, exMax: 0 });
    expect(respect).toEqual({ grade: 'S+++', short: 0.08 });
    expect(nextGradeText(respect!, 'rate')).toBe('다음 S+++까지 −0.08%');
    // a point under a grade is still 0.01% away
    expect(nextGrade({ ruleset: 'RESPECT', score: 909_090, weightedScore: 0, exScore: 0, exMax: 0 })).toEqual({ grade: 'S', short: 0.01 });
    expect(nextGrade({ ruleset: 'RESPECT', score: 1_000_000, weightedScore: 0, exScore: 0, exMax: 0 })).toBeNull();
    // 등급형: the weighted score
    const weighted = nextGrade({ ruleset: 'GRADE', score: 999_999, weightedScore: 920_000, exScore: 0, exMax: 0 });
    expect(weighted).toEqual({ grade: 'S+', short: 11_818 });
    expect(nextGradeText(weighted!, 'weighted')).toBe('다음 S+까지 −11,818');
    // EX-SCORE: the BMS ranks; AA is 7/9 of 440 = 342.2, so 343
    const ex = nextGrade({ ruleset: 'EXSCORE', score: 0, weightedScore: 0, exScore: 320, exMax: 440 });
    expect(ex).toEqual({ grade: 'AA', short: 23 });
    expect(nextGradeText(ex!, 'exscore')).toBe('다음 AA까지 −23');
    expect(nextGrade({ ruleset: 'EXSCORE', score: 0, weightedScore: 0, exScore: 0, exMax: 440 })).toEqual({ grade: 'E', short: 98 });
    // AAA is the top
    expect(nextGrade({ ruleset: 'EXSCORE', score: 0, weightedScore: 0, exScore: 400, exMax: 440 })).toBeNull();
  });

  it('works the offset fix out from the offsets the play ran on', () => {
    // 4 ms late: the player's offset and the song's own each 4 ms more, from where the play had them
    expect(offsetFix(4.4, { input: -10, song: 2 }, 1, true)).toEqual({ errorMs: 4, input: { from: -10, to: -6 }, song: { from: 2, to: 6 } });
    expect(offsetFix(-7.6, { input: 0, song: 0 }, 1, true)).toEqual({ errorMs: -8, input: { from: 0, to: -8 }, song: { from: 0, to: -8 } });
    // the song's own is in song ms: 8 real ms late at 0.75x are 6 of them
    expect(offsetFix(8, { input: 0, song: 0 }, 0.75, true)?.song).toEqual({ from: 0, to: 6 });
    // under 3 ms, too few hits, a replay of old: nothing
    expect(offsetFix(2.4, { input: 0, song: 0 }, 1, true)).toBeNull();
    expect(offsetFix(null, { input: 0, song: 0 }, 1, true)).toBeNull();
    expect(offsetFix(10, null, 1, true)).toBeNull();
    // no song (the sync test): the player's alone; at its limit it cannot move
    expect(offsetFix(10, { input: 0, song: 0 }, 1, false)).toEqual({ errorMs: 10, input: { from: 0, to: 10 }, song: null });
    expect(offsetFix(10, { input: 200, song: 195 }, 1, true)).toEqual({ errorMs: 10, input: null, song: { from: 195, to: 200 } });
    expect(offsetFix(10, { input: 200, song: 0 }, 1, false)).toBeNull();
  });

  it("draws the timing graphs on the play's judgement windows", () => {
    const normal = timingWindows('NORMAL', 'RESPECT');
    expect([normal.topMs, normal.topLabel, normal.outerMs]).toEqual([41.67, 'MAX 100%', 180]);
    expect(normal.bands.map((b) => [b.cls, b.ms])).toEqual([
      ['g-max', 41.67],
      ['g-high', 78],
      ['g-mid', 124.86],
      ['g-low', 180],
    ]);
    // HARD JUDGEMENT halves them: +34 ms is MAX 80% there, not MAX 100%
    const hard = timingWindows('HARD', 'RESPECT');
    expect([hard.topMs, hard.outerMs]).toEqual([20.835, 90]);
    expect([bandOf(hard, 34), bandOf(hard, -20), bandOf(normal, 34)]).toEqual(['g-high', 'g-max', 'g-max']);
    // a score rule's own grades: 등급형's GREAT goes down to 70%; its name for MAX 100%
    expect(timingWindows('NORMAL', 'GRADE').bands.map((b) => b.cls)).toEqual(['g-max', 'g-high', 'g-mid', 'g-low']);
    expect(timingWindows('NORMAL', 'GRADE').bands[1].ms).toBe(89.71);
    expect([timingWindows('HARD', 'EXSCORE').topLabel, timingWindows('NORMAL', 'GRADE').topLabel]).toEqual(['PERFECT', 'PERFECT']);
    // about 4 ms bins over ±180 exactly, an odd number of them so that one is centred on 0
    const bins = histogramBins([0, 1.9, 2.1, -2.1, 179, 180, -179.5, -181.9, 300], 180);
    expect(bins.counts.length).toBe(91);
    expect(bins.binMs).toBeCloseTo(360 / 91, 9);
    expect(bins.counts.reduce((a, b) => a + b, 0)).toBe(7);
    expect([bins.counts[45], bins.counts[46], bins.counts[44], bins.counts[0], bins.counts[90]]).toEqual([2, 1, 1, 1, 2]);
    // about 2 ms under HARD (±90) and MAX JUDGEMENT (±45)
    expect([histogramBins([], 90).counts.length, histogramBins([], 45).counts.length, histogramBins([], 45).binMs]).toEqual([91, 45, 2]);
  });
});
