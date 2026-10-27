import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type ServerChart, type Song } from '../api/client';
import type { KeysoundBank } from '../audio/keysounds';
import { menuMusic, PREVIEW_VOLUME } from '../audio/songPreview';
import type { ReplayData } from '../engine/replay';
import { GamepadMenuBridge, RESULT_PAD_KEYS, SELECT_PAD_KEYS, setPadMenuKeys, SHOULDER_KEYS } from '../input/gamepad';
import type { Chart, StemName } from '../engine/types';
import { loadSettings, padMenuKeysFor, patternKey, resetSettings, saveSettings, withEntry, withPattern, type Settings } from '../settings/settings';
import { CalibrationScreen, type CalibrationStep } from './CalibrationScreen';
import { EditorScreen, newEditorSession, type EditorSession } from './EditorScreen';
import type { PlayOutcome } from './PlayController';
import { PlayScreen } from './PlayScreen';
import { ResultScreen } from './ResultScreen';
import { RESET_UNDO_MS, SettingsScreen, type SettingsTab } from './SettingsScreen';
import { generationParams } from './PlayOptions';
import { useDisplayMode } from './displayMode';
import { buildPlayRequest } from './playRequest';
import { bestAfterPlay } from './playRules';
import { SongSelectScreen } from './SongSelectScreen';
import { syncTestRequest } from './syncTestRequest';

export interface PracticeOptions {
  /** Segment on the song timeline (ms). */
  startMs: number;
  endMs: number;
  /** Playback speed; the pitch is preserved. */
  rate: number;
  loop: boolean;
}

export interface PlayRequest {
  chart: Chart;
  /** The song from the library (absent for the sync test): its picture on the loading card. */
  song?: Song;
  /** Loads the decoded audio for the chart (null = silent). */
  loadAudio: () => Promise<AudioBuffer | null>;
  autoPlay: boolean;
  /** Practice run: a segment, optionally slowed down and looped. Never recorded. */
  practice?: PracticeOptions;
  /**
   * Personal best on this chart (pacemaker target): its score id and whether its replay was kept
   * (the BEST pacemaker follows it), or the replay itself (a retry right after setting it).
   */
  best?: { score: number; rate: number; scoreId?: number; hasReplay?: boolean; replay?: ReplayData } | null;
  /**
   * Fixed seed for the RANDOM family: a retry from the result on the same lane order (and tests);
   * a new one is drawn per play otherwise.
   */
  placementSeed?: number;
  /** Keysounds of a generated chart: loads the stems its notes play (same length as the song audio). */
  loadStems?: () => Promise<Map<StemName, AudioBuffer>>;
  /** Background layer: blurred jacket and the user's video. */
  background?: { coverUrl: string | null; bgaUrl: string | null; bgaYoutube?: string | null; bgaOffsetMs: number };
  /** Imported keysound chart: the sounds the notes play (`loadAudio` gives the rendered background). */
  loadKeysounds?: () => Promise<KeysoundBank>;
  /** Test play from the chart editor: leaving the play (or its result) returns to the editor. */
  fromEditor?: boolean;
  /**
   * The click-track sync test: ←→ move the display offset as it runs (played by hand, Shift+←→ the
   * judgement offset; keys no lane takes, see syncTestKeys).
   */
  syncTest?: boolean;
  /** Started from the settings (the sync test): leaving the play (or its result) returns to their 판정·싱크 tab. */
  fromSettings?: boolean;
  /** Watch a recorded play instead of playing (inputs come from the replay). */
  replay?: ReplayData;
}

type Screen =
  | { name: 'select' }
  | { name: 'play'; request: PlayRequest; runId: number }
  | { name: 'result'; request: PlayRequest; outcome: PlayOutcome }
  /** Opened from the settings, it goes back to them. */
  | { name: 'calibration'; step: CalibrationStep; fromSettings?: boolean }
  /** `focus`: the test id of the row to focus (the tool come back from). */
  | { name: 'settings'; tab?: SettingsTab; focus?: string }
  | { name: 'editor' };

