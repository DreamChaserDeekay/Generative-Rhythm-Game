export type KeyModeId = '4K' | '5K' | '6K' | '7K+1S' | '8K';

export type NoteType = 'tap' | 'hold';

/** A note as stored in chart JSON. `t`/`endT` are ms on the canonical audio timeline. */
export interface ChartNote {
  beat: number;
  t: number;
  lane: number;
  type: NoteType;
  endBeat?: number;
  endT?: number;
}

export interface TempoPoint {
  beat: number;
  bpm: number;
}

export interface MeterPoint {
  measure: number;
  beatsPerMeasure: number;
}

export interface ChartTiming {
  /** Time (ms) of beat 0. */
  offsetMs: number;
  tempoMap: TempoPoint[];
  meter: MeterPoint[];
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
  notes: ChartNote[];
}
