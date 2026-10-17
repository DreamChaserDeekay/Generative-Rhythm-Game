import { api, type Song } from '../api/client';
import { keysoundBank, keysoundBgm, songBuffer, stemBuffer } from '../audio/bufferCache';
import type { Chart } from '../engine/types';
import type { Settings } from '../settings/settings';
import type { PlayRequest } from './App';

/** Audio, keysounds and background of a play of `chart` on `song`. */
export function buildPlayRequest(
  song: Song,
  chart: Chart,
  settings: Settings,
  options: Omit<PlayRequest, 'chart' | 'loadAudio' | 'loadKeysounds' | 'loadLead' | 'background'>,
): PlayRequest {
  const songId = song.id;
  const keysounded = (chart.sounds?.length ?? 0) > 0;
  const lead = settings.keysound && !keysounded ? chart.meta.keysound?.stem : undefined;
  return {
    ...options,
    chart,
    loadAudio: keysounded ? () => keysoundBgm(songId, chart) : () => songBuffer(songId),
    loadKeysounds: keysounded ? () => keysoundBank(songId) : undefined,
    loadLead: lead ? () => stemBuffer(songId, lead) : undefined,
    background: {
      coverUrl: song.hasCover ? api.coverUrl(songId) : null,
      bgaUrl: song.hasBga ? api.bgaUrl(songId) : null,
      bgaOffsetMs: song.bgaOffsetMs ?? 0,
    },
  };
}
