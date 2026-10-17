import { api } from '../api/client';
import type { Chart, StemName } from '../engine/types';
import { getAudioEngine } from './AudioEngine';
import { loadKeysoundBank, renderBgm, type KeysoundBank } from './keysounds';

const MAX_ENTRIES = 3;
const MAX_KEYSOUND_ENTRIES = 2;
const cache = new Map<string, Promise<AudioBuffer>>();
const banks = new Map<string, Promise<KeysoundBank>>();
const bgms = new Map<string, Promise<AudioBuffer>>();

function lru<T>(map: Map<string, Promise<T>>, key: string, make: () => Promise<T>, max: number): Promise<T> {
  const hit = map.get(key);
  if (hit) {
    map.delete(key);
    map.set(key, hit);
    return hit;
  }
  const loading = make();
  loading.catch(() => map.delete(key));
  map.set(key, loading);
  while (map.size > max) map.delete(map.keys().next().value as string);
  return loading;
}

/** Keysound sprite of an imported song. */
export function keysoundBank(songId: string): Promise<KeysoundBank> {
  return lru(banks, songId, () => loadKeysoundBank(songId), MAX_KEYSOUND_ENTRIES);
}

/** The chart's background keysounds rendered into one buffer (the play's song audio). */
export function keysoundBgm(songId: string, chart: Chart): Promise<AudioBuffer> {
  const last = Math.max(0, ...chart.notes.map((n) => n.endT ?? n.t), ...(chart.bgm ?? []).map((e) => e.t));
  const duration = Math.max(chart.meta.durationMs ?? 0, last + 2000);
  return lru(bgms, chart.meta.chartId, async () => renderBgm(chart, await keysoundBank(songId), duration), MAX_KEYSOUND_ENTRIES);
}

function cached(key: string, url: string): Promise<AudioBuffer> {
  return lru(cache, key, () => getAudioEngine().load(url), MAX_ENTRIES);
}

/** Decoded canonical audio for a song, kept for quick retries. */
export function songBuffer(songId: string): Promise<AudioBuffer> {
  return cached(songId, api.audioUrl(songId));
}

/** Decoded stem audio (the server separates it on first request). */
export function stemBuffer(songId: string, stem: StemName): Promise<AudioBuffer> {
  return cached(`${songId}:${stem}`, api.stemUrl(songId, stem));
}

export function forgetSongBuffer(songId: string): void {
  for (const key of [...cache.keys()]) if (key === songId || key.startsWith(`${songId}:`)) cache.delete(key);
  banks.delete(songId);
}
