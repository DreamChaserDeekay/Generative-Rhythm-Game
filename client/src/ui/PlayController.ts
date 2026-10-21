import { getAudioEngine } from '../audio/AudioEngine';
import type { BufferPlacement } from '../audio/AudioEngine';
import { KeysoundVoices, type KeysoundBank } from '../audio/keysounds';
import { emptyPressNote, planStemKeysounds, StemKeysoundVoices, type StemKeysoundPlan } from '../audio/stemKeysounds';
import { AutoPlayer } from '../engine/autoplay';
import { cameraConfig, gaugeRules, judgementConfig, keyModes, sideLanesOf } from '../engine/config';
import { JudgementTable } from '../engine/judgement';
import { applyPlacement, placementLabels, type PlacementResult } from '../engine/placement';
import { REPLAY_VERSION, ReplayPlayer, ReplayRecorder, replayScores, type ReplayData } from '../engine/replay';
import { Ruleset, rulesetConfigs } from '../engine/ruleset';
import { ScrollModel } from '../engine/scroll';
import { GameSession, type SessionEvent, type SessionResult } from '../engine/session';
import { TempoMap } from '../engine/tempo';
import type { Chart, StemName } from '../engine/types';
import { GamepadPoller, type PadEvent } from '../input/gamepad';
import { InputManager } from '../input/InputManager';
import { CameraFx } from '../render/cameraFx';
import { GRADE_PALETTES } from '../render/palette';
import type { SkinArt } from '../render/skinArt';
import { skinById } from '../render/skins';
import { HUD_UNIT, styleOf, TrackRenderer } from '../render/TrackRenderer';
import {
  activeCovers,
  bindingsFor,
  clampHiSpeed,
  padBindingsFor,
  MAX_COVER,
  MAX_LIFT,
  visibleTimeMs,
  withCovers,
  type Settings,
} from '../settings/settings';
import type { PlayRequest, PracticeOptions } from './App';
import { difficultyChip } from './difficultyChip';
import { coverText, speedText } from './format';
import { Hud } from './Hud';
import { LAMP_CLASS } from './lamps';
import { PlayBackground } from './PlayBackground';
import { judgementChip, judgementSettingsOf, paceRatio, pacemakerLabel, playModeLabel } from './playRules';

