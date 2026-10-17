import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { api, ApiError, type Health, type ServerChart, type Song } from '../api/client';
import { songBuffer, forgetSongBuffer } from '../audio/bufferCache';
import { enabledKeyModes } from '../engine/config';
import type { KeyModeId } from '../engine/types';
import type { Settings } from '../settings/settings';
import type { PlayRequest } from './App';
import { AnalysisView } from './AnalysisView';
import { syncTestRequest } from './syncTestRequest';

interface Props {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onPlay: (request: PlayRequest) => void;
  onCalibrate: () => void;
  onOpenSettings: () => void;
  selectedSongId: string | null;
  onSelectSong: (id: string | null) => void;
}

const DIFFICULTIES = ['EASY', 'NORMAL', 'HARD', 'EXPERT', 'MASTER'];
const DIFF_SHORT: Record<string, string> = { EASY: 'EZ', NORMAL: 'NM', HARD: 'HD', EXPERT: 'EX', MASTER: 'MX' };
const LAMP_CLASS: Record<string, string> = { 'PERFECT PLAY': 'perfect', 'MAX COMBO': 'maxcombo', CLEAR: 'clear', FAILED: 'failed' };
const SKILL_LABELS: [string, string][] = [
  ['stream', '스트림'],
  ['chord', '동치'],
  ['jack', '연타'],
  ['longNote', '롱노트'],
  ['technical', '테크니컬'],
  ['stamina', '스태미나'],
];
const ACCEPT = '.mp3,.ogg,.oga,.opus,.wav,.flac,.m4a,.aac,audio/*';

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
  const fileInput = useRef<HTMLInputElement>(null);
  const preview = useRef<HTMLAudioElement | null>(null);

  const keyMode = settings.lastKeyMode;
  const difficulty = settings.lastDifficulty;
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

  // Any change of selection invalidates the generated chart.
  useEffect(() => {
    setChart(null);
    setError(null);
  }, [selectedSongId, keyMode, difficulty, targetLevel]);

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
      const { chart: c } = await api.generate(selected.id, { keyMode, difficulty, targetLevel, newSeed });
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
    const songId = selected.id;
    onPlay({ chart: c, autoPlay, loadAudio: () => songBuffer(songId) });
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
        const d = DIFFICULTIES.indexOf(difficulty) + (e.code === 'ArrowRight' ? 1 : -1);
        if (d >= 0 && d < DIFFICULTIES.length) setDifficulty(DIFFICULTIES[d]);
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
    if (e.dataTransfer.files.length > 0) void upload(e.dataTransfer.files);
  };

  const records = (selected?.records ?? []).filter((r) => r.keyMode === keyMode);
  const bestFor = (d: string) =>
    records
      .filter((r) => r.difficulty === d)
      .sort((a, b) => b.score - a.score)[0];

  return (
    <div className="select-screen" onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}>
      <header className="select-header">
        <div>
          <h1>Generative Rhythm</h1>
          <p className="tagline">내 음악으로 만드는 채보 · SDVX 시점 · DJMAX 판정</p>
        </div>
        <nav className="row">
          <button data-testid="sync-auto" onClick={() => onPlay(syncTestRequest(keyMode, true))}>싱크 테스트</button>
          <button data-testid="open-calibration" onClick={props.onCalibrate}>캘리브레이션</button>
          <button data-testid="open-settings" onClick={props.onOpenSettings}>설정</button>
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
            <button className="primary" data-testid="upload-button" onClick={() => fileInput.current?.click()} disabled={health === 'offline'}>
              곡 추가
            </button>
            <button data-testid="demo-button" onClick={() => void addDemo()} disabled={health === 'offline'}>데모 곡</button>
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
                <Cover song={s} size={44} />
                <div className="song-item-text">
                  <div className="song-title">{s.title}</div>
                  <div className="song-sub">
                    {s.artist || '알 수 없는 아티스트'} · {formatTime(s.durationMs)}
                    {s.status === 'ready' ? ` · ${bpmLabel(s)} BPM` : ''}
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
              <section className="panel detail-head">
                <Cover song={selected} size={120} />
                <div className="detail-text">
                  <h2 data-testid="song-title">{selected.title}</h2>
                  <p className="sub">{selected.artist || '알 수 없는 아티스트'}</p>
                  <p className="sub">
                    {formatTime(selected.durationMs)} · BPM {bpmLabel(selected)}
                    {selected.overrides.bpm ? ' (보정됨)' : ''}
                  </p>
                  {selected.status !== 'ready' && (
                    <div data-testid="analysis-status">
                      <p className="hint">
                        {selected.status === 'error' ? `분석 실패: ${selected.error}` : `${selected.progressLabel || '분석 대기'} ${Math.round(selected.progress * 100)}%`}
                      </p>
                      {selected.status !== 'error' && <div className="progress"><div style={{ width: `${Math.round(selected.progress * 100)}%` }} /></div>}
                    </div>
                  )}
                </div>
              </section>

              <section className="panel">
                <div className="row">
                  <span className="label">키 모드</span>
                  <div className="segmented">
                    {enabledKeyModes.map((m) => (
                      <button key={m} className={m === keyMode ? 'active' : ''} onClick={() => setKeyMode(m)}>{m}</button>
                    ))}
                  </div>
                  <span className="hint">Tab</span>
                </div>
                <div className="difficulty-row" data-testid="difficulty-row">
                  {DIFFICULTIES.map((d) => {
                    const best = bestFor(d);
                    return (
                      <button key={d} className={`difficulty diff-${d.toLowerCase()} ${d === difficulty && targetLevel === null ? 'active' : ''}`} onClick={() => setDifficulty(d)}>
                        <span className="diff-name">{d}</span>
                        <span className="diff-short">{DIFF_SHORT[d]}</span>
                        {best && <span className={`diff-lamp ${LAMP_CLASS[best.lamp] ?? ''}`}>{best.rate.toFixed(2)}%</span>}
                      </button>
                    );
                  })}
                </div>
                <div className="row">
                  <label className="row check">
                    <input type="checkbox" checked={targetLevel !== null} onChange={(e) => setTargetLevel(e.target.checked ? 8 : null)} />
                    목표 레벨 직접 지정
                  </label>
                  {targetLevel !== null && (
                    <>
                      <input type="range" min={1} max={15} value={targetLevel} onChange={(e) => setTargetLevel(Number(e.target.value))} />
                      <span className="value">Lv.{targetLevel}</span>
                    </>
                  )}
                  <label className="row check">
                    <input type="checkbox" checked={autoPlay} onChange={(e) => setAutoPlay(e.target.checked)} data-testid="autoplay-toggle" />
                    오토 플레이
                  </label>
                </div>
                <div className="row buttons">
                  <button className="primary" data-testid="play-button" disabled={selected.status !== 'ready' || busy !== null} onClick={() => void play()}>
                    {chart ? '플레이' : '채보 생성 & 플레이'} <kbd>Enter</kbd>
                  </button>
                  <button data-testid="generate-button" disabled={selected.status !== 'ready' || busy !== null} onClick={() => void generate(chart !== null)}>
                    {chart ? '다른 패턴' : '채보 미리보기'}
                  </button>
                  {busy && <span className="hint" data-testid="busy">{busy}</span>}
                </div>
                {error && <p className="error" data-testid="select-error">{error}</p>}
              </section>

              {chart && <ChartPreview chart={chart} />}

              <section className="panel">
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

