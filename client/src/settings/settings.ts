import {
  cameraConfig,
  defaultGauge,
  difficultySystemIds,
  difficultySystems,
  enabledKeyModes,
  gaugeTypeIds,
  judgementConfig,
  keyModes,
  tierOf,
  type DifficultySystemId,
  type GaugeTypeId,
  type JudgementModeId,
} from '../engine/config';
import type { FeverMode } from '../engine/fever';
import { placementIds, type PlacementId } from '../engine/placement';
import { defaultRuleset, rulesetIds, type RulesetId } from '../engine/ruleset';
import type { ScrollMode } from '../engine/scroll';
import type { KeyModeId } from '../engine/types';
import type { SideNotes } from '../render/layout';
import type { Palette } from '../render/palette';
import { BUILTIN_SKINS, sanitizeSkin, SKIN_RENAMES } from '../render/skins';
import type { HitEffectSize } from '../render/TrackRenderer';
import { DEFAULT_TURNTABLE, isPadCode, MENU_BUTTON_KEYS, MENU_BUTTONS, MENU_PAD_CODE, type MenuButton } from '../input/gamepad';
import { DEFAULT_PAD_PLAY, PAD_PLAY_BUTTONS, type PadPlayButton } from '../input/padPlay';
import { cleanPlayKey, DEFAULT_PLAY_KEYS, parseKey, PLAY_ACTIONS, type PlayAction } from '../input/playKeys';

export type { ScrollMode } from '../engine/scroll';
export type { Palette } from '../render/palette';
export type { HitEffectSize } from '../render/TrackRenderer';
export const HIT_EFFECT_SIZES: readonly HitEffectSize[] = ['normal', 'small', 'off'];
export type { SideNotes } from '../render/layout';
export const SIDE_NOTES: readonly SideNotes[] = ['lanes', 'half'];
export type JudgePosition = 'low' | 'mid' | 'high';
/** A window, or full screen (the desktop app keeps its window's; a browser asks for it). */
export type DisplayMode = 'window' | 'fullscreen';
export const DISPLAY_MODES: readonly DisplayMode[] = ['window', 'fullscreen'];
/** Song select folders (Shift or F6 steps through them): every song, the favourites, the ones not
 * played on this key mode and difficulty system, the ones played but not cleared on a difficulty,
 * the ones cleared but short of MAX COMBO on a difficulty. */
export type SongFolder = 'all' | 'favorites' | 'unplayed' | 'uncleared' | 'noFullCombo';
export const SONG_FOLDERS: readonly SongFolder[] = ['all', 'favorites', 'unplayed', 'uncleared', 'noFullCombo'];
/** Song select order (F4 steps through them); level, lamp and RATE are those of the selected difficulty. */
export type SongSort = 'added' | 'title' | 'artist' | 'bpm' | 'level' | 'lamp' | 'rate' | 'recent';
export const SONG_SORTS: readonly SongSort[] = ['added', 'title', 'artist', 'bpm', 'level', 'lamp', 'rate', 'recent'];
/** OFF, the personal best of the chart, a target rate in percent, or (EX-SCORE) a grade or the maximum. */
export type Pacemaker = 'OFF' | 'BEST' | '90' | '95' | '98' | '99' | '100' | 'A' | 'AA' | 'AAA' | 'MAX';
/** A difficulty's pattern: a seed (새 패턴), or a chart's id (one chosen from its records). */
export type Pattern = number | string;
/** Opacities of the judgement and the combo (notes behind them show through). */
export const JUDGEMENT_OPACITIES: readonly number[] = [1, 0.7, 0.4];

export type GenStyle = 'balanced' | 'stream' | 'chord' | 'jack' | 'longnote' | 'technical' | 'melody';
export type RhythmSource = 'auto' | 'drum' | 'bass' | 'melody' | 'vocal';
/** sectioned = built from the song's sections and loops down (default); designer = patterns planned
 * per phrase; classic = the earlier note-by-note placement (both kept to compare). */
export type PatternEngine = 'sectioned' | 'designer' | 'classic';
export const PATTERN_ENGINES: readonly PatternEngine[] = ['sectioned', 'designer', 'classic'];

/** Advanced generation options; null leaves the difficulty preset's value. */
export interface GenerationPrefs {
  style: GenStyle;
  rhythmSource: RhythmSource;
  density: number | null;
  longNoteRatio: number | null;
  maxChord: number | null;
  /** Scratch or side-note rate, depending on the key mode. */
  specialRate: number | null;
  /** Pull of drum / bass notes toward their lane regions (null = server default). */
  instrumentMapping: number | null;
  /** 1 = reuse lane patterns in repeated sections, 0 = off (null = server default). */
  repeatConsistency: number | null;
  patternEngine: PatternEngine;
  /** The user picked the engine (a stored "designer" without it is the old default). */
  engineSet?: boolean;
}

