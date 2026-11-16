import { api } from '../api/client';
import { getAudioEngine } from '../audio/AudioEngine';
import type { BufferPlacement } from '../audio/AudioEngine';
import { KeysoundVoices, type KeysoundBank } from '../audio/keysounds';
import { MUFFLED_CUTOFF_HZ } from '../audio/songPreview';
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
import { GamepadPoller, padCodeLabel, type PadEvent } from '../input/gamepad';
import { InputManager } from '../input/InputManager';
import { PadPlayControls, type PadPlayAction } from '../input/padPlay';
import { laneTakes, playActionsOf, type PlayAction } from '../input/playKeys';
import { CameraFx, type CameraPoseFx } from '../render/cameraFx';
import { hexString } from '../render/noteColors';
import { GRADE_COLORS } from '../render/palette';
import type { SkinArt } from '../render/skinArt';
import {
  entryPose,
  entryShare,
  exitPose,
  failFrame,
  fallOrder,
  introEnd,
  introFrame,
  lightOrder,
  litFrame,
  outroFrame,
  planIntro,
  resumeLine,
  tapeStopTime,
  type IntroPlan,
  type StageFrame,
  type StagePose,
} from '../render/stageFx';
import { hudTypeFor } from '../render/gearHud';
import { HUD_UNIT, TrackRenderer } from '../render/TrackRenderer';
import { LONG_OF } from '../render/tintArt';
import {
  activeCovers,
  bindingLabel,
  bindingsFor,
  clampHiSpeed,
  laneColorsOf,
  laneKeysFor,
  padBindingsFor,
  padPlayOf,
  playKeysOf,
  MAX_COVER,
  MAX_JUDGE_LINE,
  MIN_JUDGE_LINE,
  secondBindingsFor,
  skinOf,
  songOffsetOf,
  visibleTimeMs,
  withCovers,
  withSongOffset,
  type Settings,
} from '../settings/settings';
import type { PlayRequest, PracticeOptions } from './App';
import { difficultyChip } from './difficultyChip';
import { loadEndArt } from './endArt';
import { coverText, judgeLineText, speedText } from './format';
import { Hud } from './Hud';
import { LAMP_CLASS } from './lamps';
import { PlayBackground } from './PlayBackground';
import { practiceRunStart } from './practiceLead';
import { offsetText } from './resultBreakdown';
import { leadingStem } from './songArt';
import { judgementChip, judgementSettingsOf, paceRatio, pacemakerLabel, playbackRateText, playedSettings, playModeLabel } from './playRules';
import { keyPairNames, offsetStep, syncKeyOf, syncTestKeys, type SyncTestKeys } from './visualSync';

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
  /** The parts' pictures and the hit's flipbooks, loaded beforehand (null = drawn in code); the renderer disposes them. */
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
  /** The loop of a looped practice this is the result of (shown on leaving it). */
  loop?: number;
  /** The inputs of this play (null for autoplay, practice, replays and the sync test). */
  replay: ReplayData | null;
  /**
   * The judgement offsets the play ran on (ms), the player's and the song's own, as they were at
   * its end (a replay's as it kept them; null: one kept before they were), and each change of
   * them in play (the song's own with − / =, the player's in the sync test): after how many of the
   * result's hits, by how much (song ms).
   */
  offsets: { input: number; song: number; shifts: OffsetShift[] } | null;
}

