import type { GearStyle } from './deckArt';
import { DEFAULT_HUD_TYPE, type HudType, type SkinStyle } from './skins';

/**
 * What a picked gear brings to the HUD beside the track, as its object would print it: the
 * judgement and combo type (unless the player keeps the track's own, 기본: 설정 → 기어 → 판정·콤보
 * 글꼴), and the gauge's name. The gauge's look, the score panel's housing and the readouts' digits are the
 * gear's in the HUD's styles (styles.css: .hud[data-gear]).
 */

/** Which type writes the judgement and the combo: the picked gear's, or the track's own (기본; saved as 'skin'). */
export type HudTypeSource = 'gear' | 'skin';
export const HUD_TYPE_SOURCES: HudTypeSource[] = ['gear', 'skin'];

/**
 * PRISM (크리스털): slanted geometric letters cut into flat planes at one angle, white, pale ice blue,
 * steel blue and a touch of lavender, a ground edge of white along their tops and a thin navy outline;
 * "MAX" in the white planes, its percent in ice blue, lower ones steel blue then lavender, a break ruby
 * with one crack (HudType.fill);
 * SKY (하늘): a rounded, friendly italic, white easing to sky blue at its foot, in a thin navy outline;
 * "MAX" in white, its percent cyan, lower ones sky blue then periwinkle, a break a sunset coral (HudType.fill);
 * FIRE (파이어스타터): a tall, tight italic as a tour poster's, white-hot at its top easing through orange
 * to red at its foot in a black outline; "MAX" in chrome, its percent the same heat, lower ones cooling
 * to amber, rose and ash, a break a cold steel (HudType.fill);
 * STANDARD: white condensed digits, "MAX" in white and its percent in the gear's cyan;
 * CABINET: red seven-segment digits, the judgement in heavy slanted letters, white outlined in red;
 * RECEIVER: amber seven-segment digits (a vacuum-fluorescent readout's), the judgement in a fine
 * condensed sans, warm white; NAJEON: gold serif digits and capitals; KEYBOARD: a pixel font (its
 * OLED's), the judgement cream over an orange bar; RACING: slanted white digits as a dash prints
 * them, a red bar under the judgement; ORBITAL: the judgement in white stencil capitals, the combo
 * in green seven-segment digits; PIANO: ivory in a Didone's bold italic, as a score prints its
 * dynamics, outlined in ebony over a brass bar, "MAX" in white and its percent brass; RAWGLASS: wide
 * geometric capitals in white, "MAX" white and its percent silver, outlined in gunmetal.
 */
export const GEAR_TYPES: Record<GearStyle, HudType> = {
  prism: { font: 'Exo 2', size: 42, combo: 60, tracking: 0.03, max: '#7cc8ff', outline: '#101a3d', stroke: 5, split: true, comboColor: '#ffffff', fill: 'crystal' },
  sky: { font: 'Nunito', size: 42, combo: 62, tracking: 0.02, max: '#3fe3e6', outline: '#0c1c33', stroke: 5, split: true, comboColor: '#ffffff', fill: 'sky' },
  fire: { font: 'Barlow Condensed Italic', size: 48, combo: 70, tracking: 0.01, max: '#ff7a1a', outline: '#0b0b0d', stroke: 6, split: true, comboColor: '#ffffff', fill: 'fire' },
  standard: { font: 'Barlow Condensed', size: 44, combo: 64, tracking: 0.04, max: '#37e2ff', outline: '#0b0c10', stroke: 6, split: true },
  cabinet: { font: 'Exo 2', size: 44, combo: 58, tracking: 0.02, max: '#ffffff', outline: '#c8141c', stroke: 7, comboFont: 'DSEG7 Classic', comboColor: '#ff2a2a', comboOutline: '#140405' },
  receiver: { font: 'Barlow Condensed', size: 42, combo: 54, tracking: 0.1, max: '#fff1dc', outline: '#140d06', stroke: 5, comboFont: 'DSEG7 Classic', comboColor: '#ffb547' },
  najeon: { font: 'Cinzel', size: 40, combo: 60, tracking: 0.06, max: '#e8c77e', outline: '#0b0a09', stroke: 5, comboColor: '#e2c27a' },
  keyboard: { font: 'Silkscreen', size: 34, combo: 52, tracking: 0.02, max: '#fff4e6', outline: '#050506', stroke: 4, bar: '#ff8a1e' },
  racing: { font: 'Chakra Petch', size: 44, combo: 60, tracking: 0.02, max: '#ffffff', outline: '#0a0a0b', stroke: 6, bar: '#e3242b' },
  orbital: { font: 'Saira Stencil One', size: 42, combo: 56, tracking: 0.06, max: '#ffffff', outline: '#14181a', stroke: 5, comboFont: 'DSEG7 Classic', comboColor: '#3dff6e', comboOutline: '#050805' },
  piano: { font: 'Bodoni Moda', size: 44, combo: 62, tracking: 0.02, max: '#e2bf72', outline: '#0a0909', stroke: 5, split: true, bar: '#c9a45c', comboColor: '#f6f0e3' },
  rawglass: { font: 'Orbitron', size: 36, combo: 52, tracking: 0.08, max: '#c9d2dd', outline: '#16181c', stroke: 5, split: true, comboColor: '#f4f7fa' },
};

/** The name each gear prints by its gauge (STANDARD's plain gauge has none). */
export const GAUGE_NAMES: Record<GearStyle, string | null> = {
  prism: 'FEVER',
  sky: 'FEVER',
  fire: 'FEVER',
  standard: 'FEVER',
  cabinet: 'GROOVE',
  receiver: 'SIGNAL',
  najeon: '흥',
  keyboard: 'CHARGE',
  racing: 'FUEL',
  orbital: 'O2',
  piano: 'FORTE',
  rawglass: 'CLARITY',
};

/** The judgement and combo type of a play: the gear's, unless the player keeps the track's own. */
export function hudTypeFor(style: Pick<SkinStyle, 'deck'>, source: HudTypeSource): HudType {
  return source === 'gear' ? GEAR_TYPES[style.deck] : DEFAULT_HUD_TYPE;
}