export const GEN_STYLES: GenStyle[] = ['balanced', 'stream', 'chord', 'jack', 'longnote', 'technical', 'melody'];
export const RHYTHM_SOURCES: RhythmSource[] = ['auto', 'drum', 'bass', 'melody', 'vocal'];

export const DEFAULT_GENERATION: GenerationPrefs = {
  style: 'balanced',
  rhythmSource: 'auto',
  density: null,
  longNoteRatio: null,
  maxChord: null,
  specialRate: null,
  instrumentMapping: null,
  repeatConsistency: null,
  patternEngine: 'sectioned',
};

export interface Settings {
  judgementMode: JudgementModeId;
  /** 1.0 = a note takes BASE_VISIBLE_MS from the track end to the (unlifted) judgement line. */
  hiSpeed: number;
  /** + compensates a player who hits late on average. */
  inputOffsetMs: number;
  /** + draws notes earlier (compensates display latency). */
  visualOffsetMs: number;
  cameraPreset: string;
  laneWidthScale: number;
  /** Key beams' length: a share of the usual one (0 = none). */
  keyBeamLength: number;
  musicVolume: number;
  sfxVolume: number;
  hitSound: boolean;
  showErrorMs: boolean;
  bindings: Partial<Record<KeyModeId, string[]>>;
  /** A second key per lane (null = none), alongside `bindings`: two keys for a scratch, a side lane for either hand. */
  secondBindings: Partial<Record<KeyModeId, (string | null)[]>>;
  /** Gamepad / controller control per lane (null = none), alongside the keyboard keys. */
  padBindings: Partial<Record<KeyModeId, (string | null)[]>>;
  /** Keys of the in-play functions that differ from DEFAULT_PLAY_KEYS (see playKeysOf). */
  playKeys: Partial<Record<PlayAction, string>>;
  /** The pad's Start, Select and FEVER buttons in play (null = none; absent = DEFAULT_PAD_PLAY). */
  padPlay: Partial<Record<PadPlayButton, string | null>>;
  /** Menu buttons of a pad without the standard mapping (null = none; absent = inferred, see padMenuFor). */
  padMenu: Partial<Record<MenuButton, string | null>>;
  /** Turntable: how far it turns (8-bit axis steps) before it is a scratch, and how long it stands still before it lets go. */
  turntableSteps: number;
  turntableReleaseMs: number;
  /** A play of one's own pauses when the window loses the focus or is hidden. */
  pauseOnBlur: boolean;
  /** The game in a window or full screen (see displayMode.ts). */
  displayMode: DisplayMode;
  /** Per song (by id): ms its notes are drawn and judged later (+) or earlier, over the offsets above. */
  songOffsets: Record<string, number>;
  /**
   * Per difficulty of a song (patternKey): the pattern played there, the seed of one made with 새
   * 패턴 (made with the generation options of the moment) or a chart chosen by its id from the
   * records (that very chart); none: the default pattern.
   */
  patterns: Record<string, Pattern>;
  /** Per song and key mode (chartPickKey): the edited or imported chart chosen last (none: a difficulty). */
  chartPicks: Record<string, string>;
  lastKeyMode: KeyModeId;
  /** Difficulty tier of `difficultySystem` (NM, MX, SHD …). */
  lastDifficulty: string;
  /** Which game's difficulties and levels the generator follows (GRG = the original five steps). */
  difficultySystem: DifficultySystemId;
  ruleset: RulesetId;
  gaugeType: GaugeTypeId;
  fever: FeverMode;
  placement: PlacementId;
  /** SUDDEN+: share of the travel distance hidden at the far end (0..MAX_COVER). */
  sudden: number;
  /** HIDDEN+: share of the travel distance hidden just before the judgement line. */
  hidden: number;
  /** LIFT: share of the track the judgement line is raised by. */
  lift: number;
  /** Home toggles the covers without losing their positions. */
  coversOn: boolean;
  /** Keep the visible time ("green number") when covers or LIFT move, like floating hi-speed. */
  keepVisibleTime: boolean;
  /** time: fixed speed; beat: speed follows the chart BPM (BMS/DJMAX style soflan). */
  scrollMode: ScrollMode;
  judgePosition: JudgePosition;
  /** Opacity of the judgement and the combo (one of JUDGEMENT_OPACITIES). */
  judgementOpacity: number;
  /** Counts of BREAK and of FAST / SLOW under the score panel. */
  judgeCounter: boolean;
  /** A line across the track at every bar. */
  barLines: boolean;
  reducedFlash: boolean;
  palette: Palette;
  pacemaker: Pacemaker;
  generation: GenerationPrefs;
  /** Keysounds on generated charts: a hit plays its slice of the stem it follows, a miss leaves it out. */
  keysound: boolean;
  /** SDVX-style camera tilt / zoom from the chart (0 = off .. 1). */
  cameraFx: number;
  /** Hit and hold effects at the skin's size, about a lane wide, or none. */
  hitEffectSize: HitEffectSize;
  /** 4K+FX and 6K+FX: side notes in lanes of their own at the edges, or as bars over half the key lanes (DJMAX's side tracks). */
  sideNotes: SideNotes;
  skin: string;
  /** User skin (JSON object), used when `skin` is "custom". */
  customSkin: unknown;
  /** Background: blurred jacket, visualizer and user video under a dimming layer. */
  bgBrightness: number;
  visualizer: boolean;
  bga: boolean;
  /** Song ids marked as favourites on the song select. */
  favorites: string[];
  songFolder: SongFolder;
  songSort: SongSort;
}

