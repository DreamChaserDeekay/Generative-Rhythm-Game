import { useEffect, useRef, useState } from 'react';
import { api, type AnalysisResult } from '../api/client';
import { context2d, whenRestored } from '../render/paintCanvas';
import { canvasFont, token } from './theme';

const PX_PER_SECOND = 60;
const HEIGHT = 150;
// colour tokens: section groups A, B, C …
const SECTION_COLORS = ['--stem-drums', '--stem-other', '--stem-vocals', '--stem-bass', '--g-mid', '--g-high'];

/** The analysis at a glance: waveform, beat grid and sections (what the chart generator does not need, the onsets, is left out). */
export function AnalysisView({ songId }: { songId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** How many times the browser handed the canvas back empty (a lost graphics process): it is drawn again. */
  const [wiped, setWiped] = useState(0);

  useEffect(() => {
    let alive = true;
    setAnalysis(null);
    api
      .analysis(songId)
      .then((a) => alive && setAnalysis(a))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [songId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analysis) return;
    const width = Math.min(30000, Math.ceil((analysis.durationMs / 1000) * PX_PER_SECOND));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = HEIGHT * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${HEIGHT}px`;
    const ctx = context2d(canvas);
    ctx.scale(dpr, dpr);
    const x = (ms: number) => (ms / 1000) * PX_PER_SECOND;

    const text = token('--text');
    ctx.fillStyle = token('--bg');
    ctx.fillRect(0, 0, width, HEIGHT);
    analysis.sections.forEach((s, i) => {
      ctx.fillStyle = token(SECTION_COLORS[(s.group.charCodeAt(0) - 65) % SECTION_COLORS.length] ?? SECTION_COLORS[i % SECTION_COLORS.length]);
      ctx.globalAlpha = 0.2 + 0.25 * s.energy;
      ctx.fillRect(x(s.t), 0, x(s.endT) - x(s.t), 20);
      ctx.globalAlpha = 1;
      ctx.fillStyle = text;
      ctx.font = canvasFont(700, '--fs-label');
      ctx.textBaseline = 'middle';
      ctx.fillText(`${s.label} (${s.group})`, x(s.t) + 4, 10);
    });
    const mid = 20 + (HEIGHT - 20) / 2;
    ctx.fillStyle = token('--text-dim');
    ctx.globalAlpha = 0.45;
    const { frameMs, peaks } = analysis.waveform;
    peaks.forEach((p, i) => {
      const h = p * 40;
      ctx.fillRect(x(i * frameMs), mid - h, Math.max(1, x(frameMs)), 2 * h);
    });
    const accent = token('--accent');
    for (const b of analysis.beats) {
      ctx.strokeStyle = b.isDownbeat ? accent : text;
      ctx.globalAlpha = b.isDownbeat ? 0.9 : 0.18;
      ctx.lineWidth = b.isDownbeat ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x(b.t) + 0.5, 20);
      ctx.lineTo(x(b.t) + 0.5, HEIGHT);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return whenRestored(canvas, () => setWiped((n) => n + 1));
  }, [analysis, wiped]);

  if (error) return <p className="error">{error}</p>;
  if (!analysis) return <p className="hint">분석 결과를 불러오는 중…</p>;
  return (
    <div className="analysis-view" data-testid="analysis-view">
      <div className="analysis-legend">
        <span>BPM {analysis.tempo.constant ? analysis.tempo.bpm.toFixed(2) : `${analysis.tempo.bpmMin.toFixed(1)}–${analysis.tempo.bpmMax.toFixed(1)}`}</span>
        <span>신뢰도 {Math.round(analysis.tempo.confidence * 100)}%</span>
        {analysis.stems && <span>스템 {analysis.stems.method === 'core-dsp' ? '기본 분리' : analysis.stems.method}</span>}
        <span className="dot" style={{ ['--dot' as string]: 'var(--accent)' }}>마디선</span>
      </div>
      <div className="analysis-scroll">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
