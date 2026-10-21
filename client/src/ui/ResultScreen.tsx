import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, EXPORT_LABELS, exportFormats } from '../api/client';
import { gaugeRules, judgementConfig, type GaugeRule } from '../engine/config';
import type { ReplayData } from '../engine/replay';
import { gradeClass, rulesetConfigs } from '../engine/ruleset';
import type { SessionResult } from '../engine/session';
import type { Chart } from '../engine/types';
import { bindingsFor, secondBindingsFor, songOffsetOf, withSongOffset, type Settings } from '../settings/settings';
import type { PlayRequest } from './App';
import { difficultyChip } from './difficultyChip';
import { lampClass } from './lamps';
import type { PlayOutcome } from './PlayController';
import { playbackRateText, playedSettings, playModeLabel } from './playRules';
import { GaugeGraph, gaugePoints, suggestOffset, TimelineGraph, TimingHistogram } from './ResultGraphs';
import {
  accuracyLabel,
  densityBins,
  errorsAtEnd,
  headlineOf,
  judgeCells,
  LOSS_CLASSES,
  lossTimes,
  nextGrade,
  nextGradeText,
  offsetFix,
  offsetText,
  recordChange,
  sectionScores,
  shiftIsLane,
  signedCount,
  signedPercent,
  stripBins,
  timingWindows,
  type LossClass,
  type OffsetFix,
  type OffsetMove,
  type RecordChange,
  type SectionScore,
} from './resultBreakdown';
import { HintBar, TopBar, type KeyHint } from './shell';
import { Backdrop, Disc, SongArt } from './songArt';

interface Props {
  request: PlayRequest;
  outcome: PlayOutcome;
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  /** Play the chart again: on the same placement (its seed), or with a new one drawn. */
  onRetry: (newPlacement: boolean) => void;
  onBack: () => void;
  onWatchReplay: (replay: ReplayData) => void;
  /**
   * Generate this key mode and difficulty again with a new seed and play it (generated charts).
   * Resolves with the error to show when it could not, else null.
   */
  onRegenerate?: () => Promise<string | null>;
}

/**
 * The result shows itself in two steps: the lamp, the grade and the headline land together, then
 * (REVEAL_MS on) what the play did to the record. Any key or click shows it all at once.
 */
const REVEAL_MS = 600;
/**
 * Until the reveal's time is up (this long at least, without the reveal: reduced motion), the keys
 * that go on or press (Enter, Space, Esc: a pad's A and B), the keys that move the focus or the
 * page (a pad's d-pad, Y and shoulders, a controller's lanes the menus take as arrows: the menu
 * bridge moves the focus with one the screen leaves alone) and the play's lane keys only show it
 * all: a key pressed out of habit as the song ends does nothing more, nor do its repeats while it
 * is held. R, F2, F5 and F7 act at once.
 */
