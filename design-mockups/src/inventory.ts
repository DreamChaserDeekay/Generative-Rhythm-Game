import { cameraConfig, gaugeTypeIds, keyModes } from '@game/engine/config';
import type { KeyModeId } from '@game/engine/types';
import { BUILTIN_PRESETS, fromHsv, hexString, isUserPreset, lanesOf, newPreset, presetById, toHsv, withLaneColor } from '@game/render/noteColors';
import { GEAR_STYLES } from '@game/render/deckArt';
import { HIT_STYLES, NOTE_STYLES, SIDE_STYLES } from '@game/render/tintArt';
import { laneColorsOf, skinOf, type Settings } from '@game/settings/settings';
import health from '../_src/health.json';
import raw from '../_src/settings-inventory.json';
import { state } from './state';

/**
 * The settings and play options as they are in the game today (design-mockups/_src/settings-inventory.json,
 * read out of client/src/ui): every tab, every row, its values, range and help text. The mockup only
 * changes how they look. Rows the track can show are tied to the game's real settings object.
 */
export type RowKind = 'number' | 'choice' | 'switch' | 'action' | 'keybind' | 'color' | 'info' | 'custom';
export interface Row {
  label: string;
  kind: RowKind;
  help: string;
  values: string[];
  min: number;
  max: number;
  step: number;
  bigStep: number;
  /** Numbers that can be left to the generator ("자동"). */
  auto?: boolean;
  wraps?: boolean;
  format: (v: number) => string;
  /** The row's value now: an index (choice), a number, 0/1 (switch); null = 자동. */
  value: number | null;
  initial: number | null;
  /** Keys of a keybind row (one per lane), the lanes' second keys under them, and each lane's colour. */
  caps?: string[];
  caps2?: string[];
  capColors?: string[];
  /** A warning the game shows under the row (keys that clash with the play's own). */
  warn?: string;
  heading?: string;
  /** Sets the game's settings (rows the track shows at once). */
  bind?: (v: number) => Partial<Settings>;
  /** Shown only while this holds. */
  when?: () => boolean;
  /** A danger button's second press, a capture, a test box: what Enter does. */
  press?: string;
  /** A block that is only read (the song's chart information): drawn as it is, never picked. */
  html?: string;
  skip?: boolean;
}
export interface Tab {
  id: string;
  label: string;
  intro: string;
  defaultHelp: string;
  rows: Row[];
  /** Brings rows that follow the settings up to date before they are drawn (the note colours, the lanes' colours). */
  sync?: () => void;
}

