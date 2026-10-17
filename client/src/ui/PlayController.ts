import { getAudioEngine } from '../audio/AudioEngine';
import type { BufferPlacement } from '../audio/AudioEngine';
import { KeysoundVoices, type KeysoundBank } from '../audio/keysounds';
import { AutoPlayer } from '../engine/autoplay';
import { cameraConfig, difficultyLabel, gaugeRules, judgementConfig, keyModes, sideLanesOf } from '../engine/config';
import { JudgementTable } from '../engine/judgement';
import { applyPlacement, placementLabels, type PlacementResult } from '../engine/placement';
import { REPLAY_VERSION, ReplayPlayer, ReplayRecorder, type ReplayData } from '../engine/replay';
import { Ruleset, rulesetConfigs } from '../engine/ruleset';
import { ScrollModel } from '../engine/scroll';
import { GameSession, type SessionEvent, type SessionResult } from '../engine/session';
import { TempoMap } from '../engine/tempo';
import type { Chart } from '../engine/types';
import { GamepadPoller, type PadEvent } from '../input/gamepad';
import { InputManager } from '../input/InputManager';
import { CameraFx } from '../render/cameraFx';
import { GRADE_PALETTES } from '../render/palette';
import { skinById } from '../render/skins';
import { TrackRenderer } from '../render/TrackRenderer';
import {
  activeCovers,
  bindingsFor,
  clampHiSpeed,
  padBindingsFor,
  greenNumber,
  MAX_COVER,
  MAX_LIFT,
  visibleTimeMs,
  withCovers,
  type Settings,
} from '../settings/settings';
import type { PlayRequest, PracticeOptions } from './App';
import { Hud } from './Hud';
import { LAMP_CLASS } from './lamps';
import { PlayBackground } from './PlayBackground';

const STEM_LABELS: Record<string, string> = { drums: '드럼', bass: '베이스', vocals: '보컬', other: '멜로디' };

export interface PlaySetup {
  request: PlayRequest;
  /** Decoded audio; null plays the chart silently (tests). */
  buffer: AudioBuffer | null;
  /** Lead stem for the keysound mode (null = off). */
  lead: AudioBuffer | null;
  /** Note keysounds of an imported chart (null = none). */
  keysounds?: KeysoundBank | null;
  /** Where the buffer sits on the song timeline (practice buffers are stretched segments). */
  bufferPlacement: BufferPlacement;
  settings: Settings;
  canvas: HTMLCanvasElement;
  hudRoot: HTMLElement;
  bgRoot: HTMLElement;
}

export interface PlayOutcome {
  result: SessionResult;
  /** The chart as played (after the placement option and the practice segment). */
  chart: Chart;
  placement: PlacementResult & { label: string };
  practice: PracticeOptions | null;
  /** The inputs of this play (null for autoplay, practice, replays and the sync test). */
  replay: ReplayData | null;
}

export interface PlayCallbacks {
  onFinish(outcome: PlayOutcome): void;
  onPauseChange(paused: boolean): void;
  /** In-play adjustments (hi-speed, covers) are kept for the next play. */
  onSettingsChange(settings: Settings): void;
}

type PlayState = 'running' | 'paused' | 'ending' | 'done';

const MIN_LEAD_IN_MS = 1500;
const FIRST_NOTE_DELAY_MS = 3000;
const RESUME_LEAD_IN_MS = 1500;
const END_AFTER_LAST_NOTE_MS = 1500;
const PRACTICE_PREROLL_MS = 2000;
const PRACTICE_END_MS = 900;
const BANNER_MS = 1800;
const FAIL_FADE_MS = 700;
const HI_SPEED_STEP = 0.1;
const HI_SPEED_STEP_BIG = 0.5;
const COVER_STEP = 0.025;
const FEVER_KEY = 'Enter';
/** Autoplay keysounds are scheduled this far ahead so they land exactly on the notes. */
const KEYSOUND_LOOKAHEAD_MS = 120;
/** An empty press plays the lane's next note if it is at most this far ahead (BMS). */
const EMPTY_PRESS_REACH_MS = 1000;
/** Judgement text and combo distance up the track, as shares of the travel distance. */
const HUD_POSITIONS = { low: [0.08, 0.36], mid: [0.16, 0.42], high: [0.32, 0.56] } as const;

