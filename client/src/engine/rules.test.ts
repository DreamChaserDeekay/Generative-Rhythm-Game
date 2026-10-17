import { describe, expect, it } from 'vitest';
import { gaugeRules, judgementConfig, type GaugeTypeId } from './config';
import { Fever } from './fever';
import { JudgementTable } from './judgement';
import { Ruleset } from './ruleset';
import { GameSession, type JudgeEvent, type SessionEvent, type SessionOptions } from './session';
import type { Chart, ChartNote, KeyModeId } from './types';

function chartOf(beats: number[], lanes = 4, keyMode: KeyModeId = '4K', lane = (i: number) => i % lanes): Chart {
  return {
    formatVersion: 1,
    meta: {
      chartId: 'rules',
      audioHash: 'rules',
      title: 't',
      artist: 'a',
      keyMode,
      lanes: Array.from({ length: lanes }, (_, i) => String(i)),
      difficulty: 'TEST',
      level: 1,
    },
    timing: { offsetMs: 0, tempoMap: [{ beat: 0, bpm: 120 }], meter: [] },
    notes: beats.map((beat, i): ChartNote => ({ beat, t: beat * 500, lane: lane(i), type: 'tap' })),
  };
}

function run(chart: Chart, extra: Partial<SessionOptions> = {}, gauge: GaugeTypeId = 'NORMAL', timeScale = 1) {
  const s = new GameSession(chart, new JudgementTable(judgementConfig, 'NORMAL', timeScale), {
    gauge: gaugeRules[gauge],
    holdTickBeats: 0.25,
    releaseGraceMs: 100,
    missMarginMs: 50,
    ...extra,
  });
  const events: SessionEvent[] = [];
  s.on((e) => events.push(e));
  const judges = () => events.filter((e): e is JudgeEvent => e.type === 'judge');
  return { s, events, judges };
}

const tap = (s: GameSession, lane: number, t: number) => {
  s.press(lane, t);
  s.release(lane, t + 20);
};

describe('rulesets', () => {
  it('relabels DJMAX percents and scores EX-SCORE (BMS)', () => {
    const { s, judges } = run(chartOf([2, 4, 6, 8, 10]), { ruleset: new Ruleset('EXSCORE') });
    tap(s, 0, 1000); // 100% -> PERFECT (2)
    tap(s, 1, 2000 + 70); // 80% -> GREAT (1)
    tap(s, 2, 3000 + 120); // between 80 and 10 -> GOOD (0)
    tap(s, 3, 4000 + 175); // 1% -> BAD, breaks the combo
    s.update(6000); // last note -> POOR
    expect(judges().map((j) => j.label)).toEqual(['PERFECT', 'GREAT', 'GOOD', 'BAD', 'POOR']);
    const r = s.result();
    expect(r.exScore).toBe(3);
    expect(r.exMax).toBe(10);
    expect(r.comboBreaks).toBe(2);
    expect(r.rows.map((row) => row.count)).toEqual([1, 1, 1, 1, 1]);
    expect(r.rank).toBe('E'); // 3/10 = 0.30 is above the E line (2/9)
    expect(r.lamp).not.toBe('MAX COMBO');
  });

  it('weights grades for the EZ2ON-like ruleset without changing the base score', () => {
    const { s } = run(chartOf([2, 4]), { ruleset: new Ruleset('GRADE') });
    tap(s, 0, 1000);
    tap(s, 1, 2000 + 70); // 80% -> GREAT
    const r = s.result();
    expect(r.weightedScore).toBe(Math.round(((1 + 0.75) / 2) * 1_000_000));
    expect(r.score).toBe(900_000);
    expect(r.rows[0]).toMatchObject({ label: 'PERFECT', count: 1 });
  });
});

describe('side tracks', () => {
  it('turns a missed side note into MAX 1% instead of BREAK', () => {
    // 4K+FX: lane 0 and 5 are side tracks.
    const chart = chartOf([2, 4], 6, '4K+FX', (i) => (i === 0 ? 0 : 2));
    const { s, judges } = run(chart, { sideLanes: [0, 5], sideMissPercent: 1 });
    s.update(1400); // side note missed
    tap(s, 2, 2000);
    expect(judges()[0]).toMatchObject({ lane: 0, label: 'MAX 1%', isBreak: false, comboBreak: false });
    expect(s.combo).toBe(2);
    expect(s.result().breaks).toBe(0);
  });
});

