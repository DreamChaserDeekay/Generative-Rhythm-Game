import judgementJson from '@config/judgement.json';
import gaugeJson from '@config/gauge.json';
import keymodesJson from '@config/keymodes.json';
import cameraJson from '@config/camera.json';
import difficultyJson from '@config/difficulty.json';
import type { KeyModeId } from './types';

export type JudgementModeId = 'NORMAL' | 'HARD' | 'MAX';

export interface GradeConfig {
  percent: number;
  label: string;
  windowMs: number;
}

export interface JudgementConfig {
  modes: Record<JudgementModeId, { label: string; scale: number }>;
  grades: GradeConfig[];
  breakLabel: string;
  earlyBreakExtraMs: number;
  hold: { tickBeats: number; releaseGraceMs: number };
  missMarginMs: number;
  sideMissPercent: number;
}

export type GaugeTypeId = 'ASSIST_EASY' | 'EASY' | 'NORMAL' | 'HARD' | 'EX_HARD' | 'HAZARD';

export type ClearLamp = 'FAILED' | 'ASSIST CLEAR' | 'EASY CLEAR' | 'CLEAR' | 'HARD CLEAR' | 'EX-HARD CLEAR' | 'MAX COMBO' | 'PERFECT PLAY';

export interface GaugeRule {
  label: string;
  start: number;
  clear: number;
  failAtZero: boolean;
  total?: { base: number; perEvent: number; max: number };
  gainScale?: number;
  fixedGain?: number;
  breakPenalty: number;
  lowHealth?: { below: number; factor: number };
  lamp: ClearLamp;
}

export type LaneColor = 'white' | 'blue' | 'gold' | 'scratch' | 'sideL' | 'sideR';
export type LaneKind = 'key' | 'scratch' | 'side';

export interface LaneConfig {
  id: string;
  kind: LaneKind;
  color: LaneColor;
  hand: 'L' | 'R' | 'T';
  finger: number;
  width: number;
}

export interface KeyModeConfig {
  label: string;
  lanes: LaneConfig[];
  bindings: Record<string, string[]>;
}

export interface CameraPreset {
  label: string;
  /**
   * Orthographic: parallel rays (the plane preset), so the rails stay parallel and the notes keep
   * one speed up the whole track; `fov` then sizes the view as it would at the target. Default perspective.
   */
  projection?: 'perspective' | 'orthographic';
  height: number;
  distance: number;
  lookAhead: number;
  fov: number;
  /** Share of the track's length up it where the floor's fog starts (default 0.55, see fogStartZ). */
  fogStart?: number;
}

export interface CameraConfig {
  trackWidth: number;
  trackLength: number;
  /** Where the play puts the judge line: this share of the screen's height from the top. */
  judgeLineY: number;
  presets: Record<string, CameraPreset>;
  default: string;
  /** Strength of the chart's camera cues (see render/cameraFx.ts). */
  fx: { maxTiltDeg: number; zoomDepth: number; viewDepth: number };
}

export const judgementConfig = judgementJson as unknown as JudgementConfig;
export const gaugeRules = gaugeJson.types as unknown as Record<GaugeTypeId, GaugeRule>;
export const gaugeTypeIds = Object.keys(gaugeJson.types) as GaugeTypeId[];
export const defaultGauge = gaugeJson.default as GaugeTypeId;
export const lampOrder = gaugeJson.lampOrder as ClearLamp[];
export const keyModes = keymodesJson.modes as Record<KeyModeId, KeyModeConfig>;
export const enabledKeyModes = keymodesJson.enabled as KeyModeId[];
export const cameraConfig = cameraJson as CameraConfig;

/** Lanes that DJMAX treats as side tracks (a miss there is MAX 1%, never BREAK). */
export function sideLanesOf(mode: KeyModeId): number[] {
  return keyModes[mode].lanes.flatMap((l, i) => (l.kind === 'side' ? [i] : []));
}

/** A difficulty tier (NORMAL … MASTER). */
export interface DifficultyTier {
  id: string;
  label: string;
  short: string;
  /** Typical level range (a default chart aims at its middle). */
  levels: [number, number];
  /** Badge colour. */
  color: string;
}

const TIER_COLORS: Record<string, string> = { NORMAL: '#4fc3ff', HARD: '#ffc94f', EXPERT: '#ff6f8a', MASTER: '#c58bff' };
const TIER_SHORT: Record<string, string> = { NORMAL: 'NM', HARD: 'HD', EXPERT: 'EX', MASTER: 'MX' };
const presets = difficultyJson.presets as unknown as Record<string, { levels: [number, number] }>;

export const difficultyTiers: DifficultyTier[] = difficultyJson.order.map((t) => ({
  id: t,
  label: t,
  short: TIER_SHORT[t] ?? t,
  levels: presets[t].levels,
  color: TIER_COLORS[t] ?? '#9fb4ff',
}));
export const maxLevel = difficultyJson.levelEffectiveNps.length;

/** The tier of a stored difficulty, else the first (an old EASY plays as NORMAL). */
export function tierOf(difficulty: string): DifficultyTier {
  return difficultyTiers.find((t) => t.id === difficulty) ?? difficultyTiers[0];
}