interface RawRow {
  label: string;
  kind: RowKind;
  values?: string[];
  min?: number;
  max?: number;
  step?: number;
  bigStep?: number;
  default?: string | null;
  help?: string;
  tab?: string;
}
interface RawTab {
  id: string;
  label: string;
  intro?: string;
  defaultHelp?: string;
  rows: RawRow[];
  sections?: { heading: string | null; rows: string[] }[];
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const signedMs = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}ms`;
const offOrPct = (v: number) => (v === 0 ? '끔' : pct(v));
const FORMATS: Record<string, (v: number) => string> = {
  '노트 속도': (v) => v.toFixed(2),
  '노트 등장 위치': (v) => `${(v * 100).toFixed(1)}%`,
  '노트 사라짐 위치': (v) => `${(v * 100).toFixed(1)}%`,
  '판정선 위치': (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v * 100))}%`,
  '판정 오프셋': signedMs,
  '표시 오프셋': signedMs,
  '레인 폭': pct,
  '키 빔 길이': offOrPct,
  '카메라 연출': offOrPct,
  '배경 밝기': pct,
  음악: pct,
  효과음: pct,
  색상: (v) => `${Math.round(v)}°`,
  채도: (v) => `${Math.round(v)}%`,
  밝기: (v) => `${Math.round(v)}%`,
  '턴테이블 감도': (v) => `${v}칸`,
  '턴테이블 정지 판정': (v) => `${v}ms`,
  '재생 속도': (v) => `×${v.toFixed(2)}`,
  '악기별 레인': offOrPct,
  밀도: (v) => `×${v.toFixed(2)}`,
  '롱노트 비율': pct,
  '최대 동시 노트': (v) => `${v}개`,
  '스크래치 비율 / 사이드 비율': pct,
  '목표 레벨': (v) => `Lv.${v}`,
};
/** Ranges of the rows the generator can decide itself (client/src/ui/PlayOptions.tsx, config/difficulty.json). */
const AUTO: Record<string, [min: number, max: number, step: number, big: number]> = {
  '목표 레벨': [1, 15, 1, 1],
  밀도: [0.5, 1.5, 0.05, 0.25],
  '롱노트 비율': [0, 0.5, 0.01, 0.05],
  '최대 동시 노트': [1, 6, 1, 1],
  '스크래치 비율 / 사이드 비율': [0, 0.2, 0.01, 0.05],
};
const cameraIds = Object.keys(cameraConfig.presets);
const PLACEMENTS = ['OFF', 'MIRROR', 'RANDOM', 'R-RANDOM', 'S-RANDOM', 'H-RANDOM'];
const part = (key: 'deck' | 'note' | 'side' | 'hit', list: readonly string[]) => (v: number) => ({ parts: { ...state.settings.parts, [key]: list[v] } }) as Partial<Settings>;
const BINDS: Record<string, { get: (s: Settings) => number; bind: (v: number) => Partial<Settings> }> = {
  '노트 속도': { get: (s) => s.hiSpeed, bind: (v) => ({ hiSpeed: v }) },
  '노트 등장 위치': { get: (s) => s.sudden, bind: (v) => ({ sudden: v }) },
  '노트 사라짐 위치': { get: (s) => s.hidden, bind: (v) => ({ hidden: v }) },
  '판정선 위치': { get: (s) => s.judgeLinePosition, bind: (v) => ({ judgeLinePosition: v }) },
  '커버 사용': { get: (s) => (s.coversOn ? 0 : 1), bind: (v) => ({ coversOn: v === 0 }) },
  기어: { get: (s) => GEAR_STYLES.indexOf(s.parts.deck), bind: part('deck', GEAR_STYLES) },
  '타격 효과': { get: (s) => HIT_STYLES.indexOf(s.parts.hit), bind: part('hit', HIT_STYLES) },
  노트: { get: (s) => NOTE_STYLES.indexOf(s.parts.note), bind: part('note', NOTE_STYLES) },
  '사이드 노트': { get: (s) => SIDE_STYLES.indexOf(s.parts.side), bind: part('side', SIDE_STYLES) },
  카메라: { get: (s) => cameraIds.indexOf(s.cameraPreset), bind: (v) => ({ cameraPreset: cameraIds[v] }) as Partial<Settings> },
  '레인 폭': { get: (s) => s.laneWidthScale, bind: (v) => ({ laneWidthScale: v }) },
  '키 빔 길이': { get: (s) => s.keyBeamLength, bind: (v) => ({ keyBeamLength: v }) },
  마디선: { get: (s) => (s.barLines ? 0 : 1), bind: (v) => ({ barLines: v === 0 }) },
  '판정·콤보 글꼴': { get: (s) => (s.hudType === 'gear' ? 0 : 1), bind: (v) => ({ hudType: v === 0 ? 'gear' : 'skin' }) },
  '타격 효과 크기': { get: (s) => ['large', 'normal', 'small', 'off'].indexOf(s.hitEffectSize), bind: (v) => ({ hitEffectSize: (['large', 'normal', 'small', 'off'] as const)[v] }) },
  '번쩍임 줄이기': { get: (s) => (s.reducedFlash ? 0 : 1), bind: (v) => ({ reducedFlash: v === 0 }) },
  '카메라 연출': { get: (s) => s.cameraFx, bind: (v) => ({ cameraFx: v }) },
  게이지: { get: (s) => gaugeTypeIds.indexOf(s.gaugeType), bind: (v) => ({ gaugeType: gaugeTypeIds[v] }) },
  배치: { get: (s) => PLACEMENTS.indexOf(s.placement), bind: (v) => ({ placement: PLACEMENTS[v] }) as Partial<Settings> },
  FEVER: { get: (s) => ['AUTO', 'MANUAL', 'OFF'].indexOf(s.fever), bind: (v) => ({ fever: (['AUTO', 'MANUAL', 'OFF'] as const)[v] }) },
  판정: { get: (s) => ['NORMAL', 'HARD', 'MAX'].indexOf(s.judgementMode), bind: (v) => ({ judgementMode: ['NORMAL', 'HARD', 'MAX'][v] }) as Partial<Settings> },
  '판정 ms 오차 표시': { get: (s) => (s.showErrorMs ? 0 : 1), bind: (v) => ({ showErrorMs: v === 0 }) },
  '판정 오차 막대': { get: (s) => (s.errorBar ? 0 : 1), bind: (v) => ({ errorBar: v === 0 }) },
  '판정 카운터': { get: (s) => (s.judgeCounter ? 0 : 1), bind: (v) => ({ judgeCounter: v === 0 }) },
  '판정 표시 위치': { get: (s) => ['low', 'mid', 'high'].indexOf(s.judgePosition), bind: (v) => ({ judgePosition: (['low', 'mid', 'high'] as const)[v] }) },
  '판정·콤보 불투명도': { get: (s) => [1, 0.7, 0.4].indexOf(s.judgementOpacity), bind: (v) => ({ judgementOpacity: [1, 0.7, 0.4][v] }) },
  음악: { get: (s) => s.musicVolume, bind: (v) => ({ musicVolume: v }) },
  효과음: { get: (s) => s.sfxVolume, bind: (v) => ({ sfxVolume: v }) },
  타격음: { get: (s) => (s.hitSound ? 0 : 1), bind: (v) => ({ hitSound: v === 0 }) },
  '오토 플레이': { get: () => (state.autoPlay ? 0 : 1), bind: (v) => ((state.autoPlay = v === 0), {}) },
};

