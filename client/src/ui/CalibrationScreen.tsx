import { useEffect, useRef, useState } from 'react';
import { getAudioEngine } from '../audio/AudioEngine';
import { clickBeatTimes, clickTrackBuffer, type ClickTrackSpec } from '../audio/clickTrack';
import { judgementConfig } from '../engine/config';
import { JudgementTable } from '../engine/judgement';
import { GamepadMenuBridge, GamepadPoller } from '../input/gamepad';
import type { Settings } from '../settings/settings';
import { HintBar, TopBar, type KeyHint } from './shell';

interface Props {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onBack: () => void;
}

const SPEC: ClickTrackSpec = { bpm: 120, firstBeatMs: 1500, beats: 40, beatsPerMeasure: 4, tailMs: 1000 };
const BEATS = clickBeatTimes(SPEC);
const WARMUP_BEATS = 4;
const MAX_ERROR_MS = 250;
/** Taps that count before an offset can be applied. */
const MIN_TAPS = 8;
/** Ticks on the rail (ms either side of the beat). */
const RAIL_TICKS = [-200, -100, 0, 100, 200];

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

/**
 * Tap any key (or pad button) on the metronome; the mean error becomes the judgement offset.
 * Esc (pad B) stops a measurement, and otherwise goes back.
 */
