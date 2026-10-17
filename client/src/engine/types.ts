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
  level: number;
  songId?: string;
  durationMs?: number;
  skillset?: Record<string, number>;
  /** Lead stem for the stem keysound mode and the share of notes following each stem. */
  keysound?: { stem: StemName; share: number; shares: Record<StemName, number> } | null;
  repeatConsistency?: number | null;
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
}
