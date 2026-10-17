import type { LaneColor } from '../engine/config';

export type Palette = 'default' | 'colorblind';

/** Lane colours; the colour-blind set follows the Okabe–Ito palette. */
export const LANE_PALETTES: Record<Palette, Record<LaneColor, number>> = {
  default: {
    white: 0xeaf6ff,
    blue: 0x4fc3ff,
    gold: 0xffc94f,
    scratch: 0xff5c8a,
    sideL: 0xb07bff,
    sideR: 0xff8f4f,
  },
  colorblind: {
    white: 0xf0f0f0,
    blue: 0x56b4e9,
    gold: 0xe69f00,
    scratch: 0xd55e00,
    sideL: 0xcc79a7,
    sideR: 0x009e73,
  },
};

/** Hit-effect colour per grade class (matches the CSS variables of each palette). */
export const GRADE_PALETTES: Record<Palette, Record<string, number>> = {
  default: {
    'g-max': 0x7cf7ff,
    'g-high': 0x8bff9c,
    'g-mid': 0xffe26b,
    'g-low': 0xffb15c,
    'g-break': 0xff4d6a,
  },
  colorblind: {
    'g-max': 0x56b4e9,
    'g-high': 0xf0e442,
    'g-mid': 0xe69f00,
    'g-low': 0xcc79a7,
    'g-break': 0xd55e00,
  },
};

/** FEVER tint per multiplier (x2..x5). */
export const FEVER_COLORS: Record<number, number> = {
  2: 0x37e2ff,
  3: 0x6dff8a,
  4: 0xffd84f,
  5: 0xff4fd8,
};
