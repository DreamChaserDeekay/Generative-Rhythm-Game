import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { api, type BackendStatus, type MapperSettings, type MapperStatus } from '../api/client';
import { cameraConfig, enabledKeyModes, keyModes } from '../engine/config';
import type { KeyModeId } from '../engine/types';
import { GamepadPoller, isPadCode, MENU_BUTTONS, MENU_PAD_CODE, padCodeLabel, suspendMenuBridges, type MenuButton, type PadEvent } from '../input/gamepad';
import { DEFAULT_PAD_PLAY, PAD_PLAY_BUTTONS, RETRY_HOLD_MS, type PadPlayButton } from '../input/padPlay';
import { bindingOf, laneTakes, modifierOf, PLAY_ACTION_LABELS, PLAY_ACTIONS, sharedPlayKeys, type PlayAction } from '../input/playKeys';
import type { SkinParts } from '../render/skins';
import {
  bindingLabel,
  bindingsFor,
  clampHiSpeed,
  HI_SPEED_MAX,
  HI_SPEED_MIN,
  JUDGEMENT_OPACITIES,
  KEY_BEAM_MAX,
  keyLabel,
  laneKeysFor,
  MAX_COVER,
  MAX_JUDGE_LINE,
  MIN_JUDGE_LINE,
  OFFSET_MAX,
  padBindingsFor,
  padMenuFor,
  padPlayOf,
  playKeysOf,
  rebindKey,
  sanitizeSettings,
  secondBindingsFor,
  TURNTABLE_RELEASE_MAX,
  TURNTABLE_RELEASE_MIN,
  TURNTABLE_STEPS_MAX,
  withCovers,
  withPlayKey,
  type DisplayMode,
  type HitEffectSize,
  type JudgePosition,
  type ScrollMode,
  type Settings,
} from '../settings/settings';
import type { CalibrationStep } from './CalibrationScreen';
import { desktopShell, heldEscLeaves } from './displayMode';
import { GearPreview } from './GearPreview';
import { KeyGhostTest } from './KeyGhostTest';
import { NoteColorsPanel } from './NoteColorsPanel';
import { PadInputTest } from './PadInputTest';
import { coverText, judgeLineText, speedText } from './format';
import { arrowTarget, type NavStop } from './gridNav';
import { ActionOption, Choice, HUD_TYPE_CHOICES, NumberOption, OptionalNumberOption, PART_CHOICES, pct, Toggle } from './optionRows';
import { RuleRow } from './PlayOptions';
import { HintBar, TopBar, type KeyHint } from './shell';
import { useTwoPress } from './twoPress';
import { keyPairText, syncTestKeys } from './visualSync';

interface Props {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onBack: () => void;
  onCalibrate: (step: CalibrationStep) => void;
  /** The click-track sync test, on autoplay or played by hand; it comes back to the 판정·싱크 tab. */
  onSyncTest: (byHand: boolean) => void;
  initialTab?: SettingsTab;
  /** The test id of the row to focus first (the tool come back from), else the tab's first row. */
  initialFocus?: string;
  /** 모두 초기화 can be undone now (the app keeps the settings of before it for RESET_UNDO_MS, on any screen). */
  canUndoReset: boolean;
  onReset: () => void;
  onUndoReset: () => void;
}

export type SettingsTab = 'play' | 'judge' | 'speed' | 'gear' | 'notes' | 'fx' | 'sound' | 'keys' | 'pad' | 'advanced';

/** The tabs in order: name and the line under it. */
const TABS: [SettingsTab, string, string][] = [
  ['play', '플레이', '다음 플레이부터 적용됩니다'],
  ['judge', '판정·싱크', '판정 기준과 입력·화면 지연 보정'],
  ['speed', '속도·커버', '움직이는 미리보기에 바로 보입니다'],
  ['gear', '기어', '움직이는 미리보기에 바로 보입니다'],
  ['notes', '노트', '모양과 레인마다의 색 · 미리보기에 바로 보입니다'],
  ['fx', '연출·배경', '카메라 연출, 타격 효과와 플레이 배경'],
  ['sound', '소리', '음악과 효과음'],
  ['keys', '키 설정', '레인의 키와 플레이 중 키'],
  ['pad', '게임패드', '레인, 플레이 중 버튼, 전용 컨트롤러의 메뉴 버튼'],
  ['advanced', '고급', '화면 모드, 분석 백엔드와 초기화'],
];

const BACKEND_LABELS: Record<string, string> = { stems: '스템 분리', beats: '비트·다운비트', pitch: '음높이·음 길이', structure: '곡 구조' };
const signedMs = (v: number) => `${v > 0 ? '+' : ''}${v}ms`;

/** What the hand-played sync test's keys move, in the key mode it is played in (its keys are those no lane takes). */
function syncKeysHelp(settings: Settings): string {
  const keys = syncTestKeys(laneKeysFor(settings, settings.lastKeyMode), true);
  const moves = [keys.visual && `${keyPairText(keys.visual)}로 표시 오프셋`, keys.judgement && `${keyPairText(keys.judgement)}로 판정 오프셋`].filter((m) => m);
  return moves.length > 0 ? `${moves.join(', ')}을 옮기고 두 값은 화면 왼쪽 위에 보입니다.` : '레인이 쓰지 않는 키가 없어 오프셋은 옮길 수 없습니다.';
}

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
 * The rows' controls as the arrows see them (see arrowTarget): a key cap names its line and lane
 * itself (data-nav-line, data-lane); the cells of a grid of keys are in rows as they lie, their
 * column their place along the row; anything else is on the line of its row of buttons or its
 * option row, or alone.
 */
function navStops(stops: HTMLElement[]): NavStop[] {
  const ids = new Map<Element, string>();
  const idOf = (el: Element) => {
    let id = ids.get(el);
    if (id === undefined) {
      id = `line${ids.size}`;
      ids.set(el, id);
    }
    return id;
  };
  const nav = stops.map((el): NavStop => {
    if (el.dataset.navLine) return { line: el.dataset.navLine, column: Number(el.dataset.lane ?? 0) };
    const grid = el.closest('.play-key-grid');
    if (grid) return { line: `${idOf(grid)}@${Math.round(el.getBoundingClientRect().top)}`, column: 0 };
    return { line: idOf(el.closest('.opt-actions, .row, .pad-row') ?? el.closest('.opt') ?? el), column: null };
  });
  nav.forEach((s, i) => {
    if (s.line.includes('@') && i > 0 && nav[i - 1].line === s.line) s.column = (nav[i - 1].column ?? 0) + 1;
  });
  return nav;
}

const ARROWS: Record<string, 'up' | 'down' | 'left' | 'right'> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

/**
 * What a key or pad control is being bound for, as the hint bar names it (a run goes on to the
 * next lane), or the pad's input check, which has the pad to itself too.
 */
type CaptureKind = 'key' | 'second' | 'run' | 'playKey' | 'pad' | 'padRun' | 'padButton' | 'padTest';

const CAPTURE_HINTS: Record<CaptureKind, KeyHint[]> = {
  key: [{ keys: ['아무 키'], label: '이 레인에 지정' }],
  second: [
    { keys: ['아무 키'], label: '보조 키로 지정' },
    { keys: ['Backspace'], label: '비우기' },
  ],
  run: [{ keys: ['아무 키'], label: '지정하고 다음 레인으로' }],
  playKey: [{ keys: ['아무 키'], label: '지정 (Ctrl·Alt·Shift와 함께도)' }],
  pad: [{ keys: ['패드 버튼'], label: '이 레인에 지정' }],
  padRun: [{ keys: ['패드 버튼'], label: '지정하고 다음 레인으로' }],
  padButton: [
    { keys: ['패드 버튼'], label: '지정' },
    { keys: ['Backspace'], label: '비우기' },
  ],
  // the keyboard's Esc is the end hint; with the pad working the menus, only Start held shows
  padTest: [{ keys: [], pad: ['Start'], label: '길게 눌러 닫기' }],
};

/** The keys of a tab (a pad's buttons beside them, shown while the pad works the menus). */
function tabHints(tab: SettingsTab): KeyHint[] {
  const tabs: KeyHint = { keys: ['Q', 'E'], pad: ['LB', 'RB'], label: '탭' };
  const lanes = tab === 'keys' || tab === 'pad';
  const hints: KeyHint[] = [
    { keys: ['↑', '↓'], pad: ['↑', '↓'], label: lanes ? '모드' : '항목' },
    { keys: ['←', '→'], pad: ['←', '→'], label: lanes ? '레인' : '값' },
  ];
  if (tab === 'keys') hints.push({ keys: ['Enter'], pad: ['A'], label: '바꾸기' });
  if (tab === 'pad') hints.push({ keys: ['Enter'], pad: ['A'], label: '지정' });
  // the calibration steps and the sync tests under the offsets
  if (tab === 'judge') hints.push({ keys: ['Enter'], pad: ['A'], label: '열기' });
  if (tab === 'advanced') hints.push({ keys: ['Enter'], pad: ['A'], label: '누르기' });
  return [...hints, tabs];
}

/** How long 모두 초기화 can be undone (from its last press; its second press waits TWO_PRESS_MS). */
export const RESET_UNDO_MS = 10000;

/**
 * The settings as an arcade option screen: tabs on the left (Q / E, LB / RB on a pad), a row per
 * setting with its value between ‹ › (↑↓ choose a row, ←→ change it), and on the right a live gear
 * or the chosen row's help.
 */
