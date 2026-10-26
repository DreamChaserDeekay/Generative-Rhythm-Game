import { keyModes, type LaneColor, type LaneConfig } from '../engine/config';
import type { KeyModeId } from '../engine/types';
import { LANE_PALETTES, type Palette } from './palette';
import { laneColorsFor, type Skin } from './skins';

/**
 * Note colours by lane (설정 → 노트 색). A preset gives every lane of every key mode its colour;
 * 기본 (SKIN_COLORS) leaves them to the palette and the skin (laneColorsFor). The built-in presets
 * stay as they are: a colour changed on one goes to a copy of it, a preset of the player's own.
 */
export interface ColorPreset {
  id: string;
  name: string;
  /** #rrggbb of each lane of each key mode, left to right. */
  lanes: Record<KeyModeId, string[]>;
}

/** The palette's and the skin's colours (기본). */
export const SKIN_COLORS = 'skin';
/** So many presets of the player's own are kept. */
export const MAX_USER_PRESETS = 20;
export const PRESET_NAME_MAX = 20;

const KEY_MODE_IDS = Object.keys(keyModes) as KeyModeId[];
const USER_ID = /^user-(\d{1,4})$/;
const HEX = /^#[0-9a-f]{6}$/;

export const hexValue = (colour: string): number => parseInt(colour.slice(1), 16);
export const hexString = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

/** A preset made from what each lane is: its colour in the key mode's layout, and the hand that plays it. */
function preset(id: string, name: string, colourOf: (lane: LaneConfig) => string): ColorPreset {
  return { id, name, lanes: Object.fromEntries(KEY_MODE_IDS.map((m) => [m, keyModes[m].lanes.map(colourOf)])) as Record<KeyModeId, string[]> };
}

const byRole = (colours: Record<LaneColor, string>) => (lane: LaneConfig) => colours[lane.color];

/** 좌우 손: the left hand's lanes in blues, the right hand's in oranges (white keys light, the others strong), the middle key white. */
const HANDS = { L: ['#cfe2ff', '#4f8dff'], R: ['#ffe0c4', '#ff9a3c'] } as const;
const byHand = (lane: LaneConfig): string => (lane.hand === 'T' ? '#f4f4f4' : HANDS[lane.hand][lane.kind === 'key' && lane.color === 'white' ? 0 : 1]);

/** The presets that come with the game, after 기본. None repeats the palettes' or the skins' lane colours. */
export const BUILTIN_PRESETS: ColorPreset[] = [
  // greens, teal and violet: no palette nor skin has greens
  preset('aurora', '오로라', byRole({ white: '#d4fff0', blue: '#2ee0a0', gold: '#c7a2ff', scratch: '#27d4e8', sideL: '#27d4e8', sideR: '#c7a2ff' })),
  // warm colours alone, no blue light: for play in a dark room
  preset('amber', '앰버', byRole({ white: '#fff0d8', blue: '#ff7a29', gold: '#ffcd45', scratch: '#ff4f3a', sideL: '#ffb347', sideR: '#ff4f3a' })),
  // the hand that plays a lane, in blue and orange: a pair colour-blind eyes tell apart too
  preset('hands', '좌우 손', byHand),
];

/** A built-in preset or one of the player's own by its id; null for 기본 (or an id no preset has). */
export function presetById(id: string, own: readonly ColorPreset[]): ColorPreset | null {
  if (id === SKIN_COLORS) return null;
  return BUILTIN_PRESETS.find((p) => p.id === id) ?? own.find((p) => p.id === id) ?? null;
}

export const isUserPreset = (id: string): boolean => USER_ID.test(id);

/** Every lane's colour in a key mode: the preset's, or for 기본 the palette's and the skin's. */
export function noteColorsFor(skin: Skin, palette: Palette, mode: KeyModeId, id: string, own: readonly ColorPreset[]): number[] {
  const chosen = presetById(id, own);
  return chosen ? chosen.lanes[mode].map(hexValue) : laneColorsFor(skin, palette, keyModes[mode]);
}