/** A change of the judgement offset in play: the hits judged before it were judged on the old one. */
export interface OffsetShift {
  hits: number;
  ms: number;
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
const PRACTICE_END_MS = 900;
/**
 * An end (real ms from where it begins): the lanes go out and the song goes out muffled over MUFFLE_MS, the
 * lamp shows LAMP_AT_MS in, and the result follows END_MS in. A play that earns no lamp (practice, autoplay)
 * shows its words at once and ends AIDED_END_MS in, as it always did.
 */
const LAMP_AT_MS = 480;
const END_MS = 2500;
const AIDED_END_MS = 1800;
const MUFFLE_MS = 1900;
/**
 * A play that fails halfway: the song runs down over TAPE_MS as the notes come to a standstill, FAILED shows
 * FAIL_LAMP_AT_MS in, and the result follows FAIL_END_MS in (the lanes have dropped away by then).
 */
const TAPE_MS = 1300;
const FAIL_LAMP_AT_MS = 420;
const FAIL_END_MS = 2900;
/** An all-perfect play's end: the hit's effect on each lane in turn across the track and back, this far apart. */
const WAVE_STEP_MS = 70;
const WAVE_PASSES = 2;
/** A start is over for the camera this long after the run began (its spring is at rest long before). */
const ENTRY_OVER_MS = 6000;
/** A first note more than this far off (real ms) can be skipped to: up to this long before it, and SKIP_SIGHT_MS before it comes into sight. */
const SKIP_MIN_MS = 5000;
const SKIP_LEAD_MS = 2500;
const SKIP_SIGHT_MS = 1500;
/** What a press moves SPEED or the song offset (ms) by, per function. */
const STEPS: Partial<Record<PlayAction, number>> = {
  speedDown: -0.1,
  speedUp: 0.1,
  speedDownBig: -0.5,
  speedUpBig: 0.5,
  offsetDown: -1,
  offsetUp: 1,
  offsetDownBig: -5,
  offsetUpBig: 5,
};
const COVER_STEP = 0.025;
/** 판정선 위치 moves by this in play (10 px of the sheets' track). */
const JUDGE_LINE_STEP = 0.05;
/** Autoplay keysounds are scheduled this far ahead so they land exactly on the notes. */
const KEYSOUND_LOOKAHEAD_MS = 120;
/** An empty press plays the lane's next note if it is at most this far ahead (BMS). */
/** Judgement text and combo distance up the track, as shares of the travel distance. */
const HUD_POSITIONS = { low: [0.08, 0.36], mid: [0.16, 0.42], high: [0.32, 0.56] } as const;

/** No start to show: every lane lit, the judge line whole. */
const NO_INTRO: IntroPlan = { laneAt: [], lineFrom: -Infinity, lineTo: -Infinity };

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
  /** Keyboard keys of the lanes (read first: a function on one of them does not work). */
  private readonly boundCodes: Set<string>;
  /** Keys of the in-play functions, and the pad's (Start, Select, FEVER). */
  private readonly keys: Record<PlayAction, string>;
  private readonly padControls: PadPlayControls;
  /** The song whose own offset applies (null: the sync test, no song). */
  private readonly songId: string | null;
  /** The sync test's keys for its offsets (those no lane takes; null: no sync test). */
  private readonly syncKeys: SyncTestKeys | null;
  /** The intro skip's key as the HUD names it (null: nothing works it). */
  private readonly skipLabel: string | null;
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
  /** The song offset's changes in this run (see PlayOutcome.offsets). */
  private offsetShifts: OffsetShift[] = [];
  /** Gamepad / controller lanes, polled apart from the frames. */
  private pad: GamepadPoller | null = null;
  private readonly placementSeed: number;
  private unsubscribe: (() => void) | null = null;
  private state: PlayState = 'running';
  /** While paused the track is drawn again only after a change (a resize). */
  private redrawPaused = false;
  private finishAtPerf = 0;
  /** Song times: where the run starts (its progress), when the first note comes into sight below
   * SUDDEN+, where a skip lands (null: none) and where a resume's rewind ends. */
  private runStartMs = 0;
  private firstInSight = 0;
  private skipTo: number | null = null;
  private resumeUntil = -Infinity;
  private readonly tempo: TempoMap;
  /**
   * The run's start and end as the track shows them (stageFx; only drawn): the lanes with a floor from the
   * middle outward and in the order a failed play drops them, the frame handed to the renderer, this run's
   * start (its plan, the song time it is over at, the song time the run began at, how much of the camera's
   * way in it has), and the next start left out (a practice loop's next round).
   */
  private readonly lit: number[];
  private readonly falls: number[];
  private readonly stage: StageFrame;
  private intro: IntroPlan = { laneAt: [], lineFrom: -Infinity, lineTo: -Infinity };
  private introOver = -Infinity;
  private runFromMs = 0;
  private entry = 0;
  private quietStart = false;
  /** How far the camera moves for a start and an end: the settings' 카메라 연출 (as the chart's cues), none under 동작 줄이기. */
  private readonly cameraStrength: number;
  /** 동작 줄이기 (prefers-reduced-motion): nothing runs in turn or moves. */
  private readonly still: boolean;
  /**
   * The end under way: when it began (real ms, and the song time), whether the play failed halfway, the
   * lamp it shows (its words and class) from when, whether it shows yet, and the next lane of an all-perfect
   * play's wave.
   */
  private ending: { at: number; songMs: number; failed: boolean; text: string; kind: string; lampAt: number; shown: boolean; wave: number } | null = null;
  /** What the canvas says of it (data-stage; not shown). */
  private stageName = '';
  /** The camera's pose by the chart's cues in the last frame, and what a start or an end added to it (null: nothing). */
  private chartPose: CameraPoseFx | null = null;
  private stagedPose: StagePose | null = null;
  private loops = 0;
  /** What the last loop of a looped practice came to (leaving shows it). */
  private lastLoop: PlayOutcome | null = null;
  private raf = 0;
  /** The renderer's hudVersion the HUD was last laid for. */
  private hudVersion = -1;
  private readonly resizeObserver: ResizeObserver;

