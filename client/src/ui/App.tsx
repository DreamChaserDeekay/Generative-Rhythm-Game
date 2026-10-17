import { useCallback, useState } from 'react';
import type { SessionResult } from '../engine/session';
import type { Chart } from '../engine/types';
import { loadSettings, saveSettings, type Settings } from '../settings/settings';
import { CalibrationScreen } from './CalibrationScreen';
import { PlayScreen } from './PlayScreen';
import { ResultScreen } from './ResultScreen';
import { SettingsScreen } from './SettingsScreen';
import { SongSelectScreen } from './SongSelectScreen';

export interface PlayRequest {
  chart: Chart;
  /** Loads the decoded audio for the chart (null = silent). */
  loadAudio: () => Promise<AudioBuffer | null>;
  autoPlay: boolean;
}

type Screen =
  | { name: 'select' }
  | { name: 'play'; request: PlayRequest; runId: number }
  | { name: 'result'; request: PlayRequest; result: SessionResult }
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
          onFinish={(result) => setScreen({ name: 'result', request: screen.request, result })}
          onQuit={toSelect}
        />
      );
    case 'result':
      return (
        <ResultScreen
          request={screen.request}
          result={screen.result}
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