export const BASE_VISIBLE_MS = 5000;
export const HI_SPEED_MIN = 0.5;
export const HI_SPEED_MAX = 10;
export const MAX_COVER = 0.85;
export const MAX_LIFT = 0.5;
export const KEY_BEAM_MAX = 2;
export const TURNTABLE_STEPS_MAX = 4;
export const TURNTABLE_RELEASE_MIN = 40;
export const TURNTABLE_RELEASE_MAX = 300;
/** The judgement and display offsets are set within this (ms). */
export const OFFSET_MAX = 200;
/** A song's own offset stays within this (ms), and so many songs keep one (or a pattern, or a chart). */
export const SONG_OFFSET_MAX = 200;
const SONG_OFFSETS_KEPT = 5000;
/** At least this share of the travel distance stays visible whatever the covers say. */
export const MIN_VISIBLE_SHARE = 0.1;

const STORAGE_KEY = 'grg.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  judgementMode: 'NORMAL',
  hiSpeed: 4,
  inputOffsetMs: 0,
  visualOffsetMs: 0,
  cameraPreset: cameraConfig.default,
  laneWidthScale: 1,
  keyBeamLength: 1,
  musicVolume: 0.9,
  sfxVolume: 0.6,
  hitSound: false,
  showErrorMs: true,
  bindings: {},
  secondBindings: {},
  padBindings: {},
  playKeys: {},
  padPlay: {},
  padMenu: {},
  turntableSteps: DEFAULT_TURNTABLE.steps,
  turntableReleaseMs: DEFAULT_TURNTABLE.releaseMs,
  pauseOnBlur: true,
  displayMode: 'window',
  songOffsets: {},
  patterns: {},
  chartPicks: {},
  lastKeyMode: '4K',
  lastDifficulty: 'NORMAL',
  difficultySystem: difficultySystemIds.includes('DJMAX') ? 'DJMAX' : 'GRG',
  ruleset: defaultRuleset,
  gaugeType: defaultGauge,
  fever: 'AUTO',
  placement: 'OFF',
  sudden: 0,
  hidden: 0,
  lift: 0,
  coversOn: true,
  keepVisibleTime: false,
  scrollMode: 'time',
  judgePosition: 'mid',
  judgementOpacity: 1,
  judgeCounter: false,
  barLines: true,
  reducedFlash: false,
  palette: 'default',
  pacemaker: 'OFF',
  generation: DEFAULT_GENERATION,
  keysound: true,
  cameraFx: 0.6,
  hitEffectSize: 'normal',
  sideNotes: 'lanes',
  skin: 'flat',
  customSkin: null,
  bgBrightness: 0.35,
  visualizer: true,
  bga: true,
  favorites: [],
  songFolder: 'all',
  songSort: 'added',
};

const PACEMAKERS: Pacemaker[] = ['OFF', 'BEST', '90', '95', '98', '99', '100', 'A', 'AA', 'AAA', 'MAX'];

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function num(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** A keyboard key as KeyboardEvent.code names it. */
const KEY_CODE = /^[A-Z][A-Za-z0-9]*$/;

/** Per key mode, a code (or null) per lane; modes of another length or unknown are dropped. */
function perLane<T>(raw: unknown, clean: (mode: KeyModeId, codes: unknown[]) => T[] | null): Partial<Record<KeyModeId, T[]>> {
  const out: Partial<Record<KeyModeId, T[]>> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [mode, codes] of Object.entries(raw)) {
    const lanes = keyModes[mode as KeyModeId]?.lanes.length;
    if (!lanes || !Array.isArray(codes) || codes.length !== lanes) continue;
    const cleaned = clean(mode as KeyModeId, codes);
    if (cleaned) out[mode as KeyModeId] = cleaned;
  }
  return out;
}

