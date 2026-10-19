import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cameraConfig } from '../engine/config';
import { cameraPose } from './layout';
import { BAR_LINE_PX, barLineDepth } from './TrackRenderer';

function poseCamera(presetId: string): THREE.PerspectiveCamera {
  const pose = cameraPose(cameraConfig.presets[presetId]);
  const camera = new THREE.PerspectiveCamera(pose.fov, 16 / 9, 0.1, 500);
  camera.position.set(...pose.position);
  camera.lookAt(new THREE.Vector3(...pose.target));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
}

/** On-screen height (CSS px) of a band on the track floor from z to z - depth. */
function screenHeight(camera: THREE.Camera, z: number, depth: number, cssHeight: number): number {
  const a = new THREE.Vector3(0, 0, z).project(camera);
  const b = new THREE.Vector3(0, 0, z - depth).project(camera);
  return (Math.abs(a.y - b.y) * cssHeight) / 2;
}

describe('bar lines', () => {
  it('keep the same thickness on screen from the judgement line to the far end of the track', () => {
    for (const id of Object.keys(cameraConfig.presets)) {
      const camera = poseCamera(id);
      for (const z of [2, 0, -10, -25, -cameraConfig.trackLength * 0.9]) {
        const depth = barLineDepth(camera, z, 720);
        // the far end compresses so much that a 2-unit band is the cap
        if (depth < 2) expect(screenHeight(camera, z, depth, 720)).toBeCloseTo(BAR_LINE_PX, 0);
      }
      // the same line reaches further up the track than at the judgement line
      expect(barLineDepth(camera, -25, 720)).toBeGreaterThan(barLineDepth(camera, 0, 720));
    }
  });

  it('scale with the canvas height', () => {
    const camera = poseCamera(cameraConfig.default);
    expect(barLineDepth(camera, -5, 1440)).toBeCloseTo(barLineDepth(camera, -5, 720) / 2, 3);
  });
});
