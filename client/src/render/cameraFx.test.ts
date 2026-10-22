import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cameraConfig } from '../engine/config';
import type { ChartEffect, ChartTiming } from '../engine/types';
import { CameraFx, MAX_TILT_DEG, ZOOM_DEPTH } from './cameraFx';
import { cameraPose, JUDGE_LINE_Y } from './layout';
import { baseFrame, frameCamera, PlaneCamera, poseCamera, type TrackCamera } from './TrackRenderer';

const timing: ChartTiming = { offsetMs: 0, tempoMap: [{ beat: 0, bpm: 120 }], meter: [] }; // 500 ms per beat
const effects: ChartEffect[] = [
  { beat: 8, t: 4000, type: 'zoom', value: 1, durationBeats: 2 },
  { beat: 8, t: 4000, type: 'tilt', value: 1, durationBeats: 2 },
  { beat: 24, t: 12000, type: 'tilt', value: 0, durationBeats: 2 },
];
const deg = (rad: number) => (rad * 180) / Math.PI;

describe('CameraFx', () => {
  it('eases the tilt in, holds it and eases it back', () => {
    const fx = new CameraFx(effects, timing, 1);
    expect(fx.at(3000).roll).toBe(0);
    expect(deg(fx.at(4500).roll)).toBeCloseTo(MAX_TILT_DEG / 2, 6); // halfway through a smoothstep
    expect(deg(fx.at(5000).roll)).toBeCloseTo(MAX_TILT_DEG, 6);
    expect(deg(fx.at(9000).roll)).toBeCloseTo(MAX_TILT_DEG, 6);
    expect(deg(fx.at(12500).roll)).toBeCloseTo(MAX_TILT_DEG / 2, 6);
    expect(fx.at(14000).roll).toBeCloseTo(0, 9);
  });

  it('pulses the zoom and lets it decay', () => {
    const fx = new CameraFx(effects, timing, 1);
    expect(fx.at(3999).fovScale).toBe(1);
    expect(fx.at(4000).fovScale).toBeCloseTo(1 - ZOOM_DEPTH, 9);
    expect(fx.at(4500).fovScale).toBeCloseTo(1 - ZOOM_DEPTH * 0.25, 9);
    expect(fx.at(5000).fovScale).toBe(1);
  });

  it('scales with the strength setting and turns off at zero', () => {
    expect(deg(new CameraFx(effects, timing, 0.5).at(6000).roll)).toBeCloseTo(MAX_TILT_DEG / 2, 6);
    const off = new CameraFx(effects, timing, 0);
    expect(off.enabled).toBe(false);
    expect(off.at(6000)).toEqual({ roll: 0, fovScale: 1 });
    expect(new CameraFx([], timing, 1).enabled).toBe(false);
  });

  it('names its peak toward the screen\'s top left: the deepest counter-clockwise tilt and zoom together', () => {
    const cues: ChartEffect[] = [
      { beat: 4, t: 2000, type: 'tilt', value: -0.8, durationBeats: 2 },
      { beat: 8, t: 4000, type: 'zoom', value: 0.5, durationBeats: 1 },
      { beat: 12, t: 6000, type: 'tilt', value: 0.9, durationBeats: 2 },
      { beat: 16, t: 8000, type: 'zoom', value: 0.25, durationBeats: 1 },
    ];
    const peak = new CameraFx(cues, timing, 0.6).peak();
    expect(deg(peak.roll)).toBeCloseTo(-0.8 * MAX_TILT_DEG * 0.6, 9);
    expect(peak.fovScale).toBeCloseTo(1 - ZOOM_DEPTH * 0.6 * 0.5, 9);
    // no frame of the play goes past it
    const fx = new CameraFx(cues, timing, 0.6);
    for (let t = 0; t < 10000; t += 50) {
      expect(fx.at(t).roll).toBeGreaterThanOrEqual(peak.roll - 1e-12);
      expect(fx.at(t).fovScale).toBeGreaterThanOrEqual(peak.fovScale - 1e-12);
    }
    // a chart that only tilts clockwise never turns the track toward the plate
    expect(new CameraFx(effects, timing, 1).peak().roll).toBe(0);
    expect(new CameraFx(cues, timing, 0).peak()).toEqual({ roll: 0, fovScale: 1 });
  });
});