/** Each name of `names` kept from `raw` where `clean` takes its value (null stays null: "none"). */
function picked<K extends string>(raw: unknown, names: readonly K[], clean: (v: unknown) => string | null): Partial<Record<K, string | null>> {
  const out: Partial<Record<K, string | null>> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  const values = raw as Record<string, unknown>;
  for (const name of names) {
    if (!(name in values)) continue;
    const v = values[name];
    if (v === null) out[name] = null;
    else if (clean(v) !== null) out[name] = clean(v);
  }
  return out;
}

/** Fills defaults and drops values that the current config no longer knows. */
export function sanitizeSettings(raw: Partial<Settings>): Settings {
  const s = { ...DEFAULT_SETTINGS, ...raw };
  // a mode's keys: all keyboard codes; its second keys: none that is already a key of the mode
  s.bindings = perLane(raw.bindings, (_, codes) => (codes.every((c) => typeof c === 'string' && KEY_CODE.test(c)) ? (codes as string[]) : null));
  s.secondBindings = perLane(raw.secondBindings, (mode, codes) => {
    const used = new Set(bindingsFor(s, mode));
    const second = codes.map((c) => {
      if (typeof c !== 'string' || !KEY_CODE.test(c) || used.has(c)) return null;
      used.add(c);
      return c;
    });
    return second.some((c) => c !== null) ? second : null;
  });
  s.padBindings = perLane(raw.padBindings, (_, codes) => codes.map((c) => (typeof c === 'string' && isPadCode(c) ? c : null)));
  const keys: Partial<Record<PlayAction, string>> = {};
  for (const action of PLAY_ACTIONS) {
    const key = cleanPlayKey((raw.playKeys as Record<string, unknown> | undefined)?.[action]);
    if (key !== null && key !== DEFAULT_PLAY_KEYS[action]) keys[action] = key;
  }
  s.playKeys = keys;
  // the pad's play buttons: buttons or stick directions (a turntable is no button)
  s.padPlay = picked(raw.padPlay, PAD_PLAY_BUTTONS, (v) => (typeof v === 'string' && isPadCode(v) && !v.startsWith('Pad:TT') ? v : null));
  s.padMenu = picked(raw.padMenu, MENU_BUTTONS, (v) => (typeof v === 'string' && MENU_PAD_CODE.test(v) ? v : null));
  s.turntableSteps = Math.round(num(s.turntableSteps, 1, TURNTABLE_STEPS_MAX, DEFAULT_TURNTABLE.steps));
  s.turntableReleaseMs = Math.round(num(s.turntableReleaseMs, TURNTABLE_RELEASE_MIN, TURNTABLE_RELEASE_MAX, DEFAULT_TURNTABLE.releaseMs));
  s.pauseOnBlur = s.pauseOnBlur !== false;
  s.displayMode = pick(s.displayMode, DISPLAY_MODES, DEFAULT_SETTINGS.displayMode);
  s.songOffsets = sanitizeSongOffsets(raw.songOffsets);
  s.patterns = keptEntries(raw.patterns, PATTERN_KEY, (v) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= SEED_MAX) || (typeof v === 'string' && CHART_ID.test(v))) as Record<string, Pattern>;
  s.chartPicks = keptEntries(raw.chartPicks, CHART_PICK_KEY, (v) => typeof v === 'string' && CHART_ID.test(v)) as Record<string, string>;
  const d = DEFAULT_SETTINGS;
  s.judgementMode = pick(s.judgementMode, Object.keys(judgementConfig.modes) as JudgementModeId[], d.judgementMode);
  s.hiSpeed = num(s.hiSpeed, HI_SPEED_MIN, HI_SPEED_MAX, d.hiSpeed);
  s.cameraPreset = pick(s.cameraPreset, Object.keys(cameraConfig.presets), d.cameraPreset);
  s.lastKeyMode = pick(s.lastKeyMode, Object.keys(keyModes) as KeyModeId[], d.lastKeyMode);
  s.difficultySystem = pick(s.difficultySystem, difficultySystemIds, d.difficultySystem);
  s.lastDifficulty = tierOf(difficultySystems[s.difficultySystem], String(s.lastDifficulty)).id;
  s.ruleset = pick(s.ruleset, rulesetIds, d.ruleset);
  s.gaugeType = pick(s.gaugeType, gaugeTypeIds, d.gaugeType);
  s.fever = pick(s.fever, ['AUTO', 'MANUAL', 'OFF'] as FeverMode[], d.fever);
  s.placement = pick(s.placement, placementIds, d.placement);
  s.sudden = num(s.sudden, 0, MAX_COVER, 0);
  s.hidden = num(s.hidden, 0, MAX_COVER, 0);
  s.lift = num(s.lift, 0, MAX_LIFT, 0);
  s.keyBeamLength = num(s.keyBeamLength, 0, KEY_BEAM_MAX, d.keyBeamLength);
  s.scrollMode = pick(s.scrollMode, ['time', 'beat'] as ScrollMode[], d.scrollMode);
  s.judgePosition = pick(s.judgePosition, ['low', 'mid', 'high'] as JudgePosition[], d.judgePosition);
  s.judgementOpacity = pick(s.judgementOpacity, JUDGEMENT_OPACITIES, d.judgementOpacity);
  s.judgeCounter = s.judgeCounter === true;
  s.palette = pick(s.palette, ['default', 'colorblind'] as Palette[], d.palette);
  s.pacemaker = pick(s.pacemaker, PACEMAKERS, d.pacemaker);
  s.keysound = Boolean(s.keysound);
  s.barLines = s.barLines !== false;
  s.cameraFx = num(s.cameraFx, 0, 1, d.cameraFx);
  s.hitEffectSize = pick(s.hitEffectSize, HIT_EFFECT_SIZES, d.hitEffectSize);
  s.sideNotes = pick(s.sideNotes, SIDE_NOTES, d.sideNotes);
  // skins of earlier versions open as the skin that took their place
  s.skin = pick(SKIN_RENAMES[String(s.skin)] ?? s.skin, [...BUILTIN_SKINS.map((k) => k.id), 'custom'], d.skin);
  s.customSkin = sanitizeSkin(s.customSkin);
  if (s.skin === 'custom' && s.customSkin === null) s.skin = d.skin;
  s.bgBrightness = num(s.bgBrightness, 0, 1, d.bgBrightness);
  s.visualizer = s.visualizer !== false;
  s.bga = s.bga !== false;
  s.favorites = Array.isArray(raw.favorites) ? [...new Set(raw.favorites.filter((id) => typeof id === 'string'))].slice(0, 5000) : [];
  s.songFolder = pick(s.songFolder, SONG_FOLDERS, d.songFolder);
  s.songSort = pick(s.songSort, SONG_SORTS, d.songSort);
  const g = { ...DEFAULT_GENERATION, ...raw.generation };
  const optional = (v: unknown, min: number, max: number) => (v === null || v === undefined ? null : num(v, min, max, min));
  s.generation = {
    style: pick(g.style, GEN_STYLES, DEFAULT_GENERATION.style),
    rhythmSource: pick(g.rhythmSource, RHYTHM_SOURCES, DEFAULT_GENERATION.rhythmSource),
    density: optional(g.density, 0.5, 1.5),
    longNoteRatio: optional(g.longNoteRatio, 0, 0.5),
    maxChord: optional(g.maxChord, 1, 8),
    specialRate: optional(g.specialRate, 0, 0.2),
    instrumentMapping: optional(g.instrumentMapping, 0, 1),
    repeatConsistency: optional(g.repeatConsistency, 0, 1),
    // "designer" was the default before the sectioned engine: only a picked one stays
    patternEngine: g.patternEngine === 'designer' && g.engineSet !== true ? 'sectioned' : pick(g.patternEngine, PATTERN_ENGINES, DEFAULT_GENERATION.patternEngine),
    ...(g.engineSet === true ? { engineSet: true } : {}),
  };
  return s;
}

