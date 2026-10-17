import { keyModes } from './config';
import { TempoMap } from './tempo';
import type { Chart, ChartNote, KeyModeId } from './types';

export interface SyncTestSpec {
  keyMode: KeyModeId;
  bpm: number;
  /** Time of the first beat in ms (lead-in before the first click). */
  firstBeatMs: number;
  beats: number;
}

export const DEFAULT_SYNC_TEST: SyncTestSpec = { keyMode: '4K', bpm: 120, firstBeatMs: 2000, beats: 48 };

/**
 * A fixed chart that lines up with the click track: quarter notes walking across the lanes,
 * eighth-note trills with chords on the downbeats, then long notes over quarter taps.
 */
export function buildSyncTestChart(spec: SyncTestSpec = DEFAULT_SYNC_TEST): Chart {
  const mode = keyModes[spec.keyMode];
  const keyLanes = mode.lanes.map((l, i) => ({ l, i })).filter(({ l }) => l.kind === 'key').map(({ i }) => i);
  const scratch = mode.lanes.findIndex((l) => l.kind === 'scratch');
  const timing = { offsetMs: spec.firstBeatMs, tempoMap: [{ beat: 0, bpm: spec.bpm }], meter: [{ measure: 0, beatsPerMeasure: 4 }] };
  const tempo = new TempoMap(timing);
  const notes: ChartNote[] = [];
  const tap = (beat: number, lane: number) => notes.push({ beat, t: tempo.beatToMs(beat), lane, type: 'tap' });
  const hold = (beat: number, endBeat: number, lane: number) =>
    notes.push({ beat, t: tempo.beatToMs(beat), lane, type: 'hold', endBeat, endT: tempo.beatToMs(endBeat) });

  const third = Math.floor(spec.beats / 3);
  for (let b = 0; b < third; b++) tap(b, keyLanes[b % keyLanes.length]);

  const left = keyLanes.slice(0, Math.ceil(keyLanes.length / 2));
  const right = keyLanes.slice(Math.ceil(keyLanes.length / 2));
  for (let b = third; b < third * 2; b++) {
    if (b % 4 === 0) {
      tap(b, left[0]);
      tap(b, right[right.length - 1]);
      if (scratch >= 0) tap(b, scratch);
    } else {
      tap(b, left[b % left.length]);
    }
    tap(b + 0.5, right[b % right.length]);
  }

  for (let b = third * 2; b + 2 <= spec.beats; b += 4) {
    hold(b, b + 2, left[0]);
    tap(b, right[0]);
    tap(b + 1, right[right.length - 1]);
    tap(b + 2, right[0]);
    tap(b + 3, left[left.length - 1]);
  }

  notes.sort((a, b) => a.t - b.t || a.lane - b.lane);
  return {
    formatVersion: 1,
    meta: {
      chartId: `sync-test-${spec.keyMode}-${spec.bpm}`,
      audioHash: 'click-track',
      title: '싱크 테스트',
      artist: `${spec.bpm} BPM 클릭 트랙`,
      keyMode: spec.keyMode,
      lanes: mode.lanes.map((l) => l.id),
      difficulty: 'TEST',
      level: 0,
      durationMs: tempo.beatToMs(spec.beats) + 2000,
    },
    timing,
    notes,
  };
}