/** Wires audio, input, judgement, rendering and HUD together for one play (or practice loop). */
export class PlayController {
  private readonly setup: PlaySetup;
  private readonly callbacks: PlayCallbacks;
  private readonly engine = getAudioEngine();
  private readonly renderer: TrackRenderer;
  private readonly hud: Hud;
  private readonly table: JudgementTable;
  private readonly ruleset: Ruleset;
  private readonly chart: Chart;
  private readonly placement: PlayOutcome['placement'];
  private readonly practice: PracticeOptions | null;
  private readonly rate: number;
  private readonly barTimes: number[];
  private readonly firstNoteMs: number;
  private readonly lastNoteEndMs: number;
  private readonly durationMs: number;
  private readonly boundCodes: Set<string>;
  private readonly paceTarget: number | null;
  private readonly cameraFx: CameraFx;
  private readonly background: PlayBackground;
  /** Notes whose miss dips the keysound stem (by session note index). */
  private readonly keysoundStem: string | null;
  /** Note keysounds (imported BMS/bmson charts). */
  private readonly voices: KeysoundVoices | null;
  /** Session note indices of each lane in time order (empty presses play the next one). */
  private readonly laneNotes: number[][];
  private nextAutoKeysound = 0;
  /** Note judged by the press being handled (to play its keysound). */
  private pressJudged: number | null = null;
  private settings: Settings;
  private scroll!: ScrollModel;
  private session!: GameSession;
  private input!: InputManager;
  private auto: AutoPlayer | null = null;
  /** Logs the inputs of a real play. */
  private recorder: ReplayRecorder | null = null;
  /** Feeds a recorded play back (watching a replay). */
  private replayer: ReplayPlayer | null = null;
  /** Gamepad / controller lanes, polled apart from the frames. */
  private pad: GamepadPoller | null = null;
  private readonly placementSeed: number;
  private unsubscribe: (() => void) | null = null;
  private state: PlayState = 'running';
  private finishAtPerf = 0;
  private loops = 0;
  private raf = 0;
  private readonly resizeObserver: ResizeObserver;

