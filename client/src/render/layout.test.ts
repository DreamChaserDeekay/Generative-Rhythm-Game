import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cameraConfig, keyModes } from '../engine/config';
import { cameraPose, computeTrackGeometry } from './layout';

function screenY(presetId: string, z: number, aspect = 16 / 9): number {
  const pose = cameraPose(cameraConfig.presets[presetId]);
  const camera = new THREE.PerspectiveCamera(pose.fov, aspect, 0.1, 500);
  camera.position.set(...pose.position);
  camera.lookAt(new THREE.Vector3(...pose.target));
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const v = new THREE.Vector3(0, 0, z).project(camera);
  return (1 - v.y) / 2; // 0 = top, 1 = bottom
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
});
