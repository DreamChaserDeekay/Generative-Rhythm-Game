import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { api, EXPORT_LABELS, exportFormats, type SavedChart, type ScoreRecord, type ServerChart, type Song } from '../api/client';
import { menuMusic } from '../audio/songPreview';
import { keysoundStems } from '../audio/stemKeysounds';
import { rulesetConfigs, type RulesetId } from '../engine/ruleset';
import type { KeyModeId, PatternSummary, StemName } from '../engine/types';
import type { Pattern, Settings } from '../settings/settings';
import { failureReason } from './analysisError';
import type { PracticeOptions } from './App';
import { AnalysisView } from './AnalysisView';
import type { CalibrationStep } from './CalibrationScreen';
import { aiMakingLabel } from './chartCache';
import { ChartMinimap } from './ChartMinimap';
import { ChartStage } from './ChartStage';
import { shortDayText } from './format';
import { lampClass, LampMark } from './lamps';
import { ActionOption } from './optionRows';
import type { OptionsEntry } from './PlayOptions';
import { sectionLabel } from './sections';
import { SongArt, useSketch } from './songArt';
import { olderGenerator, recordHeadline, recordScore } from './songRecords';
import { useTwoPress } from './twoPress';

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
export const KIND_LABELS: Record<string, string> = { edited: '편집', imported: '가져옴' };
const STEM_LABELS: Record<string, string> = { drums: '드럼', bass: '베이스', vocals: '보컬', other: '멜로디·기타' };
const BACKEND_KIND_LABELS: Record<string, string> = { stems: '스템', beats: '비트', pitch: '음높이', structure: '구조' };

function backendLabel(name: string | undefined): string {
  if (!name || name === 'core' || name === 'core-dsp') return '기본';
  return name.replace(/-[\d.]+$/, '');
}

function clockText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The song info's pages, in the order Q / E go through them. */
export const INFO_TABS = ['chart', 'records', 'tools', 'song'] as const;
export type InfoTab = (typeof INFO_TABS)[number];
const TAB_NAMES: Record<InfoTab, string> = { chart: '채보', records: '기록', tools: '도구', song: '곡 설정' };

type SongPatch = Parameters<typeof api.patchSong>[1];

interface Props {
  song: Song | null;
  tab: InfoTab;
  onTab: (tab: InfoTab) => void;
  chart: ServerChart | null;
  /** The chart could not be made (it is being made otherwise, when the song is analysed). */
  chartFailed: boolean;
  /** The chart chosen as the page names it: its difficulty (or the kind of saved chart), its colour and its level. */
  entry: OptionsEntry | null;
  keyMode: KeyModeId;
  /** The settings in effect (the chart beside the page plays as it will be played). */
  settings: Settings;
  /** Keysounds of generated charts are on (the keysounded stems are marked). */
  keysound: boolean;
  practice: PracticeOptions | null;
  onSelectRange: (startMs: number, endMs: number) => void;
  onEditChart: () => void;
  onWatchBest: (scoreId: number) => void;
  /** The records of the difficulty chosen (its patterns), or of the saved charts when one is chosen. */
  records: ScoreRecord[];
  /** What they are of: "4K NORMAL", "BMS". */
  recordFor: string;
  /** The chart Enter plays (its row is marked). */
  currentChartId: string | null;
  ruleset: RulesetId;
  /** Plays a pattern of the difficulty from now on (a chart by its id; null: the default one); absent for a saved chart. */
  onPattern?: (pattern: Pattern | null) => void;
  /** The generator of the moment (a chart of another one cannot be made again: it is played as it was). */
  generator: string | null;
  onPickChart: (chartId: string) => void;
  /** The saved chart chosen (it can be deleted here). */
  savedChart: SavedChart | null;
  onDeleteSaved: (chart: SavedChart) => void;
  /** Saves song settings; false when the server refused them (the error is shown). */
  onPatch: (body: SongPatch) => Promise<boolean>;
  /** The song's own play offset (ms, kept in the settings) and its change. */
  songOffsetMs: number;
  onSongOffset: (ms: number) => void;
  /** The in-play keys that change it (- / =, and the 5 ms steps). */
  songOffsetKeys: string;
  onReanalyze: () => void;
  onRemoveSong: () => void;
  /** The click-track sync test, on autoplay or played by hand. */
  onSyncTest: (byHand: boolean) => void;
  onCalibrate: (step: CalibrationStep) => void;
  /** An error or what is being done, said at the page's foot before any help. */
  status: ReactNode;
}