  constructor(setup: PlaySetup, callbacks: PlayCallbacks) {
    this.setup = setup;
    this.callbacks = callbacks;
    const { request } = setup;
    // a replay plays under the judgement settings it was recorded with
    const settings = request.replay ? { ...setup.settings, ...judgementSettingsOf(request.replay) } : setup.settings;
    this.settings = settings;
    this.practice = request.practice ?? null;
    this.rate = setup.bufferPlacement.rate;

    const seed = request.replay?.settings.placementSeed ?? request.placementSeed ?? Math.floor(Math.random() * 2 ** 31);
    this.placementSeed = seed;
    const placed = applyPlacement(request.chart, settings.placement, seed);
    this.placement = { ...placed, label: placementLabels[settings.placement] };
    this.chart = this.practice ? segmentOf(placed.chart, this.practice) : placed.chart;

    const mode = keyModes[this.chart.meta.keyMode];
    const camera = cameraConfig.presets[settings.cameraPreset] ?? cameraConfig.presets[cameraConfig.default];
    this.renderer = new TrackRenderer(setup.canvas, {
      mode,
      camera,
      trackWidth: cameraConfig.trackWidth * settings.laneWidthScale,
      trackLength: cameraConfig.trackLength,
      palette: settings.palette,
      reducedFlash: settings.reducedFlash,
      covers: activeCovers(settings),
      skin: skinById(settings.skin, settings.customSkin),
    });
    this.cameraFx = new CameraFx(this.chart.effects ?? [], this.chart.timing, settings.cameraFx * (settings.reducedFlash ? 0.5 : 1));
    this.keysoundStem = setup.lead ? (this.chart.meta.keysound?.stem ?? null) : null;
    this.voices =
      setup.keysounds && this.chart.sounds
        ? new KeysoundVoices(this.engine.ctx, this.engine.keysoundBus, setup.keysounds, this.chart.sounds)
        : null;
    this.engine.keysoundBus.gain.value = setup.keysounds?.gain ?? 1;
    this.laneNotes = [];
    this.background = new PlayBackground({
      root: setup.bgRoot,
      coverUrl: request.background?.coverUrl ?? null,
      bgaUrl: settings.bga ? (request.background?.bgaUrl ?? null) : null,
      bgaOffsetMs: request.background?.bgaOffsetMs ?? 0,
      rate: setup.bufferPlacement.rate,
      brightness: settings.bgBrightness,
      visualizer: settings.visualizer,
      reducedFlash: settings.reducedFlash,
      analyser: setup.buffer ? this.engine.analyser : null,
    });
    this.table = new JudgementTable(judgementConfig, settings.judgementMode, this.rate);
    this.ruleset = new Ruleset(settings.ruleset);
    this.boundCodes = new Set(bindingsFor(settings, this.chart.meta.keyMode));

    const notes = this.chart.notes;
    this.firstNoteMs = notes.length > 0 ? Math.min(...notes.map((n) => n.t)) : 0;
    this.lastNoteEndMs = notes.length > 0 ? Math.max(...notes.map((n) => n.endT ?? n.t)) : 0;
    const { originMs } = setup.bufferPlacement;
    const audioMs = setup.buffer ? originMs + setup.buffer.duration * 1000 * this.rate : 0;
    this.durationMs = Math.max(audioMs, request.chart.meta.durationMs ?? 0, this.lastNoteEndMs);
    this.barTimes = new TempoMap(this.chart.timing).barLines(this.durationMs);
    this.paceTarget = paceTarget(settings, request);

    const gauge = this.gaugeRule();
    const rules = rulesetConfigs[settings.ruleset];
    this.hud = new Hud(
      setup.hudRoot,
      {
        title: this.chart.meta.title,
        artist: this.chart.meta.artist,
        chartLine: [
          this.chart.meta.keyMode,
          difficultyLabel(this.chart.meta),
          judgementConfig.modes[settings.judgementMode].label,
          rules.label,
          settings.placement !== 'OFF' ? this.placement.label + (placed.laneOrder ? ` ${placed.laneOrder}` : '') : null,
          setup.lead && this.keysoundStem ? `키음 ${STEM_LABELS[this.keysoundStem] ?? this.keysoundStem}` : null,
          request.autoPlay ? 'AUTO' : null,
          request.replay ? 'REPLAY' : null,
        ]
          .filter(Boolean)
          .join(' · '),
        scoreLabel: rules.scoring === 'exscore' ? 'EX-SCORE' : 'SCORE',
        subLabel: rules.scoring === 'exscore' ? 'RANK' : 'RATE',
        gaugeLabel: gauge.label,
        gaugeClear: gauge.clear,
        survivalGauge: gauge.failAtZero,
        feverEnabled: settings.fever !== 'OFF',
        feverManualKey: settings.fever === 'MANUAL' ? FEVER_KEY : null,
        pacemakerLabel: this.paceTarget === null ? null : settings.pacemaker === 'BEST' ? 'vs BEST' : `vs ${settings.pacemaker}%`,
        practiceLabel: this.practiceLabel(),
      },
      settings.showErrorMs,
    );

    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(setup.canvas);
    window.addEventListener('keydown', this.onControlKey);
    this.rebuildScroll();
    this.layout();
    this.begin();
    this.raf = requestAnimationFrame(this.frame);
  }

  pause(): void {
    if (this.state !== 'running') return;
    this.input.releaseAll();
    this.input.enabled = false;
    this.voices?.stopAll();
    this.engine.pause();
    this.state = 'paused';
    this.callbacks.onPauseChange(true);
  }

  resume(): void {
    if (this.state !== 'paused') return;
    const at = this.engine.songTimeAtPerf(performance.now());
    this.engine.start(at, RESUME_LEAD_IN_MS);
    // autoplay keysounds already past were cancelled by the pause; continue from here
    this.nextAutoKeysound = this.session.notes.findIndex((n) => n.t >= at);
    if (this.nextAutoKeysound < 0) this.nextAutoKeysound = this.session.notes.length;
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
    this.background.dispose();
  }