export function App() {
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings());
  const [screen, setScreen] = useState<Screen>({ name: 'select' });
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorSession | null>(null);
  // the song select's practice and target level of each chart, kept while it is away (a play, the settings)
  const [practices, setPractices] = useState<Record<string, PracticeOptions>>({});
  const [targetLevels, setTargetLevels] = useState<Record<string, number>>({});
  const keepPractice = useCallback((key: string, p: PracticeOptions | null) => setPractices((all) => withEntry(all, key, p)), []);
  const keepTargetLevel = useCallback((key: string, level: number | null) => setTargetLevels((all) => withEntry(all, key, level)), []);

  const setSettings = useCallback((next: Settings) => {
    setSettingsState(next);
    saveSettings(next);
  }, []);
  // the settings as they are now, for what ends after an await (a new pattern)
  const current = useRef(settings);
  current.current = settings;

  // 모두 초기화 can be undone for a while from its last press, the settings left and come back to or not
  const [resetUndo, setResetUndo] = useState<{ before: Settings } | null>(null);
  useEffect(() => {
    if (!resetUndo) return;
    const id = window.setTimeout(() => setResetUndo(null), RESET_UNDO_MS);
    return () => window.clearTimeout(id);
  }, [resetUndo]);
  const resetAll = () => {
    // a second reset in a row keeps the settings of before the first (and gives the undo its time again)
    setResetUndo({ before: resetUndo?.before ?? current.current });
    setSettings(resetSettings(current.current));
  };
  const undoReset = () => {
    if (resetUndo) setSettings(resetUndo.before);
    setResetUndo(null);
  };

  // a controller without the standard mapping works the menus with the buttons assigned (or inferred from its lanes)
  const { padMenu, padBindings, lastKeyMode } = settings;
  const menuKeys = useMemo(() => padMenuKeysFor({ padMenu, padBindings, lastKeyMode }), [padMenu, padBindings, lastKeyMode]);
  useEffect(() => setPadMenuKeys(menuKeys), [menuKeys]);

  // a gamepad works the menus (not during play, where its controls are lanes); the song select
  // also opens its panels and the settings with X, LT and RT and plays on autoplay with RS, and
  // the result plays again with X
  const menuPad = screen.name !== 'play' && screen.name !== 'calibration';
  const padKeys = screen.name === 'select' ? SELECT_PAD_KEYS : screen.name === 'result' ? RESULT_PAD_KEYS : SHOULDER_KEYS;
  useEffect(() => {
    if (!menuPad) return;
    const bridge = new GamepadMenuBridge({ keys: padKeys });
    bridge.start();
    return () => bridge.stop();
  }, [menuPad, padKeys]);

  // The song select's preview plays on behind the settings, quieter and muffled; the other screens stop it.
  useEffect(() => {
    if (screen.name === 'select' || screen.name === 'settings') menuMusic.muffle(screen.name === 'settings');
    else menuMusic.stop();
  }, [screen.name]);
  useEffect(() => menuMusic.setVolume(settings.musicVolume * PREVIEW_VOLUME), [settings.musicVolume]);

  // the window or full screen (the desktop app's window, or the browser's full screen)
  useDisplayMode(settings.displayMode, (displayMode) => {
    if (current.current.displayMode !== displayMode) setSettings({ ...current.current, displayMode });
  });

  useEffect(() => {
    document.documentElement.classList.toggle('palette-cb', settings.palette === 'colorblind');
    document.documentElement.classList.toggle('reduced-flash', settings.reducedFlash);
  }, [settings.palette, settings.reducedFlash]);

  const play = useCallback((request: PlayRequest) => setScreen({ name: 'play', request, runId: Date.now() }), []);
  const toSelect = useCallback(() => setScreen({ name: 'select' }), []);
  // the sync test started from the settings goes back to its row
  const leavePlay = (request: PlayRequest) =>
    setScreen(
      request.fromEditor && editor
        ? { name: 'editor' }
        : request.fromSettings
          ? { name: 'settings', tab: 'judge', focus: request.autoPlay ? 'settings-sync-auto' : 'settings-sync-play' }
          : { name: 'select' },
    );
  const openEditor = useCallback((chart: ServerChart, song: Song) => {
    setEditor(newEditorSession(song, chart));
    setScreen({ name: 'editor' });
  }, []);
  // unsaved edits (the editor's, kept through its test play too): a reload or a closed window asks first
  useEffect(() => {
    if (!editor) return;
    const ask = (e: BeforeUnloadEvent) => {
      if (!editor.doc.dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [editor]);
  // Every change of screen ends what an earlier screen started (a new pattern still generating).
  const screenRun = useRef(0);
  useEffect(() => {
    screenRun.current++;
  }, [screen]);
  /**
   * Result screen: the same key mode, difficulty system and tier with a new seed, played right
   * away and kept as the tier's pattern (as F5 on the song select). Resolves with the error to
   * show on the result screen, or null.
   */
  const regenerate = async (request: PlayRequest): Promise<string | null> => {
    const meta = request.chart.meta;
    if (!meta.songId || !meta.generator) return null;
    const run = screenRun.current;
    try {
      const song = await api.song(meta.songId);
      const { chart } = await api.generate(meta.songId, {
        keyMode: meta.keyMode,
        difficulty: meta.difficulty,
        system: meta.difficultySystem ?? 'GRG',
        targetLevel: (meta.generator.params.targetLevel as number | null | undefined) ?? null,
        newSeed: true,
        params: generationParams(settings.generation, meta.keyMode),
      });
      // the player left the result screen while it was generating
      if (run !== screenRun.current) return null;
      const seed = chart.meta.generator?.seed;
      if (seed !== undefined) setSettings(withPattern(current.current, patternKey(song.id, meta.keyMode, meta.difficultySystem ?? 'GRG', meta.difficulty), seed));
      play(buildPlayRequest(song, chart, settings, { autoPlay: request.autoPlay }));
      return null;
    } catch (e) {
      return run === screenRun.current ? (e instanceof Error ? e.message : String(e)) : null;
    }
  };
  const testFromEditor = (chart: Chart, startMs: number) => {
    if (!editor) return;
    const endMs = Math.max(editor.song.durationMs, ...chart.notes.map((n) => n.endT ?? n.t)) + 1;
    play(buildPlayRequest(editor.song, chart, settings, { autoPlay: false, practice: { startMs, endMs, rate: 1, loop: false }, fromEditor: true }));
  };

  switch (screen.name) {
    case 'select':
      return (
        <SongSelectScreen
          settings={settings}
          onSettingsChange={setSettings}
          onPlay={play}
          onCalibrate={(step) => setScreen({ name: 'calibration', step })}
          onOpenSettings={() => setScreen({ name: 'settings' })}
          onEdit={openEditor}
          selectedSongId={selectedSongId}
          onSelectSong={setSelectedSongId}
          practices={practices}
          onPractice={keepPractice}
          targetLevels={targetLevels}
          onTargetLevel={keepTargetLevel}
        />
      );
    case 'play':
      return (
        <PlayScreen
          key={screen.runId}
          request={screen.request}
          settings={settings}
          onSettingsChange={setSettings}
          onFinish={(outcome) => setScreen({ name: 'result', request: screen.request, outcome })}
          onQuit={() => leavePlay(screen.request)}
        />
      );
    case 'result':
      return (
        <ResultScreen
          request={screen.request}
          outcome={screen.outcome}
          settings={settings}
          onSettingsChange={setSettings}
          onRetry={(newPlacement) =>
            play({
              ...screen.request,
              replay: undefined,
              best: bestAfterPlay(screen.request, screen.outcome),
              // the lane order just played again (as F2 in play keeps it), or a new one drawn
              placementSeed: newPlacement ? undefined : screen.outcome.placement.seed,
            })
          }
          onBack={() => leavePlay(screen.request)}
          onWatchReplay={(replay) => play({ ...screen.request, replay, autoPlay: false, practice: undefined })}
          onRegenerate={
            screen.request.chart.meta.generator && !screen.request.practice && !screen.request.replay && !screen.request.fromEditor
              ? () => regenerate(screen.request)
              : undefined
          }
        />
      );
    case 'calibration':
      return (
        <CalibrationScreen
          settings={settings}
          onSettingsChange={setSettings}
          onBack={
            screen.fromSettings
              ? () => setScreen({ name: 'settings', tab: 'judge', focus: screen.step === 'visual' ? 'open-visual-calibration-settings' : 'open-calibration-settings' })
              : toSelect
          }
          step={screen.step}
        />
      );
    case 'settings':
      return (
        <SettingsScreen
          settings={settings}
          onSettingsChange={setSettings}
          onBack={toSelect}
          onCalibrate={(step) => setScreen({ name: 'calibration', step, fromSettings: true })}
          onSyncTest={(byHand) => play(syncTestRequest(settings.lastKeyMode, !byHand, true))}
          initialTab={screen.tab}
          initialFocus={screen.focus}
          canUndoReset={resetUndo !== null}
          onReset={resetAll}
          onUndoReset={undoReset}
        />
      );
    case 'editor':
      if (!editor) return null;
      return (
        <EditorScreen
          session={editor}
          settings={settings}
          onExit={() => {
            setEditor(null);
            setScreen({ name: 'select' });
          }}
          onTestPlay={testFromEditor}
          onSaved={() => undefined}
        />
      );
  }
}
