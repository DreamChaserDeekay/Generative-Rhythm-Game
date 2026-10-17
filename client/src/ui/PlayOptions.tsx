import { gaugeRules, gaugeTypeIds, keyModes } from '../engine/config';
import type { FeverMode } from '../engine/fever';
import { placementIds, placementLabels } from '../engine/placement';
import { rulesetConfigs, rulesetIds } from '../engine/ruleset';
import type { KeyModeId } from '../engine/types';
import {
  DEFAULT_GENERATION,
  GEN_STYLES,
  RHYTHM_SOURCES,
  type GenerationPrefs,
  type GenStyle,
  type Pacemaker,
  type RhythmSource,
  type Settings,
} from '../settings/settings';
import type { PracticeOptions } from './App';

export const STYLE_LABELS: Record<GenStyle, string> = {
  balanced: '균형',
  stream: '스트림',
  chord: '동치',
  jack: '연타',
  longnote: '롱노트',
  technical: '테크니컬',
  melody: '멜로디',
};

const RHYTHM_LABELS: Record<RhythmSource, string> = {
  auto: '자동',
  drum: '드럼',
  bass: '베이스',
  melody: '멜로디',
  vocal: '보컬',
};

const FEVER_LABELS: Record<FeverMode, string> = { AUTO: '자동', MANUAL: '수동 (Enter)', OFF: '끔' };
const PACEMAKER_LABELS: Record<Pacemaker, string> = {
  OFF: '끔',
  BEST: '내 최고 기록',
  '90': '90%',
  '95': '95%',
  '98': '98%',
  '99': '99%',
  '100': '100%',
};

interface SettingsProps {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
}

