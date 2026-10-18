import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import {
  api,
  ApiError,
  EXPORT_LABELS,
  exportFormats,
  type Health,
  type ImportResult,
  type SavedChart,
  type ServerChart,
  type Song,
} from '../api/client';
import { forgetSongBuffer } from '../audio/bufferCache';
import { keysoundStems } from '../audio/stemKeysounds';
import { difficultySystemIds, difficultySystems, enabledKeyModes, tierOf, type DifficultySystemId } from '../engine/config';
import { isReplay, type ReplayData } from '../engine/replay';
import { TempoMap } from '../engine/tempo';
import type { KeyModeId, PatternSummary, StemName } from '../engine/types';
import type { Palette, Settings } from '../settings/settings';
import type { PlayRequest, PracticeOptions } from './App';
import { AnalysisView } from './AnalysisView';
import { ChartMinimap } from './ChartMinimap';
import { lampClass } from './lamps';
import { GenerationPanel, generationParams, PlayRulesPanel, PracticePanel, STYLE_LABELS } from './PlayOptions';
import { buildPlayRequest } from './playRequest';
import { syncTestRequest } from './syncTestRequest';

interface Props {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onPlay: (request: PlayRequest) => void;
  onCalibrate: () => void;
  onOpenSettings: () => void;
  /** Open the chart editor on a chart of the selected song. */
  onEdit: (chart: ServerChart, song: Song) => void;
  selectedSongId: string | null;
  onSelectSong: (id: string | null) => void;
}

const SKILL_LABELS: [string, string][] = [
  ['stream', '스트림'],
  ['chord', '동치'],
  ['jack', '연타'],
  ['longNote', '롱노트'],
  ['technical', '테크니컬'],
  ['stamina', '스태미나'],
];
const PATTERN_LABELS: [keyof PatternSummary, string, string][] = [
  ['stairs', '계단', '한 칸씩 이어지는 3개 이상의 단타'],
  ['trills', '트릴', '두 레인을 번갈아 치는 4개 이상의 단타'],
  ['chords', '동치', '동시에 치는 노트'],
  ['jacks', '연타', '같은 레인을 곧바로 다시 치는 노트'],
  ['holdTaps', '롱잡', '롱노트를 잡은 채 치는 노트'],
  ['leaps', '도약', '빠른 구간에서 세 칸 이상 건너뛰는 이동'],
];
const ACCEPT = '.mp3,.ogg,.oga,.opus,.wav,.flac,.m4a,.aac,audio/*';
const VIDEO_ACCEPT = '.mp4,.webm,.m4v,.mov,.ogv,video/*';
const IMPORT_ACCEPT = '.osz,.zip,.osu,.bms,.bme,.bml,.bmson';
const CHART_FILE = /\.(osz|zip|osu|bms|bme|bml|pms|bmson)$/i;
const IMPORT_FILE = /\.(osz|zip|osu|bms|bme|bml|pms|bmson|wav|ogg|oga|flac|mp3|m4a|aac|opus)$/i;
const KIND_LABELS: Record<string, string> = { edited: '편집', imported: '가져옴' };
const STEM_LABELS: Record<string, string> = { drums: '드럼', bass: '베이스', vocals: '보컬', other: '멜로디·기타' };
const BACKEND_KIND_LABELS: Record<string, string> = { stems: '스템', beats: '비트', pitch: '음높이', structure: '구조' };

function backendLabel(name: string | undefined): string {
  if (!name || name === 'core' || name === 'core-dsp') return '기본';
  return name.replace(/-[\d.]+$/, '');
}

