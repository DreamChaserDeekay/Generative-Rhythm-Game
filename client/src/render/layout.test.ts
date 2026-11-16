import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cameraConfig, keyModes } from '../engine/config';
import { ScrollModel } from '../engine/scroll';
import { visibleTimeMs } from '../settings/settings';
import { DECK_GAP, DECK_PANELS, GEAR_JUDGE, panelSpan, type GearStyle } from './deckArt';
import { cameraPose, computeTrackGeometry, fogStartZ, JUDGE_LINE_Y, noteSpan } from './layout';
import { baseFrame, deckStretch, FIT_TRACK_END_Y, fitFov, floorViewOf, frameCamera, HUD_UNIT, likeCamera, LINE_Y, NOTE_Y, PlaneCamera, poseCamera, screenBottomZOf, trackAspectOf, type TrackCamera } from './TrackRenderer';

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

  it('lays the side lanes over half the keys when asked (반쪽 덮기): the keys take the whole track, as without them', () => {
    for (const [mode, plain, half] of [
      ['6K+FX', '6K', 3],
      ['4K+FX', '4K', 2],
    ] as const) {
      const g = computeTrackGeometry(keyModes[mode], 8, 40, 'half');
      const keys = g.lanes.filter((l) => l.kind === 'key');
      // the key lanes lie where the mode without side lanes has them
      const without = computeTrackGeometry(keyModes[plain], 8, 40).lanes;
      expect(keys).toHaveLength(without.length);
      keys.forEach((l, i) => {
        expect(l.x).toBeCloseTo(without[i].x, 9);
        expect(l.width).toBeCloseTo(without[i].width, 9);
        expect(l.over).toBeUndefined();
      });
      // FXL over keys 1 to `half` (from the left rail to the middle), FXR over the rest
      const [left, right] = [g.lanes[0], g.lanes[g.lanes.length - 1]];
      expect([left.kind, left.over, right.kind, right.over]).toEqual(['side', true, 'side', true]);
      const edges = (l: { x: number; width: number }) => [l.x - l.width / 2, l.x + l.width / 2];
      expect(edges(left)[0]).toBeCloseTo(-4, 9);
      expect(edges(left)[1]).toBeCloseTo(edges(keys[half - 1])[1], 9);
      expect(edges(right)[0]).toBeCloseTo(edges(keys[half])[0], 9);
      expect(edges(right)[1]).toBeCloseTo(4, 9);
      expect(edges(left)[1]).toBeCloseTo(0, 9);
      // the chart's lanes keep their places in the list (judgement, keys and placement are the same)
      expect(g.lanes.map((l) => l.index)).toEqual(keyModes[mode].lanes.map((_, i) => i));
      // separate lanes, the default, are as they were (see the test above)
      expect(computeTrackGeometry(keyModes[mode], 8, 40, 'lanes')).toEqual(computeTrackGeometry(keyModes[mode], 8, 40));
      expect(computeTrackGeometry(keyModes[mode], 8, 40).lanes.some((l) => l.over)).toBe(false);
    }
    // a mode without side lanes is the same either way
    for (const mode of ['4K', '5K', '6K', '7K+1S', '8K'] as const) {
      expect(computeTrackGeometry(keyModes[mode], 8, 40, 'half')).toEqual(computeTrackGeometry(keyModes[mode], 8, 40, 'lanes'));
    }
    // FXL (sideL) lies over the left half and FXR (sideR) over the right, whatever their places in the list
    const reversed = { ...keyModes['6K+FX'], lanes: [...keyModes['6K+FX'].lanes].reverse() };
    const sides = computeTrackGeometry(reversed, 8, 40, 'half').lanes.filter((l) => l.over);
    expect(sides.map((l) => [l.color, l.x])).toEqual([
      ['sideR', 2],
      ['sideL', -2],
    ]);
  });

  it('frames the SDVX preset with the judgement line low and the track end high on screen', () => {
    const L = cameraConfig.trackLength;
    expect(screenY('SDVX', 0)).toBeCloseTo(0.77, 2);
    expect(screenY('SDVX', -L)).toBeCloseTo(0.1, 2);
    for (const id of Object.keys(cameraConfig.presets)) {
      const near = screenY(id, 0);
      const far = screenY(id, -L);
      expect(near).toBeLessThan(0.95);
      expect(far).toBeGreaterThan(0);
      expect(far).toBeLessThan(near);
    }
  });

  it('moves the view up so the judge line leaves the gear room under it, the whole track still on the screen', () => {
    // the gear under the line has the room for its keys, its readouts and a clear strip under them: over a quarter of the height
    expect(JUDGE_LINE_Y).toBeGreaterThan(0.68);
    expect(JUDGE_LINE_Y).toBeLessThan(0.75);
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

  it('lays the judge line on the notes, so a tap\'s middle is on it at its time and it sits at the camera\'s height for it', () => {
    const [W, H] = [1280, 720];
    expect(LINE_Y).toBeGreaterThan(NOTE_Y);
    for (const id of Object.keys(cameraConfig.presets)) {
      for (const lift of [0, 0.1]) {
        const lineZ = -lift * cameraConfig.trackLength;
        const pose = cameraPose(cameraConfig.presets[id]);
        const camera = poseCamera(pose, W / H);
        const base = baseFrame(camera, pose.fov, lineZ, pose.lineY);
        frameCamera(camera, pose.fov, 1, 0, W, H, lineZ, base);
        const row = (y: number) => ((1 - new THREE.Vector3(0, y, lineZ).project(camera).y) / 2) * H;
        expect(Math.abs(row(LINE_Y) - row(NOTE_Y))).toBeLessThan(0.1);
        // where the framing puts the (lifted) line
        expect(Math.abs(row(LINE_Y) - base.lineY * H)).toBeLessThan(1);
        // JUDGE_LINE_Y of the height, but for the plane camera, whose gear sits lower (its preset's own height)
        expect(pose.lineY, id).toBe(id === 'PLANE' ? cameraConfig.presets.PLANE.judgeLineY : JUDGE_LINE_Y);
        if (lift === 0) expect(Math.abs(row(LINE_Y) - pose.lineY * H)).toBeLessThan(1);
      }
    }
    expect(cameraConfig.presets.PLANE.judgeLineY).toBeGreaterThan(JUDGE_LINE_Y);
    // a frame asked for with no height of its own has the common one
    const camera = presetCamera('PLANE', W / H);
    frameCamera(camera, cameraConfig.presets.PLANE.fov, 1, 0, W, H);
    expect((1 - new THREE.Vector3(0, 0, 0).project(camera).y) / 2).toBeCloseTo(JUDGE_LINE_Y, 9);
  });

  /**
   * What a 16:9 play shows of the deck under the judge line with a preset's camera, as TrackRenderer.layoutDeck lays
   * it (plane px): from the deck's top edge (under the line and the gap the lanes run on in, the line as deep on the
   * screen in every camera) down to the bottom of the screen, and how much longer along the track the deck is drawn.
   */
  function deckShown(id: string, [W, H] = [1280, 720]): { shown: number; stretch: number; px: number } {
    const pose = cameraPose(cameraConfig.presets[id]);
    const camera = poseCamera(pose, W / H);
    frameCamera(camera, pose.fov, 1, 0, W, H, 0, baseFrame(camera, pose.fov, 0, pose.lineY));
    const flat = (z: number) => trackAspectOf(camera, z, W, H);
    const fit = Math.max(1, Math.round((0.85 / flat(0) / 1.3) * 20) / 20);
    const top = (GEAR_JUDGE.height / 2 + 3) * fit + DECK_GAP;
    const shown = screenBottomZOf(camera) * HUD_UNIT - top;
    const stretch = deckStretch(Math.floor(shown / 16) * 16, (band) => 0.85 / flat((top + 8 + band / 2) / HUD_UNIT));
    // screen px to a plane px along the track, at the bottom of the screen
    const row = (z: number) => ((1 - new THREE.Vector3(0, 0, z).project(camera).y) / 2) * H;
    const px = (row((top + shown) / HUD_UNIT) - row((top + shown - 20) / HUD_UNIT)) / 20;
    return { shown, stretch, px };
  }

  it('sets the plane camera\'s gear lower than the others\', down to where the screen shows a skin\'s panel to its end and no deck under it', () => {
    const width = cameraConfig.trackWidth * HUD_UNIT;
    const end = (gear: GearStyle, stretch: number) => {
      const span = panelSpan(gear, { width, stretch })!;
      return span.top + span.tall;
    };
    // parallel rays show the deck under the keys less deep than the eye cameras do: with its line at the common
    // height the plane camera showed about 23 px (of 720) of deck past the panel's end, the panel's last row run on
    for (const size of [
      [1280, 720],
      [1920, 1080],
      [1280, 960],
    ] as [number, number][]) {
      const plane = deckShown('PLANE', size);
      expect(plane.stretch).toBe(3.45);
      // the crystal's panel (and every skin's whose row of keys is as deep, or a px or two less) to its end: the
      // screen cuts it there, by no more than 3 px of a 720 px screen (the panel is pressed that much: panelSpan)
      for (const gear of ['prism', 'standard', 'sky', 'fire', 'gpt', 'gemini', 'grok', 'claude', 'aqua', 'steel', 'astral'] as GearStyle[]) {
        expect(plane.shown, gear).toBeLessThanOrEqual(end(gear, plane.stretch));
        expect((end(gear, plane.stretch) - plane.shown) * plane.px * (720 / size[1]), gear).toBeLessThan(3);
        expect(panelSpan(gear, { width, stretch: plane.stretch, shown: plane.shown })!.tall / panelSpan(gear, { width, stretch: plane.stretch })!.tall, gear).toBeGreaterThan(0.98);
      }
      // the two whose row of keys is shallower by a third end a little above the screen's bottom edge: their last row
      // runs on under them, for no more than 9 px of a 720 px screen
      for (const gear of ['noir', 'wire'] as GearStyle[]) {
        const under = (plane.shown - end(gear, plane.stretch)) * plane.px * (720 / size[1]);
        expect(under, gear).toBeGreaterThan(0);
        expect(under, gear).toBeLessThan(9);
      }
    }
    // the eye cameras show less of the deck than the panel is deep
    for (const id of ['SDVX', 'LOW', 'FLAT']) expect(deckShown(id).shown, id).toBeLessThan(end('prism', deckShown(id).stretch));
    // the panels are as deep for their width, to a hundredth, but the sky's: its strip of dashes is a third as deep as
    // the others' rows of keys, and its picture as much deeper
    for (const [gear, panel] of Object.entries(DECK_PANELS)) expect(panel!.size, gear).toEqual([2048, gear === 'sky' ? 977 : gear === 'prism' ? 869 : 876]);
  });

  it('finds where another camera shows what the default one shows so far up the track: the same share of the way from the judge line to the top of the lanes', () => {
    const L = cameraConfig.trackLength;
    const reference = cameraPose(cameraConfig.presets[cameraConfig.default]);
    const [W, H] = [1280, 720];
    const heights = (id: string, lineZ: number) => {
      const pose = cameraPose(cameraConfig.presets[id]);
      const camera = poseCamera(pose, W / H);
      frameCamera(camera, pose.fov, 1, 0, W, H, lineZ, baseFrame(camera, pose.fov, lineZ, pose.lineY));
      const y = (z: number) => (1 - new THREE.Vector3(0, 0, z).project(camera).y) / 2;
      // how far up the way from the line to the top of the lanes on the screen (their far end, or the screen's top)
      return (up: number) => (y(lineZ) - y(lineZ - up / HUD_UNIT)) / (y(lineZ) - Math.max(0, y(-L)));
    };
    for (const lineZ of [0, -4]) {
      for (const id of Object.keys(cameraConfig.presets)) {
        const pose = cameraPose(cameraConfig.presets[id]);
        const like = likeCamera(reference, pose, pose.fov, W / H, lineZ, L);
        const [own, ref] = [heights(id, lineZ), heights(cameraConfig.default, lineZ)];
        let last = 0;
        for (const up of [120, 600, 1100, 1500, 2200]) {
          // the default camera gives the height back; the others the same share of the way on the screen
          if (id === cameraConfig.default) expect(like(up)).toBe(up);
          expect(own(like(up)), `${id} ${up}`).toBeCloseTo(ref(up), 6);
          expect(like(up)).toBeGreaterThan(last);
          last = like(up);
        }
        // the judge line is the judge line
        expect(like(0)).toBeCloseTo(0, 6);
      }
    }
    // a flatter camera shows the same height further up the track: the plane camera's combo lies well past SDVX's
    const plane = cameraPose(cameraConfig.presets.PLANE);
    expect(likeCamera(reference, plane, plane.fov, W / H, 0, L)(400)).toBeGreaterThan(800);
    // a preview fitted to its box (its own field of view) is measured as it is framed, the default camera's too
    const fitted = likeCamera(reference, reference, reference.fov * 1.4, W / H, 0, L);
    expect(fitted(400)).not.toBe(400);
    expect(fitted(400)).toBeGreaterThan(0);
  });

  it('tells a gear’s picture over the lanes how another camera shows them: where the default camera shows the same share of the way up, how much less the track narrows there, how much taller the lanes are', () => {
    const L = cameraConfig.trackLength;
    const reference = cameraPose(cameraConfig.presets[cameraConfig.default]);
    const track = { width: 8, length: L };
    // the default camera needs none: its picture is painted as it is
    expect(floorViewOf(reference, reference, reference.fov, 16 / 9, 0, track)).toBeNull();
    for (const id of Object.keys(cameraConfig.presets).filter((k) => k !== cameraConfig.default)) {
      const pose = cameraPose(cameraConfig.presets[id]);
      for (const lineZ of [0, -4]) {
        const view = floorViewOf(reference, pose, pose.fov, 16 / 9, lineZ, track)!;
        expect(view, id).not.toBeNull();
        // the judge line is the judge line, and further up this camera's lanes is further up the default one's
        expect(view.asDefault(0)).toBeCloseTo(0, 6);
        let last = 0;
        for (const up of [0.1, 0.3, 0.5, 0.7, 0.9]) {
          expect(view.asDefault(up), `${id} ${up}`).toBeGreaterThan(last);
          last = view.asDefault(up);
          expect(view.spread(up), `${id} ${up}`).toBeGreaterThan(0);
        }
        // there and back: the row the default camera shows as high comes to lie where this camera shows it as high
        const there = likeCamera(reference, pose, pose.fov, 16 / 9, lineZ, L);
        for (const up of [0.05, 0.1, 0.2]) expect(view.asDefault(there(up * L * HUD_UNIT) / HUD_UNIT / L), `${id} ${up}`).toBeCloseTo(up, 4);
        // by the judge line the two cameras show the track as wide for its width there
        expect(view.spread(0)).toBeCloseTo(1, 6);
        expect(view.aspect).toBeGreaterThan(0);
      }
    }
    // the plane camera does not narrow the track with the distance, the default one does: a line far up the lanes is painted narrower
    const plane = cameraPose(cameraConfig.presets.PLANE);
    expect(floorViewOf(reference, plane, plane.fov, 16 / 9, 0, track)!.spread(0.8)).toBeLessThan(1);
    // a preview fitted to its box (the default camera at its own field of view) is another view than the default one's
    expect(floorViewOf(reference, reference, reference.fov * 1.4, 16 / 9, 0, track)).not.toBeNull();
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
      // at SPEED 4 a bar note is about 11 ms off its time at either edge (what a chord was off by)
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

  it('keeps round things on the deck round on every camera, the plane one too', () => {
    const [W, H] = [1600, 900];
    /** How much longer along the track than across it a round thing must be drawn at `z` (the renderer's 0.85 / trackAspect). */
    const flatten = (id: string, z = 0.5) => {
      const camera = presetCamera(id, W / H);
      const px = (x: number, zz: number) => new THREE.Vector3(x, 0, zz).project(camera);
      const across = (px(0.25, z).x - px(-0.25, z).x) * (W / 2);
      const along = (px(0, z + 0.25).y - px(0, z - 0.25).y) * (H / 2);
      return 0.85 / (Math.abs(along) / across);
    };
    // the perspective cameras flatten the deck a little, in twentieths
    for (const id of ['FLAT', 'SDVX', 'LOW']) {
      const f = flatten(id);
      expect(f).toBeLessThan(1.45);
      for (const room of [96, 320]) expect(deckStretch(room, () => f)).toBe(Math.round(Math.max(1, f) * 20) / 20);
    }
    // the plane camera far more: drawn round on the screen all the same
    const f = flatten('PLANE');
    expect(f).toBeGreaterThan(2.5);
    expect(deckStretch(912, () => f)).toBeCloseTo(f, 1);
    // measured at the middle of a band about a third of the room deep, 40 to 72 px
    const bands: number[] = [];
    for (const room of [60, 155, 320]) deckStretch(room, (band) => (bands.push(band), 1.2));
    expect(bands).toEqual([40, 56, 72]);
    // never squashed, nor stretched past 3.5
    expect([deckStretch(320, () => 0.6), deckStretch(320, () => 9)]).toEqual([1, 3.5]);
  });
});
