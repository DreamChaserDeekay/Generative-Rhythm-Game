import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { api, type BackendStatus } from '../api/client';
import {
  cameraConfig,
  difficultySystemIds,
  difficultySystems,
  enabledKeyModes,
  gaugeRules,
  gaugeTypeIds,
  judgementConfig,
  keyModes,
  type JudgementModeId,
} from '../engine/config';
import type { FeverMode } from '../engine/fever';
import { placementIds, placementLabels } from '../engine/placement';
import { rulesetConfigs, rulesetIds } from '../engine/ruleset';
import type { KeyModeId } from '../engine/types';
import { GamepadPoller, padCodeLabel, suspendMenuBridges } from '../input/gamepad';
import type { Palette } from '../render/palette';
import { BUILTIN_SKINS, sanitizeSkin, skinById } from '../render/skins';
import {
  bindingsFor,
  clampHiSpeed,
  DEFAULT_SETTINGS,
  HI_SPEED_MAX,
  HI_SPEED_MIN,
  KEY_BEAM_MAX,
  keyLabel,
  MAX_COVER,
  MAX_LIFT,
  padBindingsFor,
  withCovers,
  withDifficultySystem,
  type JudgePosition,
  type Pacemaker,
  type ScrollMode,
  type Settings,
} from '../settings/settings';
import { GearPreview } from './GearPreview';
import { KeyGhostTest } from './KeyGhostTest';
import { FEVER_LABELS, PACEMAKER_LABELS } from './PlayOptions';
import { HintBar, TopBar } from './shell';

interface Props {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onBack: () => void;
  onCalibrate: () => void;
  initialTab?: SettingsTab;
}

export type SettingsTab = 'play' | 'judge' | 'speed' | 'gear' | 'fx' | 'sound' | 'keys' | 'pad' | 'advanced';

/** The tabs in order: name and the line under it. */
const TABS: [SettingsTab, string, string][] = [
  ['play', '플레이', '다음 플레이부터 적용됩니다'],
  ['judge', '판정·싱크', '판정 기준과 입력·화면 지연 보정'],
  ['speed', '속도·커버', '움직이는 미리보기에 바로 보입니다'],
  ['gear', '기어', '움직이는 미리보기에 바로 보입니다'],
  ['fx', '연출·배경', '카메라 연출과 플레이 배경'],
  ['sound', '소리', '음악과 효과음'],
  ['keys', '키 설정', '키를 고른 뒤 쓸 키를 누르세요'],
  ['pad', '게임패드', '패드와 전용 컨트롤러를 레인에 지정합니다'],
  ['advanced', '고급', '사용자 스킨과 분석 백엔드'],
];

const BACKEND_LABELS: Record<string, string> = { stems: '스템 분리', beats: '비트·다운비트', pitch: '음높이·음 길이', structure: '곡 구조' };
const pct = (v: number) => `${Math.round(v * 100)}%`;
const signedMs = (v: number) => `${v > 0 ? '+' : ''}${v}ms`;

/** Elements whose keys are their own: text fields keep the arrows, Q, E and the page keys. */
function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type !== 'checkbox') || target instanceof HTMLSelectElement;
}

/** The focusable controls of the rows, in order (the ‹ › of a row are its, not stops of their own). */
function rowStops(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button, a[href], textarea, [tabindex]')].filter(
    (el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0,
  );
}

/**
 * The settings as an arcade option screen: tabs on the left (Q / E, LB / RB on a pad), a row per
 * setting with its value between ‹ › (↑↓ choose a row, ←→ change it), and on the right a live gear
 * or the chosen row's help.
 */
