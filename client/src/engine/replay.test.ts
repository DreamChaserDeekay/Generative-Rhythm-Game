import { describe, expect, it } from 'vitest';
import { gaugeRules, judgementConfig } from './config';
import { JudgementTable } from './judgement';
import { isReplay, REPLAY_VERSION, ReplayPlayer, ReplayRecorder, replayScores, type ReplayData } from './replay';
import { Ruleset } from './ruleset';
import { GameSession } from './session';
import type { Chart, ChartNote } from './types';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function chart(): Chart {
  const notes: ChartNote[] = [];
  for (let i = 0; i < 120; i++) {
    const beat = 4 + i * 0.5;
    const lane = (i * 7) % 4;
    if (i % 9 === 0) notes.push({ beat, t: beat * 500, lane, type: 'hold', endBeat: beat + 1.5, endT: (beat + 1.5) * 500 });
    else notes.push({ beat, t: beat * 500, lane, type: 'tap' });
  }
  // remove notes that land inside a hold on their lane
  const kept = notes.filter((n) => !notes.some((h) => h !== n && h.type === 'hold' && h.lane === n.lane && n.t > h.t && n.t <= (h.endT as number) + 1));
  return {
    formatVersion: 1,
    meta: { chartId: 'r', audioHash: 'r', title: 'r', artist: '', keyMode: '4K', lanes: ['1', '2', '3', '4'], difficulty: 'TEST', level: 1 },
    timing: { offsetMs: 0, tempoMap: [{ beat: 0, bpm: 120 }], meter: [] },
    notes: kept,
  };
}

function newSession(c: Chart, ruleset = new Ruleset()) {
  return new GameSession(c, new JudgementTable(judgementConfig, 'NORMAL'), {
    ruleset,
    gauge: gaugeRules.HARD,
    holdTickBeats: judgementConfig.hold.tickBeats,
    releaseGraceMs: judgementConfig.hold.releaseGraceMs,
    missMarginMs: judgementConfig.missMarginMs,
    fever: 'AUTO',
  });
}

/** Sloppy human-like inputs: timing errors, skipped notes, early hold releases, stray presses. */
function inputs(c: Chart, seed: number): { lane: number; down: boolean; t: number }[] {
  const r = rng(seed);
  const out: { lane: number; down: boolean; t: number }[] = [];
  for (const n of c.notes) {
    if (r() < 0.08) continue;
    const t = n.t + (r() - 0.5) * 140;
    const end = n.type === 'hold' && r() > 0.25 ? (n.endT as number) + 20 : t + 40 + r() * 30;
    out.push({ lane: n.lane, down: true, t }, { lane: n.lane, down: false, t: end });
    if (r() < 0.05) out.push({ lane: (n.lane + 1) % 4, down: true, t: t + 7 }, { lane: (n.lane + 1) % 4, down: false, t: t + 30 });
  }
  return out.sort((a, b) => a.t - b.t);
}

describe('replays', () => {
  it('reproduce the exact result whatever the frame timing', () => {
    const c = chart();
    const live = newSession(c);
    const recorder = new ReplayRecorder(live);
    const r = rng(7);
    const events = inputs(c, 3);
    let next = 0;
    // frames every 10-25 ms; inputs reach the session up to 8 ms after they happened
    for (let frame = -500; frame < 70000; frame += 10 + r() * 15) {
      while (next < events.length && events[next].t + r() * 8 <= frame) {
        const e = events[next++];
        if (e.down) recorder.press(e.lane, e.t);
        else recorder.release(e.lane, e.t);
      }
      recorder.update(frame);
    }
    const expected = live.result();

    const replayed = newSession(c);
    const player = new ReplayPlayer(recorder.log);
    for (let frame = -500; !player.done; frame += 33) player.feed(replayed, frame);
    expect(replayed.result()).toEqual(expected);
    expect(expected.breaks).toBeGreaterThan(0);
    // far fewer logged updates than frames
    expect(recorder.log.length / 3).toBeLessThan(events.length + 1500);
  });

  it('give the score a recorded play stood at after each judgement, in the unit a ruleset shows', () => {
    const c = chart();
    const live = newSession(c);
    const recorder = new ReplayRecorder(live);
    const base = [0];
    live.on((e) => e.type === 'judge' && base.push(live.currentScore));
    const events = inputs(c, 11);
    let next = 0;
    for (let frame = -500; frame < 70000; frame += 16) {
      while (next < events.length && events[next].t <= frame) {
        const e = events[next++];
        if (e.down) recorder.press(e.lane, e.t);
        else recorder.release(e.lane, e.t);
      }
      recorder.update(frame);
    }
    const data: ReplayData = {
      version: REPLAY_VERSION,
      chartId: 'r',
      songId: null,
      recordedAt: 0,
      settings: { judgementMode: 'NORMAL', ruleset: 'RESPECT', gaugeType: 'HARD', fever: 'AUTO', placement: 'OFF', placementSeed: 1, hiSpeed: 4 },
      log: recorder.log,
      result: { score: 0, rate: 0, maxCombo: 0, lamp: 'FAILED' },
    };
    expect(replayScores(c, data, 'RESPECT')).toEqual(base);
    // the same judgements counted as EX-SCORE
    const ex = newSession(c, new Ruleset('EXSCORE'));
    const exScores = [0];
    ex.on((e) => e.type === 'judge' && exScores.push(ex.currentExScore));
    new ReplayPlayer(recorder.log).feed(ex, Infinity);
    expect(replayScores(c, data, 'EXSCORE')).toEqual(exScores);
    expect(exScores[exScores.length - 1]).toBeGreaterThan(0);
    // a replay of another chart paces nothing
    expect(replayScores(c, { ...data, chartId: 'other' }, 'RESPECT')).toBeNull();
  });

  it('validates replay data', () => {
    const ok = {
      version: REPLAY_VERSION,
      chartId: 'c1',
      songId: null,
      recordedAt: 0,
      settings: { judgementMode: 'NORMAL', ruleset: 'RESPECT', gaugeType: 'NORMAL', fever: 'OFF', placement: 'OFF', placementSeed: 1, hiSpeed: 4 },
      log: [1, 0, 1000, 0, 0, 1040],
      result: { score: 0, rate: 0, maxCombo: 0, lamp: 'FAILED' },
    };
    expect(isReplay(ok)).toBe(true);
    expect(isReplay({ ...ok, log: [1, 0] })).toBe(false);
    expect(isReplay({ ...ok, version: 2 })).toBe(false);
    expect(() => new ReplayPlayer([1, 2])).toThrow();
  });
});
