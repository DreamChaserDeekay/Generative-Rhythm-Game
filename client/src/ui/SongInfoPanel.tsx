import { useEffect, useRef, useState } from 'react';
import { api, EXPORT_LABELS, exportFormats, type ServerChart, type Song } from '../api/client';
import { keysoundStems } from '../audio/stemKeysounds';
import type { PatternSummary, StemName } from '../engine/types';
import type { Palette } from '../settings/settings';
import type { PracticeOptions } from './App';
import { AnalysisView } from './AnalysisView';
import { ChartMinimap } from './ChartMinimap';
import { SectionEditor } from './SectionEditor';

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
const VIDEO_ACCEPT = '.mp4,.webm,.m4v,.mov,.ogv,video/*';
export const KIND_LABELS: Record<string, string> = { edited: '편집', imported: '가져옴' };
const STEM_LABELS: Record<string, string> = { drums: '드럼', bass: '베이스', vocals: '보컬', other: '멜로디·기타' };
const BACKEND_KIND_LABELS: Record<string, string> = { stems: '스템', beats: '비트', pitch: '음높이', structure: '구조' };

function backendLabel(name: string | undefined): string {
  if (!name || name === 'core' || name === 'core-dsp') return '기본';
  return name.replace(/-[\d.]+$/, '');
}

type SongPatch = Parameters<typeof api.patchSong>[1];

interface Props {
  song: Song | null;
  chart: ServerChart | null;
  palette: Palette;
  /** Keysounds of generated charts are on (the keysounded stems are marked). */
  keysound: boolean;
  practice: PracticeOptions | null;
  onSelectRange: (startMs: number, endMs: number) => void;
  onEditChart: () => void;
  onWatchBest: (scoreId: number) => void;
  /** Saves song settings; false when the server refused them (the error is shown). */
  onPatch: (body: SongPatch) => Promise<boolean>;
  /** The song's own play offset (ms, kept in the settings) and its change. */
  songOffsetMs: number;
  onSongOffset: (ms: number) => void;
  /** The in-play keys that change it (- / =, and the 5 ms steps). */
  songOffsetKeys: string;
  onReanalyze: () => void;
  onUploadBga: (file: File) => void;
  onRemoveBga: () => void;
  onRemoveSong: () => void;
  onSectionsSaved: () => Promise<void>;
  onSyncTest: () => void;
  onCalibrate: () => void;
  onOpenReplay: () => void;
  onClose: () => void;
}

/**
 * The I panel of the song select: the chart's numbers, the song's own settings (tempo, first beat,
 * background video, sections, analysis) and the tools that need no song. It opens with the focus
 * in its body, on no control (its first ones change the song: BPM ×2, 채보 편집), so Enter still
 * plays; the first ↑ or ↓ goes to its first line, then ↑↓ go from line to line, ←→ along a line's
 * buttons, and Enter presses the focused one.
 */
export function SongInfoPanel(props: Props) {
  const { song, chart } = props;
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => body.current?.focus({ preventScroll: true }), []);
  return (
    <section className="select-panel" data-testid="song-info" aria-label="곡 정보·도구">
      <header className="select-panel-head">
        <h2>곡 정보·도구</h2>
        {song && (
          <span className="panel-song" data-testid="song-title" title={song.title}>
            {song.title}
          </span>
        )}
        <button className="quiet small" onClick={props.onClose}>
          닫기 <kbd>Esc</kbd>
        </button>
      </header>
      <div className="select-panel-body" ref={body} tabIndex={-1}>
        {song && chart && (
          <ChartPreview
            chart={chart}
            palette={props.palette}
            keysound={props.keysound}
            practice={props.practice}
            onSelectRange={props.onSelectRange}
            onEdit={props.onEditChart}
            bestReplay={(song.records ?? []).find((r) => r.chartId === chart.meta.chartId && r.hasReplay)?.bestScoreId ?? null}
            onWatchBest={props.onWatchBest}
          />
        )}
        {song && !chart && song.status === 'ready' && (
          <p className="hint">
            채보를 만들면 노트 수·밀도·패턴이 여기에 나옵니다 (<kbd>F5</kbd> 새 패턴).
          </p>
        )}
        {song && <SongTools key={song.id} {...props} song={song} />}
        <section className="panel-group" data-testid="select-tools">
          <h3>도구</h3>
          <div className="row">
            <button className="small" data-testid="sync-auto" onClick={props.onSyncTest} title="박자에 맞춰 노트가 내려오는 테스트를 오토 플레이로 봅니다">
              싱크 테스트
            </button>
            <button className="small" data-testid="open-calibration" onClick={props.onCalibrate}>
              오프셋 캘리브레이션
            </button>
            <button className="small" data-testid="open-replay" onClick={props.onOpenReplay} title="저장한 리플레이 파일(.grgreplay.json) 보기">
              리플레이 파일 보기
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}

