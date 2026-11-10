import type { KeyModeId } from '@game/engine/types';
import { DEFAULT_SETTINGS, type Settings } from '@game/settings/settings';
import type { Tier } from './data';

/** What the three screens share. The settings are the game's own object, so the track shows them as the game would. */
export const state: { settings: Settings; song: number; mode: KeyModeId; tier: Tier; autoPlay: boolean } = {
  settings: { ...DEFAULT_SETTINGS, lastKeyMode: '7K+1S' },
  song: 5,
  mode: '7K+1S',
  tier: 'HARD',
  autoPlay: false,
};

export type ScreenName = 'select' | 'config' | 'play' | 'sound' | 'notes';
const listeners = new Set<() => void>();
export const onSettings = (fn: () => void) => listeners.add(fn);
export function setSettings(next: Settings): void {
  state.settings = next;
  listeners.forEach((fn) => fn());
}
