import { describe, expect, it } from 'vitest';
import { applyPlacement, mulberry32 } from './placement';
import { buildSyncTestChart } from './syncTest';
import type { Chart, ChartNote } from './types';

const sync8 = () => buildSyncTestChart({ keyMode: '8K', bpm: 150, firstBeatMs: 1000, beats: 48 });
const syncFx = () => buildSyncTestChart({ keyMode: '6K+FX', bpm: 150, firstBeatMs: 1000, beats: 48 });

/** No lane has two notes at once or a note while a long note is held on it. */
function playable(chart: Chart): boolean {
  const byLane = new Map<number, ChartNote[]>();
  for (const n of chart.notes) byLane.set(n.lane, [...(byLane.get(n.lane) ?? []), n]);
  for (const notes of byLane.values()) {
    notes.sort((a, b) => a.t - b.t);
    for (let i = 1; i < notes.length; i++) {
      const prevEnd = notes[i - 1].endT ?? notes[i - 1].t;
      if (notes[i].t <= prevEnd) return false;
    }
  }
  return true;
}

describe('placement options', () => {
  it('MIRROR reverses the keys and swaps the side tracks', () => {
    const chart = sync8();
    const { chart: m, laneOrder } = applyPlacement(chart, 'MIRROR', 1);
    expect(laneOrder).toBe('87654321');
    chart.notes.forEach((n, i) => expect(m.notes[i].lane).toBe(7 - n.lane));

    const fx = syncFx();
    const mf = applyPlacement(fx, 'MIRROR', 1).chart;
    fx.notes.forEach((n, i) => expect(mf.notes[i].lane).toBe(7 - n.lane));
  });

  it('RANDOM is a fixed permutation per seed', () => {
    const chart = sync8();
    const a = applyPlacement(chart, 'RANDOM', 42);
    const b = applyPlacement(chart, 'RANDOM', 42);
    expect(a.chart.notes.map((n) => n.lane)).toEqual(b.chart.notes.map((n) => n.lane));
    expect([...(a.laneOrder ?? '')].sort().join('')).toBe('12345678');
    expect(a.laneOrder).not.toBe('12345678');
    const mapping = new Map<number, number>();
    chart.notes.forEach((n, i) => {
      const to = a.chart.notes[i].lane;
      if (mapping.has(n.lane)) expect(mapping.get(n.lane)).toBe(to);
      mapping.set(n.lane, to);
    });
  });

  it('R-RANDOM rotates the keys (optionally mirrored)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const order = applyPlacement(sync8(), 'R-RANDOM', seed).laneOrder ?? '';
      const digits = [...order].map(Number);
      const steps = digits.slice(1).map((d, i) => (d - digits[i] + 8) % 8);
      expect(steps.every((s) => s === 1) || steps.every((s) => s === 7)).toBe(true);
    }
  });

  it('S-RANDOM and H-RANDOM keep every chart playable', () => {
    for (const id of ['S-RANDOM', 'H-RANDOM'] as const) {
      for (let seed = 0; seed < 10; seed++) {
        for (const chart of [sync8(), syncFx()]) {
          const out = applyPlacement(chart, id, seed).chart;
          expect(out.notes).toHaveLength(chart.notes.length);
          expect(playable(out)).toBe(true);
        }
      }
    }
  });

  it('H-RANDOM avoids quick repeats on one lane better than S-RANDOM', () => {
    const quickRepeats = (chart: Chart) => {
      const last = new Map<number, number>();
      let n = 0;
      for (const note of [...chart.notes].sort((a, b) => a.t - b.t)) {
        if (note.t - (last.get(note.lane) ?? -Infinity) < 150) n++;
        last.set(note.lane, note.endT ?? note.t);
      }
      return n;
    };
    // A 16th-note stream at 150 BPM: 100 ms between notes.
    const base = sync8();
    const stream: Chart = {
      ...base,
      notes: Array.from({ length: 200 }, (_, i) => ({ beat: i / 4, t: 1000 + i * 100, lane: i % 8, type: 'tap' as const })),
    };
    let s = 0;
    let h = 0;
    for (let seed = 0; seed < 10; seed++) {
      s += quickRepeats(applyPlacement(stream, 'S-RANDOM', seed).chart);
      h += quickRepeats(applyPlacement(stream, 'H-RANDOM', seed).chart);
    }
    expect(s).toBeGreaterThan(50);
    expect(h).toBe(0);
  });

  it('mulberry32 is deterministic and uniform enough', () => {
    const r = mulberry32(7);
    const values = Array.from({ length: 2000 }, () => r());
    expect(mulberry32(7)()).toBe(values[0]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });
});
