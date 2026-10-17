import { useCallback, useEffect, useState } from 'react';
import type { Chart } from '../engine/types';
import { loadSettings, saveSettings, type Settings } from '../settings/settings';
import { CalibrationScreen } from './CalibrationScreen';
import type { PlayOutcome } from './PlayController';
import { PlayScreen } from './PlayScreen';
import { ResultScreen } from './ResultScreen';
import { SettingsScreen } from './SettingsScreen';
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
}

type Screen =
  | { name: 'select' }
  | { name: 'play'; request: PlayRequest; runId: number }
  | { name: 'result'; request: PlayRequest; outcome: PlayOutcome }
  | { name: 'calibration' }
  | { name: 'settings' };

export function App() {
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings());
  const [screen, setScreen] = useState<Screen>({ name: 'select' });
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);

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

  switch (screen.name) {
    case 'select':
      return (
        <SongSelectScreen
          settings={settings}
          onSettingsChange={setSettings}
          onPlay={play}
          onCalibrate={() => setScreen({ name: 'calibration' })}
          onOpenSettings={() => setScreen({ name: 'settings' })}
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
          onQuit={toSelect}
        />
      );
    case 'result':
      return (
        <ResultScreen
          request={screen.request}
          outcome={screen.outcome}
          settings={settings}
          onSettingsChange={setSettings}
          onRetry={() => play(screen.request)}
          onBack={toSelect}
        />
      );
    case 'calibration':
      return <CalibrationScreen settings={settings} onSettingsChange={setSettings} onBack={toSelect} />;
    case 'settings':
      return <SettingsScreen settings={settings} onSettingsChange={setSettings} onBack={toSelect} />;
  }
}