const MODE_IDS = Object.keys(keyModes) as KeyModeId[];
const BACKEND_KINDS: Record<string, string> = { stems: '스템 분리', beats: '비트·다운비트', pitch: '음높이·음 길이', structure: '곡 구조' };

/** A key mode's lanes by their short names: S the scratch, L and R the side lanes, the keys numbered from 1. */
function laneNames(mode: KeyModeId): string[] {
  let key = 0;
  let side = 0;
  return keyModes[mode].lanes.map((l) => (l.kind === 'scratch' ? 'S' : l.kind === 'side' ? (side++ === 0 ? 'L' : 'R') : String(++key)));
}
const laneHex = (mode: KeyModeId) => laneColorsOf(state.settings, mode).map(hexString);

/** 노트: the preset, the lane picked and its colour are the game's real note colours, so the track shows each change. */
function wireNotes(tab: Tab): void {
  const by = (l: string) => tab.rows.find((r) => r.label === l) as Row;
  const [preset, modeRow, lane, hue, sat, val] = ['프리셋', '키 모드', '레인', '색상', '채도', '밝기'].map(by);
  const mode = () => MODE_IDS[modeRow.value ?? 0];
  const ids = () => ['skin', ...BUILTIN_PRESETS.map((p) => p.id), ...state.settings.colorPresets.map((p) => p.id)];
  lane.kind = 'custom';
  tab.sync = () => {
    const s = state.settings;
    preset.values = ['기본', ...BUILTIN_PRESETS.map((p) => p.name), ...s.colorPresets.map((p) => p.name)];
    preset.value = Math.max(0, ids().indexOf(s.noteColors));
    modeRow.value = Math.max(0, MODE_IDS.indexOf(state.mode));
    const colours = laneHex(mode());
    lane.caps = laneNames(mode());
    lane.capColors = colours;
    lane.value = Math.min(lane.value ?? 0, colours.length - 1);
    const now = toHsv(colours[lane.value]);
    [hue.value, sat.value, val.value] = [now.h, now.s, now.v];
  };
  tab.sync();
  for (const r of [preset, modeRow, lane, hue, sat, val]) r.initial = r.value;
  preset.bind = (v) => ({ noteColors: ids()[v] });
  modeRow.bind = (v) => {
    state.mode = MODE_IDS[v];
    return { lastKeyMode: MODE_IDS[v] };
  };
  // a colour changed on 기본 or a built-in preset starts a preset of the player's own ("내 색 1"), as in the game
  const paint = (): Partial<Settings> => {
    const s = state.settings;
    const own = s.colorPresets;
    let target = presetById(s.noteColors, own);
    let presets = own;
    if (!target || !isUserPreset(target.id)) {
      target = newPreset(own, lanesOf(skinOf(s), s.noteColors, own));
      presets = [...own, target];
    }
    const edited = withLaneColor(target, mode(), lane.value ?? 0, fromHsv({ h: hue.value ?? 0, s: sat.value ?? 0, v: val.value ?? 0 }));
    return { noteColors: edited.id, colorPresets: presets.map((p) => (p.id === edited.id ? edited : p)) };
  };
  hue.bind = sat.bind = val.bind = paint;
}

/** 키 설정: each mode's keys under its lanes' colours, the second keys under them, and what the game warns about. */
function wireKeys(tab: Tab): void {
  const modes = tab.rows.filter((r) => MODE_IDS.includes(r.label as KeyModeId));
  for (const r of modes) {
    r.caps2 = (r.caps ?? []).map(() => '');
    if ((r.caps ?? []).some((c) => c.includes('Shift')))
      r.warn = '플레이 중 키와 겹침: L-Shift · R-Shift는 노트 속도 −0.5 · 노트 속도 +0.5 · 곡 오프셋 −5ms · 곡 오프셋 +5ms에도 쓰입니다. 이 모드에서는 레인이 먼저 받습니다. Shift 레인: Windows 고정 키 단축키를 끄세요 (설정 → 접근성 → 키보드).';
  }
  tab.sync = () => {
    for (const r of modes) r.capColors = laneHex(r.label as KeyModeId);
  };
  tab.sync();
}

