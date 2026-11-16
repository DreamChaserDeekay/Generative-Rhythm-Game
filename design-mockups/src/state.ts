import type { KeyModeId } from '@game/engine/types';
import { DEFAULT_SETTINGS, type Settings } from '@game/settings/settings';
import type { Tier } from './data';

/** What the screens share. The settings are the game's own object, so the track shows them as the game would. */
export const state: { settings: Settings; song: number; mode: KeyModeId; tier: Tier } = {
  settings: { ...DEFAULT_SETTINGS, lastKeyMode: '7K+1S' },
  song: 4,
  mode: '7K+1S',
  tier: 'HARD',
};

export type ScreenName = 'select' | 'config' | 'play' | 'notes';
const listeners = new Set<() => void>();
export const onSettings = (fn: () => void) => listeners.add(fn);
export function setSettings(next: Settings): void {
  state.settings = next;
  listeners.forEach((fn) => fn());
}

/**
 * What the player registered for a song in this visit: a jacket and a background video. The game
 * keeps these on its server; the mockup keeps the picked files in the browser's memory only.
 */
export interface SongMedia {
  /** A picked picture (object URL); null: the jacket was removed; undefined: as the library has it. */
  cover?: string | null;
  video?: { kind: 'file' | 'youtube'; url: string; name: string } | null;
  videoOffsetMs: number;
}
const media = new Map<string, SongMedia>();
export function mediaOf(id: string): SongMedia {
  let m = media.get(id);
  if (!m) {
    m = { videoOffsetMs: 0 };
    media.set(id, m);
  }
  return m;
}

/** Sample favourites (the game keeps the player's own). */
export const favorites = new Set<number>([1, 4, 6, 9]);