describe('gauges', () => {
  it('fails a survival gauge mid-song and stops judging', () => {
    const beats = Array.from({ length: 30 }, (_, i) => 2 + i);
    const { s, events } = run(chartOf(beats), {}, 'HAZARD');
    tap(s, 0, 1000);
    s.update(1500 + 300); // second note BREAKs -> HAZARD drops to 0
    expect(events.some((e) => e.type === 'fail')).toBe(true);
    expect(s.hasFailed).toBe(true);
    const judged = s.judgedCount;
    tap(s, 2, 2000);
    s.update(10_000);
    expect(s.judgedCount).toBe(judged);
    const r = s.result();
    expect(r.failed).toBe(true);
    expect(r.lamp).toBe('FAILED');
    expect(r.failedAtMs).not.toBeNull();
  });

  it('gives the gauge lamp when a survival gauge lasts', () => {
    const { s } = run(chartOf([2, 4, 6]), {}, 'HARD');
    tap(s, 0, 1000);
    s.update(2000 + 300); // one BREAK
    tap(s, 2, 3000);
    expect(s.result().lamp).toBe('HARD CLEAR');
  });

  it('fails a normal gauge only at the end, below the clear line', () => {
    const beats = Array.from({ length: 20 }, (_, i) => 2 + i);
    const { s } = run(chartOf(beats), {}, 'NORMAL');
    tap(s, 0, 1000);
    s.update(20_000);
    expect(s.hasFailed).toBe(false);
    expect(s.result().lamp).toBe('FAILED');
  });
});

describe('FEVER', () => {
  it('fires automatically when full and adds a bonus kept apart from the score', () => {
    const beats = Array.from({ length: 80 }, (_, i) => 2 + i * 0.5);
    const { s, events } = run(chartOf(beats), { fever: 'AUTO' });
    beats.forEach((b, i) => tap(s, i % 4, b * 500));
    const fevers = events.filter((e) => e.type === 'fever' && e.active);
    expect(fevers.length).toBeGreaterThanOrEqual(1);
    const r = s.result();
    expect(r.fever.bonus).toBeGreaterThan(0);
    expect(r.score).toBe(1_000_000);
  });

  it('waits for the key in MANUAL mode', () => {
    const beats = Array.from({ length: 60 }, (_, i) => 2 + i * 0.5);
    const { s } = run(chartOf(beats), { fever: 'MANUAL' });
    beats.slice(0, 50).forEach((b, i) => tap(s, i % 4, b * 500));
    expect(s.fever.ready).toBe(true);
    expect(s.fever.active).toBe(false);
    expect(s.activateFever(beats[50] * 500)).toBe(true);
    expect(s.fever.active).toBe(true);
  });

  it('raises the multiplier fever after fever and resets it on BREAK', () => {
    const f = new Fever('MANUAL', 100, { fillPerNote: 1, tickFill: 0, durationMs: 100, startMultiplier: 2, maxMultiplier: 5, bonusTotal: 100 });
    const cycle = (t: number) => {
      f.onJudge(100, false, t);
      f.activate(t);
      return f.multiplier;
    };
    expect(cycle(0)).toBe(2);
    f.update(200);
    expect(cycle(300)).toBe(3);
    f.onJudge(0, true, 310); // BREAK during fever
    expect(f.active).toBe(false);
    expect(cycle(400)).toBe(2);
  });
});

describe('practice time scale', () => {
  it('keeps the windows constant in real time and reports real-ms errors', () => {
    // At half speed song time runs at 0.5 ms per real ms: a 30 real-ms late press is 15 song ms.
    const { s, judges } = run(chartOf([2]), { timeScale: 0.5 }, 'NORMAL', 0.5);
    tap(s, 0, 1000 + 15);
    expect(judges()[0].errorMs).toBeCloseTo(30, 9);
    expect(judges()[0].label).toBe('MAX 100%');
    const late = run(chartOf([2]), { timeScale: 0.5 }, 'NORMAL', 0.5);
    tap(late.s, 0, 1000 + 25); // 50 real ms -> MAX 90%
    expect(late.judges()[0].label).toBe('MAX 90%');
  });
});