  private gaugeRule() {
    // Practice never fails: it always runs on the NORMAL gauge.
    return this.practice ? gaugeRules.NORMAL : gaugeRules[this.settings.gaugeType];
  }

  private begin(): void {
    const { request, buffer, bufferPlacement } = this.setup;
    const settings = this.settings;
    this.session = new GameSession(this.chart, this.table, {
      gauge: this.gaugeRule(),
      holdTickBeats: judgementConfig.hold.tickBeats,
      releaseGraceMs: judgementConfig.hold.releaseGraceMs * this.rate,
      missMarginMs: judgementConfig.missMarginMs * this.rate,
      ruleset: this.ruleset,
      sideLanes: sideLanesOf(this.chart.meta.keyMode),
      sideMissPercent: judgementConfig.sideMissPercent,
      fever: settings.fever,
      timeScale: this.rate,
    });
    this.renderer.reset();
    this.unsubscribe = this.session.on(this.onSessionEvent);
    this.laneNotes.length = 0;
    for (const n of this.session.notes) (this.laneNotes[n.lane] ??= []).push(n.index);
    this.nextAutoKeysound = 0;
    const recording = !request.autoPlay && !request.replay && !this.practice;
    this.recorder = recording ? new ReplayRecorder(this.session) : null;
    this.replayer = request.replay ? new ReplayPlayer(request.replay.log) : null;
    this.input = new InputManager(
      this.engine,
      bindingsFor(settings, this.chart.meta.keyMode),
      {
        press: (lane, t) => this.onPress(lane, t),
        release: (lane, t) => (this.recorder ? this.recorder.release(lane, t) : this.session.release(lane, t)),
      },
      settings.inputOffsetMs * this.rate,
      padBindingsFor(settings, this.chart.meta.keyMode),
    );
    this.auto = request.autoPlay ? new AutoPlayer(this.chart) : null;
    if (!request.autoPlay && !request.replay) {
      this.input.attach();
      this.pad = new GamepadPoller(this.onPad);
      this.pad.start();
    }
    this.engine.setBuffer(buffer, bufferPlacement, this.setup.lead);
    this.engine.setMusicVolume(settings.musicVolume);
    this.engine.setSfxVolume(settings.sfxVolume);
    if (this.practice) {
      const from = Math.max(bufferPlacement.originMs, this.firstNoteMs - PRACTICE_PREROLL_MS * this.rate);
      this.engine.start(from, 300);
    } else {
      this.engine.start(0, Math.max(MIN_LEAD_IN_MS, FIRST_NOTE_DELAY_MS - this.firstNoteMs));
    }
    this.state = 'running';
  }

  private teardownRun(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.input?.detach();
    this.pad?.stop();
    this.pad = null;
    this.voices?.stopAll();
    this.engine.stop();
  }

  /** Gamepad events: bound controls play lanes; Start (unbound) pauses and resumes. */
  private readonly onPad = (e: PadEvent): void => {
    if (this.input.handleKey(e.code, e.down, e.timeMs)) return;
    if (e.code === 'Pad:B9' && e.down) {
      if (this.state === 'running') this.pause();
      else if (this.state === 'paused') this.resume();
    }
  };

  /** A press: judged by the session, and with keysounds the judged (or the lane's next) note sounds. */
  private onPress(lane: number, timeMs: number): void {
    this.pressJudged = null;
    if (this.recorder) this.recorder.press(lane, timeMs);
    else this.session.press(lane, timeMs);
    this.pressSound(lane, timeMs);
  }

  private pressSound(lane: number, timeMs: number): void {
    if (!this.voices || this.setup.request.autoPlay) return;
    const index = this.pressJudged ?? this.nextNoteOf(lane, timeMs);
    const note = index !== null ? this.session.notes[index] : undefined;
    // the key went down at (judgement time + input offset); that moment has passed, so it sounds now
    if (note) this.voices.play(note, this.engine.contextTimeForSong(timeMs + this.settings.inputOffsetMs * this.rate));
  }

