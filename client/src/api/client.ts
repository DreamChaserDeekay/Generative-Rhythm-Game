import type { ReplayData } from '../engine/replay';
import type { JudgementModeId } from '../engine/config';
import type { Chart, ChartSection, KeyModeId, StemName } from '../engine/types';

export type SongStatus = 'queued' | 'analyzing' | 'ready' | 'error';

export interface ScoreRecord {
  chartId: string;
  songId: string;
  keyMode: KeyModeId;
  difficulty: string;
  level: number;
  seed: number;
  kind?: 'generated' | 'edited' | 'imported';
  name?: string;
  /** The level an imported chart's file gives it, as written. */
  sourceLevel?: string | null;
  /** A generated chart on its tier's default pattern (no target level), and the generator that made it. */
  defaultSeed?: boolean;
  generatorVersion?: string | null;
  /** The best play's base score and RATE. */
  score: number;
  rate: number;
  /**
   * The best of any play: MAX COMBO, and the fewest BREAK of the plays that reached the end (null:
   * none did; a run its gauge stopped never judged the rest).
   */
  maxCombo: number;
  minBreaks?: number | null;
  lamp: string;
  /** The best EX-SCORE and grade-weighted score of the plays under those score rules (null: none). */
  exScore?: number | null;
  weightedScore?: number | null;
  plays: number;
  /** Score id of the best play and whether its replay was kept. */
  bestScoreId?: number;
  hasReplay?: boolean;
  /** When the chart was last played (seconds since 1970, as createdAt). */
  lastPlayedAt?: number;
  /**
   * The same bests of the plays under each judgement mode played (a song's own records only, not
   * the library's list): a play is compared with those of its mode.
   */
  byMode?: Partial<Record<JudgementModeId, ModeRecord>>;
}

/** A chart's bests under one judgement mode, as the record's own. */
export type ModeRecord = Pick<
  ScoreRecord,
  'score' | 'rate' | 'maxCombo' | 'minBreaks' | 'lamp' | 'exScore' | 'weightedScore' | 'plays' | 'bestScoreId' | 'hasReplay' | 'lastPlayedAt'
>;

/** An edited or imported chart kept in the library. */
export interface SavedChart {
  chartId: string;
  songId: string;
  keyMode: KeyModeId;
  difficulty: string;
  level: number;
  noteCount: number;
  kind: 'edited' | 'imported';
  name: string;
  createdAt: number;
  /** The file's format (imported charts) and the level it gives the chart, as written. */
  format?: ExportFormat | null;
  sourceLevel?: string | null;
}

export interface ImportResult {
  songs: Song[];
  charts: { chartId: string; songId: string; keyMode: KeyModeId; level: number; name: string; noteCount: number }[];
  warnings: string[];
}

export interface KeysoundIndex {
  sampleRate: number;
  gain: number;
  /** [first sample, length] of every sound in the sprite. */
  sounds: Record<string, [number, number]>;
}

export type ExportFormat = 'osu' | 'bms' | 'bmson';
export const EXPORT_LABELS: Record<ExportFormat, string> = { osu: 'osu!mania', bms: 'BMS', bmson: 'bmson' };

/** Formats a key mode can be exported to (BMS players know 5K and 7K+1S only). */
export function exportFormats(keyMode: KeyModeId): ExportFormat[] {
  return keyMode === '5K' || keyMode === '7K+1S' ? ['osu', 'bms', 'bmson'] : ['osu'];
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  audioHash: string;
  durationMs: number;
  hasCover: boolean;
  /** When the cover was last set or removed (null: as it came), so a new one is fetched again. */
  coverAt?: number | null;
  status: SongStatus;
  progress: number;
  progressLabel: string;
  error: string | null;
  bpm: number | null;
  bpmMin: number | null;
  bpmMax: number | null;
  previewMs: number | null;
  overrides: { bpm?: number; offsetShiftMs?: number };
  createdAt: number;
  analyzedAt: number | null;
  /** Analyzer version and the backend used for each part (core-dsp / demucs-4.1.0 / ...). */
  analyzer: { version?: string; backends?: Record<string, string>; errors?: Record<string, string> };
  /** The analysis predates the current analyzer or the installed ML backends. */
  outdated?: boolean;
  hasBga: boolean;
  bgaOffsetMs: number;
  /** YouTube video ID of the background (played by YouTube's player), or null. */
  bgaYoutube: string | null;
  /** The user's section edits (null = the analysed sections). */
  sections?: SectionEdit[] | null;
  /** File name of the uploaded audio (exports refer to it). */
  originalName?: string;
  records?: ScoreRecord[];
}

export interface BackendStatus {
  kind: 'stems' | 'beats' | 'pitch' | 'structure';
  name: string;
  installed: boolean;
  active: boolean;
  version: string | null;
  license: string;
}

