import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cameraConfig, keyModes } from '../engine/config';
import { ScrollModel } from '../engine/scroll';
import { visibleTimeMs } from '../settings/settings';
import { cameraPose, computeTrackGeometry, fogStartZ, JUDGE_LINE_Y, noteSpan } from './layout';
import { keyRow } from './TrackRenderer';

function presetCamera(presetId: string, aspect: number): THREE.PerspectiveCamera {
  const pose = cameraPose(cameraConfig.presets[presetId]);
  const camera = new THREE.PerspectiveCamera(pose.fov, aspect, 0.1, 500);
  camera.position.set(...pose.position);
  camera.lookAt(new THREE.Vector3(...pose.target));
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

function screenY(presetId: string, z: number, aspect = 16 / 9): number {
  const v = new THREE.Vector3(0, 0, z).project(presetCamera(presetId, aspect));
  return (1 - v.y) / 2; // 0 = top, 1 = bottom
}

/** Share of the screen's width between x = ±half at `z`. */
function screenWidth(presetId: string, half: number, z: number, aspect = 16 / 9): number {
  const camera = presetCamera(presetId, aspect);
  return (new THREE.Vector3(half, 0, z).project(camera).x - new THREE.Vector3(-half, 0, z).project(camera).x) / 2;
}

describe('track layout', () => {
  it('splits the track width by lane width ratios (scratch is wider)', () => {
    const g = computeTrackGeometry(keyModes['7K+1S'], 8, 40);
    const total = g.lanes.reduce((s, l) => s + l.width, 0);
    expect(total).toBeCloseTo(8, 9);
    expect(g.lanes[0].width / g.lanes[1].width).toBeCloseTo(1.6, 9);
    expect(g.lanes[0].x - g.lanes[0].width / 2).toBeCloseTo(-4, 9);
    expect(g.lanes[7].x + g.lanes[7].width / 2).toBeCloseTo(4, 9);
  });

  it('puts the narrower side tracks on both edges of the FX modes', () => {
    const g = computeTrackGeometry(keyModes['6K+FX'], 8, 40);
    expect(g.lanes.map((l) => l.kind)).toEqual(['side', 'key', 'key', 'key', 'key', 'key', 'key', 'side']);
    expect(g.lanes[0].width / g.lanes[1].width).toBeCloseTo(0.75, 9);
    expect(g.lanes[0].x).toBeCloseTo(-g.lanes[7].x, 9);
    expect(g.lanes.reduce((s, l) => s + l.width, 0)).toBeCloseTo(8, 9);
  });

  it('frames the SDVX preset with the judgement line low and the track end high on screen', () => {
    const L = cameraConfig.trackLength;
    expect(screenY('SDVX', 0)).toBeCloseTo(0.84, 2);
    expect(screenY('SDVX', -L)).toBeCloseTo(0.12, 2);
    for (const id of Object.keys(cameraConfig.presets)) {
      const near = screenY(id, 0);
      const far = screenY(id, -L);
      expect(near).toBeLessThan(0.95);
      expect(far).toBeGreaterThan(0);
      expect(far).toBeLessThan(near);
    }
  });

  it('moves the view up so the judge line leaves the gear room under it, the whole track still on the screen', () => {
    expect(JUDGE_LINE_Y).toBeGreaterThan(0.7);
    expect(JUDGE_LINE_Y).toBeLessThan(0.84);
    const farEnd = (id: string) => {
      // moving the view shifts the whole picture by the same amount
      const shift = screenY(id, 0) - JUDGE_LINE_Y;
      return screenY(id, -cameraConfig.trackLength) - shift;
    };
    // every note comes into view at the far end: none of its travel happens above the screen
    for (const id of Object.keys(cameraConfig.presets)) expect(farEnd(id)).toBeGreaterThan(0.02);
    for (const id of ['PLANE', 'FLAT', 'SDVX']) {
      expect(farEnd(id)).toBeGreaterThan(0.035);
      expect(farEnd(id)).toBeLessThan(0.06);
    }
  });

  it('has a plane camera: the far end nearly as wide as the judge line, notes at an even speed down the screen', () => {
    const L = cameraConfig.trackLength;
    const half = cameraConfig.trackWidth / 2;
    expect(cameraConfig.default).toBe('SDVX');
    for (const aspect of [16 / 9, 4 / 3, 21 / 9]) {
      expect(screenWidth('PLANE', half, -L, aspect) / screenWidth('PLANE', half, 0, aspect)).toBeGreaterThan(0.85);
      // screen distance per track unit at the far end against the judge line's
      const speed = (z: number) => screenY('PLANE', z, aspect) - screenY('PLANE', z - 0.5, aspect);
      expect(speed(-L + 0.5) / speed(0)).toBeGreaterThan(0.75);
      // the later half of the travel time has about half the lane's height (SDVX gives it a fifth)
      const share = (screenY('PLANE', -L / 2, aspect) - screenY('PLANE', -L, aspect)) / (screenY('PLANE', 0, aspect) - screenY('PLANE', -L, aspect));
      expect(share).toBeGreaterThan(0.45);
    }
    // the farthest point stays well inside the camera's far plane
    const pose = cameraPose(cameraConfig.presets.PLANE);
    expect(new THREE.Vector3(...pose.position).distanceTo(new THREE.Vector3(0, 0, -L))).toBeLessThan(450);
  });

  it('lines a long note up with taps at its start and end, at any speed and note depth', () => {
    const timing = { offsetMs: 0, tempoMap: [{ beat: 0, bpm: 150 }], meter: [] };
    const [L, T, E] = [40, 1000, 1600];
    for (const hiSpeed of [2, 4, 8]) {
      const visibleMs = visibleTimeMs(hiSpeed);
      const scroll = new ScrollModel({ trackLength: L, visibleMs, lift: 0, mode: 'time', timing, rate: 1, durationMs: 60_000 });
      const line = scroll.judgeZ;
      for (const depth of [0.7, 0.7 * (30 / 51.5), 0.7 * 1.5]) {
        // half a note in ms: a note crosses the track's length in the visible time
        const half = ((depth / 2) * visibleMs) / L;
        const tap = (t: number, now: number) => noteSpan(scroll.z(t, now), depth);
        const long = (now: number) => noteSpan(scroll.z(T, now), depth, scroll.z(E, now));
        // a tap is centred on its time: its near edge reaches the line half a note early, its far edge leaves half a note late
        expect(tap(T, T - half).near).toBeCloseTo(line, 9);
        expect((tap(T, T).near + tap(T, T).far) / 2).toBeCloseTo(line, 9);
        expect(tap(T, T + half).far).toBeCloseTo(line, 9);
        // a long note's near edge reaches the line with the tap at its start, its far edge leaves it with the tap at its end
        expect(long(T - half).near).toBeCloseTo(line, 9);
        expect(long(E + half).far).toBeCloseTo(line, 9);
        // as long as its time on the track plus a note
        for (const now of [0, 640, T]) expect(long(now).near - long(now).far).toBeCloseTo(((E - T) * L) / visibleMs + depth, 9);
        // held, the body starts at the judge line and still ends where the tap at its end does
        const held = noteSpan(scroll.z(T, 1200), depth, scroll.z(E, 1200), line);
        expect(held.near).toBe(line);
        expect(held.far).toBeCloseTo(tap(E, 1200).far, 9);
      }
      // at SPEED 4 a skin's usual note is about 11 ms off its time at either edge (what a chord was off by)
      if (hiSpeed === 4) expect((0.35 * visibleMs) / L).toBeCloseTo(10.9, 1);
    }
  });

  it('fogs about as much of the lane on the screen on the plane camera as on SDVX', () => {
    const L = cameraConfig.trackLength;
    const share = (id: string) => {
      const start = fogStartZ(cameraConfig.presets[id], L);
      return (screenY(id, start) - screenY(id, -L)) / (screenY(id, 0) - screenY(id, -L));
    };
    expect(share('SDVX')).toBeGreaterThan(0.15);
    expect(share('SDVX')).toBeLessThan(0.2);
    expect(Math.abs(share('PLANE') - share('SDVX'))).toBeLessThan(0.03);
    // the perspective cameras keep their fog where it was, 55 % of the way up
    for (const id of ['FLAT', 'SDVX', 'LOW']) expect(fogStartZ(cameraConfig.presets[id], L)).toBeCloseTo(-0.55 * L, 9);
  });

  it('keeps the round lane lights under the line round and as large on the plane camera', () => {
    const [W, H] = [1600, 900];
    /** How much longer along the track than across it a round light must be drawn at `z` (the renderer's 0.85 / trackAspect). */
    const flatten = (id: string, z = 0.5) => {
      const camera = presetCamera(id, W / H);
      const px = (x: number, zz: number) => new THREE.Vector3(x, 0, zz).project(camera);
      const across = (px(0.25, z).x - px(-0.25, z).x) * (W / 2);
      const along = (px(0, z + 0.25).y - px(0, z - 0.25).y) * (H / 2);
      return 0.85 / (Math.abs(along) / across);
    };
    // the perspective cameras keep their row as it was
    for (const id of ['FLAT', 'SDVX', 'LOW']) {
      const f = flatten(id);
      expect(f).toBeLessThan(1.3);
      expect(keyRow(72, f)).toEqual({ depth: 72, stretch: Math.round(Math.max(1, f) * 20) / 20 });
      expect(keyRow(40, f).depth).toBe(40);
    }
    const f = flatten('PLANE');
    expect(f).toBeGreaterThan(2.5);
    const plane = keyRow(72, f);
    // drawn round on the screen ...
    expect(plane.stretch).toBeCloseTo(f, 1);
    // ... and as large: a row holds a light this long along it for its width (see deckArt's radius)
    const sdvx = keyRow(72, flatten('SDVX'));
    expect(plane.depth / plane.stretch).toBeGreaterThan((sdvx.depth / sdvx.stretch) * 0.95);
  });
});