/** 고급: the analysis backends as the server reports them (GET /api/health when the sample songs were analysed). */
function backendBlock(): string {
  const rows = (health as { backends: { kind: string; name: string; installed: boolean; active: boolean; version: string | null; license: string }[] }).backends
    .map((b) => `<tr><td>${BACKEND_KINDS[b.kind] ?? b.kind}</td><td class="num">${b.name}</td><td class="${b.active ? 'ok' : ''}">${b.active ? `사용 중 (${b.version})` : b.installed ? '설치됨 · 꺼짐' : '설치 안 됨'}</td><td class="lic">${b.license}</td></tr>`)
    .join('');
  return `<p>기본 분석(numpy·scipy)은 항상 동작합니다. 아래 ML 라이브러리를 서버에 설치하면 다음 분석부터 자동으로 쓰이고, 곡 정보의 "다시 분석"으로 기존 곡에도 적용할 수 있습니다.</p><table class="backends"><tbody>${rows}</tbody></table><pre>cd server
.venv/bin/pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
.venv/bin/pip install -e ".[ml]"     # demucs · beat-this (+ basic-pitch: Python 3.11)
# Windows: .venv/bin/pip 대신 .venv\\Scripts\\pip</pre>`;
}

function make(r: RawRow, heading?: string): Row {
  const kind = r.kind;
  const def = r.default ?? null;
  const auto = AUTO[r.label];
  const values = r.values ?? [];
  const row: Row = {
    label: r.label,
    kind: auto ? 'number' : kind,
    help: r.help ?? '',
    values: kind === 'switch' ? ['켬', '끔'] : values,
    min: auto ? auto[0] : (r.min ?? 0),
    max: auto ? auto[1] : (r.max ?? 0),
    step: auto ? auto[2] : (r.step ?? 1),
    bigStep: auto ? auto[3] : (r.bigStep ?? r.step ?? 1),
    auto: Boolean(auto),
    wraps: r.label === '색상',
    format: FORMATS[r.label] ?? ((v) => String(v)),
    value: 0,
    initial: 0,
    heading,
  };
  if (auto) row.value = null;
  else if (kind === 'choice') row.value = Math.max(0, values.indexOf(def ?? ''));
  else if (kind === 'switch') row.value = def === '켬' || def === '체크됨' ? 0 : 1;
  else if (kind === 'number') {
    // the default as the game shows it, read back through the row's own format
    let v = row.min;
    for (let x = row.min; x <= row.max + 1e-9; x += row.step) if (row.format(round(x, row.step)) === def) v = round(x, row.step);
    row.value = def === null ? (r.label === '색상' ? 206 : r.label === '채도' ? 8 : r.label === '밝기' ? 100 : r.label === '재생 속도' ? 1 : row.min) : v;
  } else if (kind === 'keybind') {
    row.caps = def && !def.includes('빈 칸') ? def.split(' ') : [''];
  }
  const b = BINDS[r.label];
  if (b) {
    row.bind = b.bind;
    row.value = b.get(state.settings);
  }
  if (kind === 'info' && r.label === '분석 백엔드') {
    row.html = backendBlock();
    row.skip = true;
  } else if (kind === 'info' && r.label.length > 40) {
    // a paragraph to read (the pad's status line, its closing note)
    row.html = `<p>${r.label}</p>`;
    row.skip = true;
  }
  row.initial = row.value;
  return row;
}

export const round = (v: number, step: number) => Math.round(v / step) * step;

function tabOf(t: RawTab): Tab {
  const headingOf = new Map<string, string>();
  for (const s of t.sections ?? []) if (s.heading) headingOf.set(s.rows[0], s.heading);
  const rows = t.rows.map((r) => make(r, headingOf.get(r.label)));
  const byLabel = (l: string) => rows.find((r) => r.label === l);
  // what shows only in a state of the screen
  const undo = byLabel('되돌리기');
  if (undo) undo.when = () => resetAt > performance.now() - 10_000;
  const practice = byLabel('연습 모드');
  for (const l of ['구간', '재생 속도', '구간 반복', '연습 구간']) {
    const r = byLabel(l);
    if (r && practice) r.when = () => practice.value === 0;
  }
  const tab: Tab = { id: t.id, label: t.label, intro: t.intro ?? '', defaultHelp: t.defaultHelp ?? '', rows };
  if (t.id === 'notes') wireNotes(tab);
  if (t.id === 'keys') wireKeys(tab);
  return tab;
}

export let resetAt = -Infinity;
export const markReset = (at: number) => (resetAt = at);

const data = raw as unknown as { tabs: RawTab[]; playOptions: { tabs: { id: string; label: string; defaultHelp: string }[]; rows: RawRow[] } };

export function settingsTabs(): Tab[] {
  return data.tabs.map(tabOf);
}

export function playOptionTabs(): Tab[] {
  return data.playOptions.tabs.map((t) => tabOf({ id: t.id, label: t.label, defaultHelp: t.defaultHelp, rows: data.playOptions.rows.filter((r) => r.tab === t.label) }));
}
