import { cameraConfig, keyModes, type JudgementModeId } from '../engine/config';
import type { KeyModeId } from '../engine/types';

export interface Settings {
  judgementMode: JudgementModeId;
  /** 1.0 = a note takes BASE_VISIBLE_MS from the track end to the judgement line. */
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
  lastKeyMode: KeyModeId;
  lastDifficulty: string;
}

export const BASE_VISIBLE_MS = 5000;
export const HI_SPEED_MIN = 0.5;
export const HI_SPEED_MAX = 10;

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
  lastKeyMode: '4K',
  lastDifficulty: 'NORMAL',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed, bindings: { ...parsed.bindings } };
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

export function visibleTimeMs(hiSpeed: number): number {
  return BASE_VISIBLE_MS / Math.min(HI_SPEED_MAX, Math.max(HI_SPEED_MIN, hiSpeed));
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