/** Ruleset, gauge, FEVER, placement and pacemaker (applied when the play starts). */
export function PlayRulesPanel({ settings, onSettingsChange }: SettingsProps) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onSettingsChange({ ...settings, [key]: value });
  return (
    <div className="options-grid" data-testid="play-rules">
      <span className="label">판정 표기</span>
      <div className="segmented">
        {rulesetIds.map((id) => (
          <button key={id} className={settings.ruleset === id ? 'active' : ''} title={rulesetConfigs[id].reference} onClick={() => set('ruleset', id)}>
            {rulesetConfigs[id].label}
          </button>
        ))}
      </div>
      <span className="label">게이지</span>
      <div className="segmented wrap">
        {gaugeTypeIds.map((id) => (
          <button key={id} className={settings.gaugeType === id ? 'active' : ''} data-testid={`gauge-${id}`} onClick={() => set('gaugeType', id)}>
            {gaugeRules[id].label}
          </button>
        ))}
      </div>
      <span className="label">FEVER</span>
      <div className="segmented">
        {(Object.keys(FEVER_LABELS) as FeverMode[]).map((m) => (
          <button key={m} className={settings.fever === m ? 'active' : ''} onClick={() => set('fever', m)}>
            {FEVER_LABELS[m]}
          </button>
        ))}
      </div>
      <span className="label">배치</span>
      <div className="segmented wrap">
        {placementIds.map((id) => (
          <button key={id} className={settings.placement === id ? 'active' : ''} data-testid={`placement-${id}`} onClick={() => set('placement', id)}>
            {placementLabels[id]}
          </button>
        ))}
      </div>
      <span className="label">페이스메이커</span>
      <select value={settings.pacemaker} onChange={(e) => set('pacemaker', e.target.value as Pacemaker)}>
        {(Object.keys(PACEMAKER_LABELS) as Pacemaker[]).map((p) => (
          <option key={p} value={p}>
            {PACEMAKER_LABELS[p]}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Request parameters for the generator from the stored preferences. */
export function generationParams(prefs: GenerationPrefs, keyMode: KeyModeId): Record<string, unknown> {
  const kinds = new Set(keyModes[keyMode].lanes.map((l) => l.kind));
  const params: Record<string, unknown> = { style: prefs.style, rhythmSource: prefs.rhythmSource };
  if (prefs.density !== null) params.density = prefs.density;
  if (prefs.longNoteRatio !== null) params.longNoteRatio = prefs.longNoteRatio;
  if (prefs.maxChord !== null) params.maxChord = prefs.maxChord;
  if (prefs.specialRate !== null) {
    if (kinds.has('scratch')) params.scratchRate = prefs.specialRate;
    if (kinds.has('side')) params.sideRate = prefs.specialRate;
  }
  return params;
}

/** Style and explicit overrides for the generator. */
export function GenerationPanel({ settings, onSettingsChange, keyMode }: SettingsProps & { keyMode: KeyModeId }) {
  const g = settings.generation;
  const set = (patch: Partial<GenerationPrefs>) => onSettingsChange({ ...settings, generation: { ...g, ...patch } });
  const kinds = new Set(keyModes[keyMode].lanes.map((l) => l.kind));
  const special = kinds.has('scratch') ? '스크래치' : kinds.has('side') ? '사이드' : null;
  const keyCount = keyModes[keyMode].lanes.filter((l) => l.kind === 'key').length;
  return (
    <div className="options-grid" data-testid="generation-options">
      <span className="label">스타일</span>
      <div className="segmented wrap">
        {GEN_STYLES.map((s) => (
          <button key={s} className={g.style === s ? 'active' : ''} data-testid={`style-${s}`} onClick={() => set({ style: s })}>
            {STYLE_LABELS[s]}
          </button>
        ))}
      </div>
      <span className="label">리듬 기준</span>
      <div className="segmented wrap">
        {RHYTHM_SOURCES.map((r) => (
          <button key={r} className={g.rhythmSource === r ? 'active' : ''} onClick={() => set({ rhythmSource: r })}>
            {RHYTHM_LABELS[r]}
          </button>
        ))}
      </div>
      <OptionalSlider label="밀도" value={g.density} min={0.5} max={1.5} step={0.05} auto={1} format={(v) => `×${v.toFixed(2)}`} onChange={(v) => set({ density: v })} />
      <OptionalSlider
        label="롱노트 비율"
        value={g.longNoteRatio}
        min={0}
        max={0.5}
        step={0.01}
        auto={0.15}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => set({ longNoteRatio: v })}
      />
      <OptionalSlider label="최대 동시 노트" value={g.maxChord} min={1} max={Math.max(2, Math.ceil(keyCount * 0.6) + 1)} step={1} auto={2} format={(v) => `${v}개`} onChange={(v) => set({ maxChord: v })} />
      {special && (
        <OptionalSlider
          label={`${special} 비율`}
          value={g.specialRate}
          min={0}
          max={0.2}
          step={0.01}
          auto={0.06}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => set({ specialRate: v })}
        />
      )}
      <span />
      <div className="row">
        <button className="small" onClick={() => onSettingsChange({ ...settings, generation: DEFAULT_GENERATION })}>생성 옵션 초기화</button>
        <span className="hint">옵션이 바뀌면 채보를 새로 만듭니다. 소리가 없는 곳에는 어떤 옵션에서도 노트를 만들지 않습니다.</span>
      </div>
    </div>
  );
}

function OptionalSlider(props: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  step: number;
  auto: number;
  format: (v: number) => string;
  onChange: (v: number | null) => void;
}) {
  const on = props.value !== null;
  return (
    <>
      <span className="label">{props.label}</span>
      <div className="row">
        <label className="row check">
          <input type="checkbox" checked={!on} onChange={(e) => props.onChange(e.target.checked ? null : props.auto)} />
          자동
        </label>
        {on && (
          <>
            <input
              type="range"
              min={props.min}
              max={props.max}
              step={props.step}
              value={props.value ?? props.auto}
              onChange={(e) => props.onChange(Number(e.target.value))}
            />
            <span className="value">{props.format(props.value ?? props.auto)}</span>
          </>
        )}
      </div>
    </>
  );
}

/** Practice: playback speed and loop (the A–B segment is picked on the minimap). */
export function PracticePanel({ practice, onChange }: { practice: PracticeOptions; onChange: (p: PracticeOptions) => void }) {
  const fmt = (ms: number) => {
    const s = Math.max(0, Math.round(ms / 100) / 10);
    return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  };
  return (
    <div className="options-grid" data-testid="practice-options">
      <span className="label">구간</span>
      <span className="value" data-testid="practice-range">
        {fmt(practice.startMs)} – {fmt(practice.endMs)} <span className="hint">(미니맵을 드래그해 고르세요)</span>
      </span>
      <span className="label">속도</span>
      <div className="row">
        <input
          type="range"
          min={0.5}
          max={1.5}
          step={0.05}
          value={practice.rate}
          data-testid="practice-rate"
          onChange={(e) => onChange({ ...practice, rate: Number(e.target.value) })}
        />
        <span className="value">{practice.rate.toFixed(2)}배</span>
        <span className="hint">음정은 그대로 유지됩니다</span>
      </div>
      <span className="label">반복</span>
      <label className="row check">
        <input type="checkbox" checked={practice.loop} onChange={(e) => onChange({ ...practice, loop: e.target.checked })} />
        구간 반복 (Esc → 나가기로 끝내기)
      </label>
    </div>
  );
}