export function SettingsScreen({
  settings,
  onSettingsChange,
  onBack,
  onCalibrate,
  onSyncTest,
  initialTab = 'speed',
  initialFocus,
  canUndoReset,
  onReset,
  onUndoReset,
}: Props) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onSettingsChange({ ...settings, [key]: value });
  const setPart = <K extends keyof SkinParts>(key: K, value: SkinParts[K]) => onSettingsChange({ ...settings, parts: { ...settings.parts, [key]: value } });
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [help, setHelp] = useState('');
  /** The side notes' row has the focus: the preview shows a key mode with side lanes. */
  const [sideRow, setSideRow] = useState(false);
  /** The key mode whose note colours the 노트 tab shows, and colours being picked there, not kept yet. */
  const [colorMode, setColorMode] = useState<KeyModeId>(settings.lastKeyMode);
  const [colorDraft, setColorDraft] = useState<number[] | null>(null);
  const rows = useRef<HTMLDivElement>(null);
  /** What a key or pad control is being bound for in the 키 설정 or 게임패드 tab (the hints), or null. */
  const [capture, setCapture] = useState<CaptureKind | null>(null);
  /** The lane the arrows keep through a line of buttons between two of lanes (see arrowTarget). */
  const column = useRef<number | null>(null);

  // a tab opens on its first row, with the focus there (a click on a tab leaves the focus on it)
  const focusFirstRow = () => requestAnimationFrame(() => (rows.current && rowStops(rows.current)[0])?.focus({ preventScroll: true }));
  useEffect(() => {
    setHelp('');
    setSideRow(false);
    rows.current?.scrollTo(0, 0);
  }, [tab]);
  useEffect(() => {
    // back from a tool of the tab (the sync test, a calibration step), on its row
    const tool = initialFocus ? rows.current?.querySelector<HTMLElement>(`[data-testid="${initialFocus}"]`) : null;
    if (!tool) focusFirstRow();
    else
      requestAnimationFrame(() => {
        tool.focus({ preventScroll: true });
        tool.scrollIntoView({ block: 'nearest' });
      });
  }, []);
  const stepTab = (dir: 1 | -1) => {
    const at = TABS.findIndex(([id]) => id === tab);
    setTab(TABS[(at + dir + TABS.length) % TABS.length][0]);
    focusFirstRow();
  };

  // Esc leaves (a key being bound and the rollover test take it first, see KeysPanel); Q / E and
  // PageUp / PageDown (LB / RB) change the tab; the arrows go through the rows: ↑↓ line to line,
  // ←→ along a line (keys and pad controls lane by lane; an option row takes ←→ itself).
  useEffect(() => {
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
      const key = ARROWS[e.code];
      if (!key || e.defaultPrevented) return;
      const root = rows.current;
      const at = document.activeElement;
      if (!root || !(at instanceof HTMLElement)) return;
      const stops = rowStops(root);
      const from = stops.indexOf(at);
      if (from >= 0) {
        // a pad's d-pad goes the same way (the event is taken here, so the menu bridge does not move it again)
        e.preventDefault();
        const nav = navStops(stops);
        const next = arrowTarget(nav, from, key, column.current);
        if (next < 0) return;
        column.current = nav[next].column ?? column.current;
        stops[next].focus();
        stops[next].scrollIntoView({ block: 'nearest' });
      } else if (at.closest('.settings-nav') && key === 'down') {
        e.preventDefault();
        stops[0]?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const row = {
    onHelp: (text: string) => {
      setHelp(text);
      setSideRow(false);
    },
  };
  // the 노트 tab shows the key mode whose colours it shows; the side notes' row shows them on 4K+FX or
  // 6K+FX when that key mode has no side lanes
  const shownMode = tab === 'notes' ? colorMode : settings.lastKeyMode;
  const previewMode: KeyModeId = sideRow && !keyModes[shownMode].lanes.some((l) => l.kind === 'side') ? (shownMode === '4K' ? '4K+FX' : '6K+FX') : shownMode;
  const playKeys = playKeysOf(settings);
  const keyPair = (down: PlayAction, up: PlayAction) => `${bindingLabel(playKeys[down])} / ${bindingLabel(playKeys[up])}`;
  const [, heading] = TABS.find(([id]) => id === tab) ?? TABS[0];
  const subtitle = TABS.find(([id]) => id === tab)?.[2];

  let content: ReactNode;
  switch (tab) {
    case 'play':
      content = (
        <>
          {(['ruleset', 'gauge', 'fever', 'placement', 'pacemaker'] as const).map((rule) => (
            <RuleRow key={rule} {...row} rule={rule} testId={`opt-${rule}`} settings={settings} onSettingsChange={onSettingsChange} detailed />
          ))}
          <Toggle
            {...row}
            label="창을 벗어나면 일시정지"
            testId="opt-pause-on-blur"
            value={settings.pauseOnBlur}
            onChange={(v) => set('pauseOnBlur', v)}
            help="다른 창으로 옮기거나 창이 가려지면 플레이를 일시정지합니다 (오토·리플레이는 그대로 흐릅니다). 알림이나 실수로 누른 Windows 키에 판이 깨지지 않습니다."
          />
        </>
      );
      break;
    case 'judge':
      content = (
        <>
          <RuleRow {...row} rule="judgement" testId="opt-judgement" settings={settings} onSettingsChange={onSettingsChange} detailed />
          <NumberOption
            {...row}
            label="판정 오프셋"
            testId="opt-input-offset"
            value={settings.inputOffsetMs}
            min={-OFFSET_MAX}
            max={OFFSET_MAX}
            step={1}
            bigStep={5}
            format={signedMs}
            onChange={(v) => set('inputOffsetMs', v)}
            help="+면 늦게 치는 만큼 판정을 늦춥니다. ←→ 1ms, Shift ±5ms. 결과 화면의 제안이나 아래 '판정 오프셋 측정'으로 맞출 수 있습니다."
          />
          <ActionOption
            {...row}
            label="판정 오프셋 측정"
            testId="open-calibration-settings"
            action="열기"
            onPress={() => onCalibrate('input')}
            help="메트로놈 소리에 맞춰 눌러 평균 오차를 재고, 그 값을 판정 오프셋으로 씁니다."
          />
          <NumberOption
            {...row}
            label="표시 오프셋"
            testId="opt-visual-offset"
            value={settings.visualOffsetMs}
            min={-OFFSET_MAX}
            max={OFFSET_MAX}
            step={1}
            bigStep={5}
            format={signedMs}
            onChange={(v) => set('visualOffsetMs', v)}
            help="+면 노트를 그만큼 일찍 그립니다 (화면 지연 보정). ←→ 1ms, Shift ±5ms. 아래 '표시 오프셋 맞추기'에서 눈으로 맞출 수 있습니다."
          />
          <ActionOption
            {...row}
            label="표시 오프셋 맞추기"
            testId="open-visual-calibration-settings"
            action="열기"
            onPress={() => onCalibrate('visual')}
            help="메트로놈에 맞춰 내려오는 노트가 클릭 소리와 함께 판정선에 닿도록 ←→로 옮기고 Enter로 저장합니다."
          />
          <ActionOption
            {...row}
            label="싱크 테스트 · 오토"
            testId="settings-sync-auto"
            action="보기"
            onPress={() => onSyncTest(false)}
            help="클릭 트랙에 맞춰 노트를 오토로 칩니다. 보면서 ←→로 표시 오프셋을 옮길 수 있습니다. 끝나면 이 탭으로 돌아옵니다."
          />
          <ActionOption
            {...row}
            label="싱크 테스트 · 직접 치기"
            testId="settings-sync-play"
            action="시작"
            onPress={() => onSyncTest(true)}
            help={`클릭 트랙에 맞춰 ${settings.lastKeyMode}로 직접 칩니다. ${syncKeysHelp(settings)} 끝나면 이 탭으로 돌아옵니다.`}
          />
          <Toggle
            {...row}
            label="판정 ms 오차 표시"
            testId="opt-error-ms"
            value={settings.showErrorMs}
            onChange={(v) => set('showErrorMs', v)}
            help="판정 아래에 몇 ms 빠르거나 늦었는지 보여 줍니다."
          />
          <Toggle
            {...row}
            label="판정 오차 막대"
            testId="opt-error-bar"
            value={settings.errorBar}
            onChange={(v) => set('errorBar', v)}
            help="판정 아래 막대에 최근 20번 친 타이밍을 보여 줍니다. 왼쪽이 FAST, 오른쪽이 SLOW이고, 가운데 옅은 칸이 최고 판정 범위, 긴 선이 평균입니다."
          />
          <Toggle
            {...row}
            label="판정 카운터"
            testId="opt-judge-counter"
            value={settings.judgeCounter}
            onChange={(v) => set('judgeCounter', v)}
            help="점수판 아래에 지금까지의 BREAK 수와 FAST·SLOW 수를 보여 줍니다."
          />
        </>
      );
      break;
    case 'speed':
      content = (
        <>
          <NumberOption
            {...row}
            label="노트 속도"
            testId="opt-hi-speed"
            value={settings.hiSpeed}
            min={HI_SPEED_MIN}
            max={HI_SPEED_MAX}
            step={0.1}
            bigStep={0.5}
            format={speedText}
            onChange={(v) => set('hiSpeed', clampHiSpeed(v))}
            help={`노트가 내려오는 빠르기입니다(SPEED, 배속). 미리보기의 '보이는 시간'(녹색 숫자)은 노트가 나타나서 판정선에 닿기까지의 시간으로, 이 값이 같으면 노트 속도와 커버를 바꿔도 같은 빠르기로 느껴집니다. 플레이 중 ${keyPair('speedDown', 'speedUp')}, 0.5씩은 ${keyPair('speedDownBig', 'speedUpBig')}.`}
          />
          <NumberOption
            {...row}
            label="노트 등장 위치"
            testId="opt-sudden"
            value={settings.sudden}
            min={0}
            max={MAX_COVER}
            step={0.01}
            bigStep={0.05}
            format={coverText}
            onChange={(v) => onSettingsChange(withCovers(settings, { sudden: v }))}
            help={`트랙 위쪽을 가려 노트가 나타나는 곳을 내립니다(SUDDEN+). 0%면 노트가 트랙 끝에서 나옵니다. 플레이 중 ${keyPair('suddenDown', 'suddenUp')}.`}
          />
          <NumberOption
            {...row}
            label="노트 사라짐 위치"
            testId="opt-hidden"
            value={settings.hidden}
            min={0}
            max={MAX_COVER}
            step={0.01}
            bigStep={0.05}
            format={coverText}
            onChange={(v) => onSettingsChange(withCovers(settings, { hidden: v }))}
            help="판정선 바로 위를 가려 노트가 사라지는 곳을 올립니다(HIDDEN+). 0%면 노트가 판정선까지 보입니다. 보이는 시간은 바뀌지 않습니다."
          />
          <NumberOption
            {...row}
            label="판정선 위치"
            testId="opt-lift"
            value={settings.judgeLinePosition}
            min={MIN_JUDGE_LINE}
            max={MAX_JUDGE_LINE}
            step={0.01}
            bigStep={0.05}
            format={judgeLineText}
            onChange={(v) => onSettingsChange(withCovers(settings, { judgeLinePosition: v }))}
            help={`판정선을 올리거나(+) 내립니다(−, LIFT). −20%면 판정선이 기어에 붙고, 올리면 기어는 제자리에 있고 그 사이를 커버가 덮습니다. 플레이 중 ${keyPair('liftDown', 'liftUp')}.`}
          />
          <Toggle
            {...row}
            label="커버 사용"
            testId="opt-covers-on"
            value={settings.coversOn}
            onChange={(v) => onSettingsChange(withCovers(settings, { coversOn: v }))}
            help={`노트 등장 위치와 노트 사라짐 위치의 커버를 씁니다(판정선 위치는 그대로). 플레이 중 켜고 끄는 키: ${bindingLabel(playKeys.covers)}.`}
          />
          <Toggle
            {...row}
            label="보이는 시간 유지"
            testId="opt-keep-green"
            value={settings.keepVisibleTime}
            onChange={(v) => set('keepVisibleTime', v)}
            help="노트 등장 위치나 판정선 위치를 움직여도 노트가 보이는 시간(녹색 숫자)을 그대로 둡니다 (노트 속도가 함께 바뀝니다)."
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
            label="기어"
            testId="opt-deck-style"
            value={settings.parts.deck}
            options={PART_CHOICES.deck}
            onChange={(v) => setPart('deck', v)}
            help="트랙을 담는 기어입니다. 판정선 아래 받침의 꾸밈, 트랙 양옆 테두리, 게이지·점수판의 모양과 숫자 글꼴이 함께 바뀝니다. 기본은 그래파이트 테에 스모크 유리와 조그 원판, 오락실 기체는 검은 플라스틱·크롬에 조이스틱·아크릴 버튼·동전 투입구, 빈티지 리시버는 월넛과 은색 앞판에 튜닝 다이얼·노브·스위치·미터, 나전칠기는 흑칠에 자개 학 뚜껑·자개 덩굴·황동 자물쇠 판, 커스텀 키보드는 차콜 알루미늄에 노브·OLED 창·황동 명판·방향키, 레이싱 휠은 카본에 시프트 라이트·로터리·고무 버튼·랩 타이머, 우주선 계기판은 회색 패널에 보호 덮개 셀렉터·토글·경고등·주의 띠와 금박 단열재 테두리, 피아노는 흑단 래커에 레인마다 상아색 흰 건반과 그 사이 검은 건반, 스크래치 아래 높은음자리표 황동 메달, 달은 깨뜨린 은빛 크리스털 유리 덩어리 한 장(곧은 결정 면 사이로 유리 속의 결이 비침)과 같은 유리의 테두리입니다. 누른 레인은 키빔과 타격 효과로 보입니다. 받침의 버튼·노브·창 같은 부품에는 박자에 맞춰 불이 들어오고, 마디마다 테두리를 따라 빛이 지나가며, 피버 때는 테두리의 불빛이 다 켜집니다. 판정선은 어느 기어에서나 같은 자리의 굵은 붉은 선으로 레이저처럼 조금씩 일렁이고, 받침은 그보다 조금 아래에서 시작합니다."
          />
          <Choice
            {...row}
            label="판정·콤보 글꼴"
            testId="opt-hud-type"
            value={settings.hudType}
            options={HUD_TYPE_CHOICES}
            onChange={(v) => set('hudType', v)}
            help="판정과 콤보를 쓰는 글꼴과 색입니다. 기어를 따르면 기본은 흰 장체(MAX는 흰색, 퍼센트는 하늘색), 오락실 기체는 빨간 7세그 콤보와 굵은 이탤릭 판정, 빈티지 리시버는 호박색 7세그 콤보와 가는 장체 판정, 나전칠기는 금색 세리프, 커스텀 키보드는 픽셀 글꼴과 주황 밑줄, 레이싱 휠은 기울어진 흰 숫자와 빨간 밑줄, 우주선 계기판은 스텐실 판정과 초록 7세그 콤보, 피아노는 악보의 셈여림 글씨 같은 굵은 이탤릭 세리프, 달은 넓은 기하 글꼴(MAX는 흰색, 퍼센트는 은색)로 씁니다. 기본은 기어와 상관없이 흰 장체에 MAX를 하늘색으로 씁니다."
          />
          <Choice
            {...row}
            label="타격 효과"
            testId="opt-hit-style"
            value={settings.parts.hit}
            options={PART_CHOICES.hit}
            onChange={(v) => setPart('hit', v)}
            help="노트를 치거나 롱노트를 누르고 있을 때의 효과 모양입니다. 플래시·플레어·거품·LED 그리드와 세트마다 하나(메카 섬광·클럽 링·크리스털 파편·네온 아크·피아노 음표)가 있고, 모두 판정선 위로는 짧게만 남아 내려오는 노트를 가리지 않습니다(LED 그리드는 판정선 아래에만). 크기는 연출·배경 탭의 타격 효과 크기에서 정합니다."
          />
          <Choice
            {...row}
            label="카메라"
            testId="opt-camera"
            value={settings.cameraPreset}
            options={Object.entries(cameraConfig.presets).map(([id, p]) => [id, p.label])}
            onChange={(id) => set('cameraPreset', id)}
            help="트랙을 내려다보는 높이와 각도입니다. 평면은 원근이 없어 레일이 나란하고 노트가 화면 위에서 아래까지 같은 빠르기로 내려옵니다."
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
          <Choice
            {...row}
            label="판정·콤보 불투명도"
            testId="opt-judge-opacity"
            value={String(settings.judgementOpacity)}
            options={JUDGEMENT_OPACITIES.map((v): [string, string] => [String(v), pct(v)])}
            onChange={(v) => set('judgementOpacity', Number(v))}
            help="판정 글자와 콤보 숫자를 얼마나 진하게 그릴지 정합니다. 낮추면 그 뒤로 지나가는 노트가 비쳐 보입니다."
          />
          <Toggle
            {...row}
            label="마디선"
            testId="bar-lines"
            value={settings.barLines}
            onChange={(v) => set('barLines', v)}
            help="마디마다 트랙을 가로지르는 선을 긋습니다."
          />
        </>
      );
      break;
    case 'notes':
      content = (
        <>
          <Choice
            {...row}
            label="노트"
            testId="opt-note-style"
            value={settings.parts.note}
            options={PART_CHOICES.note}
            onChange={(v) => setPart('note', v)}
            help="노트 모양입니다. 롱노트는 고른 노트와 같은 계열(메카 챔퍼는 레일, 원형은 캡슐, 별 (4각)은 프리즘, 별 (5각)은 네온관)로 시작과 끝에 단노트 없이 몸통의 끝 모양으로 닫습니다. 메카 챔퍼·원형·별은 건반마다 표식(흰 건반 ○, 파란 건반 △, 금색 건반 ◇, 스크래치 //)이 있어 색이 같아도 건반을 구분할 수 있습니다. 같은 컨셉의 타격 효과와 고르면 한 벌로 맞습니다: 메카(메카 챔퍼·메카 섬광), 클럽(원형·클럽 링), 크리스털(별 (4각)·크리스털 파편), 네온(별 (5각)·네온 아크)."
          />
          <Choice
            {...row}
            onHelp={(text) => {
              setHelp(text);
              setSideRow(true);
            }}
            label="사이드 노트"
            testId="opt-side-style"
            value={settings.parts.side}
            options={PART_CHOICES.side}
            onChange={(v) => setPart('side', v)}
            help="4K+FX·6K+FX 사이드 노트의 모양입니다. 사이드 노트는 DJMAX처럼 건반 레인의 왼쪽·오른쪽 절반을 덮습니다. 기본은 비치는 막대로, 도트 매트릭스는 LED 점으로 그려 노트의 시점에 놓인 줄이 가장 밝습니다."
          />
          <NoteColorsPanel settings={settings} onSettingsChange={onSettingsChange} onHelp={row.onHelp} mode={colorMode} onMode={setColorMode} onDraft={setColorDraft} />
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
            help="드롭·후렴에서 트랙이 기울고 줌합니다 (SDVX식). 판정선은 제자리에 있습니다."
          />
          <Choice
            {...row}
            label="타격 효과 크기"
            testId="opt-hit-effect"
            value={settings.hitEffectSize}
            options={
              [
                ['large', '크게'],
                ['normal', '보통'],
                ['small', '작게'],
                ['off', '끄기'],
              ] as [HitEffectSize, string][]
            }
            onChange={(v) => set('hitEffectSize', v)}
            help="노트를 치거나 롱노트를 누르고 있을 때 판정선에 번지는 빛입니다. 크게는 보통의 1.4배로 그리고(레일 밖으로는 나가지 않음, 반쪽 덮기의 사이드 노트는 절반 폭 그대로 더 높게), 작게는 한 레인 남짓으로 줄이고(사이드 노트는 절반 폭 그대로 낮게), 끄기는 그리지 않습니다."
          />
          <Toggle
            {...row}
            label="번쩍임 줄이기"
            testId="opt-reduced-flash"
            value={settings.reducedFlash}
            onChange={(v) => set('reducedFlash', v)}
            help="타격 효과·FEVER·카메라 연출을 약하게 하고, 기어의 불빛과 판정선의 일렁임은 깜빡이지 않고 천천히 오르내리게 합니다."
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
      content = <KeysPanel settings={settings} onSettingsChange={onSettingsChange} onHelp={setHelp} onCapture={setCapture} />;
      break;
    case 'pad':
      content = <GamepadPanel settings={settings} onSettingsChange={onSettingsChange} onHelp={setHelp} onCapture={setCapture} />;
      break;
    case 'advanced':
      content = <AdvancedPanel settings={settings} onSettingsChange={onSettingsChange} onHelp={setHelp} undo={canUndoReset} onReset={onReset} onUndo={onUndoReset} />;
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
          <Fragment key={tab}>{content}</Fragment>
        </section>
        <aside className="settings-side">
          {/* the gear as it will be played, where a row changes how it looks (the hit effects too) */}
          {tab === 'speed' || tab === 'gear' || tab === 'notes' || tab === 'fx' ? (
            <>
              <span className="settings-side-head">
                <span>미리보기</span>
                <span>{previewMode}</span>
              </span>
              <GearPreview settings={settings} keyMode={previewMode} laneColors={tab === 'notes' ? colorDraft ?? undefined : undefined} />
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
        hints={capture ? CAPTURE_HINTS[capture] : tabHints(tab)}
        end={[capture ? { keys: ['Esc'], label: capture === 'run' || capture === 'padRun' ? '멈추기' : capture === 'padTest' ? '닫기' : '취소' } : { keys: ['Esc'], pad: ['B'], label: '완료' }]}
      />
    </div>
  );
}

function defaultHelp(tab: SettingsTab): string {
  switch (tab) {
    case 'keys':
      return KEYS_HELP;
    case 'pad':
      return PAD_HELP;
    default:
      return '항목을 고르면 여기에 설명이 나옵니다.';
  }
}

const KEYS_HELP =
  '레인의 키를 누른 뒤 쓸 키를 입력하세요. 이미 쓰는 키를 고르면 서로 바뀝니다. 아래 줄은 보조 키로, 고른 뒤 Backspace로 비웁니다. 한글 입력 상태와 무관하게 동작합니다.';
const PAD_HELP = '레인을 누른 뒤 패드 버튼을 누르거나 턴테이블을 돌리면 지정됩니다 (Esc 취소). 키보드 키와 함께 쓸 수 있습니다.';
const MODIFIER_NAMES = { Shift: 'Shift', Ctrl: 'Ctrl', Alt: 'Alt', Meta: 'Win' } as const;

/** A key (or pad control) waiting to be bound: a lane's (`run`: then the next lane's, to the last), or a function's. */
type KeyCapture = { kind: 'lane'; mode: KeyModeId; lane: number; second: boolean; run: boolean } | { kind: 'play'; action: PlayAction };

/** Key names in a line of text, as caps (a bare "-" or "=" would read as punctuation). */
function KeyNames({ names }: { names: string[] }) {
  return (
    <>
      {names.map((name, i) => (
        <Fragment key={name}>
          {i > 0 && ' '}
          <kbd>{name}</kbd>
        </Fragment>
      ))}
    </>
  );
}

/** The release of a key just bound does nothing more (Space let go would press the focused button: the capture again). */
function swallowRelease(code: string): void {
  const onUp = (e: KeyboardEvent) => {
    if (e.code !== code) return;
    e.preventDefault();
    window.removeEventListener('keyup', onUp, { capture: true });
  };
  window.addEventListener('keyup', onUp, { capture: true });
}

/**
 * The keyboard: a row per key mode with each lane's key and a second key under it, then the keys
 * of the in-play functions. A lane key that takes a function's key (lanes are read first) and a
 * function on the key of another are marked; a lane on Shift, Ctrl or Alt gets the Windows notes.
 */
function KeysPanel({
  settings,
  onSettingsChange,
  onHelp,
  onCapture,
}: {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onHelp: (help: string) => void;
  onCapture: (kind: CaptureKind | null) => void;
}) {
  const [capture, setCapture] = useState<KeyCapture | null>(null);
  const [ghostMode, setGhostMode] = useState<KeyModeId | null>(null);
  const playKeys = playKeysOf(settings);
  const shared = sharedPlayKeys(playKeys);
  useEffect(() => onCapture(capture === null ? null : capture.kind === 'play' ? 'playKey' : capture.run ? 'run' : capture.second ? 'second' : 'key'), [capture, onCapture]);
  useEffect(() => () => onCapture(null), [onCapture]);

  // the key pressed next is bound; Esc cancels (and stops a run), and the screen sees neither
  useEffect(() => {
    if (!capture) return;
    let modifier: string | null = null;
    const bindPlay = (action: PlayAction, key: string) => {
      onSettingsChange(withPlayKey(settings, action, key));
      setCapture(null);
    };
    const onDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape') {
        setCapture(null);
        return;
      }
      if (e.repeat) return;
      swallowRelease(e.code);
      if (capture.kind === 'play') {
        // Ctrl / Alt / Shift wait for the key they go with; let go alone, the modifier key is the binding
        if (modifierOf(e.code)) modifier = e.code;
        else bindPlay(capture.action, bindingOf(e));
        return;
      }
      const clear = capture.second && (e.code === 'Backspace' || e.code === 'Delete');
      const next = rebindKey(settings, capture.mode, capture.lane, capture.second, clear ? null : e.code);
      if (!next) {
        const own = bindingsFor(settings, capture.mode)[capture.lane] === e.code;
        onHelp(`${keyLabel(e.code)}: ${own ? '이 레인의 첫 키입니다' : '다른 레인의 하나뿐인 키라 보조 키로 쓸 수 없습니다'}. 다른 키를 누르세요.`);
        return;
      }
      onSettingsChange(next);
      const last = capture.lane + 1 >= keyModes[capture.mode].lanes.length;
      setCapture(capture.run && !last ? { ...capture, lane: capture.lane + 1 } : null);
    };
    const onUp = (e: KeyboardEvent) => {
      if (capture.kind !== 'play' || modifier !== e.code) return;
      e.preventDefault();
      bindPlay(capture.action, e.code);
    };
    // a pad press is no keyboard key to bind
    const resumePad = suspendMenuBridges();
    window.addEventListener('keydown', onDown, { capture: true });
    window.addEventListener('keyup', onUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', onDown, { capture: true });
      window.removeEventListener('keyup', onUp, { capture: true });
      resumePad();
    };
  }, [capture, settings, onSettingsChange, onHelp]);

  const capturing = (mode: KeyModeId, lane: number, second: boolean) => capture?.kind === 'lane' && capture.mode === mode && capture.lane === lane && capture.second === second;
  // the functions a lane key takes from the player (lanes are read first)
  const takes = (code: string) => PLAY_ACTIONS.filter((a) => laneTakes(code, playKeys[a]));
  const laneHelp = (second: boolean) =>
    second
      ? '이 레인의 보조 키입니다. 누른 뒤 쓸 키를 입력하세요 (Backspace: 비우기). 첫 키와 함께 눌러도 한 번으로 칩니다.'
      : '누른 뒤 쓸 키를 입력하세요. 이미 쓰는 키를 고르면 서로 바뀝니다. 한글 입력 상태와 무관하게 동작합니다.';
  return (
    <>
      {enabledKeyModes.map((mode) => {
        const first = bindingsFor(settings, mode);
        const second = secondBindingsFor(settings, mode);
        const lanes = keyModes[mode].lanes;
        const all = laneKeysFor(settings, mode);
        const clashes = all.filter((code) => takes(code).length > 0);
        // lanes that take the same functions are named together (both Shifts of an FX mode)
        const clashGroups = new Map<string, string[]>();
        for (const code of clashes) {
          const names = takes(code)
            .map((a) => PLAY_ACTION_LABELS[a])
            .join('·');
          clashGroups.set(names, [...(clashGroups.get(names) ?? []), keyLabel(code)]);
        }
        // a Shift / Ctrl / Alt lane whose twin is no lane: with the twin, the function presses no lane
        const twins = clashes.flatMap((code) => {
          const twin = modifierOf(code) ? code.replace(/Left$|Right$/, (side) => (side === 'Left' ? 'Right' : 'Left')) : null;
          return twin && !all.includes(twin) ? [twin] : [];
        });
        const modifiers = [...new Set(all.map(modifierOf).filter((m): m is NonNullable<typeof m> => m !== null))];
        const bothShifts = all.includes('ShiftLeft') && all.includes('ShiftRight');
        const running = capture?.kind === 'lane' && capture.mode === mode && capture.run;
        const cap = (code: string | null, lane: number, isSecond: boolean) => {
          const active = capturing(mode, lane, isSecond);
          const taken = code ? takes(code) : [];
          return (
            <button
              key={`${isSecond ? 2 : 1}-${lane}`}
              className={`key-cap lane-${lanes[lane].color}${isSecond ? ' second' : ''}${active ? ' active' : ''}${taken.length > 0 ? ' clash' : ''}${code ? '' : ' empty'}`}
              data-testid={`${isSecond ? 'key2' : 'key'}-${mode}-${lane}`}
              data-nav-line={`${mode}-${isSecond ? 2 : 1}`}
              data-lane={lane}
              title={taken.length > 0 ? `플레이 중 키와 겹침: ${taken.map((a) => PLAY_ACTION_LABELS[a]).join(', ')}` : isSecond ? (code ? '보조 키' : '보조 키 (비어 있음)') : undefined}
              onFocus={() => onHelp(laneHelp(isSecond))}
              onClick={() => setCapture(active ? null : { kind: 'lane', mode, lane, second: isSecond, run: false })}
            >
              {active ? '…' : code ? keyLabel(code) : ''}
            </button>
          );
        };
        return (
          <Fragment key={mode}>
            <div className="opt opt-block" data-testid={`keys-${mode}`}>
              <span className="opt-name key-row-names">
                <span>{mode}</span>
                <span className="key-grid-label">보조 키</span>
              </span>
              <div className="opt-lanes">
                <div className="opt-keys">
                  <div className="key-grid" style={{ ['--lanes' as string]: lanes.length } as CSSProperties}>
                    {first.map((code, lane) => cap(code, lane, false))}
                    {second.map((code, lane) => cap(code, lane, true))}
                  </div>
                  <div className="opt-actions">
                    <button
                      className="small"
                      data-testid={`keys-run-${mode}`}
                      onFocus={() => onHelp('1번 레인부터 차례로 키를 누르면 한 칸씩 넘어가며 지정합니다. Esc로 멈춥니다.')}
                      onClick={() => setCapture(running ? null : { kind: 'lane', mode, lane: 0, second: false, run: true })}
                    >
                      {running ? '멈추기' : '차례로 지정'}
                    </button>
                    {mode === '7K+1S' && (
                      <button className="small" onClick={() => onSettingsChange(sanitizeSettings({ ...settings, bindings: { ...settings.bindings, [mode]: keyModes[mode].bindings.BMS } }))}>
                        BMS 배치
                      </button>
                    )}
                    <button
                      className="small"
                      data-testid={`keys-default-${mode}`}
                      onClick={() => onSettingsChange({ ...settings, bindings: { ...settings.bindings, [mode]: keyModes[mode].bindings.default }, secondBindings: { ...settings.secondBindings, [mode]: undefined } })}
                    >
                      기본값
                    </button>
                    <button
                      className="small"
                      data-testid={`ghost-${mode}`}
                      onFocus={() => onHelp('키보드가 여러 키를 한꺼번에 인식하는지 봅니다. 레인 키를 (보조 키까지) 모두 누르세요.')}
                      onClick={() => setGhostMode(ghostMode === mode ? null : mode)}
                    >
                      {ghostMode === mode ? '테스트 닫기' : '동시 입력 테스트'}
                    </button>
                  </div>
                </div>
                {clashes.length > 0 && (
                  <p className="key-note clash" data-testid={`keys-clash-${mode}`}>
                    플레이 중 키와 겹침:{' '}
                    {[...clashGroups].map(([names, codes], i) => (
                      <Fragment key={names}>
                        {i > 0 && ', '}
                        <KeyNames names={codes} /> {names}
                      </Fragment>
                    ))}
                    . 이 모드에서는 레인이 먼저 받습니다.
                    {twins.length > 0 && (
                      <>
                        {' '}
                        다른 쪽 키(<KeyNames names={twins.map(keyLabel)} />)와 함께 누르면 레인은 눌리지 않습니다.
                      </>
                    )}
                  </p>
                )}
                {modifiers.length > 0 && (
                  <p className="key-note" data-testid={`keys-note-${mode}`}>
                    {modifiers.map((m) => MODIFIER_NAMES[m]).join('·')} 레인: Windows 고정 키 단축키를 끄세요 (설정 → 접근성 → 키보드).
                    {bothShifts && ' 양쪽 Shift를 함께 누르다 한쪽을 떼면 늦게 떼어질 수 있습니다.'}
                  </p>
                )}
              </div>
            </div>
            {ghostMode === mode && <KeyGhostTest mode={mode} bindings={first} seconds={second} onClose={() => setGhostMode(null)} />}
          </Fragment>
        );
      })}

      <div className="settings-group" data-testid="play-keys">
        <h3>플레이 중 키</h3>
        <div className="play-key-grid">
          {PLAY_ACTIONS.map((action) => {
            const active = capture?.kind === 'play' && capture.action === action;
            const modes = enabledKeyModes.filter((m) => laneKeysFor(settings, m).some((code) => laneTakes(code, playKeys[action])));
            const clash = modes.length > 0 || shared.has(action);
            return (
              <div className="play-key" key={action}>
                <span>{PLAY_ACTION_LABELS[action]}</span>
                <button
                  className={`key-cap${active ? ' active' : ''}${clash ? ' clash' : ''}`}
                  data-testid={`play-key-${action}`}
                  onFocus={() => onHelp('누른 뒤 쓸 키를 입력하세요. Ctrl·Alt·Shift와 함께 누른 키도 됩니다. Esc는 일시정지라 지정할 수 없습니다.')}
                  onClick={() => setCapture(active ? null : { kind: 'play', action })}
                >
                  {active ? '…' : bindingLabel(playKeys[action])}
                </button>
              </div>
            );
          })}
          <div className="play-key">
            <span>일시정지</span>
            <span className="key-cap fixed">Esc</span>
          </div>
        </div>
        <p className="settings-note">
          건너뛰기는 첫 노트가 5초 넘게 남았을 때만 동작해 FEVER와 같은 키를 씁니다. Shift를 누른 채 다른 키를 누르면, Shift와 함께 지정한 기능이 없을 때 그 키의 기능이 동작합니다.
        </p>
        {PLAY_ACTIONS.filter((a) => shared.has(a) || enabledKeyModes.some((m) => laneKeysFor(settings, m).some((code) => laneTakes(code, playKeys[a])))).map((action) => {
          const modes = enabledKeyModes.filter((m) => laneKeysFor(settings, m).some((code) => laneTakes(code, playKeys[action])));
          const others = PLAY_ACTIONS.filter((b) => b !== action && shared.has(b) && playKeys[b] === playKeys[action]);
          return (
            <p className="key-note clash" key={action} data-testid={`play-key-clash-${action}`}>
              {PLAY_ACTION_LABELS[action]} <KeyNames names={[bindingLabel(playKeys[action])]} />: {[modes.length > 0 ? `${modes.join('·')} 레인 키와 겹칩니다 (레인이 먼저 받습니다)` : '', others.length > 0 ? `${others.map((b) => PLAY_ACTION_LABELS[b]).join(', ')}와 같은 키입니다` : ''].filter(Boolean).join(', ')}.
            </p>
          );
        })}
        <div className="row">
          <button className="small" data-testid="play-keys-default" onClick={() => onSettingsChange({ ...settings, playKeys: {} })}>
            기본값
          </button>
        </div>
      </div>
    </>
  );
}

/** A pad control waiting to be pressed: a lane's (`run`: then the next lane's), a play button, or a menu button. */
type PadCapture = { kind: 'lane'; mode: KeyModeId; lane: number; run: boolean } | { kind: 'play'; button: PadPlayButton } | { kind: 'menu'; button: MenuButton };

const PAD_PLAY_LABELS: Record<PadPlayButton, [string, string]> = {
  start: ['Start', '짧게 누르면 일시정지 · 누른 채 레인 1·2로 노트 속도 −/+, 3·4로 노트 등장 위치 −/+'],
  select: ['Select', `Start와 함께 ${RETRY_HOLD_MS / 1000}초 누르면 다시 하기`],
  fever: ['FEVER', '수동 FEVER, 첫 노트가 멀면 인트로 건너뛰기'],
};
const MENU_LABELS: Record<MenuButton, string> = { ok: '결정', back: '취소', up: '위', down: '아래', left: '왼쪽', right: '오른쪽', options: '옵션', retry: '다시 하기' };
const MENU_DIRECTIONS: ReadonlySet<MenuButton> = new Set(['up', 'down', 'left', 'right']);

/**
 * What a capture takes: lanes a button, a turntable, or an axis pushed one way in one jump (a d-pad
 * on axes; a turntable passing the middle is still the turntable); play buttons a button or a
 * stick; menu buttons a button, and for a direction a turntable's turn or an axis pushed in one jump.
 */
function capturable(capture: PadCapture, e: PadEvent): boolean {
  const axis = e.code.startsWith('Pad:A');
  if (capture.kind === 'lane') return isPadCode(e.code) && (!axis || e.jump === true);
  if (capture.kind === 'play') return /^Pad:(B\d+|A\d+[+-])$/.test(e.code);
  if (!MENU_PAD_CODE.test(e.code)) return false;
  return MENU_DIRECTIONS.has(capture.button) ? !axis || e.jump === true : e.code.startsWith('Pad:B');
}

/** The axis a pad code reads (null: a button). */
function axisOf(code: string | null): string | null {
  return (code && /^Pad:(?:A|TT)(\d+)/.exec(code)?.[1]) ?? null;
}

/**
 * Connected controllers, the turntable's sensitivity, a gamepad control per lane (with a check of
 * what the pad sends, under its key mode), the pad's
 * buttons in play, and the menu buttons of a controller without the standard mapping (inferred
 * from its lanes until assigned). A play button on a lane's control is marked: the lane takes it.
 */
function GamepadPanel({
  settings,
  onSettingsChange,
  onHelp,
  onCapture,
}: {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onHelp: (help: string) => void;
  onCapture: (kind: CaptureKind | null) => void;
}) {
  const [pads, setPads] = useState<string[]>([]);
  const [capture, setCapture] = useState<PadCapture | null>(null);
  // the key mode whose input check is open
  const [padTest, setPadTest] = useState<KeyModeId | null>(null);
  const closePadTest = useCallback(() => setPadTest(null), []);
  useEffect(
    () => onCapture(capture !== null ? (capture.kind !== 'lane' ? 'padButton' : capture.run ? 'padRun' : 'pad') : padTest !== null ? 'padTest' : null),
    [capture, padTest, onCapture],
  );
  // both read the pad: binding a control closes the input check
  useEffect(() => {
    if (capture) setPadTest(null);
  }, [capture]);
  useEffect(() => () => onCapture(null), [onCapture]);

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

  // capture: the first control pressed (or a turntable spun) is bound; the menus do not see it
  // (binding B would otherwise also leave the settings as Esc). Esc cancels; Backspace leaves a
  // play or menu button without a control.
  useEffect(() => {
    if (!capture) return;
    const resumeMenus = suspendMenuBridges();
    // one control a capture, though a read may carry several (a d-pad on axes sends many steps at once)
    let done = false;
    // in a run, the controls of the lanes it bound are left alone: a turntable still turning (or
    // passing the middle of its axis) or a button still held is no next lane's
    const earlier = capture.kind === 'lane' && capture.run ? padBindingsFor(settings, capture.mode).slice(0, capture.lane) : [];
    const earlierAxes = new Set(earlier.map(axisOf).filter((a): a is string => a !== null));
    const taken = (code: string) => earlier.includes(code) || earlierAxes.has(axisOf(code) ?? '');
    const bind = (code: string | null) => {
      if (done) return;
      done = true;
      if (capture.kind === 'lane') {
        if (code === null) return;
        const current = [...padBindingsFor(settings, capture.mode)];
        const clash = current.indexOf(code);
        if (clash >= 0) current[clash] = current[capture.lane]; // swap
        current[capture.lane] = code;
        onSettingsChange({ ...settings, padBindings: { ...settings.padBindings, [capture.mode]: current } });
        const last = capture.lane + 1 >= keyModes[capture.mode].lanes.length;
        setCapture(capture.run && !last ? { ...capture, lane: capture.lane + 1 } : null);
      } else if (capture.kind === 'play') {
        onSettingsChange({ ...settings, padPlay: { ...settings.padPlay, [capture.button]: code } });
        setCapture(null);
      } else {
        onSettingsChange({ ...settings, padMenu: { ...settings.padMenu, [capture.button]: code } });
        setCapture(null);
      }
    };
    const poller = new GamepadPoller((e) => e.down && capturable(capture, e) && !taken(e.code) && bind(e.code), {
      intervalMs: 8,
      turntable: { steps: settings.turntableSteps, releaseMs: settings.turntableReleaseMs },
      // a menu direction on a turntable is its turn one way (a d-pad on axes jumps: its push)
      axisStep: capture.kind === 'menu' ? 0.03 : 0,
    });
    poller.start();
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.stopImmediatePropagation(); // cancels the capture, not the settings screen
        setCapture(null);
      } else if ((e.code === 'Backspace' || e.code === 'Delete') && capture.kind !== 'lane') {
        e.preventDefault();
        e.stopImmediatePropagation();
        bind(null);
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => {
      poller.stop();
      window.removeEventListener('keydown', onKey, { capture: true });
      resumeMenus();
    };
  }, [capture, settings, onSettingsChange]);

  const padHelp = '레인을 누른 뒤 패드 버튼을 누르거나 턴테이블을 돌리면 지정됩니다 (Esc 취소). 패드는 화면 프레임과 따로 짧은 간격으로 읽고, 브라우저가 신호를 받은 시각으로 판정합니다.';
  const laneModes = (code: string | null) => (code ? enabledKeyModes.filter((m) => padBindingsFor(settings, m).includes(code)) : []);
  const playButtons = padPlayOf(settings);
  const menu = padMenuFor(settings);
  const row = { onHelp };
  return (
    <div data-testid="gamepad-settings">
      <p className="settings-status" data-testid="gamepad-status">
        {pads.length > 0 ? `연결됨: ${pads.join(', ')}` : '연결된 패드가 없습니다. 패드의 버튼을 하나 누르면 나타납니다.'}
      </p>
      <NumberOption
        {...row}
        label="턴테이블 감도"
        testId="opt-tt-steps"
        value={settings.turntableSteps}
        min={1}
        max={TURNTABLE_STEPS_MAX}
        step={1}
        bigStep={1}
        format={(v) => `${v}칸`}
        onChange={(v) => onSettingsChange({ ...settings, turntableSteps: v })}
        help="멈춰 있던 턴테이블이 이만큼(축 한 칸 단위) 돌면 스크래치로 칩니다. 1칸이 가장 예민하고, 손대지 않아도 스크래치가 들어가는 기기는 2–3칸으로 올리세요."
      />
      <NumberOption
        {...row}
        label="턴테이블 정지 판정"
        testId="opt-tt-release"
        value={settings.turntableReleaseMs}
        min={TURNTABLE_RELEASE_MIN}
        max={TURNTABLE_RELEASE_MAX}
        step={10}
        bigStep={50}
        format={(v) => `${v}ms`}
        onChange={(v) => onSettingsChange({ ...settings, turntableReleaseMs: v })}
        help="턴테이블이 이 시간 동안 멈춰 있으면 스크래치를 뗍니다. 짧으면 천천히 돌릴 때 끊기고, 길면 같은 방향의 다음 스크래치가 앞의 것에 이어집니다."
      />
      {enabledKeyModes.map((mode) => {
        const running = capture?.kind === 'lane' && capture.mode === mode && capture.run;
        return (
          <Fragment key={mode}>
            <div className="opt opt-block">
              <span className="opt-name">{mode}</span>
              <div className="opt-keys">
                <div className="keys">
                  {padBindingsFor(settings, mode).map((code, lane) => {
                    const active = capture?.kind === 'lane' && capture.mode === mode && capture.lane === lane;
                    return (
                      <button
                        key={lane}
                        className={`key-cap pad-cap lane-${keyModes[mode].lanes[lane].color}${active ? ' active' : ''}${code ? '' : ' empty'}`}
                        data-testid={`pad-${mode}-${lane}`}
                        data-nav-line={`pad-${mode}`}
                        data-lane={lane}
                        title={code ? padCodeLabel(code) : '지정 안 됨'}
                        onFocus={() => onHelp(padHelp)}
                        onClick={() => setCapture(active ? null : { kind: 'lane', mode, lane, run: false })}
                      >
                        {active ? '…' : code ? padCodeLabel(code) : ''}
                      </button>
                    );
                  })}
                </div>
                <div className="opt-actions">
                  <button
                    className="small"
                    data-testid={`pad-run-${mode}`}
                    onFocus={() => onHelp('1번 레인부터 차례로 버튼을 누르거나 턴테이블을 돌리면 한 칸씩 넘어가며 지정합니다. Esc로 멈춥니다.')}
                    onClick={() => setCapture(running ? null : { kind: 'lane', mode, lane: 0, run: true })}
                  >
                    {running ? '멈추기' : '차례로 지정'}
                  </button>
                  <button className="small" onClick={() => onSettingsChange({ ...settings, padBindings: { ...settings.padBindings, [mode]: undefined } })}>
                    지우기
                  </button>
                  <button
                    className="small"
                    data-testid={`pad-test-${mode}`}
                    onFocus={() =>
                      onHelp('패드 버튼과 턴테이블이 들어오는지 봅니다. 누른 레인이 켜지고, 턴테이블은 스크래치 횟수와 도는 방향이 나옵니다. Esc나 패드의 Start를 길게 눌러 닫습니다.')
                    }
                    onClick={() => {
                      setCapture(null);
                      setPadTest(padTest === mode ? null : mode);
                    }}
                  >
                    {padTest === mode ? '입력 확인 닫기' : '입력 확인'}
                  </button>
                </div>
              </div>
            </div>
            {padTest === mode && (
              <PadInputTest
                mode={mode}
                lanes={padBindingsFor(settings, mode)}
                // with no Start for play the pad's own Start still closes it, as the hint bar says
                start={playButtons.start ?? DEFAULT_PAD_PLAY.start}
                turntable={{ steps: settings.turntableSteps, releaseMs: settings.turntableReleaseMs }}
                onClose={closePadTest}
              />
            )}
          </Fragment>
        );
      })}

      <div className="settings-group" data-testid="pad-play">
        <h3>플레이 중 버튼</h3>
        {PAD_PLAY_BUTTONS.map((button) => {
          const code = playButtons[button];
          const active = capture?.kind === 'play' && capture.button === button;
          const modes = laneModes(code);
          // two play buttons on one control: the first of Start, Select, FEVER takes it
          const same = PAD_PLAY_BUTTONS.filter((b) => b !== button && code !== null && playButtons[b] === code);
          const clash = modes.length > 0 || same.length > 0;
          return (
            <div className="pad-row" key={button}>
              <span className="pad-row-name">{PAD_PLAY_LABELS[button][0]}</span>
              <button
                className={`key-cap pad-cap${active ? ' active' : ''}${clash ? ' clash' : ''}${code ? '' : ' empty'}`}
                data-testid={`pad-play-${button}`}
                title={code ? undefined : '지정 안 됨'}
                onFocus={() => onHelp('누른 뒤 패드 버튼을 누르면 지정됩니다 (Esc 취소, Backspace 비우기).')}
                onClick={() => setCapture(active ? null : { kind: 'play', button })}
              >
                {active ? '…' : code ? padCodeLabel(code) : ''}
              </button>
              <span className={`pad-row-note${clash ? ' clash' : ''}`} data-testid={`pad-play-note-${button}`}>
                {modes.length > 0
                  ? `${modes.join('·')} 레인과 겹침: 그 모드에서는 레인이 먼저 받습니다`
                  : same.length > 0
                    ? `${same.map((b) => PAD_PLAY_LABELS[b][0]).join('·')}와 같은 버튼입니다`
                    : PAD_PLAY_LABELS[button][1]}
              </span>
            </div>
          );
        })}
        <div className="row">
          <button className="small" data-testid="pad-play-default" onClick={() => onSettingsChange({ ...settings, padPlay: {} })}>
            기본값
          </button>
        </div>
      </div>

      <div className="settings-group" data-testid="pad-menu">
        <h3>메뉴 버튼 (표준 배치가 아닌 패드)</h3>
        <p className="settings-note">
          전용 컨트롤러처럼 표준 배치가 아닌 패드는 아래 버튼으로 메뉴를 다닙니다. 지정하지 않은 칸은 레인 지정에서 정합니다(건반 1·2 결정·취소, 3·4 왼쪽·오른쪽, 턴테이블 위·아래; 레인이 없으면 버튼 0·1이 결정·취소). 턴테이블은 돌린 만큼 한 칸씩, 축으로 오는 십자키는 누르는 동안 움직입니다. 선곡에서는 옵션 버튼이 플레이 옵션을 열고, 그 탭은 첫 줄에서 위로 올라가 왼쪽·오른쪽으로 바꿉니다. 다시 하기 버튼은 결과와 일시정지 메뉴에서 R처럼 다시 합니다.
        </p>
        <div className="play-key-grid">
          {MENU_BUTTONS.map((button) => {
            const code = menu[button];
            const active = capture?.kind === 'menu' && capture.button === button;
            const inferred = settings.padMenu[button] === undefined;
            return (
              <div className="play-key" key={button}>
                <span>{MENU_LABELS[button]}</span>
                <button
                  className={`key-cap pad-cap${active ? ' active' : ''}${inferred ? ' inferred' : ''}${code ? '' : ' empty'}`}
                  data-testid={`pad-menu-${button}`}
                  title={code ? (inferred ? '레인 지정에서 정함' : undefined) : '지정 안 됨'}
                  onFocus={() =>
                    onHelp(
                      MENU_DIRECTIONS.has(button)
                        ? '누른 뒤 버튼이나 십자키를 누르거나 턴테이블을 한쪽으로 돌리면 지정됩니다 (Esc 취소, Backspace 비우기).'
                        : '누른 뒤 버튼을 누르면 지정됩니다 (Esc 취소, Backspace 비우기).',
                    )
                  }
                  onClick={() => setCapture(active ? null : { kind: 'menu', button })}
                >
                  {active ? '…' : code ? padCodeLabel(code) : ''}
                </button>
              </div>
            );
          })}
        </div>
        <div className="row">
          <button className="small" data-testid="pad-menu-default" onClick={() => onSettingsChange({ ...settings, padMenu: {} })}>
            레인에서 정하기
          </button>
        </div>
      </div>
      <p className="settings-note">
        표준 배치 패드는 메뉴에서 십자키·왼쪽 스틱이 방향키, A·Start가 Enter, B가 Esc, Y가 Tab, LB·RB가 설정 탭 이동으로 동작합니다. 선곡에서는 X가 플레이 옵션, LT가 곡 정보·도구, RT가 설정, LB·RB가 목록 한 화면(플레이 옵션에서는 탭)이고, 결과에서는 X가 다시 하기입니다.
      </p>
    </div>
  );
}

const MAPPER_STATE: Record<MapperStatus['state'], string> = {
  disabled: '꺼짐',
  unsupported: 'NVIDIA GPU 없음',
  missing: '설치 안 됨',
  installing: '설치 중',
  failed: '설치 실패',
  ready: '사용 중',
};

/**
 * Mapperatorinator, this branch's chart generator (docs/MAPPERATORINATOR.md): whether it makes the
 * charts here, and its setup (its own Python with CUDA PyTorch and the model, a few GB, downloaded
 * once). Without an NVIDIA GPU, or before it is set up, charts come from the built-in generator.
 */
function MapperGroup({ onHelp }: { onHelp: (help: string) => void }) {
  const [status, setStatus] = useState<MapperStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = () => {
      api
        .mapper()
        .then((m) => {
          if (!alive) return;
          setStatus(m);
          if (m.state === 'installing') timer = setTimeout(poll, 2000);
        })
        .catch(() => alive && setStatus(null));
    };
    poll();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [status?.state === 'installing']);
  const install = () => {
    setError(null);
    api
      .installMapper()
      .then(setStatus)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };
  if (status === null) return null;
  const gpu = status.runtime?.gpu ?? status.gpus[0]?.name ?? null;
  const progress = status.progress ? `${status.progress.step} (${Math.round(status.progress.fraction * 100)}%)` : null;
  return (
    <div className="settings-group" data-testid="mapper-status">
      <h3>AI 채보 (Mapperatorinator)</h3>
      <p className="settings-note">
        이 빌드는 채보를 Mapperatorinator(osu! 랭크 맵으로 학습한 AI)로 만듭니다. NVIDIA GPU가 있는 PC에서 한 번 설치하면(PyTorch CUDA와
        모델, 약 4GB) 채보를 열 때마다 GPU로 만듭니다(곡 길이에 따라 1–3분). 설치 전이나 NVIDIA GPU가 없는 PC에서는 기존 생성기로 만듭니다.
      </p>
      <table className="backend-table">
        <tbody>
          <tr>
            <td>상태</td>
            <td className={status.state === 'ready' ? 'ok' : 'off'}>
              {MAPPER_STATE[status.state]}
              {progress ? ` · ${progress}` : ''}
            </td>
          </tr>
          <tr>
            <td>GPU</td>
            <td>{gpu ? `${gpu}${status.runtime?.device === 'cpu' ? ' (CPU로 실행)' : ''}` : '찾지 못함'}</td>
          </tr>
          <tr>
            <td>모델</td>
            <td>{status.model}</td>
          </tr>
        </tbody>
      </table>
      {status.reason && <p className="settings-note">{status.reason}</p>}
      {(status.error || error) && <p className="settings-note">설치 오류: {status.error ?? error} (자세한 기록: {status.home}\setup.log)</p>}
      {status.lastError && (
        <p className="settings-note">
          마지막 실패({status.lastError.chart}): {status.lastError.error} — 그 채보는 기존 생성기로 만들었습니다.
        </p>
      )}
      {(status.state === 'missing' || status.state === 'failed' || status.state === 'ready') && (
        <div className="row">
          <button type="button" data-testid="mapper-install" onClick={install}>
            {status.state === 'ready' ? '다시 설치' : status.state === 'failed' ? '다시 시도' : '설치 (약 4GB 내려받기)'}
          </button>
        </div>
      )}
      {status.settings && status.state !== 'unsupported' && (
        <MapperSettingsRows settings={status.settings} autoPrecision={autoPrecision(status)} onHelp={onHelp} onSaved={setStatus} onError={setError} />
      )}
    </div>
  );
}

/** What precision "자동" comes to on the installed runtime's device (Mapperatorinator picks bf16, or fp32 where the GPU has no native bf16); null before the install. */
export function autoPrecision(status: MapperStatus): string | null {
  const rt = status.runtime;
  if (!rt) return null;
  if (rt.device !== 'cuda') return 'fp32';
  const bf16 = rt.bf16 ?? (rt.capability ? rt.capability[0] >= 8 : null);
  return bf16 === null ? null : bf16 ? 'bf16' : 'fp32';
}

/**
 * Mapperatorinator's settings (the server keeps them in its runtime folder: a new install of the
 * app keeps them). A chart already made stays as it was; the ones made from now on follow them.
 */
function MapperSettingsRows({
  settings,
  autoPrecision: auto,
  onHelp,
  onSaved,
  onError,
}: {
  settings: MapperSettings;
  autoPrecision: string | null;
  onHelp: (help: string) => void;
  onSaved: (s: MapperStatus) => void;
  onError: (e: string | null) => void;
}) {
  const [shown, setShown] = useState(settings);
  useEffect(() => setShown(settings), [settings]);
  const change = <K extends keyof MapperSettings>(key: K, value: MapperSettings[K]) => {
    setShown((s) => ({ ...s, [key]: value }));
    onError(null);
    api
      .mapperSettings({ [key]: value } as Partial<MapperSettings>)
      .then(onSaved)
      .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)));
  };
  const remade = ' 바꾸면 이제부터 만드는 채보에 적용됩니다(이미 만든 채보는 그대로 남고, 다시 열면 새로 만듭니다).';
  return (
    <div className="mapper-settings" data-testid="mapper-settings">
      <Toggle
        onHelp={onHelp}
        label="AI 채보 쓰기"
        testId="mapper-enabled"
        value={shown.enabled}
        onChange={(v) => change('enabled', v)}
        help="끄면 Mapperatorinator를 쓰지 않고 기존 생성기로 채보를 만듭니다. 설치한 실행 환경은 그대로 남습니다."
      />
      <Choice
        onHelp={onHelp}
        label="모델"
        testId="mapper-model"
        value={shown.model}
        options={
          [
            ['v32', 'v32 (기본)'],
            ['v32-mini', 'v32-mini (작고 빠름)'],
          ] as [MapperSettings['model'], string][]
        }
        onChange={(v) => change('model', v)}
        help={`v32-mini는 v32보다 작아 빠르고 GPU 메모리를 덜 쓰지만 채보 품질이 낮을 수 있습니다. 처음 쓸 때 가중치(약 0.2GB)를 한 번 더 내려받습니다.${remade}`}
      />
      <Choice
        onHelp={onHelp}
        label="연산 정밀도"
        testId="mapper-precision"
        value={shown.precision}
        options={
          [
            ['auto', auto ? `자동 (${auto})` : '자동'],
            ['fp16', 'fp16 (빠름, 인코더는 fp32)'],
            ['fp32', 'fp32'],
          ] as [MapperSettings['precision'], string][]
        }
        onChange={(v) => change('precision', v)}
        help={`자동은 GPU가 bf16을 지원하면 bf16, 아니면 fp32입니다${auto ? ` (이 PC에서는 ${auto})` : ''}. fp16은 RTX 20xx에서 몇 배 빠르지만, 이 모델은 bf16으로 학습되어 fp16으로는 수가 넘칠 수 있습니다. 그래서 fp16을 고르면 음악을 읽는 인코더는 fp32로 돌고 노트를 쓰는 디코더만 fp16으로 돕니다(시간은 거의 디코더가 씁니다). 이전 빌드의 fp16은 곡의 큰 소리 구간에서 채보가 망가졌습니다. fp16 채보가 이상하면 fp32로 두세요. 실패하면 그 채보는 기존 생성기로 만듭니다.`}
      />
      <NumberOption
        onHelp={onHelp}
        label="난이도 배율"
        testId="mapper-stars"
        value={shown.starsScale}
        min={0.5}
        max={2}
        step={0.05}
        bigStep={0.25}
        format={(v) => `×${v.toFixed(2)}`}
        onChange={(v) => change('starsScale', v)}
        help={`티어마다 Mapperatorinator에 요청하는 osu! 별점에 곱합니다. 채보가 티어보다 쉽게 나오면 1보다 크게, 어렵게 나오면 작게 하세요. 화면의 레벨은 만들어진 노트를 앱이 잰 값입니다.${remade}`}
      />
      <OptionalNumberOption
        onHelp={onHelp}
        label="롱노트 비율"
        testId="mapper-holds"
        value={shown.holdNoteRatio}
        min={0}
        max={1}
        step={0.05}
        bigStep={0.2}
        auto={0.2}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => change('holdNoteRatio', v)}
        help={`전체 노트 가운데 롱노트의 비율을 요청합니다. 자동이면 모델이 곡에 맞게 정합니다.${remade}`}
      />
      <OptionalNumberOption
        onHelp={onHelp}
        label="다양성"
        testId="mapper-temperature"
        value={shown.temperature}
        min={0.3}
        max={1.5}
        step={0.05}
        bigStep={0.2}
        auto={0.9}
        format={(v) => v.toFixed(2)}
        onChange={(v) => change('temperature', v)}
        help={`모델이 노트를 고를 때의 무작위성(temperature)입니다. 높이면 패턴이 다양해지고 낮추면 무난해집니다. 자동은 모델 기본값(v32: 0.9)입니다.${remade}`}
      />
      <Toggle
        onHelp={onHelp}
        label="앱의 박자 쓰기"
        testId="mapper-timing"
        value={shown.useAppTiming}
        onChange={(v) => change('useAppTiming', v)}
        help={`켜면 앱 분석기의 BPM · 마디선을 모델에 넘겨, 노트가 앱의 마디선에 맞고 빨리 만들어집니다. 끄면 모델이 박자를 직접 찾습니다(느리고, 마디선과 어긋날 수 있음).${remade}`}
      />
      <Toggle
        onHelp={onHelp}
        label="히트사운드 생성"
        testId="mapper-hitsounds"
        value={shown.hitsounds}
        onChange={(v) => change('hitsounds', v)}
        help={`모델이 노트마다 히트사운드 · 볼륨 토큰도 만듭니다(노트 하나의 토큰 5개 중 2개). 앱은 히트사운드를 쓰지 않으므로 끄면 그만큼 빨라집니다. 대신 모델이 '히트사운드 없는 맵'처럼 채보를 만들어 패턴이 조금 달라질 수 있습니다.${remade}`}
      />
      <NumberOption
        onHelp={onHelp}
        label="이전 문맥"
        testId="mapper-lookback"
        value={shown.lookback}
        min={0.3}
        max={0.8}
        step={0.1}
        bigStep={0.2}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => change('lookback', v)}
        help={`16.4초 창의 앞부분 얼마를 이미 만든 노트(문맥)로 채울지입니다. 앞 미리보기와 합쳐 90%까지이고, 나머지만큼 창이 앞으로 나아가므로 둘을 줄이면 창 수가 줄어 빨라집니다. 50% 아래로 내리면 8초가 넘는 롱노트가 창 경계에서 끊길 수 있습니다.${remade}`}
      />
      <NumberOption
        onHelp={onHelp}
        label="앞 미리보기"
        testId="mapper-lookahead"
        value={shown.lookahead}
        min={0}
        max={0.6}
        step={0.1}
        bigStep={0.2}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => change('lookahead', v)}
        help={`창의 뒷부분 얼마를 노트 없이 '다음에 올 음악'으로만 보여 줄지입니다. 줄이면 창이 더 나아가 빨라지지만, 모델이 앞을 덜 보고 노트를 놓습니다.${remade}`}
      />
      <Toggle
        onHelp={onHelp}
        label="병렬 생성"
        testId="mapper-parallel"
        value={shown.parallel}
        onChange={(v) => change('parallel', v)}
        help={`창들을 서로 독립적으로, 8개씩 묶어 GPU에서 한꺼번에 만듭니다. 몇 배 빠르지만 창 사이에 문맥이 없어 16초마다 패턴이 끊길 수 있고, GPU 메모리를 더 씁니다(모자라면 그 채보는 기존 생성기로). 켜면 이전 문맥 · 앞 미리보기는 쓰이지 않습니다.${remade}`}
      />
    </div>
  );
}

