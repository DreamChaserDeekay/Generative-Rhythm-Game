import { describe, expect, it } from 'vitest';
import { gaugeCells, gaugeShown, planeMatrix, planePoint, planeScale, planeYAt, stretchFor, uprightAt } from './Hud';

/** Where a homography (row-major 3×3) puts a plane point on the screen. */
const project = (h: number[], x: number, y: number) => {
  const w = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
};

describe('HUD lying on the track', () => {
  it('writes the plane homography as a CSS matrix3d (column-major, depth passed through)', () => {
    expect(planeMatrix([1, 0, 0, 0, 1, 0, 0, 0, 1])).toBe('matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)');
    // a move by (5, 7) is the fourth column
    expect(planeMatrix([1, 0, 5, 0, 1, 7, 0, 0, 1])).toBe('matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,5,7,0,1)');
    // perspective (w changing across the plane) sits in the fourth row
    expect(planeMatrix([2, 0, 640, 0, 2, 360, 0, 0.004, 1])).toBe('matrix3d(2,0,0,0,0,2,0,0.004,0,0,1,0,640,360,0,1)');
  });

  it('measures how large and how flattened the plane looks where text lies', () => {
    // squashed along y: twice as wide, a quarter as tall for its width
    expect(planeScale([2, 0, 0, 0, 0.5, 0, 0, 0, 1], 30, -40)).toEqual({ scale: 2, aspect: 0.25 });
    // a camera looking down a track centred on x = 640: up the track (y < 0) is farther away
    const k = -0.002;
    const h = [1, 640 * k, 640, 0, 0.5 + 600 * k, 600, 0, k, 1];
    expect(project(h, 0, -300)[0]).toBeCloseTo(640, 9);
    for (const [x, y] of [
      [0, 0],
      [0, -300],
      [150, -120],
    ]) {
      // the same as a small square's projection, measured
      const e = 1e-4;
      const [ax, ay] = project(h, x, y);
      const [bx, by] = project(h, x + e, y);
      const [cx, cy] = project(h, x, y + e);
      const across = Math.hypot(bx - ax, by - ay) / e;
      const along = Math.hypot(cx - ax, cy - ay) / e;
      const got = planeScale(h, x, y);
      expect(got.scale).toBeCloseTo(across, 4);
      expect(got.aspect).toBeCloseTo(along / across, 4);
    }
    expect(planeScale(h, 0, -300).scale).toBeLessThan(planeScale(h, 0, 0).scale);
  });

  it('shows the gauge rounded down: 79.9 % is 79 % and not yet the clear line, 80 % reaches it', () => {
    expect(gaugeShown(79.9, false)).toBe(79);
    expect(gaugeCells(gaugeShown(79.9, false))).toBe(31);
    expect(gaugeShown(80, false)).toBe(80);
    expect(gaugeCells(80)).toBe(32);
    expect(gaugeCells(100)).toBe(40);
    expect(gaugeShown(0.4, false)).toBe(0);
    expect(gaugeShown(130, false)).toBe(100);
    // a survival gauge still alive never reads 0 %
    expect(gaugeShown(0.4, true)).toBe(1);
    expect(gaugeShown(0, true)).toBe(0);
  });

  it('stands side text upright: as tall as it is wide on the screen, by the screen\'s vertical alone', () => {
    // an even plane: no stretch, one plane px per screen px over the scale
    expect(uprightAt([2, 0, 0, 0, 2, 0, 0, 0, 1], 10, -10)).toEqual({ k: 0.5, stretch: 1 });
    // squashed to a quarter along y: four times longer, the same size across
    expect(uprightAt([2, 0, 0, 0, 0.5, 0, 0, 0, 1], 10, -10)).toEqual({ k: 0.5, stretch: 4 });
    // flatter than four times makes up for: sized by its height, so wider (k for 2 × 0.1 × 4 = 0.8)
    const flat = uprightAt([2, 0, 0, 0, 0.2, 0, 0, 0, 1], 10, -10);
    expect(flat.stretch).toBe(4);
    expect(flat.k).toBeCloseTo(1.25, 9);
    // lines up the track leaning toward the vanishing point slant the text but do not make it taller:
    // 0.5 down the screen per plane px (and 0.5 across), so twice as long, not 1.41 times
    expect(uprightAt([1, 0.5, 0, 0, 0.5, 0, 0, 0, 1], 0, -10)).toEqual({ k: 1, stretch: 2 });
  });

  it('finds where a line up the plane crosses a row of the screen', () => {
    const k = -0.002;
    const h = [1, 640 * k, 640, 0, 0.5 + 600 * k, 600, 0, k, 1];
    for (const [x, y] of [
      [-350, 0],
      [-350, -240],
      [120, -600],
    ]) {
      const [, sy] = planePoint(h, x, y);
      expect(planeYAt(h, x, sy)).toBeCloseTo(y, 6);
    }
  });

  it('draws text longer along the track where the camera flattens it, up to 2.6 times', () => {
    expect(stretchFor(1, 0.7)).toBe(1);
    expect(stretchFor(0.35, 0.7)).toBeCloseTo(2, 9);
    expect(stretchFor(0.1, 0.7)).toBe(2.6);
    expect(stretchFor(0.2, 0.7, 1.8)).toBe(1.8);
  });
});
