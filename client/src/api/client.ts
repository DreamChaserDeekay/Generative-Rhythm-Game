import type { ReplayData } from '../engine/replay';
import type { DifficultySystemId } from '../engine/config';
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
  score: number;
  rate: number;
  maxCombo: number;
  lamp: string;
  plays: number;
  /** Score id of the best play and whether its replay was kept. */
  bestScoreId?: number;
  hasReplay?: boolean;
}

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

export interface Health {
  ok: boolean;
  version: string;
  analyzer: string;
  generator: string;
  keyModes: KeyModeId[];
  difficulties: string[];
  formats: string[];
  backends: BackendStatus[];
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
  }[];
  sections: { t: number; endT: number; label: string; group: string; energy: number; stems?: number[]; leader?: StemName }[];
  stems?: { names: StemName[]; method: string; energyShare: number[] };
  analyzer?: { name: string; version: string; backends?: Record<string, string>; errors?: Record<string, string> };
  waveform: { frameMs: number; peaks: number[] };
  previewMs: number;
}

export interface ChartRequest {
  keyMode: KeyModeId;
  difficulty: string;
  /** Difficulty system the tier belongs to (GRG, DJMAX, EZ2ON). */
  system?: DifficultySystemId;
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
  generate: (id: string, req: ChartRequest) => request<{ chart: ServerChart; cached: boolean }>(`/api/songs/${id}/charts`, json(req)),
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
  coverUrl: (id: string) => `/api/songs/${id}/cover`,
  bgaUrl: (id: string) => `/api/songs/${id}/bga`,
};
