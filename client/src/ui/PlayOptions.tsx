import type { ServerChart } from '../api/client';
import { cameraConfig, gaugeRules, gaugeTypeIds, keyModes } from '../engine/config';
import type { FeverMode } from '../engine/fever';
import { placementIds, placementLabels } from '../engine/placement';
import { rulesetConfigs, rulesetIds } from '../engine/ruleset';
import type { KeyModeId } from '../engine/types';
import {
  clampHiSpeed,
  DEFAULT_GENERATION,
  GEN_STYLES,
  HI_SPEED_MAX,
  HI_SPEED_MIN,
  KEY_BEAM_MAX,
  MAX_COVER,
  MAX_LIFT,
  RHYTHM_SOURCES,
  withCovers,
  type GenerationPrefs,
  type GenStyle,
  type Pacemaker,
  type RhythmSource,
  type Settings,
} from '../settings/settings';
import type { PracticeOptions } from './App';
import { ChartMinimap } from './ChartMinimap';
import { GearPreview } from './GearPreview';
import { coverText, speedText } from './format';
import { Choice, NumberOption, pct, skinChoices } from './optionRows';

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

export const FEVER_LABELS: Record<FeverMode, string> = { AUTO: '자동', MANUAL: '수동 (Enter)', OFF: '끔' };
/** FEVER on the song select's option chips. */
export const FEVER_SHORT: Record<FeverMode, string> = { AUTO: '자동', MANUAL: '수동', OFF: '끔' };
export const PACEMAKER_LABELS: Record<Pacemaker, string> = {
  OFF: '끔',
  BEST: '내 최고 기록',
  '90': '90%',
  '95': '95%',
  '98': '98%',
  '99': '99%',
  '100': '100%',
  A: 'A',
  AA: 'AA',
  AAA: 'AAA',
  MAX: 'MAX',
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
  if (prefs.instrumentMapping !== null) params.instrumentMapping = prefs.instrumentMapping;
  if (prefs.repeatConsistency !== null) params.repeatConsistency = prefs.repeatConsistency;
  if (prefs.patternEngine !== 'sectioned') params.patternEngine = prefs.patternEngine;
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
      <span className="label">악기별 레인</span>
      <div className="row">
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={g.instrumentMapping ?? 0.6}
          data-testid="instrument-mapping"
          onChange={(e) => set({ instrumentMapping: Number(e.target.value) })}
        />
        <span className="value">{(g.instrumentMapping ?? 0.6) === 0 ? '끔' : `${Math.round((g.instrumentMapping ?? 0.6) * 100)}%`}</span>
        <span className="hint">드럼 소리마다 자기 키를 지킵니다(킥은 낮은 쪽, 하이햇은 높은 쪽). 베이스는 왼쪽으로 모읍니다</span>
      </div>
      <span className="label">패턴 배치</span>
      <div className="row">
        <div className="segmented" data-testid="pattern-engine">
          <button className={g.patternEngine === 'sectioned' ? 'active' : ''} data-testid="pattern-engine-sectioned" onClick={() => set({ patternEngine: 'sectioned', engineSet: true })}>
            구간·루프
          </button>
          <button className={g.patternEngine === 'designer' ? 'active' : ''} data-testid="pattern-engine-designer" onClick={() => set({ patternEngine: 'designer', engineSet: true })}>
            악구·패턴
          </button>
          <button className={g.patternEngine === 'classic' ? 'active' : ''} data-testid="pattern-engine-classic" onClick={() => set({ patternEngine: 'classic', engineSet: true })}>
            이전 방식
          </button>
        </div>
        <span className="hint">
          "구간·루프"는 곡의 구간과 1·2·4마디 루프를 먼저 찾아, 같은 음악에는 같은 패턴을 놓습니다. "악구·패턴"(0.4)과 "이전 방식"은 비교용입니다
        </span>
      </div>
      <span className="label">반복 구간</span>
      <label className="row check">
        <input type="checkbox" checked={(g.repeatConsistency ?? 1) > 0} onChange={(e) => set({ repeatConsistency: e.target.checked ? 1 : 0 })} />
        같은 후렴·절이 다시 나오면 같은 패턴을 씁니다
      </label>
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

export type PlayOptionsTab = 'rules' | 'gear' | 'generation';

/** "생성 옵션 · 롱노트 · 이전 배치": the generation options that differ from the defaults. */
export function generationSummary(g: GenerationPrefs): string {
  const style = g.style !== 'balanced' ? ` · ${STYLE_LABELS[g.style]}` : '';
  const engine = g.patternEngine === 'classic' ? ' · 이전 배치' : g.patternEngine === 'designer' ? ' · 악구 배치' : '';
  return `생성 옵션${style}${engine}`;
}

/**
 * What is changed most just before a play, as the settings' rows (←→ change, ↑↓ go through them):
 * the speed, the covers and how the gear looks, beside the moving gear. The settings have the rest.
 */
export function GearOptions({ settings, onSettingsChange, keyMode }: SettingsProps & { keyMode: KeyModeId }) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onSettingsChange({ ...settings, [key]: value });
  const row = { onHelp: () => undefined };
  const cover = (key: 'sudden' | 'hidden' | 'lift', label: string, max: number, help: string) => (
    <NumberOption
      {...row}
      label={label}
      testId={`quick-${key}`}
      value={settings[key]}
      min={0}
      max={max}
      step={0.01}
      bigStep={0.05}
      format={coverText}
      onChange={(v) => onSettingsChange(withCovers(settings, { [key]: v }))}
      help={help}
    />
  );
  return (
    <div className="gear-options" data-testid="gear-options">
      <div className="gear-rows">
        <NumberOption
          {...row}
          label="SPEED"
          testId="quick-speed"
          value={settings.hiSpeed}
          min={HI_SPEED_MIN}
          max={HI_SPEED_MAX}
          step={0.1}
          bigStep={0.5}
          format={speedText}
          onChange={(v) => set('hiSpeed', clampHiSpeed(v))}
          help="노트가 내려오는 빠르기"
        />
        {cover('sudden', 'SUDDEN+', MAX_COVER, '트랙 위쪽을 가리는 커버')}
        {cover('hidden', 'HIDDEN+', MAX_COVER, '판정선 바로 위를 가리는 커버')}
        {cover('lift', 'LIFT', MAX_LIFT, '판정선을 올리는 만큼')}
        <Choice {...row} label="트랙 스킨" testId="quick-skin" value={settings.skin} options={skinChoices(settings)} onChange={(id) => set('skin', id)} help="노트와 기어의 모양" />
        <Choice
          {...row}
          label="카메라"
          testId="quick-camera"
          value={settings.cameraPreset}
          options={Object.entries(cameraConfig.presets).map(([id, p]) => [id, p.label])}
          onChange={(id) => set('cameraPreset', id)}
          help="트랙을 내려다보는 높이와 각도"
        />
        <NumberOption
          {...row}
          label="키 빔 길이"
          testId="quick-key-beam"
          value={settings.keyBeamLength}
          min={0}
          max={KEY_BEAM_MAX}
          step={0.1}
          bigStep={0.5}
          format={(v) => (v === 0 ? '끔' : pct(v))}
          onChange={(v) => set('keyBeamLength', v)}
          help="키를 누를 때 올라오는 빛의 길이"
        />
      </div>
      <GearPreview settings={settings} keyMode={keyMode} />
    </div>
  );
}

