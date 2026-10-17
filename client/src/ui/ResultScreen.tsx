import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { SessionResult } from '../engine/session';
import type { Settings } from '../settings/settings';
import type { PlayRequest } from './App';
import { gradeClass } from './Hud';

interface Props {
  request: PlayRequest;
  result: SessionResult;
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onRetry: () => void;
  onBack: () => void;
}

const LAMP_CLASS: Record<SessionResult['lamp'], string> = {
  'PERFECT PLAY': 'perfect',
  'MAX COMBO': 'maxcombo',
  CLEAR: 'clear',
  FAILED: 'failed',
};

export function ResultScreen({ request, result, settings, onSettingsChange, onRetry, onBack }: Props) {
  const { chart } = request;
  const suggestion = result.meanErrorMs !== null && result.hits.length >= 10 ? Math.round(result.meanErrorMs) : null;
  const [saveState, setSaveState] = useState<string | null>(null);
  const saved = useRef(false);

  // Store the play once (generated charts only; autoplay and the sync test are not records).
  useEffect(() => {
    const songId = chart.meta.songId;
    if (saved.current || request.autoPlay || !songId) return;
    saved.current = true;
    (async () => {
      try {
        const before = (await api.song(songId)).records?.find((r) => r.chartId === chart.meta.chartId);
        await api.saveScore({
          chartId: chart.meta.chartId,
          songId,
          score: result.score,
          rate: Math.round(result.rate * 100) / 100,
          maxCombo: result.maxCombo,
          lamp: result.lamp,
          judgementMode: settings.judgementMode,
          breaks: result.breaks,
          detail: { fast: result.fast, slow: result.slow, meanErrorMs: result.meanErrorMs },
        });
        if (!before) setSaveState('첫 기록이 저장되었습니다');
        else if (result.score > before.score) setSaveState(`최고 기록 갱신! (+${(result.score - before.score).toLocaleString('en-US')})`);
        else setSaveState(`기록 저장됨 · 최고 ${before.score.toLocaleString('en-US')}`);
      } catch (e) {
        setSaveState(`기록을 저장하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
  }, [chart, request.autoPlay, result, settings.judgementMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'KeyR') onRetry();
      if (e.code === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onRetry, onBack]);

  return (
    <div className="result-screen" data-testid="result-screen">
      <header className="result-header">
        <div>
          <h1>{chart.meta.title}</h1>
          <p className="sub">
            {chart.meta.artist} · {chart.meta.keyMode} · {chart.meta.difficulty}
            {chart.meta.level > 0 ? ` Lv.${chart.meta.level}` : ''}
            {request.autoPlay ? ' · AUTO' : ''}
          </p>
        </div>
        <div className={`lamp ${LAMP_CLASS[result.lamp]}`} data-testid="result-lamp">{result.lamp}</div>
      </header>
      {saveState && <p className="hint save-state" data-testid="save-state">{saveState}</p>}

      <div className="result-grid">
        <section className="panel">
          <div className="big-stat">
            <span className="label">RATE</span>
            <span className="value" data-testid="result-rate">{result.rate.toFixed(2)}%</span>
          </div>
          <div className="big-stat">
            <span className="label">SCORE</span>
            <span className="value">{result.score.toLocaleString('en-US')}</span>
          </div>
          <div className="stat-row"><span>MAX COMBO</span><span>{result.maxCombo} / {result.maxPossibleCombo}</span></div>
          <div className="stat-row"><span>게이지</span><span>{Math.round(result.gauge)}%</span></div>
          <div className="stat-row"><span>FAST / SLOW</span><span>{result.fast} / {result.slow}</span></div>
          <div className="stat-row">
            <span>평균 오차</span>
            <span>
              {result.meanErrorMs === null ? '-' : `${result.meanErrorMs > 0 ? '+' : ''}${result.meanErrorMs.toFixed(1)}ms`}
              {result.stdErrorMs !== null ? ` (σ ${result.stdErrorMs.toFixed(1)}ms)` : ''}
            </span>
          </div>
        </section>

        <section className="panel">
          <h2>판정</h2>
          <table className="grade-table">
            <tbody>
              {result.counts.map((c) => (
                <tr key={c.percent}>
                  <td className={gradeClass(c.percent, false)}>{c.label}</td>
                  <td>{c.count}</td>
                </tr>
              ))}
              <tr>
                <td className="g-break">BREAK</td>
                <td data-testid="result-breaks">{result.breaks}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="panel wide">
          <h2>타이밍 분포</h2>
          <TimingHistogram result={result} />
          {suggestion !== null && !request.autoPlay && Math.abs(suggestion) >= 3 && (
            <div className="row">
              <span className="hint">
                평균적으로 {Math.abs(suggestion)}ms {suggestion > 0 ? '늦게' : '빨리'} 쳤습니다. 판정 오프셋을{' '}
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
      </div>
    </div>
  );
}

const HIST_RANGE_MS = 180;
const HIST_BINS = 36;

function TimingHistogram({ result }: { result: SessionResult }) {
  const bins = new Array(HIST_BINS).fill(0);
  for (const h of result.hits) {
    const i = Math.floor(((h.errorMs + HIST_RANGE_MS) / (2 * HIST_RANGE_MS)) * HIST_BINS);
    if (i >= 0 && i < HIST_BINS) bins[i]++;
  }
  const max = Math.max(1, ...bins);
  const w = 360;
  const h = 90;
  const bw = w / HIST_BINS;
  return (
    <svg className="histogram" viewBox={`0 0 ${w} ${h + 16}`} role="img" aria-label="타이밍 오차 분포">
      {bins.map((count, i) => {
        const center = -HIST_RANGE_MS + (i + 0.5) * ((2 * HIST_RANGE_MS) / HIST_BINS);
        const bh = (count / max) * h;
        const cls = Math.abs(center) <= 41.67 ? 'bar-max' : center < 0 ? 'bar-fast' : 'bar-slow';
        return <rect key={i} className={cls} x={i * bw + 1} y={h - bh} width={bw - 2} height={bh} />;
      })}
      <line x1={w / 2} x2={w / 2} y1={0} y2={h} className="zero-line" />
      <text x={4} y={h + 13} className="axis">FAST −{HIST_RANGE_MS}ms</text>
      <text x={w - 4} y={h + 13} className="axis" textAnchor="end">+{HIST_RANGE_MS}ms SLOW</text>
    </svg>
  );
}
