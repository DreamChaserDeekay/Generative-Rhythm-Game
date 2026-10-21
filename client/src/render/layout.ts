import { cameraConfig, type CameraPreset, type KeyModeConfig, type LaneColor, type LaneKind } from '../engine/config';

/** Where the judge line sits on the screen: this share of the height from the top (the view moves, not the camera). */
export const JUDGE_LINE_Y = cameraConfig.judgeLineY;

export interface LaneGeom {
  index: number;
  /** Center x in world units. */
  x: number;
  width: number;
  color: LaneColor;
  kind: LaneKind;
}

export interface TrackGeometry {
  lanes: LaneGeom[];
  width: number;
  length: number;
}

/** Splits the track width between lanes in proportion to their configured widths. */
export function computeTrackGeometry(mode: KeyModeConfig, trackWidth: number, trackLength: number): TrackGeometry {
  const total = mode.lanes.reduce((sum, l) => sum + l.width, 0);
  const unit = trackWidth / total;
  let left = -trackWidth / 2;
  const lanes = mode.lanes.map((l, index) => {
    const width = l.width * unit;
    const lane: LaneGeom = { index, x: left + width / 2, width, color: l.color, kind: l.kind };
    left += width;
    return lane;
  });
  return { lanes, width: trackWidth, length: trackLength };
}

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

/** A note's near edge (toward the camera) and far edge on the track (z). */
export interface NoteSpan {
  near: number;
  far: number;
}

/**
 * Where a note lies on the track, `depth` deep. One reference point for every note kind: a tap is
 * centred on its time's z, and a long note runs from the near edge of a tap at its start to the
 * far edge of a tap at its end (`endZ`), so a chord of taps and long-note heads lines up whatever
 * the speed or the skin's note depth. A held long note starts at the judge line (`heldAt`). The
 * renderer passes `out` to spare an object per note and frame.
 */
export function noteSpan(z: number, depth: number, endZ = z, heldAt: number | null = null, out: NoteSpan = { near: 0, far: 0 }): NoteSpan {
  out.near = heldAt ?? z + depth / 2;
  out.far = endZ - depth / 2;
  return out;
}

/** The floor's fog starts this share of the track's length up it, unless the preset says otherwise. */
const FOG_START = 0.55;

/**
 * Where the floor's fog starts up the track (z). A perspective camera squeezes the far part of the
 * track into a small part of the screen; the plane camera does not, so it starts its fog later
 * (`fogStart`) and fogs about as much of the lane on the screen as SDVX does.
 */
export function fogStartZ(preset: CameraPreset, trackLength: number): number {
  return -trackLength * (preset.fogStart ?? FOG_START);
}

/** Camera behind and above the judgement line, looking down the track (SDVX-style). */
export function cameraPose(preset: CameraPreset): CameraPose {
  return {
    position: [0, preset.height, preset.distance],
    target: [0, 0, -preset.lookAhead],
    fov: preset.fov,
  };
}