/**
 * The I page of the song select, over the whole screen: everything about the picked song that the
 * song select itself does not carry. Its pages (Q / E): the chart in numbers (with the chart
 * itself playing beside the page, in time with the preview), its records by pattern, the tools,
 * and the song's own settings. It opens with the focus in its body, on no control, so Enter still
 * plays; ↑↓ go from line to line, ←→ along a line's buttons (on a page with nothing to press they
 * go through the difficulties), and Enter presses the focused one. What a line does is said at the
 * page's foot while the line has the focus.
 */
export function SongInfoPanel(props: Props) {
  const { song, chart, tab, entry } = props;
  const body = useRef<HTMLDivElement>(null);
  const [help, setHelp] = useState('');
  // a page opens with the focus on no control (the first ones change the song or leave the screen)
  useEffect(() => {
    setHelp('');
    body.current?.scrollTo(0, 0);
    const at = document.activeElement;
    // (a page changed on the pages' names, by key, keeps the focus there, on the new one)
    if (at instanceof HTMLElement && at.closest('[role="tablist"]')) at.closest('[role="tablist"]')?.querySelector<HTMLElement>('.active')?.focus();
    else body.current?.focus({ preventScroll: true });
  }, [tab]);
  const ready = song?.status === 'ready';
  const of = entry ? `${props.keyMode} · ${entry.name}${entry.level === null ? '' : ` ${entry.level}`}` : '';
  const sub = tab === 'records' ? props.recordFor : tab === 'song' ? '이 곡에만 적용됩니다' : of;
  return (
    <section className="select-panel song-info" data-testid="song-info" data-tab={tab} aria-label="곡 정보·도구">
      <aside className="info-side">
        {song && (
          <div className="info-song">
            <SongArt song={song} size={136} fit />
            <b data-testid="song-title" title={song.title}>
              {song.title}
            </b>
            <span>{song.artist || '알 수 없는 아티스트'}</span>
            {entry && (
              <span className="tier-chip" style={{ ['--diff' as string]: entry.color } as CSSProperties}>
                {props.keyMode} · {entry.name}
                <b className="num">{entry.level ?? '–'}</b>
              </span>
            )}
          </div>
        )}
        <div className="info-tabs" role="tablist" aria-orientation="vertical">
          {INFO_TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? 'active' : ''}
              data-testid={`info-tab-${t}`}
              // a click opens the page with the focus in its body, as Q / E do
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => props.onTab(t)}
            >
              {TAB_NAMES[t]}
            </button>
          ))}
        </div>
        <div className="info-tabs-key" aria-hidden="true">
          <kbd>Q</kbd>
          <kbd>E</kbd>
          <span>탭</span>
        </div>
      </aside>
      <div className="info-main">
        <header className="select-panel-head">
          <h2>{TAB_NAMES[tab]}</h2>
          {sub && <span>{sub}</span>}
        </header>
        <div className="select-panel-body" ref={body} tabIndex={-1}>
          {tab === 'chart' &&
            (song && chart ? (
              <ChartPage chart={chart} keysound={props.keysound} practice={props.practice} onSelectRange={props.onSelectRange} onHelp={setHelp} />
            ) : (
              <p className="hint" data-testid="chart-pending">
                {!song
                  ? '곡을 넣으면 그 채보를 여기서 봅니다.'
                  : !ready
                    ? song.status === 'error'
                      ? '곡 분석에 실패해 채보가 없습니다. 곡 설정에서 다시 분석할 수 있습니다.'
                      : '곡을 분석하는 중입니다. 끝나면 채보를 만듭니다.'
                    : props.chartFailed
                      ? '채보를 만들지 못했습니다. Enter를 누르면 다시 만들고 이유를 알려 줍니다.'
                      : '채보를 계산하는 중…'}
              </p>
            ))}
          {tab === 'records' &&
            (song && ready ? (
              <>
                <RecordList records={props.records} currentChartId={props.currentChartId} ruleset={props.ruleset} generator={props.generator} onPattern={props.onPattern} onPickChart={props.onPickChart} />
                <BestReplay song={song} chart={chart} onWatchBest={props.onWatchBest} onHelp={setHelp} />
              </>
            ) : (
              <p className="hint">{song ? '곡을 분석한 뒤에 기록이 남습니다.' : '곡을 넣고 플레이하면 기록이 여기에 남습니다.'}</p>
            ))}
          {tab === 'tools' && <ToolsPage {...props} onHelp={setHelp} />}
          {tab === 'song' && (song ? <SongTools key={song.id} {...props} song={song} onHelp={setHelp} /> : <p className="hint">곡을 넣으면 그 곡의 설정을 여기서 고칩니다.</p>)}
        </div>
        <p className="select-panel-help" data-testid="song-info-help" aria-live="polite">
          {props.status || help}
        </p>
      </div>
      <aside className="info-preview">
        {song && chart ? <StagePreview song={song} chart={chart} settings={props.settings} /> : <div className="chart-stage empty" />}
      </aside>
    </section>
  );
}

