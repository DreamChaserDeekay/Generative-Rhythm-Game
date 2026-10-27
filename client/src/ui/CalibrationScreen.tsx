import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getAudioEngine } from '../audio/AudioEngine';
import { clickBeatTimes, clickTrackBuffer, type ClickTrackSpec } from '../audio/clickTrack';
import { cameraConfig, judgementConfig, keyModes } from '../engine/config';
import { JudgementTable } from '../engine/judgement';
import { ScrollModel } from '../engine/scroll';
import { GamepadMenuBridge, GamepadPoller, padMenuKey, SHOULDER_KEYS } from '../input/gamepad';
import { GRADE_PALETTES } from '../render/palette';
import { disposeSkinArt, loadSkinArt } from '../render/skinArt';
import { skinById, withParts } from '../render/skins';
import { TrackRenderer } from '../render/TrackRenderer';
import { laneColorsOf, visibleTimeMs, type Settings } from '../settings/settings';
import { countedBeat } from './inputSync';
import { offsetText } from './resultBreakdown';
import { HintBar, TopBar, type KeyHint } from './shell';
import { clickChords, offsetStep } from './visualSync';

/** The two offsets, a step each: the judgement offset measured by ear, the display offset set by eye. */
export type CalibrationStep = 'input' | 'visual';
const STEPS: [CalibrationStep, string][] = [
  ['input', '판정 오프셋 측정'],
  ['visual', '표시 오프셋 맞추기'],
];

interface Props {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onBack: () => void;
  /** The step it opens on. */
  step?: CalibrationStep;
}

const SPEC: ClickTrackSpec = { bpm: 120, firstBeatMs: 1500, beats: 40, beatsPerMeasure: 4, tailMs: 1000 };
const BEATS = clickBeatTimes(SPEC);
const WARMUP_BEATS = 4;
const MAX_ERROR_MS = 250;
/** Taps that count before an offset can be applied. */
const MIN_TAPS = 8;
/**
 * Taps spread wider than this (their standard deviation) are a run worth doing again: NORMAL's
 * MAX 100% window whatever judgement is played, as how even a run is has nothing to do with it
 * (HARD's or MAX's window would call almost every run scattered).
 */
const SCATTERED_MS = new JudgementTable(judgementConfig, 'NORMAL').topGrade.windowMs;
/** Ticks on the rail (ms either side of the beat). */
const RAIL_TICKS = [-200, -100, 0, 100, 200];
/** The display step's metronome: played over and over, the notes coming down again each time. */
const LOOP: ClickTrackSpec = { bpm: 120, firstBeatMs: 1000, beats: 32, beatsPerMeasure: 4, tailMs: 600 };
const LOOP_LEAD_MS = 300;
/** A key looks pressed this long after its note. */
const PRESS_MS = 70;

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
 * The two offsets, a step each. 판정 오프셋 측정: tap any key (or pad button) on the metronome, by
 * ear; the mean error becomes the judgement offset. 표시 오프셋 맞추기: notes come down to the
 * judge line on the clicks, drawn with the display offset being set (←→). Q / E (LB / RB) change
 * the step; Esc (pad B) stops a measurement and otherwise goes back.
 */
