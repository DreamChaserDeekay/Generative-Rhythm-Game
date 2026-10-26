import type { KeyModeConfig, LaneColor } from '../engine/config';
import { LANE_PALETTES, type Palette } from './palette';
import { CAP_DECKS, DECK_STYLES, type DeckStyle } from './deckArt';
import { HIT_STYLES, LONG_OF, LONG_STYLES, NOTE_STYLES, SIDE_STYLES, type HitStyle, type LongStyle, type NoteStyle, type SideStyle } from './tintArt';

export type NoteShape = 'box' | 'flat' | 'round';
export type LaneLayout = 'mode' | 'uniform' | 'rainbow';
export type HitEffectStyle = 'burst' | 'ring' | 'sprite' | 'none';
export type BeamStyle = 'fade' | 'white' | 'stem' | 'neon';
export type CameraId = 'SDVX' | 'FLAT' | 'LOW' | 'PLANE';

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

/** The fonts bundled for a skin's judgement and combo, each in the one weight and style shipped. */
export const HUD_FONTS = {
  'Barlow Condensed': { weight: 700, italic: false },
  'Bebas Neue': { weight: 400, italic: false },
  'Chakra Petch': { weight: 700, italic: true },
  'Russo One': { weight: 400, italic: false },
  Orbitron: { weight: 800, italic: false },
  'Exo 2': { weight: 700, italic: true },
  'Baloo 2': { weight: 800, italic: false },
  Cinzel: { weight: 700, italic: false },
} as const;
export type HudFont = keyof typeof HUD_FONTS;

/**
 * How a skin writes its judgement and combo on the track (the sheets' type; sizes are screen px on
 * a 720 px high screen): its best judgement's colour, an outline, and a few house manners.
 */
export interface HudType {
  font: HudFont;
  size: number;
  combo: number;
  /** Letter spacing (em). */
  tracking: number;
  /** The best judgement's colour (the colour-blind palette keeps its own). */
  max: string;
  outline: string;
  /** Outline width (px; half of it shows outside the letters). */
  stroke: number;
  /** "MAX" in white, the rest in the judgement's colour. */
  split?: boolean;
  /** The combo rides on the judgement's line and leaves with it. */
  inline?: boolean;
  /** The judgement slanted (deg), with a bar of this colour under it. */
  skew?: number;
  bar?: string;
}

/**
 * How a skin is drawn in code (render/tintArt.ts): every part a picture the lane colour tints.
 * Sizes in px are px of the approved sheets' track, 73.65 px to a track unit at the judge line.
 */
export interface SkinStyle {
  note: NoteStyle;
  long: LongStyle;
  /** How the side lanes' notes are drawn (default 'bar': as the note style draws them; over the keys, see-through bars). */
  side?: SideStyle;
  /** The gear under the judge line: its plate and the lane lights that light with the keys (render/deckArt.ts). */
  deck: DeckStyle;
  beam: BeamStyle;
  /** 'flipbook' plays the skin's hitBurst / hitHold textures (code shards without them). */
  hit: HitStyle | 'flipbook' | 'none';
  /** Note depth as a share of the usual one (a thin note is shallower). */
  noteDepth?: number;
  rails: { width: number; glow?: number; bevel?: boolean };
  /**
   * The judge line's thickness, a second line flush under or over it, and whether a halo rises
   * from it (in judgeGlow). The built-in skins all draw neon's: 6 px, a halo (mono's line is bare),
   * no second line.
   */
  judge: { height: number; under?: string; over?: string; glow?: boolean };
  /** Lane colour mixed into the track under coloured lanes (scratch apart), and floor patterns. */
  track: { tint: number; scratchTint?: number; stripes?: boolean; edges?: boolean; facets?: boolean };
  /** Walls outside the rails. */
  frame?: 'gunmetal' | 'street';
  /** The camera the skin was drawn for (the settings keep their own: picking a skin never changes it). */
  camera: CameraId;
  type: HudType;
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
  style?: SkinStyle;
}

/**
 * Skins of earlier versions, by the skin that took their place. The glass preset redrawn keeps its
 * id 'glass' (it is shown as 크리스털); the earlier 'crystal' set became 'jewel'.
 */