  private nextNoteOf(lane: number, timeMs: number): number | null {
    const notes = this.session.notes;
    for (const i of this.laneNotes[lane] ?? []) {
      if (notes[i].t >= timeMs) return notes[i].t - timeMs <= EMPTY_PRESS_REACH_MS * this.rate ? i : null;
    }
    return null;
  }

  /** Autoplay: schedule upcoming note keysounds on the song clock. */
  private scheduleAutoKeysounds(songNow: number): void {
    const voices = this.voices;
    if (!voices) return;
    const notes = this.session.notes;
    const horizon = songNow + KEYSOUND_LOOKAHEAD_MS * this.rate;
    while (this.nextAutoKeysound < notes.length && notes[this.nextAutoKeysound].t <= horizon) {
      const n = notes[this.nextAutoKeysound++];
      if (n.t >= songNow - KEYSOUND_LOOKAHEAD_MS * this.rate) voices.play(n, this.engine.contextTimeForSong(n.t));
    }
  }

  private rebuildScroll(): void {
    const covers = activeCovers(this.settings);
    this.scroll = new ScrollModel({
      trackLength: this.renderer.geometry.length,
      visibleMs: visibleTimeMs(this.settings.hiSpeed),
      lift: covers.lift,
      mode: this.settings.scrollMode,
      timing: this.chart.timing,
      rate: this.rate,
      durationMs: this.durationMs,
    });
    this.renderer.setCovers(covers);
  }

  private layout(): void {
    const rect = this.setup.canvas.getBoundingClientRect();
    this.renderer.resize(rect.width, rect.height);
    const [judge, combo] = HUD_POSITIONS[this.settings.judgePosition];
    const { judgeZ, travel } = this.scroll;
    this.hud.place({
      combo: this.renderer.project(0, 0, judgeZ - travel * combo),
      judge: this.renderer.project(0, 0, judgeZ - travel * judge),
    });
  }

  private readonly frame = (perfNow: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    this.engine.clock.sample();
    const songNow = this.engine.songTimeAtPerf(perfNow);
    const judgeNow = songNow - this.settings.inputOffsetMs * this.rate;
    const session = this.session;

    if (this.state === 'running') {
      if (this.auto) {
        for (const i of this.auto.take(judgeNow)) this.input.injectAt(i.lane, i.down, i.timeMs);
        this.scheduleAutoKeysounds(songNow);
      }
      if (this.replayer && !this.replayer.done) {
        // only the recorded calls, in the recorded order: the same result whatever the frame rate
        this.replayer.feed(session, judgeNow, (lane, t) => {
          this.pressJudged = null;
          this.pressSound(lane, t);
        });
      } else if (this.recorder) {
        this.recorder.update(judgeNow);
      } else {
        session.update(judgeNow);
      }
      const tail = (this.practice ? PRACTICE_END_MS : END_AFTER_LAST_NOTE_MS) * this.rate;
      if (session.finished && judgeNow > this.lastNoteEndMs + tail) this.beginEnding(perfNow, false);
    }
    if (this.state === 'ending' && perfNow >= this.finishAtPerf) this.finish();

    this.renderer.render(
      {
        timeMs: songNow + this.settings.visualOffsetMs * this.rate,
        scroll: this.scroll,
        notes: session.notes,
        heldNote: (lane) => session.heldNoteIndex(lane),
        keyDown: (lane) => session.isKeyDown(lane),
        barTimes: this.barTimes,
        fever: { active: session.fever.active, multiplier: session.fever.multiplier, remaining: session.fever.remaining(judgeNow) },
        camera: this.cameraFx.enabled ? this.cameraFx.at(songNow) : undefined,
      },
      perfNow,
    );
    this.background.update(songNow, this.state === 'running' || this.state === 'ending', perfNow);
    const start = this.practice ? this.firstNoteMs : 0;
    const end = this.practice ? this.lastNoteEndMs : this.durationMs;
    this.hud.update(perfNow, {
      score: this.scoreValue(),
      sub: this.subValue(),
      gauge: session.gauge.value,
      progress: end > start ? (songNow - start) / (end - start) : 0,
      ready: this.state === 'paused' ? '' : songNow < this.firstNoteMs - visibleTimeMs(this.settings.hiSpeed) * this.rate ? 'READY' : '',
      fever: {
        gauge: session.fever.gauge,
        active: session.fever.active,
        multiplier: session.fever.multiplier,
        remaining: session.fever.remaining(judgeNow),
        ready: session.fever.ready,
      },
      pace: this.pace(),
    });
  };

