import type { Chart, ChartNote, KeyModeId, StemName } from '@game/engine/types';

/** What tools/export_songs.py wrote: the game server's analysis and generated charts of the sample songs. */
export const STEMS: StemName[] = ['drums', 'bass', 'vocals', 'other'];
export const MODES: KeyModeId[] = ['4K', '4K+FX', '5K', '6K', '6K+FX', '7K+1S', '8K'];
export const TIERS = ['EASY', 'NORMAL', 'HARD', 'EXPERT', 'MASTER'] as const;
export type Tier = (typeof TIERS)[number];
export const TIER_SHORT: Record<Tier, string> = { EASY: 'EZ', NORMAL: 'NM', HARD: 'HD', EXPERT: 'EX', MASTER: 'MX' };

export interface ChartSummary {
  chartId: string;
  level: number;
  rating: number;
  noteCount: number;
  longNotes: number;
  nps: { avg: number; peak: number; graph: number[]; binMs: number };
  skillset: Record<string, number> | null;
  patterns: Record<string, number> | null;
  handLoad: { L: number; R: number } | null;
  keysound: { stem: StemName; share: number; shares: Record<StemName, number> } | null;
  consistency?: { loopLane?: number; repeatLaneMirror?: number } | null;
  repeatConsistency?: number | null;
  seed?: number | null;
}

export interface Section {
  t: number;
  endT: number;
  label: string;
  group: string;
  energy: number;
  leader?: StemName | null;
}

export interface SongEntry {
  id: string;
  title: string;
  artist: string;
  /** As the game's server reads it from the file's tags ('' when the file has none). */
  album: string;
  /** A sample jacket of the mockup (public/covers). */
  hasCover: boolean;
  durationMs: number;
  bpm: number;
  bpmMin: number;
  bpmMax: number;
  previewMs: number;
  sketch: { durationMs: number; beatsPerBar: number; sections: Section[]; peaks: number[]; stems: Record<StemName, number> | null };
  charts: Record<string, Record<Tier, ChartSummary>>;
  credit: { license: string; license_url: string; page_url: string; attribution?: string | null };
}

type CompactNote = [beat: number, t: number, lane: number, endBeat: number, endT: number, stem: number];
interface CompactChart {
  meta: { chartId: string; lanes: string[]; level: number; rating: number; noteCount: number; durationMs: number };
  timing: Chart['timing'];
  sections: Chart['sections'];
  effects: Chart['effects'];
  notes: CompactNote[];
}

export interface SongDetail {
  id: string;
  beats: number[];
  downbeats: number[];
  onsets: Record<StemName, [t: number, strength: number][]>;
  waveform: { frameMs: number; peaks: number[] };
  charts: Record<string, Record<Tier, CompactChart>>;
}

/**
 * The plays shown as records. The game keeps these per player, so a mockup has none of its own:
 * these are SAMPLE records (marked as such in the notes), on the real charts' real note counts.
 */
export interface SampleRecord {
  lamp: 'FAILED' | 'EASY CLEAR' | 'CLEAR' | 'HARD CLEAR' | 'MAX COMBO' | 'PERFECT PLAY';
  rate: number;
  breaks: number;
  plays: number;
}
const SAMPLE: Record<string, Partial<Record<Tier, SampleRecord>>> = {
  0: { NORMAL: { lamp: 'MAX COMBO', rate: 98.74, breaks: 0, plays: 6 }, HARD: { lamp: 'CLEAR', rate: 95.12, breaks: 7, plays: 9 }, EXPERT: { lamp: 'FAILED', rate: 81.3, breaks: 64, plays: 3 } },
  1: { EASY: { lamp: 'PERFECT PLAY', rate: 100, breaks: 0, plays: 2 }, NORMAL: { lamp: 'HARD CLEAR', rate: 97.31, breaks: 3, plays: 4 }, HARD: { lamp: 'CLEAR', rate: 93.88, breaks: 12, plays: 5 } },
  2: { NORMAL: { lamp: 'CLEAR', rate: 96.02, breaks: 5, plays: 2 } },
  4: { HARD: { lamp: 'EASY CLEAR', rate: 90.47, breaks: 21, plays: 7 }, EXPERT: { lamp: 'FAILED', rate: 76.9, breaks: 88, plays: 11 } },
  5: { NORMAL: { lamp: 'MAX COMBO', rate: 99.21, breaks: 0, plays: 3 }, HARD: { lamp: 'HARD CLEAR', rate: 96.4, breaks: 4, plays: 8 }, EXPERT: { lamp: 'CLEAR', rate: 92.15, breaks: 19, plays: 14 } },
  6: { EASY: { lamp: 'MAX COMBO', rate: 99.6, breaks: 0, plays: 1 }, NORMAL: { lamp: 'CLEAR', rate: 94.7, breaks: 9, plays: 3 } },
  9: { HARD: { lamp: 'CLEAR', rate: 95.9, breaks: 6, plays: 2 } },
  10: { NORMAL: { lamp: 'HARD CLEAR', rate: 97.85, breaks: 2, plays: 5 }, HARD: { lamp: 'CLEAR', rate: 93.02, breaks: 15, plays: 6 }, EXPERT: { lamp: 'EASY CLEAR', rate: 88.64, breaks: 37, plays: 9 } },
};

