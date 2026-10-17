import { cameraConfig, defaultGauge, gaugeTypeIds, judgementConfig, keyModes, type GaugeTypeId, type JudgementModeId } from '../engine/config';
import type { FeverMode } from '../engine/fever';
import { placementIds, type PlacementId } from '../engine/placement';
import { defaultRuleset, rulesetIds, type RulesetId } from '../engine/ruleset';
import type { ScrollMode } from '../engine/scroll';
import type { KeyModeId } from '../engine/types';
import type { Palette } from '../render/palette';
import { BUILTIN_SKINS, sanitizeSkin } from '../render/skins';
import { isPadCode } from '../input/gamepad';

export type { ScrollMode } from '../engine/scroll';
export type { Palette } from '../render/palette';
export type JudgePosition = 'low' | 'mid' | 'high';
/** OFF, the personal best of the chart, or a target rate in percent. */
export type Pacemaker = 'OFF' | 'BEST' | '90' | '95' | '98' | '99' | '100';

export type GenStyle = 'balanced' | 'stream' | 'chord' | 'jack' | 'longnote' | 'technical' | 'melody';
export type RhythmSource = 'auto' | 'drum' | 'bass' | 'melody' | 'vocal';

/** Advanced generation options; null leaves the difficulty preset's value. */
export interface GenerationPrefs {
  style: GenStyle;
  rhythmSource: RhythmSource;
  density: number | null;
  longNoteRatio: number | null;
  maxChord: number | null;
  /** Scratch or side-note rate, depending on the key mode. */
  specialRate: number | null;
  /** Pull of drum / bass notes toward their lane regions (null = server default). */
  instrumentMapping: number | null;
  /** 1 = reuse lane patterns in repeated sections, 0 = off (null = server default). */
  repeatConsistency: number | null;
}

export const GEN_STYLES: GenStyle[] = ['balanced', 'stream', 'chord', 'jack', 'longnote', 'technical', 'melody'];
export const RHYTHM_SOURCES: RhythmSource[] = ['auto', 'drum', 'bass', 'melody', 'vocal'];

export const DEFAULT_GENERATION: GenerationPrefs = {
  style: 'balanced',
  rhythmSource: 'auto',
  density: null,
  longNoteRatio: null,
  maxChord: null,
  specialRate: null,
  instrumentMapping: null,
  repeatConsistency: null,
};

export interface Settings {
  judgementMode: JudgementModeId;
  /** 1.0 = a note takes BASE_VISIBLE_MS from the track end to the (unlifted) judgement line. */
  hiSpeed: number;
  /** + compensates a player who hits late on average. */
  inputOffsetMs: number;
  /** + draws notes earlier (compensates display latency). */
  visualOffsetMs: number;
  cameraPreset: string;
  laneWidthScale: number;
  musicVolume: number;
  sfxVolume: number;
  hitSound: boolean;
  showErrorMs: boolean;
  bindings: Partial<Record<KeyModeId, string[]>>;
  /** Gamepad / controller control per lane (null = none), alongside the keyboard keys. */
  padBindings: Partial<Record<KeyModeId, (string | null)[]>>;
  lastKeyMode: KeyModeId;
  lastDifficulty: string;
  ruleset: RulesetId;
  gaugeType: GaugeTypeId;
  fever: FeverMode;
  placement: PlacementId;
  /** SUDDEN+: share of the travel distance hidden at the far end (0..MAX_COVER). */
  sudden: number;
  /** HIDDEN+: share of the travel distance hidden just before the judgement line. */
  hidden: number;
  /** LIFT: share of the track the judgement line is raised by. */
  lift: number;
  /** Home toggles the covers without losing their positions. */
  coversOn: boolean;
  /** Keep the visible time ("green number") when covers or LIFT move, like floating hi-speed. */
  keepVisibleTime: boolean;
  /** time: fixed speed; beat: speed follows the chart BPM (BMS/DJMAX style soflan). */
  scrollMode: ScrollMode;
  judgePosition: JudgePosition;
  reducedFlash: boolean;
  palette: Palette;
  pacemaker: Pacemaker;
  generation: GenerationPrefs;
  /** Stem keysound mode: the lead stem dips when its notes are missed. */
  keysound: boolean;
  /** SDVX-style camera tilt / zoom from the chart (0 = off .. 1). */
  cameraFx: number;
  skin: string;
  /** User skin (JSON object), used when `skin` is "custom". */
  customSkin: unknown;
  /** Background: blurred jacket, visualizer and user video under a dimming layer. */
  bgBrightness: number;
  visualizer: boolean;
  bga: boolean;
}