export function SettingsScreen({ settings, onSettingsChange, onBack, onCalibrate, initialTab = 'speed' }: Props) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onSettingsChange({ ...settings, [key]: value });
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [help, setHelp] = useState('');
  const [rebinding, setRebinding] = useState<{ mode: KeyModeId; lane: number } | null>(null);
  const [ghostMode, setGhostMode] = useState<KeyModeId | null>(null);
  const rows = useRef<HTMLDivElement>(null);

  // a tab opens on its first row, with the focus there (a click on a tab leaves the focus on it)
  const focusFirstRow = () => requestAnimationFrame(() => (rows.current && rowStops(rows.current)[0])?.focus({ preventScroll: true }));
  useEffect(() => {
    setHelp('');
    rows.current?.scrollTo(0, 0);
  }, [tab]);
  useEffect(() => {
    focusFirstRow();
  }, []);
  const stepTab = (dir: 1 | -1) => {
    const at = TABS.findIndex(([id]) => id === tab);
    setTab(TABS[(at + dir + TABS.length) % TABS.length][0]);
    focusFirstRow();
  };

  // Esc leaves (it cancels a key being bound, or closes the rollover test, first); Q / E and
  // PageUp / PageDown (LB / RB) change the tab; ↑↓ go through the rows.
  useEffect(() => {
    if (ghostMode) return;
    if (rebinding) {
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
      // a pad press is no keyboard key to bind
      const resumePad = suspendMenuBridges();
      window.addEventListener('keydown', onKey, { capture: true });
      return () => {
        window.removeEventListener('keydown', onKey, { capture: true });
        resumePad();
      };
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        onBack();
        return;
      }
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyQ' || e.code === 'KeyE' || e.code === 'PageUp' || e.code === 'PageDown') {
        e.preventDefault();
        if (!e.repeat) stepTab(e.code === 'KeyQ' || e.code === 'PageUp' ? -1 : 1);
        return;
      }
      if (e.code !== 'ArrowUp' && e.code !== 'ArrowDown') return;
      const root = rows.current;
      const at = document.activeElement;
      if (!root || !(at instanceof HTMLElement)) return;
      const stops = rowStops(root);
      if (root.contains(at)) {
        // a pad's d-pad goes the same way (the event is taken here, so the menu bridge does not move it again)
        e.preventDefault();
        const next = stops[stops.indexOf(at) + (e.code === 'ArrowDown' ? 1 : -1)];
        next?.focus();
        next?.scrollIntoView({ block: 'nearest' });
      } else if (at.closest('.settings-nav') && e.code === 'ArrowDown') {
        e.preventDefault();
        stops[0]?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const system = difficultySystems[settings.difficultySystem];
  const row = { onHelp: setHelp };
  const [, heading] = TABS.find(([id]) => id === tab) ?? TABS[0];
  const subtitle = TABS.find(([id]) => id === tab)?.[2];
  const skinChoices: [string, string][] = [
    ...BUILTIN_SKINS.map((k): [string, string] => [k.id, k.label]),
    ...(settings.customSkin !== null ? [['custom', (settings.customSkin as { label?: string }).label ?? '사용자 스킨'] as [string, string]] : []),
  ];

  let content: ReactNode;
  switch (tab) {
    case 'play':
      content = (
        <>
          <Choice
            {...row}
            label="난이도 기준"
            testId="opt-system"
            value={settings.difficultySystem}
            options={difficultySystemIds.map((id) => [id, difficultySystems[id].label])}
            onChange={(id) => onSettingsChange(withDifficultySystem(settings, id))}
            help={
              settings.difficultySystem === 'GRG'
                ? '이 게임의 5단계 (Lv.1–15)로 채보를 만듭니다.'
                : `${system.title}의 난이도별 레벨·밀도·패턴을 따릅니다 (Lv.1–${system.maxLevel}). 기록도 기준마다 따로 남습니다.`
            }
          />
          <Choice
            {...row}
            label="판정 표기"
            testId="opt-ruleset"
            value={settings.ruleset}
            options={rulesetIds.map((id) => [id, rulesetConfigs[id].label])}
            onChange={(id) => set('ruleset', id)}
            help={`${rulesetConfigs[settings.ruleset].reference}식으로 판정을 묶고 점수를 셉니다.`}
          />
          <Choice
            {...row}
            label="게이지"
            testId="opt-gauge"
            value={settings.gaugeType}
            options={gaugeTypeIds.map((id) => [id, gaugeRules[id].label])}
            onChange={(id) => set('gaugeType', id)}
            help="ASSIST EASY는 60%, EASY·NORMAL은 80%를 넘겨 끝나면 클리어. HARD·EX-HARD·HAZARD는 0%가 되는 순간 실패합니다."
          />
          <Choice
            {...row}
            label="FEVER"
            testId="opt-fever"
            value={settings.fever}
            options={(Object.keys(FEVER_LABELS) as FeverMode[]).map((m) => [m, FEVER_LABELS[m]])}
            onChange={(m) => set('fever', m)}
            help="높은 판정으로 FEVER 게이지를 채우면 점수 배율이 붙습니다 (기본 점수와 따로). 수동이면 찼을 때 Enter로 켭니다."
          />
          <Choice
            {...row}
            label="배치"
            testId="opt-placement"
            value={settings.placement}
            options={placementIds.map((id) => [id, placementLabels[id]])}
            onChange={(id) => set('placement', id)}
            help="노트를 레인에 놓는 방식: 미러는 좌우를 뒤집고, 랜덤 계열은 레인을 섞습니다."
          />
          <Choice
            {...row}
            label="페이스메이커"
            testId="opt-pacemaker"
            value={settings.pacemaker}
            options={(Object.keys(PACEMAKER_LABELS) as Pacemaker[]).map((p) => [p, PACEMAKER_LABELS[p]])}
            onChange={(p) => set('pacemaker', p)}
            help="플레이 중 점수판에 목표 점수와의 차이를 보여 줍니다."
          />
        </>
      );
      break;
    case 'judge':
      content = (
        <>
          <Choice
            {...row}
            label="판정"
            testId="opt-judgement"
            value={settings.judgementMode}
            options={(Object.keys(judgementConfig.modes) as JudgementModeId[]).map((m) => [m, judgementConfig.modes[m].label])}
            onChange={(m) => set('judgementMode', m)}
            help="HARD JUDGEMENT는 판정 범위가 절반, MAX JUDGEMENT는 4분의 1입니다."
          />
          <NumberOption
            {...row}
            label="판정 오프셋"
            testId="opt-input-offset"
            value={settings.inputOffsetMs}
            min={-200}
            max={200}
            step={1}
            bigStep={5}
            format={signedMs}
            onChange={(v) => set('inputOffsetMs', v)}
            help="+면 늦게 치는 만큼 판정을 늦춥니다. ←→ 1ms, Shift ±5ms. 결과 화면의 제안이나 캘리브레이션으로 맞출 수 있습니다."
          />
          <NumberOption
            {...row}
            label="표시 오프셋"
            testId="opt-visual-offset"
            value={settings.visualOffsetMs}
            min={-200}
            max={200}
            step={1}
            bigStep={5}
            format={signedMs}
            onChange={(v) => set('visualOffsetMs', v)}
            help="+면 노트를 그만큼 일찍 그립니다 (화면 지연 보정). ←→ 1ms, Shift ±5ms."
          />
          <ActionOption
            {...row}
            label="오프셋 캘리브레이션"
            testId="open-calibration-settings"
            action="열기"
            onPress={onCalibrate}
            help="메트로놈에 맞춰 눌러 평균 오차를 재고, 그 값을 판정 오프셋으로 씁니다."
          />
          <Toggle
            {...row}
            label="판정 ms 오차 표시"
            testId="opt-error-ms"
            value={settings.showErrorMs}
            onChange={(v) => set('showErrorMs', v)}
            help="판정 아래에 몇 ms 빠르거나 늦었는지 보여 줍니다."
          />
        </>
      );
      break;
    case 'speed':
      content = (
        <>
          <NumberOption
            {...row}
            label="배속 (SPEED)"
            testId="opt-hi-speed"
            value={settings.hiSpeed}
            min={HI_SPEED_MIN}
            max={HI_SPEED_MAX}
            step={0.1}
            bigStep={0.5}
            format={(v) => (Number.isInteger(Math.round(v * 100) / 10) ? v.toFixed(1) : v.toFixed(2))}
            onChange={(v) => set('hiSpeed', clampHiSpeed(v))}
            help="노트가 내려오는 빠르기입니다. 미리보기의 '보이는 시간'(녹색 숫자)은 노트가 나타나서 판정선에 닿기까지의 시간으로, 이 값이 같으면 배속과 커버를 바꿔도 같은 속도로 느껴집니다. 플레이 중 ↑↓ (Shift ±0.5)."
          />
          <NumberOption
            {...row}
            label="SUDDEN+ (위 커버)"
            testId="opt-sudden"
            value={settings.sudden}
            min={0}
            max={MAX_COVER}
            step={0.01}
            bigStep={0.05}
            format={pct}
            onChange={(v) => onSettingsChange(withCovers(settings, { sudden: v }))}
            help="트랙 위쪽을 가려 노트가 나타나는 곳을 내립니다. 플레이 중 PageUp/PageDown."
          />
          <NumberOption
            {...row}
            label="HIDDEN+ (아래 커버)"
            testId="opt-hidden"
            value={settings.hidden}
            min={0}
            max={MAX_COVER}
            step={0.01}
            bigStep={0.05}
            format={pct}
            onChange={(v) => onSettingsChange(withCovers(settings, { hidden: v }))}
            help="판정선 바로 위를 가립니다. 보이는 시간은 바뀌지 않습니다."
          />
          <NumberOption
            {...row}
            label="LIFT (판정선 올리기)"
            testId="opt-lift"
            value={settings.lift}
            min={0}
            max={MAX_LIFT}
            step={0.01}
            bigStep={0.05}
            format={pct}
            onChange={(v) => onSettingsChange(withCovers(settings, { lift: v }))}
            help="판정선을 트랙 위로 올립니다. 플레이 중 Shift+PageUp/PageDown."
          />
          <Toggle
            {...row}
            label="커버 사용"
            testId="opt-covers-on"
            value={settings.coversOn}
            onChange={(v) => onSettingsChange(withCovers(settings, { coversOn: v }))}
            help="SUDDEN+와 HIDDEN+를 씁니다. 플레이 중 Home으로 켜고 끕니다."
          />
          <Toggle
            {...row}
            label="보이는 시간 유지"
            testId="opt-keep-green"
            value={settings.keepVisibleTime}
            onChange={(v) => set('keepVisibleTime', v)}
            help="커버·LIFT를 움직여도 노트가 보이는 시간(녹색 숫자)을 그대로 둡니다 (배속이 함께 바뀝니다)."
          />
          <Choice
            {...row}
            label="스크롤"
            testId="opt-scroll"
            value={settings.scrollMode}
            options={
              [
                ['time', '시간 고정'],
                ['beat', 'BPM 연동'],
              ] as [ScrollMode, string][]
            }
            onChange={(m) => set('scrollMode', m)}
            help="BPM 연동은 빠른 구간에서 노트도 빨라집니다 (변속 곡)."
          />
        </>
      );
      break;
    case 'gear':
      content = (
        <>
          <Choice
            {...row}
            label="트랙 스킨"
            testId="opt-skin"
            value={settings.skin}
            options={skinChoices}
            onChange={(id) => set('skin', id)}
            help="노트·롱노트·키캡·키 빔·타격 효과·레일·판정선·트랙의 모양입니다. 카메라는 바뀌지 않습니다. 사용자 스킨은 고급 탭에서 JSON으로 만듭니다."
          />
          <Choice
            {...row}
            label="카메라"
            testId="opt-camera"
            value={settings.cameraPreset}
            options={Object.entries(cameraConfig.presets).map(([id, p]) => [id, p.label])}
            onChange={(id) => set('cameraPreset', id)}
            help="트랙을 내려다보는 높이와 각도입니다."
          />
          <NumberOption
            {...row}
            label="레인 폭"
            testId="opt-lane-width"
            value={settings.laneWidthScale}
            min={0.8}
            max={1.4}
            step={0.05}
            bigStep={0.1}
            format={pct}
            onChange={(v) => set('laneWidthScale', v)}
            help="트랙의 폭입니다."
          />
          <NumberOption
            {...row}
            label="키 빔 길이"
            testId="opt-key-beam"
            value={settings.keyBeamLength}
            min={0}
            max={KEY_BEAM_MAX}
            step={0.1}
            bigStep={0.5}
            format={(v) => (v === 0 ? '끔' : pct(v))}
            onChange={(v) => set('keyBeamLength', v)}
            help="키를 누르는 동안 판정선에서 올라오는 빛의 길이입니다. 100%가 기본이고, 0이면 켜지지 않습니다."
          />
          <Choice
            {...row}
            label="판정 표시 위치"
            testId="opt-judge-position"
            value={settings.judgePosition}
            options={
              [
                ['low', '낮게'],
                ['mid', '보통'],
                ['high', '높게'],
              ] as [JudgePosition, string][]
            }
            onChange={(p) => set('judgePosition', p)}
            help="판정과 콤보가 트랙 위 어느 높이에 놓일지 정합니다."
          />
          <Toggle
            {...row}
            label="마디선"
            testId="bar-lines"
            value={settings.barLines}
            onChange={(v) => set('barLines', v)}
            help="마디마다 트랙을 가로지르는 선을 긋습니다."
          />
          <Choice
            {...row}
            label="색상"
            testId="opt-palette"
            value={settings.palette}
            options={
              [
                ['default', '기본'],
                ['colorblind', '색각 보정'],
              ] as [Palette, string][]
            }
            onChange={(p) => set('palette', p)}
            help="색각 보정은 판정과 레인을 색각 이상이 있어도 구분되는 색으로 칠합니다."
          />
        </>
      );
      break;
    case 'fx':
      content = (
        <>
          <NumberOption
            {...row}
            label="카메라 연출"
            testId="camera-fx"
            value={settings.cameraFx}
            min={0}
            max={1}
            step={0.1}
            bigStep={0.5}
            format={(v) => (v === 0 ? '끔' : pct(v))}
            onChange={(v) => set('cameraFx', v)}
            help="드롭·후렴에서 트랙이 기울고 줌합니다 (SDVX식)."
          />
          <Toggle
            {...row}
            label="번쩍임 줄이기"
            testId="opt-reduced-flash"
            value={settings.reducedFlash}
            onChange={(v) => set('reducedFlash', v)}
            help="타격 효과·FEVER·카메라 연출을 약하게 합니다."
          />
          <NumberOption
            {...row}
            label="배경 밝기"
            testId="opt-bg-brightness"
            value={settings.bgBrightness}
            min={0}
            max={1}
            step={0.05}
            bigStep={0.25}
            format={pct}
            onChange={(v) => set('bgBrightness', v)}
            help="플레이 배경(곡 그림·영상)의 밝기입니다."
          />
          <Toggle
            {...row}
            label="배경 비주얼라이저"
            testId="opt-visualizer"
            value={settings.visualizer}
            onChange={(v) => set('visualizer', v)}
            help="음악에 반응하는 스펙트럼을 배경에 그립니다."
          />
          <Toggle
            {...row}
            label="배경 영상 (BGA)"
            testId="opt-bga"
            value={settings.bga}
            onChange={(v) => set('bga', v)}
            help="곡에 등록한 배경 영상을 재생합니다."
          />
        </>
      );
      break;
    case 'sound':
      content = (
        <>
          <NumberOption
            {...row}
            label="음악"
            testId="opt-music-volume"
            value={settings.musicVolume}
            min={0}
            max={1}
            step={0.05}
            bigStep={0.25}
            format={pct}
            onChange={(v) => set('musicVolume', v)}
            help="곡과 키음의 크기입니다."
          />
          <NumberOption
            {...row}
            label="효과음"
            testId="opt-sfx-volume"
            value={settings.sfxVolume}
            min={0}
            max={1}
            step={0.05}
            bigStep={0.25}
            format={pct}
            onChange={(v) => set('sfxVolume', v)}
            help="타격음의 크기입니다."
          />
          <Toggle {...row} label="타격음" testId="opt-hit-sound" value={settings.hitSound} onChange={(v) => set('hitSound', v)} help="키를 누를 때 짧은 소리를 냅니다." />
          <Toggle
            {...row}
            label="키음"
            testId="keysound-toggle"
            value={settings.keysound}
            onChange={(v) => set('keysound', v)}
            help="생성 채보의 노트마다 그 노트가 따라가는 악기 소리를 붙여, 치면 그 소리가 나고 놓치면 빠집니다 (가져온 BMS·bmson은 항상 원래 키음)."
          />
        </>
      );
      break;
    case 'keys':
      content = (
        <>
          {enabledKeyModes.map((mode) => (
            <div className="opt opt-block" key={mode}>
              <span className="opt-name">{mode}</span>
              <div className="opt-keys">
                <div className="keys">
                  {bindingsFor(settings, mode).map((code, lane) => {
                    const active = rebinding?.mode === mode && rebinding.lane === lane;
                    return (
                      <button
                        key={lane}
                        className={`key-cap lane-${keyModes[mode].lanes[lane].color} ${active ? 'active' : ''}`}
                        onFocus={() => setHelp('누른 뒤 쓸 키를 입력하세요. 이미 쓰는 키를 고르면 서로 바뀝니다. 한글 입력 상태와 무관하게 동작합니다.')}
                        onClick={() => setRebinding({ mode, lane })}
                      >
                        {active ? '…' : keyLabel(code)}
                      </button>
                    );
                  })}
                </div>
                <div className="opt-actions">
                  {mode === '7K+1S' && (
                    <button className="small" onClick={() => onSettingsChange({ ...settings, bindings: { ...settings.bindings, [mode]: keyModes[mode].bindings.BMS } })}>
                      BMS 배치
                    </button>
                  )}
                  <button className="small" onClick={() => onSettingsChange({ ...settings, bindings: { ...settings.bindings, [mode]: keyModes[mode].bindings.default } })}>
                    기본값
                  </button>
                  <button
                    className="small"
                    data-testid={`ghost-${mode}`}
                    onFocus={() => setHelp('키보드가 여러 키를 한꺼번에 인식하는지 봅니다. 레인 키를 모두 누르세요.')}
                    onClick={() => setGhostMode(ghostMode === mode ? null : mode)}
                  >
                    동시 입력 테스트
                  </button>
                </div>
              </div>
            </div>
          ))}
          {ghostMode && <KeyGhostTest mode={ghostMode} bindings={bindingsFor(settings, ghostMode)} onClose={() => setGhostMode(null)} />}
        </>
      );
      break;
    case 'pad':
      content = <GamepadPanel settings={settings} onSettingsChange={onSettingsChange} onHelp={setHelp} />;
      break;
    case 'advanced':
      content = <AdvancedPanel settings={settings} onSettingsChange={onSettingsChange} onHelp={setHelp} />;
      break;
  }

  const sideHelp = help || defaultHelp(tab);
  return (
    <div className="menu-screen settings-screen screen-enter" data-testid="settings-screen">
      <TopBar name="설정">
        <button className="primary" onClick={onBack}>
          완료 <kbd>Esc</kbd>
        </button>
      </TopBar>
      <div className="settings-body">
        <nav className="settings-nav" role="tablist" aria-label="설정 탭">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} data-testid={`settings-tab-${id}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
          <span className="settings-nav-hint">
            <kbd>Q</kbd>
            <kbd>E</kbd> 탭 이동
          </span>
        </nav>
        <section className="settings-rows" ref={rows} role="tabpanel" aria-label={heading}>
          <h2>
            {heading} · {subtitle}
          </h2>
          {content}
        </section>
        <aside className="settings-side">
          {tab === 'speed' || tab === 'gear' ? (
            <>
              <span className="settings-side-head">
                <span>미리보기</span>
                <span>{settings.lastKeyMode}</span>
              </span>
              <GearPreview settings={settings} keyMode={settings.lastKeyMode} />
              <p className="settings-help" data-testid="settings-help">
                {sideHelp}
              </p>
            </>
          ) : (
            <p className="settings-help" data-testid="settings-help">
              {sideHelp}
            </p>
          )}
        </aside>
      </div>
      <HintBar
        hints={[
          { keys: ['↑', '↓'], label: '항목' },
          { keys: ['←', '→'], label: '값' },
          { keys: ['Q', 'E'], label: '탭' },
          { keys: [], label: '패드: 십자키 · A · B · LB/RB' },
        ]}
        end={[{ keys: ['Esc'], label: '완료' }]}
      />
    </div>
  );
}

function defaultHelp(tab: SettingsTab): string {
  switch (tab) {
    case 'keys':
      return '레인의 키를 누른 뒤 쓸 키를 입력하세요. 이미 쓰는 키를 고르면 서로 바뀝니다. 한글 입력 상태와 무관하게 동작합니다.';
    case 'pad':
      return '레인을 누른 뒤 패드 버튼을 누르거나 턴테이블을 돌리면 지정됩니다 (Esc 취소). 키보드 키와 함께 쓸 수 있습니다.';
    default:
      return '항목을 고르면 여기에 설명이 나옵니다.';
  }
}

interface RowProps {
  label: string;
  help: string;
  onHelp: (help: string) => void;
  testId?: string;
}

/**
 * A setting as an arcade option row: its name, and its value between ‹ ›. ←→ (or the arrows)
 * change it, Shift by a bigger step; Enter moves a choice on or flips a switch.
 */
function OptionRow(
  props: RowProps & {
    text: string;
    value: string;
    onStep: (dir: 1 | -1, big: boolean) => void;
    onPress?: () => void;
    /** A switch's state (on / off rows). */
    checked?: boolean;
  },
) {
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
      props.onStep(e.code === 'ArrowLeft' ? -1 : 1, e.shiftKey);
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      if (!e.repeat) props.onPress?.();
    }
  };
  // the arrows change the value and leave the focus on the row
  const arrow = (dir: 1 | -1) => ({
    onMouseDown: (e: ReactMouseEvent) => e.preventDefault(),
    onClick: (e: ReactMouseEvent<HTMLButtonElement>) => {
      (e.currentTarget.closest('.opt') as HTMLElement | null)?.focus();
      props.onStep(dir, e.shiftKey);
    },
  });
  return (
    <div
      className="opt"
      tabIndex={0}
      role={props.checked === undefined ? 'spinbutton' : 'switch'}
      aria-label={props.label}
      aria-valuetext={props.checked === undefined ? props.text : undefined}
      aria-checked={props.checked}
      data-testid={props.testId}
      data-value={props.value}
      onKeyDown={onKeyDown}
      onFocus={() => props.onHelp(props.help)}
    >
      <span className="opt-name">{props.label}</span>
      <span className="opt-value">
        <button type="button" className="opt-step" tabIndex={-1} aria-hidden="true" {...arrow(-1)}>
          ‹
        </button>
        <b>{props.text}</b>
        <button type="button" className="opt-step" tabIndex={-1} aria-hidden="true" {...arrow(1)}>
          ›
        </button>
      </span>
    </div>
  );
}

/** One of a list; the ends wrap around. */
function Choice<T extends string>(props: RowProps & { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const at = Math.max(0, props.options.findIndex(([id]) => id === props.value));
  const move = (dir: 1 | -1) => props.onChange(props.options[(at + dir + props.options.length) % props.options.length][0]);
  return <OptionRow {...props} text={props.options[at]?.[1] ?? String(props.value)} value={props.value} onStep={(dir) => move(dir)} onPress={() => move(1)} />;
}

/** A number between min and max, in steps (Shift: bigger steps). */
function NumberOption(
  props: RowProps & { value: number; min: number; max: number; step: number; bigStep: number; format: (v: number) => string; onChange: (v: number) => void },
) {
  const step = (dir: 1 | -1, big: boolean) => {
    // rounded, so 0.1 steps do not drift into 0.30000000000000004
    const next = Math.round((props.value + dir * (big ? props.bigStep : props.step)) * 1e6) / 1e6;
    const clamped = Math.min(props.max, Math.max(props.min, next));
    if (clamped !== props.value) props.onChange(clamped);
  };
  return <OptionRow {...props} text={props.format(props.value)} value={String(props.value)} onStep={step} />;
}

/** On or off; ←, → and Enter all flip it. */
function Toggle(props: RowProps & { value: boolean; onChange: (v: boolean) => void }) {
  const flip = () => props.onChange(!props.value);
  return <OptionRow {...props} text={props.value ? '켬' : '끔'} value={String(props.value)} checked={props.value} onStep={flip} onPress={flip} />;
}

/** A row that does something (Enter or a click). */
function ActionOption(props: RowProps & { action: string; onPress: () => void }) {
  return (
    <button className="opt opt-action" data-testid={props.testId} onClick={props.onPress} onFocus={() => props.onHelp(props.help)}>
      <span className="opt-name">{props.label}</span>
      <span className="opt-value">
        <b>{props.action}</b> <kbd>Enter</kbd>
      </span>
    </button>
  );
}

/** Connected controllers and a gamepad control per lane, captured by pressing it. */
function GamepadPanel({ settings, onSettingsChange, onHelp }: { settings: Settings; onSettingsChange: (s: Settings) => void; onHelp: (help: string) => void }) {
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

  // capture: the first control pressed (or a turntable spun) becomes the lane's control; the
  // menus do not see it (binding B would otherwise also leave the settings as Esc)
  useEffect(() => {
    if (!capture) return;
    const resumeMenus = suspendMenuBridges();
    const poller = new GamepadPoller(
      (e) => {
        if (!e.down) return;
        const current = [...padBindingsFor(settings, capture.mode)];
        const clash = current.indexOf(e.code);
        if (clash >= 0) current[clash] = current[capture.lane]; // swap
        current[capture.lane] = e.code;
        onSettingsChange({ ...settings, padBindings: { ...settings.padBindings, [capture.mode]: current } });
        setCapture(null);
      },
      { intervalMs: 8 },
    );
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
      resumeMenus();
    };
  }, [capture, settings, onSettingsChange]);

  const padHelp = '레인을 누른 뒤 패드 버튼을 누르거나 턴테이블을 돌리면 지정됩니다 (Esc 취소). 패드는 화면 프레임과 따로 짧은 간격으로 읽고, 브라우저가 신호를 받은 시각으로 판정합니다.';
  return (
    <div data-testid="gamepad-settings">
      <p className="settings-status" data-testid="gamepad-status">
        {pads.length > 0 ? `연결됨: ${pads.join(', ')}` : '연결된 패드가 없습니다. 패드의 버튼을 하나 누르면 나타납니다.'}
      </p>
      {enabledKeyModes.map((mode) => (
        <div className="opt opt-block" key={mode}>
          <span className="opt-name">{mode}</span>
          <div className="opt-keys">
            <div className="keys">
              {padBindingsFor(settings, mode).map((code, lane) => {
                const active = capture?.mode === mode && capture.lane === lane;
                return (
                  <button
                    key={lane}
                    className={`key-cap pad-cap lane-${keyModes[mode].lanes[lane].color} ${active ? 'active' : ''}`}
                    title={code ? padCodeLabel(code) : '지정 안 됨'}
                    onFocus={() => onHelp(padHelp)}
                    onClick={() => setCapture(active ? null : { mode, lane })}
                  >
                    {active ? '…' : code ? padCodeLabel(code) : '-'}
                  </button>
                );
              })}
            </div>
            <div className="opt-actions">
              <button className="small" onClick={() => onSettingsChange({ ...settings, padBindings: { ...settings.padBindings, [mode]: undefined } })}>
                지우기
              </button>
            </div>
          </div>
        </div>
      ))}
      <p className="settings-note">
        메뉴에서는 십자키·왼쪽 스틱이 방향키, A·Start가 Enter, B가 Esc, Y가 Tab, LB·RB가 설정 탭 이동으로 동작하고, 플레이 중 Start로 일시정지합니다.
      </p>
    </div>
  );
}

/** A user skin from JSON, the analysis backends, and a full reset. */
function AdvancedPanel({ settings, onSettingsChange, onHelp }: { settings: Settings; onSettingsChange: (s: Settings) => void; onHelp: (help: string) => void }) {
  const [skinText, setSkinText] = useState('');
  const [skinError, setSkinError] = useState<string | null>(null);
  const [backends, setBackends] = useState<BackendStatus[] | null>(null);
  useEffect(() => {
    api
      .health()
      .then((h) => setBackends(h.backends ?? []))
      .catch(() => setBackends(null));
  }, []);
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
  const custom = settings.customSkin as { label?: string } | null;
  return (
    <>
      <div className="settings-group" data-testid="skin-settings">
        <h3>사용자 스킨</h3>
        <p className="settings-note">
          노트 모양(box·flat·round), 레인 색 배치(mode·uniform·rainbow), 타격 효과(burst·ring·sprite·none), 그리는 방식(style), 텍스처(textures)와 트랙 색을 JSON으로 바꿀 수 있습니다.
          {custom ? ` 지금 사용자 스킨: ${custom.label ?? '사용자 스킨'}${settings.skin === 'custom' ? ' (사용 중)' : ''}` : ''}
        </p>
        <textarea
          className="skin-json"
          rows={6}
          spellCheck={false}
          placeholder='{"label": "내 스킨", "noteShape": "round", "laneLayout": "rainbow", "colors": {"judgeLine": "#ff3b3b"}}'
          value={skinText}
          onFocus={() => onHelp('JSON을 붙여 넣고 적용하면 화면 탭의 트랙 스킨에 사용자 스킨으로 들어갑니다.')}
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
      </div>

      <div className="settings-group" data-testid="backend-status">
        <h3>분석 백엔드</h3>
        <p className="settings-note">
          기본 분석(numpy·scipy)은 항상 동작합니다. 아래 ML 라이브러리를 서버에 설치하면 다음 분석부터 자동으로 쓰이고, 곡 정보의 &quot;다시 분석&quot;으로 기존 곡에도 적용할 수 있습니다.
        </p>
        {backends === null ? (
          <p className="settings-note">분석 서버에 연결할 수 없습니다.</p>
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
      </div>

      <div className="settings-group">
        <h3>초기화</h3>
        <div className="row">
          <button className="danger" onFocus={() => onHelp('모든 설정을 처음 값으로 되돌립니다 (즐겨찾기도). 기록과 곡은 그대로입니다.')} onClick={() => onSettingsChange({ ...DEFAULT_SETTINGS })}>
            모두 초기화
          </button>
        </div>
      </div>
    </>
  );
}
