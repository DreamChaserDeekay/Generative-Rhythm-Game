import { cameraConfig, type CameraPreset, type KeyModeConfig, type LaneColor, type LaneConfig, type LaneKind } from '../engine/config';

/** Where the judge line sits on the screen: this share of the height from the top (the view moves, not the camera). */
export const JUDGE_LINE_Y = cameraConfig.judgeLineY;

/**
 * How the side lanes of the FX modes are drawn: lanes of their own at the track's edges, or (as
 * DJMAX draws its side tracks) bars over the left or right half of the key lanes.
 */
export type SideNotes = 'lanes' | 'half';

export interface LaneGeom {
  index: number;
  /** Center x in world units. */
  x: number;
  width: number;
  color: LaneColor;
  kind: LaneKind;
  /** A side lane laid over half the key lanes (SideNotes 'half'): it takes no width of the track, and spans that half. */
  over?: boolean;
}

export interface TrackGeometry {
  lanes: LaneGeom[];
  width: number;
  length: number;
}

/**
 * Splits the track width between lanes in proportion to their configured widths. Side lanes laid
 * over the keys (`sideNotes` 'half') take none of it, so the key lanes share the whole track as in
 * a mode without them, and each spans the half of the track on its side.
 */
export function computeTrackGeometry(mode: KeyModeConfig, trackWidth: number, trackLength: number, sideNotes: SideNotes = 'lanes'): TrackGeometry {
  const over = (l: LaneConfig) => sideNotes === 'half' && l.kind === 'side';
  const total = mode.lanes.reduce((sum, l) => (over(l) ? sum : sum + l.width), 0);
  const unit = trackWidth / total;
  let left = -trackWidth / 2;
  const lanes = mode.lanes.map((l, index) => {
    if (over(l)) {
      // FXL (in sideL's colour) lies over the left half, FXR over the right one
      const side = l.color === 'sideL' ? -1 : 1;
      return { index, x: (side * trackWidth) / 4, width: trackWidth / 2, color: l.color, kind: l.kind, over: true };
    }
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
  /** Parallel rays (the plane preset): the view is as large everywhere as `fov` makes it at the target. */
  orthographic: boolean;
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
 * track into a small part of the screen; the plane camera shows every part alike, so it starts its
 * fog later (`fogStart`) and fogs about as much of the lane on the screen as SDVX does.
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
    orthographic: preset.projection === 'orthographic',
  };
}
