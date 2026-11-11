import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cameraConfig } from '../engine/config';
import { cameraPose } from './layout';
import { poseCamera, slabGeometry } from './TrackRenderer';

describe('a note drawn as a solid slab', () => {
  const slab = slabGeometry(0, 0.5, 0.55);
  const pos = slab.getAttribute('position');
  const color = slab.getAttribute('color');
  const uv = slab.getAttribute('uv');
  const layers = pos.count / 4;
  const top = layers - 1;
  // a layer's four corners: far left, far right, near left, near right
  const y = (l: number) => pos.getY(l * 4);
  const shade = (l: number) => (color.getX(l * 4) + color.getX(l * 4 + 1)) / 2;

  it('lays its picture on top and copies of it under it down to its foot, darker the lower they lie', () => {
    expect(layers).toBeGreaterThan(3);
    expect(y(top)).toBe(0);
    expect(y(0)).toBeCloseTo(-0.5, 6);
    expect(shade(top)).toBe(1);
    for (let l = 0; l < top; l++) {
      expect(y(l)).toBeLessThan(y(l + 1));
      expect(shade(l)).toBeLessThan(shade(l + 1));
    }
  });

  it('is drawn foot first, so its top covers what of its walls lies under it', () => {
    const index = slab.getIndex()!;
    const first = (t: number) => Math.min(index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2));
    for (let t = 1; t < index.count / 3; t++) expect(y(Math.floor(first(t) / 4))).toBeGreaterThanOrEqual(y(Math.floor(first(t - 1) / 4)));
  });

  it('lights its walls from the left, and its top evenly', () => {
    for (let l = 0; l < top; l++) expect(color.getX(l * 4)).toBeGreaterThan(color.getX(l * 4 + 1));
    expect(color.getX(top * 4)).toBe(color.getX(top * 4 + 1));
  });

  it('takes only the near part of its picture for its walls (their far part never shows)', () => {
    for (let l = 0; l < top; l++) {
      expect(pos.getZ(l * 4)).toBeCloseTo(0.5 - 0.55, 6);
      expect(uv.getY(l * 4)).toBeCloseTo(0.55, 6);
      expect(uv.getY(l * 4 + 2)).toBe(0);
    }
    expect(pos.getZ(top * 4)).toBe(-0.5);
    expect(uv.getY(top * 4)).toBe(1);
    // a long note's body takes all of it (its UVs are set as it scrolls)
    const long = slabGeometry(0, 0.09, 0);
    expect(long.getAttribute('position').getZ(0)).toBe(-0.5);
  });

  it('is the picture alone, lying flat, where it is given no slices: a see-through long note has no walls to show', () => {
    const flat = slabGeometry(0, 0, 0, 0);
    const at = flat.getAttribute('position');
    expect(at.count).toBe(4);
    expect(flat.getIndex()!.count).toBe(6);
    for (let i = 0; i < 4; i++) {
      expect(at.getY(i)).toBe(0);
      expect((flat.getAttribute('color') as THREE.BufferAttribute).getX(i)).toBe(1);
    }
    // laid as a slab's top is: far left, far right, near left, near right
    expect([0, 1, 2, 3].map((i) => [at.getX(i), at.getZ(i)])).toEqual([[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]);
  });

  it('shows its walls under its near edge from every perspective camera, and none from the plane camera', () => {
    for (const id of Object.keys(cameraConfig.presets)) {
      const pose = cameraPose(cameraConfig.presets[id]);
      const camera = poseCamera(pose, 16 / 9);
      camera.updateMatrixWorld();
      const row = (yy: number) => new THREE.Vector3(0, yy, 0.15).project(camera).y;
      // a tap at the judge line: its foot's near edge lies lower on the screen than its top's
      if (pose.orthographic) expect(row(-0.09)).toBeLessThanOrEqual(row(0));
      else expect(row(-0.09)).toBeLessThan(row(0));
    }
  });
});