export interface PlaySetup {
  request: PlayRequest;
  /** Decoded audio; null plays the chart silently (tests). */
  buffer: AudioBuffer | null;
  /** Stems a generated chart's keysounds play (same placement as `buffer`; empty = no keysounds). */
  stems?: ReadonlyMap<StemName, AudioBuffer>;
  /** Note keysounds of an imported chart (null = none). */
  keysounds?: KeysoundBank | null;
  /** Where the buffer sits on the song timeline (practice buffers are stretched segments). */
  bufferPlacement: BufferPlacement;
  settings: Settings;
  canvas: HTMLCanvasElement;
  hudRoot: HTMLElement;
  bgRoot: HTMLElement;
  /** Textures of the skin, loaded beforehand (null = drawn in code); the renderer disposes them. */
  art?: SkinArt | null;
  /** The replay of the best play (BEST pacemaker), when it was kept and loaded. */
  bestReplay?: ReplayData | null;
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

/**
 * What the pacemaker compares the score with, in the unit the HUD shows it: a share of the most
 * that could have been scored so far, the best play's score after as many judgements (its replay),
 * or that best spread evenly over the chart (a best without its replay, base score only).
 */
type Pacer = { kind: 'share'; ratio: number } | { kind: 'ghost'; scores: number[] } | { kind: 'line'; score: number };

const MIN_LEAD_IN_MS = 1500;
const FIRST_NOTE_DELAY_MS = 3000;
const RESUME_LEAD_IN_MS = 1500;
const END_AFTER_LAST_NOTE_MS = 1500;
const PRACTICE_PREROLL_MS = 2000;
const PRACTICE_END_MS = 900;
const BANNER_MS = 1800;
const FAIL_FADE_MS = 700;
/** The song fades out under the end banner instead of stopping dead. */
const END_FADE_MS = 1500;
/** READY shows this long before the first note comes into sight, and over a resume's rewind. */
const READY_MS = 1500;
/** A first note more than this far off (real ms) can be skipped to: up to this long before it (or READY). */
const SKIP_MIN_MS = 5000;
const SKIP_LEAD_MS = 2500;
const HI_SPEED_STEP = 0.1;
const HI_SPEED_STEP_BIG = 0.5;
const COVER_STEP = 0.025;
/** Fires a manual FEVER; before a long intro's first note (no FEVER to fire yet) it skips to it. */
const FEVER_KEY = 'Enter';
/** Autoplay keysounds are scheduled this far ahead so they land exactly on the notes. */
const KEYSOUND_LOOKAHEAD_MS = 120;
/** An empty press plays the lane's next note if it is at most this far ahead (BMS). */
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
  private readonly pacer: Pacer | null;
  /** Where the BPM changes (song ms), for the BPM under SPEED; the one in effect. */
  private readonly bpmChanges: { ms: number; bpm: number }[];
  private bpmAt = 0;
  private readonly cameraFx: CameraFx;
  private readonly background: PlayBackground;
  /** Note keysounds (imported BMS/bmson charts). */
  private readonly voices: KeysoundVoices | null;
  /** Keysounds of a generated chart: slices of the stems, planned for each run's notes. */
  private stemPlan: StemKeysoundPlan | null = null;
  private stemVoices: StemKeysoundVoices | null = null;
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
  /** While paused the track is drawn again only after a change (a resize). */
  private redrawPaused = false;
  private finishAtPerf = 0;
  /** Song times: where the run starts (its progress), when the first note comes into sight below
   * SUDDEN+, where READY starts, where a skip lands (null: none) and where a resume's rewind ends. */
  private runStartMs = 0;
  private firstInSight = 0;
  private readyFrom = 0;
  private skipTo: number | null = null;
  private resumeUntil = -Infinity;
  private loops = 0;
  private raf = 0;
  /** The renderer's hudVersion the HUD was last laid for. */
  private hudVersion = -1;
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
    const skin = skinById(settings.skin, settings.customSkin);
    this.renderer = new TrackRenderer(setup.canvas, {
      mode,
      camera,
      trackWidth: cameraConfig.trackWidth * settings.laneWidthScale,
      trackLength: cameraConfig.trackLength,
      palette: settings.palette,
      reducedFlash: settings.reducedFlash,
      covers: activeCovers(settings),
      skin,
      art: setup.art,
      barLines: settings.barLines,
      keyBeamLength: settings.keyBeamLength,
      hitEffectSize: settings.hitEffectSize,
    });
    this.cameraFx = new CameraFx(this.chart.effects ?? [], this.chart.timing, settings.cameraFx * (settings.reducedFlash ? 0.5 : 1));
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
      bgaYoutube: settings.bga ? (request.background?.bgaYoutube ?? null) : null,
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
    const tempo = new TempoMap(this.chart.timing);
    this.barTimes = tempo.barLines(this.durationMs);
    this.bpmChanges = tempo.bpmChanges();
    this.pacer = pacerFor(settings, request, setup.bestReplay ?? null);

