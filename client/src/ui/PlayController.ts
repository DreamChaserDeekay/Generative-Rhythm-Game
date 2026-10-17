import { getAudioEngine } from '../audio/AudioEngine';
import { AutoPlayer } from '../engine/autoplay';
import { cameraConfig, gaugeRules, defaultGauge, judgementConfig, keyModes } from '../engine/config';
import { JudgementTable } from '../engine/judgement';
import { GameSession, type SessionEvent, type SessionResult } from '../engine/session';
import { TempoMap } from '../engine/tempo';
import type { Chart } from '../engine/types';
import { InputManager } from '../input/InputManager';
import { TrackRenderer } from '../render/TrackRenderer';
import { bindingsFor, visibleTimeMs, type Settings } from '../settings/settings';
import { GRADE_COLORS, gradeClass, Hud } from './Hud';

export interface PlaySetup {
  chart: Chart;
  /** Decoded canonical audio; null plays the chart silently (tests). */
  buffer: AudioBuffer | null;
  settings: Settings;
  autoPlay: boolean;
  canvas: HTMLCanvasElement;
  hudRoot: HTMLElement;
}

export interface PlayCallbacks {
  onFinish(result: SessionResult): void;
  onPauseChange(paused: boolean): void;
}

type PlayState = 'running' | 'paused' | 'ending' | 'done';

const MIN_LEAD_IN_MS = 1500;
const FIRST_NOTE_DELAY_MS = 3000;
const RESUME_LEAD_IN_MS = 1500;
const END_AFTER_LAST_NOTE_MS = 1500;
const BANNER_MS = 1800;

/** Wires audio, input, judgement, rendering and HUD together for one play. */
export class PlayController {
  private readonly setup: PlaySetup;
  private readonly callbacks: PlayCallbacks;
  private readonly engine = getAudioEngine();
  private readonly renderer: TrackRenderer;
  private readonly hud: Hud;
  private readonly table: JudgementTable;
  private readonly barTimes: number[];
  private readonly visibleMs: number;
  private readonly firstNoteMs: number;
  private readonly lastNoteEndMs: number;
  private readonly durationMs: number;
  private session!: GameSession;
  private input!: InputManager;
  private auto: AutoPlayer | null = null;
  private unsubscribe: (() => void) | null = null;
  private state: PlayState = 'running';
  private finishAtPerf = 0;
  private raf = 0;
  private readonly resizeObserver: ResizeObserver;

  constructor(setup: PlaySetup, callbacks: PlayCallbacks) {
    this.setup = setup;
    this.callbacks = callbacks;
    const { chart, settings } = setup;
    const mode = keyModes[chart.meta.keyMode];
    const camera = cameraConfig.presets[settings.cameraPreset] ?? cameraConfig.presets[cameraConfig.default];
    this.renderer = new TrackRenderer(setup.canvas, {
      mode,
      camera,
      trackWidth: cameraConfig.trackWidth * settings.laneWidthScale,
      trackLength: cameraConfig.trackLength,
    });
    this.table = new JudgementTable(judgementConfig, settings.judgementMode);
    this.hud = new Hud(
      setup.hudRoot,
      {
        title: chart.meta.title,
        artist: chart.meta.artist,
        keyMode: chart.meta.keyMode,
        difficulty: chart.meta.difficulty,
        level: chart.meta.level,
        autoPlay: setup.autoPlay,
        judgementLabel: judgementConfig.modes[settings.judgementMode].label,
      },
      gaugeRules[defaultGauge].clear,
      settings.showErrorMs,
    );
    this.visibleMs = visibleTimeMs(settings.hiSpeed);
    const notes = chart.notes;
    this.firstNoteMs = notes.length > 0 ? Math.min(...notes.map((n) => n.t)) : 0;
    this.lastNoteEndMs = notes.length > 0 ? Math.max(...notes.map((n) => n.endT ?? n.t)) : 0;
    const audioMs = setup.buffer ? setup.buffer.duration * 1000 : 0;
    this.durationMs = Math.max(audioMs, chart.meta.durationMs ?? 0, this.lastNoteEndMs);
    this.barTimes = new TempoMap(chart.timing).barLines(this.durationMs);

    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(setup.canvas);
    window.addEventListener('keydown', this.onControlKey);
    this.layout();
    this.begin();
    this.raf = requestAnimationFrame(this.frame);
  }

  pause(): void {
    if (this.state !== 'running') return;
    this.input.releaseAll();
    this.input.enabled = false;
    this.engine.pause();
    this.state = 'paused';
    this.callbacks.onPauseChange(true);
  }

  resume(): void {
    if (this.state !== 'paused') return;
    const at = this.engine.songTimeAtPerf(performance.now());
    this.engine.start(at, RESUME_LEAD_IN_MS);
    this.input.enabled = true;
    this.state = 'running';
    this.callbacks.onPauseChange(false);
  }

