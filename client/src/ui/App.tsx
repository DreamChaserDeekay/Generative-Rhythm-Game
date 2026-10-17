import { useCallback, useEffect, useState } from 'react';
import type { ServerChart, Song } from '../api/client';
import type { KeysoundBank } from '../audio/keysounds';
import type { ReplayData } from '../engine/replay';
import type { Chart } from '../engine/types';
import { loadSettings, saveSettings, type Settings } from '../settings/settings';
import { CalibrationScreen } from './CalibrationScreen';
import { EditorScreen, newEditorSession, type EditorSession } from './EditorScreen';
import type { PlayOutcome } from './PlayController';
import { PlayScreen } from './PlayScreen';
import { ResultScreen } from './ResultScreen';
import { SettingsScreen } from './SettingsScreen';
import { buildPlayRequest } from './playRequest';
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
  /** Loads the decoded audio for the chart (null = silent). */
  loadAudio: () => Promise<AudioBuffer | null>;
  autoPlay: boolean;
  /** Practice run: a segment, optionally slowed down and looped. Never recorded. */
  practice?: PracticeOptions;
  /** Personal best on this chart (pacemaker target). */
  best?: { score: number; rate: number } | null;
  /** Fixed seed for the RANDOM family (tests); a new one is drawn per play otherwise. */
  placementSeed?: number;
  /** Stem keysound mode: loads the chart's lead stem (same length as the song audio). */
  loadLead?: () => Promise<AudioBuffer | null>;
  /** Background layer: blurred jacket and the user's video. */
  background?: { coverUrl: string | null; bgaUrl: string | null; bgaOffsetMs: number };
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
  | { name: 'calibration' }
  | { name: 'settings' }
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
          onRetry={() => play({ ...screen.request, replay: undefined })}
          onBack={() => leavePlay(screen.request)}
          onWatchReplay={(replay) => play({ ...screen.request, replay, autoPlay: false, practice: undefined })}
        />
      );
    case 'calibration':
      return <CalibrationScreen settings={settings} onSettingsChange={setSettings} onBack={toSelect} />;
    case 'settings':
      return <SettingsScreen settings={settings} onSettingsChange={setSettings} onBack={toSelect} />;
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
