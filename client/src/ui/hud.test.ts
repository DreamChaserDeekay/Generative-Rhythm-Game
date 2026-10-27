import { describe, expect, it } from 'vitest';
import { cameraConfig } from '../engine/config';
import { MAX_TILT_DEG, ZOOM_DEPTH } from '../render/cameraFx';
import { cameraPose } from '../render/layout';
import { frameCamera, HUD_UNIT, planeHomography, poseCamera } from '../render/TrackRenderer';
import { type ErrorBar, errorBarAt, gaugeCells, gaugeShown, infoRoom, markError, planeMatrix, planePoint, planeScale, planeYAt, stretchFor, uprightAt } from './Hud';

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

  it('lays a hit on the error bar by its error over the widest window: early left, late right, past it at the edge', () => {
    // HARD JUDGEMENT: 90 ms each way
    expect(errorBarAt(0, 90)).toBe(0);
    expect(errorBarAt(-45, 90)).toBe(-0.5);
    expect(errorBarAt(90, 90)).toBe(1);
    // past the widest window: held at the edge, never off the bar
    expect(errorBarAt(-130, 90)).toBe(-1);
    expect(errorBarAt(400, 90)).toBe(1);
  });

  it('reuses the error bar\'s 20 ticks in turn, the newest brightest, and means the hits shown, not every hit', () => {
    // stand-ins for the bar's elements: markError only writes the class, transform, opacity and data-mean-ms
    const part = () => ({ className: '', style: { transform: '', opacity: '0' }, dataset: {} }) as unknown as HTMLElement;
    const ticks = Array.from({ length: 20 }, part);
    const bar: ErrorBar = { el: part(), ticks, mean: part(), outerMs: 90, errors: [], next: 0, meanMs: 0, half: 100 };
    // five late hits, then twenty early ones: -25 ms to -6 ms
    const hits = Array.from({ length: 25 }, (_, i) => (i < 5 ? 60 : i - 30));
    markError(bar, hits[0]);
    expect(ticks[0].className).toBe('hud-eb-tick slow');
    expect(ticks[0].style.transform).toBe('translateX(66.67px)');
    expect(ticks[0].style.opacity).toBe('1');
    hits.slice(1, 21).forEach((ms) => markError(bar, ms));
    // the 21st hit (-10 ms) takes the first tick back, early: left of the middle
    expect(ticks[0].className).toBe('hud-eb-tick fast');
    expect(ticks[0].style.transform).toBe('translateX(-11.11px)');
    hits.slice(21).forEach((ms) => markError(bar, ms));
    // the newest (tick 4) is full, the oldest still shown (tick 5) the faintest
    expect(ticks[4].style.opacity).toBe('1');
    expect(ticks[5].style.opacity).toBe('0.24');
    // the mean of the last 20 (-15.5 ms), not of all 25 (-0.4 ms)
    expect(bar.meanMs).toBeCloseTo(-15.5, 9);
    expect(bar.mean.style.transform).toBe('translateX(-17.22px)');
    expect(bar.el.dataset.meanMs).toBe('-15');
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

  it('keeps the song\'s plate clear of the gear\'s left edge on the rows it takes', () => {
    // the plane camera: an even plane, the edge straight down the screen at 640 - 2 * 300
    const flat = [2, 0, 640, 0, 0.5, 600, 0, 0, 1];
    expect(infoRoom(flat, 300, -1100, 16, 16, 40)).toBeCloseTo(24, 9);
    expect(infoRoom(flat, 300, -1100, 16, 16, 90)).toBeCloseTo(24, 9);
    // a perspective camera: the edge leans out toward the camera, so a lower foot leaves less room
    const k = -0.002;
    const h = [1, 640 * k, 640, 0, 0.5 + 600 * k, 600, 0, k, 1];
    const [, row] = planePoint(h, -300, -400);
    expect(infoRoom(h, 300, -1000, 16, row - 40, row)).toBeCloseTo(planePoint(h, -300, -400)[0] - 16, 6);
    expect(infoRoom(h, 300, -1000, 16, row - 40, row + 20)).toBeLessThan(infoRoom(h, 300, -1000, 16, row - 40, row));
    // above the horizon (row 350 here) there is no track to keep clear of
    expect(infoRoom(h, 300, -1000, 16, 300, 340)).toBe(Infinity);
    // the plane camera rolled counter-clockwise about the line's middle (640, 600): the edge leans
    // in toward the top, so the plate's top row is the nearest, or the track's far corner under it
    const [c, sn] = [Math.cos(0.08), Math.sin(0.08)];
    const rolled = [2 * c, 0.5 * sn, 640, -2 * sn, 0.5 * c, 600, 0, 0, 1];
    const edgeAt = (row: number) => planePoint(rolled, -300, planeYAt(rolled, -300, row))[0];
    expect(infoRoom(rolled, 300, -2000, 16, 60, 90)).toBeCloseTo(edgeAt(60) - 16, 9);
    expect(edgeAt(60)).toBeLessThan(edgeAt(90));
    const [cornerX, cornerRow] = planePoint(rolled, -300, -1100);
    expect(cornerRow).toBeGreaterThan(60);
    expect(infoRoom(rolled, 300, -1100, 16, 16, 120)).toBeCloseTo(cornerX - 16, 9);
  });

  it('keeps the plate clear of the plane camera\'s rail at 4:3 all through a chart\'s tilt and zoom, sized at their peak', () => {
    const [W, H] = [1024, 768];
    const pose = cameraPose(cameraConfig.presets.PLANE);
    const plane = (roll: number, fovScale: number) => {
      const camera = poseCamera(pose, W / H);
      frameCamera(camera, pose.fov, fovScale, roll, W, H);
      return planeHomography(camera, W, H, 0);
    };
    // the default strength (0.6) of a chart's deepest tilt (-1) and zoom (1)
    const peak = { roll: (-MAX_TILT_DEG * 0.6 * Math.PI) / 180, fovScale: 1 - ZOOM_DEPTH * 0.6 };
    const [edge, far] = [(cameraConfig.trackWidth / 2) * HUD_UNIT + 6, -cameraConfig.trackLength * HUD_UNIT];
    const [left, top, bottom] = [16, 16, 100];
    const room = infoRoom(plane(peak.roll, peak.fovScale), edge, far, left, top, bottom);
    for (let i = 0; i <= 10; i++) {
      const h = plane((peak.roll * i) / 10, 1 - ((1 - peak.fovScale) * (10 - i)) / 10);
      // every point of the rail on the plate's rows lies right of the plate
      for (let y = 0; y >= far; y -= 5) {
        const [x, row] = planePoint(h, -edge, y);
        if (row >= top && row <= bottom) expect(x).toBeGreaterThanOrEqual(left + room - 1e-6);
      }
    }
    // sized for the camera at rest, the plate would cover the rail by a tilt's 30 px or more
    expect(infoRoom(plane(0, 1), edge, far, left, top, bottom) - room).toBeGreaterThan(30);
  });

  it('draws text longer along the track where the camera flattens it, up to 2.6 times', () => {
    expect(stretchFor(1, 0.7)).toBe(1);
    expect(stretchFor(0.35, 0.7)).toBeCloseTo(2, 9);
    expect(stretchFor(0.1, 0.7)).toBe(2.6);
    expect(stretchFor(0.2, 0.7, 1.8)).toBe(1.8);
  });
});
