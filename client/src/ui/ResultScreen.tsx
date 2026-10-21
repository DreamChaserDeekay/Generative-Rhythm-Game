import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, EXPORT_LABELS, exportFormats, type ScoreRecord } from '../api/client';
import { gaugeRules, judgementConfig } from '../engine/config';
import type { ReplayData } from '../engine/replay';
import { gradeClass, rulesetConfigs } from '../engine/ruleset';
import type { SessionResult } from '../engine/session';
import type { Chart } from '../engine/types';
import type { Settings } from '../settings/settings';
import type { PlayRequest } from './App';
import { difficultyChip } from './difficultyChip';
import { lampClass } from './lamps';
import type { PlayOutcome } from './PlayController';
import { GaugeGraph, suggestOffset, TimelineGraph, TimingHistogram } from './ResultGraphs';
import {
  accuracyLabel,
  densityBins,
  judgeCells,
  LOSS_CLASSES,
  lossTimes,
  recordChange,
  sectionScores,
  signedPercent,
  stripBins,
  type RecordChange,
  type SectionScore,
} from './resultBreakdown';
import { HintBar, TopBar, type KeyHint } from './shell';
import { Backdrop, bpmLabel, Disc, SongArt, useSketch } from './songArt';

interface Props {
  request: PlayRequest;
  outcome: PlayOutcome;
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onRetry: () => void;
  onBack: () => void;
  onWatchReplay: (replay: ReplayData) => void;
  /**
   * Generate this key mode and difficulty again with a new seed and play it (generated charts).
   * Resolves with the error to show when it could not, else null.
   */
  onRegenerate?: () => Promise<string | null>;
}

/**
 * The result shows itself in order: the lamp at once, the grade at 300 ms, the headline counting
 * up from 300 ms to 1000 ms, then what the play did to the record. Any key or click shows it all.
 */
const REVEAL = { grade: 300, countMs: 700, record: 1000 };

/** 0: the lamp, 1: the grade and the count, 2: everything. */
type Phase = 0 | 1 | 2;

type SaveState = { change: RecordChange; before: ScoreRecord | null } | { error: string };

/** Elements that act on Enter themselves (a focused button keeps its own Enter). */
function ownsEnter(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('button, a[href], input, select, textarea, summary') !== null;
}

function signedMs(v: number | null): string {
  return v === null ? '-' : `${v > 0 ? '+' : ''}${v.toFixed(1)}ms`;
}

const rateText = (v: number) => `${v.toFixed(2)}%`;
const scoreText = (v: number) => Math.round(v).toLocaleString('en-US');