  constructor(setup: PlaySetup, callbacks: PlayCallbacks) {
    this.setup = setup;
    this.callbacks = callbacks;
    const { request } = setup;
    // a replay plays under the judgement settings it was recorded with, an editor test on the chart as written
    const settings = playedSettings(request, setup.settings);
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
    const skin = skinOf(settings);
    const laneColors = laneColorsOf(settings, this.chart.meta.keyMode);
    this.renderer = new TrackRenderer(setup.canvas, {
      mode,
      camera,
      trackWidth: cameraConfig.trackWidth * settings.laneWidthScale,
      trackLength: cameraConfig.trackLength,
      reducedFlash: settings.reducedFlash,
      covers: activeCovers(settings),
      skin,
      art: setup.art,
      barLines: settings.barLines,
      keyBeamLength: settings.keyBeamLength,
      hitEffectSize: settings.hitEffectSize,
      sideNotes: settings.sideNotes,
      laneColors,
    });
    // how a mode's side lanes are drawn (data-side-notes on the canvas; not shown)
    if (mode.lanes.some((l) => l.kind === 'side')) setup.canvas.dataset.sideNotes = this.renderer.geometry.lanes.some((l) => l.over) ? 'half' : 'lanes';
    // what the gear is drawn with: the parts picked (data-style; not shown)
    const style = skin.style;
    setup.canvas.dataset.style = [style.note, LONG_OF[style.note], style.side, style.deck, style.hit].join(' ');
    // and which of them are drawn from art (data-art; not shown)
    setup.canvas.dataset.art = this.renderer.artParts;
    // and in which colours, lane by lane (data-lane-colors; not shown)
    setup.canvas.dataset.laneColors = laneColors.map(hexString).join(' ');
    this.cameraFx = new CameraFx(this.chart.effects ?? [], this.chart.timing, settings.cameraFx * (settings.reducedFlash ? 0.5 : 1));
    this.voices =
      setup.keysounds && this.chart.sounds
        ? new KeysoundVoices(this.engine.ctx, this.engine.keysoundBus, setup.keysounds, this.chart.sounds)
        : null;
    this.engine.setKeysoundGain(setup.keysounds?.gain ?? 1);
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
    const keyMode = this.chart.meta.keyMode;
    this.boundCodes = new Set(laneKeysFor(settings, keyMode));
    this.keys = playKeysOf(settings);
    this.songId = request.chart.meta.songId ?? null;
    // on autoplay the lanes take no key
    this.syncKeys = request.syncTest ? syncTestKeys(request.autoPlay ? [] : [...this.boundCodes], !request.autoPlay) : null;
    // a pad button that is also a lane's plays the lane (the settings mark it)
    const padLanes = padBindingsFor(settings, keyMode);
    const free = (code: string | null) => (code && !padLanes.includes(code) ? code : null);
    const buttons = padPlayOf(settings);
    this.padControls = new PadPlayControls(
      { start: free(buttons.start), select: free(buttons.select), fever: free(buttons.fever) },
      mode.lanes.flatMap((l, i) => (l.kind === 'key' ? [padLanes[i]] : [])),
    );
    this.skipLabel = this.triggerLabel('skip');

    const notes = this.chart.notes;
    this.firstNoteMs = notes.length > 0 ? Math.min(...notes.map((n) => n.t)) : 0;
    this.lastNoteEndMs = notes.length > 0 ? Math.max(...notes.map((n) => n.endT ?? n.t)) : 0;
    const { originMs } = setup.bufferPlacement;
    const audioMs = setup.buffer ? originMs + setup.buffer.duration * 1000 * this.rate : 0;
    this.durationMs = Math.max(audioMs, request.chart.meta.durationMs ?? 0, this.lastNoteEndMs);
    const tempo = new TempoMap(this.chart.timing);
    this.tempo = tempo;
    this.barTimes = tempo.barLines(this.durationMs);
    this.bpmChanges = tempo.bpmChanges();
    this.still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.cameraStrength = this.still ? 0 : Math.min(1, Math.max(0, settings.cameraFx * (settings.reducedFlash ? 0.5 : 1)));
    // the start's and the end's pictures: the light of a lane coming on, and the cracks of a play that fails
    // halfway where this one can
    const failing = this.gaugeRule().failAtZero;
    void loadEndArt().then((art) => {
      if (!art) return;
      this.renderer.setLaneLight(art.lane);
      if (failing) this.renderer.setCracks(art.cracks);
    });
    this.lit = lightOrder(this.renderer.geometry.lanes);
    this.falls = fallOrder(this.lit);
    this.stage = litFrame(this.renderer.geometry.lanes.length);
    this.pacer = pacerFor(settings, request, setup.bestReplay ?? null);

    const gauge = this.gaugeRule();
    const rules = rulesetConfigs[settings.ruleset];
    // the song's jacket on its plate: its picture, else its disc as the song select draws it
    const { song } = request;
    const coverUrl = request.background?.coverUrl ?? (song?.hasCover ? api.coverUrl(song) : null);
    this.hud = new Hud(
      setup.hudRoot,
      {
        title: this.chart.meta.title,
        artist: this.chart.meta.artist,
        jacket: song || coverUrl ? { coverUrl, leadStem: song ? () => api.sketch(song.id).then(leadingStem) : undefined } : null,
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
        feverManualKey: settings.fever === 'MANUAL' ? this.triggerLabel('fever') : null,
        // a pacer with nothing to follow still shows its row (a dash), so a chosen BEST never just vanishes
        pacemakerLabel: this.practice || settings.pacemaker === 'OFF' ? null : pacemakerLabel(settings.pacemaker),
        type: hudTypeFor(skin.style, settings.hudType),
        gear: skin.style.deck,
        judgementOpacity: settings.judgementOpacity,
        counterMissLabel: settings.judgeCounter ? rules.missLabel : null,
        // in real ms as the errors are (the table's windows are song ms: a practice's rate stretches them)
        errorBar: settings.errorBar ? { outerMs: this.table.outerMs / this.rate, bestMs: this.table.topGrade.windowMs / this.rate } : null,
        showBpm: this.bpmChanges.length > 1 || settings.scrollMode === 'beat',
        skipKey: this.skipLabel ?? '',
        syncKeys: this.syncKeys && {
          visual: this.syncKeys.visual && keyPairNames(this.syncKeys.visual),
          ...(request.autoPlay ? {} : { judgement: this.syncKeys.judgement && keyPairNames(this.syncKeys.judgement) }),
        },
      },
      settings.showErrorMs,
      settings.reducedFlash,
    );
    this.hud.setSpeed(settings.hiSpeed);
    if (request.syncTest) this.hud.setSyncOffsets(settings.visualOffsetMs, settings.inputOffsetMs);
    // the practice's rate and stretch (and its loop, see beginEnding) show for a moment
    if (this.practice) this.hud.showToast(this.practiceLabel() ?? '', performance.now());

    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(setup.canvas);
    window.addEventListener('keydown', this.onControlKey);
    window.addEventListener('blur', this.onLeave);
    document.addEventListener('visibilitychange', this.onLeave);
    this.rebuildScroll();
    this.layout();
    this.begin();
    this.raf = requestAnimationFrame(this.frame);
    this.pauseIfAway();
  }

