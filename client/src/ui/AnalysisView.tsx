import { useEffect, useRef, useState } from 'react';
import { api, type AnalysisResult } from '../api/client';

const PX_PER_SECOND = 60;
const HEIGHT = 150;
const BAND_COLORS = { low: '#ff7a59', mid: '#7cf7ff', high: '#c58bff' } as const;
const SECTION_COLORS = ['#2b3b7a', '#5a2b6e', '#1f5a52', '#6e5a2b', '#3b2b6e', '#2b5a6e'];

/** Developer view of the analysis: waveform, onsets by band, beat grid and sections. */
export function AnalysisView({ songId }: { songId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.scale(dpr, dpr);
    const x = (ms: number) => (ms / 1000) * PX_PER_SECOND;

    ctx.fillStyle = '#070b1c';
    ctx.fillRect(0, 0, width, HEIGHT);
    analysis.sections.forEach((s, i) => {
      ctx.fillStyle = SECTION_COLORS[(s.group.charCodeAt(0) - 65) % SECTION_COLORS.length] ?? SECTION_COLORS[i % SECTION_COLORS.length];
      ctx.globalAlpha = 0.35 + 0.4 * s.energy;
      ctx.fillRect(x(s.t), 0, x(s.endT) - x(s.t), 18);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#e8eeff';
      ctx.font = '11px sans-serif';
      ctx.fillText(`${s.label} (${s.group})`, x(s.t) + 4, 13);
    });
    const mid = 18 + (HEIGHT - 18) / 2 - 12;
    ctx.fillStyle = 'rgba(120, 150, 255, 0.45)';
    const { frameMs, peaks } = analysis.waveform;
    peaks.forEach((p, i) => {
      const h = p * 40;
      ctx.fillRect(x(i * frameMs), mid - h, Math.max(1, x(frameMs)), 2 * h);
    });
    for (const b of analysis.beats) {
      ctx.strokeStyle = b.isDownbeat ? 'rgba(255, 201, 79, 0.9)' : 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = b.isDownbeat ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x(b.t) + 0.5, 18);
      ctx.lineTo(x(b.t) + 0.5, HEIGHT - 24);
      ctx.stroke();
    }
    const rowY = { low: HEIGHT - 8, mid: HEIGHT - 14, high: HEIGHT - 20 } as const;
    for (const o of analysis.onsets) {
      ctx.fillStyle = BAND_COLORS[o.band];
      ctx.globalAlpha = 0.35 + 0.65 * Math.min(1, o.strength);
      ctx.fillRect(x(o.t) - 1, rowY[o.band] - 3, 2, 6);
      if (o.sustainEnd) ctx.fillRect(x(o.t), rowY[o.band] - 0.5, x(o.sustainEnd) - x(o.t), 1);
    }
    ctx.globalAlpha = 1;
  }, [analysis]);

  if (error) return <p className="error">{error}</p>;
  if (!analysis) return <p className="hint">분석 결과를 불러오는 중…</p>;
  return (
    <div className="analysis-view" data-testid="analysis-view">
      <div className="analysis-legend">
        <span>BPM {analysis.tempo.constant ? analysis.tempo.bpm.toFixed(2) : `${analysis.tempo.bpmMin.toFixed(1)}–${analysis.tempo.bpmMax.toFixed(1)}`}</span>
        <span>신뢰도 {Math.round(analysis.tempo.confidence * 100)}%</span>
        <span>온셋 {analysis.onsets.length}</span>
        <span className="dot low">저역</span>
        <span className="dot mid">중역</span>
        <span className="dot high">고역</span>
        <span className="dot down">마디선</span>
      </div>
      <div className="analysis-scroll">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
