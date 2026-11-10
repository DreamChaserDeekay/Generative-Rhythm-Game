import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import type { ServerChart, Song } from '../api/client';
import { gaugeRules, gaugeTypeIds, judgementConfig, type JudgementModeId } from '../engine/config';
import type { FeverMode } from '../engine/fever';
import { placementIds, placementLabels } from '../engine/placement';
import { rulesetConfigs, rulesetIds } from '../engine/ruleset';
import { TempoMap } from '../engine/tempo';
import { bindingLabel, clampHiSpeed, HI_SPEED_MAX, HI_SPEED_MIN, playKeysOf, type Pacemaker, type Settings } from '../settings/settings';
import type { PracticeOptions } from './App';
import { pointText, speedText } from './format';
import { Choice, NumberOption, Toggle, type RowProps } from './optionRows';
import { pacemakerChoices } from './playRules';
import { rangePoints, stepRange } from './practiceRange';
import { sectionLabel } from './sections';
import { focusFirstStop } from './selectNav';
import { SongArt } from './songArt';

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

/** The rules of a play the song select's play options change, in the order they are changed most (the gauge and the pacemaker are the settings'). */
const QUICK_RULES: PlayRule[] = ['placement', 'fever'];
const SCORE_RULES: PlayRule[] = ['judgement', 'ruleset'];

/**
 * The practice stretch as a row: where it lies in the song (a bar on a line), and its times. ←→
 * move it a bar, Shift+←→ make it a bar longer or shorter; the song info's chart page picks a
 * whole section.
 */
function PracticeRangeRow({ chart, practice, onChange, onHelp }: { chart: ServerChart; practice: PracticeOptions; onChange: (p: PracticeOptions) => void; onHelp: (help: string) => void }) {
  const duration = Math.max(1, chart.meta.durationMs ?? Math.max(...chart.notes.map((n) => n.endT ?? n.t), 1));
  const tempo = useMemo(() => new TempoMap(chart.timing), [chart]);
  const points = useMemo(() => rangePoints(tempo.barLines(duration), duration), [tempo, duration]);
  // the section the stretch starts in, by name
  const section = useMemo(() => {
    const all = chart.sections ?? [];
    for (let i = all.length - 1; i >= 0; i--) {
      if (tempo.beatToMs(all[i].startBeat) <= practice.startMs + 40) return `${sectionLabel(all[i].label)}${all[i].group ? ` ${all[i].group}` : ''}`;
    }
    return null;
  }, [chart, tempo, practice.startMs]);
  const step = (dir: 1 | -1, resize: boolean) => {
    const next = stepRange(points, [practice.startMs, practice.endMs], dir, resize);
    if (next) onChange({ ...practice, startMs: next[0], endMs: next[1] });
  };
  const help = '←→ 구간을 한 마디씩 옮기고, Shift+←→ 한 마디씩 늘이거나 줄입니다. 구간 하나를 통째로 고르려면 곡 정보·도구의 채보에서 고릅니다.';
  const text = `${pointText(practice.startMs)} – ${pointText(practice.endMs)}`;
  const arrow = (dir: 1 | -1) => ({
    onMouseDown: (e: ReactMouseEvent) => e.preventDefault(),
    onClick: (e: ReactMouseEvent<HTMLButtonElement>) => {
      (e.currentTarget.closest('.opt') as HTMLElement | null)?.focus();
      step(dir, e.shiftKey);
    },
  });
  return (
    <div
      className="opt opt-range"
      tabIndex={0}
      role="slider"
      aria-label="연습 구간"
      aria-valuetext={text}
      data-testid="practice-range-row"
      onKeyDown={(e: ReactKeyboardEvent<HTMLDivElement>) => {
        if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;
        e.preventDefault();
        step(e.code === 'ArrowRight' ? 1 : -1, e.shiftKey);
      }}
      onFocus={() => onHelp(help)}
    >
      <span className="opt-name">
        구간{section && <small className="range-section">{section}</small>}
      </span>
      <span className="opt-value">
        <span className="range-map" aria-hidden="true">
          <i style={{ left: `${(practice.startMs / duration) * 100}%`, width: `${Math.max(1, ((practice.endMs - practice.startMs) / duration) * 100)}%` }} />
        </span>
        <button type="button" className="opt-step" tabIndex={-1} aria-hidden="true" {...arrow(-1)}>
          ‹
        </button>
        <b data-testid="practice-range">{text}</b>
        <button type="button" className="opt-step" tabIndex={-1} aria-hidden="true" {...arrow(1)}>
          ›
        </button>
      </span>
    </div>
  );
}

