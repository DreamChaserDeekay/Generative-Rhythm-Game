import { describe, expect, it } from 'vitest';
import {
  BODY,
  burstPoses,
  CORE,
  GLOW,
  holdPoses,
  LATE,
  LAYER_BURST_MS,
  layerUniforms,
  lightAt,
  setPoses,
  SHAPE,
  SLOTS,
  SPARKS,
  type LayerPose,
  type LayerSpec,
} from './layerFx';

const SPEC: LayerSpec = { cols: 3, rows: 2, light: [1, 0.9, 0.6, 0.4, 0.4, 0.2, 0.1, 0], core: [1, 0.5, 0.1, 0], grow: 1.3, reach: 0.6, late: true };
const of = (poses: LayerPose[], cell: number) => poses.filter((p) => p.cell === cell);

describe('a hit drawn from layers', () => {
  it('reads its sheet\'s light between its points, and none past its end', () => {
    expect(lightAt([1, 0.5, 0], 0)).toBe(1);
    expect(lightAt([1, 0.5, 0], 10)).toBeCloseTo(0.75, 9);
    expect(lightAt([1, 0.5, 0], 20)).toBe(0.5);
    expect(lightAt([1, 0.5, 0], 40)).toBe(0);
    expect(lightAt([1, 0.5, 0], 400)).toBe(0);
    expect(lightAt([1, 0.5, 0], -5)).toBe(1);
    // without one: a light that falls
    expect(lightAt(undefined, 0)).toBe(1);
    expect(lightAt(undefined, 100)).toBeLessThan(0.6);
    expect(lightAt(undefined, LAYER_BURST_MS)).toBe(0);
  });

  it('is its sheet\'s first frame at the hit: every layer whole, where it was drawn', () => {
    const at0 = burstPoses(0, SPEC);
    for (const p of at0) {
      expect([p.scale, p.angle, p.cut], `cell ${p.cell}`).toEqual([1, 0, 0]);
      if (p.cell !== SPARKS) expect(p.push, `cell ${p.cell}`).toBe(0);
    }
    expect(of(at0, SHAPE)[0].gain).toBe(1);
    expect(of(at0, CORE)[0].gain).toBe(1);
    expect(of(at0, SPARKS)[0].gain).toBe(1);
    // the late sparkles are not there yet
    expect(of(at0, LATE)[0].gain).toBe(0);
  });

  it('goes as its sheet went: the shape thins as its light falls, spreads, and is gone with it; the core goes before it', () => {
    let cut = 0;
    for (let ms = 0; ms < LAYER_BURST_MS; ms += 10) {
      const shape = of(burstPoses(ms, SPEC), SHAPE)[0];
      expect(shape.cut, `${ms} ms`).toBeGreaterThanOrEqual(cut);
      cut = shape.cut;
    }
    const late = burstPoses(140, SPEC);
    expect(of(late, SHAPE)[0].scale).toBeGreaterThan(1);
    expect(of(late, SHAPE)[0].push).toBeGreaterThan(0);
    expect(of(late, SPARKS)[0].push).toBeGreaterThan(of(late, SHAPE)[0].push);
    expect(of(late, LATE)[0].gain).toBeGreaterThan(0.5);
    // past its light's end the shape is gone, and the core sooner
    expect(of(burstPoses(150, SPEC), SHAPE)[0].gain).toBe(0);
    expect(of(burstPoses(60, SPEC), CORE)[0].gain).toBe(0);
    // whatever the sheet said, the white middle is gone two thirds in
    expect(of(burstPoses(230, { ...SPEC, core: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0] }), CORE)[0].gain).toBe(0);
  });

  it('moves a little on every frame, never jumping', () => {
    for (const spec of [SPEC, { ...SPEC, body: true, late: false }, { cols: 3, rows: 2 }]) {
      for (let ms = 0; ms < LAYER_BURST_MS; ms++) {
        const [a, b] = [burstPoses(ms, spec), burstPoses(ms + 1, spec)];
        a.forEach((p, i) => {
          for (const key of ['scale', 'angle', 'push', 'gain', 'cut'] as const) expect(Math.abs(b[i][key] - p[key]), `${ms} ms cell ${p.cell} ${key}`).toBeLessThan(0.1);
        });
      }
    }
  });

  it('has a body that parts into spokes, or late sparkles, as its atlas has; slices grow sideways only', () => {
    expect(of(burstPoses(50, { ...SPEC, body: true, late: false }), BODY)).toHaveLength(1);
    expect(burstPoses(50, { cols: 3, rows: 2 }).map((p) => p.cell).sort()).toEqual([CORE, SHAPE, SPARKS, GLOW].sort());
    for (const poses of [burstPoses(0, SPEC), burstPoses(0, { ...SPEC, body: true })]) expect(poses.length).toBeLessThanOrEqual(SLOTS);
    const wide = of(burstPoses(200, { ...SPEC, axis: 'x' }), SHAPE)[0];
    expect(wide.scale).toBeGreaterThan(1);
    expect(wide.scale * (wide.stretch ?? 1)).toBeCloseTo(1, 9);
  });
});