  /** A play that starts while the window is away (left during the loading) starts paused. */
  private pauseIfAway(): void {
    if (document.hidden || !document.hasFocus()) this.pauseAway();
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
    // the song rewinds a little: the judge line is drawn again until it is back where it stopped
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
    this.pauseIfAway();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.teardownRun();
    this.engine.stop();
    window.removeEventListener('keydown', this.onControlKey);
    window.removeEventListener('blur', this.onLeave);
    document.removeEventListener('visibilitychange', this.onLeave);
    this.resizeObserver.disconnect();
    this.failedLook(false);
    delete this.setup.canvas.dataset.stage;
    this.renderer.dispose();
    this.hud.dispose();
    this.background.dispose();
  }

  /**
   * The judgement offset in effect (song ms): the player's (real ms, so at the practice rate), and
   * the song's own (song ms: it moves the chart against the music whatever the rate).
   */
  private inputOffset(): number {
    return this.settings.inputOffsetMs * this.rate + songOffsetOf(this.settings, this.songId);
  }

  /**
   * How much earlier the notes are drawn (song ms): the player's display offset (real ms), less the
   * song's own (a song offset moves its notes later on the screen as it moves their judgement).
   */
  private visualOffset(): number {
    return this.settings.visualOffsetMs * this.rate - songOffsetOf(this.settings, this.songId);
  }

  /**
   * The key that works FEVER or the skip, as the HUD names it: the keyboard's (unless a lane
   * takes it), else the pad's FEVER button, else the keyboard's all the same; null: none at all.
   */
  private triggerLabel(action: 'fever' | 'skip'): string | null {
    const key = this.keys[action];
    const free = this.setup.request.autoPlay || ![...this.boundCodes].some((code) => laneTakes(code, key));
    if (free) return bindingLabel(key);
    const pad = padPlayOf(this.settings).fever;
    if (pad && !this.setup.request.autoPlay && !this.setup.request.replay) return padCodeLabel(pad);
    return action === 'fever' ? bindingLabel(key) : null;
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
    this.offsetShifts = [];
    const keyMode = this.chart.meta.keyMode;
    this.input = new InputManager(
      this.engine,
      bindingsFor(settings, keyMode),
      {
        press: (lane, t) => this.onPress(lane, t),
        release: (lane, t) => (this.recorder ? this.recorder.release(lane, t) : this.session.release(lane, t)),
      },
      this.inputOffset(),
      [secondBindingsFor(settings, keyMode), padBindingsFor(settings, keyMode)],
    );
    this.auto = request.autoPlay ? new AutoPlayer(this.chart) : null;
    if (!request.autoPlay && !request.replay) {
      this.input.attach();
      this.pad = new GamepadPoller(this.onPad, { turntable: { steps: settings.turntableSteps, releaseMs: settings.turntableReleaseMs } });
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
      // time to get ready before the first note, and before it comes into sight (silence where the
      // song has no music that early)
      const from = practiceRunStart(this.firstNoteMs, this.firstInSight, this.rate);
      this.engine.start(from, 0);
      this.runStartMs = from;
    } else {
      this.engine.start(0, Math.max(MIN_LEAD_IN_MS, FIRST_NOTE_DELAY_MS - this.firstNoteMs));
      this.runStartMs = 0;
    }
    this.resumeUntil = -Infinity;
    this.bpmAt = 0;
    this.state = 'running';
    this.planStart();
  }

  /**
   * The start this run shows, from where the song time is now to where its first note comes into sight: the
   * lanes lighting on the beat and the judge line drawn (stageFx.planIntro), the camera coming down. None for
   * a practice loop's next round (it would come round every few seconds) nor under 동작 줄이기.
   */
  private planStart(): void {
    const quiet = this.quietStart || this.still;
    this.quietStart = false;
    this.ending = null;
    this.failedLook(false);
    const lanes = this.renderer.geometry.lanes.length;
    this.runFromMs = this.engine.songTimeAtPerf(performance.now());
    const room = (this.firstInSight - this.runFromMs) / this.rate;
    this.intro = planIntro(quiet ? [] : this.lit, lanes, this.runFromMs, this.firstInSight, this.rate, this.tempo);
    this.introOver = introEnd(this.intro, this.rate);
    this.entry = quiet ? 0 : this.cameraStrength * entryShare(room);
  }

  /** A play that failed halfway loses its colour: the track, what is behind it and the HUD but its lamp (styles.css: stage-failed). */
  private failedLook(on: boolean): void {
    this.setup.canvas.classList.toggle('stage-failed', on);
    this.setup.bgRoot.classList.toggle('stage-failed', on);
    this.hud.setFailed(on);
  }

  /**
   * What the track shows of the run's start or end at this moment (undefined: the track as it plays), and
   * its name on the canvas (data-stage: intro, resume, end, fail, or play).
   */
  private stageAt(songNow: number, perfNow: number): StageFrame | undefined {
    const stage = this.stage;
    let name = 'play';
    if (this.ending) {
      const ms = perfNow - this.ending.at;
      if (this.ending.failed) failFrame(stage, this.falls, ms, this.still);
      else outroFrame(stage, this.lit, ms, this.still);
      name = this.ending.failed ? 'fail' : 'end';
    } else {
      const starting = songNow < this.introOver;
      const resuming = songNow < this.resumeUntil;
      if (!starting && !resuming) {
        this.name(name);
        return undefined;
      }
      if (starting) introFrame(stage, this.intro, songNow, this.rate, this.settings.reducedFlash);
      else introFrame(stage, NO_INTRO, songNow, this.rate);
      if (resuming) stage.line = Math.min(stage.line, resumeLine(this.resumeUntil - RESUME_LEAD_IN_MS * this.rate, this.resumeUntil, songNow));
      // the start counts as over once the judge line is whole (its last flares fade a little longer)
      name = resuming ? 'resume' : songNow < this.intro.lineTo ? 'intro' : 'play';
    }
    this.name(name);
    return stage;
  }