/** The chart the options are for, as the panel's song line names it: its difficulty (or what kind of saved chart it is), in its colour, and its level. */
export interface OptionsEntry {
  name: string;
  color: string;
  level: number | null;
}

/**
 * The Space panel of the song select: how the next play runs, in the song's own place (the song
 * shrinks to a line over it, the library stays beside it). The note speed, the placement and
 * FEVER, then the judgement and the score rule, then practice: a stretch of the song, slowed and
 * looped. ↑↓ go through the rows, ←→ change them, and Enter plays. Everything else about a play is
 * the settings'.
 */
export function PlayOptionsPanel(props: SettingsProps & {
  /** The song and the chart chosen, named over the rows (none: an empty library). */
  song: Song | null;
  entry: OptionsEntry | null;
  /** The chart a practice runs on (none yet: turning practice on makes it). */
  chart: ServerChart | null;
  practice: PracticeOptions | null;
  onPracticeToggle: (on: boolean) => void;
  onPracticeChange: (p: PracticeOptions) => void;
}) {
  const { settings, onSettingsChange, song, entry, chart, practice } = props;
  const body = useRef<HTMLDivElement>(null);
  const [help, setHelp] = useState('');
  useEffect(() => focusFirstStop(body.current), []);
  const row = { onHelp: setHelp, passEnter: true };
  const rule = (r: PlayRule) => <RuleRow key={r} rule={r} testId={`rule-${r}`} settings={settings} onSettingsChange={onSettingsChange} {...row} />;
  return (
    <section className="select-panel play-options" data-testid="play-options" aria-label="플레이 옵션">
      {song && (
        <div className="panel-song">
          <SongArt song={song} size={64} />
          <div className="panel-song-text">
            <b data-testid="song-title" title={song.title}>
              {song.title}
            </b>
            <span>{song.artist || '알 수 없는 아티스트'}</span>
          </div>
          {entry && (
            <span className="tier-chip" style={{ ['--diff' as string]: entry.color } as CSSProperties}>
              {entry.name}
              <b className="num">{entry.level ?? '–'}</b>
            </span>
          )}
        </div>
      )}
      <header className="select-panel-head">
        <h2>플레이 옵션</h2>
        <span>다음 플레이에 적용됩니다</span>
      </header>
      <div className="select-panel-body" ref={body}>
        <div className="panel-rows" data-testid="play-rules">
          <NumberOption
            {...row}
            label="노트 속도"
            testId="quick-speed"
            value={settings.hiSpeed}
            min={HI_SPEED_MIN}
            max={HI_SPEED_MAX}
            step={0.1}
            bigStep={0.5}
            format={speedText}
            onChange={(v) => onSettingsChange({ ...settings, hiSpeed: clampHiSpeed(v) })}
            help="노트가 내려오는 빠르기입니다. Shift+←→는 0.5씩 바꿉니다."
          />
          {QUICK_RULES.map(rule)}
          <hr className="opt-rule" />
          {SCORE_RULES.map(rule)}
          <hr className="opt-rule" />
        </div>
        <div className="panel-rows" data-testid="practice-options">
          <Toggle
            {...row}
            label="연습 모드"
            testId="practice-toggle"
            value={practice !== null}
            onChange={props.onPracticeToggle}
            help="구간을 골라 느리게, 반복해서 칩니다. 기록은 남지 않습니다."
          />
          {practice && chart && (
            <>
              <PracticeRangeRow chart={chart} practice={practice} onChange={props.onPracticeChange} onHelp={setHelp} />
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
                onChange={(rate) => props.onPracticeChange({ ...practice, rate })}
                help="음정은 그대로 두고 빠르기만 바꿉니다."
              />
              <Toggle
                {...row}
                label="구간 반복"
                testId="practice-loop"
                value={practice.loop}
                onChange={(loop) => props.onPracticeChange({ ...practice, loop })}
                help="구간이 끝나면 처음부터 다시 칩니다. 반복마다 RATE와 FAST·SLOW가 잠깐 나오고, Esc → 나가기로 끝내면 마지막 반복의 결과를 봅니다."
              />
            </>
          )}
        </div>
      </div>
      <p className="select-panel-help" data-testid="play-options-help">
        {help || '설정과 같은 값입니다. 게이지와 페이스메이커, 그 밖의 것은 설정(F10)에 있습니다.'}
      </p>
    </section>
  );
}
