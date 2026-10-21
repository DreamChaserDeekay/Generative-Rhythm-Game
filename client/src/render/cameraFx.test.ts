import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cameraConfig } from '../engine/config';
import type { ChartEffect, ChartTiming } from '../engine/types';
import { CameraFx, MAX_TILT_DEG, ZOOM_DEPTH } from './cameraFx';
import { cameraPose, JUDGE_LINE_Y } from './layout';
import { baseFrame, frameCamera } from './TrackRenderer';

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
});

describe('the camera framed for the judge line', () => {
  const [W, H] = [1920, 1080];
  /** A preset's camera framed with a chart's zoom and roll (the renderer's frameView). */
  function framed(id: string, fovScale: number, roll: number, lineZ = 0): THREE.PerspectiveCamera {
    const pose = cameraPose(cameraConfig.presets[id]);
    const camera = new THREE.PerspectiveCamera(pose.fov, W / H, 1, 1000);
    camera.position.set(...pose.position);
    camera.lookAt(new THREE.Vector3(...pose.target));
    camera.updateMatrixWorld();
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
    const still = framed('SDVX', 1, 0, -6);
    const moved = framed('SDVX', 1 - ZOOM_DEPTH, 0.07, -6);
    expect(px(moved, 0, -6).distanceTo(px(still, 0, -6))).toBeLessThan(0.01);
  });

  it('frames every step of a zoom pulse from the framing it keeps as it would afresh', () => {
    for (const id of ['PLANE', 'SDVX']) {
      const pose = cameraPose(cameraConfig.presets[id]);
      const camera = new THREE.PerspectiveCamera(pose.fov, W / H, 1, 1000);
      camera.position.set(...pose.position);
      camera.lookAt(new THREE.Vector3(...pose.target));
      camera.updateMatrixWorld();
      const base = baseFrame(camera, pose.fov, -6);
      for (const [fovScale, roll] of [[0.97, 0], [1 - ZOOM_DEPTH, 0.05], [0.99, -0.02], [1, 0]]) {
        // the renderer turns the camera back to its pose before each frame
        camera.lookAt(new THREE.Vector3(...pose.target));
        camera.updateMatrixWorld();
        frameCamera(camera, pose.fov, fovScale, roll, W, H, -6, base);
        const fresh = framed(id, fovScale, roll, -6);
        for (const [x, z] of [[0, -6], [4, 0], [-4, -40]]) expect(px(camera, x, z).distanceTo(px(fresh, x, z))).toBeLessThan(1e-6);
      }
    }
  });
});
