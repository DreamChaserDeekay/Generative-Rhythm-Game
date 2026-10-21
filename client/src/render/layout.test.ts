import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cameraConfig, keyModes } from '../engine/config';
import { ScrollModel } from '../engine/scroll';
import { visibleTimeMs } from '../settings/settings';
import { cameraPose, computeTrackGeometry, fogStartZ, JUDGE_LINE_Y, noteSpan } from './layout';
import { FIT_TRACK_END_Y, fitFov, frameCamera, keyRow, PlaneCamera, poseCamera, type TrackCamera } from './TrackRenderer';

function presetCamera(presetId: string, aspect: number): TrackCamera {
  return poseCamera(cameraPose(cameraConfig.presets[presetId]), aspect);
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

  it('has a plane camera: the rails parallel, the notes at one speed all the way down the screen', () => {
    const L = cameraConfig.trackLength;
    const half = cameraConfig.trackWidth / 2;
    expect(cameraConfig.default).toBe('SDVX');
    expect(presetCamera('PLANE', 16 / 9)).toBeInstanceOf(PlaneCamera);
    for (const id of ['FLAT', 'SDVX', 'LOW']) expect(presetCamera(id, 16 / 9)).toBeInstanceOf(THREE.PerspectiveCamera);
    // its lanes as wide at the judge line as when it was a perspective camera: 397.8 px of 1280x720
    expect(Math.abs(screenWidth('PLANE', half, 0) * 1280 - 397.8)).toBeLessThan(0.5);
    for (const aspect of [16 / 9, 4 / 3, 21 / 9]) {
      // the far end as wide as the judge line (within a millionth of a px on a 2560 px wide screen)
      expect(screenWidth('PLANE', half, -L, aspect) - screenWidth('PLANE', half, 0, aspect)).toBeCloseTo(0, 9);
      // the same screen distance per track unit anywhere on it
      const speed = (z: number) => screenY('PLANE', z, aspect) - screenY('PLANE', z - 0.5, aspect);
      expect(speed(-L + 0.5) / speed(0)).toBeCloseTo(1, 9);
      expect(speed(-L / 2) / speed(0)).toBeCloseTo(1, 9);
      // the later half of the travel time has half the lane's height (SDVX gives it a fifth)
      const share = (screenY('PLANE', -L / 2, aspect) - screenY('PLANE', -L, aspect)) / (screenY('PLANE', 0, aspect) - screenY('PLANE', -L, aspect));
      expect(share).toBeCloseTo(0.5, 9);
    }
  });

  it('makes a plane camera whose projection is whole from the start', () => {
    const camera = new PlaneCamera(2, 16 / 9, 300);
    expect(camera.projectionMatrix.elements.every(Number.isFinite)).toBe(true);
    // as high as a perspective camera with that field of view sees 300 away, and as wide for the aspect
    expect(camera.top).toBeCloseTo(300 * Math.tan(THREE.MathUtils.degToRad(1)), 12);
    camera.aspect = 2;
    camera.fov = 4;
    camera.updateProjectionMatrix();
    expect(camera.right / camera.top).toBeCloseTo(2, 12);
    expect(camera.top).toBeCloseTo(300 * Math.tan(THREE.MathUtils.degToRad(2)), 12);
    // a copy keeps its depth and lens: set afresh, its view is the same
    const copy = camera.clone();
    expect(copy).toBeInstanceOf(PlaneCamera);
    expect(copy.depth).toBe(300);
    copy.aspect = 2;
    copy.updateProjectionMatrix();
    expect(copy.projectionMatrix.elements.every(Number.isFinite)).toBe(true);
    expect(copy.projectionMatrix.equals(camera.projectionMatrix)).toBe(true);
    expect(new PlaneCamera().projectionMatrix.elements.every(Number.isFinite)).toBe(true);
  });

  it('fits a preview\'s track to its box with either camera: the line 0.84 of the width, or the far end at the top', () => {
    const geometry = computeTrackGeometry(keyModes['7K+1S'], cameraConfig.trackWidth, cameraConfig.trackLength);
    const half = geometry.width / 2;
    for (const id of ['PLANE', 'SDVX']) {
      for (const [W, H] of [
        [520, 600],
        [900, 420],
        [300, 620],
      ]) {
        const camera = presetCamera(id, W / H);
        const fov = fitFov(camera, geometry, 0.84);
        frameCamera(camera, fov, 1, 0, W, H);
        const at = (x: number, z: number) => new THREE.Vector3(x, 0, z).project(camera);
        const width = (at(half, 0).x - at(-half, 0).x) / 2;
        const end = (1 - at(0, -geometry.length).y) / 2;
        expect((1 - at(0, 0).y) / 2).toBeCloseTo(JUDGE_LINE_Y, 9);
        // neither goes past its mark, and one of them is on it
        expect(width).toBeLessThan(0.84 + 1e-9);
        expect(end).toBeGreaterThan(FIT_TRACK_END_Y - 1e-9);
        expect(Math.min(0.84 - width, end - FIT_TRACK_END_Y)).toBeCloseTo(0, 9);
      }
    }
  });

  it('tilts the plane camera as the eye it stands in for does at its target', () => {
    // the track's length looks shortened by the sine of the angle the camera looks down at, as a
    // perspective camera in the same pose shows it where it looks (and a little more or less nearer or farther)
    const preset = cameraConfig.presets.PLANE;
    const pose = cameraPose(preset);
    const down = Math.atan2(preset.height, preset.distance + preset.lookAhead);
    const camera = presetCamera('PLANE', 1);
    const px = (x: number, z: number) => new THREE.Vector3(x, 0, z).project(camera);
    const [near, far, left, right] = [px(0, 0), px(0, -1), px(-0.5, 0), px(0.5, 0)];
    expect((far.y - near.y) / (right.x - left.x)).toBeCloseTo(Math.sin(down), 9);
    const eye = new THREE.PerspectiveCamera(pose.fov, 1);
    eye.position.set(...pose.position);
    eye.lookAt(new THREE.Vector3(...pose.target));
    eye.updateMatrixWorld();
    const seen = (x: number, z: number) => new THREE.Vector3(x, 0, z).project(eye);
    const at = (z: number) => (seen(0, z - 0.5).y - seen(0, z + 0.5).y) / (seen(0.5, z).x - seen(-0.5, z).x);
    expect(at(-preset.lookAhead)).toBeCloseTo(Math.sin(down), 3);
    expect(at(0)).toBeGreaterThan(Math.sin(down));
    expect(at(-cameraConfig.trackLength)).toBeLessThan(Math.sin(down));
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
    // the plane camera shows every part of the track alike: its fog takes what the track's length leaves it
    expect(share('PLANE')).toBeCloseTo(1 - (cameraConfig.presets.PLANE.fogStart ?? 0), 9);
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