    const gauge = this.gaugeRule();
    const rules = rulesetConfigs[settings.ruleset];
    this.hud = new Hud(
      setup.hudRoot,
      {
        title: this.chart.meta.title,
        keyMode: this.chart.meta.keyMode,
        difficulty: difficultyChip(this.chart.meta),
        mode: request.replay ? 'replay' : request.autoPlay ? 'auto' : this.practice ? 'practice' : 'play',
        chips: [playModeLabel(request), judgementChip(settings.judgementMode)].filter((c): c is string => c !== null),
        keysounds: this.keysoundStems(),
        scoreLabel: rules.scoring === 'exscore' ? 'EX-SCORE' : 'SCORE',
        subLabel: rules.scoring === 'exscore' ? 'RANK' : 'RATE',
        gaugeLabel: gauge.label,
        gaugeClear: gauge.clear,
        survivalGauge: gauge.failAtZero,
        feverEnabled: settings.fever !== 'OFF',
        feverManualKey: settings.fever === 'MANUAL' ? FEVER_KEY : null,
        // a pacer with nothing to follow still shows its row (a dash), so a chosen BEST never just vanishes
        pacemakerLabel: this.practice || settings.pacemaker === 'OFF' ? null : pacemakerLabel(settings.pacemaker),
        type: styleOf(skin).type,
        judgementOpacity: settings.judgementOpacity,
        counterMissLabel: settings.judgeCounter ? rules.missLabel : null,
        showBpm: this.bpmChanges.length > 1 || settings.scrollMode === 'beat',
        skipKey: FEVER_KEY,
      },
      settings.showErrorMs,
      settings.reducedFlash,
    );
    this.hud.setSpeed(settings.hiSpeed);
    // the practice's rate and stretch (and its loop, see beginEnding) show for a moment
    if (this.practice) this.hud.showToast(this.practiceLabel() ?? '', performance.now());

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
    this.stemVoices?.stopAll();
    this.engine.pause();
    this.state = 'paused';
    this.redrawPaused = true;
    this.callbacks.onPauseChange(true);
  }

  resume(): void {
    if (this.state !== 'paused') return;
    const at = this.engine.songTimeAtPerf(performance.now());
    this.engine.start(at, RESUME_LEAD_IN_MS);
    // the song rewinds a little: READY until it is back where it stopped
    this.resumeUntil = at;
    // autoplay keysounds already past were cancelled by the pause; continue from here
    this.nextAutoKeysound = this.session.notes.findIndex((n) => n.t >= at);
    if (this.nextAutoKeysound < 0) this.nextAutoKeysound = this.session.notes.length;
    this.input.enabled = true;
    this.state = 'running';
    this.callbacks.onPauseChange(false);
  }

  restart(): void {
    this.teardownRun();
    this.hud.reset();
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
    const stems = this.setup.stems ?? new Map<StemName, AudioBuffer>();
    this.stemPlan = stems.size > 0 && !this.voices ? planStemKeysounds(this.session.notes, this.durationMs, [...stems.keys()]) : null;
    const plan = this.stemPlan;
    this.stemVoices = plan ? new StemKeysoundVoices(this.engine.ctx, this.engine.keysoundBus, plan, stems, bufferPlacement) : null;
    const cuts = plan ? plan.stems.map((stem) => ({ buffer: stems.get(stem) as AudioBuffer, ranges: plan.ranges[stem] ?? [] })) : [];
    this.engine.setBuffer(buffer, bufferPlacement, cuts);
    this.engine.setMusicVolume(settings.musicVolume);
    this.engine.setSfxVolume(settings.sfxVolume);
    if (this.practice) {
      const from = Math.max(bufferPlacement.originMs, this.firstNoteMs - PRACTICE_PREROLL_MS * this.rate);
      this.engine.start(from, 300);
      this.runStartMs = from;
    } else {
      this.engine.start(0, Math.max(MIN_LEAD_IN_MS, FIRST_NOTE_DELAY_MS - this.firstNoteMs));
      this.runStartMs = 0;
    }
    this.resumeUntil = -Infinity;
    this.bpmAt = 0;
    this.state = 'running';
  }

  private teardownRun(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.input?.detach();
    this.pad?.stop();
    this.pad = null;
    this.voices?.stopAll();
    this.stemVoices?.stopAll();
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
    if (this.recorder) this.recorder.press(lane, timeMs);
    else this.session.press(lane, timeMs);
    this.pressSound(lane, timeMs);
  }

  /**
   * The sound of a press, after the session judged it. Imported keysound charts play the judged
   * note's sample. An empty press (a "ghost note") plays the lane's next note, or its last one:
   * its sample, or for generated charts the start of its slice over the song (a hit's slice is
   * played by the judgement itself).
   */
  private pressSound(lane: number, timeMs: number): void {
    const judged = this.pressJudged;
    this.pressJudged = null;
    if (this.setup.request.autoPlay || (!this.voices && !this.stemVoices)) return;
    const notes = this.session.notes;
    const index = judged ?? emptyPressNote(this.laneNotes[lane] ?? [], (i) => notes[i].t, timeMs);
    const note = index !== null ? notes[index] : undefined;
    if (!note) return;
    if (this.voices) {
      // the key went down at (judgement time + input offset); that moment has passed, so it sounds now
      this.voices.play(note, this.engine.contextTimeForSong(timeMs + this.settings.inputOffsetMs * this.rate));
    } else if (judged === null) {
      const slice = this.stemPlan?.noteSlice[note.index] ?? null;
      if (slice !== null) this.stemVoices?.ghost(slice, this.engine.ctx.currentTime);
    }
  }

  /** Autoplay: schedule upcoming note keysounds on the song clock. */
  private scheduleAutoKeysounds(songNow: number): void {
    const { voices, stemVoices, stemPlan } = this;
    if (!voices && !stemVoices) return;
    const notes = this.session.notes;
    const horizon = songNow + KEYSOUND_LOOKAHEAD_MS * this.rate;
    while (this.nextAutoKeysound < notes.length && notes[this.nextAutoKeysound].t <= horizon) {
      const n = notes[this.nextAutoKeysound++];
      if (n.t < songNow - KEYSOUND_LOOKAHEAD_MS * this.rate) continue;
      if (voices) voices.play(n, this.engine.contextTimeForSong(n.t));
      const slice = stemPlan?.noteSlice[n.index] ?? null;
      if (stemVoices && slice !== null) stemVoices.play(slice, this.engine.contextTimeForSong(stemPlan!.slices[slice].startMs));
    }
  }

  /** The stems a generated chart's keysounds come from (none without them). */
  private keysoundStems(): string[] {
    const stems = this.setup.stems;
    if (!stems || stems.size === 0 || this.voices) return [];
    return planStemKeysounds(this.chart.notes, this.durationMs, [...stems.keys()])?.stems ?? [];
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
    // the first note comes into sight at the SUDDEN+ edge (drawn the visual offset early); READY
    // shows just before, and a skip lands before READY (and a little before the note at least)
    this.firstInSight = this.scroll.timeAt(this.firstNoteMs, this.scroll.travel * (1 - covers.sudden)) - this.settings.visualOffsetMs * this.rate;
    this.readyFrom = this.firstInSight - READY_MS * this.rate;
    this.skipTo = this.practice ? null : Math.min(this.readyFrom, this.firstNoteMs - SKIP_LEAD_MS * this.rate);
  }

  /**
   * The intro can be skipped: the first note is more than SKIP_MIN_MS away and the skip lands
   * ahead (and its key is not a lane key of one's own play, which the lanes take first).
   */
  private canSkip(songNow: number): boolean {
    if (this.boundCodes.has(FEVER_KEY) && !this.setup.request.autoPlay) return false;
    return this.state === 'running' && this.skipTo !== null && this.firstNoteMs - songNow > SKIP_MIN_MS * this.rate && this.skipTo > songNow;
  }

  /** Jumps over the intro. Nothing before the first note is judged, so the result is the same. */
  private skipIntro(): void {
    if (this.skipTo === null) return;
    this.engine.start(this.skipTo, 0);
  }

  /** The chart's BPM at song time `ms` (the changes are walked from the last one, a frame at a time). */
  private bpmNow(ms: number): number {
    const changes = this.bpmChanges;
    if (changes.length === 0) return 0;
    while (this.bpmAt + 1 < changes.length && changes[this.bpmAt + 1].ms <= ms) this.bpmAt++;
    while (this.bpmAt > 0 && changes[this.bpmAt].ms > ms) this.bpmAt--;
    return changes[this.bpmAt].bpm;
  }

  private layout(): void {
    const rect = this.setup.canvas.getBoundingClientRect();
    this.renderer.resize(rect.width, rect.height);
    this.redrawPaused = true;
    this.hud.fit();
    this.placeHud();
  }

  /** Lays the HUD on the track as the camera shows it now (its parts sized for the screen where they lie). */
  private placeHud(): void {
    const [judge, combo] = HUD_POSITIONS[this.settings.judgePosition];
    const { travel } = this.scroll;
    this.hud.layoutPlane(this.renderer.hudPlane(), travel * judge * HUD_UNIT, travel * combo * HUD_UNIT);
    this.hudVersion = this.renderer.hudVersion;
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
        this.replayer.feed(session, judgeNow, (lane, t) => this.pressSound(lane, t));
      } else if (this.recorder) {
        this.recorder.update(judgeNow);
      } else {
        session.update(judgeNow);
      }
      const tail = (this.practice ? PRACTICE_END_MS : END_AFTER_LAST_NOTE_MS) * this.rate;
      if (session.finished && judgeNow > this.lastNoteEndMs + tail) this.beginEnding(perfNow, false);
    }
    if (this.state === 'ending' && perfNow >= this.finishAtPerf) this.finish();

    // A paused picture stays still and is drawn again only after a change (under the pause menu's
    // former backdrop blur, drawing it every frame ran at a few frames per second without a GPU).
    if (this.state !== 'paused' || this.redrawPaused) {
      this.redrawPaused = false;
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
      // the HUD lying on the track follows the camera's tilt and zoom
      if (this.renderer.hudVersion !== this.hudVersion) {
        this.hudVersion = this.renderer.hudVersion;
        this.hud.movePlane(this.renderer.hudPlane());
      }
    }
    this.background.update(songNow, this.state === 'running' || this.state === 'ending', perfNow);
    this.hud.update(perfNow, {
      score: this.scoreValue(),
      sub: this.subValue(),
      maxCombo: session.maxCombo,
      gauge: session.gauge.value,
      ready: this.state !== 'paused' && ((songNow >= this.readyFrom && songNow < this.firstInSight) || songNow < this.resumeUntil) ? 'READY' : '',
      fever: {
        gauge: session.fever.gauge,
        active: session.fever.active,
        multiplier: session.fever.multiplier,
        remaining: session.fever.remaining(judgeNow),
        ready: session.fever.ready,
      },
      pace: this.pace(),
      progress: (songNow - this.runStartMs) / Math.max(1, this.lastNoteEndMs - this.runStartMs),
      remainingMs: (this.lastNoteEndMs - songNow) / this.rate,
      // the tempo heard: a slowed practice slows it too
      bpm: Math.round(this.bpmNow(songNow) * this.rate),
      skip: this.canSkip(songNow),
      breaks: session.breakCount,
      fast: session.fastCount,
      slow: session.slowCount,
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

  /** The score shown less the pacemaker's at this point of the chart (the same unit: base, weighted or EX); null: nothing to compare with. */
  private pace(): number | null {
    const p = this.pacer;
    const s = this.session;
    if (p === null || s.judgeable === 0) return null;
    const score = this.scoreValue();
    if (p.kind === 'ghost') return score - p.scores[Math.min(s.judgedCount, p.scores.length - 1)];
    const share = s.judgedCount / s.judgeable;
    if (p.kind === 'line') return score - p.score * share;
    // the most that could have been scored so far: two EX a judgement, or the share of 1,000,000
    const most = rulesetConfigs[this.settings.ruleset].scoring === 'exscore' ? s.exPace : share * 1_000_000;
    return score - p.ratio * most;
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
      this.restart();
      this.hud.showToast(this.practiceLabel() ?? '', perfNow);
      return;
    }
    this.state = 'ending';
    this.finishAtPerf = perfNow + BANNER_MS;
    this.input.detach();
    // the song fades under the banner (quickly on a failure) instead of stopping dead
    this.engine.fadeOut(failed ? FAIL_FADE_MS : END_FADE_MS);
    const lamp = this.session.result().lamp;
    // autoplay and practice earn no lamp: a plain banner
    if (this.practice) this.hud.showBanner('PRACTICE END', 'aided');
    else if (this.setup.request.autoPlay) this.hud.showBanner('AUTO PLAY', 'aided');
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
      if (!e.isBreak) this.renderer.hitEffect(e.lane, GRADE_PALETTES[this.settings.palette][e.cls] ?? 0xffffff, now, e.noteIndex);
      if (this.stemVoices && !this.setup.request.autoPlay && e.kind !== 'tail' && e.errorMs !== null) {
        // a hit plays its slice of the stem right away; a missed note leaves it silent, and a press
        // judged BREAK sounds like an empty press (the start of its slice over the song)
        const slice = this.stemPlan?.noteSlice[e.noteIndex] ?? null;
        if (slice !== null && !e.isBreak) this.stemVoices.play(slice, this.engine.ctx.currentTime);
        else if (slice !== null) this.stemVoices.ghost(slice, this.engine.ctx.currentTime);
      }
    } else if (e.type === 'tick') {
      this.hud.setCombo(e.combo);
    } else if (e.type === 'key' && e.down && this.settings.hitSound && !this.voices && !this.stemVoices) {
      this.engine.playHitSound();
    } else if (e.type === 'fail') {
      this.beginEnding(now, true);
    }
  };

  /** An in-play change of SPEED or the covers, kept for the next play; `toast` names it once. */
  private updateSettings(next: Settings, toast: string): void {
    this.settings = next;
    // a replay runs on its recorded judgement settings; keep only the viewer's visual changes
    const replay = this.setup.request.replay;
    this.callbacks.onSettingsChange(replay ? { ...next, ...judgementSettingsOf(null, this.setup.settings) } : next);
    this.rebuildScroll();
    this.layout();
    this.hud.setSpeed(next.hiSpeed);
    this.hud.showToast(toast, performance.now());
  }

  /** A cover's toast; one moved with the visible time kept moves SPEED too, and names it as well. */
  private coverToast(text: string, next: Settings): string {
    return next.hiSpeed !== this.settings.hiSpeed ? `${text} · SPEED ${speedText(next.hiSpeed)}` : text;
  }

  private readonly onControlKey = (e: KeyboardEvent): void => {
    if (this.boundCodes.has(e.code) && !this.setup.request.autoPlay) return;
    const s = this.settings;
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
      case FEVER_KEY: {
        if (this.canSkip(this.engine.songTimeAtPerf(performance.now()))) {
          e.preventDefault();
          if (!e.repeat) this.skipIntro();
          return;
        }
        if (this.state === 'running' && s.fever === 'MANUAL' && !this.setup.request.replay) {
          e.preventDefault();
          const t = this.engine.songTimeAtPerf(performance.now()) - s.inputOffsetMs * this.rate;
          if (this.recorder) this.recorder.activateFever(t);
          else this.session.activateFever(t);
        }
        return;
      }
      case 'ArrowUp':
      case 'ArrowDown': {
        // SPEED only while the song runs: paused, ↑↓ move the pause menu's focus (as a gamepad's
        // d-pad does, whose keys the menu bridge sends)
        if (!e.isTrusted || this.state !== 'running') return;
        e.preventDefault();
        const step = (e.shiftKey ? HI_SPEED_STEP_BIG : HI_SPEED_STEP) * (e.code === 'ArrowUp' ? 1 : -1);
        const hiSpeed = clampHiSpeed(s.hiSpeed + step);
        this.updateSettings({ ...s, hiSpeed }, `SPEED ${speedText(hiSpeed)}`);
        return;
      }
      case 'PageUp':
      case 'PageDown': {
        if (this.state !== 'running') return;
        e.preventDefault();
        const dir = e.code === 'PageDown' ? 1 : -1;
        if (e.shiftKey) {
          const lift = Math.min(MAX_LIFT, Math.max(0, s.lift + dir * COVER_STEP));
          const next = withCovers(s, { lift });
          this.updateSettings(next, this.coverToast(`LIFT ${coverText(next.lift)}`, next));
        } else {
          const sudden = Math.min(MAX_COVER, Math.max(0, s.sudden + dir * COVER_STEP));
          const next = withCovers(s, { sudden, coversOn: true });
          this.updateSettings(next, this.coverToast(`SUDDEN+ ${coverText(next.sudden)}`, next));
        }
        return;
      }
      case 'Home': {
        if (this.state !== 'running') return;
        e.preventDefault();
        const next = withCovers(s, { coversOn: !s.coversOn });
        this.updateSettings(next, this.coverToast(next.coversOn ? '커버 켬' : '커버 끔', next));
        return;
      }
    }
  };
}

/** Notes whose head lies inside the practice segment. */
function segmentOf(chart: Chart, p: PracticeOptions): Chart {
  return { ...chart, notes: chart.notes.filter((n) => n.t >= p.startMs && n.t <= p.endMs) };
}

/** What the pacemaker follows; null for none, or a BEST with nothing to follow (no record, or one known by its base score under another unit). */
function pacerFor(settings: Settings, request: PlayRequest, bestReplay: ReplayData | null): Pacer | null {
  if (request.practice || settings.pacemaker === 'OFF') return null;
  if (settings.pacemaker !== 'BEST') return { kind: 'share', ratio: paceRatio(settings.pacemaker) ?? 1 };
  const best = request.best;
  if (!best) return null;
  const replay = best.replay ?? bestReplay;
  if (replay) {
    try {
      const scores = replayScores(request.chart, replay, settings.ruleset);
      if (scores) return { kind: 'ghost', scores };
    } catch {
      // a replay the server kept but this version cannot judge again: as if there were none
    }
  }
  // known by its base score alone, the best is paced only where that is the score shown
  return rulesetConfigs[settings.ruleset].scoring === 'rate' ? { kind: 'line', score: best.score } : null;
}

function formatMs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
