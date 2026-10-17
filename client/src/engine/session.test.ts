import { describe, expect, it } from 'vitest';
import { AutoPlayer } from './autoplay';
import { gaugeRules, judgementConfig, type JudgementModeId } from './config';
import { JudgementTable } from './judgement';
import { GameSession, type JudgeEvent, type SessionEvent } from './session';
import { buildSyncTestChart } from './syncTest';
import type { Chart, ChartNote } from './types';

const BPM = 120; // 500ms per beat

function chartOf(notes: Partial<ChartNote>[], lanes = 4): Chart {
  return {
    formatVersion: 1,
    meta: {
      chartId: 'test',
      audioHash: 'test',
      title: 't',
      artist: 'a',
      keyMode: '4K',
      lanes: Array.from({ length: lanes }, (_, i) => String(i + 1)),
      difficulty: 'TEST',
      level: 1,
    },
    timing: { offsetMs: 0, tempoMap: [{ beat: 0, bpm: BPM }], meter: [] },
    notes: notes.map((n) => {
      const beat = n.beat ?? 0;
      const note: ChartNote = { beat, t: beat * 500, lane: n.lane ?? 0, type: n.type ?? 'tap' };
      if (note.type === 'hold') {
        note.endBeat = n.endBeat;
        note.endT = (n.endBeat ?? beat) * 500;
      }
      return note;
    }),
  };
}

function session(chart: Chart, mode: JudgementModeId = 'NORMAL') {
  const s = new GameSession(chart, new JudgementTable(judgementConfig, mode), {
    gauge: gaugeRules.NORMAL,
    holdTickBeats: judgementConfig.hold.tickBeats,
    releaseGraceMs: judgementConfig.hold.releaseGraceMs,
    missMarginMs: judgementConfig.missMarginMs,
  });
  const events: SessionEvent[] = [];
  s.on((e) => events.push(e));
  const judges = () => events.filter((e): e is JudgeEvent => e.type === 'judge');
  return { s, events, judges };
}

function tapAt(s: GameSession, lane: number, t: number) {
  s.press(lane, t);
  s.release(lane, t + 30);
}

describe('GameSession taps', () => {
  it('grades a press by its timing error', () => {
    const { s, judges } = session(chartOf([{ beat: 2 }, { beat: 4 }, { beat: 6 }]));
    tapAt(s, 0, 1000 + 10);
    tapAt(s, 0, 2000 - 55);
    tapAt(s, 0, 3000 + 170);
    expect(judges().map((j) => j.label)).toEqual(['MAX 100%', 'MAX 90%', 'MAX 1%']);
    expect(judges().map((j) => j.errorMs)).toEqual([10, -55, 170]);
    expect(s.combo).toBe(3);
  });

  it('keeps the combo on MAX 1% and breaks it only on BREAK', () => {
    const { s, judges } = session(chartOf([{ beat: 2 }, { beat: 4 }, { beat: 6 }]));
    tapAt(s, 0, 1000 + 175);
    expect(s.combo).toBe(1);
    s.update(2000 + 300); // second note is missed
    expect(judges()[1].label).toBe('BREAK');
    expect(s.combo).toBe(0);
    tapAt(s, 0, 3000);
    expect(s.combo).toBe(1);
    expect(s.maxCombo).toBe(1);
  });

  it('treats presses just before the MAX 1% window as an indirect miss', () => {
    const { s, judges } = session(chartOf([{ beat: 2 }, { beat: 4 }]));
    tapAt(s, 0, 1000 - 200); // inside the 180..220ms early BREAK zone
    expect(judges()).toHaveLength(1);
    expect(judges()[0].isBreak).toBe(true);
    expect(judges()[0].noteIndex).toBe(0);
  });

  it('ignores presses earlier than the early BREAK zone', () => {
    const { s, judges } = session(chartOf([{ beat: 2 }]));
    tapAt(s, 0, 1000 - 221);
    expect(judges()).toHaveLength(0);
    tapAt(s, 0, 1000);
    expect(judges()[0].label).toBe('MAX 100%');
  });

  it('applies HARD and MAX JUDGEMENT windows', () => {
    const hard = session(chartOf([{ beat: 2 }]), 'HARD');
    tapAt(hard.s, 0, 1000 + 25);
    expect(hard.judges()[0].label).toBe('MAX 90%');

    const max = session(chartOf([{ beat: 2 }, { beat: 4 }]), 'MAX');
    tapAt(max.s, 0, 1000 + 10);
    tapAt(max.s, 0, 2000 + 50); // outside 45ms -> missed by the time of the press
    expect(max.judges().map((j) => j.label)).toEqual(['MAX 100%', 'BREAK']);
  });

  it('judges chords per lane independently', () => {
    const { s, judges } = session(chartOf([{ beat: 2, lane: 0 }, { beat: 2, lane: 3 }]));
    s.press(0, 1000);
    s.press(3, 1005);
    expect(judges().map((j) => j.lane).sort()).toEqual([0, 3]);
    expect(judges().every((j) => j.label === 'MAX 100%')).toBe(true);
  });

  it('expires late notes only after the miss margin in update', () => {
    const { s, judges } = session(chartOf([{ beat: 2 }]));
    s.update(1000 + 180 + 40); // still within the 50ms margin
    expect(judges()).toHaveLength(0);
    s.update(1000 + 180 + 51);
    expect(judges()[0].isBreak).toBe(true);
  });

  it('resolves a late press arriving after the frame update', () => {
    const { s, judges } = session(chartOf([{ beat: 2 }]));
    s.update(1000 + 200); // frame ran first...
    s.press(0, 1000 + 170); // ...then an input stamped earlier is handled
    expect(judges()[0].label).toBe('MAX 1%');
  });
});