  private name(stage: string): void {
    if (stage === this.stageName) return;
    this.stageName = stage;
    this.setup.canvas.dataset.stage = stage;
  }

  /**
   * The camera: the chart's cues and the play's own, as it follows them, with the way in of a start and the
   * way out of an end added (stageFx). It does not move at all with 카메라 연출 at 0.
   */
  private cameraAt(songNow: number, perfNow: number): CameraPoseFx | undefined {
    if (!this.cameraFx.enabled) return undefined;
    const pose = this.cameraFx.follow(songNow);
    this.chartPose = pose;
    let add: StagePose | null = null;
    if (this.ending) add = this.ending.failed ? null : exitPose(perfNow - this.ending.at, this.cameraStrength);
    else if (this.entry > 0) {
      const ms = (songNow - this.runFromMs) / this.rate;
      if (ms > ENTRY_OVER_MS) this.entry = 0;
      else add = entryPose(ms, this.entry);
    }
    this.stagedPose = add;
    return add ? { roll: pose.roll, fovScale: pose.fovScale * add.fovScale, pitch: (pose.pitch ?? 0) + add.pitch } : pose;
  }

  private teardownRun(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.input?.detach();
    // the pad lets go of what is held as it stops: no Start tap (a pause) out of that
    this.padControls.reset();
    this.pad?.stop();
    this.pad = null;
    this.voices?.stopAll();
    this.stemVoices?.stopAll();
    this.engine.stop();
  }

  /** Gamepad events: the function buttons (and what is pressed with Start) first, the lanes otherwise. */
  private readonly onPad = (e: PadEvent): void => {
    const { own, actions } = this.padControls.handle(e);
    for (const action of actions) this.padAction(action);
    if (!own) this.input.handleKey(e.code, e.down, e.timeMs);
  };

  private padAction(action: PadPlayAction): void {
    switch (action) {
      case 'pause':
        if (this.state === 'running') this.pause();
        else if (this.state === 'paused') this.resume();
        return;
      case 'retry':
        if (this.state !== 'done') this.restart();
        return;
      case 'fever':
        // the FEVER button skips a long intro, as the FEVER key does
        if (!this.playAction('skip', true)) this.playAction('fever', true);
        return;
      default:
        this.playAction(action, true);
    }
  }

  /** The window lost the focus or was hidden. */
  private readonly onLeave = (e: Event): void => {
    if (e.type === 'visibilitychange' && !document.hidden) return;
    this.pauseAway();
  };