/** The colours of every key mode as a preset keeps them (기본's from the palette and the skin): what a new preset starts from. */
export function lanesOf(skin: Skin, palette: Palette, id: string, own: readonly ColorPreset[]): Record<KeyModeId, string[]> {
  return Object.fromEntries(KEY_MODE_IDS.map((m) => [m, noteColorsFor(skin, palette, m, id, own).map(hexString)])) as Record<KeyModeId, string[]>;
}

/** A preset of the player's own with these colours, on the next free number ("내 색 3"). */
export function newPreset(own: readonly ColorPreset[], lanes: Record<KeyModeId, string[]>): ColorPreset {
  const n = Math.max(0, ...own.map((p) => Number(USER_ID.exec(p.id)?.[1] ?? 0))) + 1;
  return { id: `user-${n}`, name: `내 색 ${n}`, lanes: Object.fromEntries(KEY_MODE_IDS.map((m) => [m, [...lanes[m]]])) as Record<KeyModeId, string[]> };
}

/** The preset with one lane of one key mode in another colour. */
export function withLaneColor(p: ColorPreset, mode: KeyModeId, lane: number, colour: string): ColorPreset {
  return { ...p, lanes: { ...p.lanes, [mode]: p.lanes[mode].map((c, i) => (i === lane ? colour : c)) } };
}

/** A colour typed in: #rrggbb or #rgb, with or without the #, in either case; null when it is none. */
export function parseColour(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/.test(t)) return `#${t}`;
  if (/^[0-9a-f]{3}$/.test(t)) return `#${[...t].map((c) => c + c).join('')}`;
  return null;
}

/** The player's presets as saved: malformed ones are left out, a lane without a colour takes the default palette's. */
export function sanitizePresets(raw: unknown): ColorPreset[] {
  if (!Array.isArray(raw)) return [];
  const out: ColorPreset[] = [];
  for (const entry of raw) {
    if (out.length >= MAX_USER_PRESETS) break;
    if (typeof entry !== 'object' || entry === null) continue;
    const { id, name, lanes } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || !USER_ID.test(id) || out.some((p) => p.id === id)) continue;
    const saved = (typeof lanes === 'object' && lanes !== null ? lanes : {}) as Record<string, unknown>;
    const colours = (m: KeyModeId) => {
      const list = Array.isArray(saved[m]) ? (saved[m] as unknown[]) : [];
      return keyModes[m].lanes.map((lane, i) => {
        const c = list[i];
        return typeof c === 'string' && HEX.test(c) ? c : hexString(LANE_PALETTES.default[lane.color]);
      });
    };
    out.push({
      id,
      name: typeof name === 'string' && name.trim() ? name.trim().slice(0, PRESET_NAME_MAX) : `내 색 ${id.slice(5)}`,
      lanes: Object.fromEntries(KEY_MODE_IDS.map((m) => [m, colours(m)])) as Record<KeyModeId, string[]>,
    });
  }
  return out;
}

/** A colour as hue (0–359°), saturation and value (0–100), each a whole number. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

export function toHsv(colour: string): Hsv {
  const n = hexValue(colour);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (Math.round(h * 60) + 360) % 360, s: max === 0 ? 0 : Math.round((d / max) * 100), v: Math.round(max * 100) };
}

export function fromHsv({ h, s, v }: Hsv): string {
  const [sv, vv] = [s / 100, v / 100];
  const f = (k: number) => {
    const at = (k + h / 60) % 6;
    return Math.round(255 * (vv - vv * sv * Math.max(0, Math.min(at, 4 - at, 1))));
  };
  return hexString((f(5) << 16) | (f(3) << 8) | f(1));
}

/** Text over a swatch of the colour: dark on a light one, light on a dark one (relative luminance past where both read alike). */
export function lightColour(colour: string): boolean {
  const n = hexValue(colour);
  const lin = (c: number) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255) > 0.18;
}