const MIN_GUARD_MS = 400;
const GUARDED_KEYS = new Set(['Enter', 'NumpadEnter', 'Space', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);
/** The export's note stays this long. */
const EXPORTED_NOTE_MS = 3000;
/** The strip's lost points: lower judgements drawn longer, up from its foot (shares of its height). */
const LOSS_TICK: Record<LossClass, number> = { 'g-high': 0.25, 'g-mid': 0.5, 'g-low': 0.75, 'g-break': 1 };

type SaveState = { change: RecordChange } | { error: string };

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
  // what was played: the recorded settings of a replay, or the current ones (an editor test's without placement)
  const played = request.replay?.settings ?? outcome.replay?.settings ?? playedSettings(request, settings);
  const replay = outcome.replay ?? request.replay ?? null;
  const meta = request.chart.meta;
  const song = request.song ?? null;
  const rules = rulesetConfigs[result.ruleset];
  const windows = timingWindows(played.judgementMode, result.ruleset);
  // fixed from the offsets the play ended on, the hits judged before a change of the song's in play
  // made up for: applying it does not move it (a replay's is not offered)
  const offsets = request.autoPlay || request.replay ? null : outcome.offsets;
  const rate = practice?.rate ?? 1;
  const fix = offsets && offsetFix(suggestOffset(errorsAtEnd(result.hits, offsets.shifts, rate)), offsets, rate, !!meta.songId);
  const [save, setSave] = useState<SaveState | null>(null);
  const [details, setDetails] = useState(false);
  const saved = useRef(false);
  const backButton = useRef<HTMLButtonElement>(null);
  const gauge = Object.values(gaugeRules).find((g) => g.label === result.gaugeLabel) ?? gaugeRules.NORMAL;
  const startMs = practice ? practice.startMs : 0;
  const endMs = practice ? practice.endMs : Math.max(meta.durationMs ?? 0, ...chart.notes.map((n) => n.endT ?? n.t), 1);

  const [reduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const [settled, setSettled] = useState(reduced);
  const settle = useCallback(() => setSettled(true), []);
  const [guardUntil] = useState(() => performance.now() + (reduced ? MIN_GUARD_MS : Math.max(MIN_GUARD_MS, REVEAL_MS)));
  useEffect(() => {
    if (reduced) return;
    const timer = window.setTimeout(() => setSettled(true), REVEAL_MS);
    return () => window.clearTimeout(timer);
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
        setSave({ change: recordChange(result, before, played.judgementMode, result.ruleset) });
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
  // F7 hands over the replay as a file (the server keeps every recorded play's already); a note
  // says so for a moment (counted from the last export)
  const [exports, setExports] = useState(0);
  const [exported, setExported] = useState(false);
  useEffect(() => {
    if (exports === 0) return;
    setExported(true);
    const timer = window.setTimeout(() => setExported(false), EXPORTED_NOTE_MS);
    return () => window.clearTimeout(timer);
  }, [exports]);
  const exportReplay = () => {
    if (!replay) return;
    downloadReplay(replay, meta.title);
    setExports((n) => n + 1);
  };

  // Enter is the back button's from the start, and again after another button is used (not that
  // button once more). The page stays where it is: on a small window the outcome at its top stays in sight.
  const focusBack = () => backButton.current?.focus({ preventScroll: true });
  useEffect(() => {
    backButton.current?.focus({ preventScroll: true });
  }, []);
  const thenBack = (action: () => void) => () => {
    action();
    focusBack();
  };
  // The details (graphs, the offset suggestion, every judgement) take the summary's place.
  const toggleDetails = () => setDetails((v) => !v);

  // The play's lane keys: pressed out of habit as the result shows, they only show it all.
  const laneKeys = new Set([...bindingsFor(settings, meta.keyMode), ...secondBindingsFor(settings, meta.keyMode).filter((c): c is string => c !== null)]);
  // with a lane on Shift a new lane order is the button's alone
  const shiftLane = shiftIsLane(laneKeys);
  // keys held off as the result showed (see MIN_GUARD_MS), until they are let go
  const heldOff = useRef(new Set<string>());

  // Enter continues to the song select (the editor, for its test plays), as on the commercial
  // games' result screens; Esc too, once the details are closed. R or F2 (the in-play retry key)
  // plays again on the same placement, Shift+R on a new one, F5 a new pattern, F7 exports the
  // replay, Space opens the details. A held key does nothing more, a focused button takes its own
  // Enter, and any key or click shows the whole result at once (and only that, early on: see MIN_GUARD_MS).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const early = performance.now() < guardUntil;
      settle();
      // kept from a focused button (Enter, the pad's A) and from the menu bridge (which moves the
      // focus with an arrow or Tab left alone, and repeats a held d-pad)
      if (early && (GUARDED_KEYS.has(e.code) || laneKeys.has(e.code))) {
        e.preventDefault();
        heldOff.current.add(e.code);
        return;
      }
      if (e.repeat && heldOff.current.has(e.code)) {
        e.preventDefault();
        return;
      }
      heldOff.current.delete(e.code);
      if (e.code === 'F5' || e.code === 'F7') {
        // F5 would reload the page
        e.preventDefault();
        if (e.repeat) return;
        if (e.code === 'F5') void regenerate();
        else exportReplay();
        return;
      }
      if (e.repeat) {
        if (e.code === 'Enter' || e.code === 'Space') e.preventDefault();
        return;
      }
      if (e.code === 'KeyR' || e.code === 'F2') {
        e.preventDefault();
        onRetry(e.code === 'KeyR' && e.shiftKey && !shiftLane);
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
      heldOff.current.delete(e.code);
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
  const mode = playModeLabel(request);
  // DJMAX's "정밀 %" leads with the rate; the other rulesets lead with their own score
  const rateFirst = rules.scoring === 'rate';
  const headlineLabel = rateFirst ? 'RATE' : rules.scoring === 'exscore' ? 'EX-SCORE' : 'SCORE';
  const headlineValue = rateFirst ? rateText(result.rate) : scoreText(headlineOf(rules.scoring, result));
  const next = nextGrade(result);
  // what the judgements and MAX COMBO count past the notes: a long note's end, its ticks
  const holdEnds = result.judgeable - chart.notes.length;
  const ticks = result.maxPossibleCombo - result.judgeable;
  const notesExtra = [holdEnds > 0 ? `+ 롱노트 끝 ${holdEnds.toLocaleString('en-US')}` : '', ticks > 0 ? `틱 +${ticks.toLocaleString('en-US')}` : '']
    .filter((s) => s !== '')
    .join(' · ');
  const recorded = save && 'change' in save && settled ? save.change : null;
  const modeLabel = judgementConfig.modes[played.judgementMode].label;
  const recordTag = recorded && (recorded.newBest ? '최고 기록 갱신' : firstTag(recorded.first, played.judgementMode, rules.label));
  // RANDOM and its kin: R plays the same lane order again, Shift+R draws a new one. A retry plays
  // on the settings' placement (a replay was played on its recording's).
  const randomPlacement = !request.fromEditor && settings.placement !== 'OFF' && settings.placement !== 'MIRROR';
  const backLabel = request.fromEditor ? '에디터로' : request.fromSettings ? '설정으로' : '선곡으로';

  const hints: KeyHint[] = randomPlacement
    ? [{ keys: ['R'], label: '같은 배치로 다시' }, ...(shiftLane ? [] : [{ keys: ['Shift', 'R'], label: '새 배치로 다시' }])]
    : [{ keys: ['R'], label: '다시 하기' }];
  if (onRegenerate) hints.push({ keys: ['F5'], label: '새 패턴' });
  hints.push({ keys: ['Space'], label: details ? '상세 닫기' : '상세', onClick: thenBack(toggleDetails), testId: 'hint-details' });
  if (replay) hints.push({ keys: ['F7'], label: '리플레이 파일로 내보내기', onClick: thenBack(exportReplay), testId: 'hint-export-replay', minor: true });
  // Esc goes back as Enter does: named once, as the details' close while they are open
  const endHints: KeyHint[] = [{ keys: ['Enter'], pad: ['A'], label: backLabel, testId: 'hint-back' }];
  if (details) endHints.unshift({ keys: ['Esc'], pad: ['B'], label: '상세 닫기' });

  return (
    <div className="result-screen screen-enter" data-testid="result-screen" data-settled={settled}>
      {song && <Backdrop song={song} />}
      <TopBar name="결과">
        {exported && (
          <span className="topbar-note" role="status" data-testid="replay-exported">
            리플레이를 파일로 내보냈습니다
          </span>
        )}
        {replay && (
          <button className="quiet small" data-testid="download-replay" onClick={thenBack(exportReplay)}>
            리플레이 파일로 내보내기 <kbd>F7</kbd>
          </button>
        )}
      </TopBar>
      <div className="screen-body">
        <section className="result-hero" hidden={details}>
          <div className="hero-art">
            {song ? <SongArt song={song} size={200} /> : <Disc size={200} />}
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
              {played.judgementMode !== 'NORMAL' && <span className="chip">{modeLabel}</span>}
              <span className="chip">{rules.label}</span>
              {played.placement !== 'OFF' && (
                <span className="chip" data-testid="result-placement" data-seed={placement.seed}>
                  {placement.label}
                  {placement.laneOrder ? ` ${placement.laneOrder}` : ''}
                </span>
              )}
              {mode && <span className="chip">{mode}</span>}
            </div>
            {practice && (
              <p className="record-note">
                {request.fromEditor ? '에디터 테스트' : `연습 모드${outcome.loop ? ` · ${outcome.loop}번째 반복` : ''} · ${playbackRateText(practice.rate)}`} · 기록되지 않습니다
              </p>
            )}
          </div>
          <div className="result-outcome">
            <span className={`lamp ${aided ? 'aided' : lampClass(result.lamp)} ${settled ? '' : 'stamp'}`} data-testid="result-lamp" data-lamp={result.lamp}>
              {aided ?? result.lamp}
            </span>
            {/* the record's lines keep their place from the start, so nothing moves when they show */}
            {recording && (
              <p className="lamp-change" data-testid="lamp-change">
                {recorded?.lampUp && (
                  <>
                    램프 갱신 <span className={`lamp ${lampClass(recorded.lampUp[0])}`}>{recorded.lampUp[0]}</span> →{' '}
                    <span className={`lamp ${lampClass(recorded.lampUp[1])}`}>{recorded.lampUp[1]}</span>
                  </>
                )}
              </p>
            )}
            <div className={`result-grade ${settled ? '' : 'stamp'}`}>
              {rules.scoring === 'exscore' ? (
                <span className="label">랭크 · BMS 기준</span>
              ) : (
                <span className="label" title="EZ2ON REBOOT : R의 등급 기준을 100만 점 만점으로 옮긴 값">
                  등급 · EZ2ON 기준
                </span>
              )}
              <b data-testid="result-grade">{result.grade}</b>
            </div>
            <div className={`result-headline ${settled ? '' : 'stamp'}`}>
              <span className="label">{headlineLabel}</span>
              <span className="headline-value">
                <span className="num" data-testid={rateFirst ? 'result-rate' : 'result-score'}>
                  {headlineValue}
                  {rules.scoring === 'exscore' && <small> / {result.exMax.toLocaleString('en-US')}</small>}
                </span>
                {recordTag && (
                  <span className="record-tag" data-testid="record-tag">
                    {recordTag}
                  </span>
                )}
              </span>
            </div>
            {next && (
              <p className="next-grade" data-testid="next-grade">
                {nextGradeText(next, rules.scoring)}
              </p>
            )}
            {recording && (
              <RecordLine save={settled ? save : null} scoring={rules.scoring} missLabel={rules.missLabel} modeLabel={played.judgementMode !== 'NORMAL' ? played.judgementMode : null} />
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
              {/* the notes as the song select counts them; the judgements add the long notes' ends, the combo their ticks too */}
              <div>
                <dt>NOTES</dt>
                <dd data-testid="result-notes">
                  {chart.notes.length.toLocaleString('en-US')}
                  {notesExtra && <small> {notesExtra}</small>}
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
            {/* what the summary showed, in a line: the details hide it */}
            <p className="result-summary" data-testid="result-summary">
              <span className={`lamp ${aided ? 'aided' : lampClass(result.lamp)}`}>{aided ?? result.lamp}</span>
              <span>
                <span className="label">{rules.scoring === 'exscore' ? '랭크' : '등급'}</span> {result.grade}
              </span>
              <span>
                <span className="label">{headlineLabel}</span> {headlineValue}
                {rules.scoring === 'exscore' && <small> / {result.exMax.toLocaleString('en-US')}</small>}
              </span>
              {!rateFirst && (
                <span>
                  <span className="label">RATE</span> {rateText(result.rate)}
                </span>
              )}
              <span>
                <span className="label">{rules.missLabel}</span> {result.breaks.toLocaleString('en-US')}
              </span>
            </p>
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
                <TimelineGraph chart={chart} hits={result.hits} breakTimes={result.breakTimes} windows={windows} startMs={startMs} endMs={endMs} />
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
                <h2>
                  타이밍 분포 <span>{`${windows.topLabel} ±${windows.topMs.toFixed(1)}ms`}</span>
                </h2>
                <TimingHistogram hits={result.hits} median={result.medianErrorMs} windows={windows} />
                <p className="error-stats">
                  평균 {signedMs(result.meanErrorMs)} · 중앙값 {signedMs(result.medianErrorMs)}
                  {result.stdErrorMs !== null ? ` · σ ${result.stdErrorMs.toFixed(1)}ms` : ''}
                  {request.replay && outcome.offsets && ` · 녹화 때 판정 오프셋 ${offsetText(outcome.offsets.input)}`}
                  {request.replay && outcome.offsets && outcome.offsets.song !== 0 && ` · 곡 오프셋 ${offsetText(outcome.offsets.song)}`}
                </p>
                {fix && (
                  <OffsetSuggestion
                    fix={fix}
                    shifted={(offsets?.shifts.length ?? 0) > 0}
                    settings={settings}
                    songId={meta.songId ?? null}
                    onSettingsChange={(next) => {
                      onSettingsChange(next);
                      focusBack();
                    }}
                  />
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
          <RunPanel chart={chart} result={result} gauge={gauge} startMs={startMs} endMs={endMs} />
        )}

        <div className="result-actions">
          <button ref={backButton} className="primary" data-testid="result-back" onClick={onBack}>
            {backLabel} <kbd>Enter</kbd>
          </button>
          <button data-testid="result-retry" onClick={() => onRetry(false)}>
            {randomPlacement ? '같은 배치로 다시' : '다시 하기'} <kbd>R</kbd>
          </button>
          {randomPlacement && (
            <button data-testid="result-retry-new" onClick={() => onRetry(true)}>
              새 배치로 다시
              {!shiftLane && (
                <>
                  {' '}
                  <kbd>Shift</kbd>
                  <kbd>R</kbd>
                </>
              )}
            </button>
          )}
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
          <button
            className={details ? 'active' : ''}
            data-testid="result-details"
            aria-expanded={details}
            onClick={thenBack(toggleDetails)}
          >
            상세 <kbd>Space</kbd>
          </button>
          {regenerateError && (
            <span className="error" data-testid="result-regenerate-error">
              새 패턴을 만들지 못했습니다: {regenerateError}
            </span>
          )}
        </div>
      </div>
      <HintBar hints={hints} end={endHints} />
    </div>
  );
}

/** The tag beside the headline for a first record: of the chart, of its judgement mode, of its score rule. */
function firstTag(first: RecordChange['first'], mode: string, ruleLabel: string): string | null {
  if (first === 'chart') return '첫 기록';
  if (first === 'mode') return `${mode} 판정 첫 기록`;
  return first === 'rule' ? `${ruleLabel} 첫 기록` : null;
}

/**
 * Under the headline once the play is stored: how far it is from the best of its judgement mode
 * (the headline and the BREAKs, worse in a low judgement's colour) and that best; or that it was
 * stored, or why not. The line keeps its place until then.
 */
function RecordLine({ save, scoring, missLabel, modeLabel }: { save: SaveState | null; scoring: 'rate' | 'weighted' | 'exscore'; missLabel: string; modeLabel: string | null }) {
  if (!save) return <p className="record-line" />;
  if ('error' in save) {
    return (
      <p className="record-line error" data-testid="save-state">
        기록을 저장하지 못했습니다: {save.error}
      </p>
    );
  }
  const { delta, breaksDelta, before } = save.change;
  if (delta === null || !before || before.headline === null) {
    return (
      <p className="record-line" data-testid="save-state">
        <span className="best">기록 저장됨</span>
      </p>
    );
  }
  // fewer BREAKs are better
  const trend = (v: number, better: number) => (v === 0 ? 'flat' : v * better > 0 ? 'up' : 'down');
  return (
    <p className="record-line" data-testid="save-state">
      <span className={trend(delta, 1)} data-testid="record-delta">
        {scoring === 'rate' ? signedPercent(delta) : signedCount(delta)}
      </span>
      {breaksDelta !== null && (
        <span className={trend(breaksDelta, -1)} data-testid="record-breaks-delta">
          {missLabel} {signedCount(breaksDelta)}
        </span>
      )}
      <span className="best" data-testid="record-best">
        {modeLabel ? `${modeLabel} 판정 ` : ''}이전 최고 {scoring === 'rate' ? rateText(before.headline) : scoreText(before.headline)}
      </span>
    </p>
  );
}

/**
 * The offset suggestion: the play's trimmed mean error, and the player's offset (전체에 적용) or
 * the song's own (이 곡에만 적용) set to make up for it. Applied, its line says so with 되돌리기
 * and both buttons are off: the suggestion was worked out from the offsets the play ran on (and
 * says so when the song's own was changed in play: the hits before were judged on the old one).
 */
function OffsetSuggestion({
  fix,
  shifted,
  settings,
  songId,
  onSettingsChange,
}: {
  fix: OffsetFix;
  shifted: boolean;
  settings: Settings;
  songId: string | null;
  onSettingsChange: (s: Settings) => void;
}) {
  const inputApplied = fix.input !== null && settings.inputOffsetMs === fix.input.to;
  const songApplied = fix.song !== null && songOffsetOf(settings, songId) === fix.song.to;
  const setInput = (ms: number) => onSettingsChange({ ...settings, inputOffsetMs: ms });
  const setSong = (ms: number) => songId && onSettingsChange(withSongOffset(settings, songId, ms));
  return (
    <div className="offset-suggestion" data-testid="offset-suggestion" data-error-ms={fix.errorMs}>
      <p>
        절사 평균으로 {Math.abs(fix.errorMs)}ms {fix.errorMs > 0 ? '늦게' : '빨리'} 쳤습니다.
        {/* in play a song's offset moves with − / =, and the player's in the sync test (no song) */}
        {shifted && (songId ? ' 플레이 중에 바꾼 곡 오프셋도 반영했습니다.' : ' 플레이 중에 바꾼 판정 오프셋도 반영했습니다.')}
      </p>
      {fix.input && (
        <OffsetRow label="전체에 적용" what="판정 오프셋" move={fix.input} done={inputApplied} off={inputApplied || songApplied} testId="offset-apply" onSet={setInput} />
      )}
      {fix.song && (
        <OffsetRow label="이 곡에만 적용" what="곡 오프셋" move={fix.song} done={songApplied} off={inputApplied || songApplied} testId="offset-apply-song" onSet={setSong} />
      )}
    </div>
  );
}

/** An offset to set: its button (off once either is), what it becomes, and once it is, 되돌리기. */
function OffsetRow(props: { label: string; what: string; move: OffsetMove; done: boolean; off: boolean; testId: string; onSet: (ms: number) => void }) {
  const { move, done } = props;
  return (
    <div className="offset-fix">
      <button className="small" data-testid={props.testId} disabled={props.off} onClick={() => props.onSet(move.to)}>
        {props.label}
      </button>
      <span data-testid={`${props.testId}-text`}>
        {props.what} {offsetText(move.from)} → {offsetText(move.to)}
        {done && ' 적용됨'}
      </span>
      {done && (
        <button className="small quiet" data-testid="offset-undo" onClick={() => props.onSet(move.from)}>
          되돌리기
        </button>
      )}
    </div>
  );
}

const STRIP_W = 1000;
const STRIP_H = 100;

/**
 * The song at a glance: its note density, the gauge (its clear line dashed), where the play lost
 * points (in their colours, longer the lower) and, under it, each section with the accuracy of the
 * notes in it.
 */
function RunPanel({ chart, result, gauge, startMs, endMs }: { chart: Chart; result: SessionResult; gauge: GaugeRule; startMs: number; endMs: number }) {
  const span = Math.max(1, endMs - startMs);
  const xs = (t: number) => ((Math.min(Math.max(t, startMs), endMs) - startMs) / span) * STRIP_W;
  const x = (t: number) => xs(t).toFixed(1);
  const counts = densityBins(chart.notes, startMs, endMs, stripBins(span));
  const max = Math.max(1, ...counts);
  const bw = STRIP_W / counts.length;
  const bars = counts
    .map((c, i) => (c > 0 ? `M${(i * bw + bw * 0.3).toFixed(1)} ${STRIP_H}V${(STRIP_H - (c / max) * (STRIP_H - 8)).toFixed(1)}h${(bw * 0.4).toFixed(1)}V${STRIP_H}Z` : ''))
    .join('');
  const losses = lossTimes(result.judgements, result.ruleset);
  const sections = sectionScores(chart, result.judgements, startMs, endMs);
  // the gauge from its foot (0%) to near the top (100%)
  const gy = (v: number) => STRIP_H - 2 - (v / 100) * (STRIP_H - 6);
  const gaugeEnd = result.failedAtMs !== null ? xs(result.failedAtMs) : STRIP_W;
  return (
    <section className="run-panel">
      <h2>
        {sections.length > 0 ? '곡 흐름 · 점수가 깎인 곳 · 구간별 정확도' : '곡 흐름 · 점수가 깎인 곳'}
        <span className="legend-gauge">게이지 {result.gaugeLabel}</span>
      </h2>
      <div className="run-strip">
        <svg viewBox={`0 0 ${STRIP_W} ${STRIP_H}`} preserveAspectRatio="none" role="img" aria-label="노트 밀도, 게이지와 점수가 깎인 곳">
          <path className="density" d={bars} />
          {!gauge.failAtZero && <line className="clear-line" x1={0} x2={STRIP_W} y1={gy(gauge.clear)} y2={gy(gauge.clear)} />}
          <polyline className="gauge" data-testid="run-gauge" points={gaugePoints(result.gaugeHistory, xs, gy, gaugeEnd)} />
          {LOSS_CLASSES.map((cls) =>
            losses[cls].length > 0 ? (
              <path key={cls} className={`loss ${cls}`} d={losses[cls].map((t) => `M${x(t)} ${STRIP_H}V${(STRIP_H * (1 - LOSS_TICK[cls])).toFixed(1)}`).join('')} />
            ) : null,
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
