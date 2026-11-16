import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cameraConfig } from '../engine/config';
import { cameraPose } from './layout';
import { endSlabGeometry, longBodyGeometry, poseCamera, slabGeometry } from './TrackRenderer';

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

  it('is the picture alone, lying flat, where it is given no slices', () => {
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

describe('a long note as a slab', () => {
  it('copies only its body’s two long edges under it for its walls, lower and darker, its top all of the picture', () => {
    const body = longBodyGeometry(0.09, 0.12);
    const pos = body.getAttribute('position');
    const uv = body.getAttribute('uv');
    const color = body.getAttribute('color');
    const quads = pos.count / 4;
    expect(quads).toBe(7 * 2 + 1);
    const top = quads - 1;
    expect([pos.getX(top * 4), pos.getX(top * 4 + 1), pos.getY(top * 4)]).toEqual([-0.5, 0.5, 0]);
    for (let q = 0; q < top; q++) {
      const [x0, x1] = [pos.getX(q * 4), pos.getX(q * 4 + 1)];
      // an edge strip, its picture the same strip of the body's
      expect(x1 - x0).toBeCloseTo(0.12, 6);
      expect(x0 === -0.5 || x1 === 0.5).toBe(true);
      expect(uv.getX(q * 4)).toBeCloseTo(x0 + 0.5, 6);
      expect(pos.getY(q * 4)).toBeLessThan(0);
      expect(color.getX(q * 4)).toBeLessThan(1);
      // along all of the body: far edge first (its v set as it scrolls)
      expect([pos.getZ(q * 4), pos.getZ(q * 4 + 2)]).toEqual([-0.5, 0.5]);
    }
    // the foot first: the top is drawn last
    expect(pos.getY(0)).toBeCloseTo(-0.09, 6);
  });

  it('gives its ends walls of their outer part only, which never reach the body next to them', () => {
    const end = endSlabGeometry(0.09, 0.6);
    const pos = end.getAttribute('position');
    const uv = end.getAttribute('uv');
    const top = pos.count / 4 - 1;
    for (let q = 0; q < top; q++) {
      // from the outer edge (the picture's top, v = 1, at z -0.5) in to 0.6 of the end
      expect(pos.getZ(q * 4)).toBe(-0.5);
      expect(pos.getZ(q * 4 + 2)).toBeCloseTo(0.1, 6);
      expect(uv.getY(q * 4)).toBe(1);
      expect(uv.getY(q * 4 + 2)).toBeCloseTo(0.4, 6);
    }
    expect([pos.getZ(top * 4), pos.getZ(top * 4 + 2)]).toEqual([-0.5, 0.5]);
  });
});
