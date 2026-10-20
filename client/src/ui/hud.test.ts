import { describe, expect, it } from 'vitest';
import { planeMatrix, planeScale, stretchFor } from './Hud';

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

  it('draws text longer along the track where the camera flattens it, up to 2.6 times', () => {
    expect(stretchFor(1, 0.7)).toBe(1);
    expect(stretchFor(0.35, 0.7)).toBeCloseTo(2, 9);
    expect(stretchFor(0.1, 0.7)).toBe(2.6);
    expect(stretchFor(0.2, 0.7, 1.8)).toBe(1.8);
  });
});
