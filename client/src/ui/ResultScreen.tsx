import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, EXPORT_LABELS, exportFormats, type ScoreRecord } from '../api/client';
import { gaugeRules, judgementConfig, type GaugeRule } from '../engine/config';
import type { ReplayData } from '../engine/replay';
import { gradeClass, rulesetConfigs } from '../engine/ruleset';
import type { SessionResult } from '../engine/session';
import type { Chart } from '../engine/types';
import { padCodeOf } from '../input/gamepad';
import { bindingsFor, padBindingsFor, secondBindingsFor, songOffsetOf, withSongOffset, type Settings } from '../settings/settings';
import type { PlayRequest } from './App';
import { difficultyChip } from './difficultyChip';
import { LampMark, lampClass } from './lamps';
import type { PlayOutcome } from './PlayController';
import { playbackRateText, playedSettings, playModeLabel } from './playRules';
import { gaugePoints, suggestOffset, TimingSpread, TimingSummary } from './ResultGraphs';
import {
  accuracyLabel,
  errorsAtEnd,
  headlineOf,
  isLaneKey,
  judgeCells,
  nextGrade,
  nextGradeText,
  offsetFix,
  offsetText,
  recordChange,
  sectionScores,
  shiftIsLane,
  signedCount,
  signedPercent,
  timingWindows,
  type OffsetFix,
  type OffsetMove,
  type RecordChange,
  type SectionScore,
} from './resultBreakdown';
import { TopBar, usePadInput } from './shell';
import { Backdrop, Disc, SongArt } from './songArt';
import { useTwoPress } from './twoPress';

interface Props {
  request: PlayRequest;
  outcome: PlayOutcome;
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  /** Play the chart again: on the same placement (its seed), or with a new one drawn. */
  onRetry: (newPlacement: boolean) => void;
  onBack: () => void;
  onWatchReplay: (replay: ReplayData) => void;
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
 * bridge moves the focus with one the screen leaves alone) and the play's lanes (its keys, and
 * whatever its pad lanes send: X, which plays again, where it is one) only show it all: a key
 * pressed out of habit as the song ends does nothing more, nor do its repeats while it is held.
 * R, F2 and F7 act at once, and so does a pad's X (or a controller's 다시 하기) that is no lane.
 */