function SongTools(props: Props & { song: Song }) {
  const { song, onPatch } = props;
  const [editSections, setEditSections] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  // the YouTube link being typed (null = the link form is closed)
  const [youtubeDraft, setYoutubeDraft] = useState<string | null>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const ready = song.status === 'ready';

  // A form on the page, not window.prompt: the desktop app (Electron) has no prompt dialog.
  const linkYoutube = async () => {
    const url = youtubeDraft?.trim();
    if (url && (await onPatch({ bgaYoutube: url }))) setYoutubeDraft(null);
  };

  return (
    <section className="panel-group song-tools">
      <h3>곡 설정</h3>
      {ready && song.analyzer?.backends && (
        <div className="row">
          <span className="label">분석</span>
          <span className="value" data-testid="analysis-backends">
            {Object.entries(song.analyzer.backends)
              .map(([kind, name]) => `${BACKEND_KIND_LABELS[kind] ?? kind} ${backendLabel(name)}`)
              .join(' · ')}
          </span>
          {song.outdated && (
            <button className="small" data-testid="reanalyze" onClick={props.onReanalyze} title="분석기가 바뀌었거나 ML 백엔드가 새로 설치되었습니다">
              다시 분석
            </button>
          )}
        </div>
      )}
      <div className="row">
        <span className="label">BPM 보정</span>
        <button className="small" disabled={!ready || !song.bpm} onClick={() => song.bpm && void onPatch({ bpm: song.bpm * 2 })}>×2</button>
        <button className="small" disabled={!ready || !song.bpm} onClick={() => song.bpm && void onPatch({ bpm: song.bpm / 2 })}>÷2</button>
        <BpmInput onApply={(bpm) => void onPatch({ bpm })} disabled={!ready} />
        {song.overrides.bpm !== undefined && <button className="small" onClick={() => void onPatch({ clearBpm: true })}>자동으로</button>}
      </div>
      <div className="row" data-testid="song-offset-row">
        <span className="label">곡 오프셋</span>
        {[-5, -1, 1, 5].map((d) => (
          <button key={d} className="small" data-testid={`song-offset-${d > 0 ? 'plus' : 'minus'}${Math.abs(d)}`} onClick={() => props.onSongOffset(props.songOffsetMs + d)}>
            {d > 0 ? `+${d}` : d}ms
          </button>
        ))}
        <span className="value" data-testid="song-offset">
          {props.songOffsetMs > 0 ? '+' : ''}
          {props.songOffsetMs}ms
        </span>
        <button className="small" data-testid="song-offset-reset" disabled={props.songOffsetMs === 0} onClick={() => props.onSongOffset(0)}>
          초기화
        </button>
      </div>
      <p className="hint">
        이 곡만 판정과 노트를 함께 늦추거나(+) 당깁니다. 기록과 채보는 그대로입니다. 플레이 중에 바꾸는 키: {props.songOffsetKeys}.
      </p>
      <div className="row">
        <span className="label">첫 박 위치</span>
        {[-10, -1, 1, 10].map((d) => (
          <button key={d} className="small" disabled={!ready} onClick={() => void onPatch({ offsetShiftMs: (song.overrides.offsetShiftMs ?? 0) + d })}>
            {d > 0 ? `+${d}` : d}ms
          </button>
        ))}
        <span className="value">{song.overrides.offsetShiftMs ? `${song.overrides.offsetShiftMs > 0 ? '+' : ''}${song.overrides.offsetShiftMs}ms` : '자동'}</span>
      </div>
      <p className="hint">마디선과 채보가 음악의 박과 어긋나 보일 때 분석한 박을 옮깁니다. 곡을 다시 분석해 채보를 새로 만들어서, 기록은 새 채보에 따로 남습니다. 박은 맞는데 판정만 어긋나면 곡 오프셋을 쓰세요.</p>
      <div className="row">
        <span className="label">배경 영상</span>
        {song.hasBga || song.bgaYoutube ? (
          <>
            <span className="value" data-testid="bga-status">{song.bgaYoutube ? '유튜브' : '등록됨'}</span>
            {[-100, -10, 10, 100].map((d) => (
              <button key={d} className="small" onClick={() => void onPatch({ bgaOffsetMs: (song.bgaOffsetMs ?? 0) + d })}>
                {d > 0 ? `+${d}` : d}ms
              </button>
            ))}
            <span className="value">{song.bgaOffsetMs ? `${song.bgaOffsetMs > 0 ? '+' : ''}${song.bgaOffsetMs}ms` : '0ms'}</span>
            <button className="small" onClick={props.onRemoveBga}>지우기</button>
          </>
        ) : (
          <>
            <button className="small" data-testid="bga-upload" onClick={() => videoInput.current?.click()}>
              영상 고르기 (mp4·webm)
            </button>
            <button className="small" data-testid="bga-youtube" aria-expanded={youtubeDraft !== null} onClick={() => setYoutubeDraft((d) => (d === null ? '' : null))}>
              유튜브 링크
            </button>
          </>
        )}
        <input
          ref={videoInput}
          type="file"
          accept={VIDEO_ACCEPT}
          hidden
          data-testid="bga-input"
          onChange={(e) => {
            if (e.target.files?.[0]) props.onUploadBga(e.target.files[0]);
            e.target.value = '';
          }}
        />
      </div>
      {youtubeDraft !== null && !song.hasBga && !song.bgaYoutube && (
        <form
          className="row"
          data-testid="bga-youtube-form"
          onSubmit={(e) => {
            e.preventDefault();
            void linkYoutube();
          }}
        >
          <span className="label" aria-hidden="true" />
          <input
            type="text"
            inputMode="url"
            className="youtube-link"
            data-testid="bga-youtube-input"
            aria-label="유튜브 영상 링크"
            placeholder="유튜브 영상 링크 (youtube.com/watch?v=… · youtu.be/…)"
            value={youtubeDraft}
            autoFocus
            onChange={(e) => setYoutubeDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setYoutubeDraft(null);
              }
            }}
          />
          <button className="small" type="submit" data-testid="bga-youtube-save" disabled={!youtubeDraft.trim()}>
            등록
          </button>
          <button className="small" type="button" onClick={() => setYoutubeDraft(null)}>
            취소
          </button>
        </form>
      )}
      {song.bgaYoutube && (
        <p className="hint" data-testid="bga-youtube-hint">
          유튜브 영상은 유튜브 플레이어로 재생돼 인터넷 연결이 필요합니다. 퍼가기를 막은 영상은 나오지 않고, 광고가 있는 영상은 광고가 먼저 나올 수 있습니다.
        </p>
      )}
      <div className="row">
        <span className="label">구간</span>
        <span className="value" data-testid="sections-status">{song.sections ? '직접 고침' : '자동 분석'}</span>
        <button className="small" data-testid="edit-sections" disabled={!ready} onClick={() => setEditSections((v) => !v)}>
          {editSections ? '구간 편집 닫기' : '구간 편집'}
        </button>
      </div>
      {editSections && ready && <SectionEditor songId={song.id} onClose={() => setEditSections(false)} onSaved={props.onSectionsSaved} />}
      <div className="row">
        <button className="small" data-testid="toggle-analysis" disabled={!ready} onClick={() => setShowAnalysis((v) => !v)}>
          {showAnalysis ? '분석 보기 닫기' : '분석 보기'}
        </button>
        <button className="small danger" onClick={props.onRemoveSong}>라이브러리에서 삭제</button>
      </div>
      {showAnalysis && ready && <AnalysisView songId={song.id} />}
    </section>
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

