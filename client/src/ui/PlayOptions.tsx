import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ServerChart } from '../api/client';
import { cameraConfig, gaugeRules, gaugeTypeIds, judgementConfig, keyModes, type JudgementModeId } from '../engine/config';
import type { FeverMode } from '../engine/fever';
import { placementIds, placementLabels } from '../engine/placement';
import { rulesetConfigs, rulesetIds } from '../engine/ruleset';
import type { KeyModeId } from '../engine/types';
import {
  bindingLabel,
  clampHiSpeed,
  DEFAULT_GENERATION,
  GEN_STYLES,
  HI_SPEED_MAX,
  HI_SPEED_MIN,
  KEY_BEAM_MAX,
  MAX_COVER,
  MAX_LIFT,
  playKeysOf,
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
import { coverText, pointText, speedText } from './format';
import { Choice, NumberOption, OptionalNumberOption, pct, skinChoices, Toggle, type RowProps } from './optionRows';
import { pacemakerChoices } from './playRules';
import { focusFirstStop } from './selectNav';

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

export const FEVER_LABELS: Record<FeverMode, string> = { AUTO: '자동', MANUAL: '수동', OFF: '끔' };
/** A FEVER mode's name; the manual one with the key that fires it. */
export function feverLabel(mode: FeverMode, settings: Pick<Settings, 'playKeys'>): string {
  return mode === 'MANUAL' ? `수동 (${bindingLabel(playKeysOf(settings).fever)})` : FEVER_LABELS[mode];
}
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

/** The rows of a panel: the focused one's help goes to the panel's foot; Enter is the song select's (it plays). */
interface PanelRows {
  onHelp: (help: string) => void;
}

/** A rule of the next play that both the settings and the song select's play options set. */
export type PlayRule = 'placement' | 'gauge' | 'fever' | 'pacemaker' | 'judgement' | 'ruleset';

/**
 * A rule of the next play as an option row, written once for both screens that set it: its name,
 * its choices and its help. The help is a line the play options' foot can show; `detailed` (the
 * settings, with room beside the rows) adds what more there is to say.
 */
export function RuleRow({ rule, settings, onSettingsChange, detailed = false, ...row }: SettingsProps & Omit<RowProps, 'label' | 'help'> & { rule: PlayRule; detailed?: boolean }) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onSettingsChange({ ...settings, [key]: value });
  const help = (line: string, more: string) => (detailed ? `${line} ${more}` : line);
  switch (rule) {
    case 'placement':
      return (
        <Choice
          {...row}
          label="배치"
          value={settings.placement}
          options={placementIds.map((id) => [id, placementLabels[id]])}
          onChange={(id) => set('placement', id)}
          help="노트를 레인에 놓는 방식: 미러는 좌우를 뒤집고, 랜덤 계열은 레인을 섞습니다."
        />
      );
    case 'gauge':
      return (
        <Choice
          {...row}
          label="게이지"
          value={settings.gaugeType}
          options={gaugeTypeIds.map((id) => [id, gaugeRules[id].label])}
          onChange={(id) => set('gaugeType', id)}
          help="ASSIST EASY는 60%, EASY·NORMAL은 80%를 넘겨 끝나면 클리어. HARD·EX-HARD·HAZARD는 0%가 되는 순간 실패합니다."
        />
      );
    case 'fever':
      return (
        <Choice
          {...row}
          label="FEVER"
          value={settings.fever}
          options={(Object.keys(FEVER_LABELS) as FeverMode[]).map((m) => [m, feverLabel(m, settings)])}
          onChange={(m) => set('fever', m)}
          help={help(
            `높은 판정으로 FEVER 게이지를 채우면 점수 배율이 붙습니다. 수동이면 게이지가 찼을 때 FEVER 키(${bindingLabel(playKeysOf(settings).fever)})로 켭니다.`,
            '배율은 기본 점수와 따로 붙고, FEVER 키는 키 설정에서 바꿉니다.',
          )}
        />
      );
    case 'pacemaker':
      return (
        <Choice
          {...row}
          label="페이스메이커"
          value={settings.pacemaker}
          options={pacemakerChoices(settings.ruleset, settings.pacemaker).map((p): [Pacemaker, string] => [p, PACEMAKER_LABELS[p]])}
          onChange={(p) => set('pacemaker', p)}
          help={help(
            '플레이 중 점수판에 화면의 점수와 같은 단위로 목표와의 차이를 보여 줍니다.',
            'EX-SCORE의 목표는 A·AA·AAA·MAX입니다. 내 최고 기록은 그 판의 리플레이를 노트마다 따라가고, 리플레이가 없으면 정밀 %에서만 고르게 비교하며 다른 점수 규칙에서는 —로 둡니다.',
          )}
        />
      );
    case 'judgement':
      return (
        <Choice
          {...row}
          label="판정"
          value={settings.judgementMode}
          options={(Object.keys(judgementConfig.modes) as JudgementModeId[]).map((m) => [m, judgementConfig.modes[m].label])}
          onChange={(m) => set('judgementMode', m)}
          help="HARD JUDGEMENT는 판정 범위가 절반, MAX JUDGEMENT는 4분의 1입니다. 기록에도 판정이 함께 남습니다."
        />
      );
    case 'ruleset':
      return (
        <Choice
          {...row}
          label="점수 규칙"
          value={settings.ruleset}
          options={rulesetIds.map((id) => [id, rulesetConfigs[id].label])}
          onChange={(id) => set('ruleset', id)}
          help={help(
            '판정을 묶고 점수를 세는 방식입니다. EX-SCORE에서는 BAD에도 콤보가 끊깁니다.',
            '정밀 %는 DJMAX RESPECT V, 등급형은 EZ2ON REBOOT : R, EX-SCORE는 BMS(beatoraja · LR2)식입니다.',
          )}
        />
      );
  }
}