const MIN_GUARD_MS = 400;
const GUARDED_KEYS = new Set(['Enter', 'NumpadEnter', 'Space', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);
/** The export's note stays this long. */
const EXPORTED_NOTE_MS = 3000;

type SaveState = { change: RecordChange } | { error: string };

/** Elements that act on Enter themselves (a focused button keeps its own Enter). */
function ownsEnter(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('button, a[href], input, select, textarea, summary') !== null;
}

const rateText = (v: number) => `${v.toFixed(2)}%`;
const scoreText = (v: number) => Math.round(v).toLocaleString('en-US');

export function ResultScreen({ request, outcome, settings, onSettingsChange, onRetry, onBack, onWatchReplay }: Props) {
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
  // while a pad works the menus the buttons name its buttons, as the hint bar does
  const padInput = usePadInput();
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

  // Store the play (generated charts only; autoplay, practice and the sync test are not records):
  // as the result shows, and again on 다시 저장 when that failed (the server down). The record it is
  // compared with is read once, before the play is in it.
  const recording = !request.autoPlay && !request.replay && !practice && !!meta.songId;
  const before = useRef<ScoreRecord | null | undefined>(undefined);
  const [storing, setStoring] = useState(false);
  const store = async () => {
    const songId = meta.songId;
    if (!songId) return;
    setStoring(true);
    try {
      if (before.current === undefined) before.current = (await api.song(songId)).records?.find((r) => r.chartId === meta.chartId) ?? null;
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
      setSave({ change: recordChange(result, before.current, played.judgementMode, result.ruleset) });
    } catch (e) {
      setSave({ error: e instanceof Error ? e.message : String(e) });
    }
    setStoring(false);
  };
  useEffect(() => {
    if (saved.current || !recording) return;
    saved.current = true;
    void store();
  });
  const retrySave = () => {
    if (!storing) void store();
  };
  // not stored (the server down): the first Enter or Esc (a pad's A or B) says so, the second leaves
  const unsaved = recording && save !== null && 'error' in save;
  const leave = useTwoPress(onBack);
  const back = unsaved ? leave.press : onBack;

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

  // The play's lane keys and pad lanes: pressed out of habit as the result shows, they only show it all.
  const laneKeys = new Set([...bindingsFor(settings, meta.keyMode), ...secondBindingsFor(settings, meta.keyMode).filter((c): c is string => c !== null)]);
  const padLanes = new Set(padBindingsFor(settings, meta.keyMode).filter((c): c is string => c !== null));
  // with a lane on Shift a new lane order is the button's alone
  const shiftLane = shiftIsLane(laneKeys);
  // keys held off as the result showed (see MIN_GUARD_MS), until they are let go
  const heldOff = useRef(new Set<string>());

  // Enter continues to the song select (the editor, for its test plays), as on the commercial
  // games' result screens; Esc too, once the details are closed. R or F2 (the in-play retry key;
  // a pad's X sends R) plays again on the same placement, Shift+R on a new one,
  // F7 exports the replay, Space opens the details. A held key does nothing more, a focused button
  // takes its own Enter, and any key or click shows the whole result at once (and only that, early
  // on: see MIN_GUARD_MS).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const early = performance.now() < guardUntil;
      settle();
      // kept from a focused button (Enter, the pad's A) and from the menu bridge (which moves the
      // focus with an arrow or Tab left alone, and repeats a held d-pad)
      if (early && (GUARDED_KEYS.has(e.code) || isLaneKey(e.code, padCodeOf(e), laneKeys, padLanes))) {
        e.preventDefault();
        heldOff.current.add(e.code);
        return;
      }
      if (e.repeat && heldOff.current.has(e.code)) {
        e.preventDefault();
        return;
      }
      heldOff.current.delete(e.code);
      if (e.code === 'F7') {
        e.preventDefault();
        if (!e.repeat) exportReplay();
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
        else back();
      } else if (e.code === 'Enter' && !ownsEnter(e.target)) {
        e.preventDefault();
        back();
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

  const lampText = aided ?? result.lamp;
  const lampCls = aided ? 'aided' : lampClass(result.lamp);
  const lamp = (testId?: string) => (
    <span className={`lamp-text lamp-${lampCls}`}>
      {!aided && <LampMark />}
      <span className={`lamp ${lampCls}`} data-testid={testId} data-lamp={testId ? result.lamp : undefined}>
        {lampText}
      </span>
    </span>
  );
  // the tier and its level, and the key mode: leaning plates as on the song select
  const plates = (small: boolean) => (
    <span className={`result-plates${small ? ' small' : ''}`}>
      <span className="result-tier" style={{ ['--diff' as string]: chip.color } as CSSProperties}>
        <span>{chip.label}</span>
        {meta.level > 0 && <b className="num">{meta.level}</b>}
      </span>
      <span className="result-mode">
        <span>{meta.keyMode}</span>
      </span>
    </span>
  );
  // how it was played, where that is not the default: the score rule, the placement, the judgement, autoplay or a replay
  const rulesLine = [
    rules.label,
    played.placement !== 'OFF' ? `${placement.label}${placement.laneOrder ? ` ${placement.laneOrder}` : ''}` : null,
    played.judgementMode !== 'NORMAL' ? modeLabel : null,
    mode,
  ].filter((v): v is string => !!v);
  const keyOf = (key: string, pad?: string) => (padInput ? (pad ? <kbd>{pad}</kbd> : null) : <kbd>{key}</kbd>);
  // the score where RATE leads, else the rate; and how far the next grade is
  const sideLine = [next ? nextGradeText(next, rules.scoring) : null].filter((v): v is string => !!v);

  return (
    <div className="result-screen screen-enter" data-testid="result-screen" data-settled={settled}>
      {song && <Backdrop song={song} />}
      <TopBar name={details ? '결과 · 상세' : '결과'}>
        {exported && (
          <span className="topbar-note" role="status" data-testid="replay-exported">
            리플레이를 파일로 내보냈습니다
          </span>
        )}
      </TopBar>
      <div className="result-body">
        {details ? (
          <section className="result-details" data-testid="result-details-panel">
            {/* what the summary showed, in a line: the details take its place */}
            <div className="result-summary" data-testid="result-summary">
              <span className="summary-art">{song ? <SongArt song={song} size={48} /> : <Disc size={48} />}</span>
              <span className="summary-song">
                <b title={meta.title}>{meta.title}</b>
                <span>{meta.artist || '알 수 없는 아티스트'}</span>
              </span>
              {plates(true)}
              <span className="summary-figures">
                {lamp()}
                <span>
                  <span className="label">{rules.scoring === 'exscore' ? '랭크' : '등급'}</span> <b className="num">{result.grade}</b>
                </span>
                <span>
                  <span className="label">{headlineLabel}</span> <b className="num">{headlineValue}</b>
                </span>
                <span>
                  <span className="label">{rules.missLabel}</span> <b className="num">{result.breaks.toLocaleString('en-US')}</b>
                </span>
              </span>
            </div>
            <div className="details-grid">
              <div className="details-timing">
                <h2>타이밍</h2>
                <TimingSummary mean={result.meanErrorMs} std={result.stdErrorMs} fast={result.fast} slow={result.slow} />
                <TimingSpread hits={result.hits} median={result.medianErrorMs} rangeMs={windows.outerMs} />
                {request.replay && outcome.offsets && (
                  <p className="details-note">
                    녹화 때 판정 오프셋 {offsetText(outcome.offsets.input)}
                    {outcome.offsets.song !== 0 && ` · 곡 오프셋 ${offsetText(outcome.offsets.song)}`}
                  </p>
                )}
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
              <div className="details-side">
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
                      <b className="num">{c.count.toLocaleString('en-US')}</b>
                    </span>
                  ))}
                  <span className={result.breaks === 0 ? 'zero' : ''}>
                    <span className="g-break">BREAK</span>
                    <b className="num">{result.breaks.toLocaleString('en-US')}</b>
                  </span>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <>
            <div className="result-top">
              <section className="result-left">
                <div className="result-hero">
                  <div className="hero-art">{song ? <SongArt song={song} size={232} fit /> : <Disc size={232} fit />}</div>
                  <div className="result-song">
                    <p className="album">{song?.album ?? ''}</p>
                    <h1 title={meta.title}>{meta.title}</h1>
                    <p className="artist">{meta.artist || '알 수 없는 아티스트'}</p>
                    <span className="result-song-foot">
                      {plates(false)}
                      <span className="result-rules" data-testid="result-rules">
                        {rulesLine.map((t, k) =>
                          played.placement !== 'OFF' && t.startsWith(placement.label) ? (
                            <span key={k} data-testid="result-placement" data-seed={placement.seed}>
                              {t}
                            </span>
                          ) : (
                            <span key={k}>{t}</span>
                          ),
                        )}
                      </span>
                      {practice && (
                        <span className="record-note">
                          {request.fromEditor ? '에디터 테스트' : `연습 모드${outcome.loop ? ` · ${outcome.loop}번째 반복` : ''} · ${playbackRateText(practice.rate)}`} · 기록되지 않습니다
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                <dl className="judge-cells" data-testid="grade-table">
                  {judgeCells(result.rows).map((c) => (
                    <div key={c.label} className={c.count === 0 ? 'zero' : ''}>
                      <dt className={c.cls}>{c.label}</dt>
                      <dd className="num" data-testid={c.cls === 'g-break' ? 'result-breaks' : undefined}>
                        {c.count.toLocaleString('en-US')}
                      </dd>
                    </div>
                  ))}
                </dl>
                <dl className="result-stats">
                  <div>
                    <dt>MAX COMBO</dt>
                    <dd className="num">
                      {result.maxCombo.toLocaleString('en-US')} <small>/ {result.maxPossibleCombo.toLocaleString('en-US')}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>FAST · SLOW</dt>
                    <dd className="num">
                      <span className="fast">{result.fast}</span> · <span className="slow">{result.slow}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>게이지</dt>
                    <dd className="num">
                      {result.failed ? <span className="failed-at">실패 {formatTime(result.failedAtMs ?? 0)}</span> : `${Math.round(result.gauge)}%`} <small>{result.gaugeLabel}</small>
                    </dd>
                  </div>
                  {result.fever.enabled ? (
                    <div data-testid="result-fever">
                      <dt>FEVER 보너스</dt>
                      <dd className="num">
                        +{result.fever.bonus.toLocaleString('en-US')}{' '}
                        <small>
                          ×{result.fever.bestMultiplier} · {result.fever.activations}회
                        </small>
                      </dd>
                    </div>
                  ) : (
                    // the notes as the song select counts them; the judgements add the long notes' ends, the combo their ticks too
                    <div>
                      <dt>NOTES</dt>
                      <dd className="num" data-testid="result-notes">
                        {chart.notes.length.toLocaleString('en-US')}
                        {notesExtra && <small> {notesExtra}</small>}
                      </dd>
                    </div>
                  )}
                </dl>
              </section>

              <section className="result-outcome">
                <p className={`result-lamp-line ${settled ? '' : 'stamp'}`}>
                  {lamp('result-lamp')}
                  {/* the record's lines keep their place from the start, so nothing moves when they show */}
                  {recording && (
                    <span className="lamp-change" data-testid="lamp-change">
                      {recorded?.lampUp && (
                        <>
                          램프 갱신 <span className={`lamp ${lampClass(recorded.lampUp[0])}`}>{recorded.lampUp[0]}</span> →{' '}
                          <span className={`lamp ${lampClass(recorded.lampUp[1])}`}>{recorded.lampUp[1]}</span>
                        </>
                      )}
                    </span>
                  )}
                </p>
                <div className={`result-figures ${settled ? '' : 'stamp'}`}>
                  <div className="result-grade">
                    {rules.scoring === 'exscore' ? (
                      <span className="label">랭크 · BMS 기준</span>
                    ) : (
                      <span className="label" title="EZ2ON REBOOT : R의 등급 기준을 100만 점 만점으로 옮긴 값">
                        등급
                      </span>
                    )}
                    <b className="num" data-testid="result-grade">
                      {result.grade}
                    </b>
                  </div>
                  <div className="result-headline">
                    <span className="label">{headlineLabel}</span>
                    <span className="num" data-testid={rateFirst ? 'result-rate' : 'result-score'}>
                      {headlineValue}
                      {rules.scoring === 'exscore' && <small> / {result.exMax.toLocaleString('en-US')}</small>}
                    </span>
                  </div>
                </div>
                <div className="result-record">
                  {recordTag && (
                    <span className="record-tag" data-testid="record-tag">
                      <span>{recordTag}</span>
                    </span>
                  )}
                  {recording && (
                    <RecordLine
                      save={settled ? save : null}
                      scoring={rules.scoring}
                      missLabel={rules.missLabel}
                      modeLabel={played.judgementMode !== 'NORMAL' ? played.judgementMode : null}
                      storing={storing}
                      onRetry={thenBack(retrySave)}
                    />
                  )}
                </div>
                <p className="next-grade" data-testid="next-grade-line">
                  {sideLine.length > 0 && <span data-testid="next-grade">{sideLine[0]}</span>}
                  {rateFirst ? (
                    <span>
                      점수 <span data-testid="result-score">{result.score.toLocaleString('en-US')}</span>
                    </span>
                  ) : (
                    <span>
                      RATE <span data-testid="result-rate">{rateText(result.rate)}</span>
                    </span>
                  )}
                </p>
              </section>
            </div>
            <RunPanel chart={chart} result={result} gauge={gauge} startMs={startMs} endMs={endMs} />
          </>
        )}
        {unsaved && leave.armed && (
          <p className="error result-unsaved" role="status" data-testid="result-unsaved">
            기록이 저장되지 않았습니다 · 한 번 더 누르면 나갑니다
          </p>
        )}
      </div>

      {/* the keys of the screen, each a button too; the main one (back) at the end, as the song select's 플레이 */}
      <footer className="hintbar result-keys">
        <span className="hint-main">
          <button className="hint-item" data-testid="result-retry" onClick={() => onRetry(false)}>
            {keyOf('R', 'X')}
            <span>{randomPlacement ? '같은 배치로 다시' : '다시 하기'}</span>
          </button>
          {randomPlacement && (
            <button className="hint-item" data-testid="result-retry-new" onClick={() => onRetry(true)}>
              {!shiftLane && !padInput && (
                <>
                  <kbd>Shift</kbd>
                  <kbd>R</kbd>
                </>
              )}
              <span>새 배치로 다시</span>
            </button>
          )}
          <button className={`hint-item${details ? ' active' : ''}`} data-testid="result-details" aria-expanded={details} onClick={thenBack(toggleDetails)}>
            {keyOf('Space')}
            <span>{details ? '상세 닫기' : '상세'}</span>
          </button>
          {replay && (
            <button className="hint-item minor" data-testid="download-replay" onClick={thenBack(exportReplay)}>
              {keyOf('F7')}
              <span>리플레이 내보내기</span>
            </button>
          )}
        </span>
        <span className="hint-end">
          {details && (
            <span className="hint-item">
              {keyOf('Esc', 'B')}
              <span>상세 닫기</span>
            </span>
          )}
          <button ref={backButton} className="hint-item main" data-testid="result-back" onClick={back} {...leave.buttonProps}>
            <span className="main-in">
              {keyOf('Enter', 'A')}
              <span>{backLabel}</span>
            </span>
          </button>
        </span>
      </footer>
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
 * stored, or why not with 다시 저장. The line keeps its place until then.
 */
function RecordLine({
  save,
  scoring,
  missLabel,
  modeLabel,
  storing,
  onRetry,
}: {
  save: SaveState | null;
  scoring: 'rate' | 'weighted' | 'exscore';
  missLabel: string;
  modeLabel: string | null;
  storing: boolean;
  onRetry: () => void;
}) {
  if (!save) return <p className="record-line" />;
  if ('error' in save) {
    return (
      <p className="record-line error" data-testid="save-state">
        기록을 저장하지 못했습니다: {save.error}
        <button className="small" data-testid="save-retry" disabled={storing} onClick={onRetry}>
          {storing ? '저장하는 중…' : '다시 저장'}
        </button>
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
 * The song at a glance, and only what tells how it went: the gauge (its clear line dashed), where a
 * BREAK came, and under it each section with the accuracy of the notes in it.
 */
function RunPanel({ chart, result, gauge, startMs, endMs }: { chart: Chart; result: SessionResult; gauge: GaugeRule; startMs: number; endMs: number }) {
  const span = Math.max(1, endMs - startMs);
  const xs = (t: number) => ((Math.min(Math.max(t, startMs), endMs) - startMs) / span) * STRIP_W;
  const x = (t: number) => xs(t).toFixed(1);
  const sections = sectionScores(chart, result.judgements, startMs, endMs);
  const rules = rulesetConfigs[result.ruleset];
  // the gauge from its foot (0%) to near the top (100%)
  const gy = (v: number) => STRIP_H - 2 - (v / 100) * (STRIP_H - 6);
  const gaugeEnd = result.failedAtMs !== null ? xs(result.failedAtMs) : STRIP_W;
  return (
    <section className="run-panel">
      <h2>
        <span>게이지와 {rules.missLabel}</span>
        <span className="run-legend">
          <span className="legend-gauge">
            — 게이지 {result.gaugeLabel}
            {result.failedAtMs !== null && ` · ${formatTime(result.failedAtMs)}에 실패`}
          </span>
          <span className="legend-break">
            | {rules.missLabel} {result.breaks.toLocaleString('en-US')}
          </span>
        </span>
      </h2>
      <div className="run-strip">
        <svg viewBox={`0 0 ${STRIP_W} ${STRIP_H}`} preserveAspectRatio="none" role="img" aria-label="게이지와 BREAK가 난 곳">
          {!gauge.failAtZero && <line className="clear-line" x1={0} x2={STRIP_W} y1={gy(gauge.clear)} y2={gy(gauge.clear)} />}
          {result.breakTimes.length > 0 && <path className="break-mark" d={result.breakTimes.map((t) => `M${x(t)} ${STRIP_H}V0`).join('')} />}
          <polyline className="gauge" data-testid="run-gauge" points={gaugePoints(result.gaugeHistory, xs, gy, gaugeEnd)} />
          {result.failedAtMs !== null && <rect className="after-fail" x={x(result.failedAtMs)} y={0} width={STRIP_W} height={STRIP_H} />}
          {result.failedAtMs !== null && <line className="fail-line" x1={x(result.failedAtMs)} x2={x(result.failedAtMs)} y1={0} y2={STRIP_H} />}
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
              <b className="num">{accuracyLabel(s.accuracy)}</b>
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
