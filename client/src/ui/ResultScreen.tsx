import { useEffect, useRef, useState } from 'react';
import { api, EXPORT_LABELS, exportFormats } from '../api/client';
import { difficultyLabel, gaugeRules, judgementConfig } from '../engine/config';
import type { ReplayData } from '../engine/replay';
import { gradeClass, rulesetConfigs } from '../engine/ruleset';
import type { Settings } from '../settings/settings';
import type { PlayRequest } from './App';
import { lampClass } from './lamps';
import type { PlayOutcome } from './PlayController';
import { GaugeGraph, suggestOffset, TimelineGraph, TimingHistogram } from './ResultGraphs';

interface Props {
  request: PlayRequest;
  outcome: PlayOutcome;
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onRetry: () => void;
  onBack: () => void;
  onWatchReplay: (replay: ReplayData) => void;
  /** Generate this key mode and difficulty again with a new seed and play it (generated charts). */
  onRegenerate?: () => void;
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
  const [saveState, setSaveState] = useState<string | null>(null);
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
        if (!before) setSaveState('첫 기록이 저장되었습니다');
        else if (result.score > before.score) setSaveState(`최고 기록 갱신! (+${(result.score - before.score).toLocaleString('en-US')})`);
        else setSaveState(`기록 저장됨 · 최고 ${before.score.toLocaleString('en-US')}`);
      } catch (e) {
        setSaveState(`기록을 저장하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
  }, [meta, request.autoPlay, request.replay, practice, result, played.judgementMode, played.placement, placement.laneOrder, outcome.replay]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'KeyR') onRetry();
      if (e.code === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onRetry, onBack]);

  const mainScore = rules.scoring === 'exscore' ? result.exScore : rules.scoring === 'weighted' ? result.weightedScore : result.score;
  const lamp = practice ? 'PRACTICE' : result.lamp;
  return (
    <div className="result-screen" data-testid="result-screen">
      <header className="result-header">
        <div>
          <h1>{meta.title}</h1>
          <p className="sub">
            {meta.artist} · {meta.keyMode} · {difficultyLabel(meta)} · {judgementConfig.modes[played.judgementMode].label} · {rules.label}
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
        <div className={`lamp ${practice ? 'clear' : lampClass(result.lamp)}`} data-testid="result-lamp">{lamp}</div>
      </header>
      {saveState && <p className="hint save-state" data-testid="save-state">{saveState}</p>}

      <div className="result-grid">
        <section className="panel">
          <div className="big-stat">
            <span className="label">{rules.scoring === 'exscore' ? 'EX-SCORE' : 'SCORE'}</span>
            <span className="value" data-testid="result-score">
              {mainScore.toLocaleString('en-US')}
              {rules.scoring === 'exscore' && <small> / {result.exMax.toLocaleString('en-US')} · {result.rank}</small>}
            </span>
          </div>
          <div className="big-stat">
            <span className="label">RATE</span>
            <span className="value" data-testid="result-rate">{result.rate.toFixed(2)}%</span>
          </div>
          {rules.scoring !== 'rate' && (
            <div className="stat-row"><span>정밀 % 점수</span><span>{result.score.toLocaleString('en-US')}</span></div>
          )}
          {result.fever.enabled && (
            <div className="stat-row" data-testid="result-fever">
              <span>FEVER 보너스</span>
              <span>+{result.fever.bonus.toLocaleString('en-US')} (최고 x{result.fever.bestMultiplier} · {result.fever.activations}회)</span>
            </div>
          )}
          <div className="stat-row"><span>MAX COMBO</span><span>{result.maxCombo} / {result.maxPossibleCombo}</span></div>
          <div className="stat-row">
            <span>게이지 ({result.gaugeLabel})</span>
            <span>{result.failed ? `실패 · ${formatTime(result.failedAtMs ?? 0)}` : `${Math.round(result.gauge)}%`}</span>
          </div>
          <div className="stat-row"><span>FAST / SLOW</span><span>{result.fast} / {result.slow}</span></div>
          <div className="stat-row">
            <span>평균 / 중앙값 오차</span>
            <span>
              {signedMs(result.meanErrorMs)} / {signedMs(result.medianErrorMs)}
              {result.stdErrorMs !== null ? ` (σ ${result.stdErrorMs.toFixed(1)}ms)` : ''}
            </span>
          </div>
        </section>

        <section className="panel">
          <h2>판정 · {rules.label}</h2>
          <table className="grade-table" data-testid="grade-table">
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.label}>
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
                      <tr key={c.percent}>
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
            <div className="row" data-testid="offset-suggestion">
              <span className="hint">
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

      <div className="row buttons center">
        <button className="primary" data-testid="result-retry" onClick={onRetry}>다시 하기 <kbd>Enter</kbd></button>
        <button data-testid="result-back" onClick={onBack}>메뉴로 <kbd>Esc</kbd></button>
        {onRegenerate && (
          <button data-testid="result-regenerate" onClick={onRegenerate}>
            새 패턴으로 다시
          </button>
        )}
        {meta.songId &&
          exportFormats(meta.keyMode).map((f) => (
            <a key={f} className="button" href={api.exportUrl(meta.chartId, f)} download data-testid={`result-export-${f}`}>
              {EXPORT_LABELS[f]} 내보내기
            </a>
          ))}
        {replay && (
          <>
            <button data-testid="watch-replay" onClick={() => onWatchReplay(replay)}>
              리플레이 보기
            </button>
            <button data-testid="download-replay" onClick={() => downloadReplay(replay, meta.title)}>
              리플레이 파일 저장
            </button>
          </>
        )}
      </div>
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
