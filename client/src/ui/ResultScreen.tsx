import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, EXPORT_LABELS, exportFormats } from '../api/client';
import { gaugeRules, judgementConfig } from '../engine/config';
import type { ReplayData } from '../engine/replay';
import { gradeClass, rulesetConfigs } from '../engine/ruleset';
import type { Settings } from '../settings/settings';
import type { PlayRequest } from './App';
import { difficultyChip } from './difficultyChip';
import { lampClass } from './lamps';
import type { PlayOutcome } from './PlayController';
import { GaugeGraph, suggestOffset, TimelineGraph, TimingHistogram } from './ResultGraphs';
import { HintBar, TopBar } from './shell';

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

/** Elements that act on Enter themselves (a focused button keeps its own Enter). */
function ownsEnter(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('button, a[href], input, select, textarea, summary') !== null;
}

function signedMs(v: number | null): string {
  return v === null ? '-' : `${v > 0 ? '+' : ''}${v.toFixed(1)}ms`;
}

export function ResultScreen({ request, outcome, settings, onSettingsChange, onRetry, onBack, onWatchReplay, onRegenerate }: Props) {
  const { result, chart, placement, practice } = outcome;
  // what was played: the recorded settings of a replay, or the current ones
  const played = request.replay?.settings ?? outcome.replay?.settings ?? settings;
  const replay = outcome.replay ?? request.replay ?? null;
  const meta = request.chart.meta;
  const rules = rulesetConfigs[result.ruleset];
  const suggestion = (() => {
    const s = suggestOffset(result.hits);
    return s === null ? null : Math.round(s);
  })();
  const [saveState, setSaveState] = useState<{ text: string; ok: boolean } | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const saved = useRef(false);
  const gauge = Object.values(gaugeRules).find((g) => g.label === result.gaugeLabel) ?? gaugeRules.NORMAL;
  const startMs = practice ? practice.startMs : 0;
  const endMs = practice ? practice.endMs : Math.max(meta.durationMs ?? 0, ...chart.notes.map((n) => n.endT ?? n.t), 1);

  // Store the play once (generated charts only; autoplay, practice and the sync test are not records).
  useEffect(() => {
    const songId = meta.songId;
    if (saved.current || request.autoPlay || request.replay || practice || !songId) return;
    saved.current = true;
    (async () => {
      try {
        const before = (await api.song(songId)).records?.find((r) => r.chartId === meta.chartId);
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
            gauge: result.gaugeLabel,
            placement: played.placement,
            laneOrder: placement.laneOrder,
            feverBonus: result.fever.bonus,
            failedAtMs: result.failedAtMs,
          },
          replay: outcome.replay,
        });
        if (!before) setSaveState({ text: '첫 기록이 저장되었습니다', ok: true });
        else if (result.score > before.score) setSaveState({ text: `최고 기록 갱신! (+${(result.score - before.score).toLocaleString('en-US')})`, ok: true });
        else setSaveState({ text: `기록 저장됨 · 최고 ${before.score.toLocaleString('en-US')}`, ok: true });
      } catch (e) {
        setSaveState({ text: `기록을 저장하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`, ok: false });
      }
    })();
  }, [meta, request.autoPlay, request.replay, practice, result, played.judgementMode, played.placement, placement.laneOrder, outcome.replay]);

  // Enter continues to the song select, as on the commercial games' result screens (Esc too);
  // R or F2 (the in-play retry key) plays again. A held key does nothing more, and a focused
  // button takes its own Enter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) {
        if (e.code === 'Enter') e.preventDefault();
        return;
      }
      if (e.code === 'KeyR' || e.code === 'F2') {
        e.preventDefault();
        onRetry();
      } else if (e.code === 'Escape' || (e.code === 'Enter' && !ownsEnter(e.target))) {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onRetry, onBack]);

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

  const mainScore = rules.scoring === 'exscore' ? result.exScore : rules.scoring === 'weighted' ? result.weightedScore : result.score;
  // autoplay and practice earn nothing: a plain label in place of the lamp (the lamp the run
  // reached stays on data-lamp)
  const aided = practice ? 'PRACTICE' : request.autoPlay ? 'AUTO' : null;
  const lamp = aided ?? result.lamp;
  const chip = difficultyChip(meta);
  // DJMAX's "정밀 %" puts the rate first; the other rulesets lead with their score
  const rateFirst = rules.scoring === 'rate';
  const scoreStat = (
    <div className={`result-stat ${rateFirst ? 'second' : 'main'}`}>
      <span className="label">{rules.scoring === 'exscore' ? 'EX-SCORE' : 'SCORE'}</span>
      <span className="value" data-testid="result-score">
        {mainScore.toLocaleString('en-US')}
        {rules.scoring === 'exscore' && <small> / {result.exMax.toLocaleString('en-US')} · {result.rank}</small>}
      </span>
    </div>
  );
  const rateStat = (
    <div className={`result-stat ${rateFirst ? 'main' : 'second'}`}>
      <span className="label">RATE</span>
      <span className="value" data-testid="result-rate">{result.rate.toFixed(2)}%</span>
    </div>
  );
  return (
    <div className="result-screen screen-enter" data-testid="result-screen">
      <TopBar name="결과" />
      <div className="screen-body">
        <header className="result-header">
          <div className="result-title">
            <div className="result-chip" style={{ ['--diff' as string]: chip.color } as CSSProperties}>
              <span className="tier">{chip.label}</span>
              {chip.level && <strong>{chip.level}</strong>}
              <span className="mode">{meta.keyMode}</span>
            </div>
            <h1>{meta.title}</h1>
            <p className="sub">
              {meta.artist} · {judgementConfig.modes[played.judgementMode].label} · {rules.label}
              {played.placement !== 'OFF' ? ` · ${placement.label}${placement.laneOrder ? ` ${placement.laneOrder}` : ''}` : ''}
              {request.autoPlay ? ' · AUTO' : ''}
              {request.replay ? ' · REPLAY' : ''}
            </p>
            {practice && (
              <p className="sub">
                연습 모드 · {practice.rate.toFixed(2)}배속 · 기록되지 않습니다
              </p>
            )}
          </div>
          <div className="result-lamp">
            <div className={`lamp ${aided ? 'aided' : lampClass(result.lamp)}`} data-testid="result-lamp" data-lamp={result.lamp}>{lamp}</div>
            {saveState && (
              <p className={`save-state ${saveState.ok ? '' : 'error'}`} data-testid="save-state">
                {saveState.text}
              </p>
            )}
          </div>
        </header>

        <div className="result-grid">
          <section className="panel result-summary">
            {rateFirst ? rateStat : scoreStat}
            {rateFirst ? scoreStat : rateStat}
            <div className="stat-list">
              {rules.scoring !== 'rate' && (
                <div className="stat-row"><span>정밀 % 점수</span><span>{result.score.toLocaleString('en-US')}</span></div>
              )}
              <div className="stat-row"><span>MAX COMBO</span><span>{result.maxCombo} / {result.maxPossibleCombo}</span></div>
              <div className="stat-row">
                <span>게이지 ({result.gaugeLabel})</span>
                <span>{result.failed ? `실패 · ${formatTime(result.failedAtMs ?? 0)}` : `${Math.round(result.gauge)}%`}</span>
              </div>
              {result.fever.enabled && (
                <div className="stat-row" data-testid="result-fever">
                  <span>FEVER 보너스</span>
                  <span>+{result.fever.bonus.toLocaleString('en-US')} (최고 x{result.fever.bestMultiplier} · {result.fever.activations}회)</span>
                </div>
              )}
              <div className="stat-row"><span>FAST / SLOW</span><span>{result.fast} / {result.slow}</span></div>
              <div className="stat-row">
                <span>평균 / 중앙값 오차</span>
                <span>
                  {signedMs(result.meanErrorMs)} / {signedMs(result.medianErrorMs)}
                  {result.stdErrorMs !== null ? ` (σ ${result.stdErrorMs.toFixed(1)}ms)` : ''}
                </span>
              </div>
            </div>
          </section>

          <section className="panel">
            <h2>판정 · {rules.label}</h2>
            <table className="grade-table" data-testid="grade-table">
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.label} className={r.count === 0 ? 'zero' : ''}>
                    <td className={r.cls}>{r.label}</td>
                    <td data-testid={r.cls === 'g-break' ? 'result-breaks' : undefined}>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.ruleset !== 'RESPECT' && (
              <>
                <button className="small" onClick={() => setShowDetail((v) => !v)}>{showDetail ? 'DJMAX % 접기' : 'DJMAX % 보기'}</button>
                {showDetail && (
                  <table className="grade-table detail">
                    <tbody>
                      {result.counts.map((c) => (
                        <tr key={c.percent} className={c.count === 0 ? 'zero' : ''}>
                          <td className={gradeClass(c.percent, false)}>{c.label}</td>
                          <td>{c.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </section>

          <section className="panel wide">
            <h2>게이지</h2>
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
          </section>

          <section className="panel wide">
            <h2>타이밍 분포</h2>
            <TimingHistogram hits={result.hits} median={result.medianErrorMs} />
            {suggestion !== null && !request.autoPlay && Math.abs(suggestion) >= 3 && (
              <div className="row offset-suggestion" data-testid="offset-suggestion">
                <span>
                  절사 평균으로 {Math.abs(suggestion)}ms {suggestion > 0 ? '늦게' : '빨리'} 쳤습니다. 판정 오프셋을{' '}
                  {settings.inputOffsetMs + suggestion}ms로 바꾸면 보정됩니다.
                </span>
                <button onClick={() => onSettingsChange({ ...settings, inputOffsetMs: settings.inputOffsetMs + suggestion })}>
                  적용
                </button>
              </div>
            )}
          </section>
        </div>

        <div className="result-actions">
          <div className="row">
            <button className="primary" data-testid="result-back" onClick={onBack} autoFocus>계속 <kbd>Enter</kbd></button>
            <button data-testid="result-retry" onClick={onRetry}>다시 하기 <kbd>R</kbd></button>
            {onRegenerate && (
              <button data-testid="result-regenerate" disabled={regenerating} onClick={() => void regenerate()}>
                {regenerating ? '새 패턴 만드는 중…' : '새 패턴으로 다시'}
              </button>
            )}
            {regenerateError && (
              <span className="error" data-testid="result-regenerate-error">
                새 패턴을 만들지 못했습니다: {regenerateError}
              </span>
            )}
          </div>
          <div className="row">
            {replay && (
              <>
                <button className="small" data-testid="watch-replay" onClick={() => onWatchReplay(replay)}>
                  리플레이 보기
                </button>
                <button className="small" data-testid="download-replay" onClick={() => downloadReplay(replay, meta.title)}>
                  리플레이 파일 저장
                </button>
              </>
            )}
            {meta.songId && (
              <>
                <span className="label">내보내기</span>
                {exportFormats(meta.keyMode).map((f) => (
                  <a key={f} className="button small" href={api.exportUrl(meta.chartId, f)} download data-testid={`result-export-${f}`}>
                    {EXPORT_LABELS[f]}
                  </a>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
      <HintBar
        hints={[
          { keys: ['Enter'], label: '계속' },
          { keys: ['R'], label: '다시 하기' },
        ]}
        end={[{ keys: ['Esc'], label: '선곡으로' }]}
      />
    </div>
  );
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
