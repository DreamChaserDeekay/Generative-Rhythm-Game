import { api } from '../api/client';
import { getAudioEngine } from './AudioEngine';

const MAX_ENTRIES = 3;
const cache = new Map<string, Promise<AudioBuffer>>();

/** Decoded canonical audio for a song, kept for quick retries. */
export function songBuffer(songId: string): Promise<AudioBuffer> {
  const hit = cache.get(songId);
  if (hit) {
    cache.delete(songId);
    cache.set(songId, hit); // refresh LRU order
    return hit;
  }
  const loading = getAudioEngine().load(api.audioUrl(songId));
  loading.catch(() => cache.delete(songId));
  cache.set(songId, loading);
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  return loading;
}

export function forgetSongBuffer(songId: string): void {
  cache.delete(songId);
}
