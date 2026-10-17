import { useEffect, useRef, useState } from 'react';
import { getAudioEngine } from '../audio/AudioEngine';
import { clickBeatTimes, clickTrackBuffer, type ClickTrackSpec } from '../audio/clickTrack';
import type { Settings } from '../settings/settings';

interface Props {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onBack: () => void;
}

const SPEC: ClickTrackSpec = { bpm: 120, firstBeatMs: 1500, beats: 40, beatsPerMeasure: 4, tailMs: 1000 };
const BEATS = clickBeatTimes(SPEC);
const WARMUP_BEATS = 4;
const MAX_ERROR_MS = 250;

interface Stats {
  count: number;
  mean: number | null;
  std: number | null;
}

function stats(errors: number[]): Stats {
  if (errors.length === 0) return { count: 0, mean: null, std: null };
  const mean = errors.reduce((a, b) => a + b, 0) / errors.length;
  const std = errors.length > 1 ? Math.sqrt(errors.reduce((a, b) => a + (b - mean) ** 2, 0) / (errors.length - 1)) : null;
  return { count: errors.length, mean, std };
}

/** Tap any key on the metronome; the mean error becomes the judgement offset. */
export function CalibrationScreen({ settings, onSettingsChange, onBack }: Props) {
  const [running, setRunning] = useState(false);
  const [errors, setErrors] = useState<number[]>([]);
  const [beatFlash, setBeatFlash] = useState(-1);
  const rafRef = useRef(0);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    getAudioEngine().stop();
  }, []);

  useEffect(() => {
    if (!running) return;
    const engine = getAudioEngine();
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.code === 'Escape') return;
      e.preventDefault();
      const t = engine.songTimeAtPerf(e.timeStamp);
      let best = 0;
      for (let i = 1; i < BEATS.length; i++) if (Math.abs(BEATS[i] - t) < Math.abs(BEATS[best] - t)) best = i;
      const err = t - BEATS[best];
      if (best >= WARMUP_BEATS && Math.abs(err) <= MAX_ERROR_MS) setErrors((prev) => [...prev, err]);
    };
    const tick = (now: number) => {
      engine.clock.sample();
      const t = engine.songTimeAtPerf(now);
      let idx = -1;
      for (let i = 0; i < BEATS.length; i++) if (t >= BEATS[i] && t < BEATS[i] + 120) idx = i;
      setBeatFlash(idx);
      if (t > BEATS[BEATS.length - 1] + 800) setRunning(false);
      else rafRef.current = requestAnimationFrame(tick);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      cancelAnimationFrame(rafRef.current);
    };
  }, [running]);

  const start = async () => {
    const engine = getAudioEngine();
    await engine.unlock();
    engine.setBuffer(clickTrackBuffer(engine.ctx, SPEC));
    engine.setMusicVolume(settings.musicVolume);
    engine.start(0, 300);
    setErrors([]);
    setRunning(true);
  };

  const s = stats(errors);
  const suggestion = s.mean !== null ? Math.round(s.mean) : null;

  return (
    <div className="menu-screen" data-testid="calibration-screen">
      <header className="menu-header">
        <h1>오프셋 캘리브레이션</h1>
        <p className="tagline">메트로놈 소리에 맞춰 아무 키나 누르세요. 처음 {WARMUP_BEATS}박은 연습으로 제외합니다.</p>
      </header>
      <section className="panel calibration">
        <div className={`beat-lamp ${beatFlash >= 0 ? 'on' : ''} ${beatFlash % 4 === 0 ? 'accent' : ''}`} />
        <div className="stat-row"><span>입력 수</span><span data-testid="calib-count">{s.count}</span></div>
        <div className="stat-row">
          <span>평균 오차</span>
          <span data-testid="calib-mean">{s.mean === null ? '-' : `${s.mean > 0 ? '+' : ''}${s.mean.toFixed(1)}ms`}</span>
        </div>
        <div className="stat-row"><span>표준편차</span><span>{s.std === null ? '-' : `${s.std.toFixed(1)}ms`}</span></div>
        <div className="stat-row"><span>현재 판정 오프셋</span><span>{settings.inputOffsetMs}ms</span></div>
        <div className="row buttons">
          <button className="primary" onClick={start} disabled={running}>{running ? '측정 중…' : '시작'}</button>
          <button
            disabled={suggestion === null || s.count < 8}
            onClick={() => suggestion !== null && onSettingsChange({ ...settings, inputOffsetMs: suggestion })}
          >
            {suggestion === null ? '적용' : `${suggestion}ms로 적용`}
          </button>
          <button onClick={onBack}>돌아가기</button>
        </div>
        <p className="hint">평균 오차가 +면 늦게, −면 빨리 친 것입니다. 적용하면 판정 시 그만큼 보정합니다.</p>
      </section>
    </div>
  );
}
