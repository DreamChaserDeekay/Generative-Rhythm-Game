import { getAudioEngine } from '../audio/AudioEngine';
import { clickTrackBuffer } from '../audio/clickTrack';
import { buildSyncTestChart, DEFAULT_SYNC_TEST } from '../engine/syncTest';
import type { KeyModeId } from '../engine/types';
import type { PlayRequest } from './App';

/**
 * Click-track chart that needs no server: used to verify sync and judgement (and to set the
 * offsets as it runs). From the settings, leaving it returns to them.
 */
export function syncTestRequest(keyMode: KeyModeId, autoPlay: boolean, fromSettings = false): PlayRequest {
  const spec = { ...DEFAULT_SYNC_TEST, keyMode };
  return {
    chart: buildSyncTestChart(spec),
    autoPlay,
    syncTest: true,
    fromSettings,
    loadAudio: async () =>
      clickTrackBuffer(getAudioEngine().ctx, {
        bpm: spec.bpm,
        firstBeatMs: spec.firstBeatMs,
        beats: spec.beats,
        beatsPerMeasure: 4,
        tailMs: 1500,
      }),
  };
}
