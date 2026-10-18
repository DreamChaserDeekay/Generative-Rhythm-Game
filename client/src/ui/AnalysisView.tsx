import { useEffect, useRef, useState } from 'react';
import { api, type AnalysisResult } from '../api/client';
import { canvasFont, token } from './theme';

const PX_PER_SECOND = 60;
const HEIGHT = 150;
// colour tokens: onsets by stem (or by band without stems), and section groups A, B, C …
const BAND_COLORS = { low: '--stem-bass', mid: '--stem-vocals', high: '--stem-other' } as const;
const STEM_COLORS: Record<string, string> = { drums: '--stem-drums', bass: '--stem-bass', vocals: '--stem-vocals', other: '--stem-other' };
const STEM_LABELS: Record<string, string> = { drums: '드럼', bass: '베이스', vocals: '보컬', other: '멜로디·기타' };
const SECTION_COLORS = ['--stem-drums', '--stem-other', '--stem-vocals', '--stem-bass', '--g-mid', '--g-high'];

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
      ctx.fillText(`${s.label} (${s.group})${s.leader ? ` · ${STEM_LABELS[s.leader] ?? s.leader}` : ''}`, x(s.t) + 4, 10);
    });
    const mid = 20 + (HEIGHT - 20) / 2 - 12;
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
      ctx.lineTo(x(b.t) + 0.5, HEIGHT - 24);
      ctx.stroke();
    }
    const rowY = { low: HEIGHT - 8, mid: HEIGHT - 14, high: HEIGHT - 20 } as const;
    const colors = Object.fromEntries([...Object.values(STEM_COLORS), ...Object.values(BAND_COLORS)].map((name) => [name, token(name)]));
    for (const o of analysis.onsets) {
      ctx.fillStyle = colors[o.source ? STEM_COLORS[o.source] : BAND_COLORS[o.band]];
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
        {analysis.stems ? (
          <>
            <span>스템 {analysis.stems.method === 'core-dsp' ? '기본 분리' : analysis.stems.method}</span>
            {analysis.stems.names.map((n) => (
              <span key={n} className="dot" style={{ ['--dot' as string]: `var(${STEM_COLORS[n]})` }}>
                {STEM_LABELS[n] ?? n}
              </span>
            ))}
          </>
        ) : (
          <>
            <span className="dot" style={{ ['--dot' as string]: `var(${BAND_COLORS.low})` }}>저역</span>
            <span className="dot" style={{ ['--dot' as string]: `var(${BAND_COLORS.mid})` }}>중역</span>
            <span className="dot" style={{ ['--dot' as string]: `var(${BAND_COLORS.high})` }}>고역</span>
          </>
        )}
        <span className="dot" style={{ ['--dot' as string]: 'var(--accent)' }}>마디선</span>
      </div>
      <div className="analysis-scroll">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