export let songs: SongEntry[] = [];
const details = new Map<string, Promise<SongDetail>>();

export async function loadLibrary(): Promise<void> {
  songs = ((await (await fetch('./data/songs.json')).json()) as { songs: SongEntry[] }).songs;
}

export function detailOf(song: SongEntry): Promise<SongDetail> {
  let d = details.get(song.id);
  if (!d) {
    d = fetch(`./data/${song.id}.json`).then((r) => r.json() as Promise<SongDetail>);
    details.set(song.id, d);
  }
  return d;
}

/** The stem that has most of the song (the colour of a song's disc while it has no jacket, as in the game). */
export function leadStem(song: SongEntry): StemName {
  const shares = song.sketch.stems;
  if (!shares) return 'other';
  return STEMS.reduce((best, s) => (shares[s] > shares[best] ? s : best), STEMS[0]);
}

export function recordOf(songIndex: number, tier: Tier): SampleRecord | null {
  return SAMPLE[songIndex]?.[tier] ?? null;
}

/** The best lamp of a song's sample records (the list's mark). */
export function bestLamp(songIndex: number): SampleRecord['lamp'] | null {
  const order: SampleRecord['lamp'][] = ['FAILED', 'EASY CLEAR', 'CLEAR', 'HARD CLEAR', 'MAX COMBO', 'PERFECT PLAY'];
  let best = -1;
  for (const r of Object.values(SAMPLE[songIndex] ?? {})) best = Math.max(best, order.indexOf(r.lamp));
  return best < 0 ? null : order[best];
}

/** The chart as the game's engine takes it. */
export function chartOf(song: SongEntry, detail: SongDetail, mode: KeyModeId, tier: Tier): Chart {
  const c = detail.charts[mode][tier];
  const notes: ChartNote[] = c.notes.map(([beat, t, lane, endBeat, endT, stem]) => {
    const n: ChartNote = { beat, t, lane, type: endT > 0 ? 'hold' : 'tap' };
    if (endT > 0) {
      n.endBeat = endBeat;
      n.endT = endT;
    }
    if (stem >= 0) n.src = STEMS[stem];
    return n;
  });
  return {
    formatVersion: 1,
    meta: { chartId: c.meta.chartId, audioHash: '', title: song.title, artist: song.artist, keyMode: mode, lanes: c.meta.lanes, difficulty: tier, level: c.meta.level, songId: song.id, durationMs: c.meta.durationMs },
    timing: c.timing,
    sections: c.sections,
    effects: c.effects,
    notes,
  };
}

export function bpmText(song: SongEntry): string {
  if (Math.abs(song.bpmMax - song.bpmMin) > 0.5) return `${Math.round(song.bpmMin)}–${Math.round(song.bpmMax)}`;
  return song.bpm.toFixed(song.bpm % 1 < 0.05 || song.bpm % 1 > 0.95 ? 0 : 1);
}

/** Section names as the game shows them (client/src/ui/sections.ts). */
export const SECTION_KO: Record<string, string> = { intro: '인트로', verse: '벌스', 'pre-chorus': '프리코러스', chorus: '후렴', bridge: '브리지', drop: '드롭', outro: '아웃트로' };
export const STEM_KO: Record<string, string> = { drums: '드럼', bass: '베이스', vocals: '보컬', other: '멜로디·기타' };