  private scoreValue(): number {
    switch (rulesetConfigs[this.settings.ruleset].scoring) {
      case 'weighted':
        return this.session.currentWeightedScore;
      case 'exscore':
        return this.session.currentExScore;
      default:
        return this.session.currentScore;
    }
  }

  private subValue(): string {
    const s = this.session;
    if (rulesetConfigs[this.settings.ruleset].scoring !== 'exscore') return `${(Math.floor(s.currentRate * 100) / 100).toFixed(2)}%`;
    const ratio = s.exPace > 0 ? s.currentExScore / s.exPace : 1;
    return `${this.ruleset.rank(ratio)} · ${(ratio * 100).toFixed(1)}%`;
  }

  /** Score difference to the pacemaker target at this point of the chart. */
  private pace(): number | null {
    if (this.paceTarget === null || this.session.judgeable === 0) return null;
    const share = this.session.judgedCount / this.session.judgeable;
    return this.session.currentScore - this.paceTarget * share * 1_000_000;
  }

  private practiceLabel(): string | null {
    const p = this.practice;
    if (!p) return null;
    return `PRACTICE ${this.rate.toFixed(2)}x · ${formatMs(p.startMs)}–${formatMs(p.endMs)}${p.loop ? ` · LOOP ${this.loops + 1}` : ''}`;
  }

  private beginEnding(perfNow: number, failed: boolean): void {
    if (this.state === 'ending' || this.state === 'done') return;
    if (this.practice?.loop && !failed) {
      this.loops++;
      this.hud.setPracticeLabel(this.practiceLabel() ?? '');
      this.restart();
      return;
    }
    this.state = 'ending';
    this.finishAtPerf = perfNow + BANNER_MS;
    this.input.detach();
    if (failed) this.engine.fadeOut(FAIL_FADE_MS);
    const lamp = this.session.result().lamp;
    if (this.practice) this.hud.showBanner('PRACTICE END', 'clear');
    else this.hud.showBanner(lamp, LAMP_CLASS[lamp]);
  }

  private finish(): void {
    this.state = 'done';
    this.engine.stop();
    const result = this.session.result();
    const s = this.settings;
    const replay: ReplayData | null = this.recorder
      ? {
          version: REPLAY_VERSION,
          chartId: this.chart.meta.chartId,
          songId: this.chart.meta.songId ?? null,
          recordedAt: Date.now(),
          settings: {
            judgementMode: s.judgementMode,
            ruleset: s.ruleset,
            gaugeType: s.gaugeType,
            fever: s.fever,
            placement: s.placement,
            placementSeed: this.placementSeed,
            hiSpeed: s.hiSpeed,
          },
          log: this.recorder.log,
          result: { score: result.score, rate: result.rate, maxCombo: result.maxCombo, lamp: result.lamp },
        }
      : null;
    this.callbacks.onFinish({ result, chart: this.chart, placement: this.placement, practice: this.practice, replay });
  }

  private readonly onSessionEvent = (e: SessionEvent): void => {
    const now = performance.now();
    if (e.type === 'judge') {
      if (e.kind !== 'tail' && e.errorMs !== null) this.pressJudged = e.noteIndex;
      this.hud.showJudge(e, now);
      if (!e.isBreak) this.renderer.hitEffect(e.lane, GRADE_PALETTES[this.settings.palette][e.cls] ?? 0xffffff, now);
      if (this.keysoundStem) {
        // the lead stem dips on a missed lead note and comes straight back on the next hit
        const src = this.session.notes[e.noteIndex]?.src;
        if (src === undefined || src === this.keysoundStem) {
          if (e.isBreak) this.engine.duckLead();
          else this.engine.restoreLead();
        }
      }
    } else if (e.type === 'tick') {
      this.hud.setCombo(e.combo);
    } else if (e.type === 'key' && e.down && this.settings.hitSound && !this.voices) {
      this.engine.playHitSound();
    } else if (e.type === 'fail') {
      this.beginEnding(now, true);
    }
  };