/**
 * "모두 초기화": every setting back to its default, but what belongs to the songs (the favourites,
 * and each song's patterns, charts chosen and own offset), as the library they go with stays too.
 */
export function resetSettings(s: Settings): Settings {
  return { ...DEFAULT_SETTINGS, favorites: s.favorites, patterns: s.patterns, chartPicks: s.chartPicks, songOffsets: s.songOffsets };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return sanitizeSettings(JSON.parse(raw) as Partial<Settings>);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable (private mode); settings stay in memory
  }
}

/**
 * The settings on another difficulty system, on the same step of it (NORMAL → NM …), else on the
 * step at the same place, else on its first.
 */
export function withDifficultySystem(s: Settings, id: DifficultySystemId): Settings {
  const from = difficultySystems[s.difficultySystem];
  const difficulty = tierOf(from, s.lastDifficulty).id;
  const next = difficultySystems[id];
  const index = Math.min(from.tiers.findIndex((t) => t.id === difficulty), next.tiers.length - 1);
  const tier = next.tiers.find((t) => t.id === next.aliases[difficulty]) ?? next.tiers[Math.max(0, index)] ?? next.tiers[0];
  return { ...s, difficultySystem: id, lastDifficulty: tier.id };
}

export function bindingsFor(settings: Pick<Settings, 'bindings'>, mode: KeyModeId): string[] {
  const custom = settings.bindings[mode];
  const lanes = keyModes[mode].lanes.length;
  if (custom && custom.length === lanes) return custom;
  return keyModes[mode].bindings.default;
}