export const SKIN_RENAMES: Record<string, string> = {
  classic: 'club',
  metal: 'arcade',
  crystal: 'jewel',
  gel: 'pop',
  sunset: 'pop',
};

/** `fg` at `alpha` over `bg` (both #rrggbb). */
function over(fg: string, alpha: number, bg: string): string {
  const [a, b] = [hex(fg), hex(bg)];
  const ch = (shift: number) => Math.round(((a >> shift) & 255) * alpha + ((b >> shift) & 255) * (1 - alpha));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

interface SkinDef {
  label: string;
  lanes: Partial<Record<LaneColor, string>>;
  near: string;
  far: string;
  /** Lane divider: a colour, or white at this alpha over the track. */
  divider: string | number;
  rails: [string, string];
  judge: string;
  glow?: string;
  style: SkinStyle;
  laneLayout?: LaneLayout;
}

/** A built-in skin of the approved sheets: track colours from its few base colours. */
function skin(id: string, d: SkinDef): Skin {
  const divider = typeof d.divider === 'number' ? over('#ffffff', d.divider, d.near) : d.divider;
  return {
    id,
    label: d.label,
    noteShape: d.style.note === 'round' ? 'round' : 'flat',
    laneLayout: d.laneLayout ?? 'mode',
    hitEffect: d.style.hit === 'flipbook' ? 'sprite' : d.style.hit === 'none' ? 'none' : 'burst',
    colors: {
      trackNear: d.near,
      trackFar: d.far,
      fog: d.far,
      railLeft: d.rails[0],
      railRight: d.rails[1],
      divider,
      // drawn at 70%: about 16% white over the track
      bar: over('#ffffff', 0.23, d.near),
      judgeLine: d.judge,
      judgeGlow: d.glow ?? d.judge,
      cover: over('#000000', 0.3, d.far),
      coverEdge: d.rails[0],
      lanes: d.lanes,
    },
    ...(d.style.hit === 'flipbook' && { textures: { hitBurst: 'fx/hitBurstGlow', hitHold: 'fx/hitHold' } }),
    style: d.style,
  };
}

/** A skin's second judge line: this many plane px deep, flush under the line (toward the camera) or over it. */
export const EXTRA_LINE = 5;

/**
 * Where the deck starts under the middle of the judge line (plane px): 3 px under the line, or under
 * its second line there, and never nearer than under neon's 6 px line, so a thin line of a user
 * skin keeps the gear where neon has it.
 */
export function deckTop(judge: SkinStyle['judge']): number {
  return Math.max(6, judge.height / 2 + (judge.under ? EXTRA_LINE : 0) + 3);
}

/** FLAT's type, and the one a skin of an earlier version writes with. */
export const DEFAULT_HUD_TYPE: HudType = { font: 'Barlow Condensed', size: 44, combo: 64, tracking: 0.04, max: '#7cf7ff', outline: '#0b0c10', stroke: 6 };

const FLAT = skin('flat', {
  label: '기본',
  lanes: { white: '#eaf6ff', blue: '#4fc3ff', gold: '#ffc94f', scratch: '#ff5c8a' },
  near: '#15171f',
  far: '#0d0f14',
  divider: 0.1,
  rails: ['#37e2ff', '#ff4fd8'],
  judge: '#f3f5f9',
  style: {
    note: 'flat',
    long: 'solid',
    deck: 'line',
    beam: 'fade',
    hit: 'flash',
    rails: { width: 6 },
    judge: { height: 6, glow: true },
    track: { tint: 0.07 },
    camera: 'SDVX',
    type: DEFAULT_HUD_TYPE,
  },
});

export const BUILTIN_SKINS: Skin[] = [
  FLAT,
  skin('stem', {
    label: '악기색',
    lanes: { white: '#d8dce6', blue: '#d8dce6', gold: '#d8dce6', scratch: '#d8dce6' },
    near: '#13151c',
    far: '#0a0b0f',
    divider: 0.08,
    rails: ['#c7ccd6', '#c7ccd6'],
    judge: '#f3f5f9',
    style: {
      note: 'stem',
      long: 'stem',
      deck: 'stem',
      beam: 'stem',
      hit: 'stemflash',
      rails: { width: 4 },
      judge: { height: 6, glow: true },
      track: { tint: 0 },
      camera: 'SDVX',
      type: { ...DEFAULT_HUD_TYPE, max: '#f3f5f9' },
    },
  }),
  skin('arcade', {
    label: '아케이드',
    lanes: { white: '#f4f6fb', blue: '#4fa3ff', gold: '#ffc94f', scratch: '#ff5c8a' },
    near: '#111725',
    far: '#06080e',
    divider: over('#aabee6', 0.16, '#111725'),
    rails: ['#c9d1e0', '#c9d1e0'],
    judge: '#ffffff',
    glow: '#ff9f43',
    style: {
      note: 'chamfer',
      long: 'rail',
      deck: 'arcade',
      beam: 'white',
      hit: 'star',
      rails: { width: 5 },
      judge: { height: 6, glow: true },
      track: { tint: 0.06 },
      frame: 'gunmetal',
      camera: 'FLAT',
      type: { font: 'Bebas Neue', size: 60, combo: 88, tracking: 0.05, max: '#5fe7ff', outline: '#05070c', stroke: 6, split: true },
    },
  }),
  skin('club', {
    label: '클럽',
    lanes: { white: '#f2f2f2', blue: '#3d7bff', gold: '#ffcc33', scratch: '#ff3b3b' },
    near: '#060607',
    far: '#030304',
    divider: '#26262c',
    rails: ['#8c8c98', '#8c8c98'],
    judge: '#ff3b3b',
    style: {
      note: 'round',
      long: 'capsule',
      deck: 'mixer',
      beam: 'fade',
      hit: 'bomb',
      rails: { width: 3 },
      judge: { height: 6, glow: true },
      track: { tint: 0, scratchTint: 0.1 },
      camera: 'FLAT',
      type: { font: 'Chakra Petch', size: 40, combo: 60, tracking: 0.06, max: '#ffffff', outline: '#000000', stroke: 5 },
    },
  }),
  skin('street', {
    label: '스트리트',
    lanes: { white: '#ffffff', blue: '#38a8ff', gold: '#ffd23f', scratch: '#ff4d6a' },
    near: '#18181c',
    far: '#0b0b0e',
    divider: '#2e2e36',
    rails: ['#ffd23f', '#ffd23f'],
    judge: '#ffffff',
    glow: '#ffd23f',
    style: {
      note: 'chamfer',
      long: 'rail',
      deck: 'hazard',
      beam: 'fade',
      hit: 'flare',
      rails: { width: 6 },
      judge: { height: 6, glow: true },
      track: { tint: 0.05 },
      frame: 'street',
      camera: 'FLAT',
      type: { font: 'Russo One', size: 46, combo: 76, tracking: 0.02, max: '#ffffff', outline: '#000000', stroke: 9, skew: -9, bar: '#ffd23f' },
    },
  }),
  skin('neon', {
    label: '네온',
    lanes: { white: '#eaf6ff', blue: '#5fd7ff', gold: '#ffb347', scratch: '#ff4fd8' },
    near: '#16224a',
    far: '#060a1a',
    divider: '#33457c',
    rails: ['#37e2ff', '#ff4fd8'],
    judge: '#ffffff',
    glow: '#5fe7ff',
    style: {
      note: 'star5',
      long: 'ray',
      deck: 'neon',
      beam: 'neon',
      hit: 'hex',
      rails: { width: 6, glow: 14 },
      judge: { height: 6, glow: true },
      track: { tint: 0.08 },
      camera: 'LOW',
      type: { font: 'Orbitron', size: 34, combo: 58, tracking: 0.1, max: '#6ff3ff', outline: '#050a1c', stroke: 6 },
    },
  }),
  skin('glass', {
    label: '크리스털',
    lanes: { white: '#f6f4ff', blue: '#8fb8ff', gold: '#ffd98a', scratch: '#ff9ecf' },
    near: '#1d1846',
    far: '#0a0818',
    divider: over('#c9b8ff', 0.22, '#1d1846'),
    rails: ['#9fe8ff', '#c9a6ff'],
    judge: '#f6f4ff',
    glow: '#bfe9ff',
    style: {
      note: 'star4',
      long: 'ray',
      deck: 'crystal',
      beam: 'white',
      hit: 'shards',
      rails: { width: 5, glow: 8 },
      judge: { height: 6, glow: true },
      track: { tint: 0.06, edges: true },
      camera: 'SDVX',
      type: { font: 'Exo 2', size: 42, combo: 64, tracking: 0.04, max: '#dff6ff', outline: '#120e2c', stroke: 6 },
    },
  }),
  skin('pop', {
    label: '팝',
    lanes: { white: '#fff6ee', blue: '#8ad1ff', gold: '#ffd36b', scratch: '#ff8fb1' },
    near: '#2e1634',
    far: '#120714',
    divider: '#5e3260',
    rails: ['#ffb38a', '#ff6fa5'],
    judge: '#fff1d6',
    style: {
      note: 'round',
      long: 'capsule',
      deck: 'candy',
      beam: 'fade',
      hit: 'bubbles',
      rails: { width: 8 },
      judge: { height: 6, glow: true },
      track: { tint: 0.08 },
      camera: 'SDVX',
      type: { font: 'Baloo 2', size: 50, combo: 76, tracking: 0.01, max: '#ffffff', outline: '#ff6fa5', stroke: 8 },
    },
  }),
  skin('jewel', {
    label: '보석',
    lanes: { white: '#f2f5ff', blue: '#5e9bff', gold: '#ffc55c', scratch: '#ff6aa8' },
    near: '#171338',
    far: '#07061a',
    divider: over('#beb4ff', 0.16, '#171338'),
    rails: ['#9fe8ff', '#c9a6ff'],
    judge: '#ffffff',
    glow: '#bfe9ff',
    style: {
      note: 'chamfer',
      long: 'rail',
      deck: 'jewel',
      beam: 'white',
      hit: 'flipbook',
      rails: { width: 10, bevel: true },
      judge: { height: 6, glow: true },
      track: { tint: 0.05 },
      camera: 'SDVX',
      type: { font: 'Cinzel', size: 40, combo: 62, tracking: 0.03, max: '#e6f4ff', outline: '#0d0a26', stroke: 6 },
    },
  }),
  skin('mono', {
    label: '모노 (고대비)',
    lanes: { white: '#ffffff', blue: '#ffffff', gold: '#ffffff' },
    near: '#000000',
    far: '#000000',
    divider: '#5a5a5a',
    rails: ['#ffffff', '#ffffff'],
    judge: '#ffffff',
    laneLayout: 'uniform',
    style: {
      note: 'flat',
      long: 'solid',
      deck: 'mono',
      beam: 'white',
      hit: 'none',
      rails: { width: 6 },
      // no halo: the high-contrast skin keeps its line bare
      judge: { height: 6 },
      track: { tint: 0 },
      camera: 'SDVX',
      type: { ...DEFAULT_HUD_TYPE, max: '#ffffff', outline: '#000000' },
    },
  }),
];

const HEX = /^#[0-9a-fA-F]{6}$/;
const SHAPES: NoteShape[] = ['box', 'flat', 'round'];
const LAYOUTS: LaneLayout[] = ['mode', 'uniform', 'rainbow'];
const EFFECTS: HitEffectStyle[] = ['burst', 'ring', 'sprite', 'none'];
const LANE_KEYS: LaneColor[] = ['white', 'blue', 'gold', 'scratch', 'sideL', 'sideR'];
/** Note and long note styles of earlier versions, by the family that took their place in their skins. */
const NOTE_RENAMES: Record<string, NoteStyle> = { gloss: 'chamfer', thin: 'round', outline: 'chamfer', chip: 'star5', gem: 'star4', pill: 'round', jewel: 'chamfer' };
const LONG_RENAMES: Record<string, LongStyle> = { gloss: 'rail', hollow: 'capsule', striped: 'rail', neon: 'ray', glass: 'ray', pill: 'capsule', jewel: 'rail' };
const BEAM_STYLES: BeamStyle[] = ['fade', 'white', 'stem', 'neon'];
const HIT_CHOICES: SkinStyle['hit'][] = [...HIT_STYLES, 'flipbook', 'none'];
const CAMERAS: CameraId[] = ['SDVX', 'FLAT', 'LOW', 'PLANE'];
const FONTS = Object.keys(HUD_FONTS) as HudFont[];
/** Manifest texture ids look like "glass/note" or "fx/keyBeam". */
const TEXTURE_ID = /^[a-z0-9]+\/[A-Za-z0-9]+$/;

const pick = <T,>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const renamed = <T,>(v: unknown, renames: Record<string, T>): T | undefined => (typeof v === 'string' && Object.hasOwn(renames, v) ? renames[v] : undefined);
const num = (v: unknown, min: number, max: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
const colour = (v: unknown): string | undefined => (typeof v === 'string' && HEX.test(v) ? v : undefined);

/** A user skin's judgement and combo type; what is missing or malformed is the default's. */
function sanitizeType(raw: unknown): HudType {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_HUD_TYPE;
  const type: HudType = {
    font: pick(r.font, FONTS, d.font),
    size: num(r.size, 16, 96, d.size),
    combo: num(r.combo, 16, 128, d.combo),
    tracking: num(r.tracking, -0.1, 0.3, d.tracking),
    max: colour(r.max) ?? d.max,
    outline: colour(r.outline) ?? d.outline,
    stroke: num(r.stroke, 0, 16, d.stroke),
  };
  if (r.split === true) type.split = true;
  if (r.inline === true) type.inline = true;
  if (r.skew !== undefined) type.skew = num(r.skew, -20, 20, 0);
  if (colour(r.bar)) type.bar = colour(r.bar);
  return type;
}

/** A user skin's drawing style; what is missing or malformed is the default skin's. */
function sanitizeStyle(raw: unknown): SkinStyle | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const d = FLAT.style as SkinStyle;
  const part = (v: unknown) => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});
  const rails = part(r.rails);
  const judge = part(r.judge);
  const track = part(r.track);
  const style: SkinStyle = {
    note: pick(r.note, NOTE_STYLES, renamed(r.note, NOTE_RENAMES) ?? d.note),
    long: pick(r.long, LONG_STYLES, renamed(r.long, LONG_RENAMES) ?? d.long),
    // a skin of an earlier version names the key cap that stood under the judge line
    deck: pick(r.deck, DECK_STYLES, typeof r.cap === 'string' && Object.hasOwn(CAP_DECKS, r.cap) ? CAP_DECKS[r.cap] : d.deck),
    beam: pick(r.beam, BEAM_STYLES, d.beam),
    hit: pick(r.hit, HIT_CHOICES, d.hit),
    rails: { width: num(rails.width, 1, 20, d.rails.width) },
    judge: { height: num(judge.height, 2, 20, d.judge.height) },
    track: { tint: num(track.tint, 0, 0.5, d.track.tint) },
    camera: pick(r.camera, CAMERAS, d.camera),
    type: sanitizeType(r.type),
  };
  if (r.noteDepth !== undefined) style.noteDepth = num(r.noteDepth, 0.3, 1.5, 1);
  if (r.side !== undefined) style.side = pick(r.side, SIDE_STYLES, 'bar');
  if (rails.glow !== undefined) style.rails.glow = num(rails.glow, 0, 40, 0);
  if (rails.bevel === true) style.rails.bevel = true;
  if (colour(judge.under)) style.judge.under = colour(judge.under);
  if (colour(judge.over)) style.judge.over = colour(judge.over);
  if (judge.glow === true) style.judge.glow = true;
  if (track.scratchTint !== undefined) style.track.scratchTint = num(track.scratchTint, 0, 0.5, 0);
  for (const flag of ['stripes', 'edges', 'facets'] as const) if (track[flag] === true) style.track[flag] = true;
  if (r.frame === 'gunmetal' || r.frame === 'street') style.frame = r.frame;
  return style;
}