function Cover({ song, size }: { song: Song; size: number }) {
  const [failed, setFailed] = useState(false);
  if (song.hasCover && !failed) {
    return <img className="cover" src={api.coverUrl(song.id)} alt="" width={size} height={size} onError={() => setFailed(true)} />;
  }
  let h = 0;
  for (const ch of song.id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <div
      className="cover placeholder"
      style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${h} 80% 55%), hsl(${(h + 70) % 360} 70% 35%))`, fontSize: size * 0.32 }}
    >
      {song.title.slice(0, 1).toUpperCase()}
    </div>
  );
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

function ChartPreview({ chart }: { chart: ServerChart }) {
  const m = chart.meta;
  const graph = m.nps.graph;
  const max = Math.max(1, ...graph);
  const w = 360;
  const h = 70;
  const step = graph.length > 1 ? w / (graph.length - 1) : w;
  const points = graph.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`).join(' ');
  const holds = chart.notes.filter((n) => n.type === 'hold').length;
  return (
    <section className="panel chart-preview" data-testid="chart-preview">
      <div className="preview-head">
        <div className={`level-badge diff-${m.difficulty.toLowerCase()}`}>
          <span>{m.difficulty}</span>
          <strong data-testid="chart-level">Lv.{m.level}</strong>
        </div>
        <div className="preview-stats">
          <div><span className="label">노트</span> <strong data-testid="chart-notes">{m.noteCount}</strong></div>
          <div><span className="label">롱노트</span> {holds}</div>
          <div><span className="label">평균 / 최대 NPS</span> {m.nps.avg} / {m.nps.peak}</div>
          <div><span className="label">세부 난이도</span> {m.rating.toFixed(2)}</div>
        </div>
      </div>
      {m.densityLimited && <p className="hint">곡의 소리 밀도가 낮아 목표 레벨까지 올리지 못했습니다. 없는 소리에 노트를 만들지 않기 때문입니다.</p>}
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