export function ResultScreen({ request, outcome, settings, onSettingsChange, onRetry, onBack, onWatchReplay, onRegenerate }: Props) {
  const { result, chart, placement, practice } = outcome;
  // what was played: the recorded settings of a replay, or the current ones
  const played = request.replay?.settings ?? outcome.replay?.settings ?? settings;
  const replay = outcome.replay ?? request.replay ?? null;
  const meta = request.chart.meta;
  const song = request.song ?? null;
  // the drawn picture carries the tempo; a cover is shown as it is
  const sketch = useSketch(song && !song.hasCover ? song : null);
  const rules = rulesetConfigs[result.ruleset];
  const suggestion = (() => {
    const s = suggestOffset(result.hits);
    return s === null ? null : Math.round(s);
  })();
  const [save, setSave] = useState<SaveState | null>(null);
  const [details, setDetails] = useState(false);
  const saved = useRef(false);
  const gauge = Object.values(gaugeRules).find((g) => g.label === result.gaugeLabel) ?? gaugeRules.NORMAL;
  const startMs = practice ? practice.startMs : 0;
  const endMs = practice ? practice.endMs : Math.max(meta.durationMs ?? 0, ...chart.notes.map((n) => n.endT ?? n.t), 1);

  const [reduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const [phase, setPhase] = useState<Phase>(reduced ? 2 : 0);
  const settle = useCallback(() => setPhase(2), []);
  useEffect(() => {
    if (reduced) return;
    const timers = [window.setTimeout(() => setPhase((p) => (p < 1 ? 1 : p)), REVEAL.grade), window.setTimeout(() => setPhase(2), REVEAL.record)];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [reduced]);

  // Store the play once (generated charts only; autoplay, practice and the sync test are not records).
  const recording = !request.autoPlay && !request.replay && !practice && !!meta.songId;
  useEffect(() => {
    const songId = meta.songId;
    if (saved.current || !recording || !songId) return;
    saved.current = true;
    (async () => {
      try {
        const before = (await api.song(songId)).records?.find((r) => r.chartId === meta.chartId) ?? null;
        await api.saveScore({
          chartId: meta.chartId,
          songId,
          score: result.score,
          rate: Math.round(result.rate * 100) / 100,
          maxCombo: result.maxCombo,
          lamp: result.lamp,
          judgementMode: played.judgementMode,
          breaks: result.breaks,
          detail: {
            fast: result.fast,
            slow: result.slow,
            meanErrorMs: result.meanErrorMs,
            ruleset: result.ruleset,
            exScore: result.exScore,
            weightedScore: result.weightedScore,
            gauge: result.gaugeLabel,
            placement: played.placement,
            laneOrder: placement.laneOrder,
            feverBonus: result.fever.bonus,
            failedAtMs: result.failedAtMs,
          },
          replay: outcome.replay,
        });
        setSave({ change: recordChange(result, before), before });
      } catch (e) {
        setSave({ error: e instanceof Error ? e.message : String(e) });
      }
    })();
  }, [meta, recording, result, played.judgementMode, played.placement, placement.laneOrder, outcome.replay]);

  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const regenerate = async () => {
    if (!onRegenerate || regenerating) return;
    setRegenerating(true);
    setRegenerateError(null);
    const failure = await onRegenerate();
    setRegenerating(false);
    setRegenerateError(failure);
  };
  const saveReplay = () => replay && downloadReplay(replay, meta.title);

  // The details (graphs, the offset suggestion, every judgement) take the summary's place.
  const toggleDetails = () => setDetails((v) => !v);

  // Enter continues to the song select, as on the commercial games' result screens; Esc too, once
  // the details are closed. R or F2 (the in-play retry key) plays again, F5 a new pattern, F7
  // saves the replay, Space opens the details. A held key does nothing more, a focused button
  // takes its own Enter, and any key or click shows the whole result at once.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      settle();
      if (e.code === 'F5' || e.code === 'F7') {
        // F5 would reload the page
        e.preventDefault();
        if (e.repeat) return;
        if (e.code === 'F5') void regenerate();
        else saveReplay();
        return;
      }
      if (e.repeat) {
        if (e.code === 'Enter' || e.code === 'Space') e.preventDefault();
        return;
      }
      if (e.code === 'KeyR' || e.code === 'F2') {
        e.preventDefault();
        onRetry();
      } else if (e.code === 'Space') {
        // a focused button is not pressed by it: Space is the details' key here
        e.preventDefault();
        toggleDetails();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        if (details) toggleDetails();
        else onBack();
      } else if (e.code === 'Enter' && !ownsEnter(e.target)) {
        e.preventDefault();
        onBack();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerdown', settle, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerdown', settle, true);
    };
  });

  // autoplay and practice earn nothing: a plain label in place of the lamp (the lamp the run
  // reached stays on data-lamp)
  const aided = practice ? 'PRACTICE' : request.autoPlay ? 'AUTO' : null;
  const chip = difficultyChip(meta);
  const mode = request.replay ? 'REPLAY' : practice ? `연습${practice.rate !== 1 ? ` ×${practice.rate.toFixed(2)}` : ''}` : request.autoPlay ? 'AUTO' : null;
  // DJMAX's "정밀 %" leads with the rate; the other rulesets lead with their own score
  const rateFirst = rules.scoring === 'rate';
  const headline = rateFirst ? (
    <CountUp value={result.rate} format={rateText} phase={phase} testId="result-rate" />
  ) : (
    <span className="num" data-testid="result-score">
      <CountUp value={rules.scoring === 'exscore' ? result.exScore : result.weightedScore} format={scoreText} phase={phase} />
      {rules.scoring === 'exscore' && <small> / {result.exMax.toLocaleString('en-US')}</small>}
    </span>
  );
  const recorded = save && 'change' in save ? save : null;

  const hints: KeyHint[] = [
    { keys: ['Enter'], label: '계속' },
    { keys: ['R'], label: '다시 하기' },
  ];
  if (onRegenerate) hints.push({ keys: ['F5'], label: '새 패턴' });
  hints.push({ keys: ['Space'], label: details ? '상세 닫기' : '그래프·오프셋', onClick: toggleDetails, testId: 'hint-details' });

  return (
    <div className="result-screen screen-enter" data-testid="result-screen" data-settled={phase === 2}>
      {song && <Backdrop song={song} />}
      <TopBar name="결과">
        {replay && (
          <button className="quiet small" data-testid="download-replay" onClick={saveReplay}>
            리플레이 저장 <kbd>F7</kbd>
          </button>
        )}
      </TopBar>
      <div className="screen-body">
        <section className="result-hero" hidden={details}>
          <div className="hero-art">
            {song ? <SongArt song={song} size={280} /> : <Disc size={280} />}
            {song && sketch && <span className="hero-art-bpm">{bpmLabel(song)}</span>}
          </div>
          <div className="result-song">
            <h1 title={meta.title}>{meta.title}</h1>
            <p className="artist">{meta.artist || '알 수 없는 아티스트'}</p>
            <div className="result-chips">
              <span className="chip tier" style={{ ['--diff' as string]: chip.color } as CSSProperties}>
                {chip.label}
                {chip.level && <b>{chip.level}</b>}
              </span>
              <span className="chip">{meta.keyMode}</span>
              {played.judgementMode !== 'NORMAL' && <span className="chip">{judgementConfig.modes[played.judgementMode].label}</span>}
              <span className="chip">{rules.label}</span>
              {played.placement !== 'OFF' && (
                <span className="chip">
                  {placement.label}
                  {placement.laneOrder ? ` ${placement.laneOrder}` : ''}
                </span>
              )}
              {mode && <span className="chip">{mode}</span>}
            </div>
            {practice && (
              <p className="record-note">
                연습 모드{outcome.loop ? ` · ${outcome.loop}번째 반복` : ''} · {practice.rate.toFixed(2)}배속 · 기록되지 않습니다
              </p>
            )}
            {/* the record's place is kept from the start, so nothing moves when it shows */}
            {recording && <div className="record-slot">{save && phase === 2 && <RecordTags save={save} />}</div>}
          </div>
          <div className="result-outcome">
            <span className={`lamp ${aided ? 'aided' : lampClass(result.lamp)} ${phase === 2 ? '' : 'stamp'}`} data-testid="result-lamp" data-lamp={result.lamp}>
              {aided ?? result.lamp}
            </span>
            <div className={`result-grade ${phase === 0 ? 'pending' : phase === 1 ? 'stamp' : ''}`}>
              {rules.scoring === 'exscore' ? (
                <span className="label">랭크 · BMS 기준</span>
              ) : (
                <span className="label" title="EZ2ON REBOOT : R의 등급 기준을 100만 점 만점으로 옮긴 값">
                  등급 · EZ2ON 기준
                </span>
              )}
              <b data-testid="result-grade">{result.grade}</b>
            </div>
            <div className="result-headline">
              <span className="label">{rateFirst ? 'RATE' : rules.scoring === 'exscore' ? 'EX-SCORE' : 'SCORE'}</span>
              {headline}
            </div>
            {recording && (
              <p className="result-delta">
                {recorded?.before && recorded.change.rateDelta !== null && phase === 2 && (
                  <>
                    {!rateFirst && <span className="label">RATE</span>}
                    <span className={recorded.change.rateDelta > 0 ? 'up' : 'flat'}>{signedPercent(recorded.change.rateDelta)}</span>
                    <span className="best">
                      이전 최고 {recorded.before.rate.toFixed(2)}% · {recorded.before.lamp}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
        </section>

        <section className="result-numbers" hidden={details}>
          <div className="judge-cells" data-testid="grade-table">
            {judgeCells(result.rows).map((c) => (
              <div key={c.label} className={`judge-cell ${c.count === 0 ? 'zero' : ''}`}>
                <span className={`label ${c.cls}`}>{c.label}</span>
                <span className="num" data-testid={c.cls === 'g-break' ? 'result-breaks' : undefined}>
                  {c.count.toLocaleString('en-US')}
                </span>
              </div>
            ))}
          </div>
          <div className="result-stats">
            <dl>
              {rateFirst ? (
                <div>
                  <dt>SCORE</dt>
                  <dd data-testid="result-score">{result.score.toLocaleString('en-US')}</dd>
                </div>
              ) : (
                <>
                  <div>
                    <dt>RATE</dt>
                    <dd data-testid="result-rate">{rateText(result.rate)}</dd>
                  </div>
                  <div>
                    <dt>정밀 % 점수</dt>
                    <dd>{result.score.toLocaleString('en-US')}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>MAX COMBO</dt>
                <dd>
                  {result.maxCombo.toLocaleString('en-US')} <small>/ {result.maxPossibleCombo.toLocaleString('en-US')}</small>
                </dd>
              </div>
            </dl>
            <dl>
              <div>
                <dt>FAST · SLOW</dt>
                <dd>
                  <span className="fast">{result.fast}</span> · <span className="slow">{result.slow}</span>
                </dd>
              </div>
              <div>
                <dt>게이지</dt>
                <dd>
                  {result.failed ? `실패 ${formatTime(result.failedAtMs ?? 0)}` : `${Math.round(result.gauge)}%`} <small>{result.gaugeLabel}</small>
                </dd>
              </div>
              {result.fever.enabled && (
                <div data-testid="result-fever">
                  <dt>FEVER 보너스</dt>
                  <dd>
                    +{result.fever.bonus.toLocaleString('en-US')}{' '}
                    <small>
                      최고 ×{result.fever.bestMultiplier} · {result.fever.activations}회
                    </small>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </section>

        {details ? (
          <section className="result-details" data-testid="result-details-panel">
            <div className="details-grid">
              <div>
                <h2>
                  게이지 <span>{result.gaugeLabel}</span>
                </h2>
                <GaugeGraph
                  history={result.gaugeHistory}
                  clear={gauge.clear}
                  survival={gauge.failAtZero}
                  startMs={startMs}
                  endMs={endMs}
                  failedAtMs={result.failedAtMs}
                />
                <h2>밀도 · BREAK · 타이밍</h2>
                <TimelineGraph chart={chart} hits={result.hits} breakTimes={result.breakTimes} windowMs={180} startMs={startMs} endMs={endMs} />
                {(replay || meta.songId) && (
                  <div className="details-actions">
                    {replay && (
                      <button className="small" data-testid="watch-replay" onClick={() => onWatchReplay(replay)}>
                        리플레이 보기
                      </button>
                    )}
                    {meta.songId && (
                      <>
                        <span className="label">채보 내보내기</span>
                        {exportFormats(meta.keyMode).map((f) => (
                          <a key={f} className="button small" href={api.exportUrl(meta.chartId, f)} download data-testid={`result-export-${f}`}>
                            {EXPORT_LABELS[f]}
                          </a>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
              <div>
                <h2>타이밍 분포</h2>
                <TimingHistogram hits={result.hits} median={result.medianErrorMs} />
                <p className="error-stats">
                  평균 {signedMs(result.meanErrorMs)} · 중앙값 {signedMs(result.medianErrorMs)}
                  {result.stdErrorMs !== null ? ` · σ ${result.stdErrorMs.toFixed(1)}ms` : ''}
                </p>
                {suggestion !== null && !request.autoPlay && Math.abs(suggestion) >= 3 && (
                  <div className="row offset-suggestion" data-testid="offset-suggestion">
                    <span>
                      절사 평균으로 {Math.abs(suggestion)}ms {suggestion > 0 ? '늦게' : '빨리'} 쳤습니다. 판정 오프셋을{' '}
                      {settings.inputOffsetMs + suggestion}ms로 바꾸면 보정됩니다.
                    </span>
                    <button onClick={() => onSettingsChange({ ...settings, inputOffsetMs: settings.inputOffsetMs + suggestion })}>적용</button>
                  </div>
                )}
                <h2>DJMAX % 판정</h2>
                <div className="percent-counts">
                  {result.counts.map((c) => (
                    <span key={c.percent} className={c.count === 0 ? 'zero' : ''}>
                      <span className={gradeClass(c.percent, false)}>{c.label}</span>
                      <b>{c.count.toLocaleString('en-US')}</b>
                    </span>
                  ))}
                  <span className={result.breaks === 0 ? 'zero' : ''}>
                    <span className="g-break">BREAK</span>
                    <b>{result.breaks.toLocaleString('en-US')}</b>
                  </span>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <RunPanel chart={chart} result={result} startMs={startMs} endMs={endMs} />
        )}

        <div className="result-actions">
          <button className="primary" data-testid="result-back" onClick={onBack} autoFocus>
            계속 <kbd>Enter</kbd>
          </button>
          <button data-testid="result-retry" onClick={onRetry}>
            다시 하기 <kbd>R</kbd>
          </button>
          {onRegenerate && (
            <button data-testid="result-regenerate" disabled={regenerating} onClick={() => void regenerate()}>
              {regenerating ? (
                '새 패턴 만드는 중…'
              ) : (
                <>
                  새 패턴 <kbd>F5</kbd>
                </>
              )}
            </button>
          )}
          <button className={details ? 'active' : ''} data-testid="result-details" aria-expanded={details} onClick={toggleDetails}>
            상세 <kbd>Space</kbd>
          </button>
          {regenerateError && (
            <span className="error" data-testid="result-regenerate-error">
              새 패턴을 만들지 못했습니다: {regenerateError}
            </span>
          )}
        </div>
      </div>
      <HintBar hints={hints} end={[{ keys: ['Esc'], label: details ? '닫기' : '선곡으로' }]} />
    </div>
  );
}

/**
 * A number counting up from zero while the result reveals itself. The final value stays in the
 * text (what tests and screen readers read); the counting one is drawn over it.
 */
function CountUp({ value, format, phase, testId }: { value: number; format: (v: number) => string; phase: Phase; testId?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || phase !== 1) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / REVEAL.countMs);
      el.dataset.count = format(value * (1 - (1 - t) ** 3));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, value, format]);
  return (
    <span ref={ref} className={`num ${phase < 2 ? 'counting' : ''}`} data-count={format(0)} data-testid={testId}>
      {format(value)}
    </span>
  );
}

/** What the play did to the chart's record, in tags (or why it was not kept). */
function RecordTags({ save }: { save: SaveState }) {
  if ('error' in save) {
    return (
      <p className="record-tags error" data-testid="save-state">
        기록을 저장하지 못했습니다: {save.error}
      </p>
    );
  }
  const { first, newBest, lampUp } = save.change;
  const tags = [first && '첫 기록', newBest && '최고 기록 갱신', lampUp && `램프 갱신 · ${lampUp[0]} → ${lampUp[1]}`].filter((t): t is string => !!t);
  return (
    <p className="record-tags" data-testid="save-state">
      {(tags.length > 0 ? tags : ['기록 저장됨']).map((t) => (
        <span key={t} className="tag">
          {t}
        </span>
      ))}
    </p>
  );
}

const STRIP_W = 1000;
const STRIP_H = 100;

/**
 * The song at a glance: its note density, where the play lost points (in their colours) and,
 * under it, each section with the accuracy of the notes in it.
 */
function RunPanel({ chart, result, startMs, endMs }: { chart: Chart; result: SessionResult; startMs: number; endMs: number }) {
  const span = Math.max(1, endMs - startMs);
  const x = (t: number) => (((t - startMs) / span) * STRIP_W).toFixed(1);
  const counts = densityBins(chart.notes, startMs, endMs, stripBins(span));
  const max = Math.max(1, ...counts);
  const bw = STRIP_W / counts.length;
  const bars = counts
    .map((c, i) => (c > 0 ? `M${(i * bw + bw * 0.3).toFixed(1)} ${STRIP_H}V${(STRIP_H - (c / max) * (STRIP_H - 8)).toFixed(1)}h${(bw * 0.4).toFixed(1)}V${STRIP_H}Z` : ''))
    .join('');
  const losses = lossTimes(result.judgements, result.ruleset);
  const sections = sectionScores(chart, result.judgements, startMs, endMs);
  return (
    <section className="run-panel">
      <h2>{sections.length > 0 ? '곡 흐름 · 놓친 곳 · 구간별 정확도' : '곡 흐름 · 놓친 곳'}</h2>
      <div className="run-strip">
        <svg viewBox={`0 0 ${STRIP_W} ${STRIP_H}`} preserveAspectRatio="none" role="img" aria-label="노트 밀도와 놓친 곳">
          <path className="density" d={bars} />
          {LOSS_CLASSES.map((cls) =>
            losses[cls].length > 0 ? <path key={cls} className={`loss ${cls}`} d={losses[cls].map((t) => `M${x(t)} 0V${STRIP_H}`).join('')} /> : null,
          )}
          {result.failedAtMs !== null && <rect className="after-fail" x={x(result.failedAtMs)} y={0} width={STRIP_W} height={STRIP_H} />}
        </svg>
      </div>
      {sections.length > 0 && (
        <div className="run-sections" style={{ gridTemplateColumns: sectionColumns(sections) }}>
          {sections.map((s, i) => (
            <div
              key={i}
              style={{ gridColumn: columnOf(sections, i), ['--c' as string]: `var(${s.color})` } as CSSProperties}
              title={`${s.label.toUpperCase()} ${accuracyLabel(s.accuracy)}`}
            >
              <span>{s.label.toUpperCase()}</span>
              <b>{accuracyLabel(s.accuracy)}</b>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Grid columns of the section row in shares of the strip, with the stretches no section covers between them. */
function sectionColumns(sections: SectionScore[]): string {
  const cols: number[] = [];
  let at = 0;
  for (const s of sections) {
    if (s.from > at) cols.push(s.from - at);
    cols.push(s.to - s.from);
    at = s.to;
  }
  if (at < 1) cols.push(1 - at);
  return cols.map((c) => `${(c * 100).toFixed(4)}%`).join(' ');
}

/** The grid column of section i in sectionColumns. */
function columnOf(sections: SectionScore[], i: number): number {
  let col = 0;
  let at = 0;
  for (let k = 0; k <= i; k++) {
    if (sections[k].from > at) col++;
    col++;
    at = sections[k].to;
  }
  return col;
}

function downloadReplay(replay: ReplayData, title: string): void {
  const blob = new Blob([JSON.stringify(replay)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[\\/:*?"<>|]/g, '_')} ${new Date(replay.recordedAt).toISOString().slice(0, 19).replace(/[T:]/g, '-')}.grgreplay.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
