import type { KeyModeConfig, LaneColor } from '../engine/config';
import type { GearStyle } from './deckArt';
import { GEAR_STYLES } from './deckArt';
import { LANE_COLORS } from './palette';
import { HIT_STYLES, NOTE_STYLES, SIDE_STYLES, type HitStyle, type NoteStyle, type SideStyle } from './tintArt';

/** The track's colours (기본): its floor near and far, the lines on it and the covers. */
export interface SkinColors {
  trackNear: string;
  trackFar: string;
  fog: string;
  divider: string;
  bar: string;
  cover: string;
  coverEdge: string;
  /** Overrides for lane colours. */
  lanes?: Partial<Record<LaneColor, string>>;
}

/** The fonts bundled for the judgement and combo (the track's or a gear's), each in the one weight and style shipped. */
export const HUD_FONTS = {
  'Barlow Condensed': { weight: 700, italic: false },
  'Chakra Petch': { weight: 700, italic: true },
  Orbitron: { weight: 800, italic: false },
  'Exo 2': { weight: 700, italic: true },
  Cinzel: { weight: 700, italic: false },
  // seven-segment digits (the arcade cabinet's, the receiver's and the orbital panel's readouts)
  'DSEG7 Classic': { weight: 700, italic: false },
  // the custom keyboard's OLED pixels, the orbital panel's stencil
  Silkscreen: { weight: 400, italic: false },
  'Saira Stencil One': { weight: 400, italic: false },
  // the piano's: a score's dynamics, a Didone in bold italic
  'Bodoni Moda': { weight: 700, italic: true },
} as const;
export type HudFont = keyof typeof HUD_FONTS;

/**
 * How the judgement and combo are written on the track (the sheets' type; sizes are screen px on
 * a 720 px high screen): the best judgement's colour, an outline, and a few house manners.
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
  /** A bar of this colour under the judgement. */
  bar?: string;
  /**
   * The letters cut into flat planes, as a stone's facets (the crystal skin's): the HUD writes each
   * word so its styles can lay the planes over it (Hud.ts: data-cut; styles.css: .hud-cut), and the
   * judgements' colours are that cut's own.
   */
  cut?: 'crystal';
  /** The combo in a font, a colour and an outline of its own (a gear's readout digits); else in the judgement's font, white, outlined as it is. */
  comboFont?: HudFont;
  comboColor?: string;
  comboOutline?: string;
}

/**
 * The parts of the gear a player picks (설정 → 노트 and 기어), drawn over the track (which keeps its
 * colours): every part a picture the lane colour tints (render/tintArt.ts), drawn from art where its
 * pictures loaded (render/styleArt.ts). Long notes go with the note (its family's, see LONG_OF).
 */
export interface SkinParts {
  /** The notes; long notes are of the note's family (LONG_OF). */
  note: NoteStyle;
  /** How the side lanes' notes are drawn ('bar': as the note style draws them; over the keys, see-through bars). */
  side: SideStyle;
  /** The gear under the judge line and down the track's edges (render/deckArt.ts). */
  deck: GearStyle;
  hit: HitStyle;
}

/** How the track is drawn: the parts picked (sizes in px are px of the approved sheets' track, 73.65 px to a track unit at the judge line). */
export type SkinStyle = SkinParts;

/** The track (기본): its colours, and the parts picked over it (withParts). */
export interface Skin {
  colors: SkinColors;
  style: SkinStyle;
}

/** `fg` at `alpha` over `bg` (both #rrggbb). */
function over(fg: string, alpha: number, bg: string): string {
  const [a, b] = [hex(fg), hex(bg)];
  const ch = (shift: number) => Math.round(((a >> shift) & 255) * alpha + ((b >> shift) & 255) * (1 - alpha));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

/** The track's type (기본's, 설정 → 기어 → 판정·콤보 글꼴). */
export const DEFAULT_HUD_TYPE: HudType = { font: 'Barlow Condensed', size: 44, combo: 64, tracking: 0.04, max: '#7cf7ff', outline: '#0b0c10', stroke: 6 };

/** What a player starts with, the default skin (기본): the plain notes, the side notes as bars, the standard gear and the flash. */
export const DEFAULT_PARTS: SkinParts = { note: 'flat', side: 'bar', deck: 'standard', hit: 'flash' };

const NEAR = '#15171f';
const FAR = '#0d0f14';

/** The track's look (기본), with the parts a player starts with; the parts picked go over it (withParts). */
export const BASE_SKIN: Skin = {
  colors: {
    trackNear: NEAR,
    trackFar: FAR,
    fog: FAR,
    // the lane dividers white at 10 % over the track; a bar line a third white, so it stands out from them
    divider: over('#ffffff', 0.1, NEAR),
    bar: over('#ffffff', 0.35, NEAR),
    cover: over('#000000', 0.3, FAR),
    coverEdge: '#37e2ff',
    lanes: { white: '#eaf6ff', blue: '#4fc3ff', gold: '#ffc94f', scratch: '#ff5c8a' },
  },
  style: { ...DEFAULT_PARTS },
};

const pick = <T,>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

/**
 * Saved parts; what is missing or no longer picked (an earlier version's 'skin', its gears that are
 * gone and the piano note among them) is the default, and an earlier version's gear colour
 * (deckColour) is dropped: each gear has one look.
 */
export function sanitizeParts(raw: unknown): SkinParts {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    note: pick(r.note, NOTE_STYLES, DEFAULT_PARTS.note),
    side: pick(r.side, SIDE_STYLES, DEFAULT_PARTS.side),
    deck: pick(r.deck, GEAR_STYLES, DEFAULT_PARTS.deck),
    hit: pick(r.hit, HIT_STYLES, DEFAULT_PARTS.hit),
  };
}

/** The track with the parts the player picked. */
export function withParts(skin: Skin, parts: SkinParts): Skin {
  return { ...skin, style: { note: parts.note, side: parts.side, deck: parts.deck, hit: parts.hit } };
}

export function hex(color: string): number {
  return parseInt(color.slice(1), 16);
}

/** Colour of every lane: the track's by lane colour (else LANE_COLORS'). */
export function laneColorsFor(skin: Skin, mode: KeyModeConfig): number[] {
  const overrides = skin.colors.lanes ?? {};
  return mode.lanes.map((lane) => (overrides[lane.color] ? hex(overrides[lane.color] as string) : LANE_COLORS[lane.color]));
}
