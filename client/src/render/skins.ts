import type { KeyModeConfig, LaneColor } from '../engine/config';
import { LANE_PALETTES, type Palette } from './palette';

export type NoteShape = 'box' | 'flat' | 'round';
export type LaneLayout = 'mode' | 'uniform' | 'rainbow';
export type HitEffectStyle = 'burst' | 'ring' | 'none';

export interface SkinColors {
  trackNear: string;
  trackFar: string;
  fog: string;
  railLeft: string;
  railRight: string;
  divider: string;
  bar: string;
  judgeLine: string;
  judgeGlow: string;
  cover: string;
  coverEdge: string;
  /** Overrides for lane colours (ignored with the colour-blind palette). */
  lanes?: Partial<Record<LaneColor, string>>;
}

export interface Skin {
  id: string;
  label: string;
  noteShape: NoteShape;
  laneLayout: LaneLayout;
  hitEffect: HitEffectStyle;
  colors: SkinColors;
}

const NEON: Skin = {
  id: 'neon',
  label: '네온 (기본)',
  noteShape: 'box',
  laneLayout: 'mode',
  hitEffect: 'burst',
  colors: {
    trackNear: '#16224a',
    trackFar: '#060a1a',
    fog: '#060a1a',
    railLeft: '#37e2ff',
    railRight: '#ff4fd8',
    divider: '#3a4c86',
    bar: '#9fb4ff',
    judgeLine: '#ffffff',
    judgeGlow: '#5fe7ff',
    cover: '#0a1030',
    coverEdge: '#5fe7ff',
  },
};

export const BUILTIN_SKINS: Skin[] = [
  NEON,
  {
    id: 'classic',
    label: '클래식',
    noteShape: 'flat',
    laneLayout: 'mode',
    hitEffect: 'ring',
    colors: {
      trackNear: '#101012',
      trackFar: '#050506',
      fog: '#050506',
      railLeft: '#b0b0b8',
      railRight: '#b0b0b8',
      divider: '#2c2c34',
      bar: '#6a6a78',
      judgeLine: '#ff3b3b',
      judgeGlow: '#ff6b6b',
      cover: '#121216',
      coverEdge: '#ff3b3b',
      lanes: { white: '#f2f2f2', blue: '#3d7bff', gold: '#ffcc33' },
    },
  },
  {
    id: 'mono',
    label: '모노 (고대비)',
    noteShape: 'flat',
    laneLayout: 'uniform',
    hitEffect: 'none',
    colors: {
      trackNear: '#000000',
      trackFar: '#000000',
      fog: '#000000',
      railLeft: '#ffffff',
      railRight: '#ffffff',
      divider: '#5a5a5a',
      bar: '#8a8a8a',
      judgeLine: '#ffffff',
      judgeGlow: '#ffffff',
      cover: '#000000',
      coverEdge: '#ffffff',
      lanes: { white: '#ffffff', blue: '#ffffff', gold: '#ffffff' },
    },
  },
  {
    id: 'sunset',
    label: '선셋',
    noteShape: 'round',
    laneLayout: 'rainbow',
    hitEffect: 'burst',
    colors: {
      trackNear: '#3a1838',
      trackFar: '#120618',
      fog: '#120618',
      railLeft: '#ffb347',
      railRight: '#ff5e7e',
      divider: '#6b3460',
      bar: '#ffc9a8',
      judgeLine: '#fff1d6',
      judgeGlow: '#ffb347',
      cover: '#1e0b22',
      coverEdge: '#ffb347',
    },
  },
];

const HEX = /^#[0-9a-fA-F]{6}$/;
const SHAPES: NoteShape[] = ['box', 'flat', 'round'];
const LAYOUTS: LaneLayout[] = ['mode', 'uniform', 'rainbow'];
const EFFECTS: HitEffectStyle[] = ['burst', 'ring', 'none'];
const LANE_KEYS: LaneColor[] = ['white', 'blue', 'gold', 'scratch', 'sideL', 'sideR'];

/** Accepts a user skin (e.g. pasted JSON); unknown or malformed fields fall back to the default. */
export function sanitizeSkin(raw: unknown): Skin | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const c = (typeof r.colors === 'object' && r.colors !== null ? r.colors : {}) as Record<string, unknown>;
  const colors: SkinColors = { ...NEON.colors };
  for (const key of Object.keys(NEON.colors) as (keyof SkinColors)[]) {
    if (key !== 'lanes' && typeof c[key] === 'string' && HEX.test(c[key] as string)) (colors as unknown as Record<string, string>)[key] = c[key] as string;
  }
  if (typeof c.lanes === 'object' && c.lanes !== null) {
    const lanes: Partial<Record<LaneColor, string>> = {};
    for (const key of LANE_KEYS) {
      const v = (c.lanes as Record<string, unknown>)[key];
      if (typeof v === 'string' && HEX.test(v)) lanes[key] = v;
    }
    colors.lanes = lanes;
  }
  const pick = <T,>(v: unknown, allowed: T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
  return {
    id: 'custom',
    label: typeof r.label === 'string' && r.label.trim() ? r.label.trim().slice(0, 40) : '사용자 스킨',
    noteShape: pick(r.noteShape, SHAPES, NEON.noteShape),
    laneLayout: pick(r.laneLayout, LAYOUTS, NEON.laneLayout),
    hitEffect: pick(r.hitEffect, EFFECTS, NEON.hitEffect),
    colors,
  };
}

export function skinById(id: string, custom: unknown): Skin {
  if (id === 'custom') return sanitizeSkin(custom) ?? NEON;
  return BUILTIN_SKINS.find((s) => s.id === id) ?? NEON;
}

export function hex(color: string): number {
  return parseInt(color.slice(1), 16);
}

function hsl(h: number, s: number, l: number): number {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

/** Colour of every lane: palette (or skin overrides) by lane colour, then the skin's layout. */
export function laneColorsFor(skin: Skin, palette: Palette, mode: KeyModeConfig): number[] {
  const base = LANE_PALETTES[palette];
  const overrides = palette === 'default' ? skin.colors.lanes ?? {} : {};
  const colorOf = (c: LaneColor) => (overrides[c] ? hex(overrides[c] as string) : base[c]);
  const keys = mode.lanes.filter((l) => l.kind === 'key').length;
  let k = 0;
  return mode.lanes.map((lane) => {
    if (lane.kind !== 'key') return colorOf(lane.color);
    const index = k++;
    if (skin.laneLayout === 'uniform') return colorOf('white');
    if (skin.laneLayout === 'rainbow' && palette === 'default') return hsl((index / Math.max(1, keys)) * 300, 0.75, 0.64);
    return colorOf(lane.color);
  });
}
