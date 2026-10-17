import { useEffect, useState } from 'react';
import { cameraConfig, enabledKeyModes, judgementConfig, keyModes, type JudgementModeId } from '../engine/config';
import type { KeyModeId } from '../engine/types';
import {
  activeCovers,
  bindingsFor,
  DEFAULT_SETTINGS,
  greenNumber,
  HI_SPEED_MAX,
  HI_SPEED_MIN,
  keyLabel,
  MAX_COVER,
  MAX_LIFT,
  withCovers,
  type JudgePosition,
  type Palette,
  type ScrollMode,
  type Settings,
} from '../settings/settings';
import { KeyGhostTest } from './KeyGhostTest';
import { PlayRulesPanel } from './PlayOptions';

interface Props {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onBack: () => void;
}

export function SettingsScreen({ settings, onSettingsChange, onBack }: Props) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onSettingsChange({ ...settings, [key]: value });
  const [rebinding, setRebinding] = useState<{ mode: KeyModeId; lane: number } | null>(null);
  const [ghostMode, setGhostMode] = useState<KeyModeId | null>(null);
  const green = Math.round(greenNumber(settings.hiSpeed, activeCovers(settings)));
  const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

  useEffect(() => {
    if (ghostMode) return;
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
  }, [rebinding, ghostMode, settings, onSettingsChange, onBack]);

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
          <span className="value" data-testid="green-number">
            {settings.hiSpeed.toFixed(2)} · 녹색 숫자 {green}ms
          </span>
        </div>
        <div className="row">
          <span className="label">스크롤</span>
          <div className="segmented">
            {(
              [
                ['time', '시간 고정'],
                ['beat', 'BPM 연동'],
              ] as [ScrollMode, string][]
            ).map(([id, label]) => (
              <button key={id} className={settings.scrollMode === id ? 'active' : ''} onClick={() => set('scrollMode', id)}>
                {label}
              </button>
            ))}
          </div>
          <span className="hint">BPM 연동은 빠른 구간에서 노트도 빨라집니다(변속 곡).</span>
        </div>
        <label className="row check">
          <input type="checkbox" checked={settings.keepVisibleTime} onChange={(e) => set('keepVisibleTime', e.target.checked)} />
          녹색 숫자 유지 — 커버·LIFT를 움직여도 노트가 보이는 시간을 그대로 둡니다
        </label>
        <NumberRow label="판정 오프셋" unit="ms" value={settings.inputOffsetMs} min={-200} max={200} onChange={(v) => set('inputOffsetMs', v)} />
        <NumberRow label="표시 오프셋" unit="ms" value={settings.visualOffsetMs} min={-200} max={200} onChange={(v) => set('visualOffsetMs', v)} />
      </section>

      <section className="panel">
        <h2>레인 커버</h2>
        <CoverRow label="SUDDEN+" value={settings.sudden} max={MAX_COVER} onChange={(v) => onSettingsChange(withCovers(settings, { sudden: v }))} format={pct} />
        <CoverRow label="HIDDEN+" value={settings.hidden} max={MAX_COVER} onChange={(v) => onSettingsChange(withCovers(settings, { hidden: v }))} format={pct} />
        <CoverRow label="LIFT" value={settings.lift} max={MAX_LIFT} onChange={(v) => onSettingsChange(withCovers(settings, { lift: v }))} format={pct} />
        <label className="row check">
          <input type="checkbox" checked={settings.coversOn} onChange={(e) => onSettingsChange(withCovers(settings, { coversOn: e.target.checked }))} />
          커버 사용 (플레이 중 Home으로 켜고 끕니다)
        </label>
        <p className="hint">
          플레이 중: ↑/↓ 배속 ±0.1 (Shift ±0.5) · PageUp/PageDown SUDDEN+ · Shift+PageUp/PageDown LIFT · Home 커버 켜기/끄기. 바꾼 값은 다음 플레이에도
          유지됩니다.
        </p>
      </section>

      <section className="panel">
        <h2>플레이 규칙</h2>
        <PlayRulesPanel settings={settings} onSettingsChange={onSettingsChange} />
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
        <div className="row">
          <span className="label">판정 위치</span>
          <div className="segmented">
            {(
              [
                ['low', '낮게'],
                ['mid', '보통'],
                ['high', '높게'],
              ] as [JudgePosition, string][]
            ).map(([id, label]) => (
              <button key={id} className={settings.judgePosition === id ? 'active' : ''} onClick={() => set('judgePosition', id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="row">
          <span className="label">색상</span>
          <div className="segmented">
            {(
              [
                ['default', '기본'],
                ['colorblind', '색각 보정'],
              ] as [Palette, string][]
            ).map(([id, label]) => (
              <button key={id} className={settings.palette === id ? 'active' : ''} data-testid={`palette-${id}`} onClick={() => set('palette', id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="row check">
          <input type="checkbox" checked={settings.reducedFlash} onChange={(e) => set('reducedFlash', e.target.checked)} />
          번쩍임 줄이기 (타격 효과·FEVER 연출 약하게)
        </label>
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
            <button className="small" data-testid={`ghost-${mode}`} onClick={() => setGhostMode(ghostMode === mode ? null : mode)}>
              동시 입력 테스트
            </button>
          </div>
        ))}
        {ghostMode && <KeyGhostTest mode={ghostMode} bindings={bindingsFor(settings, ghostMode)} onClose={() => setGhostMode(null)} />}
        <p className="hint">키를 누른 뒤 원하는 키를 입력하세요. 이미 쓰는 키를 고르면 서로 바뀝니다. 한글 입력 상태와 무관하게 동작합니다.</p>
      </section>

      <div className="row buttons center">
        <button className="primary" onClick={onBack}>완료 <kbd>Esc</kbd></button>
        <button onClick={() => onSettingsChange({ ...DEFAULT_SETTINGS })}>모두 초기화</button>
      </div>
    </div>
  );
}

function CoverRow(props: { label: string; value: number; max: number; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <div className="row">
      <span className="label">{props.label}</span>
      <input type="range" min={0} max={props.max} step={0.005} value={props.value} onChange={(e) => props.onChange(Number(e.target.value))} />
      <span className="value">{props.format(props.value)}</span>
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
