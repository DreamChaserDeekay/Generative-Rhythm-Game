import type { KeyModeConfig, LaneColor } from '../engine/config';
import { LANE_PALETTES, type Palette } from './palette';

export type NoteShape = 'box' | 'flat' | 'round';
export type LaneLayout = 'mode' | 'uniform' | 'rainbow';
export type HitEffectStyle = 'burst' | 'ring' | 'sprite' | 'none';

/** Parts a skin can draw with a texture of the media manifest (client/public/media/manifest.json). */
export type TextureSlot = 'note' | 'side' | 'scratch' | 'longBody' | 'hitBurst' | 'hitHold' | 'keyBeam' | 'judgeLine' | 'rails' | 'floor';
export const TEXTURE_SLOTS: TextureSlot[] = ['note', 'side', 'scratch', 'longBody', 'hitBurst', 'hitHold', 'keyBeam', 'judgeLine', 'rails', 'floor'];

/** Manifest texture id per part; a part without one (or whose file fails to load) is drawn in code. */
export type SkinTextures = Partial<Record<TextureSlot, string>>;

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
  /** 'sprite' plays the hitBurst flipbook (falls back to 'burst' without it). */
  hitEffect: HitEffectStyle;
  colors: SkinColors;
  textures?: SkinTextures;
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

/** Every part of one generated set (assets-src/PROVENANCE.md); the key beam and hold sparks are shared. */
function setTextures(set: string, burst: 'Ring' | 'Glow'): SkinTextures {
  return {
    note: `${set}/note`,
    side: `${set}/side`,
    scratch: `${set}/scratch`,
    longBody: `${set}/longBody`,
    judgeLine: `${set}/judgeLine`,
    rails: `${set}/rails`,
    floor: `${set}/floor`,
    keyBeam: 'fx/keyBeam',
    hitBurst: `fx/hitBurst${burst}`,
    hitHold: 'fx/hitHold',
  };
}

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
  {
    id: 'glass',
    label: '글래스',
    noteShape: 'box',
    laneLayout: 'mode',
    hitEffect: 'sprite',
    colors: {
      trackNear: '#141d40',
      trackFar: '#070b1c',
      fog: '#070b1c',
      railLeft: '#37e2ff',
      railRight: '#ff4fd8',
      divider: '#34467e',
      bar: '#9fb4ff',
      judgeLine: '#ffffff',
      judgeGlow: '#6fe9ff',
      cover: '#0a1030',
      coverEdge: '#6fe9ff',
      lanes: { white: '#f4f8ff', blue: '#4fa3ff', gold: '#ffcf4a' },
    },
    textures: setTextures('glass', 'Ring'),
  },
  {
    id: 'crystal',
    label: '크리스털',
    noteShape: 'box',
    laneLayout: 'mode',
    hitEffect: 'sprite',
    colors: {
      trackNear: '#1d1846',
      trackFar: '#0a0818',
      fog: '#0a0818',
      railLeft: '#9fe8ff',
      railRight: '#c9a6ff',
      divider: '#4a3f86',
      bar: '#c9b8ff',
      judgeLine: '#ffffff',
      judgeGlow: '#bfe9ff',
      cover: '#120e2c',
      coverEdge: '#bfe9ff',
      lanes: { white: '#f6f4ff', blue: '#8fb8ff', gold: '#ffd98a' },
    },
    textures: setTextures('crystal', 'Glow'),
  },
  {
    id: 'metal',
    label: '메탈',
    noteShape: 'flat',
    laneLayout: 'mode',
    hitEffect: 'sprite',
    colors: {
      trackNear: '#181a1f',
      trackFar: '#070809',
      fog: '#070809',
      railLeft: '#c7ccd6',
      railRight: '#c7ccd6',
      divider: '#3a3e47',
      bar: '#8a909c',
      judgeLine: '#ff7a2f',
      judgeGlow: '#ff9a5c',
      cover: '#101114',
      coverEdge: '#ff7a2f',
      lanes: { white: '#f2f4f7', blue: '#5aa0ff', gold: '#ffc24a' },
    },
    textures: setTextures('metal', 'Ring'),
  },
  {
    id: 'gel',
    label: '젤',
    noteShape: 'round',
    laneLayout: 'mode',
    hitEffect: 'sprite',
    colors: {
      trackNear: '#2e1634',
      trackFar: '#120714',
      fog: '#120714',
      railLeft: '#ffb38a',
      railRight: '#ff6fa5',
      divider: '#5e3260',
      bar: '#ffc9b0',
      judgeLine: '#fff1d6',
      judgeGlow: '#ffc38a',
      cover: '#1e0b22',
      coverEdge: '#ffc38a',
      lanes: { white: '#fff6ee', blue: '#8ad1ff', gold: '#ffd36b' },
    },
    textures: setTextures('gel', 'Glow'),
  },
];

const HEX = /^#[0-9a-fA-F]{6}$/;
const SHAPES: NoteShape[] = ['box', 'flat', 'round'];
const LAYOUTS: LaneLayout[] = ['mode', 'uniform', 'rainbow'];
const EFFECTS: HitEffectStyle[] = ['burst', 'ring', 'sprite', 'none'];
const LANE_KEYS: LaneColor[] = ['white', 'blue', 'gold', 'scratch', 'sideL', 'sideR'];
/** Manifest texture ids look like "glass/note" or "fx/keyBeam". */
const TEXTURE_ID = /^[a-z0-9]+\/[A-Za-z0-9]+$/;

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
  const skin: Skin = {
    id: 'custom',
    label: typeof r.label === 'string' && r.label.trim() ? r.label.trim().slice(0, 40) : '사용자 스킨',
    noteShape: pick(r.noteShape, SHAPES, NEON.noteShape),
    laneLayout: pick(r.laneLayout, LAYOUTS, NEON.laneLayout),
    hitEffect: pick(r.hitEffect, EFFECTS, NEON.hitEffect),
    colors,
  };
  // textures of the built-in sets, by manifest id (unknown ids are skipped when loading)
  if (typeof r.textures === 'object' && r.textures !== null) {
    const textures: SkinTextures = {};
    for (const slot of TEXTURE_SLOTS) {
      const v = (r.textures as Record<string, unknown>)[slot];
      if (typeof v === 'string' && TEXTURE_ID.test(v)) textures[slot] = v;
    }
    if (Object.keys(textures).length > 0) skin.textures = textures;
  }
  return skin;
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