describe('GameSession long notes', () => {
  // Hold from beat 2 to beat 4 (1000ms..2000ms): ticks every 1/4 beat -> 7 ticks in between.
  const holdChart = () => chartOf([{ beat: 2, endBeat: 4, type: 'hold' }, { beat: 6 }]);

  it('counts the head, every tick and the tail when held to the end', () => {
    const { s, events, judges } = session(holdChart());
    s.press(0, 1000);
    for (let t = 1000; t <= 2100; t += 16) s.update(t);
    expect(events.filter((e) => e.type === 'tick')).toHaveLength(7);
    expect(judges().map((j) => [j.kind, j.label])).toEqual([
      ['head', 'MAX 100%'],
      ['tail', 'MAX 100%'],
    ]);
    expect(s.combo).toBe(9);
    s.release(0, 2100);
    tapAt(s, 0, 3000);
    expect(s.maxPossibleCombo).toBe(10);
    expect(s.result().lamp).toBe('PERFECT PLAY');
  });

  it('allows releasing within the grace period before the end', () => {
    const { s, judges } = session(holdChart());
    s.press(0, 1000);
    s.release(0, 2000 - 90);
    expect(judges()[1]).toMatchObject({ kind: 'tail', label: 'MAX 100%' });
    expect(s.combo).toBe(9);
  });

  it('breaks the tail and the combo on an early release', () => {
    const { s, events, judges } = session(holdChart());
    s.press(0, 1000);
    s.update(1300);
    s.release(0, 1400);
    expect(events.filter((e) => e.type === 'tick')).toHaveLength(3); // 1125, 1250, 1375
    expect(judges()[1]).toMatchObject({ kind: 'tail', isBreak: true });
    expect(s.combo).toBe(0);
    expect(s.maxCombo).toBe(4);
    s.update(1500);
    expect(events.filter((e) => e.type === 'tick')).toHaveLength(3);
  });

  it('breaks head and tail when the head is missed', () => {
    const { s, judges } = session(holdChart());
    s.update(1300);
    expect(judges().map((j) => [j.kind, j.isBreak])).toEqual([
      ['head', true],
      ['tail', true],
    ]);
  });
});

describe('GameSession results', () => {
  it('computes rate, score, fast/slow and timing stats', () => {
    const { s } = session(chartOf([{ beat: 2 }, { beat: 4 }, { beat: 6 }, { beat: 8 }]));
    tapAt(s, 0, 1000);
    tapAt(s, 0, 2000 - 50); // 90%, fast
    tapAt(s, 0, 3000 + 70); // 80%, slow
    s.update(5000); // last note BREAK
    const r = s.result();
    expect(r.rate).toBeCloseTo((100 + 90 + 80 + 0) / 4, 9);
    expect(r.score).toBe(675_000);
    expect(r.fast).toBe(1);
    expect(r.slow).toBe(1);
    expect(r.breaks).toBe(1);
    expect(r.meanErrorMs).toBeCloseTo(20 / 3, 9);
    expect(r.counts.find((c) => c.percent === 90)?.count).toBe(1);
    expect(r.lamp).toBe('CLEAR'); // tiny chart: a few good hits refill the gauge past 80%
    expect(s.finished).toBe(true);
  });

  it('awards MAX COMBO when nothing breaks but not every grade is MAX 100%', () => {
    const { s } = session(chartOf([{ beat: 2 }, { beat: 4 }]));
    tapAt(s, 0, 1000);
    tapAt(s, 0, 2000 + 100);
    expect(s.result().lamp).toBe('MAX COMBO');
  });

  it('does not move the gauge on MAX 1%', () => {
    const { s } = session(chartOf([{ beat: 2 }, { beat: 4 }]));
    const before = s.gauge.value;
    tapAt(s, 0, 1000 + 175);
    expect(s.gauge.value).toBe(before);
    tapAt(s, 0, 2000);
    expect(s.gauge.value).toBeGreaterThan(before);
  });
});

describe('AutoPlayer', () => {
  it('scores PERFECT PLAY on the sync test charts', () => {
    for (const keyMode of ['4K', '4K+FX', '5K', '6K', '6K+FX', '7K+1S', '8K'] as const) {
      const chart = buildSyncTestChart({ keyMode, bpm: 120, firstBeatMs: 2000, beats: 48 });
      const { s } = session(chart);
      const auto = new AutoPlayer(chart);
      const end = (chart.meta.durationMs ?? 0) + 1000;
      for (let t = 0; t <= end; t += 16.6667) {
        for (const input of auto.take(t)) {
          if (input.down) s.press(input.lane, input.timeMs);
          else s.release(input.lane, input.timeMs);
        }
        s.update(t);
      }
      const r = s.result();
      expect(s.finished).toBe(true);
      expect(r.lamp).toBe('PERFECT PLAY');
      expect(r.rate).toBe(100);
      expect(r.score).toBe(1_000_000);
      expect(r.maxCombo).toBe(r.maxPossibleCombo);
    }
  });
});