/** The play options' rules, in the order they are changed most. */
const RULE_ORDER: PlayRule[] = ['placement', 'gauge', 'fever', 'pacemaker', 'judgement', 'ruleset'];

/** The rules of the next play as the settings' rows (applied when the play starts). */
export function PlayRulesPanel({ settings, onSettingsChange, onHelp }: SettingsProps & PanelRows) {
  return (
    <div className="panel-rows" data-testid="play-rules">
      {RULE_ORDER.map((rule) => (
        <RuleRow key={rule} rule={rule} testId={`rule-${rule}`} settings={settings} onSettingsChange={onSettingsChange} onHelp={onHelp} passEnter />
      ))}
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

/** Practice: the segment (picked on the minimap), the playback speed and the loop. */
export function PracticePanel({ practice, onChange, onHelp }: { practice: PracticeOptions; onChange: (p: PracticeOptions) => void } & PanelRows) {
  const row = { onHelp, passEnter: true };
  return (
    <div className="panel-rows practice-rows" data-testid="practice-options">
      <div className="opt opt-static">
        <span className="opt-name">구간</span>
        <span className="opt-value">
          <b data-testid="practice-range">
            {pointText(practice.startMs)} – {pointText(practice.endMs)}
          </b>
        </span>
      </div>
      <NumberOption
        {...row}
        label="재생 속도"
        testId="practice-rate"
        value={practice.rate}
        min={0.5}
        max={1.5}
        step={0.05}
        bigStep={0.25}
        format={(v) => `×${v.toFixed(2)}`}
        onChange={(rate) => onChange({ ...practice, rate })}
        help="음정은 그대로 두고 빠르기만 바꿉니다."
      />
      <Toggle
        {...row}
        label="구간 반복"
        testId="practice-loop"
        value={practice.loop}
        onChange={(loop) => onChange({ ...practice, loop })}
        help="구간이 끝나면 처음부터 다시 칩니다. 반복마다 RATE와 FAST·SLOW가 잠깐 나오고, Esc → 나가기로 끝내면 마지막 반복의 결과를 봅니다."
      />
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
 * the speed, the covers and how the gear looks (on a key mode with side lanes, how its side notes
 * are drawn), beside the moving gear. The settings have the rest.
 */
export function GearOptions({ settings, onSettingsChange, keyMode, onHelp }: SettingsProps & PanelRows & { keyMode: KeyModeId }) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onSettingsChange({ ...settings, [key]: value });
  const row = { onHelp, passEnter: true };
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
      <div className="panel-rows">
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

const TAB_NAMES: Record<PlayOptionsTab, string> = { rules: '플레이 규칙', gear: '속도·기어', generation: '생성 옵션' };
export const PLAY_OPTIONS_TABS = Object.keys(TAB_NAMES) as PlayOptionsTab[];
/** The panel's foot while no row has the focus. */
const TAB_HELP: Record<PlayOptionsTab, string> = {
  rules: '다음 플레이에 적용됩니다. 설정의 플레이 탭과 같은 값입니다.',
  gear: '움직이는 기어에 바로 보입니다.',
  generation: '옵션이 바뀌면 채보를 새로 만듭니다.',
};

/**
 * The Space panel of the song select: how the next play runs (its rules, autoplay, practice and
 * the target level), its speed and gear, and how its chart is made. It opens on its tab's first
 * row (as every tab it goes to): ↑↓ go through the rows, ←→ change them, Q / E (LB / RB) the tab.
 * The tabs are the line above the first row: ←→ there change the tab and the focus stays on them.
 */
export function PlayOptionsPanel(props: SettingsProps & {
  keyMode: KeyModeId;
  tab: PlayOptionsTab;
  onTab: (tab: PlayOptionsTab) => void;
  autoPlay: boolean;
  onAutoPlay: (on: boolean) => void;
  /** The chart a practice runs on (none yet: turning practice on makes it). */
  chart: ServerChart | null;
  practice: PracticeOptions | null;
  onPracticeToggle: (on: boolean) => void;
  onPracticeChange: (p: PracticeOptions) => void;
  /** The level the chart is made for (null: 자동; undefined: an edited or imported chart, made already). */
  targetLevel?: number | null;
  onTargetLevel: (level: number | null) => void;
  maxLevel: number;
  /** Where a target level starts: the middle of the selected difficulty's levels. */
  defaultLevel: number;
  levelLabel: (level: number) => string;
  /** The selected song, named in the header while the panel covers it. */
  songTitle: string | null;
  onClose: () => void;
}) {
  const { settings, onSettingsChange, chart, practice } = props;
  const body = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const [help, setHelp] = useState('');
  useEffect(() => {
    setHelp('');
    body.current?.scrollTo(0, 0);
    // a tab changed on the tabs (by key) keeps the focus there, on the new one
    if (tabs.current && document.activeElement instanceof Node && tabs.current.contains(document.activeElement)) tabs.current.querySelector<HTMLElement>('.active')?.focus();
    else focusFirstStop(body.current);
  }, [props.tab]);
  const row = { onHelp: setHelp, passEnter: true };

  let content: ReactNode;
  if (props.tab === 'rules') {
    content = (
      <>
        <PlayRulesPanel settings={settings} onSettingsChange={onSettingsChange} onHelp={setHelp} />
        <div className="panel-rows">
          <Toggle {...row} label="오토 플레이" testId="autoplay-toggle" value={props.autoPlay} onChange={props.onAutoPlay} help="노트를 자동으로 칩니다. 기록은 남지 않습니다." />
          {props.targetLevel !== undefined && (
            <OptionalNumberOption
              {...row}
              label="목표 레벨"
              testId="target-level"
              value={props.targetLevel === null ? null : Math.min(props.targetLevel, props.maxLevel)}
              min={1}
              max={props.maxLevel}
              step={1}
              bigStep={3}
              auto={Math.min(props.defaultLevel, props.maxLevel)}
              format={props.levelLabel}
              onChange={props.onTargetLevel}
              help="이 레벨에 맞춰 이 곡의 이 난이도 채보를 만듭니다. 자동이면 난이도에 맞는 레벨입니다."
            />
          )}
          <Toggle
            {...row}
            label="연습 모드"
            testId="practice-toggle"
            value={practice !== null}
            onChange={props.onPracticeToggle}
            help="구간을 골라 느리게, 반복해서 칩니다. 기록은 남지 않습니다."
          />
        </div>
        {practice && chart && (
          <>
            <PracticePanel practice={practice} onChange={props.onPracticeChange} onHelp={setHelp} />
            <ChartMinimap
              chart={chart}
              palette={settings.palette}
              selection={[practice.startMs, practice.endMs]}
              onSelect={(startMs, endMs) => props.onPracticeChange({ ...practice, startMs, endMs })}
              onHelp={setHelp}
            />
          </>
        )}
      </>
    );
  } else if (props.tab === 'gear') {
    content = <GearOptions settings={settings} onSettingsChange={onSettingsChange} keyMode={props.keyMode} onHelp={setHelp} />;
  } else {
    content = <GenerationPanel settings={settings} onSettingsChange={onSettingsChange} keyMode={props.keyMode} />;
  }

  return (
    <section className="select-panel" data-testid="play-options" aria-label="플레이 옵션">
      <header className="select-panel-head">
        <h2>플레이 옵션</h2>
        <div className="segmented" role="tablist" ref={tabs}>
          {PLAY_OPTIONS_TABS.map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={props.tab === tab}
              className={props.tab === tab ? 'active' : ''}
              data-testid={`toggle-${tab}`}
              // a click opens the tab on its first row, as Q / E do (the focus is not left on the tabs)
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => props.onTab(tab)}
            >
              {tab === 'generation' ? generationSummary(settings.generation) : TAB_NAMES[tab]}
            </button>
          ))}
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
      <div className="select-panel-body" ref={body}>
        {content}
      </div>
      <p className="select-panel-help" data-testid="play-options-help">
        {help || TAB_HELP[props.tab]}
      </p>
    </section>
  );
}
