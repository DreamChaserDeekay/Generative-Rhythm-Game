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
}

export interface GaugeRule {
  label: string;
  start: number;
  clear: number;
  failAtZero: boolean;
  total: { base: number; perEvent: number; max: number };
  breakPenalty: number;
}

export type LaneColor = 'white' | 'blue' | 'gold' | 'scratch';

export interface LaneConfig {
  id: string;
  kind: 'key' | 'scratch';
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
}

export const judgementConfig = judgementJson as unknown as JudgementConfig;
export const gaugeRules = gaugeJson.types as Record<string, GaugeRule>;
export const defaultGauge = gaugeJson.default;
export const keyModes = keymodesJson.modes as Record<KeyModeId, KeyModeConfig>;
export const enabledKeyModes = keymodesJson.enabled as KeyModeId[];
export const cameraConfig = cameraJson as CameraConfig;