describe('the light of a held long note drawn from layers', () => {
  it('turns, or where it must not (a flame, slices) stands and flickers in its order', () => {
    const turning = { cols: 3, rows: 2, turn: 0.9 };
    expect(of(holdPoses(1000, turning), SHAPE)[0].angle).toBeCloseTo(0.9, 9);
    expect(of(holdPoses(1000, turning), SHAPE)[0].cut).toBe(0);
    const still = { cols: 3, rows: 2, turn: 0 };
    for (const ms of [0, 333, 1000, 2500]) {
      const shape = of(holdPoses(ms, still), SHAPE)[0];
      expect(shape.angle).toBe(0);
      expect(shape.cut).toBeGreaterThan(0);
    }
    expect(holdPoses(0, { ...turning, body: true }).length).toBeLessThanOrEqual(SLOTS);
  });

  it('loops with no seam: what shows moves a little on every frame', () => {
    for (const spec of [
      { cols: 3, rows: 2, turn: 0.9 },
      { cols: 3, rows: 2, turn: 0, axis: 'x' as const },
    ]) {
      for (let ms = 0; ms < 3000; ms += 1) {
        const [a, b] = [holdPoses(ms, spec), holdPoses(ms + 1, spec)];
        a.forEach((p, i) => {
          expect(Math.abs(b[i].gain - p.gain), `${ms} ms cell ${p.cell} gain`).toBeLessThan(0.02);
          // (a wave of specks starts over from the middle where it is out of sight)
          if (Math.min(p.gain, b[i].gain) > 0.05) for (const key of ['scale', 'angle', 'push', 'cut'] as const) expect(Math.abs(b[i][key] - p[key]), `${ms} ms cell ${p.cell} ${key}`).toBeLessThan(0.02);
        });
      }
    }
  });
});

describe('a layered quad\'s numbers', () => {
  it('picks each layer\'s cell, row by row from the top left, and draws none past them', () => {
    const u = layerUniforms({ cols: 3, rows: 2 });
    setPoses(u, [{ cell: GLOW, scale: 1.5, angle: 0.1, push: 0.2, gain: 0.8, cut: 0.3, order: 2, stretch: 0.5 }], 0.5);
    expect(u.cells[0].toArray()).toEqual([0, 0, 1 / 3, 0.5]);
    expect(u.poses[0].toArray()).toEqual([1.5, 0.1, 0.2, 0.4]);
    expect(u.cuts[0].toArray()).toEqual([0.3, 0.5, 2, 0]);
    for (let i = 1; i < SLOTS; i++) expect(u.poses[i].w).toBe(0);
    // the ORDER cell: the middle of the bottom row
    expect(u.orderCell.toArray()).toEqual([1 / 3, 0, 1 / 3, 0.5]);
    setPoses(u, [{ cell: CORE, scale: 1, angle: 0, push: 0, gain: 1, cut: 0 }]);
    expect(u.cells[0].toArray()).toEqual([0, 0.5, 1 / 3, 0.5]);
  });
});