/** Mapperatorinator, the chart generator (docs/MAPPERATORINATOR.md): its own Python, set up on first use. */
export interface MapperStatus {
  /** Always true (there is no other generator; kept for screens that read it). */
  enabled: boolean;
  /** unsupported (no NVIDIA GPU) · missing (not set up) · installing · failed · ready ("disabled" is no longer sent) */
  state: 'disabled' | 'unsupported' | 'missing' | 'installing' | 'failed' | 'ready';
  model: string;
  gpus: { name: string; memoryMB: number }[];
  home: string;
  reason?: string;
  error?: string;
  progress?: { step: string; fraction: number } | null;
  runtime?: {
    device: string;
    gpu?: string | null;
    memoryMB?: number | null;
    /** CUDA compute capability [major, minor]; bf16 is native from 8 (Ampere). */
    capability?: [number, number] | null;
    /** Whether the GPU runs bf16 natively (what precision "auto" means on it); absent in older installs. */
    bf16?: boolean | null;
    torch?: string;
    model?: string;
  };
  /** The last chart Mapperatorinator failed on (its request was answered with the error; asking again tries again). */
  lastError?: { chart: string; error: string; at: number } | null;
  /** The settings screen's settings (kept in the runtime folder). */
  settings?: MapperSettings;
}

export interface MapperSettings {
  /** Retired: always true (sending it changes nothing). */
  enabled: boolean;
  model: 'v32' | 'v32-mini';
  precision: 'auto' | 'fp32' | 'fp16';
  /** The star rating asked for, times this (1: the level table's). */
  starsScale: number;
  /** null: the model chooses. */
  holdNoteRatio: number | null;
  temperature: number | null;
  /** Retired: always false, the timing is the model's (sending it changes nothing). */
  useAppTiming: boolean;
  /** Hitsound tokens (two of a note's five): off is faster. */
  hitsounds: boolean;
  /** How much of a 16.4 s window is the previous notes (context) and a look ahead; the window advances by the rest. */
  lookback: number;
  lookahead: number;
  /** Windows made independently in batches: fast, no context between windows. */
  parallel: boolean;
}

export interface Health {
  ok: boolean;
  version: string;
  analyzer: string;
  generator: string;
  keyModes: KeyModeId[];
  difficulties: string[];
  formats: string[];
  backends: BackendStatus[];
  mapper?: MapperStatus;
}

export interface GeneratedChartMeta {
  rating: number;
  noteCount: number;
  nps: { avg: number; peak: number; graph: number[]; binMs: number };
  effectiveNps: number;
  densityLimited: boolean;
  /** Share of the strain carried by each hand (difficulty model). */
  handLoad?: { L: number; R: number };
}

export type ServerChart = Chart & { meta: Chart['meta'] & GeneratedChartMeta };

export interface AnalysisResult {
  durationMs: number;
  tempo: { bpm: number; bpmMin: number; bpmMax: number; constant: boolean; confidence: number };
  timing: Chart['timing'];
  beats: { t: number; isDownbeat: boolean }[];
  onsets: {
    t: number;
    strength: number;
    band: 'low' | 'mid' | 'high';
    pitch: number | null;
    sustainEnd: number | null;
    source?: StemName;
    sources?: number[];
    /** How surely a new sound starts here (0..1, analyser 1.6.0+). */
    attack?: number;
  }[];
  sections: { t: number; endT: number; label: string; group: string; energy: number; stems?: number[]; leader?: StemName }[];
  stems?: { names: StemName[]; method: string; energyShare: number[] };
  analyzer?: { name: string; version: string; backends?: Record<string, string>; errors?: Record<string, string> };
  waveform: { frameMs: number; peaks: number[] };
  previewMs: number;
}

/** The song's face for the menus (GET /api/songs/{id}/sketch): sections and waveform peaks. */
export interface SongSketch {
  durationMs: number;
  previewMs: number | null;
  beatsPerBar: number;
  sections: { t: number; endT: number; label: string; group: string; energy: number; leader?: StemName | null }[];
  /** 64 peaks, 0..1. */
  peaks: number[];
  /** Share of the energy per stem. */
  stems: Record<StemName, number> | null;
}

export interface ChartRequest {
  keyMode: KeyModeId;
  difficulty: string;
  targetLevel?: number | null;
  seed?: number | null;
  newSeed?: boolean;
  params?: Record<string, unknown>;
}

/** One section as the user sets it: start (beats from the first downbeat, on a bar line), label, group. */
export interface SectionEdit {
  startBeat: number;
  label: SectionLabel;
  group: string;
}

export type SectionLabel = 'intro' | 'verse' | 'pre-chorus' | 'chorus' | 'bridge' | 'drop' | 'outro';

