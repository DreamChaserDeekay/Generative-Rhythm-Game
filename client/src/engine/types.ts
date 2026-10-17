import type { DifficultySystemId } from './config';

export type KeyModeId = '4K' | '4K+FX' | '5K' | '6K' | '6K+FX' | '7K+1S' | '8K';

export type NoteType = 'tap' | 'hold';

/** Separated instrument stems (analysis), the source a note follows. */
export type StemName = 'drums' | 'bass' | 'vocals' | 'other';
export const STEM_NAMES: StemName[] = ['drums', 'bass', 'vocals', 'other'];

/** A note as stored in chart JSON. `t`/`endT` are ms on the canonical audio timeline. */
export interface ChartNote {
  beat: number;
  t: number;
  lane: number;
  type: NoteType;
  endBeat?: number;
  endT?: number;
  /** Stem whose sound the note follows (charts generated from stem analysis). */
  src?: StemName;
  /** Keysound (index into `Chart.sounds`) played when the note is pressed (imported BMS/bmson). */
  snd?: number;
  /** Start that many ms into the sound (bmson channels that continue a sliced stem). */
  so?: number;
  /** Stop the sound after that many ms (the next start of the same sound). */
  sl?: number;
}

/** A keysound that plays on its own, whatever the player does (BMS background channel). */
export interface ChartBgmEvent {
  beat: number;
  t: number;
  snd: number;
  so?: number;
  sl?: number;
}

/** SDVX-style camera cue: `tilt` eases the track to `value` (-1..1), `zoom` is a pulse (0..1). */
export interface ChartEffect {
  beat: number;
  t: number;
  type: 'tilt' | 'zoom';
  value: number;
  durationBeats: number;
}

export interface TempoPoint {
  beat: number;
  bpm: number;
}

export interface MeterPoint {
  measure: number;
  beatsPerMeasure: number;
}

/** Scroll stop (BMS/bmson): the beat clock pauses for `durationMs` at `beat`. */
export interface StopPoint {
  beat: number;
  durationMs: number;
}

export interface ChartTiming {
  /** Time (ms) of beat 0. */
  offsetMs: number;
  tempoMap: TempoPoint[];
  meter: MeterPoint[];
  stops?: StopPoint[];
}

export interface ChartSection {
  startBeat: number;
  label: string;
  energy: number;
}

export interface ChartMeta {
  chartId: string;
  audioHash: string;
  title: string;
  artist: string;
  keyMode: KeyModeId;
  lanes: string[];
  difficulty: string;
  /** Difficulty system of `difficulty` and `level` (absent = GRG, the five steps). */
  difficultySystem?: DifficultySystemId;
  /** "SC" when the level is on DJMAX's SC scale. */
  levelScale?: string;
  level: number;
  songId?: string;
  durationMs?: number;
  skillset?: Record<string, number>;
  /** Lead stem for the stem keysound mode and the share of notes following each stem. */
  keysound?: { stem: StemName; share: number; shares: Record<StemName, number> } | null;
  repeatConsistency?: number | null;
  /** Where the chart came from: generated (absent), edited in the editor or imported from a file. */
  source?: { kind: 'generated' | 'edited' | 'imported'; format?: 'osu' | 'bms' | 'bmson'; file?: string; from?: string };
  /** Display name of an edited/imported chart (osu! Version, BMS difficulty …). */
  chartName?: string;
  /** Gain applied to the keysounds of an imported chart so the full mix does not clip. */
  keysoundGain?: number;
  generator?: {
    version: string;
    analyzer: string;
    seed: number;
    params: Record<string, unknown>;
  };
}

export interface Chart {
  formatVersion: 1;
  meta: ChartMeta;
  timing: ChartTiming;
  sections?: ChartSection[];
  effects?: ChartEffect[];
  notes: ChartNote[];
  /** Keysound file names of an imported chart (`snd` indexes into it). */
  sounds?: string[];
  /** Background keysound events of an imported chart. */
  bgm?: ChartBgmEvent[];
}