/**
 * The window or full screen, the analysis backends (with how to install them), and a full reset: a
 * press arms it, a second within TWO_PRESS_MS resets (useTwoPress), and 되돌리기 brings the settings back.
 */
function AdvancedPanel({
  settings,
  onSettingsChange,
  onHelp,
  undo,
  onReset,
  onUndo,
}: {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onHelp: (help: string) => void;
  /** A reset can be undone. */
  undo: boolean;
  onReset: () => void;
  onUndo: () => void;
}) {
  const [backends, setBackends] = useState<BackendStatus[] | null>(null);
  const reset = useTwoPress(onReset);
  // the undo gone (pressed, or its time up) with the focus on it: the focus goes back to the reset
  const resetButton = useRef<HTMLButtonElement>(null);
  const hadUndo = useRef(undo);
  useEffect(() => {
    if (hadUndo.current && !undo && (document.activeElement === null || document.activeElement === document.body)) resetButton.current?.focus();
    hadUndo.current = undo;
  }, [undo]);
  useEffect(() => {
    api
      .health()
      .then((h) => setBackends(h.backends ?? []))
      .catch(() => setBackends(null));
  }, []);
  const desktop = desktopShell() !== null;
  return (
    <>
      <Choice
        onHelp={onHelp}
        label="화면 모드"
        testId="opt-display-mode"
        value={settings.displayMode}
        options={
          [
            ['window', '창'],
            ['fullscreen', '전체 화면'],
          ] as [DisplayMode, string][]
        }
        onChange={(m) => onSettingsChange({ ...settings, displayMode: m })}
        help={
          desktop
            ? '전체 화면은 작업 표시줄과 창 테두리 없이 게임만 보여 줍니다. 앱은 창의 크기·위치와 함께 기억하고, F11로도 바꿀 수 있습니다.'
            : `전체 화면은 브라우저 테두리 없이 게임만 보여 줍니다. ${heldEscLeaves() ? '나가려면 Esc를 길게 누르세요' : 'Esc를 누르면 나갑니다'} (F11은 브라우저의 전체 화면입니다).`
        }
      />
      <MapperGroup onHelp={onHelp} />
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
          {'.venv/bin/pip install -e ".[ml]"     # demucs · beat-this (+ basic-pitch: Python 3.11)\n'}
          {'# Windows: .venv/bin/pip 대신 .venv\\Scripts\\pip'}
        </pre>
      </div>

      <div className="settings-group" data-testid="reset-settings">
        <h3>초기화</h3>
        <div className="row">
          <button
            ref={resetButton}
            className="danger"
            data-testid="reset-all"
            {...reset.buttonProps}
            onFocus={() =>
              onHelp('모든 설정을 처음 값으로 되돌립니다. 즐겨찾기와 곡마다 정한 것(패턴, 고른 채보, 곡 오프셋), 내 노트 색 프리셋, 기록과 곡은 그대로입니다. 3초 안에 두 번 누르면 초기화하고, 바로 되돌릴 수 있습니다.')
            }
            onClick={reset.press}
          >
            {reset.armed ? '한 번 더 누르면 초기화' : '모두 초기화'}
          </button>
          {undo && (
            <>
              <span className="settings-status" role="status" data-testid="reset-done">
                처음 값으로 되돌렸습니다.
              </span>
              <button className="small" data-testid="reset-undo" onClick={onUndo}>
                되돌리기
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