export interface SongSections {
  /** What charts are made from: the user's edits, else the analysed sections. */
  sections: ChartSection[];
  analysed: ChartSection[];
  edited: boolean;
  beatsPerBar: number;
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, '분석 서버에 연결할 수 없습니다');
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (typeof body.detail === 'string') message = body.detail;
    } catch {
      // keep the status text
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  health: () => request<Health>('/api/health'),
  songs: async () => (await request<{ songs: Song[] }>('/api/songs')).songs,
  song: async (id: string) => (await request<{ song: Song }>(`/api/songs/${id}`)).song,
  upload: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ song: Song; created: boolean }>('/api/songs', { method: 'POST', body: form });
  },
  addDemo: async (bpm = 128, bars = 48) => (await request<{ song: Song }>('/api/songs/demo', json({ bpm, bars }))).song,
  patchSong: (
    id: string,
    patch: {
      title?: string;
      artist?: string;
      bpm?: number;
      clearBpm?: boolean;
      offsetShiftMs?: number;
      bgaOffsetMs?: number;
      bgaYoutube?: string;
      /** [] goes back to the analysed sections. */
      sections?: SectionEdit[];
    },
  ) =>
    request<{ song: Song; reanalyzing: boolean }>(`/api/songs/${id}`, { ...json(patch), method: 'PATCH' }),
  deleteSong: (id: string) => request<void>(`/api/songs/${id}`, { method: 'DELETE' }),
  analysis: (id: string) => request<AnalysisResult>(`/api/songs/${id}/analysis`),
  sections: (id: string) => request<SongSections>(`/api/songs/${id}/sections`),
  sketch: (id: string) => request<SongSketch>(`/api/songs/${id}/sketch`),
  generate: (id: string, req: ChartRequest) => request<{ chart: ServerChart; cached: boolean; notice?: string }>(`/api/songs/${id}/charts`, json(req)),
  mapper: () => request<MapperStatus>('/api/mapper'),
  installMapper: () => request<MapperStatus>('/api/mapper/install', { method: 'POST' }),
  mapperSettings: (patch: Partial<MapperSettings>) => request<MapperStatus>('/api/mapper/settings', { ...json(patch), method: 'PUT' }),
  /** The chart's meta only (made and kept by the server like the whole chart). */
  chartMeta: async (id: string, req: ChartRequest) => (await request<{ meta: ServerChart['meta']; cached: boolean }>(`/api/songs/${id}/charts`, json({ ...req, brief: true }))).meta,
  saveScore: (record: {
    chartId: string;
    songId: string;
    score: number;
    rate: number;
    maxCombo: number;
    lamp: string;
    judgementMode: string;
    breaks: number;
    detail?: Record<string, unknown>;
    replay?: ReplayData | null;
  }) => request<{ id: number; records: ScoreRecord[] }>('/api/scores', json(record)),
  replay: (scoreId: number) => request<ReplayData>(`/api/scores/${scoreId}/replay`),
  reanalyze: async (id: string) => (await request<{ song: Song }>(`/api/songs/${id}/reanalyze`, { method: 'POST' })).song,
  stemsStatus: (id: string) => request<{ names: StemName[]; cached: boolean; method: string }>(`/api/songs/${id}/stems`),
  uploadBga: async (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return (await request<{ song: Song }>(`/api/songs/${id}/bga`, { method: 'POST', body: form })).song;
  },
  deleteBga: (id: string) => request<void>(`/api/songs/${id}/bga`, { method: 'DELETE' }),
  uploadCover: async (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return (await request<{ song: Song }>(`/api/songs/${id}/cover`, { method: 'POST', body: form })).song;
  },
  deleteCover: (id: string) => request<void>(`/api/songs/${id}/cover`, { method: 'DELETE' }),
  savedCharts: async (songId: string) => (await request<{ charts: SavedChart[] }>(`/api/songs/${songId}/charts`)).charts,
  chart: async (chartId: string) => (await request<{ chart: ServerChart }>(`/api/charts/${chartId}`)).chart,
  saveEditedChart: async (songId: string, baseChartId: string, notes: Chart['notes'], name: string) =>
    (await request<{ chart: ServerChart }>(`/api/songs/${songId}/charts/custom`, json({ baseChartId, notes, name }))).chart,
  deleteChart: (chartId: string) => request<void>(`/api/charts/${chartId}`, { method: 'DELETE' }),
  /** Chart packages: `files` with their paths inside a picked folder (or a .zip/.osz). */
  importPackage: (files: { file: File; path: string }[]) => {
    const form = new FormData();
    for (const { file, path } of files) {
      form.append('files', file, file.name);
      form.append('paths', path);
    }
    return request<ImportResult>('/api/import', { method: 'POST', body: form });
  },
  keysoundIndex: (songId: string) => request<KeysoundIndex>(`/api/songs/${songId}/keysounds.json`),
  keysoundUrl: (songId: string) => `/api/songs/${songId}/keysounds.flac`,
  exportUrl: (chartId: string, format: ExportFormat, offsetMs = 0) =>
    `/api/charts/${chartId}/export?format=${format}${offsetMs ? `&offsetMs=${offsetMs}` : ''}`,
  audioUrl: (id: string) => `/api/songs/${id}/audio`,
  stemUrl: (id: string, stem: StemName) => `/api/songs/${id}/stems/${stem}`,
  /** The cover of a song (`song.coverAt` keeps a changed one from being shown from the cache). */
  coverUrl: (song: Pick<Song, 'id' | 'coverAt'>) => `/api/songs/${song.id}/cover${song.coverAt ? `?v=${Math.round(song.coverAt * 1000)}` : ''}`,
  bgaUrl: (id: string) => `/api/songs/${id}/bga`,
};