/** Accepts a user skin (e.g. pasted JSON); unknown or malformed fields fall back to the default. */
export function sanitizeSkin(raw: unknown): Skin | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const c = (typeof r.colors === 'object' && r.colors !== null ? r.colors : {}) as Record<string, unknown>;
  const base = FLAT.colors;
  const colors: SkinColors = { ...base, lanes: undefined };
  delete colors.lanes;
  for (const key of Object.keys(base) as (keyof SkinColors)[]) {
    if (key !== 'lanes' && colour(c[key])) (colors as unknown as Record<string, string>)[key] = c[key] as string;
  }
  if (typeof c.lanes === 'object' && c.lanes !== null) {
    const lanes: Partial<Record<LaneColor, string>> = {};
    for (const key of LANE_KEYS) {
      const v = colour((c.lanes as Record<string, unknown>)[key]);
      if (v) lanes[key] = v;
    }
    colors.lanes = lanes;
  }
  const skin: Skin = {
    id: 'custom',
    label: typeof r.label === 'string' && r.label.trim() ? r.label.trim().slice(0, 40) : '사용자 스킨',
    noteShape: pick(r.noteShape, SHAPES, 'box'),
    laneLayout: pick(r.laneLayout, LAYOUTS, 'mode'),
    hitEffect: pick(r.hitEffect, EFFECTS, 'burst'),
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
  const style = sanitizeStyle(r.style);
  if (style) skin.style = style;
  return skin;
}