export function CalibrationScreen({ settings, onSettingsChange, onBack, step: first = 'input' }: Props) {
  const [step, setStep] = useState<CalibrationStep>(first);
  const [measuring, setMeasuring] = useState(false);
  /** The display offset being set, kept while the other step is shown (saved only with 저장). */
  const [visualPending, setVisualPending] = useState(settings.visualOffsetMs);

  // Between measurements the keys and the pad work the screen (a measurement takes them all; the
  // Esc that stops one is taken, though this listener is back before that key has passed)
  useEffect(() => {
    if (measuring) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        onBack();
      } else if ((e.code === 'KeyQ' || e.code === 'KeyE' || e.code === 'PageUp' || e.code === 'PageDown') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        if (!e.repeat) setStep((s) => (s === 'input' ? 'visual' : 'input'));
      }
    };
    window.addEventListener('keydown', onKey);
    const bridge = new GamepadMenuBridge({ keys: SHOULDER_KEYS });
    bridge.start();
    return () => {
      window.removeEventListener('keydown', onKey);
      bridge.stop();
    };
  }, [measuring, onBack]);

  const tabs = (
    <div className="segmented calib-steps" role="tablist" aria-label="단계">
      {STEPS.map(([id, label], i) => (
        <button
          key={id}
          role="tab"
          aria-selected={step === id}
          className={step === id ? 'active' : ''}
          data-testid={`calib-step-${id}`}
          disabled={measuring}
          onClick={() => setStep(id)}
        >
          {i + 1}. {label}
        </button>
      ))}
    </div>
  );
  const name = STEPS.find(([id]) => id === step)?.[1] ?? '';
  return (
    <div className="menu-screen calibration-screen screen-enter" data-testid="calibration-screen" data-step={step}>
      <TopBar name={name} />
      {step === 'input' ? (
        <InputStep settings={settings} onSettingsChange={onSettingsChange} onBack={onBack} tabs={tabs} onMeasuring={setMeasuring} onNext={() => setStep('visual')} />
      ) : (
        <VisualStep settings={settings} onSettingsChange={onSettingsChange} onBack={onBack} tabs={tabs} pending={visualPending} setPending={setVisualPending} />
      )}
    </div>
  );
}

interface StepProps {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onBack: () => void;
  /** The steps' tabs, on top of the step. */
  tabs: ReactNode;
}

type InputButton = 'start' | 'apply' | 'next' | 'back';

/**
 * 판정 오프셋 측정: the metronome's taps by ear. The ring shows no beat number and counts each beat
 * half a beat late (anything changing on the beat is something to tap to by eye, and the screen's
 * lag would go into the judgement offset). A run's end puts the focus on 적용, or on 다시 재기 when
 * there is nothing to apply or the taps spread wider than the top judgement's window (applying is
 * still allowed); 적용 then hands it to the next step.
 */
