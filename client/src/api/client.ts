import type { Chart, KeyModeId } from '../engine/types';

export type SongStatus = 'queued' | 'analyzing' | 'ready' | 'error';

export interface ScoreRecord {
  chartId: string;
  songId: string;
  keyMode: KeyModeId;
  difficulty: string;
  level: number;
  seed: number;
  score: number;
  rate: number;
  maxCombo: number;
  lamp: string;
  plays: number;
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
  records?: ScoreRecord[];
}

export interface Health {
  ok: boolean;
  version: string;
  analyzer: string;
  generator: string;
  keyModes: KeyModeId[];
  difficulties: string[];
  formats: string[];
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
  onsets: { t: number; strength: number; band: 'low' | 'mid' | 'high'; pitch: number | null; sustainEnd: number | null }[];
  sections: { t: number; endT: number; label: string; group: string; energy: number }[];
  waveform: { frameMs: number; peaks: number[] };
  previewMs: number;
}

export interface ChartRequest {
  keyMode: KeyModeId;
  difficulty: string;
  targetLevel?: number | null;
  seed?: number | null;
  newSeed?: boolean;
  params?: Record<string, unknown>;
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
  patchSong: (id: string, patch: { title?: string; artist?: string; bpm?: number; clearBpm?: boolean; offsetShiftMs?: number }) =>
    request<{ song: Song; reanalyzing: boolean }>(`/api/songs/${id}`, { ...json(patch), method: 'PATCH' }),
  deleteSong: (id: string) => request<void>(`/api/songs/${id}`, { method: 'DELETE' }),
  analysis: (id: string) => request<AnalysisResult>(`/api/songs/${id}/analysis`),
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
  }) => request<{ id: number; records: ScoreRecord[] }>('/api/scores', json(record)),
  audioUrl: (id: string) => `/api/songs/${id}/audio`,
  coverUrl: (id: string) => `/api/songs/${id}/cover`,
};