  private updateSettings(next: Settings, toast: string): void {
    this.settings = next;
    // a replay runs on its recorded judgement settings; keep only the viewer's visual changes
    const replay = this.setup.request.replay;
    this.callbacks.onSettingsChange(replay ? { ...next, ...judgementSettingsOf(null, this.setup.settings) } : next);
    this.rebuildScroll();
    this.layout();
    const green = Math.round(greenNumber(next.hiSpeed, activeCovers(next)));
    this.hud.showToast(`${toast} · HI-SPEED ${next.hiSpeed.toFixed(2)} · 녹색 ${green}`, performance.now());
  }

  private readonly onControlKey = (e: KeyboardEvent): void => {
    if (this.boundCodes.has(e.code) && !this.setup.request.autoPlay) return;
    const s = this.settings;
    const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
    switch (e.code) {
      case 'Escape':
        e.preventDefault();
        if (this.state === 'running') this.pause();
        else if (this.state === 'paused') this.resume();
        return;
      case 'F2':
        e.preventDefault();
        if (this.state !== 'done') this.restart();
        return;
      case FEVER_KEY:
        if (this.state === 'running' && s.fever === 'MANUAL' && !this.setup.request.replay) {
          e.preventDefault();
          const t = this.engine.songTimeAtPerf(performance.now()) - s.inputOffsetMs * this.rate;
          if (this.recorder) this.recorder.activateFever(t);
          else this.session.activateFever(t);
        }
        return;
      case 'ArrowUp':
      case 'ArrowDown': {
        e.preventDefault();
        const step = (e.shiftKey ? HI_SPEED_STEP_BIG : HI_SPEED_STEP) * (e.code === 'ArrowUp' ? 1 : -1);
        this.updateSettings({ ...s, hiSpeed: clampHiSpeed(s.hiSpeed + step) }, 'SPEED');
        return;
      }
      case 'PageUp':
      case 'PageDown': {
        e.preventDefault();
        const dir = e.code === 'PageDown' ? 1 : -1;
        if (e.shiftKey) {
          const lift = Math.min(MAX_LIFT, Math.max(0, s.lift + dir * COVER_STEP));
          const next = withCovers(s, { lift });
          this.updateSettings(next, `LIFT ${pct(next.lift)}`);
        } else {
          const sudden = Math.min(MAX_COVER, Math.max(0, s.sudden + dir * COVER_STEP));
          const next = withCovers(s, { sudden, coversOn: true });
          this.updateSettings(next, `SUDDEN+ ${pct(next.sudden)}`);
        }
        return;
      }
      case 'Home': {
        e.preventDefault();
        const next = withCovers(s, { coversOn: !s.coversOn });
        this.updateSettings(next, next.coversOn ? '커버 켬' : '커버 끔');
        return;
      }
    }
  };
}

/** The settings a replay must be judged with (or, with no replay, those of `base`). */
function judgementSettingsOf(replay: ReplayData | null, base?: Settings): Partial<Settings> {
  const src = replay?.settings ?? base;
  if (!src) return {};
  return { judgementMode: src.judgementMode, ruleset: src.ruleset, gaugeType: src.gaugeType, fever: src.fever, placement: src.placement };
}

/** Notes whose head lies inside the practice segment. */
function segmentOf(chart: Chart, p: PracticeOptions): Chart {
  return { ...chart, notes: chart.notes.filter((n) => n.t >= p.startMs && n.t <= p.endMs) };
}

function paceTarget(settings: Settings, request: PlayRequest): number | null {
  if (request.practice || settings.pacemaker === 'OFF') return null;
  if (settings.pacemaker === 'BEST') return request.best ? request.best.score / 1_000_000 : null;
  return Number(settings.pacemaker) / 100;
}

function formatMs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