function InputStep({ settings, onSettingsChange, onBack, tabs, onMeasuring, onNext }: StepProps & { onMeasuring: (running: boolean) => void; onNext: () => void }) {
  const [running, setRunning] = useState(false);
  const [errors, setErrors] = useState<number[]>([]);
  /** The last beat counted, half a beat after it sounded (-1 before the first). */
  const [beat, setBeat] = useState(-1);
  const [focused, setFocused] = useState<InputButton | null>(null);
  const rafRef = useRef(0);
  const startButton = useRef<HTMLButtonElement>(null);
  const applyButton = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    getAudioEngine().stop();
  }, []);

  useEffect(() => onMeasuring(running), [running, onMeasuring]);

  const s = stats(errors);
  const topGrade = new JudgementTable(judgementConfig, settings.judgementMode).topGrade;
  /** The taps spread wider than SCATTERED_MS: a run again would measure better. */
  const scattered = s.std !== null && s.std > SCATTERED_MS;

  // a run's end (and the step's start) puts the focus on 적용, or on 시작 (다시 재기) when there is
  // nothing to apply or the taps were scattered
  useEffect(() => {
    if (running) return;
    const target = applyButton.current && !applyButton.current.disabled && !scattered ? applyButton.current : startButton.current;
    target?.focus();
  }, [running, scattered]);

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
      // the pad's cancel button (B, or the one assigned to a controller without the standard mapping)
      if (padMenuKey(e) === 'Escape') stop();
      else tap(e.timeMs);
    });
    const tick = (now: number) => {
      engine.clock.sample();
      const t = engine.songTimeAtPerf(now);
      setBeat(countedBeat(BEATS, t));
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
    setBeat(-1);
    setRunning(true);
  };

  const suggestion = s.mean !== null ? Math.round(s.mean) : null;
  const canApply = suggestion !== null && s.count >= MIN_TAPS;
  const applied = canApply && suggestion === settings.inputOffsetMs;
  const apply = () => {
    if (suggestion === null) return;
    onSettingsChange({ ...settings, inputOffsetMs: suggestion });
    // the next step is the display offset's
    nextButton.current?.focus();
  };
  const startLabel = running ? '측정 중…' : errors.length > 0 ? '다시 재기' : '시작';
  const applyLabel = suggestion === null ? '적용' : `${suggestion}ms로 적용`;
  const enterLabels: Record<InputButton, string> = { start: startLabel, apply: applyLabel, next: '다음 단계', back: '돌아가기' };
  const hints: KeyHint[] = running
    ? [{ keys: ['아무 키'], label: '박자에 맞춰 누르기' }]
    : [
        { keys: ['Enter'], pad: ['A'], label: enterLabels[focused ?? 'start'] },
        { keys: ['Q', 'E'], pad: ['LB', 'RB'], label: '단계' },
      ];

  return (
    <>
      <div className="screen-body">
        {tabs}
        <p className="calib-intro">메트로놈 소리에 맞춰 아무 키나 누르세요. 화면 말고 소리를 듣고 치세요. 처음 {WARMUP_BEATS}박은 연습으로 제외합니다.</p>
        <section className="calib-stage">
          <div className="beat-ring" data-beat={running ? beat : -1} aria-hidden="true">
            <span>{!running ? '대기' : beat < 0 ? '준비' : beat < WARMUP_BEATS ? '연습' : `${beat + 1 - WARMUP_BEATS} / ${BEATS.length - WARMUP_BEATS}`}</span>
          </div>
          <dl className="calib-numbers">
            <div className="calib-mean">
              <dt>평균 오차</dt>
              <dd data-testid="calib-mean">{s.mean === null ? '-' : `${s.mean > 0 ? '+' : ''}${s.mean.toFixed(1)}ms`}</dd>
            </div>
            <div>
              <dt>표준편차</dt>
              <dd data-testid="calib-std" className={scattered ? 'g-low' : undefined}>
                {s.std === null ? '-' : `${s.std.toFixed(1)}ms`}
              </dd>
            </div>
            <div>
              <dt>입력 수</dt>
              <dd data-testid="calib-count">{s.count}</dd>
            </div>
          </dl>
        </section>
        <OffsetRail errors={errors} mean={s.mean} windowMs={topGrade.windowMs} windowLabel={topGrade.label} />
        <p className="calib-offset">
          현재 판정 오프셋 <b>{offsetText(settings.inputOffsetMs)}</b>
          {canApply && !applied && suggestion !== null && (
            <>
              {' '}
              → 적용하면 <b>{offsetText(suggestion)}</b>
            </>
          )}
          {applied && ' · 측정값과 같습니다'}
        </p>
        {!running && scattered && (
          <p className="calib-offset g-low" data-testid="calib-scattered">
            입력이 많이 흩어졌습니다. 다시 재면 더 정확합니다
          </p>
        )}
        <div className="row buttons">
          <button ref={startButton} className="primary" data-testid="calib-start" onClick={start} disabled={running} onFocus={() => setFocused('start')}>
            {startLabel}
          </button>
          <button ref={applyButton} data-testid="calib-apply" disabled={!canApply || applied} onClick={apply} onFocus={() => setFocused('apply')}>
            {applyLabel}
          </button>
          <button ref={nextButton} data-testid="calib-next" disabled={running} onClick={onNext} onFocus={() => setFocused('next')}>
            다음: 표시 오프셋 맞추기
          </button>
          <button data-testid="calib-back" onClick={onBack} onFocus={() => setFocused('back')}>
            돌아가기 <kbd>Esc</kbd>
          </button>
        </div>
        <p className="calib-note">평균 오차가 +면 늦게, −면 빨리 친 것입니다. 적용하면 판정 시 그만큼 보정합니다.</p>
      </div>
      <HintBar hints={hints} end={[{ keys: ['Esc'], pad: ['B'], label: running ? '멈추기' : '돌아가기' }]} />
    </>
  );
}

type VisualFocus = 'save' | 'back' | 'step';

/**
 * 표시 오프셋 맞추기: the metronome plays on and on, a chord of notes comes down to the judge line
 * on every click (the gear as the play draws it: skin, camera, SPEED, LIFT), drawn with the
 * display offset being set. ←→ (a pad's d-pad) move it 1 ms at once, Shift 5 ms; Enter (A) on
 * 저장 keeps it, Esc leaves without keeping it (the hints say so while it is not kept). The value
 * being set is the screen's, so a look at the other step keeps it.
 */