/** The drawing style of a skin; a user skin of an earlier version gets one from its shape and effect. */
export function styleOf(skin: Skin): SkinStyle {
  if (skin.style) return skin.style;
  const hit = skin.hitEffect === 'none' ? 'none' : skin.hitEffect === 'sprite' ? 'flipbook' : skin.hitEffect === 'ring' ? 'hex' : 'flash';
  return {
    note: skin.noteShape === 'round' ? 'round' : 'flat',
    long: skin.noteShape === 'round' ? 'capsule' : 'solid',
    deck: 'line',
    beam: 'fade',
    hit,
    rails: { width: 10 },
    judge: { height: 12, glow: true },
    track: { tint: 0.08 },
    camera: 'SDVX',
    type: DEFAULT_HUD_TYPE,
  };
}

/**
 * The parts of the gear a player picks apart from the skin (설정 → 기어): 'skin' keeps the skin's
 * own; a long note 'auto' goes with the note (the skin's own while the note is the skin's, else its
 * family's, see LONG_OF).
 */
export interface SkinParts {
  note: NoteStyle | 'skin';
  long: LongStyle | 'auto';
  side: SideStyle | 'skin';
  deck: DeckStyle | 'skin';
  hit: HitStyle | 'skin';
}

export const DEFAULT_PARTS: SkinParts = { note: 'skin', long: 'auto', side: 'skin', deck: 'skin', hit: 'skin' };

