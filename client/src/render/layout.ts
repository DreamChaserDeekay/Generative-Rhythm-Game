import type { CameraPreset, KeyModeConfig, LaneColor } from '../engine/config';

export interface LaneGeom {
  index: number;
  /** Center x in world units. */
  x: number;
  width: number;
  color: LaneColor;
  kind: 'key' | 'scratch';
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

/** World z of an event: 0 at the judgement line, -trackLength when it is `visibleMs` away. */
export function noteZ(eventMs: number, nowMs: number, visibleMs: number, trackLength: number): number {
  return -((eventMs - nowMs) / visibleMs) * trackLength;
}

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

/** Camera behind and above the judgement line, looking down the track (SDVX-style). */
export function cameraPose(preset: CameraPreset): CameraPose {
  return {
    position: [0, preset.height, preset.distance],
    target: [0, 0, -preset.lookAhead],
    fov: preset.fov,
  };
}