function VisualStep({
  settings,
  onSettingsChange,
  onBack,
  tabs,
  pending,
  setPending,
}: StepProps & { pending: number; setPending: (update: (ms: number) => number) => void }) {
  const saved = settings.visualOffsetMs;
  const [kept, setKept] = useState(false);
  const offset = useRef(pending);
  offset.current = pending;
  const saveButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  useEffect(() => saveButton.current?.focus(), []);
  /** What has the focus: Enter presses it (the hint bar names what it does). */
  const [focused, setFocused] = useState<VisualFocus>('save');

  // ←→ move the offset whatever has the focus (the pad's d-pad sends them too: taken here, they
  // move no focus)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') || e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      setPending((ms) => offsetStep(ms, e.code === 'ArrowRight' ? 1 : -1, e.shiftKey));
      setKept(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPending]);

  const save = () => {
    onSettingsChange({ ...settings, visualOffsetMs: pending });
    setKept(true);
  };
  const unsaved = pending !== saved;
  const leave = unsaved ? '저장하지 않고 돌아가기' : '돌아가기';
  const enterLabels: Record<VisualFocus, string> = { save: '저장', back: leave, step: '단계 바꾸기' };
  const hints: KeyHint[] = [
    { keys: ['←', '→'], pad: ['←', '→'], label: '1ms' },
    { keys: ['Shift', '←', '→'], label: '5ms' },
    { keys: ['Q', 'E'], pad: ['LB', 'RB'], label: '단계' },
  ];
  return (
    <>
      <div
        className="screen-body"
        onFocus={(e) => {
          // (the focus comes from a child: a button, or a step's tab)
          const at: EventTarget = e.target;
          setFocused(at === saveButton.current ? 'save' : at === backButton.current ? 'back' : 'step');
        }}
      >
        {tabs}
        <p className="calib-intro">클릭 소리에 맞춰 노트가 판정선에 닿는지 보세요. 소리보다 늦게 닿으면 →, 먼저 닿으면 ←로 옮기고 저장하세요.</p>
        <section className="calib-visual">
          <ClickGear settings={settings} offset={offset} />
          <div className="calib-visual-side">
            <dl className="calib-numbers">
              <div className="calib-mean">
                <dt>표시 오프셋</dt>
                <dd data-testid="calib-visual-offset">{offsetText(pending)}</dd>
              </div>
            </dl>
            <p className="calib-offset" data-testid="calib-visual-saved">
              저장된 값 <b>{offsetText(saved)}</b>
              {unsaved ? ' · 저장 안 됨' : kept ? ' · 저장했습니다' : ''}
            </p>
            <p className="calib-keys">
              <kbd>←</kbd> <kbd>→</kbd> 1ms · <kbd>Shift</kbd> 5ms
            </p>
            <div className="row buttons">
              <button ref={saveButton} className="primary" data-testid="calib-visual-save" onClick={save}>
                저장 <kbd>Enter</kbd>
              </button>
              <button ref={backButton} data-testid="calib-back" onClick={onBack}>
                돌아가기 <kbd>Esc</kbd>
              </button>
            </div>
          </div>
        </section>
        <p className="calib-note">판정 오프셋(소리)과 따로 맞춥니다. 화면이 소리보다 늦게 나오는 모니터·TV일수록 +가 됩니다. +면 노트를 그만큼 일찍 그립니다.</p>
      </div>
      <HintBar
        hints={hints}
        end={[
          { keys: ['Enter'], pad: ['A'], label: enterLabels[focused], testId: 'hint-enter' },
          { keys: ['Esc'], pad: ['B'], label: leave, testId: 'hint-esc' },
        ]}
      />
    </>
  );
}

/**
 * The gear of the display step: the click track looped on the song clock and a chord of notes on
 * every click, drawn `offset.current` ms early as the play draws them with the display offset.
 */
