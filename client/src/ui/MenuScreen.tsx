import { getAudioEngine } from '../audio/AudioEngine';
import { clickTrackBuffer } from '../audio/clickTrack';
import { enabledKeyModes } from '../engine/config';
import { buildSyncTestChart, DEFAULT_SYNC_TEST } from '../engine/syncTest';
import type { KeyModeId } from '../engine/types';
import type { Settings } from '../settings/settings';
import type { PlayRequest } from './App';

interface Props {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onPlay: (request: PlayRequest) => void;
  onCalibrate: () => void;
  onOpenSettings: () => void;
}

export function syncTestRequest(keyMode: KeyModeId, autoPlay: boolean): PlayRequest {
  const spec = { ...DEFAULT_SYNC_TEST, keyMode };
  return {
    chart: buildSyncTestChart(spec),
    autoPlay,
    loadAudio: async () =>
      clickTrackBuffer(getAudioEngine().ctx, {
        bpm: spec.bpm,
        firstBeatMs: spec.firstBeatMs,
        beats: spec.beats,
        beatsPerMeasure: 4,
        tailMs: 1500,
      }),
  };
}

export function MenuScreen({ settings, onSettingsChange, onPlay, onCalibrate, onOpenSettings }: Props) {
  const keyMode = settings.lastKeyMode;
  return (
    <div className="menu-screen">
      <header className="menu-header">
        <h1>Generative Rhythm</h1>
        <p className="tagline">내 음악으로 만드는 채보 · SDVX 시점 · DJMAX 판정</p>
      </header>

      <section className="panel">
        <h2>싱크 테스트</h2>
        <p className="hint">클릭 트랙에 맞춰 노트가 내려옵니다. 오토 플레이는 모든 노트가 MAX 100%여야 정상입니다.</p>
        <div className="row">
          <span className="label">키 모드</span>
          <div className="segmented">
            {enabledKeyModes.map((m) => (
              <button
                key={m}
                className={m === keyMode ? 'active' : ''}
                onClick={() => onSettingsChange({ ...settings, lastKeyMode: m })}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="row buttons">
          <button className="primary" data-testid="sync-auto" onClick={() => onPlay(syncTestRequest(keyMode, true))}>
            오토 플레이
          </button>
          <button data-testid="sync-play" onClick={() => onPlay(syncTestRequest(keyMode, false))}>
            직접 플레이
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>준비</h2>
        <div className="row buttons">
          <button data-testid="open-calibration" onClick={onCalibrate}>오프셋 캘리브레이션</button>
          <button data-testid="open-settings" onClick={onOpenSettings}>설정</button>
        </div>
        <p className="hint">
          판정 오프셋 {settings.inputOffsetMs > 0 ? '+' : ''}{settings.inputOffsetMs}ms · 표시 오프셋{' '}
          {settings.visualOffsetMs > 0 ? '+' : ''}{settings.visualOffsetMs}ms · 배속 {settings.hiSpeed.toFixed(1)}
        </p>
      </section>
    </div>
  );
}