function formatTime(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function bpmLabel(song: Song): string {
  if (song.bpm === null) return '-';
  if (song.bpmMin !== null && song.bpmMax !== null && Math.abs(song.bpmMax - song.bpmMin) > 0.5) {
    return `${Math.round(song.bpmMin)}–${Math.round(song.bpmMax)}`;
  }
  return song.bpm.toFixed(song.bpm % 1 < 0.05 || song.bpm % 1 > 0.95 ? 0 : 1);
}

export function SongSelectScreen(props: Props) {
  const { settings, onSettingsChange, onPlay, selectedSongId, onSelectSong } = props;
  const [health, setHealth] = useState<Health | null | 'offline'>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [query, setQuery] = useState('');
  const [chart, setChart] = useState<ServerChart | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [targetLevel, setTargetLevel] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [panel, setPanel] = useState<'none' | 'rules' | 'generation'>('none');
  const [practice, setPractice] = useState<PracticeOptions | null>(null);
  const [savedCharts, setSavedCharts] = useState<SavedChart[]>([]);
  const [importReport, setImportReport] = useState<ImportResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const replayInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const preview = useRef<HTMLAudioElement | null>(null);

  const keyMode = settings.lastKeyMode;
  const system = difficultySystems[settings.difficultySystem];
  const tiers = system.tiers;
  const difficulty = tierOf(system, settings.lastDifficulty).id;
  const selected = songs.find((s) => s.id === selectedSongId) ?? null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? songs.filter((s) => `${s.title} ${s.artist}`.toLowerCase().includes(q)) : songs;
  }, [songs, query]);

  const refresh = useCallback(async () => {
    try {
      const list = await api.songs();
      setSongs(list);
      return list;
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) setHealth('offline');
      return null;
    }
  }, []);

  const connect = useCallback(async () => {
    setHealth(null);
    try {
      setHealth(await api.health());
      const list = await refresh();
      if (list && list.length > 0 && !list.some((s) => s.id === selectedSongId)) onSelectSong(list[0].id);
    } catch {
      setHealth('offline');
    }
  }, [refresh, selectedSongId, onSelectSong]);

  // Connect once on mount.
  useEffect(() => {
    void connect();
  }, []);

  // Poll while something is being analyzed.
  const analyzing = songs.some((s) => s.status === 'queued' || s.status === 'analyzing');
  useEffect(() => {
    if (!analyzing) return;
    const id = window.setInterval(() => void refresh(), 800);
    return () => window.clearInterval(id);
  }, [analyzing, refresh]);

  // Any change of selection (or of the generation options) invalidates the generated chart,
  // except the switch of key mode / difficulty tabs that picking a saved chart makes.
  const generationKey = JSON.stringify(settings.generation);
  const pickedChart = useRef<ServerChart | null>(null);
  useEffect(() => {
    const picked = pickedChart.current;
    pickedChart.current = null;
    // set right before the tab switch it causes, so this run is that switch
    setChart(picked && picked.meta.keyMode === keyMode ? picked : null);
    setError(null);
    setPractice(null);
  }, [selectedSongId, keyMode, difficulty, system.id, targetLevel, generationKey]);

  // Edited and imported charts of the selected song.
  const loadSaved = useCallback(async (songId: string | null) => {
    if (!songId) {
      setSavedCharts([]);
      return;
    }
    try {
      setSavedCharts(await api.savedCharts(songId));
    } catch {
      setSavedCharts([]);
    }
  }, []);
  useEffect(() => {
    void loadSaved(selectedSongId);
  }, [selectedSongId, loadSaved]);

  // Highlight preview of the selected song.
  useEffect(() => {
    preview.current?.pause();
    preview.current = null;
    if (!selected || selected.status !== 'ready') return;
    const timer = window.setTimeout(() => {
      const audio = new Audio(api.audioUrl(selected.id));
      audio.volume = settings.musicVolume * 0.6;
      audio.addEventListener('loadedmetadata', () => {
        audio.currentTime = (selected.previewMs ?? 0) / 1000;
        audio.play().catch(() => undefined);
      });
      preview.current = audio;
    }, 350);
    return () => {
      window.clearTimeout(timer);
      preview.current?.pause();
      preview.current = null;
    };
    // Restart the preview only when the song (or its readiness) changes, not on volume edits.
  }, [selected?.id, selected?.status]);

  const upload = async (files: FileList | File[]) => {
    setError(null);
    for (const file of Array.from(files)) {
      setBusy(`${file.name} 올리는 중…`);
      try {
        const { song } = await api.upload(file);
        await refresh();
        onSelectSong(song.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    setBusy(null);
  };

  /** Chart packages: files picked one by one, a picked folder, or .zip/.osz archives. */
  const importFiles = async (list: FileList | File[]) => {
    const files = Array.from(list)
      .filter((f) => IMPORT_FILE.test(f.name))
      .map((f) => ({ file: f, path: f.webkitRelativePath || f.name }));
    if (!files.some((f) => CHART_FILE.test(f.file.name))) {
      setError('가져올 채보 파일이 없습니다 (.osz · .zip · .osu · .bms · .bme · .bml · .bmson)');
      return;
    }
    setBusy('채보 가져오는 중… (키음이 많으면 시간이 걸립니다)');
    setError(null);
    setImportReport(null);
    try {
      const result = await api.importPackage(files);
      setImportReport(result);
      await refresh();
      if (result.songs.length > 0) {
        onSelectSong(result.songs[0].id);
        await loadSaved(result.songs[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  };

  const watchReplay = async (replay: ReplayData, song: Song | null = selected) => {
    setError(null);
    try {
      const target = song && song.id === replay.songId ? song : replay.songId ? await api.song(replay.songId) : null;
      if (!target) throw new Error('리플레이의 곡이 라이브러리에 없습니다');
      const c = chart?.meta.chartId === replay.chartId ? chart : await api.chart(replay.chartId);
      preview.current?.pause();
      onPlay(buildPlayRequest(target, c, settings, { autoPlay: false, replay }));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? '리플레이의 채보를 찾을 수 없습니다' : e instanceof Error ? e.message : String(e));
    }
  };

  const openReplayFile = async (file: File) => {
    try {
      const data: unknown = JSON.parse(await file.text());
      if (!isReplay(data)) throw new Error('리플레이 파일이 아닙니다');
      await watchReplay(data, null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const watchBest = async (scoreId: number) => {
    try {
      await watchReplay(await api.replay(scoreId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const pickSaved = async (c: SavedChart) => {
    setError(null);
    setPractice(null);
    try {
      const picked = await api.chart(c.chartId);
      const { keyMode: mode, difficulty: diff, difficultySystem } = picked.meta;
      // show its key mode on the tabs (an imported 7K+1S chart while 4K is selected), and its
      // difficulty too when it is on the selected system or was made on DJMAX / EZ2ON; an
      // imported chart (five-step scale) leaves the chosen difficulty system alone
      const next = { ...settings };
      if (enabledKeyModes.includes(mode)) next.lastKeyMode = mode;
      const pickedSystem = difficultySystem && difficultySystem !== 'GRG' ? difficultySystem : null;
      if (pickedSystem && difficultySystems[pickedSystem]?.tiers.some((t) => t.id === diff)) {
        next.difficultySystem = pickedSystem;
        next.lastDifficulty = diff;
      } else if (system.tiers.some((t) => t.id === diff)) {
        next.lastDifficulty = diff;
      }
      const changed = next.lastKeyMode !== keyMode || next.difficultySystem !== system.id || next.lastDifficulty !== difficulty;
      if (changed) {
        pickedChart.current = picked;
        setTargetLevel(null);
        onSettingsChange(next);
      } else {
        setChart(picked);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteSaved = async (c: SavedChart) => {
    if (!window.confirm(`"${c.name}" 채보를 지울까요? 이 채보의 기록도 함께 지워집니다.`)) return;
    await api.deleteChart(c.chartId).catch((e: Error) => setError(e.message));
    if (chart?.meta.chartId === c.chartId) setChart(null);
    await loadSaved(selectedSongId);
    await refresh();
  };

  const addDemo = async () => {
    setBusy('데모 곡 만드는 중…');
    setError(null);
    try {
      const song = await api.addDemo(128, 48);
      await refresh();
      onSelectSong(song.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  };

  const generate = async (newSeed = false) => {
    if (!selected || selected.status !== 'ready') return null;
    setBusy(newSeed ? '새 패턴 생성 중…' : '채보 생성 중…');
    setError(null);
    try {
      const { chart: c } = await api.generate(selected.id, {
        keyMode,
        difficulty,
        system: system.id,
        targetLevel,
        newSeed,
        params: generationParams(settings.generation, keyMode),
      });
      setChart(c);
      return c;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const play = async () => {
    if (!selected) return;
    const c = chart ?? (await generate());
    if (!c) return;
    preview.current?.pause();
    const best = (selected.records ?? []).find((r) => r.chartId === c.meta.chartId) ?? null;
    onPlay(
      buildPlayRequest(selected, c, settings, {
        autoPlay,
        best: best ? { score: best.score, rate: best.rate } : null,
        practice: practice ?? undefined,
      }),
    );
  };

  const reanalyze = async () => {
    if (!selected) return;
    setError(null);
    try {
      await api.reanalyze(selected.id);
      forgetSongBuffer(selected.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const uploadBga = async (file: File) => {
    if (!selected) return;
    setBusy('배경 영상 올리는 중…');
    setError(null);
    try {
      await api.uploadBga(selected.id, file);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  };

  const removeBga = async () => {
    if (!selected) return;
    await api.deleteBga(selected.id).catch((e: Error) => setError(e.message));
    await refresh();
  };

  const togglePractice = (on: boolean) => {
    if (!on || !chart) {
      setPractice(null);
      return;
    }
    // Start on the bar of the first note and take eight bars.
    const bars = new TempoMap(chart.timing).barLines(chart.meta.durationMs ?? 0);
    const first = Math.min(...chart.notes.map((n) => n.t));
    let i = bars.findIndex((b) => b > first);
    i = i < 0 ? Math.max(0, bars.length - 1) : Math.max(0, i - 1);
    const startMs = bars[i] ?? 0;
    const endMs = bars[Math.min(bars.length - 1, i + 8)] ?? chart.meta.durationMs ?? startMs + 15000;
    setPractice({ startMs, endMs: endMs > startMs ? endMs : startMs + 15000, rate: 1, loop: true });
  };

  const patch = async (body: Parameters<typeof api.patchSong>[1]) => {
    if (!selected) return;
    setError(null);
    try {
      await api.patchSong(selected.id, body);
      forgetSongBuffer(selected.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async () => {
    if (!selected || !window.confirm(`"${selected.title}"을(를) 라이브러리에서 지울까요? 기록도 함께 지워집니다.`)) return;
    await api.deleteSong(selected.id).catch((e: Error) => setError(e.message));
    const list = await refresh();
    onSelectSong(list && list.length > 0 ? list[0].id : null);
  };

  const setKeyMode = (m: KeyModeId) => onSettingsChange({ ...settings, lastKeyMode: m });
  const setDifficulty = (d: string) => {
    setTargetLevel(null);
    onSettingsChange({ ...settings, lastDifficulty: d });
  };
  const setSystem = (id: DifficultySystemId) => {
    setTargetLevel(null);
    // the same step of the new system (NORMAL → NM …), else its second tier
    const next = difficultySystems[id];
    const index = Math.min(tiers.findIndex((t) => t.id === difficulty), next.tiers.length - 1);
    const tier = next.tiers.find((t) => t.id === next.aliases[difficulty]) ?? next.tiers[Math.max(0, index)] ?? next.tiers[0];
    onSettingsChange({ ...settings, difficultySystem: id, lastDifficulty: tier.id });
  };

  // Keyboard navigation: arrows pick song/difficulty, Enter plays, Tab switches key mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = filtered.findIndex((s) => s.id === selectedSongId);
      if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (filtered.length === 0) return;
        const next = e.code === 'ArrowDown' ? Math.min(filtered.length - 1, idx + 1) : Math.max(0, idx - 1);
        onSelectSong(filtered[next < 0 ? 0 : next].id);
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        const d = tiers.findIndex((t) => t.id === difficulty) + (e.code === 'ArrowRight' ? 1 : -1);
        if (d >= 0 && d < tiers.length) setDifficulty(tiers[d].id);
      } else if (e.code === 'Enter') {
        e.preventDefault();
        void play();
      } else if (e.code === 'Tab') {
        e.preventDefault();
        const m = enabledKeyModes[(enabledKeyModes.indexOf(keyMode) + 1) % enabledKeyModes.length];
        setKeyMode(m);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.some((f) => CHART_FILE.test(f.name))) void importFiles(files);
    else if (files.length > 0) void upload(files);
  };

  const records = (selected?.records ?? []).filter((r) => r.keyMode === keyMode);
  const bestFor = (d: string) =>
    records
      .filter((r) => r.difficulty === d)
      .sort((a, b) => b.score - a.score)[0];

  const selectedTier = tierOf(system, difficulty);

  return (
    <div className="select-screen" onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}>
      <header className="select-header">
        <div className="brand">
          <h1>Generative Rhythm</h1>
          <p className="tagline">내 음악으로 만드는 채보 · SDVX 시점 · DJMAX 판정</p>
        </div>
        <nav className="tools">
          <button className="quiet" data-testid="sync-auto" onClick={() => onPlay(syncTestRequest(keyMode, true))}>싱크 테스트</button>
          <button className="quiet" data-testid="open-calibration" onClick={props.onCalibrate}>캘리브레이션</button>
          <button className="quiet" data-testid="open-replay" onClick={() => replayInput.current?.click()} title="저장한 리플레이 파일(.grgreplay.json) 보기">
            리플레이 열기
          </button>
          <input
            ref={replayInput}
            type="file"
            accept=".json,application/json"
            hidden
            data-testid="replay-input"
            onChange={(e) => {
              if (e.target.files?.[0]) void openReplayFile(e.target.files[0]);
              e.target.value = '';
            }}
          />
          <button className="quiet" data-testid="open-settings" onClick={props.onOpenSettings}>설정</button>
        </nav>
      </header>

      {health === 'offline' && (
        <section className="panel offline" data-testid="server-offline">
          <h2>분석 서버에 연결할 수 없습니다</h2>
          <p className="hint">곡 분석과 채보 생성은 로컬 Python 서버가 맡습니다. 터미널에서 서버를 실행한 뒤 다시 연결하세요.</p>
          <pre>cd server{'\n'}python -m rhythm_server</pre>
          <div className="row">
            <button className="primary" onClick={() => void connect()}>다시 연결</button>
            <button onClick={() => onPlay(syncTestRequest(keyMode, false))}>서버 없이 싱크 테스트</button>
          </div>
        </section>
      )}

      <div className="select-body">
        <aside className="song-list-panel">
          <div className="row">
            <button className={songs.length === 0 ? 'primary' : ''} data-testid="upload-button" onClick={() => fileInput.current?.click()} disabled={health === 'offline'}>
              곡 추가
            </button>
            <button data-testid="demo-button" onClick={() => void addDemo()} disabled={health === 'offline'}>데모 곡</button>
          </div>
          <div className="row import-row">
            <span className="label">채보 가져오기</span>
            <button className="small" data-testid="import-button" onClick={() => importInput.current?.click()} disabled={health === 'offline'} title="osu!mania(.osz·.osu) · BMS · bmson 채보 파일이나 압축 파일">
              파일·압축
            </button>
            <button className="small" data-testid="import-folder-button" onClick={() => folderInput.current?.click()} disabled={health === 'offline'} title="BMS·bmson 폴더(키음 포함)">
              폴더
            </button>
            <input
              ref={importInput}
              type="file"
              accept={IMPORT_ACCEPT}
              multiple
              hidden
              data-testid="import-input"
              onChange={(e) => {
                if (e.target.files) void importFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <input
              ref={(el) => {
                folderInput.current = el;
                el?.setAttribute('webkitdirectory', '');
              }}
              type="file"
              multiple
              hidden
              data-testid="import-folder-input"
              onChange={(e) => {
                if (e.target.files) void importFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              data-testid="file-input"
              onChange={(e) => {
                if (e.target.files) void upload(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
          {importReport && (
            <div className="import-report" data-testid="import-report">
              <div className="row">
                <strong>채보 {importReport.charts.length}개를 가져왔습니다</strong>
                <button className="small" onClick={() => setImportReport(null)}>닫기</button>
              </div>
              {importReport.warnings.length > 0 && (
                <details>
                  <summary>알림 {importReport.warnings.length}개</summary>
                  <ul>{importReport.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </details>
              )}
            </div>
          )}
          <input type="search" className="search" placeholder="제목·아티스트 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className={`song-list ${dragOver ? 'drag' : ''}`} data-testid="song-list">
            {filtered.length === 0 && (
              <div className="empty-list">
                {songs.length === 0 ? '음악 파일을 끌어다 놓거나 "곡 추가"를 누르세요. (mp3 · ogg · wav · flac · m4a)' : '검색 결과가 없습니다'}
              </div>
            )}
            {filtered.map((s) => (
              <button
                key={s.id}
                className={`song-item ${s.id === selectedSongId ? 'active' : ''}`}
                data-testid="song-item"
                onClick={() => onSelectSong(s.id)}
              >
                <Cover song={s} />
                <div className="song-item-text">
                  <div className="song-title">{s.title}</div>
                  <div className="song-sub">
                    <span className="artist">{s.artist || '알 수 없는 아티스트'}</span>
                    <span className="meta">
                      · {formatTime(s.durationMs)}
                      {s.status === 'ready' ? ` · ${bpmLabel(s)} BPM` : ''}
                    </span>
                  </div>
                  {(s.status === 'queued' || s.status === 'analyzing') && (
                    <div className="progress small"><div style={{ width: `${Math.round(s.progress * 100)}%` }} /></div>
                  )}
                  {s.status === 'error' && <div className="song-sub error">분석 실패</div>}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="song-detail">
          {!selected && <section className="panel"><p className="hint">왼쪽에서 곡을 고르세요.</p></section>}
          {selected && (
            <>
              <div className="key-modes">
                <span className="label">키 모드</span>
                <div className="segmented">
                  {enabledKeyModes.map((m) => (
                    <button key={m} className={m === keyMode ? 'active' : ''} onClick={() => setKeyMode(m)}>{m}</button>
                  ))}
                </div>
                <kbd>Tab</kbd>
              </div>

              <section className="hero">
                <Cover song={selected} />
                <div className="hero-text">
                  <h2 data-testid="song-title" title={selected.title}>{selected.title}</h2>
                  <p className="artist">{selected.artist || '알 수 없는 아티스트'}</p>
                  <p className="hero-meta">
                    <span>
                      <b>BPM</b>
                      {bpmLabel(selected)}
                      {selected.overrides.bpm ? <small>(보정됨)</small> : null}
                    </span>
                    <span>
                      <b>길이</b>
                      {formatTime(selected.durationMs)}
                    </span>
                  </p>
                  {selected.status === 'ready' && selected.analyzer?.backends && (
                    <p className="backends" data-testid="analysis-backends">
                      분석:{' '}
                      {Object.entries(selected.analyzer.backends)
                        .map(([kind, name]) => `${BACKEND_KIND_LABELS[kind] ?? kind} ${backendLabel(name)}`)
                        .join(' · ')}
                      {selected.outdated && (
                        <button className="small" data-testid="reanalyze" onClick={() => void reanalyze()} title="분석기가 바뀌었거나 ML 백엔드가 새로 설치되었습니다">
                          다시 분석
                        </button>
                      )}
                    </p>
                  )}
                  {selected.status !== 'ready' && (
                    <div data-testid="analysis-status">
                      <p className="hint">
                        {selected.status === 'error' ? `분석 실패: ${selected.error}` : `${selected.progressLabel || '분석 대기'} ${Math.round(selected.progress * 100)}%`}
                      </p>
                      {selected.status !== 'error' && <div className="progress"><div style={{ width: `${Math.round(selected.progress * 100)}%` }} /></div>}
                    </div>
                  )}
                </div>
                <div className="hero-level">
                  {chart ? (
                    <div className="level-badge" style={{ ['--diff' as string]: chartTier(chart.meta).color } as CSSProperties} title={chartTier(chart.meta).label}>
                      <span>{chart.meta.difficultySystem && chart.meta.difficultySystem !== 'GRG' ? `${chart.meta.difficultySystem} ${chart.meta.difficulty}` : chart.meta.difficulty}</span>
                      <strong data-testid="chart-level">
                        <small>{chart.meta.levelScale ? `${chart.meta.levelScale} ` : 'Lv.'}</small>
                        {chart.meta.level}
                      </strong>
                    </div>
                  ) : (
                    <div className="level-pending" style={{ ['--diff' as string]: selectedTier.color } as CSSProperties}>
                      <b>{system.id === 'GRG' ? selectedTier.label : `${system.label} ${selectedTier.short}`}</b>
                      <em>{targetLevel !== null ? `목표 ${levelLabel(selectedTier, Math.min(targetLevel, system.maxLevel))}` : `보통 ${levelRange(selectedTier)}`}</em>
                      <small>레벨은 채보를 만들 때 정해집니다</small>
                    </div>
                  )}
                </div>
              </section>

              <div className="row system-row">
                <span className="label">난이도 기준</span>
                <div className="segmented" data-testid="difficulty-system">
                  {difficultySystemIds.map((id) => (
                    <button key={id} className={id === system.id ? 'active' : ''} onClick={() => setSystem(id)} data-testid={`system-${id}`}>
                      {difficultySystems[id].label}
                    </button>
                  ))}
                </div>
                <span className="hint">
                  {system.id === 'GRG' ? '이 게임의 5단계 (Lv.1–15)' : `${system.title}의 난이도별 레벨·밀도·패턴을 따릅니다 (Lv.1–${system.maxLevel})`}
                </span>
              </div>
              <div className="difficulty-row" data-testid="difficulty-row">
                {tiers.map((t) => {
                  const best = bestFor(t.id);
                  return (
                    <button
                      key={t.id}
                      className={`difficulty ${t.id === difficulty && targetLevel === null ? 'active' : ''}`}
                      style={{ ['--diff' as string]: t.color } as CSSProperties}
                      onClick={() => setDifficulty(t.id)}
                      title={t.levelScale ? `${t.label}: 레벨이 따로 매겨지는 고난도 채보 (${t.levelScale} 1–15)` : `보통 Lv.${t.levels[0]}–${t.levels[1]}`}
                    >
                      <span className="diff-head">
                        <span className="diff-name">{t.label}</span>
                        <span className="diff-short" hidden={t.short === t.label}>{t.short}</span>
                      </span>
                      <span className="diff-range">{levelRange(t)}</span>
                      {best && <span className={`diff-lamp ${lampClass(best.lamp)}`}>{best.rate.toFixed(2)}%</span>}
                    </button>
                  );
                })}
              </div>

              <div className="play-row">
                <button className="primary" data-testid="play-button" disabled={selected.status !== 'ready' || busy !== null} onClick={() => void play()}>
                  {practice ? '연습 시작' : chart ? '플레이' : '채보 생성 & 플레이'} <kbd>Enter</kbd>
                </button>
                <button data-testid="generate-button" disabled={selected.status !== 'ready' || busy !== null} onClick={() => void generate(chart !== null)}>
                  {chart ? '다른 패턴' : '채보 미리보기'}
                </button>
                {busy && <span className="hint" data-testid="busy">{busy}</span>}
              </div>
              <div className="option-row">
                <button
                  className={panel === 'rules' ? 'active' : ''}
                  data-testid="toggle-rules"
                  aria-expanded={panel === 'rules'}
                  onClick={() => setPanel(panel === 'rules' ? 'none' : 'rules')}
                >
                  플레이 옵션
                </button>
                <button
                  className={panel === 'generation' ? 'active' : ''}
                  data-testid="toggle-generation"
                  aria-expanded={panel === 'generation'}
                  onClick={() => setPanel(panel === 'generation' ? 'none' : 'generation')}
                >
                  생성 옵션{settings.generation.style !== 'balanced' ? ` · ${STYLE_LABELS[settings.generation.style]}` : ''}
                  {settings.generation.patternEngine === 'classic' ? ' · 이전 배치' : ''}
                </button>
                <label className="check">
                  <input type="checkbox" checked={autoPlay} onChange={(e) => setAutoPlay(e.target.checked)} data-testid="autoplay-toggle" />
                  오토 플레이
                </label>
                <label className="check">
                  <input type="checkbox" checked={targetLevel !== null} onChange={(e) => setTargetLevel(e.target.checked ? 8 : null)} />
                  목표 레벨 직접 지정
                </label>
                {targetLevel !== null && (
                  <>
                    <input type="range" min={1} max={system.maxLevel} value={Math.min(targetLevel, system.maxLevel)} onChange={(e) => setTargetLevel(Number(e.target.value))} />
                    <span className="value">{levelLabel(selectedTier, Math.min(targetLevel, system.maxLevel))}</span>
                  </>
                )}
                <label className="check">
                  <input type="checkbox" checked={practice !== null} disabled={!chart} onChange={(e) => togglePractice(e.target.checked)} data-testid="practice-toggle" />
                  연습 모드
                </label>
              </div>
              {panel === 'rules' && <PlayRulesPanel settings={settings} onSettingsChange={onSettingsChange} />}
              {panel === 'generation' && <GenerationPanel settings={settings} onSettingsChange={onSettingsChange} keyMode={keyMode} />}
              {practice && <PracticePanel practice={practice} onChange={setPractice} />}
              {error && <p className="error" data-testid="select-error">{error}</p>}

              {savedCharts.length > 0 && (
                <section className="panel saved-charts" data-testid="saved-charts">
                  <h3>저장된 채보</h3>
                  {savedCharts.map((c) => (
                    <div key={c.chartId} className={`saved-chart ${chart?.meta.chartId === c.chartId ? 'active' : ''}`} data-testid="saved-chart">
                      <span className={`kind kind-${c.kind}`}>{KIND_LABELS[c.kind] ?? c.kind}</span>
                      <span className="name">{c.name || `${c.keyMode} ${c.difficulty}`}</span>
                      <span className="sub">
                        {c.keyMode} · Lv.{c.level} · 노트 {c.noteCount}
                      </span>
                      <button className="small" data-testid="pick-saved" onClick={() => void pickSaved(c)}>
                        고르기
                      </button>
                      <button className="small danger" onClick={() => void deleteSaved(c)}>삭제</button>
                    </div>
                  ))}
                </section>
              )}

              {chart && (
                <ChartPreview
                  chart={chart}
                  palette={settings.palette}
                  keysound={settings.keysound}
                  practice={practice}
                  onSelectRange={(startMs, endMs) => setPractice((p) => ({ rate: 1, loop: true, ...p, startMs, endMs }))}
                  onEdit={() => props.onEdit(chart, selected)}
                  bestReplay={(selected.records ?? []).find((r) => r.chartId === chart.meta.chartId && r.hasReplay)?.bestScoreId ?? null}
                  onWatchBest={(id) => void watchBest(id)}
                />
              )}

              <section className="panel song-tools">
                <h3>곡 설정</h3>
                <div className="row">
                  <span className="label">BPM 보정</span>
                  <button className="small" disabled={selected.status !== 'ready' || !selected.bpm} onClick={() => selected.bpm && void patch({ bpm: selected.bpm * 2 })}>×2</button>
                  <button className="small" disabled={selected.status !== 'ready' || !selected.bpm} onClick={() => selected.bpm && void patch({ bpm: selected.bpm / 2 })}>÷2</button>
                  <BpmInput onApply={(bpm) => void patch({ bpm })} disabled={selected.status !== 'ready'} />
                  {selected.overrides.bpm !== undefined && <button className="small" onClick={() => void patch({ clearBpm: true })}>자동으로</button>}
                </div>
                <div className="row">
                  <span className="label">첫 박 위치</span>
                  {[-10, -1, 1, 10].map((d) => (
                    <button key={d} className="small" disabled={selected.status !== 'ready'} onClick={() => void patch({ offsetShiftMs: (selected.overrides.offsetShiftMs ?? 0) + d })}>
                      {d > 0 ? `+${d}` : d}ms
                    </button>
                  ))}
                  <span className="value">{selected.overrides.offsetShiftMs ? `${selected.overrides.offsetShiftMs > 0 ? '+' : ''}${selected.overrides.offsetShiftMs}ms` : '자동'}</span>
                </div>
                <p className="hint">비트가 어긋나 보이면 보정하세요. 보정하면 곡을 다시 분석하고 채보를 새로 만듭니다.</p>
                <div className="row">
                  <span className="label">배경 영상</span>
                  {selected.hasBga ? (
                    <>
                      <span className="value" data-testid="bga-status">등록됨</span>
                      {[-100, -10, 10, 100].map((d) => (
                        <button key={d} className="small" onClick={() => void patch({ bgaOffsetMs: (selected.bgaOffsetMs ?? 0) + d })}>
                          {d > 0 ? `+${d}` : d}ms
                        </button>
                      ))}
                      <span className="value">{selected.bgaOffsetMs ? `${selected.bgaOffsetMs > 0 ? '+' : ''}${selected.bgaOffsetMs}ms` : '0ms'}</span>
                      <button className="small" onClick={() => void removeBga()}>지우기</button>
                    </>
                  ) : (
                    <button className="small" data-testid="bga-upload" onClick={() => videoInput.current?.click()}>
                      영상 고르기 (mp4·webm)
                    </button>
                  )}
                  <input
                    ref={videoInput}
                    type="file"
                    accept={VIDEO_ACCEPT}
                    hidden
                    data-testid="bga-input"
                    onChange={(e) => {
                      if (e.target.files?.[0]) void uploadBga(e.target.files[0]);
                      e.target.value = '';
                    }}
                  />
                </div>
                <div className="row">
                  <button className="small" data-testid="toggle-analysis" disabled={selected.status !== 'ready'} onClick={() => setShowAnalysis((v) => !v)}>
                    {showAnalysis ? '분석 보기 닫기' : '분석 보기'}
                  </button>
                  <button className="small danger" onClick={() => void remove()}>라이브러리에서 삭제</button>
                </div>
                {showAnalysis && selected.status === 'ready' && <AnalysisView songId={selected.id} />}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

/** "Lv.2–8", or "SC 4–12" for a tier on a scale of its own. */
function levelRange(t: { levels: [number, number]; levelScale?: string }): string {
  return `${t.levelScale ? `${t.levelScale} ` : 'Lv.'}${t.levels[0]}–${t.levels[1]}`;
}

function levelLabel(t: { levelScale?: string }, level: number): string {
  return t.levelScale ? `${t.levelScale} ${level}` : `Lv.${level}`;
}

function Cover({ song }: { song: Song }) {
  const [failed, setFailed] = useState(false);
  if (song.hasCover && !failed) {
    return <img className="cover" src={api.coverUrl(song.id)} alt="" onError={() => setFailed(true)} />;
  }
  return <div className="cover placeholder">{song.title.slice(0, 1).toUpperCase()}</div>;
}

function BpmInput({ onApply, disabled }: { onApply: (bpm: number) => void; disabled: boolean }) {
  const [value, setValue] = useState('');
  const bpm = Number(value);
  return (
    <>
      <input type="number" placeholder="BPM" value={value} onChange={(e) => setValue(e.target.value)} disabled={disabled} />
      <button className="small" disabled={disabled || !(bpm > 20 && bpm < 400)} onClick={() => { onApply(bpm); setValue(''); }}>
        적용
      </button>
    </>
  );
}

function ChartPreview(props: {
  chart: ServerChart;
  palette: Palette;
  /** Keysounds of generated charts are on (the keysounded stems are marked). */
  keysound: boolean;
  practice: PracticeOptions | null;
  onSelectRange: (startMs: number, endMs: number) => void;
  onEdit: () => void;
  /** Score id of the best play of this chart when its replay was kept. */
  bestReplay: number | null;
  onWatchBest: (scoreId: number) => void;
}) {
  const { chart } = props;
  const m = chart.meta;
  const graph = m.nps.graph;
  const max = Math.max(1, ...graph);
  const w = 360;
  const h = 70;
  const step = graph.length > 1 ? w / (graph.length - 1) : w;
  const points = graph.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`).join(' ');
  const holds = chart.notes.filter((n) => n.type === 'hold').length;
  const keyed = props.keysound && !(chart.sounds?.length ?? 0) ? keysoundStems(chart.notes) : [];
  return (
    <section className="panel chart-preview" data-testid="chart-preview">
      <h3>채보 정보</h3>
      <div className="preview-stats">
        <div><span className="label">노트</span> <strong data-testid="chart-notes">{m.noteCount}</strong></div>
        <div><span className="label">롱노트</span> <strong>{holds}</strong></div>
        <div><span className="label">평균 / 최대 NPS</span> <strong>{m.nps.avg} / {m.nps.peak}</strong></div>
        <div><span className="label">세부 난이도</span> <strong>{m.rating.toFixed(2)}</strong></div>
        {m.handLoad && (
          <div title="손별 부담 (난이도 모델의 손 strain 비율)">
            <span className="label">왼손 / 오른손</span> <strong>{Math.round(m.handLoad.L * 100)} / {Math.round(m.handLoad.R * 100)}</strong>
          </div>
        )}
        {m.repeatConsistency != null && (
          <div title="반복 구간(같은 후렴 등)에서 첫 등장과 같은 레인 패턴을 쓴 비율">
            <span className="label">반복 패턴 일치</span> <strong>{Math.round(m.repeatConsistency * 100)}%</strong>
          </div>
        )}
        {m.source && m.source.kind !== 'generated' && (
          <div data-testid="chart-source">
            <span className="label">{KIND_LABELS[m.source.kind] ?? m.source.kind}</span>{' '}
            <strong>
              {m.chartName ?? ''}
              {m.source.format ? ` (${EXPORT_LABELS[m.source.format]})` : ''}
              {(chart.sounds?.length ?? 0) > 0 ? ` · 키음 ${chart.sounds?.length}개` : ''}
            </strong>
          </div>
        )}
      </div>
      <div className="row preview-actions">
        <button className="small" data-testid="edit-chart" onClick={props.onEdit}>
          채보 편집
        </button>
        {props.bestReplay !== null && (
          <button className="small" data-testid="watch-best" onClick={() => props.onWatchBest(props.bestReplay as number)}>
            최고 기록 리플레이
          </button>
        )}
        <span className="label export-label">내보내기</span>
        {exportFormats(m.keyMode).map((f) => (
          <a key={f} className="button small" href={api.exportUrl(m.chartId, f)} download data-testid={`export-${f}`}>
            {EXPORT_LABELS[f]}
          </a>
        ))}
        <span className="hint">음원은 넣지 않고 파일 이름만 적습니다</span>
      </div>
      {m.keysound && (
        <div className="stem-mix" data-testid="stem-mix" title="노트가 따라가는 악기(스템) 비율 · 밑줄은 키음이 나는 악기">
          {(Object.entries(m.keysound.shares) as [StemName, number][]).map(([stem, share]) =>
            share > 0 ? (
              <span key={stem} className={`stem stem-${stem} ${keyed.includes(stem) ? 'lead' : ''}`} style={{ flexGrow: share }}>
                {share >= 0.08 ? `${STEM_LABELS[stem] ?? stem} ${Math.round(share * 100)}%` : ''}
              </span>
            ) : null,
          )}
        </div>
      )}
      {m.patterns && (
        <div className="pattern-mix" data-testid="pattern-mix">
          <span className="label">패턴</span>
          {PATTERN_LABELS.map(([key, label, title]) => (
            <span key={key} className="pattern-chip" title={title}>
              {label} <strong>{Math.round((m.patterns?.[key] ?? 0) * 100)}%</strong>
            </span>
          ))}
        </div>
      )}
      {m.densityLimited && <p className="hint">곡의 소리 밀도가 낮아 목표 레벨까지 올리지 못했습니다. 없는 소리에 노트를 만들지 않기 때문입니다.</p>}
      <ChartMinimap
        chart={chart}
        palette={props.palette}
        selection={props.practice ? [props.practice.startMs, props.practice.endMs] : null}
        onSelect={props.practice ? props.onSelectRange : undefined}
      />
      <div className="graph-label">
        <span>NPS</span>
        <span>최대 {m.nps.peak}</span>
      </div>
      <svg className="nps-graph" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="NPS 그래프">
        <polygon points={`0,${h} ${points} ${w},${h}`} className="nps-area" />
        <polyline points={points} className="nps-line" />
      </svg>
      <div className="skills">
        {SKILL_LABELS.map(([key, label]) => (
          <div className="skill" key={key}>
            <span>{label}</span>
            <div className="skill-bar"><div style={{ width: `${Math.round((m.skillset?.[key] ?? 0) * 100)}%` }} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The tier a chart's difficulty belongs to (imported charts use the five GRG steps). */
function chartTier(m: { difficulty: string; difficultySystem?: DifficultySystemId }) {
  const system = difficultySystems[m.difficultySystem ?? 'GRG'] ?? difficultySystems.GRG;
  return system.tiers.find((t) => t.id === m.difficulty) ?? { id: m.difficulty, label: m.difficulty, short: m.difficulty, levels: [1, 15] as [number, number], color: '#9fb4ff' };
}