export function CalibrationScreen({ settings, onSettingsChange, onBack }: Props) {
  const [running, setRunning] = useState(false);
  const [errors, setErrors] = useState<number[]>([]);
  /** The last beat passed (-1 before the first) and whether it is still sounding. */
  const [beat, setBeat] = useState({ index: -1, on: false });
  const rafRef = useRef(0);
  const startButton = useRef<HTMLButtonElement>(null);
  const applyButton = useRef<HTMLButtonElement>(null);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    getAudioEngine().stop();
  }, []);

  // Between measurements the keys and the pad work the buttons; a run's end puts the focus on
  // 적용 (or 시작 when there is nothing to apply).
  useEffect(() => {
    if (running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      e.preventDefault();
      onBack();
    };
    window.addEventListener('keydown', onKey);
    const bridge = new GamepadMenuBridge();
    bridge.start();
    const target = applyButton.current && !applyButton.current.disabled ? applyButton.current : startButton.current;
    target?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      bridge.stop();
    };
  }, [running, onBack]);

  useEffect(() => {
    if (!running) return;
    const engine = getAudioEngine();
    const tap = (perfMs: number) => {
      const t = engine.songTimeAtPerf(perfMs);
      let best = 0;
      for (let i = 1; i < BEATS.length; i++) if (Math.abs(BEATS[i] - t) < Math.abs(BEATS[best] - t)) best = i;
      const err = t - BEATS[best];
      if (best >= WARMUP_BEATS && Math.abs(err) <= MAX_ERROR_MS) setErrors((prev) => [...prev, err]);
    };
    const stop = () => {
      engine.stop();
      setRunning(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      e.preventDefault();
      if (e.code === 'Escape') stop();
      else tap(e.timeStamp);
    };
    // pad presses are taps at the pad's own timestamp (not the menu bridge's polling time)
    const pad = new GamepadPoller((e) => {
      if (!e.down) return;
      if (e.code === 'Pad:B1') stop();
      else tap(e.timeMs);
    });
    const tick = (now: number) => {
      engine.clock.sample();
      const t = engine.songTimeAtPerf(now);
      let idx = -1;
      for (let i = 0; i < BEATS.length; i++) if (t >= BEATS[i]) idx = i;
      const on = idx >= 0 && t < BEATS[idx] + 120;
      setBeat((b) => (b.index === idx && b.on === on ? b : { index: idx, on }));
      if (t > BEATS[BEATS.length - 1] + 800) setRunning(false);
      else rafRef.current = requestAnimationFrame(tick);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    pad.start();
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      pad.stop();
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
  const canApply = suggestion !== null && s.count >= MIN_TAPS;
  const applied = canApply && suggestion === settings.inputOffsetMs;
  const topGrade = new JudgementTable(judgementConfig, settings.judgementMode).topGrade;
  const hints: KeyHint[] = running ? [{ keys: ['아무 키'], label: '박자에 맞춰 누르기' }] : [];
  if (!running && canApply && !applied) hints.push({ keys: ['Enter'], label: `${suggestion}ms로 적용` });

  return (
    <div className="menu-screen calibration-screen screen-enter" data-testid="calibration-screen">
      <TopBar name="오프셋 캘리브레이션" />
      <div className="screen-body">
        <p className="calib-intro">메트로놈 소리에 맞춰 아무 키나 누르세요. 처음 {WARMUP_BEATS}박은 연습으로 제외합니다.</p>
        <section className="calib-stage">
          <div className={`beat-ring ${running && beat.on ? 'on' : ''} ${running && beat.on && beat.index % 4 === 0 ? 'accent' : ''}`} aria-hidden="true">
            {running && beat.index >= 0 ? (
              <>
                <b>{(beat.index % 4) + 1}</b>
                <span>{beat.index < WARMUP_BEATS ? '연습' : `${beat.index + 1 - WARMUP_BEATS} / ${BEATS.length - WARMUP_BEATS}`}</span>
              </>
            ) : (
              <span>{running ? '준비' : '대기'}</span>
            )}
          </div>
          <dl className="calib-numbers">
            <div className="calib-mean">
              <dt>평균 오차</dt>
              <dd data-testid="calib-mean">{s.mean === null ? '-' : `${s.mean > 0 ? '+' : ''}${s.mean.toFixed(1)}ms`}</dd>
            </div>
            <div>
              <dt>표준편차</dt>
              <dd>{s.std === null ? '-' : `${s.std.toFixed(1)}ms`}</dd>
            </div>
            <div>
              <dt>입력 수</dt>
              <dd data-testid="calib-count">{s.count}</dd>
            </div>
          </dl>
        </section>
        <OffsetRail errors={errors} mean={s.mean} windowMs={topGrade.windowMs} windowLabel={topGrade.label} />
        <p className="calib-offset">
          현재 판정 오프셋 <b>{settings.inputOffsetMs}ms</b>
          {canApply && !applied && (
            <>
              {' '}
              → 적용하면 <b>{suggestion}ms</b>
            </>
          )}
          {applied && ' · 측정값과 같습니다'}
        </p>
        <div className="row buttons">
          <button ref={startButton} className="primary" data-testid="calib-start" onClick={start} disabled={running}>
            {running ? '측정 중…' : errors.length > 0 ? '다시 재기' : '시작'}
          </button>
          <button ref={applyButton} disabled={!canApply || applied} onClick={() => suggestion !== null && onSettingsChange({ ...settings, inputOffsetMs: suggestion })}>
            {suggestion === null ? '적용' : `${suggestion}ms로 적용`}
          </button>
          <button data-testid="calib-back" onClick={onBack}>
            돌아가기 <kbd>Esc</kbd>
          </button>
        </div>
        <p className="calib-note">평균 오차가 +면 늦게, −면 빨리 친 것입니다. 적용하면 판정 시 그만큼 보정합니다.</p>
      </div>
      <HintBar hints={hints} end={[{ keys: ['Esc'], label: running ? '멈추기' : '돌아가기' }]} />
    </div>
  );
}

/**
 * Every tap as a dot on a line from 250 ms early to 250 ms late, the newest brightest, with the
 * mean and the MAX 100% window of the judgement in use.
 */
function OffsetRail({ errors, mean, windowMs, windowLabel }: { errors: number[]; mean: number | null; windowMs: number; windowLabel: string }) {
  const x = (ms: number) => `${((Math.max(-MAX_ERROR_MS, Math.min(MAX_ERROR_MS, ms)) + MAX_ERROR_MS) / (2 * MAX_ERROR_MS)) * 100}%`;
  return (
    <div className="offset-rail" role="img" aria-label="입력 오차 분포">
      <span className="rail-window" style={{ left: x(-windowMs), right: `calc(100% - ${x(windowMs)})` }} title={`${windowLabel} ±${windowMs.toFixed(1)}ms`} />
      <span className="rail-line" />
      {RAIL_TICKS.map((t) => (
        <span key={t} className={`rail-tick ${t === 0 ? 'zero' : ''}`} style={{ left: x(t) }}>
          <small>{t === 0 ? '0' : `${t > 0 ? '+' : '−'}${Math.abs(t)}`}</small>
        </span>
      ))}
      {errors.map((e, i) => (
        <i key={i} className={i === errors.length - 1 ? 'latest' : ''} style={{ left: x(e) }} />
      ))}
      {mean !== null && <b className="rail-mean" style={{ left: x(mean) }} />}
      <span className="rail-end early">FAST</span>
      <span className="rail-end late">SLOW</span>
    </div>
  );
}