/** The second key of every lane of a key mode (null where there is none). */
export function secondBindingsFor(settings: Settings, mode: KeyModeId): (string | null)[] {
  const custom = settings.secondBindings[mode];
  const lanes = keyModes[mode].lanes.length;
  return custom && custom.length === lanes ? custom : new Array<string | null>(lanes).fill(null);
}

/** Every keyboard key that plays a lane of the mode (first and second keys). */
export function laneKeysFor(settings: Settings, mode: KeyModeId): string[] {
  return [...bindingsFor(settings, mode), ...secondBindingsFor(settings, mode).filter((c): c is string => c !== null)];
}

/**
 * Binds `code` to a lane's key (`second`: its second key; null clears a second key). A key the
 * mode already uses swaps places with the one it replaces. A lane never loses its only key: taking
 * one for another lane's empty second key is refused (null), as is clearing a first key.
 */
export function rebindKey(s: Settings, mode: KeyModeId, lane: number, second: boolean, code: string | null): Settings | null {
  const first = [...bindingsFor(s, mode)];
  const seconds = [...secondBindingsFor(s, mode)];
  const old = second ? seconds[lane] : first[lane];
  if (code === null && !second) return null;
  if (code !== null) {
    const inFirst = first.findIndex((c, i) => c === code && (second || i !== lane));
    const inSecond = seconds.findIndex((c, i) => c === code && (!second || i !== lane));
    if (inFirst >= 0) {
      if (old === null) return null;
      first[inFirst] = old;
    }
    if (inSecond >= 0) seconds[inSecond] = old;
  }
  if (second) seconds[lane] = code;
  else first[lane] = code as string;
  return {
    ...s,
    bindings: { ...s.bindings, [mode]: first },
    secondBindings: { ...s.secondBindings, [mode]: seconds.some((c) => c !== null) ? seconds : undefined },
  };
}

/** The keys of the in-play functions: the player's, else the defaults. */
export function playKeysOf(settings: Pick<Settings, 'playKeys'>): Record<PlayAction, string> {
  return { ...DEFAULT_PLAY_KEYS, ...settings.playKeys };
}

/** The settings with an in-play function on another key (one back on its default is no longer stored). */
export function withPlayKey(settings: Settings, action: PlayAction, key: string): Settings {
  const playKeys = { ...settings.playKeys, [action]: key };
  if (key === DEFAULT_PLAY_KEYS[action]) delete playKeys[action];
  return { ...settings, playKeys };
}

/** The pad's Start, Select and FEVER buttons in play. */
export function padPlayOf(settings: Pick<Settings, 'padPlay'>): Record<PadPlayButton, string | null> {
  return { ...DEFAULT_PAD_PLAY, ...settings.padPlay };
}

/** What padMenuFor reads. */
export type PadMenuSettings = Pick<Settings, 'padMenu' | 'padBindings' | 'lastKeyMode'>;

/**
 * The menu buttons of a pad without the standard mapping: the ones assigned, the others inferred
 * from its lanes (of the last key mode played, else the first mode with pad lanes): the first key
 * lanes' buttons decide, cancel, go left and right, and a turntable lane's turns go up and down.
 * Without pad lanes its first two buttons decide and cancel (no axis: one left past the middle
 * would be an arrow key held).
 */
export function padMenuFor(settings: PadMenuSettings): Record<MenuButton, string | null> {
  const inferred: Record<MenuButton, string | null> = { ok: null, back: null, up: null, down: null, left: null, right: null, options: null };
  const mode = [settings.lastKeyMode, ...enabledKeyModes].find((m) => padBindingsFor(settings, m).some((c) => c !== null));
  if (!mode) [inferred.ok, inferred.back] = ['Pad:B0', 'Pad:B1'];
  else {
    const codes = padBindingsFor(settings, mode);
    const keys = keyModes[mode].lanes.flatMap((l, i) => (l.kind === 'key' && codes[i]?.startsWith('Pad:B') ? [codes[i] as string] : []));
    [inferred.ok, inferred.back, inferred.left, inferred.right] = [keys[0] ?? null, keys[1] ?? null, keys[2] ?? null, keys[3] ?? null];
    const turntable = codes.find((c) => c?.startsWith('Pad:TT'));
    if (turntable) [inferred.up, inferred.down] = [`${turntable}-`, `${turntable}+`];
  }
  const out = { ...inferred };
  for (const b of MENU_BUTTONS) if (settings.padMenu[b] !== undefined) out[b] = settings.padMenu[b] ?? null;
  return out;
}

