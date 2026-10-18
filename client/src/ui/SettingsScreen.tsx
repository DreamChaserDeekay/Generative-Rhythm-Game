import { useEffect, useState } from 'react';
import { api, type BackendStatus } from '../api/client';
import { cameraConfig, enabledKeyModes, judgementConfig, keyModes, type JudgementModeId } from '../engine/config';
import type { KeyModeId } from '../engine/types';
import {
  activeCovers,
  bindingsFor,
  DEFAULT_SETTINGS,
  padBindingsFor,
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
import { BUILTIN_SKINS, sanitizeSkin, skinById } from '../render/skins';
import { GamepadPoller, padCodeLabel } from '../input/gamepad';
import { KeyGhostTest } from './KeyGhostTest';
import { PlayRulesPanel } from './PlayOptions';

interface Props {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onBack: () => void;
}

const BACKEND_LABELS: Record<string, string> = { stems: '스템 분리', beats: '비트·다운비트', pitch: '음높이·음 길이', structure: '곡 구조' };
/** Sections, for the jump links under the title. */
const SECTIONS: [string, string][] = [
  ['judge', '판정 · 속도'],
  ['covers', '레인 커버'],
  ['rules', '플레이 규칙'],
  ['display', '화면'],
  ['skin', '스킨'],
  ['sound', '소리'],
  ['keys', '키 설정'],
  ['pad', '게임패드'],
  ['backend', '분석 백엔드'],
];

export function SettingsScreen({ settings, onSettingsChange, onBack }: Props) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onSettingsChange({ ...settings, [key]: value });
  const [rebinding, setRebinding] = useState<{ mode: KeyModeId; lane: number } | null>(null);
  const [ghostMode, setGhostMode] = useState<KeyModeId | null>(null);
  const [skinText, setSkinText] = useState('');
  const [backends, setBackends] = useState<BackendStatus[] | null>(null);
  useEffect(() => {
    api
      .health()
      .then((h) => setBackends(h.backends ?? []))
      .catch(() => setBackends(null));
  }, []);
  const [skinError, setSkinError] = useState<string | null>(null);
  const applySkinText = () => {
    try {
      const skin = sanitizeSkin(JSON.parse(skinText));
      if (!skin) throw new Error('스킨 JSON 객체가 아닙니다');
      setSkinError(null);
      onSettingsChange({ ...settings, skin: 'custom', customSkin: skin });
    } catch (e) {
      setSkinError(e instanceof Error ? e.message : String(e));
    }
  };
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
      <header className="settings-header">
        <div className="settings-title">
          <h1>설정</h1>
          <button className="primary" onClick={onBack}>완료 <kbd>Esc</kbd></button>
        </div>
        <nav className="settings-nav">
          {SECTIONS.map(([id, label]) => (
            <button key={id} className="quiet small" onClick={() => document.getElementById(`settings-${id}`)?.scrollIntoView({ block: 'start' })}>
              {label}
            </button>
          ))}
        </nav>
      </header>

      <section className="panel" id="settings-judge">
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

      <section className="panel" id="settings-covers">
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

      <section className="panel" id="settings-rules">
        <h2>플레이 규칙</h2>
        <PlayRulesPanel settings={settings} onSettingsChange={onSettingsChange} />
      </section>

      <section className="panel" id="settings-display">
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
          번쩍임 줄이기 (타격 효과·FEVER·카메라 연출 약하게)
        </label>
        <div className="row">
          <span className="label">카메라 연출</span>
          <input type="range" min={0} max={1} step={0.1} value={settings.cameraFx} data-testid="camera-fx" onChange={(e) => set('cameraFx', Number(e.target.value))} />
          <span className="value">{settings.cameraFx === 0 ? '끔' : `${Math.round(settings.cameraFx * 100)}%`}</span>
          <span className="hint">드롭·후렴에서 트랙 기울기와 줌 (SDVX식)</span>
        </div>
        <div className="row">
          <span className="label">배경 밝기</span>
          <input type="range" min={0} max={1} step={0.05} value={settings.bgBrightness} onChange={(e) => set('bgBrightness', Number(e.target.value))} />
          <span className="value">{Math.round(settings.bgBrightness * 100)}%</span>
        </div>
        <label className="row check">
          <input type="checkbox" checked={settings.visualizer} onChange={(e) => set('visualizer', e.target.checked)} />
          배경 비주얼라이저 (음악에 반응하는 스펙트럼)
        </label>
        <label className="row check">
          <input type="checkbox" checked={settings.bga} onChange={(e) => set('bga', e.target.checked)} />
          곡에 등록한 배경 영상(BGA) 재생
        </label>
        <label className="row check">
          <input type="checkbox" checked={settings.showErrorMs} onChange={(e) => set('showErrorMs', e.target.checked)} />
          판정에 ms 오차 표시
        </label>
      </section>

      <section className="panel" id="settings-skin" data-testid="skin-settings">
        <h2>스킨</h2>
        <div className="row">
          <div className="segmented wrap">
            {BUILTIN_SKINS.map((k) => (
              <button key={k.id} className={settings.skin === k.id ? 'active' : ''} data-testid={`skin-${k.id}`} onClick={() => set('skin', k.id)}>
                {k.label}
              </button>
            ))}
            {settings.customSkin !== null && (
              <button className={settings.skin === 'custom' ? 'active' : ''} onClick={() => set('skin', 'custom')}>
                {(settings.customSkin as { label?: string }).label ?? '사용자 스킨'}
              </button>
            )}
          </div>
        </div>
        <p className="hint">노트 모양(box·flat·round), 레인 색 배치(mode·uniform·rainbow), 타격 효과(burst·ring·none)와 트랙 색을 JSON으로 바꿀 수 있습니다.</p>
        <textarea
          className="skin-json"
          rows={6}
          spellCheck={false}
          placeholder='{"label": "내 스킨", "noteShape": "round", "laneLayout": "rainbow", "colors": {"judgeLine": "#ff3b3b"}}'
          value={skinText}
          onChange={(e) => setSkinText(e.target.value)}
        />
        <div className="row">
          <button className="small" onClick={applySkinText} disabled={!skinText.trim()}>
            사용자 스킨 적용
          </button>
          <button className="small" onClick={() => setSkinText(JSON.stringify(skinById(settings.skin, settings.customSkin), null, 2))}>
            현재 스킨 JSON 보기
          </button>
          {skinError && <span className="error">{skinError}</span>}
        </div>
      </section>

      <section className="panel" id="settings-sound">
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
        <label className="row check">
          <input type="checkbox" checked={settings.keysound} data-testid="keysound-toggle" onChange={(e) => set('keysound', e.target.checked)} />
          키음 — 생성 채보의 노트마다 그 노트가 따라가는 악기 소리를 붙여, 치면 그 소리가 나고 놓치면 빠집니다 (가져온 BMS·bmson은 항상 원래 키음)
        </label>
      </section>

      <section className="panel" id="settings-keys">
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

      <GamepadPanel settings={settings} onSettingsChange={onSettingsChange} />

      <section className="panel" id="settings-backend" data-testid="backend-status">
        <h2>분석 백엔드</h2>
        <p className="hint">
          기본 분석(numpy·scipy)은 항상 동작합니다. 아래 ML 라이브러리를 서버에 설치하면 다음 분석부터 자동으로 쓰이고, 곡 정보의 &quot;다시 분석&quot;으로 기존 곡에도 적용할 수 있습니다.
        </p>
        {backends === null ? (
          <p className="hint">분석 서버에 연결할 수 없습니다.</p>
        ) : (
          <table className="backend-table">
            <tbody>
              {backends.map((b) => (
                <tr key={b.kind}>
                  <td>{BACKEND_LABELS[b.kind] ?? b.kind}</td>
                  <td>{b.name}</td>
                  <td className={b.active ? 'ok' : 'off'}>{b.active ? `사용 중 (${b.version})` : b.installed ? '설치됨 · 꺼짐' : '설치 안 됨'}</td>
                  <td className="hint">{b.license}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <pre className="install-hint">
          {'cd server\n'}
          {'.venv/bin/pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu\n'}
          {'.venv/bin/pip install -e ".[ml]"     # demucs · beat-this (+ basic-pitch: Python 3.11)'}
        </pre>
      </section>

      <div className="row buttons">
        <button className="danger" onClick={() => onSettingsChange({ ...DEFAULT_SETTINGS })}>모두 초기화</button>
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
      <button className="step" onClick={() => props.onChange(clamp(props.value - 5))}>−5</button>
      <button className="step" onClick={() => props.onChange(clamp(props.value - 1))}>−1</button>
      <input
        type="number"
        value={props.value}
        min={props.min}
        max={props.max}
        onChange={(e) => props.onChange(clamp(Number(e.target.value) || 0))}
      />
      <button className="step" onClick={() => props.onChange(clamp(props.value + 1))}>+1</button>
      <button className="step" onClick={() => props.onChange(clamp(props.value + 5))}>+5</button>
      <span className="value">{props.unit}</span>
    </div>
  );
}

/** Connected controllers and a gamepad control per lane, captured by pressing it. */
function GamepadPanel({ settings, onSettingsChange }: { settings: Settings; onSettingsChange: (s: Settings) => void }) {
  const [pads, setPads] = useState<string[]>([]);
  const [capture, setCapture] = useState<{ mode: KeyModeId; lane: number } | null>(null);

  // list connected pads (a pad shows up only after one of its buttons is pressed on this page)
  useEffect(() => {
    const read = () =>
      setPads((navigator.getGamepads?.() ?? []).filter((g): g is Gamepad => !!g && g.connected).map((g) => `${g.id}${g.mapping === 'standard' ? '' : ' (비표준 배치)'}`));
    read();
    const id = window.setInterval(read, 1000);
    window.addEventListener('gamepadconnected', read);
    window.addEventListener('gamepaddisconnected', read);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('gamepadconnected', read);
      window.removeEventListener('gamepaddisconnected', read);
    };
  }, []);

  // capture: the first control pressed (or a turntable spun) becomes the lane's control
  useEffect(() => {
    if (!capture) return;
    const poller = new GamepadPoller((e) => {
      if (!e.down) return;
      const current = [...padBindingsFor(settings, capture.mode)];
      const clash = current.indexOf(e.code);
      if (clash >= 0) current[clash] = current[capture.lane]; // swap
      current[capture.lane] = e.code;
      onSettingsChange({ ...settings, padBindings: { ...settings.padBindings, [capture.mode]: current } });
      setCapture(null);
    }, { intervalMs: 8 });
    poller.start();
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      e.stopImmediatePropagation(); // cancels the capture, not the settings screen
      setCapture(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => {
      poller.stop();
      window.removeEventListener('keydown', onKey, { capture: true });
    };
  }, [capture, settings, onSettingsChange]);

  return (
    <section className="panel" id="settings-pad" data-testid="gamepad-settings">
      <h2>게임패드 · 전용 컨트롤러</h2>
      <p className="hint" data-testid="gamepad-status">
        {pads.length > 0 ? `연결됨: ${pads.join(', ')}` : '연결된 패드가 없습니다. 패드의 버튼을 하나 누르면 나타납니다.'}
      </p>
      {enabledKeyModes.map((mode) => (
        <div className="row" key={mode}>
          <span className="label">{mode}</span>
          <div className="keys">
            {padBindingsFor(settings, mode).map((code, lane) => {
              const active = capture?.mode === mode && capture.lane === lane;
              return (
                <button
                  key={lane}
                  className={`key-cap pad-cap lane-${keyModes[mode].lanes[lane].color} ${active ? 'active' : ''}`}
                  title={code ? padCodeLabel(code) : '지정 안 됨'}
                  onClick={() => setCapture(active ? null : { mode, lane })}
                >
                  {active ? '…' : code ? padCodeLabel(code) : '-'}
                </button>
              );
            })}
          </div>
          <button className="small" onClick={() => onSettingsChange({ ...settings, padBindings: { ...settings.padBindings, [mode]: undefined } })}>
            지우기
          </button>
        </div>
      ))}
      <p className="hint">
        레인을 누른 뒤 패드 버튼을 누르거나, 턴테이블을 돌리면 지정됩니다(Esc 취소). 키보드 키와 함께 쓸 수 있습니다. 패드는 화면 프레임과 따로 짧은 간격으로 읽고, 브라우저가 패드 신호를 받은 시각으로 판정합니다.
        메뉴에서는 십자키·왼쪽 스틱이 방향키, A·Start가 Enter, B가 Esc, Y가 Tab으로 동작하고, 플레이 중 Start로 일시정지합니다.
      </p>
    </section>
  );
}