describe('the camera framed for the judge line', () => {
  const [W, H] = [1920, 1080];
  /** A preset's camera framed with a chart's zoom and roll (the renderer's frameView). */
  function framed(id: string, fovScale: number, roll: number, lineZ = 0): TrackCamera {
    const pose = cameraPose(cameraConfig.presets[id]);
    const camera = poseCamera(pose, W / H);
    frameCamera(camera, pose.fov, fovScale, roll, W, H, lineZ);
    return camera;
  }
  const px = (camera: THREE.Camera, x: number, z: number) => {
    const v = new THREE.Vector3(x, 0, z).project(camera);
    return new THREE.Vector2(((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H);
  };

  it('keeps the judge line in its place through a zoom and a roll, turning the track about its middle', () => {
    const half = cameraConfig.trackWidth / 2;
    const roll = (MAX_TILT_DEG * Math.PI) / 180;
    for (const id of Object.keys(cameraConfig.presets)) {
      const still = framed(id, 1, 0);
      expect(px(still, 0, 0).y).toBeCloseTo(JUDGE_LINE_Y * H, 3);
      const moved = framed(id, 1 - ZOOM_DEPTH, roll);
      const centre = px(moved, 0, 0);
      expect(centre.x).toBeCloseTo(W / 2, 3);
      expect(centre.y).toBeCloseTo(JUDGE_LINE_Y * H, 3);
      // the line's ends turned about its middle, about as far as the roll
      const [left, right] = [px(moved, -half, 0), px(moved, half, 0)];
      expect(left.distanceTo(centre) / right.distanceTo(centre)).toBeCloseTo(1, 1);
      expect(Math.abs(Math.atan2(right.y - left.y, right.x - left.x))).toBeCloseTo(roll, 1);
      // while the track itself moved: the zoom is still there
      expect(px(moved, 0, -cameraConfig.trackLength).distanceTo(px(still, 0, -cameraConfig.trackLength))).toBeGreaterThan(5);
    }
  });

  it('keeps a lifted judge line where LIFT put it', () => {
    for (const id of ['SDVX', 'PLANE']) {
      const still = framed(id, 1, 0, -6);
      const moved = framed(id, 1 - ZOOM_DEPTH, 0.07, -6);
      expect(px(moved, 0, -6).distanceTo(px(still, 0, -6))).toBeLessThan(0.01);
    }
  });

  it('zooms and turns the plane camera\'s track as a picture: the rails stay parallel, the notes at one speed', () => {
    const [half, L] = [cameraConfig.trackWidth / 2, cameraConfig.trackLength];
    const roll = (MAX_TILT_DEG * Math.PI) / 180;
    for (const lineZ of [0, -6]) {
      const still = framed('PLANE', 1, 0, lineZ);
      const moved = framed('PLANE', 1 - ZOOM_DEPTH, roll, lineZ);
      expect(moved).toBeInstanceOf(PlaneCamera);
      const rail = (camera: TrackCamera, x: number) => px(camera, x, -L).sub(px(camera, x, lineZ));
      // each rail turned by the roll exactly (clockwise on the screen, as the perspective cameras turn), and as long as the other
      expect(rail(moved, -half).angle() - rail(still, -half).angle()).toBeCloseTo(roll, 9);
      const line = (camera: TrackCamera) => px(camera, half, lineZ).sub(px(camera, -half, lineZ)).angle();
      expect(Math.sign(line(moved))).toBe(Math.sign(line(framed('SDVX', 1 - ZOOM_DEPTH, roll, lineZ))));
      expect(rail(moved, half).distanceTo(rail(moved, -half))).toBeLessThan(1e-6);
      // the picture grown about the line's middle by what the narrower field of view gives a perspective camera
      const grow = Math.tan(THREE.MathUtils.degToRad(cameraConfig.presets.PLANE.fov) / 2) / Math.tan(THREE.MathUtils.degToRad(cameraConfig.presets.PLANE.fov * (1 - ZOOM_DEPTH)) / 2);
      expect(rail(moved, half).length() / rail(still, half).length()).toBeCloseTo(grow, 9);
      expect(px(moved, -half, lineZ).distanceTo(px(moved, half, lineZ)) / px(still, -half, lineZ).distanceTo(px(still, half, lineZ))).toBeCloseTo(grow, 9);
      // the notes as fast at the far end as at the line
      const step = (z: number) => px(moved, 0, z - 1).distanceTo(px(moved, 0, z));
      expect(step(-L + 1) / step(lineZ)).toBeCloseTo(1, 9);
    }
  });

  it('frames every step of a zoom pulse from the framing it keeps as it would afresh', () => {
    for (const id of ['PLANE', 'SDVX']) {
      const pose = cameraPose(cameraConfig.presets[id]);
      const camera = poseCamera(pose, W / H);
      const base = baseFrame(camera, pose.fov, -6);
      for (const [fovScale, roll] of [[0.97, 0], [1 - ZOOM_DEPTH, 0.05], [0.99, -0.02], [1, 0]]) {
        // the renderer puts the camera back in its pose before each frame (the plane camera's roll moves it)
        camera.position.set(...pose.position);
        camera.lookAt(new THREE.Vector3(...pose.target));
        camera.updateMatrixWorld();
        frameCamera(camera, pose.fov, fovScale, roll, W, H, -6, base);
        const fresh = framed(id, fovScale, roll, -6);
        for (const [x, z] of [[0, -6], [4, 0], [-4, -40]]) expect(px(camera, x, z).distanceTo(px(fresh, x, z))).toBeLessThan(1e-6);
      }
    }
  });
});