export const BASE_VISIBLE_MS = 5000;
export const HI_SPEED_MIN = 0.5;
export const HI_SPEED_MAX = 10;
export const MAX_COVER = 0.85;
export const MAX_LIFT = 0.5;
/** At least this share of the travel distance stays visible whatever the covers say. */
export const MIN_VISIBLE_SHARE = 0.1;

const STORAGE_KEY = 'grg.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  judgementMode: 'NORMAL',
  hiSpeed: 4,
  inputOffsetMs: 0,
  visualOffsetMs: 0,
  cameraPreset: cameraConfig.default,
  laneWidthScale: 1,
  musicVolume: 0.9,
  sfxVolume: 0.6,
  hitSound: false,
  showErrorMs: true,
  bindings: {},
  padBindings: {},
  lastKeyMode: '4K',
  lastDifficulty: 'NORMAL',
  ruleset: defaultRuleset,
  gaugeType: defaultGauge,
  fever: 'AUTO',
  placement: 'OFF',
  sudden: 0,
  hidden: 0,
  lift: 0,
  coversOn: true,
  keepVisibleTime: false,
  scrollMode: 'time',
  judgePosition: 'mid',
  reducedFlash: false,
  palette: 'default',
  pacemaker: 'OFF',
  generation: DEFAULT_GENERATION,
  keysound: false,
  cameraFx: 0.6,
  skin: 'neon',
  customSkin: null,
  bgBrightness: 0.35,
  visualizer: true,
  bga: true,
};

const PACEMAKERS: Pacemaker[] = ['OFF', 'BEST', '90', '95', '98', '99', '100'];

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function num(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** Fills defaults and drops values that the current config no longer knows. */
export function sanitizeSettings(raw: Partial<Settings>): Settings {
  const s = { ...DEFAULT_SETTINGS, ...raw, bindings: { ...raw.bindings }, padBindings: {} as Settings['padBindings'] };
  for (const [mode, codes] of Object.entries(raw.padBindings ?? {})) {
    const lanes = keyModes[mode as KeyModeId]?.lanes.length;
    if (lanes && Array.isArray(codes) && codes.length === lanes) {
      s.padBindings[mode as KeyModeId] = codes.map((c) => (typeof c === 'string' && isPadCode(c) ? c : null));
    }
  }
  const d = DEFAULT_SETTINGS;
  s.judgementMode = pick(s.judgementMode, Object.keys(judgementConfig.modes) as JudgementModeId[], d.judgementMode);
  s.hiSpeed = num(s.hiSpeed, HI_SPEED_MIN, HI_SPEED_MAX, d.hiSpeed);
  s.cameraPreset = pick(s.cameraPreset, Object.keys(cameraConfig.presets), d.cameraPreset);
  s.lastKeyMode = pick(s.lastKeyMode, Object.keys(keyModes) as KeyModeId[], d.lastKeyMode);
  s.ruleset = pick(s.ruleset, rulesetIds, d.ruleset);
  s.gaugeType = pick(s.gaugeType, gaugeTypeIds, d.gaugeType);
  s.fever = pick(s.fever, ['AUTO', 'MANUAL', 'OFF'] as FeverMode[], d.fever);
  s.placement = pick(s.placement, placementIds, d.placement);
  s.sudden = num(s.sudden, 0, MAX_COVER, 0);
  s.hidden = num(s.hidden, 0, MAX_COVER, 0);
  s.lift = num(s.lift, 0, MAX_LIFT, 0);
  s.scrollMode = pick(s.scrollMode, ['time', 'beat'] as ScrollMode[], d.scrollMode);
  s.judgePosition = pick(s.judgePosition, ['low', 'mid', 'high'] as JudgePosition[], d.judgePosition);
  s.palette = pick(s.palette, ['default', 'colorblind'] as Palette[], d.palette);
  s.pacemaker = pick(s.pacemaker, PACEMAKERS, d.pacemaker);
  s.keysound = Boolean(s.keysound);
  s.cameraFx = num(s.cameraFx, 0, 1, d.cameraFx);
  s.skin = pick(s.skin, [...BUILTIN_SKINS.map((k) => k.id), 'custom'], d.skin);
  s.customSkin = sanitizeSkin(s.customSkin);
  if (s.skin === 'custom' && s.customSkin === null) s.skin = d.skin;
  s.bgBrightness = num(s.bgBrightness, 0, 1, d.bgBrightness);
  s.visualizer = s.visualizer !== false;
  s.bga = s.bga !== false;
  const g = { ...DEFAULT_GENERATION, ...raw.generation };
  const optional = (v: unknown, min: number, max: number) => (v === null || v === undefined ? null : num(v, min, max, min));
  s.generation = {
    style: pick(g.style, GEN_STYLES, DEFAULT_GENERATION.style),
    rhythmSource: pick(g.rhythmSource, RHYTHM_SOURCES, DEFAULT_GENERATION.rhythmSource),
    density: optional(g.density, 0.5, 1.5),
    longNoteRatio: optional(g.longNoteRatio, 0, 0.5),
    maxChord: optional(g.maxChord, 1, 8),
    specialRate: optional(g.specialRate, 0, 0.2),
    instrumentMapping: optional(g.instrumentMapping, 0, 1),
    repeatConsistency: optional(g.repeatConsistency, 0, 1),
  };
  return s;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return sanitizeSettings(JSON.parse(raw) as Partial<Settings>);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable (private mode); settings stay in memory
  }
}

