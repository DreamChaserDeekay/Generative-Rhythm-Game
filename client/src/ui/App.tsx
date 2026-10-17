import { useCallback, useState } from 'react';
import type { SessionResult } from '../engine/session';
import type { Chart } from '../engine/types';
import { loadSettings, saveSettings, type Settings } from '../settings/settings';
import { CalibrationScreen } from './CalibrationScreen';
import { MenuScreen } from './MenuScreen';
import { PlayScreen } from './PlayScreen';
import { ResultScreen } from './ResultScreen';
import { SettingsScreen } from './SettingsScreen';

export interface PlayRequest {
  chart: Chart;
  /** Loads the decoded audio for the chart (null = silent). */
  loadAudio: () => Promise<AudioBuffer | null>;
  autoPlay: boolean;
}

type Screen =
  | { name: 'menu' }
  | { name: 'play'; request: PlayRequest; runId: number }
  | { name: 'result'; request: PlayRequest; result: SessionResult }
  | { name: 'calibration' }
  | { name: 'settings' };

export function App() {
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings());
  const [screen, setScreen] = useState<Screen>({ name: 'menu' });

  const setSettings = useCallback((next: Settings) => {
    setSettingsState(next);
    saveSettings(next);
  }, []);

  const play = useCallback((request: PlayRequest) => setScreen({ name: 'play', request, runId: Date.now() }), []);
  const toMenu = useCallback(() => setScreen({ name: 'menu' }), []);

  switch (screen.name) {
    case 'menu':
      return (
        <MenuScreen
          settings={settings}
          onSettingsChange={setSettings}
          onPlay={play}
          onCalibrate={() => setScreen({ name: 'calibration' })}
          onOpenSettings={() => setScreen({ name: 'settings' })}
        />
      );
    case 'play':
      return (
        <PlayScreen
          key={screen.runId}
          request={screen.request}
          settings={settings}
          onFinish={(result) => setScreen({ name: 'result', request: screen.request, result })}
          onQuit={toMenu}
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
          onBack={toMenu}
        />
      );
    case 'calibration':
      return <CalibrationScreen settings={settings} onSettingsChange={setSettings} onBack={toMenu} />;
    case 'settings':
      return <SettingsScreen settings={settings} onSettingsChange={setSettings} onBack={toMenu} />;
  }
}