/** The keys the menu buttons of a pad without the standard mapping send, by pad code. */
export function padMenuKeysFor(settings: PadMenuSettings): Record<string, string> {
  const menu = padMenuFor(settings);
  const keys: Record<string, string> = {};
  for (const b of MENU_BUTTONS) {
    const code = menu[b];
    if (code && !(code in keys)) keys[code] = MENU_BUTTON_KEYS[b];
  }
  return keys;
}

const SEED_MAX = 2 ** 32 - 1;
const CHART_ID = /^c[0-9a-f]{20}$/;
const SONG = '[0-9a-f]{16}';
const MODES = Object.keys(keyModes).map((m) => m.replace(/[+]/g, '\\+')).join('|');
const PATTERN_KEY = new RegExp(`^${SONG}\\|(${MODES})\\|(${difficultySystemIds.join('|')})\\|[A-Z0-9_-]{1,16}$`);
const CHART_PICK_KEY = new RegExp(`^${SONG}\\|(${MODES})$`);

/** The entries of a stored map whose key and value are of their kind, the last SONG_OFFSETS_KEPT of them. */
function keptEntries(raw: unknown, key: RegExp, value: (v: unknown) => boolean): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([k, v]) => key.test(k) && value(v)).slice(-SONG_OFFSETS_KEPT));
}

/** A map of what is kept per key with one key set (or, with null, taken out). */
export function withEntry<T>(all: Record<string, T>, key: string, value: T | null): Record<string, T> {
  const next = { ...all };
  delete next[key];
  if (value !== null) next[key] = value;
  return next;
}

/** Where a difficulty's pattern is kept: the song, the key mode and the tier of its difficulty system. */
export function patternKey(songId: string, keyMode: KeyModeId, system: DifficultySystemId, difficulty: string): string {
  return `${songId}|${keyMode}|${system}|${difficulty}`;
}

/** A difficulty's pattern (null: the default pattern). */
export function patternOf(settings: Pick<Settings, 'patterns'>, key: string): Pattern | null {
  return settings.patterns[key] ?? null;
}

/** The settings with a difficulty on a pattern (null: back to the default pattern). */
export function withPattern(settings: Settings, key: string, pattern: Pattern | null): Settings {
  return { ...settings, patterns: withEntry(settings.patterns, key, pattern) };
}

/** Where the chart chosen last on a song's key mode is kept. */
export function chartPickKey(songId: string, keyMode: KeyModeId): string {
  return `${songId}|${keyMode}`;
}

/** The edited or imported chart chosen last on a song's key mode (null: a difficulty). */
export function chartPickOf(settings: Pick<Settings, 'chartPicks'>, key: string): string | null {
  return settings.chartPicks[key] ?? null;
}

/** The settings with a song's key mode on a saved chart (null: on a difficulty again). */
export function withChartPick(settings: Settings, key: string, chartId: string | null): Settings {
  return { ...settings, chartPicks: withEntry(settings.chartPicks, key, chartId) };
}

/**
 * The settings without what was kept for a song taken out of the library: its patterns, its
 * charts chosen and its offset (a song added again has the same id, and the charts named are gone).
 */
export function withoutSong(settings: Settings, songId: string): Settings {
  const others = <T>(all: Record<string, T>) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== songId && !k.startsWith(`${songId}|`)));
  return { ...settings, patterns: others(settings.patterns), chartPicks: others(settings.chartPicks), songOffsets: others(settings.songOffsets) };
}

/** Song offsets as stored: whole ms within ±SONG_OFFSET_MAX, none of 0, the last SONG_OFFSETS_KEPT songs. */
function sanitizeSongOffsets(raw: unknown): Record<string, number> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const entries = Object.entries(raw as Record<string, unknown>)
    .filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]))
    .map(([id, v]): [string, number] => [id, Math.round(Math.min(SONG_OFFSET_MAX, Math.max(-SONG_OFFSET_MAX, v)))])
    .filter(([, v]) => v !== 0);
  return Object.fromEntries(entries.slice(-SONG_OFFSETS_KEPT));
}