function ChartPreview(props: {
  chart: ServerChart;
  palette: Palette;
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
  const holds = chart.notes.filter((n) => n.type === 'hold').length;
  const keyed = props.keysound && !(chart.sounds?.length ?? 0) ? keysoundStems(chart.notes) : [];
  return (
    <section className="panel-group chart-preview" data-testid="chart-preview">
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
        {m.consistency?.loopLane != null && (
          <div title="구간 안에서 루프(1·2·4마디)가 되풀이될 때, 같은 박의 노트가 같은 레인에 놓인 비율" data-testid="loop-consistency">
            <span className="label">루프 패턴 일치</span> <strong>{Math.round(m.consistency.loopLane * 100)}%</strong>
          </div>
        )}
        {(m.consistency?.repeatLaneMirror ?? m.repeatConsistency) != null && (
          <div title="반복 구간(같은 후렴 등)에서 첫 등장과 같은 레인 패턴(또는 좌우 반전)을 쓴 비율">
            <span className="label">반복 패턴 일치</span> <strong>{Math.round((m.consistency?.repeatLaneMirror ?? m.repeatConsistency ?? 0) * 100)}%</strong>
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
      <NpsGraph graph={m.nps.graph} />
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

/** Notes per second along the chart, as an area. */
export function NpsGraph({ graph }: { graph: number[] }) {
  const max = Math.max(1, ...graph);
  const w = 360;
  const h = 70;
  const step = graph.length > 1 ? w / (graph.length - 1) : w;
  const points = graph.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`).join(' ');
  return (
    <svg className="nps-graph" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="NPS 그래프">
      <polygon points={`0,${h} ${points} ${w},${h}`} className="nps-area" />
      <polyline points={points} className="nps-line" />
    </svg>
  );
}
