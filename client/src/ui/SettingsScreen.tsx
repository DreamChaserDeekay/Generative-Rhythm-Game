import { useEffect, useState } from 'react';
import { cameraConfig, enabledKeyModes, judgementConfig, keyModes, type JudgementModeId } from '../engine/config';
import type { KeyModeId } from '../engine/types';
import {
  bindingsFor,
  DEFAULT_SETTINGS,
  HI_SPEED_MAX,
  HI_SPEED_MIN,
  keyLabel,
  visibleTimeMs,
  type Settings,
} from '../settings/settings';

interface Props {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onBack: () => void;
}

export function SettingsScreen({ settings, onSettingsChange, onBack }: Props) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onSettingsChange({ ...settings, [key]: value });
  const [rebinding, setRebinding] = useState<{ mode: KeyModeId; lane: number } | null>(null);

  useEffect(() => {
    if (!rebinding) {
      const onKey = (e: KeyboardEvent) => e.code === 'Escape' && onBack();
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code === 'Escape') {
        setRebinding(null);
        return;
      }
      const current = [...bindingsFor(settings, rebinding.mode)];
      const clash = current.indexOf(e.code);
      if (clash >= 0) current[clash] = current[rebinding.lane]; // swap
      current[rebinding.lane] = e.code;
      onSettingsChange({ ...settings, bindings: { ...settings.bindings, [rebinding.mode]: current } });
      setRebinding(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [rebinding, settings, onSettingsChange, onBack]);

  return (
    <div className="menu-screen settings-screen" data-testid="settings-screen">
      <header className="menu-header">
        <h1>설정</h1>
      </header>

      <section className="panel">
        <h2>판정 · 속도</h2>
        <div className="row">
          <span className="label">판정</span>
          <div className="segmented">
            {(Object.keys(judgementConfig.modes) as JudgementModeId[]).map((m) => (
              <button key={m} className={settings.judgementMode === m ? 'active' : ''} onClick={() => set('judgementMode', m)}>
                {judgementConfig.modes[m].label}
              </button>
            ))}
          </div>
        </div>
        <div className="row">
          <span className="label">배속</span>
          <input
            type="range"
            min={HI_SPEED_MIN}
            max={HI_SPEED_MAX}
            step={0.1}
            value={settings.hiSpeed}
            onChange={(e) => set('hiSpeed', Number(e.target.value))}
          />
          <span className="value">{settings.hiSpeed.toFixed(1)} ({Math.round(visibleTimeMs(settings.hiSpeed))}ms)</span>
        </div>
        <NumberRow label="판정 오프셋" unit="ms" value={settings.inputOffsetMs} min={-200} max={200} onChange={(v) => set('inputOffsetMs', v)} />
        <NumberRow label="표시 오프셋" unit="ms" value={settings.visualOffsetMs} min={-200} max={200} onChange={(v) => set('visualOffsetMs', v)} />
      </section>

      <section className="panel">
        <h2>화면</h2>
        <div className="row">
          <span className="label">카메라</span>
          <div className="segmented">
            {Object.entries(cameraConfig.presets).map(([id, p]) => (
              <button key={id} className={settings.cameraPreset === id ? 'active' : ''} onClick={() => set('cameraPreset', id)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="row">
          <span className="label">레인 폭</span>
          <input
            type="range"
            min={0.8}
            max={1.4}
            step={0.05}
            value={settings.laneWidthScale}
            onChange={(e) => set('laneWidthScale', Number(e.target.value))}
          />
          <span className="value">{Math.round(settings.laneWidthScale * 100)}%</span>
        </div>
        <label className="row check">
          <input type="checkbox" checked={settings.showErrorMs} onChange={(e) => set('showErrorMs', e.target.checked)} />
          판정에 ms 오차 표시
        </label>
      </section>

      <section className="panel">
        <h2>소리</h2>
        <div className="row">
          <span className="label">음악</span>
          <input type="range" min={0} max={1} step={0.05} value={settings.musicVolume} onChange={(e) => set('musicVolume', Number(e.target.value))} />
          <span className="value">{Math.round(settings.musicVolume * 100)}%</span>
        </div>
        <div className="row">
          <span className="label">효과음</span>
          <input type="range" min={0} max={1} step={0.05} value={settings.sfxVolume} onChange={(e) => set('sfxVolume', Number(e.target.value))} />
          <span className="value">{Math.round(settings.sfxVolume * 100)}%</span>
        </div>
        <label className="row check">
          <input type="checkbox" checked={settings.hitSound} onChange={(e) => set('hitSound', e.target.checked)} />
          타격음
        </label>
      </section>

      <section className="panel">
        <h2>키 설정</h2>
        {enabledKeyModes.map((mode) => (
          <div className="row" key={mode}>
            <span className="label">{mode}</span>
            <div className="keys">
              {bindingsFor(settings, mode).map((code, lane) => {
                const active = rebinding?.mode === mode && rebinding.lane === lane;
                return (
                  <button
                    key={lane}
                    className={`key-cap lane-${keyModes[mode].lanes[lane].color} ${active ? 'active' : ''}`}
                    onClick={() => setRebinding({ mode, lane })}
                  >
                    {active ? '…' : keyLabel(code)}
                  </button>
                );
              })}
            </div>
            {mode === '7K+1S' && (
              <button
                className="small"
                onClick={() => onSettingsChange({ ...settings, bindings: { ...settings.bindings, [mode]: keyModes[mode].bindings.BMS } })}
              >
                BMS 배치
              </button>
            )}
            <button
              className="small"
              onClick={() => onSettingsChange({ ...settings, bindings: { ...settings.bindings, [mode]: keyModes[mode].bindings.default } })}
            >
              기본값
            </button>
          </div>
        ))}
        <p className="hint">키를 누른 뒤 원하는 키를 입력하세요. 이미 쓰는 키를 고르면 서로 바뀝니다. 한글 입력 상태와 무관하게 동작합니다.</p>
      </section>

      <div className="row buttons center">
        <button className="primary" onClick={onBack}>완료 <kbd>Esc</kbd></button>
        <button onClick={() => onSettingsChange({ ...DEFAULT_SETTINGS })}>모두 초기화</button>
      </div>
    </div>
  );
}

function NumberRow(props: { label: string; unit: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.min(props.max, Math.max(props.min, Math.round(v)));
  return (
    <div className="row">
      <span className="label">{props.label}</span>
      <button className="small" onClick={() => props.onChange(clamp(props.value - 5))}>−5</button>
      <button className="small" onClick={() => props.onChange(clamp(props.value - 1))}>−1</button>
      <input
        type="number"
        value={props.value}
        min={props.min}
        max={props.max}
        onChange={(e) => props.onChange(clamp(Number(e.target.value) || 0))}
      />
      <button className="small" onClick={() => props.onChange(clamp(props.value + 1))}>+1</button>
      <button className="small" onClick={() => props.onChange(clamp(props.value + 5))}>+5</button>
      <span className="value">{props.unit}</span>
    </div>
  );
}
