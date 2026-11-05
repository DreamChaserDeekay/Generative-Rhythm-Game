import type { KeyModeConfig, LaneColor } from '../engine/config';
import { GEAR_STYLES, type DeckStyle } from './deckArt';
import { LANE_COLORS } from './palette';
import { HIT_STYLES, NOTE_STYLES, SIDE_STYLES, type HitStyle, type NoteStyle, type SideStyle } from './tintArt';

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
  /** Overrides for lane colours. */
  lanes?: Partial<Record<LaneColor, string>>;
}

/** The fonts bundled for a skin's (or a gear's) judgement and combo, each in the one weight and style shipped. */
export const HUD_FONTS = {
  'Barlow Condensed': { weight: 700, italic: false },
  'Bebas Neue': { weight: 400, italic: false },
  'Chakra Petch': { weight: 700, italic: true },
  'Russo One': { weight: 400, italic: false },
  Orbitron: { weight: 800, italic: false },
  'Exo 2': { weight: 700, italic: true },
  'Baloo 2': { weight: 800, italic: false },
  Cinzel: { weight: 700, italic: false },
  // seven-segment digits (the arcade cabinet's, the receiver's and the orbital panel's readouts)
  'DSEG7 Classic': { weight: 700, italic: false },
  // the custom keyboard's OLED pixels, the orbital panel's stencil
  Silkscreen: { weight: 400, italic: false },
  'Saira Stencil One': { weight: 400, italic: false },
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
  /** The best judgement's colour. */
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
  /** The combo in a font, a colour and an outline of its own (a gear's readout digits); else in the judgement's font, white, outlined as it is. */
  comboFont?: HudFont;
  comboColor?: string;
  comboOutline?: string;
}

/**
 * How a skin is drawn in code (render/tintArt.ts): every part a picture the lane colour tints.
 * Sizes in px are px of the approved sheets' track, 73.65 px to a track unit at the judge line.
 */
export interface SkinStyle {
  /** The notes; long notes are of the note's family (LONG_OF). */
  note: NoteStyle;
  /** How the side lanes' notes are drawn (default 'bar': as the note style draws them; over the keys, see-through bars). */
  side?: SideStyle;
  /** The gear under the judge line: its plate and the lane lights that light with the keys (render/deckArt.ts). */
  deck: DeckStyle;
  beam: BeamStyle;
  /** 'flipbook' plays the skin's hitBurst / hitHold textures (a code flash without them). */
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
      // drawn at 95%: about a third white over the track, so a bar stands out from the lane dividers
      bar: over('#ffffff', 0.35, d.near),
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
 * its second line there, and never nearer than under a 6 px line.
 */
export function deckTop(judge: SkinStyle['judge']): number {
  return Math.max(6, judge.height / 2 + (judge.under ? EXTRA_LINE : 0) + 3);
}

/** The track's type (FLAT's). */
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

/** The track's look (기본): its colours, rails, judge line and type; the notes, side notes, gear and hit are the parts picked (withParts). */
export const BASE_SKIN: Skin = FLAT;

const pick = <T,>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

/** The drawing style of a skin (the track's own where it has none). */
export function styleOf(skin: Skin): SkinStyle {
  return skin.style ?? (FLAT.style as SkinStyle);
}

/**
 * The parts of the gear a player picks (설정 → 노트 and 기어), drawn over the track (which keeps its
 * colours, rails and type). Long notes go with the note (its family's, see LONG_OF).
 */
export interface SkinParts {
  note: NoteStyle;
  side: SideStyle;
  deck: DeckStyle;
  hit: HitStyle;
}

/** What a player can pick: the instrument-colour note, gear and effect and the plain line gear are the skins' own only. */
export const PART_NOTES = NOTE_STYLES.filter((s) => s !== 'stem');
export const PART_DECKS: DeckStyle[] = GEAR_STYLES;
export const PART_HITS = HIT_STYLES.filter((s) => s !== 'stemflash');

/** What a player starts with: the flat notes, the side notes as bars, the standard gear and the flash. */
export const DEFAULT_PARTS: SkinParts = { note: 'flat', side: 'bar', deck: 'standard', hit: 'flash' };

/**
 * Saved parts; what is missing or no longer picked (an earlier version's 'skin', its gears that are
 * gone and the piano note among them) is the default, and an earlier version's gear colour
 * (deckColour) is dropped: each gear has one look.
 */
export function sanitizeParts(raw: unknown): SkinParts {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    note: pick(r.note, PART_NOTES, DEFAULT_PARTS.note),
    side: pick(r.side, SIDE_STYLES, DEFAULT_PARTS.side),
    deck: pick(r.deck, PART_DECKS, DEFAULT_PARTS.deck),
    hit: pick(r.hit, PART_HITS, DEFAULT_PARTS.hit),
  };
}

/** The skin with the parts the player picked in place of its own. */
export function withParts(skin: Skin, parts: SkinParts): Skin {
  return { ...skin, style: { ...styleOf(skin), note: parts.note, side: parts.side, deck: parts.deck, hit: parts.hit } };
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

/** Colour of every lane: the skin's by lane colour (else LANE_COLORS'), then the skin's layout. */
export function laneColorsFor(skin: Skin, mode: KeyModeConfig): number[] {
  const overrides = skin.colors.lanes ?? {};
  const colorOf = (c: LaneColor) => (overrides[c] ? hex(overrides[c] as string) : LANE_COLORS[c]);
  const keys = mode.lanes.filter((l) => l.kind === 'key').length;
  let k = 0;
  return mode.lanes.map((lane) => {
    if (lane.kind !== 'key') return colorOf(lane.color);
    const index = k++;
    if (skin.laneLayout === 'uniform') return colorOf('white');
    if (skin.laneLayout === 'rainbow') return hsl((index / Math.max(1, keys)) * 300, 0.75, 0.64);
    return colorOf(lane.color);
  });
}