/** Saved parts; what is missing or unknown is the skin's. */
export function sanitizeParts(raw: unknown): SkinParts {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    note: pick(r.note, ['skin', ...NOTE_STYLES] as const, 'skin'),
    long: pick(r.long, ['auto', ...LONG_STYLES] as const, 'auto'),
    side: pick(r.side, ['skin', ...SIDE_STYLES] as const, 'skin'),
    deck: pick(r.deck, ['skin', ...DECK_STYLES] as const, 'skin'),
    hit: pick(r.hit, ['skin', ...HIT_STYLES] as const, 'skin'),
  };
}

/** The skin with the parts the player picked in place of its own (the skin itself when none is). */
export function withParts(skin: Skin, parts: SkinParts): Skin {
  if (parts.note === 'skin' && parts.long === 'auto' && parts.side === 'skin' && parts.deck === 'skin' && parts.hit === 'skin') return skin;
  const own = styleOf(skin);
  const note = parts.note === 'skin' ? own.note : parts.note;
  const long = parts.long !== 'auto' ? parts.long : parts.note === 'skin' ? own.long : LONG_OF[note];
  const style: SkinStyle = { ...own, note, long, deck: parts.deck === 'skin' ? own.deck : parts.deck, hit: parts.hit === 'skin' ? own.hit : parts.hit };
  const side = parts.side === 'skin' ? own.side : parts.side;
  if (side) style.side = side;
  return { ...skin, style };
}

export function skinById(id: string, custom: unknown): Skin {
  if (id === 'custom') return sanitizeSkin(custom) ?? FLAT;
  const name = SKIN_RENAMES[id] ?? id;
  return BUILTIN_SKINS.find((s) => s.id === name) ?? FLAT;
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
