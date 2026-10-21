import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type ServerChart, type Song } from '../api/client';
import type { KeysoundBank } from '../audio/keysounds';
import { menuMusic, PREVIEW_VOLUME } from '../audio/songPreview';
import type { ReplayData } from '../engine/replay';
import { GamepadMenuBridge, SELECT_PAD_KEYS, setPadMenuKeys, SHOULDER_KEYS } from '../input/gamepad';
import type { Chart, StemName } from '../engine/types';
import { loadSettings, padMenuKeysFor, saveSettings, type Settings } from '../settings/settings';
import { CalibrationScreen } from './CalibrationScreen';
import { EditorScreen, newEditorSession, type EditorSession } from './EditorScreen';
import type { PlayOutcome } from './PlayController';
import { PlayScreen } from './PlayScreen';
import { ResultScreen } from './ResultScreen';
import { SettingsScreen, type SettingsTab } from './SettingsScreen';
import { generationParams } from './PlayOptions';
import { buildPlayRequest } from './playRequest';
import { bestAfterPlay } from './playRules';
import { SongSelectScreen } from './SongSelectScreen';

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
  /** Fixed seed for the RANDOM family (tests); a new one is drawn per play otherwise. */
  placementSeed?: number;
  /** Keysounds of a generated chart: loads the stems its notes play (same length as the song audio). */
  loadStems?: () => Promise<Map<StemName, AudioBuffer>>;
  /** Background layer: blurred jacket and the user's video. */
  background?: { coverUrl: string | null; bgaUrl: string | null; bgaYoutube?: string | null; bgaOffsetMs: number };
  /** Imported keysound chart: the sounds the notes play (`loadAudio` gives the rendered background). */
  loadKeysounds?: () => Promise<KeysoundBank>;
  /** Test play from the chart editor: leaving the play (or its result) returns to the editor. */
  fromEditor?: boolean;
  /** Watch a recorded play instead of playing (inputs come from the replay). */
  replay?: ReplayData;
}

type Screen =
  | { name: 'select' }
  | { name: 'play'; request: PlayRequest; runId: number }
  | { name: 'result'; request: PlayRequest; outcome: PlayOutcome }
  /** Opened from the settings, it goes back to them. */
  | { name: 'calibration'; fromSettings?: boolean }
  | { name: 'settings'; tab?: SettingsTab }
  | { name: 'editor' };

export function App() {
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings());
  const [screen, setScreen] = useState<Screen>({ name: 'select' });
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorSession | null>(null);

  const setSettings = useCallback((next: Settings) => {
    setSettingsState(next);
    saveSettings(next);
  }, []);

  // a controller without the standard mapping works the menus with the buttons assigned (or inferred from its lanes)
  const { padMenu, padBindings, lastKeyMode } = settings;
  const menuKeys = useMemo(() => padMenuKeysFor({ padMenu, padBindings, lastKeyMode }), [padMenu, padBindings, lastKeyMode]);
  useEffect(() => setPadMenuKeys(menuKeys), [menuKeys]);

  // a gamepad works the menus (not during play, where its controls are lanes); the song select
  // also opens its panels and the settings with X, LT and RT
  const menuPad = screen.name !== 'play' && screen.name !== 'calibration';
  const padKeys = screen.name === 'select' ? SELECT_PAD_KEYS : SHOULDER_KEYS;
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

  useEffect(() => {
    document.documentElement.classList.toggle('palette-cb', settings.palette === 'colorblind');
    document.documentElement.classList.toggle('reduced-flash', settings.reducedFlash);
  }, [settings.palette, settings.reducedFlash]);

  const play = useCallback((request: PlayRequest) => setScreen({ name: 'play', request, runId: Date.now() }), []);
  const toSelect = useCallback(() => setScreen({ name: 'select' }), []);
  const leavePlay = (request: PlayRequest) => setScreen(request.fromEditor && editor ? { name: 'editor' } : { name: 'select' });
  const openEditor = useCallback((chart: ServerChart, song: Song) => {
    setEditor(newEditorSession(song, chart));
    setScreen({ name: 'editor' });
  }, []);
  // Every change of screen ends what an earlier screen started (a new pattern still generating).
  const screenRun = useRef(0);
  useEffect(() => {
    screenRun.current++;
  }, [screen]);
  /**
   * Result screen: the same key mode, difficulty system and tier with a new seed, played right
   * away. Resolves with the error to show on the result screen, or null.
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
          onCalibrate={() => setScreen({ name: 'calibration' })}
          onOpenSettings={() => setScreen({ name: 'settings' })}
          onEdit={openEditor}
          selectedSongId={selectedSongId}
          onSelectSong={setSelectedSongId}
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
          onRetry={() => play({ ...screen.request, replay: undefined, best: bestAfterPlay(screen.request, screen.outcome) })}
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
          onBack={screen.fromSettings ? () => setScreen({ name: 'settings', tab: 'judge' }) : toSelect}
        />
      );
    case 'settings':
      return (
        <SettingsScreen
          settings={settings}
          onSettingsChange={setSettings}
          onBack={toSelect}
          onCalibrate={() => setScreen({ name: 'calibration', fromSettings: true })}
          initialTab={screen.tab}
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