  /** Away from the window, a play of one's own pauses (the setting on). */
  private pauseAway(): void {
    if (!this.settings.pauseOnBlur || this.setup.request.autoPlay || this.setup.request.replay) return;
    this.pause();
  }

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
      this.voices.play(note, this.engine.contextTimeForSong(timeMs + this.inputOffset()));
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
    this.placeFirstNote();
  }

  /**
   * When the first note comes into sight at the SUDDEN+ edge (drawn the visual offset early); a skip
   * lands a while before that (and a little before the note at least).
   */
  private placeFirstNote(): void {
    const covers = activeCovers(this.settings);
    this.firstInSight = this.scroll.timeAt(this.firstNoteMs, this.scroll.travel * (1 - covers.sudden)) - this.visualOffset();
    // a practice run is lead-in until then (see begin)
    this.skipTo = this.practice ? null : Math.min(this.firstInSight - SKIP_SIGHT_MS * this.rate, this.firstNoteMs - SKIP_LEAD_MS * this.rate);
  }

  /** The intro can be skipped: the first note is more than SKIP_MIN_MS away and the skip lands ahead. */
  private canSkip(songNow: number): boolean {
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
    // the plate keeps clear of the track at the chart's peak tilt and zoom, not only as it is now
    this.hud.fit(this.renderer.hudPlaneAt(this.cameraFx.peak()));
    this.placeHud();
  }

  /**
   * Lays the HUD on the track as the camera shows it now (its parts sized for the screen where they lie):
   * by the chart's cues alone, without the way in of a start or the way out of an end, which pass. It is
   * then moved to where the camera has the track at this moment.
   */
  private placeHud(): void {
    const [judge, combo] = HUD_POSITIONS[this.settings.judgePosition];
    const { travel } = this.scroll;
    const staged = this.stagedPose !== null;
    this.hud.layoutPlane(staged && this.chartPose ? this.renderer.hudPlaneAt(this.chartPose) : this.renderer.hudPlane(), travel * judge * HUD_UNIT, travel * combo * HUD_UNIT);
    if (staged) this.hud.movePlane(this.renderer.hudPlane());
    this.hudVersion = this.renderer.hudVersion;
  }

  private readonly frame = (perfNow: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    this.engine.clock.sample();
    const songNow = this.engine.songTimeAtPerf(perfNow);
    const judgeNow = songNow - this.inputOffset();
    const session = this.session;
    if (this.pad) for (const action of this.padControls.tick(perfNow)) this.padAction(action);

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
    if (this.state === 'ending' && this.ending) {
      if (!this.ending.shown && perfNow >= this.ending.lampAt) this.showLamp();
      this.wave(perfNow);
      if (perfNow >= this.finishAtPerf) this.finish();
    }

    // A paused picture stays still and is drawn again only after a change (under the pause menu's
    // former backdrop blur, drawing it every frame ran at a few frames per second without a GPU).
    if (this.state !== 'paused' || this.redrawPaused) {
      this.redrawPaused = false;
      // a play that failed halfway: the notes run down to a standstill with the song, and no key is held any more
      const failed = this.ending?.failed ?? false;
      const drawMs = this.ending && failed ? tapeStopTime(this.ending.songMs, perfNow - this.ending.at, TAPE_MS, this.rate) : songNow;
      this.renderer.render(
        {
          timeMs: drawMs + this.visualOffset(),
          scroll: this.scroll,
          notes: session.notes,
          heldNote: (lane) => (failed ? null : session.heldNoteIndex(lane)),
          keyDown: (lane) => !failed && session.isKeyDown(lane),
          barTimes: this.barTimes,
          fever: { active: session.fever.active, multiplier: session.fever.multiplier, remaining: session.fever.remaining(judgeNow) },
          camera: this.cameraAt(songNow, perfNow),
          stage: this.stageAt(songNow, perfNow),
        },
        perfNow,
      );
      // the HUD lying on the track follows the camera's tilt and zoom
      if (this.renderer.hudVersion !== this.hudVersion) {
        this.hudVersion = this.renderer.hudVersion;
        this.hud.movePlane(this.renderer.hudPlane());
      }
    }
    // (what is behind a play that failed halfway stands still with it)
    this.background.update(songNow, this.state === 'running' || (this.state === 'ending' && !this.ending?.failed), perfNow);
    this.hud.update(perfNow, {
      score: this.scoreValue(),
      sub: this.subValue(),
      maxCombo: session.maxCombo,
      gauge: session.gauge.value,
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
      // shown where it has a key (or a pad button) to work it
      skip: this.skipLabel !== null && this.canSkip(songNow),
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
    // an editor test is a practice run from the cursor, at the song's own rate
    const what = this.setup.request.fromEditor ? '에디터 테스트' : `연습 · ${playbackRateText(this.rate)}`;
    return `${what} · ${formatMs(p.startMs)}–${formatMs(p.endMs)}${p.loop ? ` · LOOP ${this.loops + 1}` : ''}`;
  }

  /** Where the far end of the track stands on the screen, in the camera's own framing (shares of the width and height). */
  trackEndOnScreen(): { x: number; y: number } {
    return this.renderer.trackEndOnScreen();
  }

  /** The result of the last loop a looped practice finished (null: none yet, or no such practice). */
  lastLoopOutcome(): PlayOutcome | null {
    return this.lastLoop;
  }

  private beginEnding(perfNow: number, failed: boolean): void {
    if (this.state === 'ending' || this.state === 'done') return;
    if (this.practice?.loop && !failed) {
      // the loop's accuracy and timing for a moment as the next one starts, and kept for leaving
      const result = this.session.result();
      this.loops++;
      this.lastLoop = { result, chart: this.chart, placement: this.placement, practice: this.practice, loop: this.loops, replay: null, offsets: this.playOffsets() };
      // the next round starts as it is: no start's show every few seconds
      this.quietStart = true;
      this.restart();
      this.hud.showToast(`LOOP ${this.loops} · RATE ${(Math.floor(result.rate * 100) / 100).toFixed(2)}% · FAST ${result.fast} · SLOW ${result.slow}`, perfNow);
      return;
    }
    this.state = 'ending';
    this.input.detach();
    const lamp = this.session.result().lamp;
    // autoplay and practice earn no lamp: plain words
    const aided = this.practice ? 'PRACTICE END' : this.setup.request.autoPlay ? 'AUTO PLAY' : null;
    const lampAt = perfNow + (failed ? FAIL_LAMP_AT_MS : aided ? 0 : LAMP_AT_MS);
    this.ending = { at: perfNow, songMs: this.engine.songTimeAtPerf(perfNow), failed, text: aided ?? lamp, kind: aided ? 'aided' : LAMP_CLASS[lamp], lampAt, shown: false, wave: 0 };
    this.finishAtPerf = perfNow + (failed ? FAIL_END_MS : aided ? AIDED_END_MS : END_MS);
    if (failed) {
      // the song runs down like a tape and everything loses its colour; the keysounds end with it
      this.voices?.stopAll();
      this.stemVoices?.stopAll();
      this.engine.tapeStop(TAPE_MS);
      this.failedLook(true);
    } else {
      // the lanes go out (stageAt) and the song goes out muffled instead of stopping dead
      this.engine.muffleOut(MUFFLE_MS, MUFFLED_CUTOFF_HZ);
    }
    if (lampAt <= perfNow) this.showLamp();
  }

  /**
   * The end's lamp in the middle of the screen (Hud.showLamp). A play that ends failed with its gauge short
   * of the line has what is left of the gauge run out; one that failed halfway has its letters break up.
   */
  private showLamp(): void {
    const e = this.ending;
    if (!e || e.shown) return;
    e.shown = true;
    this.hud.showLamp(e.text, e.kind, e.failed);
    if (e.kind === 'failed' && !e.failed) this.hud.drainGauge();
  }

  /**
   * An all-perfect play's end: the hit's effect runs over the lanes like a wave, across the track and back,
   * as large as 타격 효과 크기 has it (none with it off: Renderer.hitEffect).
   */
  private wave(perfNow: number): void {
    const e = this.ending;
    if (!e || e.kind !== 'perfect' || !e.shown || this.still) return;
    const lanes = this.acrossLanes;
    const total = lanes.length * WAVE_PASSES;
    while (e.wave < total && perfNow >= e.lampAt + e.wave * WAVE_STEP_MS) {
      const pass = Math.floor(e.wave / lanes.length);
      const k = e.wave % lanes.length;
      const lane = lanes[pass % 2 === 0 ? k : lanes.length - 1 - k];
      // in the best judgement's colour, as every hit of such a play was
      this.renderer.hitEffect(lane, GRADE_COLORS['g-max'], perfNow);
      e.wave++;
    }
  }

  /** The lanes with a floor of their own, from the left of the track to its right. */
  private get acrossLanes(): number[] {
    const lanes = this.renderer.geometry.lanes;
    return [...this.lit].sort((a, b) => lanes[a].x - lanes[b].x);
  }

  /** The judgement offsets of this play as they are now (a replay's as it kept them). */
  private playOffsets(): PlayOutcome['offsets'] {
    const replay = this.setup.request.replay;
    if (replay) {
      const { inputOffsetMs, songOffsetMs } = replay.settings;
      return inputOffsetMs === undefined ? null : { input: inputOffsetMs, song: songOffsetMs ?? 0, shifts: [] };
    }
    return { input: this.settings.inputOffsetMs, song: songOffsetOf(this.settings, this.songId), shifts: this.offsetShifts };
  }

  private finish(): void {
    // the lamp is where the result's takes over from, however soon the end was skipped
    this.showLamp();
    this.state = 'done';
    this.engine.stop();
    const result = this.session.result();
    const s = this.settings;
    const offsets = this.playOffsets();
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
            inputOffsetMs: offsets?.input,
            songOffsetMs: offsets?.song,
          },
          log: this.recorder.log,
          result: { score: result.score, rate: result.rate, maxCombo: result.maxCombo, lamp: result.lamp },
        }
      : null;
    this.callbacks.onFinish({ result, chart: this.chart, placement: this.placement, practice: this.practice, replay, offsets });
  }

  private readonly onSessionEvent = (e: SessionEvent): void => {
    const now = performance.now();
    if (e.type === 'judge') {
      if (e.kind !== 'tail' && e.errorMs !== null) this.pressJudged = e.noteIndex;
      this.hud.showJudge(e, now);
      // the camera answers the play: level for a moment after a miss, a pulse every hundred combo
      if (e.isBreak) this.cameraFx.miss();
      else this.cameraFx.combo(e.combo);
      if (!e.isBreak) this.renderer.hitEffect(e.lane, GRADE_COLORS[e.cls] ?? 0xffffff, now);
      if (this.stemVoices && !this.setup.request.autoPlay && e.kind !== 'tail' && e.errorMs !== null) {
        // a hit plays its slice of the stem right away; a missed note leaves it silent, and a press
        // judged BREAK sounds like an empty press (the start of its slice over the song)
        const slice = this.stemPlan?.noteSlice[e.noteIndex] ?? null;
        if (slice !== null && !e.isBreak) this.stemVoices.play(slice, this.engine.ctx.currentTime);
        else if (slice !== null) this.stemVoices.ghost(slice, this.engine.ctx.currentTime);
      }
    } else if (e.type === 'tick') {
      this.hud.setCombo(e.combo);
      this.cameraFx.combo(e.combo);
      this.renderer.holdTick(e.lane, now);
    } else if (e.type === 'key' && e.down && this.settings.hitSound && !this.voices && !this.stemVoices) {
      this.engine.playHitSound();
    } else if (e.type === 'fail') {
      this.beginEnding(now, true);
    }
  };

  /** An in-play change of SPEED or the covers, kept for the next play; `toast` names it once. */
  private updateSettings(next: Settings, toast: string): void {
    this.keep(next);
    this.rebuildScroll();
    this.layout();
    this.hud.setSpeed(next.hiSpeed);
    this.hud.showToast(toast, performance.now());
  }

  /**
   * An in-play change of an offset (the song's own, the sync test's), kept for the next play: it
   * moves no track nor HUD, so only what follows from the offsets is set again (a held key repeats
   * it some 30 times a second).
   */
  private updateOffsets(next: Settings, toast: string): void {
    this.keep(next);
    this.placeFirstNote();
    this.input.setInputOffset(this.inputOffset());
    this.hud.showToast(toast, performance.now());
  }

  /** The settings from now on, kept for the next play. */
  private keep(next: Settings): void {
    this.settings = next;
    // a replay runs on its recorded judgement settings, an editor test without placement on the
    // default gauge and FEVER: the player's own stay theirs, only the visual changes are kept
    const { replay, fromEditor } = this.setup.request;
    this.callbacks.onSettingsChange(replay || fromEditor ? { ...next, ...judgementSettingsOf(null, this.setup.settings) } : next);
  }

  /** A cover's toast; one moved with the visible time kept moves SPEED too, and names it as well. */
  private coverToast(text: string, next: Settings): string {
    return next.hiSpeed !== this.settings.hiSpeed ? `${text} · 노트 속도 ${speedText(next.hiSpeed)}` : text;
  }

  /**
   * In-play keys: Esc pauses and resumes; the functions' keys (playKeysOf) work them; in the sync
   * test ←→ move the display offset, and Shift+←→ the judgement offset (or the keys no lane takes,
   * see syncTestKeys).
   */
  private readonly onControlKey = (e: KeyboardEvent): void => {
    if (this.boundCodes.has(e.code) && !this.setup.request.autoPlay) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      // a held Esc does not pause and resume over and over
      if (e.repeat) return;
      if (this.state === 'running') this.pause();
      else if (this.state === 'paused') this.resume();
      return;
    }
    const sync = this.syncKeys && syncKeyOf(e, this.syncKeys);
    if (sync) {
      if (this.syncOffset(sync.dir, sync.offset === 'judgement')) e.preventDefault();
      return;
    }
    const actions = playActionsOf(e, this.keys);
    if (actions.length === 0) {
      // the repeats of a held key that acts once a press (a retry, the covers, FEVER) are still its
      if (e.repeat && playActionsOf({ code: e.code, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, metaKey: e.metaKey, repeat: false }, this.keys).length > 0) e.preventDefault();
      return;
    }
    for (const action of actions) {
      if (this.playAction(action, e.isTrusted)) {
        e.preventDefault();
        return;
      }
    }
  };

  /**
   * The sync test's keys: the display offset a ms at a time and, played by hand, the judgement
   * offset (the presses from now on are judged by it), kept as the settings' own and shown under
   * the song's line. False when nothing moves now (paused).
   */
  private syncOffset(dir: 1 | -1, judgement: boolean): boolean {
    if (this.state !== 'running') return false;
    const s = this.settings;
    const was = judgement ? s.inputOffsetMs : s.visualOffsetMs;
    const ms = offsetStep(was, dir, false);
    const next = judgement ? { ...s, inputOffsetMs: ms } : { ...s, visualOffsetMs: ms };
    this.updateOffsets(next, `${judgement ? '판정' : '표시'} 오프셋 ${offsetText(ms)}`);
    // the hits so far were judged on the old one: the result's offset fix makes up for it
    if (judgement && ms !== was) this.offsetShifts.push({ hits: this.session.hitCount, ms: (ms - was) * this.rate });
    this.hud.setSyncOffsets(next.visualOffsetMs, next.inputOffsetMs);
    return true;
  }

  /**
   * Works an in-play function (a key's or the pad's); false when it does nothing now (the key is
   * then left to the screen: paused, ↑↓ and Enter work the pause menu).
   */
  private playAction(action: PlayAction, trusted: boolean): boolean {
    const s = this.settings;
    const running = this.state === 'running';
    switch (action) {
      case 'speedDown':
      case 'speedUp':
      case 'speedDownBig':
      case 'speedUpBig': {
        // SPEED only while the song runs: paused, ↑↓ move the pause menu's focus (as a gamepad's
        // d-pad does, whose keys the menu bridge sends)
        if (!trusted || !running) return false;
        const hiSpeed = clampHiSpeed(s.hiSpeed + (STEPS[action] ?? 0));
        this.updateSettings({ ...s, hiSpeed }, `노트 속도 ${speedText(hiSpeed)}`);
        return true;
      }
      case 'suddenDown':
      case 'suddenUp': {
        if (!running) return false;
        const sudden = Math.min(MAX_COVER, Math.max(0, s.sudden + (action === 'suddenUp' ? COVER_STEP : -COVER_STEP)));
        const next = withCovers(s, { sudden, coversOn: true });
        this.updateSettings(next, this.coverToast(`노트 등장 위치 ${coverText(next.sudden)}`, next));
        return true;
      }
      case 'liftDown':
      case 'liftUp': {
        if (!running) return false;
        const step = action === 'liftUp' ? JUDGE_LINE_STEP : -JUDGE_LINE_STEP;
        const judgeLinePosition = Math.round(Math.min(MAX_JUDGE_LINE, Math.max(MIN_JUDGE_LINE, s.judgeLinePosition + step)) * 100) / 100;
        const next = withCovers(s, { judgeLinePosition });
        this.updateSettings(next, this.coverToast(`판정선 위치 ${judgeLineText(next.judgeLinePosition)}`, next));
        return true;
      }
      case 'offsetDown':
      case 'offsetUp':
      case 'offsetDownBig':
      case 'offsetUpBig': {
        // the song's own offset, kept for its next plays; the presses from now on judge by it
        if (!running || this.songId === null) return false;
        const was = songOffsetOf(s, this.songId);
        const next = withSongOffset(s, this.songId, was + (STEPS[action] ?? 0));
        const ms = songOffsetOf(next, this.songId);
        this.updateOffsets(next, `곡 오프셋 ${ms > 0 ? '+' : ''}${ms}ms`);
        // the hits so far were judged on the old one: the result's offset fix makes up for it
        if (ms !== was) this.offsetShifts.push({ hits: this.session.hitCount, ms: ms - was });
        return true;
      }
      case 'covers': {
        if (!running) return false;
        const next = withCovers(s, { coversOn: !s.coversOn });
        this.updateSettings(next, this.coverToast(next.coversOn ? '커버 켬' : '커버 끔', next));
        return true;
      }
      case 'retry':
        if (this.state !== 'done') this.restart();
        return true;
      case 'skip':
        // over an end: straight on to the result
        if (this.state === 'ending') {
          this.finishAtPerf = 0;
          return true;
        }
        if (!this.canSkip(this.engine.songTimeAtPerf(performance.now()))) return false;
        this.skipIntro();
        return true;
      case 'fever': {
        if (!running || s.fever !== 'MANUAL' || this.setup.request.replay) return false;
        const t = this.engine.songTimeAtPerf(performance.now()) - this.inputOffset();
        if (this.recorder) this.recorder.activateFever(t);
        else this.session.activateFever(t);
        return true;
      }
    }
  }
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
