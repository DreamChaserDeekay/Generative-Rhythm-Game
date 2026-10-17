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

export type DifficultySystemId = 'GRG' | 'DJMAX' | 'EZ2ON';

/** A difficulty of a system (DJMAX MAXIMUM, EZ2ON SUPER HARD …). */
export interface DifficultyTier {
  id: string;
  label: string;
  short: string;
  /** Typical level range on the system's scale (a default chart aims at its middle). */
  levels: [number, number];
  /** Levels on a scale of their own (DJMAX SC). */
  levelScale?: string;
  /** Badge colour. */
  color: string;
}

export interface DifficultySystem {
  id: DifficultySystemId;
  /** Short name on the selector, and the game it follows. */
  label: string;
  title: string;
  maxLevel: number;
  tiers: DifficultyTier[];
  /** GRG names (EASY … MASTER) to this system's tiers. */
  aliases: Record<string, string>;
}

const TIER_COLORS: Record<string, string> = {
  'GRG:EASY': '#6fe39a',
  'GRG:NORMAL': '#4fc3ff',
  'GRG:HARD': '#ffc94f',
  'GRG:EXPERT': '#ff6f8a',
  'GRG:MASTER': '#c58bff',
  'DJMAX:NM': '#ffd257',
  'DJMAX:HD': '#ff9d3d',
  'DJMAX:MX': '#ff4f6d',
  'DJMAX:SC': '#d36bff',
  'EZ2ON:EZ': '#6fe39a',
  'EZ2ON:NM': '#4fc3ff',
  'EZ2ON:HD': '#ff7a59',
  'EZ2ON:SHD': '#c58bff',
};
const GRG_SHORT: Record<string, string> = { EASY: 'EZ', NORMAL: 'NM', HARD: 'HD', EXPERT: 'EX', MASTER: 'MX' };

interface TierJson {
  label?: string;
  short?: string;
  levels: [number, number];
  levelScale?: string;
}

function tiersOf(id: DifficultySystemId, order: string[], tiers: Record<string, TierJson>): DifficultyTier[] {
  return order.map((t) => ({
    id: t,
    label: tiers[t].label ?? t,
    short: tiers[t].short ?? GRG_SHORT[t] ?? t,
    levels: tiers[t].levels,
    levelScale: tiers[t].levelScale,
    color: TIER_COLORS[`${id}:${t}`] ?? '#9fb4ff',
  }));
}

const systemsJson = (difficultyJson as unknown as {
  systems?: Record<string, { label: string; title: string; maxLevel: number; order: string[]; tiers: Record<string, TierJson>; aliases?: Record<string, string> }>;
}).systems ?? {};

export const difficultySystems: Record<DifficultySystemId, DifficultySystem> = {
  GRG: {
    id: 'GRG',
    label: '기본',
    title: 'Generative Rhythm 5단계',
    maxLevel: difficultyJson.levelEffectiveNps.length,
    tiers: tiersOf('GRG', difficultyJson.order, difficultyJson.presets as unknown as Record<string, TierJson>),
    aliases: {},
  },
  ...(Object.fromEntries(
    (['DJMAX', 'EZ2ON'] as const)
      .filter((id) => systemsJson[id])
      .map((id) => {
        const s = systemsJson[id];
        return [id, { id, label: s.label, title: s.title, maxLevel: s.maxLevel, tiers: tiersOf(id, s.order, s.tiers), aliases: s.aliases ?? {} }];
      }),
  ) as Record<'DJMAX' | 'EZ2ON', DifficultySystem>),
};
export const difficultySystemIds = Object.keys(difficultySystems) as DifficultySystemId[];

/** A tier of `system` for a stored difficulty (its id, a GRG name, or else the second tier). */
export function tierOf(system: DifficultySystem, difficulty: string): DifficultyTier {
  return (
    system.tiers.find((t) => t.id === difficulty) ??
    system.tiers.find((t) => t.id === system.aliases[difficulty]) ??
    system.tiers[Math.min(1, system.tiers.length - 1)]
  );
}

/** "DJMAX MX Lv.12", "DJMAX SC 8", "HARD Lv.9" (the five GRG steps carry no system name). */
export function difficultyLabel(meta: { difficulty: string; difficultySystem?: DifficultySystemId; levelScale?: string; level: number }): string {
  const system = meta.difficultySystem && meta.difficultySystem !== 'GRG' ? `${difficultySystems[meta.difficultySystem]?.label ?? meta.difficultySystem} ` : '';
  const level = meta.level > 0 ? (meta.levelScale ? ` ${meta.level}` : ` Lv.${meta.level}`) : '';
  return `${system}${meta.difficulty}${level}`;
}