function ClickGear({ settings, offset }: { settings: Settings; offset: { readonly current: number } }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { lastKeyMode: keyMode, skin: skinId, customSkin, parts, cameraPreset, laneWidthScale, palette, reducedFlash, barLines, keyBeamLength, hitEffectSize, sideNotes, hiSpeed, lift, musicVolume } = settings;
  const { noteColors, colorPresets } = settings;

  useEffect(() => {
    const el = canvas.current;
    const frameBox = box.current;
    if (!el || !frameBox) return;
    let alive = true;
    let renderer: TrackRenderer | null = null;
    let watch: ResizeObserver | null = null;
    let raf = 0;
    const engine = getAudioEngine();
    const skin = withParts(skinById(skinId, customSkin), parts);
    void Promise.all([loadSkinArt(skin).catch(() => null), engine.unlock()]).then(([art]) => {
      if (!alive) {
        disposeSkinArt(art);
        return;
      }
      const mode = keyModes[keyMode];
      const r = new TrackRenderer(el, {
        mode,
        camera: cameraConfig.presets[cameraPreset] ?? cameraConfig.presets[cameraConfig.default],
        trackWidth: cameraConfig.trackWidth * laneWidthScale,
        trackLength: cameraConfig.trackLength,
        palette,
        reducedFlash,
        // no cover over the notes coming down (LIFT keeps the judge line where the play has it)
        covers: { sudden: 0, hidden: 0, lift },
        skin,
        art,
        barLines,
        keyBeamLength,
        hitEffectSize,
        sideNotes,
        laneColors: laneColorsOf({ skin: skinId, customSkin, parts, palette, noteColors, colorPresets }, keyMode),
        fitWidth: 0.84,
      });
      renderer = r;
      const fit = () => r.resize(frameBox.clientWidth, frameBox.clientHeight);
      fit();
      watch = new ResizeObserver(fit);
      watch.observe(frameBox);

      const beats = clickBeatTimes(LOOP);
      const end = beats[beats.length - 1] + LOOP.tailMs;
      const timing = { offsetMs: LOOP.firstBeatMs, tempoMap: [{ beat: 0, bpm: LOOP.bpm }], meter: [{ measure: 0, beatsPerMeasure: LOOP.beatsPerMeasure }] };
      const scroll = new ScrollModel({ trackLength: r.geometry.length, visibleMs: visibleTimeMs(hiSpeed), lift, mode: 'time', timing, rate: 1, durationMs: end });
      const bars = beats.filter((_, i) => i % LOOP.beatsPerMeasure === 0);
      const notes = clickChords(mode, beats);
      const hitColor = GRADE_PALETTES[palette]['g-max'] ?? 0xffffff;
      const pressedUntil = new Array<number>(mode.lanes.length).fill(-Infinity);
      let next = 0;
      engine.setBuffer(clickTrackBuffer(engine.ctx, LOOP));
      engine.setMusicVolume(musicVolume);
      const begin = () => {
        engine.start(0, LOOP_LEAD_MS);
        r.reset();
        for (const n of notes) n.headDone = n.tailDone = false;
        next = 0;
        pressedUntil.fill(-Infinity);
      };
      begin();
      const frame = (perfNow: number) => {
        raf = requestAnimationFrame(frame);
        engine.clock.sample();
        const songNow = engine.songTimeAtPerf(perfNow);
        if (songNow > end) {
          begin();
          return;
        }
        // as the play draws a song: its time plus the display offset
        const now = songNow + offset.current;
        for (; next < notes.length && notes[next].t <= now; next++) {
          const n = notes[next];
          n.headDone = n.tailDone = true;
          r.hitEffect(n.lane, hitColor, perfNow, n.index);
          pressedUntil[n.lane] = n.t + PRESS_MS;
        }
        r.render(
          {
            timeMs: now,
            scroll,
            notes,
            heldNote: () => null,
            keyDown: (lane) => pressedUntil[lane] > now,
            barTimes: bars,
            fever: { active: false, multiplier: 1, remaining: 0 },
          },
          perfNow,
        );
      };
      raf = requestAnimationFrame(frame);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      watch?.disconnect();
      renderer?.dispose();
      engine.stop();
    };
  }, [keyMode, skinId, customSkin, parts, cameraPreset, laneWidthScale, palette, reducedFlash, barLines, keyBeamLength, hitEffectSize, sideNotes, noteColors, colorPresets, hiSpeed, lift, musicVolume, offset]);

  return (
    <div className="calib-gear" ref={box} data-testid="calib-gear">
      <canvas ref={canvas} aria-label={`${keyMode} 노트와 판정선`} />
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
