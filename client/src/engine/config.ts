import judgementJson from '@config/judgement.json';
import gaugeJson from '@config/gauge.json';
import keymodesJson from '@config/keymodes.json';
import cameraJson from '@config/camera.json';
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
  height: number;
  distance: number;
  lookAhead: number;
  fov: number;
}

export interface CameraConfig {
  trackWidth: number;
  trackLength: number;
  presets: Record<string, CameraPreset>;
  default: string;
  /** Strength of the chart's camera cues (see render/cameraFx.ts). */
  fx: { maxTiltDeg: number; zoomDepth: number };
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