/**
 * The Space panel of the song select: how the next play runs (autoplay, practice and the play
 * rules), its speed and gear, and how its chart is made.
 */
export function PlayOptionsPanel(props: SettingsProps & {
  keyMode: KeyModeId;
  tab: PlayOptionsTab;
  onTab: (tab: PlayOptionsTab) => void;
  autoPlay: boolean;
  onAutoPlay: (on: boolean) => void;
  /** The chart a practice runs on (none yet: practice waits for it). */
  chart: ServerChart | null;
  practice: PracticeOptions | null;
  onPracticeToggle: (on: boolean) => void;
  onPracticeChange: (p: PracticeOptions) => void;
  targetLevel: number | null;
  onTargetLevel: (level: number | null) => void;
  maxLevel: number;
  levelLabel: (level: number) => string;
  /** The selected song, named in the header while the panel covers it. */
  songTitle: string | null;
  onClose: () => void;
}) {
  const { settings, onSettingsChange, chart, practice } = props;
  return (
    <section className="select-panel" data-testid="play-options" aria-label="플레이 옵션">
      <header className="select-panel-head">
        <h2>플레이 옵션</h2>
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={props.tab === 'rules'} className={props.tab === 'rules' ? 'active' : ''} data-testid="toggle-rules" onClick={() => props.onTab('rules')}>
            플레이 규칙
          </button>
          <button role="tab" aria-selected={props.tab === 'gear'} className={props.tab === 'gear' ? 'active' : ''} data-testid="toggle-gear" onClick={() => props.onTab('gear')}>
            속도·기어
          </button>
          <button
            role="tab"
            aria-selected={props.tab === 'generation'}
            className={props.tab === 'generation' ? 'active' : ''}
            data-testid="toggle-generation"
            onClick={() => props.onTab('generation')}
          >
            {generationSummary(settings.generation)}
          </button>
        </div>
        {props.songTitle && (
          <span className="panel-song" data-testid="song-title" title={props.songTitle}>
            {props.songTitle}
          </span>
        )}
        <button className="quiet small" onClick={props.onClose}>
          닫기 <kbd>Esc</kbd>
        </button>
      </header>
      <div className="select-panel-body">
        {props.tab !== 'gear' && (
          <>
            <div className="play-toggles">
              <label className="check">
                <input type="checkbox" checked={props.autoPlay} onChange={(e) => props.onAutoPlay(e.target.checked)} data-testid="autoplay-toggle" />
                오토 플레이
              </label>
              <label className="check" title={chart ? undefined : '채보를 만든 뒤에 고를 수 있습니다'}>
                <input type="checkbox" checked={practice !== null} disabled={!chart} onChange={(e) => props.onPracticeToggle(e.target.checked)} data-testid="practice-toggle" />
                연습 모드
              </label>
              <label className="check">
                <input type="checkbox" checked={props.targetLevel !== null} onChange={(e) => props.onTargetLevel(e.target.checked ? Math.min(8, props.maxLevel) : null)} />
                목표 레벨 직접 지정
              </label>
              {props.targetLevel !== null && (
                <span className="row target-level">
                  <input
                    type="range"
                    min={1}
                    max={props.maxLevel}
                    value={Math.min(props.targetLevel, props.maxLevel)}
                    aria-label="목표 레벨"
                    onChange={(e) => props.onTargetLevel(Number(e.target.value))}
                  />
                  <span className="value">{props.levelLabel(Math.min(props.targetLevel, props.maxLevel))}</span>
                </span>
              )}
            </div>
            {practice && chart && (
              <>
                <PracticePanel practice={practice} onChange={props.onPracticeChange} />
                <ChartMinimap
                  chart={chart}
                  palette={settings.palette}
                  selection={[practice.startMs, practice.endMs]}
                  onSelect={(startMs, endMs) => props.onPracticeChange({ ...practice, startMs, endMs })}
                />
              </>
            )}
          </>
        )}
        {props.tab === 'rules' ? (
          <PlayRulesPanel settings={settings} onSettingsChange={onSettingsChange} />
        ) : props.tab === 'gear' ? (
          <GearOptions settings={settings} onSettingsChange={onSettingsChange} keyMode={props.keyMode} />
        ) : (
          <GenerationPanel settings={settings} onSettingsChange={onSettingsChange} keyMode={props.keyMode} />
        )}
      </div>
    </section>
  );
}