/** A song's own offset (0 without a song, or without one set). */
export function songOffsetOf(settings: Pick<Settings, 'songOffsets'>, songId: string | null | undefined): number {
  return songId ? (settings.songOffsets[songId] ?? 0) : 0;
}

/** The settings with a song's offset set to `ms` (rounded, within ±SONG_OFFSET_MAX; 0 removes it). */
export function withSongOffset(settings: Settings, songId: string, ms: number): Settings {
  const value = Math.round(Math.min(SONG_OFFSET_MAX, Math.max(-SONG_OFFSET_MAX, ms)));
  const songOffsets = { ...settings.songOffsets };
  delete songOffsets[songId];
  if (value !== 0) songOffsets[songId] = value;
  return { ...settings, songOffsets };
}

/** Gamepad control of every lane of a key mode (null where none is bound). */
export function padBindingsFor(settings: Pick<Settings, 'padBindings'>, mode: KeyModeId): (string | null)[] {
  const custom = settings.padBindings[mode];
  const lanes = keyModes[mode].lanes.length;
  return custom && custom.length === lanes ? custom : new Array<string | null>(lanes).fill(null);
}

export function clampHiSpeed(hiSpeed: number): number {
  return Math.round(Math.min(HI_SPEED_MAX, Math.max(HI_SPEED_MIN, hiSpeed)) * 100) / 100;
}

/** Time a note takes over the whole (unlifted) track length. */
export function visibleTimeMs(hiSpeed: number): number {
  return BASE_VISIBLE_MS / clampHiSpeed(hiSpeed);
}

export interface CoverState {
  sudden: number;
  hidden: number;
  lift: number;
}

/** Covers in effect (Home turns SUDDEN+/HIDDEN+ off; LIFT stays). */
export function activeCovers(s: Pick<Settings, 'sudden' | 'hidden' | 'lift' | 'coversOn'>): CoverState {
  const sudden = s.coversOn ? s.sudden : 0;
  const hidden = s.coversOn ? s.hidden : 0;
  const over = sudden + hidden - (1 - MIN_VISIBLE_SHARE);
  // Never let the two covers meet: trim HIDDEN+ first, it is the one added on top.
  const h = over > 0 ? Math.max(0, hidden - over) : hidden;
  return { sudden: Math.min(sudden, 1 - MIN_VISIBLE_SHARE), hidden: h, lift: s.lift };
}

/** Share of the whole track length from the SUDDEN+ edge down to the judgement line. */
export function visibleShare(c: CoverState): number {
  return (1 - c.lift) * (1 - c.sudden);
}

/**
 * "Green number": ms from a note appearing below SUDDEN+ to it reaching the judgement line.
 * HIDDEN+ does not change it (the note still appears at the same moment), as in IIDX.
 */
export function greenNumber(hiSpeed: number, c: CoverState): number {
  return visibleTimeMs(hiSpeed) * visibleShare(c);
}

/**
 * Applies a cover/LIFT change; with `keepVisibleTime` the hi-speed is rescaled so the green number
 * stays the same (as long as the hi-speed range allows it).
 */
export function withCovers(s: Settings, patch: Partial<Pick<Settings, 'sudden' | 'hidden' | 'lift' | 'coversOn'>>): Settings {
  const next = sanitizeSettings({ ...s, ...patch });
  if (!s.keepVisibleTime) return next;
  const before = visibleShare(activeCovers(s));
  const after = visibleShare(activeCovers(next));
  if (before <= 0 || after <= 0) return next;
  return { ...next, hiSpeed: clampHiSpeed(s.hiSpeed * (after / before)) };
}

/** Human readable key name for a KeyboardEvent.code. */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const names: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    PageUp: 'PgUp',
    PageDown: 'PgDn',
    Escape: 'Esc',
    Minus: '-',
    Equal: '=',
    Backquote: '`',
    Backspace: 'BkSp',
    Delete: 'Del',
    Insert: 'Ins',
    Space: 'Space',
    ShiftLeft: 'L-Shift',
    ShiftRight: 'R-Shift',
    ControlLeft: 'L-Ctrl',
    ControlRight: 'R-Ctrl',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Enter: 'Enter',
    AltLeft: 'L-Alt',
    AltRight: 'R-Alt',
  };
  return names[code] ?? code;
}

/** Human readable name of an in-play key binding (Alt+PgUp). */
export function bindingLabel(binding: string): string {
  const b = parseKey(binding);
  return `${b.ctrl ? 'Ctrl+' : ''}${b.alt ? 'Alt+' : ''}${b.shift ? 'Shift+' : ''}${keyLabel(b.code)}`;
}