  restart(): void {
    this.teardownRun();
    this.hud.hideBanner();
    this.begin();
    this.callbacks.onPauseChange(false);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.teardownRun();
    this.engine.stop();
    window.removeEventListener('keydown', this.onControlKey);
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.hud.dispose();
  }

  private begin(): void {
    const { chart, settings, buffer, autoPlay } = this.setup;
    this.session = new GameSession(chart, this.table, {
      gauge: gaugeRules[defaultGauge],
      holdTickBeats: judgementConfig.hold.tickBeats,
      releaseGraceMs: judgementConfig.hold.releaseGraceMs,
      missMarginMs: judgementConfig.missMarginMs,
    });
    this.renderer.reset();
    this.unsubscribe = this.session.on(this.onSessionEvent);
    this.input = new InputManager(
      this.engine,
      bindingsFor(settings, chart.meta.keyMode),
      { press: (lane, t) => this.session.press(lane, t), release: (lane, t) => this.session.release(lane, t) },
      settings.inputOffsetMs,
    );
    this.auto = autoPlay ? new AutoPlayer(chart) : null;
    if (!autoPlay) this.input.attach();
    this.engine.setBuffer(buffer);
    this.engine.setMusicVolume(settings.musicVolume);
    this.engine.setSfxVolume(settings.sfxVolume);
    this.engine.start(0, Math.max(MIN_LEAD_IN_MS, FIRST_NOTE_DELAY_MS - this.firstNoteMs));
    this.state = 'running';
  }

  private teardownRun(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.input?.detach();
    this.engine.stop();
  }

  private layout(): void {
    const rect = this.setup.canvas.getBoundingClientRect();
    this.renderer.resize(rect.width, rect.height);
    const L = this.renderer.geometry.length;
    this.hud.place({
      combo: this.renderer.project(0, 0, -L * 0.42),
      judge: this.renderer.project(0, 0, -L * 0.16),
    });
  }

  private readonly frame = (perfNow: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    this.engine.clock.sample();
    const songNow = this.engine.songTimeAtPerf(perfNow);
    const judgeNow = songNow - this.setup.settings.inputOffsetMs;

    if (this.state === 'running') {
      if (this.auto) for (const i of this.auto.take(judgeNow)) this.input.injectAt(i.lane, i.down, i.timeMs);
      this.session.update(judgeNow);
      if (this.session.finished && judgeNow > this.lastNoteEndMs + END_AFTER_LAST_NOTE_MS) this.beginEnding(perfNow);
    }
    if (this.state === 'ending' && perfNow >= this.finishAtPerf) {
      this.state = 'done';
      this.engine.stop();
      this.callbacks.onFinish(this.session.result());
    }

    this.renderer.render(
      {
        timeMs: songNow + this.setup.settings.visualOffsetMs,
        visibleMs: this.visibleMs,
        notes: this.session.notes,
        heldNote: (lane) => this.session.heldNoteIndex(lane),
        keyDown: (lane) => this.session.isKeyDown(lane),
        barTimes: this.barTimes,
      },
      perfNow,
    );
    this.hud.update(perfNow, {
      score: this.session.currentScore,
      rate: this.session.currentRate,
      gauge: this.session.gauge.value,
      progress: this.durationMs > 0 ? songNow / this.durationMs : 0,
      ready: this.state === 'paused' ? '' : songNow < this.firstNoteMs - this.visibleMs ? 'READY' : '',
    });
  };

  private beginEnding(perfNow: number): void {
    this.state = 'ending';
    this.finishAtPerf = perfNow + BANNER_MS;
    this.input.detach();
    const lamp = this.session.result().lamp;
    const kind = lamp === 'PERFECT PLAY' ? 'perfect' : lamp === 'MAX COMBO' ? 'maxcombo' : lamp === 'CLEAR' ? 'clear' : 'failed';
    this.hud.showBanner(lamp, kind);
  }

  private readonly onSessionEvent = (e: SessionEvent): void => {
    const now = performance.now();
    if (e.type === 'judge') {
      this.hud.showJudge(e, now);
      if (!e.isBreak) this.renderer.hitEffect(e.lane, GRADE_COLORS[gradeClass(e.percent, false)], now);
    } else if (e.type === 'tick') {
      this.hud.setCombo(e.combo);
    } else if (e.type === 'key' && e.down && this.setup.settings.hitSound) {
      this.engine.playHitSound();
    }
  };

  private readonly onControlKey = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      e.preventDefault();
      if (this.state === 'running') this.pause();
      else if (this.state === 'paused') this.resume();
    } else if (e.code === 'F2') {
      e.preventDefault();
      if (this.state !== 'done') this.restart();
    }
  };
}
