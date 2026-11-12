import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cameraConfig } from '../engine/config';
import type { ChartEffect, ChartTiming } from '../engine/types';
import { ANTICIPATION, CameraFx, MAX_DIVE_DEG, MAX_TILT_DEG, overshoot, PLAYER, SWING_ATTACK, VIEW_DEPTH, ZOOM_DEPTH } from './cameraFx';
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
    expect(fx.at(3700).fovScale).toBe(1);
    expect(fx.at(4000).fovScale).toBeCloseTo(1 - ZOOM_DEPTH, 9);
    expect(fx.at(4500).fovScale).toBeCloseTo(1 - ZOOM_DEPTH * 0.25, 9);
    expect(fx.at(5000).fovScale).toBe(1);
  });

  it('scales with the strength setting and turns off at zero', () => {
    expect(deg(new CameraFx(effects, timing, 0.5).at(6000).roll)).toBeCloseTo(MAX_TILT_DEG / 2, 6);
    const off = new CameraFx(effects, timing, 0);
    expect(off.enabled).toBe(false);
    expect(off.at(6000)).toEqual({ roll: 0, fovScale: 1, pitch: 0 });
    expect(off.follow(6000)).toEqual({ roll: 0, fovScale: 1, pitch: 0 });
    // a chart with no cues still has the play's own (the combo pulse)
    expect(new CameraFx([], timing, 1).enabled).toBe(true);
  });

  it('holds a wider view through a quiet passage and closes in through a build-up', () => {
    const views: ChartEffect[] = [
      { beat: 0, t: 0, type: 'view', value: -1, durationBeats: 2 }, // quiet: opens out over a bar
      { beat: 8, t: 4000, type: 'view', value: 0.5, durationBeats: 4 }, // build-up, bar by bar
      { beat: 12, t: 6000, type: 'view', value: 1, durationBeats: 4 },
      { beat: 16, t: 8000, type: 'view', value: 0, durationBeats: 0.25 }, // the drop lets go at once
      { beat: 16, t: 8000, type: 'zoom', value: 1, durationBeats: 2 },
    ];
    const fx = new CameraFx(views, timing, 1);
    expect(fx.enabled).toBe(true);
    expect(fx.at(1000).fovScale).toBeCloseTo(1 + VIEW_DEPTH, 9); // wider and held
    expect(fx.at(3999).fovScale).toBeCloseTo(1 + VIEW_DEPTH, 9);
    expect(fx.at(6000).fovScale).toBeCloseTo(1 - VIEW_DEPTH * 0.5, 9);
    expect(fx.at(7700).fovScale).toBeCloseTo(1 - VIEW_DEPTH * (0.5 + 0.5 * (0.85 * 0.85 * (3 - 2 * 0.85))), 6); // closing in
    // the breath before the drop: the view opens by a share of the pulse to come, on top of the hold
    expect(fx.at(7999).fovScale).toBeCloseTo((1 + ZOOM_DEPTH * ANTICIPATION.depth) * (1 - VIEW_DEPTH), 4);
    expect(fx.at(8125).fovScale).toBeCloseTo(1 - ZOOM_DEPTH * (1 - 0.125 / 1) ** 2, 9); // let go: only the pulse
    expect(fx.at(9500).fovScale).toBe(1);
    expect(new CameraFx(views, timing, 0.5).at(1000).fovScale).toBeCloseTo(1 + VIEW_DEPTH / 2, 9);
    // the plate's pose counts the closest view with the strongest pulse, and no frame goes past it
    const peak = fx.peak();
    const over = overshoot(cameraConfig.fx.inertia.zoom.damping);
    expect(peak.fovScale).toBeCloseTo(1 - (1 - (1 - ZOOM_DEPTH) * (1 - VIEW_DEPTH)) * (1 + over), 9);
    for (let t = 0; t < 10000; t += 50) expect(fx.at(t).fovScale).toBeGreaterThanOrEqual(peak.fovScale - 1e-12);
    // nor does the camera that follows it with inertia
    const play = new CameraFx(views, timing, 1);
    for (let t = 0; t < 10000; t += 16) expect(play.follow(t).fovScale).toBeGreaterThanOrEqual(peak.fovScale - 1e-9);
  });

  it('names its peak toward the screen\'s top left: the deepest counter-clockwise tilt and zoom together', () => {
    const cues: ChartEffect[] = [
      { beat: 4, t: 2000, type: 'tilt', value: -0.8, durationBeats: 2 },
      { beat: 8, t: 4000, type: 'zoom', value: 0.5, durationBeats: 1 },
      { beat: 12, t: 6000, type: 'tilt', value: 0.9, durationBeats: 2 },
      { beat: 16, t: 8000, type: 'zoom', value: 0.25, durationBeats: 1 },
    ];
    const peak = new CameraFx(cues, timing, 0.6).peak();
    const rollOver = 1 + overshoot(cameraConfig.fx.inertia.roll.damping);
    expect(deg(peak.roll)).toBeCloseTo(-0.8 * MAX_TILT_DEG * 0.6 * rollOver, 9);
    // the strongest pulse the play can show: the chart's, or the combo's
    expect(peak.fovScale).toBeCloseTo(1 - ZOOM_DEPTH * 0.6 * Math.max(0.5, PLAYER.comboPulse) * (1 + overshoot(cameraConfig.fx.inertia.zoom.damping)), 9);
    // no frame of the play goes past it
    const fx = new CameraFx(cues, timing, 0.6);
    for (let t = 0; t < 10000; t += 50) {
      expect(fx.at(t).roll).toBeGreaterThanOrEqual(peak.roll - 1e-12);
      expect(fx.at(t).fovScale).toBeGreaterThanOrEqual(peak.fovScale - 1e-12);
    }
    // a chart that only tilts clockwise never turns the track toward the plate
    expect(new CameraFx(effects, timing, 1).peak().roll).toBe(0);
    expect(new CameraFx(cues, timing, 0).peak()).toEqual({ roll: 0, fovScale: 1, pitch: 0 });
  });

  it('swings: leans at the head of a phrase and is level again within it', () => {
    const fx = new CameraFx([{ beat: 8, t: 4000, type: 'swing', value: -1, durationBeats: 4 }], timing, 1);
    const attack = 2000 * SWING_ATTACK;
    expect(fx.at(3999).roll).toBe(0);
    expect(deg(fx.at(4000 + attack).roll)).toBeCloseTo(-MAX_TILT_DEG, 6); // fully over
    expect(Math.abs(deg(fx.at(4000 + attack + (2000 - attack) / 2).roll))).toBeCloseTo(MAX_TILT_DEG / 2, 6); // on its way back
    expect(fx.at(6000).roll).toBeCloseTo(0, 9);
    expect(fx.at(9000).roll).toBeCloseTo(0, 9); // nothing is held
    expect(deg(fx.peak().roll)).toBeLessThanOrEqual(-MAX_TILT_DEG);
  });

  it('opens the view just before a large pulse, and not before a small one', () => {
    const big = new CameraFx([{ beat: 8, t: 4000, type: 'zoom', value: 1, durationBeats: 2 }], timing, 1);
    const lead = 500 * ANTICIPATION.beats;
    expect(big.at(4000 - lead - 1).fovScale).toBe(1);
    expect(big.at(4000 - 1).fovScale).toBeCloseTo(1 + ZOOM_DEPTH * ANTICIPATION.depth, 4); // wider: the breath
    expect(big.at(4000).fovScale).toBeCloseTo(1 - ZOOM_DEPTH, 9); // then the pulse
    const small = new CameraFx([{ beat: 8, t: 4000, type: 'zoom', value: ANTICIPATION.from - 0.1, durationBeats: 1 }], timing, 1);
    expect(small.at(3999).fovScale).toBe(1);
  });

  it('holds the camera lower through a dive', () => {
    const cues: ChartEffect[] = [
      { beat: 8, t: 4000, type: 'dive', value: 1, durationBeats: 4 },
      { beat: 24, t: 12000, type: 'dive', value: 0, durationBeats: 4 },
    ];
    const fx = new CameraFx(cues, timing, 0.5);
    expect(fx.at(3000).pitch).toBe(0);
    expect(deg(fx.at(6000).pitch!)).toBeCloseTo(MAX_DIVE_DEG / 2, 6);
    expect(deg(fx.at(11000).pitch!)).toBeCloseTo(MAX_DIVE_DEG / 2, 6);
    expect(fx.at(14000).pitch).toBeCloseTo(0, 9);
    expect(deg(fx.peak().pitch!)).toBeCloseTo(MAX_DIVE_DEG / 2, 6);
  });

  it('follows its cues with inertia: late to start, a little past where it stops, then settled', () => {
    const fx = new CameraFx(effects, timing, 1); // a tilt of 1 eased in from 4000 to 5000 and held
    const max = (MAX_TILT_DEG * Math.PI) / 180;
    let peak = 0;
    for (let t = 3000; t <= 9000; t += 16) {
      const roll = fx.follow(t).roll;
      if (t > 4100 && t < 4500) expect(roll).toBeLessThan(fx.at(t).roll); // behind its target on the way
      peak = Math.max(peak, roll);
    }
    expect(peak).toBeGreaterThan(max * 1.005); // ran past it
    expect(peak).toBeLessThan(max * (1 + overshoot(cameraConfig.fx.inertia.roll.damping)) + 1e-9);
    expect(fx.follow(9016).roll).toBeCloseTo(max, 3); // and came to rest on it
    // the same at any frame rate
    const slow = new CameraFx(effects, timing, 1);
    for (let t = 3000; t <= 9000; t += 33) slow.follow(t);
    expect(slow.follow(9016).roll).toBeCloseTo(max, 3);
    // a jump in time (a seek, a restart) puts the camera where it belongs at once
    expect(fx.follow(3000)).toEqual(fx.at(3000));
    expect(fx.follow(8000).roll).toBeCloseTo(fx.at(8000).roll, 12);
  });

  it('answers the play: a pulse every hundred combo, level for a moment after a miss', () => {
    const fx = new CameraFx(effects, timing, 1);
    fx.follow(6000);
    fx.combo(99);
    expect(fx.at(6000).fovScale).toBe(1);
    fx.combo(PLAYER.comboEvery);
    expect(fx.at(6000).fovScale).toBeCloseTo(1 - ZOOM_DEPTH * PLAYER.comboPulse, 9);
    expect(fx.at(6000 + PLAYER.comboMs).fovScale).toBe(1);
    fx.combo(0); // a broken combo is no milestone
    expect(fx.at(6000 + PLAYER.comboMs).fovScale).toBe(1);
    // a miss at 7000: the held tilt lets go, stays level, and comes back
    fx.follow(7000);
    const before = fx.at(7000).roll;
    fx.miss();
    expect(before).toBeGreaterThan(0);
    expect(fx.at(7000 + PLAYER.missEaseMs).roll).toBeCloseTo(0, 9);
    expect(fx.at(7000 + PLAYER.missCalmMs - 1).roll).toBeCloseTo(0, 9);
    expect(fx.at(7000 + PLAYER.missCalmMs + PLAYER.missBackMs).roll).toBeCloseTo(before, 9);
    expect(fx.at(6900).roll).toBeCloseTo(before, 9); // (what came before the miss is as it was)
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

  it('keeps the whole judge line in its place through a dive, the track beyond it lying flatter', () => {
    for (const id of Object.keys(cameraConfig.presets)) {
      const pose = cameraPose(cameraConfig.presets[id]);
      const still = poseCamera(pose, W / H);
      frameCamera(still, pose.fov, 1, 0, W, H);
      const dived = poseCamera(pose, W / H);
      frameCamera(dived, pose.fov, 1, 0, W, H, 0, baseFrame(poseCamera(pose, W / H), pose.fov, 0), (MAX_DIVE_DEG * Math.PI) / 180);
      for (const x of [-4, 0, 4]) expect(px(dived, x, 0).distanceTo(px(still, x, 0)), id).toBeLessThan(0.01);
      // the far end comes down the screen: the camera is nearer the track's plane
      expect(px(dived, 0, -cameraConfig.trackLength).y, id).toBeGreaterThan(px(still, 0, -cameraConfig.trackLength).y + 1);
    }
  });

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
