import { api } from '../api/client';
import type { StemName } from '../engine/types';
import { getAudioEngine } from './AudioEngine';

const MAX_ENTRIES = 3;
const cache = new Map<string, Promise<AudioBuffer>>();

function cached(key: string, url: string): Promise<AudioBuffer> {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit); // refresh LRU order
    return hit;
  }
  const loading = getAudioEngine().load(url);
  loading.catch(() => cache.delete(key));
  cache.set(key, loading);
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  return loading;
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
}
