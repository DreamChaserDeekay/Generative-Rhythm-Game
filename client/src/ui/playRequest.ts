import { api, type Song } from '../api/client';
import { keysoundBank, keysoundBgm, songBuffer, stemBuffers } from '../audio/bufferCache';
import { keysoundStems } from '../audio/stemKeysounds';
import type { Chart } from '../engine/types';
import type { Settings } from '../settings/settings';
import type { PlayRequest } from './App';

/** Audio, keysounds and background of a play of `chart` on `song`. */
export function buildPlayRequest(
  song: Song,
  chart: Chart,
  settings: Settings,
  options: Omit<PlayRequest, 'chart' | 'song' | 'loadAudio' | 'loadKeysounds' | 'loadStems' | 'background'>,
): PlayRequest {
  const songId = song.id;
  const keysounded = (chart.sounds?.length ?? 0) > 0;
  // a generated chart's notes play the stems they follow (imported charts bring their own sounds)
  const stems = settings.keysound && !keysounded ? keysoundStems(chart.notes) : [];
  return {
    ...options,
    chart,
    song,
    loadAudio: keysounded ? () => keysoundBgm(songId, chart) : () => songBuffer(songId),
    loadKeysounds: keysounded ? () => keysoundBank(songId) : undefined,
    loadStems: stems.length > 0 ? () => stemBuffers(songId, stems) : undefined,
    background: {
      coverUrl: song.hasCover ? api.coverUrl(song) : null,
      bgaUrl: song.hasBga ? api.bgaUrl(songId) : null,
      bgaYoutube: song.bgaYoutube ?? null,
      bgaOffsetMs: song.bgaOffsetMs ?? 0,
    },
  };
}