export function bindingsFor(settings: Settings, mode: KeyModeId): string[] {
  const custom = settings.bindings[mode];
  const lanes = keyModes[mode].lanes.length;
  if (custom && custom.length === lanes) return custom;
  return keyModes[mode].bindings.default;
}

/** Gamepad control of every lane of a key mode (null where none is bound). */
export function padBindingsFor(settings: Settings, mode: KeyModeId): (string | null)[] {
  const custom = settings.padBindings[mode];
  const lanes = keyModes[mode].lanes.length;
  return custom && custom.length === lanes ? custom : new Array<string | null>(lanes).fill(null);
}

export function clampHiSpeed(hiSpeed: number): number {
  return Math.round(Math.min(HI_SPEED_MAX, Math.max(HI_SPEED_MIN, hiSpeed)) * 100) / 100;
}

/** Time a note takes over the whole (unlifted) track length. */
export function visibleTimeMs(hiSpeed: number): number {
  return BASE_VISIBLE_MS / clampHiSpeed(hiSpeed);
}

export interface CoverState {
  sudden: number;
  hidden: number;
  lift: number;
}

/** Covers in effect (Home turns SUDDEN+/HIDDEN+ off; LIFT stays). */
export function activeCovers(s: Pick<Settings, 'sudden' | 'hidden' | 'lift' | 'coversOn'>): CoverState {
  const sudden = s.coversOn ? s.sudden : 0;
  const hidden = s.coversOn ? s.hidden : 0;
  const over = sudden + hidden - (1 - MIN_VISIBLE_SHARE);
  // Never let the two covers meet: trim HIDDEN+ first, it is the one added on top.
  const h = over > 0 ? Math.max(0, hidden - over) : hidden;
  return { sudden: Math.min(sudden, 1 - MIN_VISIBLE_SHARE), hidden: h, lift: s.lift };
}

/** Share of the whole track length from the SUDDEN+ edge down to the judgement line. */
export function visibleShare(c: CoverState): number {
  return (1 - c.lift) * (1 - c.sudden);
}

/**
 * "Green number": ms from a note appearing below SUDDEN+ to it reaching the judgement line.
 * HIDDEN+ does not change it (the note still appears at the same moment), as in IIDX.
 */
export function greenNumber(hiSpeed: number, c: CoverState): number {
  return visibleTimeMs(hiSpeed) * visibleShare(c);
}

/**
 * Applies a cover/LIFT change; with `keepVisibleTime` the hi-speed is rescaled so the green number
 * stays the same (as long as the hi-speed range allows it).
 */
export function withCovers(s: Settings, patch: Partial<Pick<Settings, 'sudden' | 'hidden' | 'lift' | 'coversOn'>>): Settings {
  const next = sanitizeSettings({ ...s, ...patch });
  if (!s.keepVisibleTime) return next;
  const before = visibleShare(activeCovers(s));
  const after = visibleShare(activeCovers(next));
  if (before <= 0 || after <= 0) return next;
  return { ...next, hiSpeed: clampHiSpeed(s.hiSpeed * (after / before)) };
}

/** Human readable key name for a KeyboardEvent.code. */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const names: Record<string, string> = {
    Space: 'Space',
    ShiftLeft: 'L-Shift',
    ShiftRight: 'R-Shift',
    ControlLeft: 'L-Ctrl',
    ControlRight: 'R-Ctrl',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Enter: 'Enter',
    AltLeft: 'L-Alt',
    AltRight: 'R-Alt',
  };
  return names[code] ?? code;
}