/** The chart on the track beside the page, with where the preview is in the song and the section it is in. */
function StagePreview({ song, chart, settings }: { song: Song; chart: ServerChart; settings: Settings }) {
  const sketch = useSketch(song);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const read = () => setNow(menuMusic.songMs(song.id));
    read();
    const timer = window.setInterval(read, 250);
    return () => window.clearInterval(timer);
  }, [song.id]);
  const section = now !== null ? sketch?.sections.find((s) => now >= s.t && now < s.endT) : undefined;
  return (
    <>
      <div className="info-preview-head">
        <span className="cap">미리보기</span>
        <b className="num">
          {now === null ? '–:––' : clockText(now)} / {clockText(song.durationMs)}
        </b>
        {section && <span className="section">{sectionLabel(section.label)}</span>}
      </div>
      <ChartStage chart={chart} settings={settings} clock={() => menuMusic.songMs(song.id)} startMs={song.previewMs ?? 0} />
    </>
  );
}

/** A line of a page: its name, its controls, and what it does (said at the page's foot while the focus is in it). */
function Line({ label, help, onHelp, testId, children }: { label: string; help?: string; onHelp: (help: string) => void; testId?: string; children: ReactNode }) {
  return (
    <div className="row" data-testid={testId} onFocus={() => onHelp(help ?? '')}>
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

/** 도구: what is done with the chart chosen (the editor, a file of it, its removal), and the measuring that needs no song. */
function ToolsPage(props: Props & { onHelp: (help: string) => void }) {
  const { song, chart, onHelp } = props;
  const saved = chart && props.savedChart?.chartId === chart.meta.chartId ? props.savedChart : null;
  const deleteSaved = useTwoPress(() => saved && props.onDeleteSaved(saved));
  // another chart in place (Tab to another key mode keeps the focus on this button): the first press was for the one before
  useEffect(deleteSaved.disarm, [saved?.chartId]);
  return (
    <>
      {song && chart && (
        <section className="panel-group" data-testid="chart-tools">
          <h3>이 채보</h3>
          <ActionOption label="채보 편집" action="열기" testId="edit-chart" onPress={props.onEditChart} onHelp={onHelp} help="이 채보를 에디터에서 고칩니다. 고친 채보는 따로 저장됩니다." />
          <div className="opt opt-links" onFocus={() => onHelp('고른 형식의 파일로 이 채보를 내보냅니다. 음원은 넣지 않고 파일 이름만 적습니다.')}>
            <span className="opt-name">내보내기</span>
            <span className="opt-value">
              {exportFormats(chart.meta.keyMode).map((f) => (
                <a key={f} className="button small" href={api.exportUrl(chart.meta.chartId, f)} download data-testid={`export-${f}`}>
                  {EXPORT_LABELS[f]}
                </a>
              ))}
            </span>
          </div>
          {saved && (
            <button className="opt opt-action danger" data-testid="delete-saved" {...deleteSaved.buttonProps} onClick={deleteSaved.press} onFocus={() => onHelp('이 채보의 기록도 함께 지워집니다.')}>
              <span className="opt-name">이 채보 지우기</span>
              <span className="opt-value">
                <b className="opt-button">{deleteSaved.armed ? '한 번 더 누르면 지웁니다' : '지우기'}</b>
              </span>
            </button>
          )}
          {saved && deleteSaved.armed && <p className="hint">이 채보의 기록도 함께 지워집니다</p>}
        </section>
      )}
      <section className="panel-group" data-testid="select-tools">
        <h3>측정</h3>
        <ActionOption label="싱크 테스트" action="보기" testId="sync-auto" onPress={() => props.onSyncTest(false)} onHelp={onHelp} help="박자에 맞춰 노트가 내려오는 테스트를 오토로 봅니다 (←→ 표시 오프셋)." />
        <ActionOption
          label="싱크 테스트 · 직접 치기"
          action="시작"
          testId="sync-play"
          onPress={() => props.onSyncTest(true)}
          onHelp={onHelp}
          help="같은 테스트를 직접 칩니다. 치는 동안 표시·판정 오프셋을 키로 옮길 수 있고, 그 키는 화면 왼쪽 위에 나옵니다."
        />
        <ActionOption label="판정 오프셋 측정" action="열기" testId="open-calibration" onPress={() => props.onCalibrate('input')} onHelp={onHelp} help="메트로놈 소리에 맞춰 키를 눌러 판정 오프셋을 잽니다." />
        <ActionOption label="표시 오프셋 맞추기" action="열기" testId="open-visual-calibration" onPress={() => props.onCalibrate('visual')} onHelp={onHelp} help="내려오는 노트를 보며 표시 오프셋을 눈으로 맞춥니다." />
      </section>
    </>
  );
}

/** 곡 설정: the song's analysis, its tempo and first beat, its own offset, its sections, and its removal. */
function SongTools(props: Props & { song: Song; onHelp: (help: string) => void }) {
  const { song, onPatch, onHelp } = props;
  const [showAnalysis, setShowAnalysis] = useState(false);
  const ready = song.status === 'ready';
  // a second press within TWO_PRESS_MS, not the browser's confirm box (a pad cannot answer it)
  const removeSong = useTwoPress(props.onRemoveSong);
  const reanalyzeHelp = '지금 설치된 분석 백엔드로 곡을 다시 분석합니다. 채보는 새로 만들어집니다.';

  return (
    <section className="panel-group song-tools">
      {ready && song.analyzer?.backends && (
        <Line label="분석" onHelp={onHelp} help={song.outdated ? `분석기가 바뀌었거나 ML 백엔드가 새로 설치되었습니다. ${reanalyzeHelp}` : ''}>
          <span className="value" data-testid="analysis-backends">
            {Object.entries(song.analyzer.backends)
              .map(([kind, name]) => `${BACKEND_KIND_LABELS[kind] ?? kind} ${backendLabel(name)}`)
              .join(' · ')}
          </span>
          {song.outdated && (
            <button className="small" data-testid="reanalyze" onClick={props.onReanalyze}>
              다시 분석
            </button>
          )}
        </Line>
      )}
      {song.status === 'error' && (
        <>
          <Line label="분석" onHelp={onHelp} help={reanalyzeHelp}>
            <span className="value error" data-testid="analysis-failure">
              실패 · {failureReason(song.error)}
            </span>
            <button className="small" data-testid="reanalyze" onClick={props.onReanalyze}>
              다시 분석
            </button>
          </Line>
          {song.error && (
            <details className="raw-error">
              <summary>자세히</summary>
              <code>{song.error}</code>
            </details>
          )}
        </>
      )}
      <Line label="BPM 보정" onHelp={onHelp} help="분석한 BPM이 절반이나 두 배로 잡혔을 때 고칩니다. 곡을 다시 분석해 채보를 새로 만듭니다.">
        <button className="small" disabled={!ready || !song.bpm} onClick={() => song.bpm && void onPatch({ bpm: song.bpm * 2 })}>×2</button>
        <button className="small" disabled={!ready || !song.bpm} onClick={() => song.bpm && void onPatch({ bpm: song.bpm / 2 })}>÷2</button>
        <BpmInput onApply={(bpm) => void onPatch({ bpm })} disabled={!ready} />
        {song.overrides.bpm !== undefined && <button className="small" onClick={() => void onPatch({ clearBpm: true })}>자동으로</button>}
      </Line>
      <Line label="곡 오프셋" testId="song-offset-row" onHelp={onHelp} help={`이 곡만 판정과 노트를 함께 늦추거나(+) 당깁니다. 기록과 채보는 그대로입니다. 플레이 중에 바꾸는 키: ${props.songOffsetKeys}.`}>
        {[-5, -1, 1, 5].map((d) => (
          <button key={d} className="small" data-testid={`song-offset-${d > 0 ? 'plus' : 'minus'}${Math.abs(d)}`} onClick={() => props.onSongOffset(props.songOffsetMs + d)}>
            {d > 0 ? `+${d}` : d}ms
          </button>
        ))}
        <span className="value num" data-testid="song-offset">
          {props.songOffsetMs > 0 ? '+' : ''}
          {props.songOffsetMs}ms
        </span>
        <button className="small" data-testid="song-offset-reset" disabled={props.songOffsetMs === 0} onClick={() => props.onSongOffset(0)}>
          초기화
        </button>
      </Line>
      <Line
        label="첫 박 위치"
        onHelp={onHelp}
        help="마디선과 채보가 음악의 박과 어긋나 보일 때 분석한 박을 옮깁니다. 곡을 다시 분석해 채보를 새로 만들어서, 기록은 새 채보에 따로 남습니다. 박은 맞는데 판정만 어긋나면 곡 오프셋을 쓰세요."
      >
        {[-10, -1, 1, 10].map((d) => (
          <button key={d} className="small" disabled={!ready} onClick={() => void onPatch({ offsetShiftMs: (song.overrides.offsetShiftMs ?? 0) + d })}>
            {d > 0 ? `+${d}` : d}ms
          </button>
        ))}
        <span className="value num">{song.overrides.offsetShiftMs ? `${song.overrides.offsetShiftMs > 0 ? '+' : ''}${song.overrides.offsetShiftMs}ms` : '자동'}</span>
      </Line>
      <Line label="분석 보기" onHelp={onHelp} help="분석한 파형 · 마디선 · 구간(인트로·벌스·후렴…)을 봅니다.">
        <button className="small" data-testid="toggle-analysis" disabled={!ready} onClick={() => setShowAnalysis((v) => !v)}>
          {showAnalysis ? '분석 보기 닫기' : '분석 보기'}
        </button>
      </Line>
      {showAnalysis && ready && <AnalysisView songId={song.id} />}
      <Line label="삭제" onHelp={onHelp} help="곡을 라이브러리에서 지웁니다. 이 곡의 기록도 함께 지워집니다.">
        <button className="small danger" data-testid="remove-song" {...removeSong.buttonProps} onClick={removeSong.press}>
          {removeSong.armed ? '한 번 더 누르면 지웁니다' : '라이브러리에서 삭제'}
        </button>
        {removeSong.armed && <span className="hint">이 곡의 기록도 함께 지워집니다</span>}
      </Line>
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

/** A share as a line of a list: its name, how much, and a bar of it. */
function Share({ name, share, title, className = '' }: { name: string; share: number; title?: string; className?: string }) {
  const pct = Math.round(share * 100);
  return (
    <div className={`share ${className}`} title={title}>
      <span className="share-text">
        {name} <strong>{pct}%</strong>
      </span>
      <i className="share-bar" aria-hidden="true">
        <i style={{ width: `${Math.min(100, pct)}%` }} />
      </i>
    </div>
  );
}

/**
 * 채보: the chart chosen in numbers. The whole chart along the song (its sections, its notes by
 * lane; while a practice is set, its stretch is picked here), its density, what its notes follow
 * and the patterns and skills it is made of. Nothing here is pressed: ←→ compare the difficulties.
 */
function ChartPage(props: { chart: ServerChart; keysound: boolean; practice: PracticeOptions | null; onSelectRange: (startMs: number, endMs: number) => void; onHelp: (help: string) => void }) {
  const { chart } = props;
  const m = chart.meta;
  const holds = chart.notes.filter((n) => n.type === 'hold').length;
  const keyed = props.keysound && !(chart.sounds?.length ?? 0) ? keysoundStems(chart.notes) : [];
  return (
    <section className="chart-preview" data-testid="chart-preview">
      <ChartMinimap chart={chart} selection={props.practice ? [props.practice.startMs, props.practice.endMs] : null} onSelect={props.practice ? props.onSelectRange : undefined} onHelp={props.onHelp} />
      <div className="graph-label">
        <span>NPS</span>
        <span>최대 {m.nps.peak}</span>
      </div>
      <NpsGraph graph={m.nps.graph} />
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
        {aiMakingLabel(m) && (
          <div title="Mapperatorinator가 만든 채보: 모델 · 연산 정밀도 · 만드는 데 걸린 시간">
            <span className="label">AI 생성</span> <strong data-testid="chart-ai">{aiMakingLabel(m)}</strong>
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
        {m.source?.kind === 'imported' && (
          <div title="파일이 매긴 레벨과, 이 게임이 노트 밀도로 추정한 레벨" data-testid="chart-levels">
            <span className="label">레벨</span> <strong>{m.sourceLevel ? `원본 ${m.sourceLevel} · 추정 ${m.level}` : `추정 ${m.level}`}</strong>
          </div>
        )}
      </div>
      {m.densityLimited && <p className="hint">곡의 소리 밀도가 낮아 목표 레벨까지 올리지 못했습니다. 없는 소리에 노트를 만들지 않기 때문입니다.</p>}
      <div className="chart-shares">
        {m.keysound && (
          <div className="stem-mix" data-testid="stem-mix" title="노트가 따라가는 악기(스템) 비율 · 표시가 있는 악기는 키음이 납니다">
            <span className="cap">악기</span>
            {(Object.entries(m.keysound.shares) as [StemName, number][]).map(([stem, share]) =>
              share > 0 ? <Share key={stem} className={`stem stem-${stem} ${keyed.includes(stem) ? 'lead' : ''}`} name={STEM_LABELS[stem] ?? stem} share={share} title={keyed.includes(stem) ? '키음이 나는 악기' : undefined} /> : null,
            )}
          </div>
        )}
        {m.patterns && (
          <div className="pattern-mix" data-testid="pattern-mix">
            <span className="cap">패턴</span>
            {PATTERN_LABELS.map(([key, label, title]) => (
              <Share key={key} className="pattern-chip" name={label} share={m.patterns?.[key] ?? 0} title={title} />
            ))}
          </div>
        )}
        <div className="skills">
          <span className="cap">스킬</span>
          {SKILL_LABELS.map(([key, label]) => (
            <Share key={key} className="skill" name={label} share={m.skillset?.[key] ?? 0} />
          ))}
        </div>
      </div>
    </section>
  );
}

/** The best play of the chart chosen, watched again (where its replay was kept). */
function BestReplay({ song, chart, onWatchBest, onHelp }: { song: Song; chart: ServerChart | null; onWatchBest: (scoreId: number) => void; onHelp: (help: string) => void }) {
  const best = chart ? ((song.records ?? []).find((r) => r.chartId === chart.meta.chartId && r.hasReplay)?.bestScoreId ?? null) : null;
  if (best === null) return null;
  return <ActionOption label="최고 기록 리플레이" action="보기" testId="watch-best" onPress={() => onWatchBest(best)} onHelp={onHelp} help="지금 고른 채보의 최고 기록을 그대로 다시 봅니다." />;
}

/** A pattern's name: the default one, or its seed (as short as tells it apart); a saved chart's name. */
function patternName(r: ScoreRecord): string {
  if (r.kind && r.kind !== 'generated') return r.name || r.difficulty;
  return r.defaultSeed ? '기본' : `#${r.seed.toString(16).toUpperCase().padStart(8, '0').slice(0, 6)}`;
}

/**
 * The records of the difficulty chosen, a line per chart played (its patterns; the saved charts
 * when one of them is chosen): the chart Enter plays first, then the last played. Each column
 * holds two things, one over the other, so the line fits a narrow window: the pattern (and an
 * earlier generator's), the lamp and the level, the score rule's number and the other (RATE, or
 * the score and its grade), MAX COMBO and the fewest BREAK, the plays and the last day. Another
 * line is chosen with 고르기 to be played from now on: the default pattern as the options make
 * it, any other as it was made.
 */
function RecordList(props: {
  records: ScoreRecord[];
  currentChartId: string | null;
  ruleset: RulesetId;
  generator: string | null;
  onPattern?: (pattern: Pattern | null) => void;
  onPickChart: (chartId: string) => void;
}) {
  const rows = [...props.records].sort((a, b) => Number(b.chartId === props.currentChartId) - Number(a.chartId === props.currentChartId) || (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0));
  const rules = rulesetConfigs[props.ruleset];
  const pick = (r: ScoreRecord) => {
    if (r.kind && r.kind !== 'generated') props.onPickChart(r.chartId);
    else props.onPattern?.(r.defaultSeed && !olderGenerator(r, props.generator) ? null : r.chartId);
  };
  return (
    <section className="panel-group" data-testid="record-list">
      {rows.length > 0 && props.currentChartId && !rows.some((r) => r.chartId === props.currentChartId) && <p className="hint">지금 치는 채보는 아직 기록이 없습니다.</p>}
      {rows.length === 0 ? (
        <p className="hint">아직 기록이 없습니다.</p>
      ) : (
        <table className="record-table">
          <thead>
            <tr>
              <th>패턴</th>
              <th>램프</th>
              <th>{rules.scoring === 'rate' ? 'RATE' : rules.scoring === 'exscore' ? 'EX-SCORE' : '등급·점수'}</th>
              <th>MAX COMBO</th>
              <th>플레이</th>
              <th aria-label="고르기" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const head = recordHeadline(r, props.ruleset);
              const { score, grade } = recordScore(r, props.ruleset);
              // the RATE under the rule's own number; under 정밀 % (headed by the RATE) the score and its grade
              const second = head.label !== 'RATE' ? `RATE ${r.rate.toFixed(2)}%` : score !== null && grade ? `${grade} ${score.toLocaleString('en-US')}` : '–';
              const current = r.chartId === props.currentChartId;
              return (
                <tr key={r.chartId} className={current ? 'current' : ''} data-testid="record-row">
                  <td>
                    <b className="record-pattern" title={patternName(r)}>
                      {patternName(r)}
                    </b>
                    {olderGenerator(r, props.generator) && <span className="sub">이전 생성기</span>}
                  </td>
                  <td>
                    <span className={`lamp-text lamp-${lampClass(r.lamp)}`}>
                      <LampMark />
                      {r.lamp}
                    </span>
                    <span className="sub">{r.sourceLevel ? `원본 ${r.sourceLevel} · 추정 ${r.level}` : `Lv.${r.level}`}</span>
                  </td>
                  <td>
                    <b>{head.label === 'RATE' ? head.value : `${head.label} ${head.value}`}</b>
                    <span className="sub">{second}</span>
                  </td>
                  <td>
                    <b>{r.maxCombo.toLocaleString('en-US')}</b>
                    <span className="sub">
                      최소 {rules.missLabel} {r.minBreaks ?? '–'}
                    </span>
                  </td>
                  <td>
                    <b>{r.plays}회</b>
                    <span className="sub">{r.lastPlayedAt ? shortDayText(r.lastPlayedAt) : '–'}</span>
                  </td>
                  <td>
                    {current ? (
                      <span className="record-current">지금</span>
                    ) : (r.kind && r.kind !== 'generated') || props.onPattern ? (
                      <button className="small" data-testid="pick-pattern" onClick={() => pick(r)}>
                        고르기
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
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
