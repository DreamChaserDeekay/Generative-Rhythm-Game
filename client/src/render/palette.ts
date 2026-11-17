import type { LaneColor } from '../engine/config';

/** Lane colours by the lane's colour in its key mode's layout (기본 of 설정 → 노트). */
export const LANE_COLORS: Record<LaneColor, number> = {
  white: 0xeaf6ff,
  blue: 0x4fc3ff,
  gold: 0xffc94f,
  scratch: 0xff5c8a,
  // the side lanes' colours vivid, as DJMAX's side tracks are (the user's, 2026-11-17: the lavender and the pale
  // orange were too faint): a hot pink on the left, a deep orange on the right
  sideL: 0xff2e9a,
  sideR: 0xff6a12,
};

/** Hit-effect colour per grade class (matches the grades' CSS variables). */
export const GRADE_COLORS: Record<string, number> = {
  'g-max': 0x7cf7ff,
  'g-high': 0x8bff9c,
  'g-mid': 0xffe26b,
  'g-low': 0xffb15c,
  'g-break': 0xff4d6a,
};

/** FEVER tint per multiplier (x2..x5): the --fever-2..5 tokens, kept off the accent and the brand colour. */
export const FEVER_COLORS: Record<number, number> = {
  2: 0x6dff8a,
  3: 0xffd84f,
  4: 0xff8f4f,
  5: 0xff6b6b,
};
