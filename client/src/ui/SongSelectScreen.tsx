import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { api, ApiError, EXPORT_LABELS, type Health, type ImportResult, type SavedChart, type ScoreRecord, type ServerChart, type Song } from '../api/client';
import { forgetSongBuffer } from '../audio/bufferCache';
import { menuMusic, PREVIEW_VOLUME } from '../audio/songPreview';
import { difficultyTiers as tiers, enabledKeyModes, tierOf, tierUpTo, type DifficultyTier } from '../engine/config';
import { placementLabels } from '../engine/placement';
import { isReplay, type ReplayData } from '../engine/replay';
import { rulesetConfigs, type RulesetId } from '../engine/ruleset';
import { TempoMap } from '../engine/tempo';
import type { KeyModeId } from '../engine/types';
import type { PlayAction } from '../input/playKeys';
import {
  bindingLabel,
  bindingsFor,
  chartPickKey,
  chartPickOf,
  DEFAULT_SETTINGS,
  keyLabel,
  patternKey,
  patternOf,
  playKeysOf,
  songOffsetOf,
  withChartPick,
  withoutSong,
  withPattern,
  withSongOffset,
  type Pattern,
  type Settings,
  type SongFolder,
} from '../settings/settings';
import { failureReason } from './analysisError';
import type { PlayRequest, PracticeOptions } from './App';
import type { CalibrationStep } from './CalibrationScreen';
import { aiMakingLabel, analysisStamp, chartKey, chartStore, GENERATION_PARAMS, requestOf, savedChartKey, tierAbsent, useChartStore, type ChartBrief, type ChartSpec } from './chartCache';
import { desktopShell } from './displayMode';
import { CHART_FILE, entryFiles, sortDrop, type DroppedFile } from './dropFiles';
import { pointText, speedText } from './format';
import { ArrowIcon, FilmIcon, PencilIcon, SearchIcon, StarIcon } from './icons';
import { namedPictures } from './importPictures';
import { lampClass, LampMark } from './lamps';
import { FEVER_SHORT, PlayOptionsPanel } from './PlayOptions';
import { clampBgaOffset, describeBgaOffset } from './PlayBackground';
import { buildPlayRequest } from './playRequest';
import { judgementChip } from './playRules';
import { alongLine, cursorStep, edgeLine, lineStep, panelLines, panelStops, pressesOnEnter, randomIndex, wheelPlace, wheelReach } from './selectNav';
import { Sheet, type SheetItem } from './Sheet';
import { HintBar, TopBar, type KeyHint } from './shell';
import { INFO_TABS, KIND_LABELS, SongInfoPanel, type InfoTab } from './SongInfoPanel';
import { setJacketOrigin } from './jacketFlight';
import { Backdrop, bpmLabel, SongArt } from './songArt';
import {
  bestByTier,
  FILTER_LABELS,
  inFolder,
  nextSongSort,
  otherBest,
  otherLabel,
  recordHeadline,
  recordOf,
  recordsOn,
  savedMark,
  savedRecordsOn,
  SONG_FILTERS,
  SORT_DIR_LABELS,
  sortSaid,
  sortSongs,
  tierMark,
  type SongFilter,
  type TierMark,
} from './songRecords';
import { syncTestRequest } from './syncTestRequest';

interface Props {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onPlay: (request: PlayRequest) => void;
  onCalibrate: (step: CalibrationStep) => void;
  onOpenSettings: () => void;
  /** Open the chart editor on a chart of the selected song. */
  onEdit: (chart: ServerChart, song: Song) => void;
  selectedSongId: string | null;
  onSelectSong: (id: string | null) => void;
  /** Kept while the song select is away (a play, the settings), per chart (practiceKey): its practice. */
  practices: Record<string, PracticeOptions>;
  onPractice: (key: string, practice: PracticeOptions | null) => void;
}

const ACCEPT = '.mp3,.ogg,.oga,.opus,.wav,.flac,.m4a,.aac,audio/*';
const IMPORT_ACCEPT = '.osz,.zip,.osu,.bms,.bme,.bml,.bmson';
const IMPORT_FILE = /\.(osz|zip|osu|bms|bme|bml|pms|bmson|wav|ogg|oga|flac|mp3|m4a|aac|opus)$/i;
const IMAGE_FILE = /\.(png|jpe?g|bmp|gif|webp)$/i;
const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.bmp,image/*';
const VIDEO_ACCEPT = '.mp4,.webm,.m4v,.mov,.ogv,video/*';
/** The charts of a song are asked for once the cursor has rested on it this long (not on every song passed). */
const PREFETCH_DELAY_MS = 300;
/** How often the plates of tiers Mapperatorinator is making (or will make next) ask again. */
const AI_REFRESH_MS = 5000;
/** The song list is asked for this often while a song is analyzed (its progress, the moment it is ready). */
const ANALYSIS_POLL_MS = 400;
/** A server that does not answer is asked again this often. */
const RECONNECT_MS = 3000;
/** How long a word about what a key just did stays under the song (a filter, a favourite). */
const SAID_MS = 2200;
/** The background video's shift against the song: a step of ←→, of Shift+←→ (it can also be typed). */
const BGA_STEP_MS = 10;
const BGA_BIG_STEP_MS = 100;
/** Steps with ←→ are saved once they stop for this long (each one saved at once would race the others). */
const BGA_SAVE_AFTER_MS = 400;

/** What stands in the song's place: nothing (the song itself), the play options, or the song's own page over the whole screen. */
type Panel = 'none' | 'options' | 'info';
/** A short list over the screen: the menu, adding a song, the song's cover, its background video, the filters. */
type SheetId = 'menu' | 'add' | 'cover' | 'video' | 'filter';

/** The in-play keys of the song offset, as the song info names them. */
function offsetKeysText(keys: Record<PlayAction, string>): string {
  const pair = (down: PlayAction, up: PlayAction) => `${bindingLabel(keys[down])} / ${bindingLabel(keys[up])}`;
  return `${pair('offsetDown', 'offsetUp')} (5ms씩 ${pair('offsetDownBig', 'offsetUpBig')})`;
}

/** The function keys of the song select (each with its own job, never repeated by a held key). */
const FUNCTION_KEYS = new Set(['F2', 'F3', 'F5', 'F10']);

function formatTime(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * How large a song's name is set beside its jacket: a short one large, a long one smaller (three
 * sizes, three lines at most). A Hangul or kanji letter counts one, a Latin one about half.
 */
function titleSize(title: string): 'l' | 'm' | 's' {
  let width = 0;
  for (const ch of title) width += /[ᄀ-ᇿ⺀-鿿가-힯＀-￯]/.test(ch) ? 1 : 0.56;
  return width <= 8 ? 'l' : width <= 15 ? 'm' : 's';
}

const signedMs = (ms: number) => `${ms > 0 ? '+' : ''}${ms}ms`;
/** A typed shift: "+13000", "-1500", "−200 ms" (null: not a number). */
function parseShift(text: string): number | null {
  const t = text.replace(/[\s,]|ms$/gi, '').replace(/[−–]/g, '-');
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return null;
  return clampBgaOffset(Number(t));
}

export function SongSelectScreen(props: Props) {
  const { settings, onSettingsChange, onPlay, selectedSongId, onSelectSong } = props;
  const [health, setHealth] = useState<Health | null | 'offline'>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  // the library has come once (until then no song is not an empty library)
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  // the charts this screen waits for the server to make, by chart key (Enter on a tier, F5): their
  // plates say so (Mapperatorinator's take minutes: the server's own word, making or queued,
  // replaces it as the briefs come in) and nothing else is marked
  const [makingKeys, setMakingKeys] = useState<ReadonlySet<string>>(() => new Set());
  const makingRef = useRef<Set<string>>(new Set());
  const markMaking = (key: string, on: boolean) => {
    const next = new Set(makingRef.current);
    if (on) next.add(key);
    else next.delete(key);
    makingRef.current = next;
    setMakingKeys(next);
  };
  // a word about a chart Mapperatorinator is making, or has made, under the song list
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [panel, setPanel] = useState<Panel>('none');
  // the song info's page (kept while it is closed: it opens where it was left)
  const [infoTab, setInfoTab] = useState<InfoTab>('chart');
  // a short list over the screen: the menu (Esc), adding a song (+), the cover (C), the background
  // video (V), the filters (from the menu: a pad has no number keys)
  const [sheet, setSheet] = useState<SheetId | null>(null);
  // the YouTube link being typed in the background video's sheet (null: its form is closed)
  const [youtubeDraft, setYoutubeDraft] = useState<string | null>(null);
  // the background video's shift as typed or stepped in its sheet (saved a moment later)
  const [bgaShiftDraft, setBgaShiftDraft] = useState('0');
  const bgaShiftDirty = useRef(false);
  const bgaShiftTimer = useRef(0);
  const bgaShiftInput = useRef<HTMLInputElement>(null);
  // a word on what a key just did (a filter, a favourite), gone after a moment
  const [said, setSaid] = useState<string | null>(null);
  const saidTimer = useRef(0);
  const say = (text: string) => {
    setSaid(text);
    window.clearTimeout(saidTimer.current);
    saidTimer.current = window.setTimeout(() => setSaid(null), SAID_MS);
  };
  useEffect(() => () => window.clearTimeout(saidTimer.current), []);
  // the edited and imported charts of a song (the one they are of: a list never shows on another song)
  const [savedCharts, setSavedCharts] = useState<{ songId: string | null; charts: SavedChart[] }>({ songId: null, charts: [] });
  const [importReport, setImportReport] = useState<ImportResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const replayInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const bgaInput = useRef<HTMLInputElement>(null);
  // the charts and their levels as they come in (kept across the song select's visits)
  const chartsIn = useChartStore();

  // the settings as they are now, for what ends after an await (an upload, an import)
  const current = useRef(settings);
  current.current = settings;
  const keyMode = settings.lastKeyMode;
  // the tier chosen last; a song without it plays the hardest tier it has under it (tierOn)
  const chosen = tierOf(settings.lastDifficulty).id;
  const favorites = useMemo(() => new Set(settings.favorites), [settings.favorites]);
  const folder = settings.songFolder;
  const sort = settings.songSort;
  // every chart is asked for with the generator's own defaults (chartCache: GENERATION_PARAMS)
  const params = GENERATION_PARAMS;

  /** Where a tier of a song keeps its pattern. */
  const tierKey = (song: Song, tier: string) => patternKey(song.id, keyMode, tier);
  /** What a tier's chart on a song is made of with a seed (null: the default pattern). */
  const specOf = (song: Song, tier: string, seed: number | null): ChartSpec => ({ songId: song.id, analysis: analysisStamp(song), keyMode, difficulty: tier, targetLevel: null, seed, params });
  /**
   * The chart Enter plays on a tier of a song: made of its pattern (its seed, or the default) and
   * the options, or a chart chosen from its records (`chartId`, played as it was made).
   */
  const tierChart = (song: Song, tier: string): { key: string; spec: ChartSpec | null; chartId: string | null } => {
    const pattern = patternOf(settings, tierKey(song, tier));
    if (typeof pattern === 'string') return { key: savedChartKey(pattern), spec: null, chartId: pattern };
    const spec = specOf(song, tier, pattern);
    return { key: chartKey(spec), spec, chartId: null };
  };
  /** The brief of a tier's chart on a song, once known. */
  const briefOn = (song: Song, tier: string): ChartBrief | null => (song.status === 'ready' ? chartStore.brief(tierChart(song, tier).key) : null);
  /** Asks for a tier's chart: the whole of it, or its brief (a chosen chart comes whole: it is known by its id only). */
  const loadTier = (song: Song, tier: string, whole: boolean, retry = false): Promise<unknown> => {
    const { spec, chartId } = tierChart(song, tier);
    if (chartId) return chartStore.loadSaved(chartId, retry);
    return spec ? (whole ? chartStore.loadChart(spec, retry) : chartStore.loadBrief(spec)) : Promise.resolve(null);
  };
  /** The tiers a song has: the server makes no top tier on a song too calm for it (it answers 404). */
  const tiersOn = (song: Song): DifficultyTier[] =>
    song.status === 'ready' ? tiers.filter((t) => !tierAbsent(chartStore, tierChart(song, t.id).key)) : tiers;
  /** The tier a song is played on for the one chosen: the hardest it has up to that one. */
  const tierOn = (song: Song, tier: string): string => tierUpTo(tiersOn(song), tier);


  // which songs (every one, or the favourites), then the search, in the order chosen
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = songs.filter((s) => inFolder(s, folder, favorites) && (!q || `${s.title} ${s.artist}`.toLowerCase().includes(q)));
    return sortSongs(shown, sort);
  }, [songs, query, folder, favorites, sort?.key, sort?.dir]);
  // The song under the cursor is always one the list shows: a folder or a search that leaves the
  // chosen one out puts the cursor on its first song, and with no song shown nothing is selected
  // (or played).
  const selected = filtered.find((s) => s.id === selectedSongId) ?? filtered[0] ?? null;
  const difficulty = selected ? tierOn(selected, chosen) : chosen;
  const tiersShown = selected ? tiersOn(selected) : tiers;
  useEffect(() => {
    if (selected && selected.id !== selectedSongId) onSelectSong(selected.id);
  }, [selected?.id, selectedSongId]);

  const refresh = useCallback(async () => {
    try {
      const list = await api.songs();
      setSongs(list);
      setLoaded(true);
      return list;
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) setHealth('offline');
      return null;
    }
  }, []);

  /** Asks the server how it is, and for the songs; `quiet` keeps what shows meanwhile (the offline panel). */
  const connect = useCallback(
    async (quiet = false) => {
      if (!quiet) setHealth(null);
      try {
        const h = await api.health();
        // the levels kept from an earlier run of this generator are there before the list
        chartStore.remember(h.generator);
        setHealth(h);
        const list = await refresh();
        if (list && list.length > 0 && !list.some((s) => s.id === selectedSongId)) onSelectSong(list[0].id);
      } catch {
        setHealth('offline');
      }
    },
    [refresh, selectedSongId, onSelectSong],
  );

  // Connect on mount, and again every few seconds while the server does not answer
  useEffect(() => {
    void connect();
  }, []);
  const offline = health === 'offline';
  useEffect(() => {
    if (!offline) return;
    const id = window.setInterval(() => void connect(true), RECONNECT_MS);
    return () => window.clearInterval(id);
  }, [offline, connect]);
  // the offline panel's 다시 연결 has the focus (Enter, a pad's A)
  const offlinePanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (offline) offlinePanel.current?.querySelector<HTMLElement>('[data-testid="reconnect"]')?.focus();
  }, [offline]);
  // An empty library on a server that answers: the first things to do in the song's place, the
  // first of them focused (and again when a panel over them closes); a song added takes them away.
  const firstRun = loaded && !offline && songs.length === 0;
  const startPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (firstRun && panel === 'none') startPanel.current?.querySelector<HTMLElement>('button')?.focus();
  }, [firstRun, panel]);

  // Poll while something is being analyzed (a song turning ready is seen soon: its charts are made then).
  const analyzing = songs.some((s) => s.status === 'queued' || s.status === 'analyzing');
  useEffect(() => {
    if (!analyzing) return;
    const id = window.setInterval(() => void refresh(), ANALYSIS_POLL_MS);
    return () => window.clearInterval(id);
  }, [analyzing, refresh]);

  // Edited and imported charts of the selected song.
  const loadSaved = useCallback(async (songId: string | null) => {
    if (!songId) {
      setSavedCharts({ songId, charts: [] });
      return;
    }
    try {
      setSavedCharts({ songId, charts: await api.savedCharts(songId) });
    } catch {
      setSavedCharts({ songId, charts: [] });
    }
  }, []);
  useEffect(() => {
    void loadSaved(selected?.id ?? null);
  }, [selected?.id, loadSaved]);

  // The entries of the difficulty row: the tiers, then the song's edited
  // and imported charts of this key mode, each its own. The one chosen last on a song's key mode
  // is kept with the song (a tier otherwise: the one chosen last anywhere).
  const savedLoaded = selected !== null && savedCharts.songId === selected.id;
  const savedOnMode = savedLoaded ? savedCharts.charts.filter((c) => c.keyMode === keyMode) : [];
  const pickKey = selected ? chartPickKey(selected.id, keyMode) : null;
  const picked = pickKey ? chartPickOf(settings, pickKey) : null;
  const savedEntry = (picked && savedOnMode.find((c) => c.chartId === picked)) || null;
  // the chart of the selected tier, and what is kept for the chart chosen (its practice, its target level)
  const tierEntry = selected && !savedEntry ? tierChart(selected, difficulty) : null;
  const pattern = selected && !savedEntry ? patternOf(settings, tierKey(selected, difficulty)) : null;
  const entryChartKey = savedEntry ? savedChartKey(savedEntry.chartId) : (tierEntry?.key ?? null);
  const practiceKey = selected && pickKey ? (savedEntry ? `${pickKey}|${savedEntry.chartId}` : tierKey(selected, difficulty)) : null;
  const practice = (practiceKey && props.practices[practiceKey]) || null;
  const setPractice = (p: PracticeOptions | null) => practiceKey && props.onPractice(practiceKey, p);
  const ready = selected?.status === 'ready';
  // the chart Enter plays, once it is loaded (the panels and the summary show it)
  const chart = ready && entryChartKey ? chartStore.chart(entryChartKey) : null;

  // A move to another chart (another song, key mode, difficulty, pattern, options, a new analysis)
  // ends what was asked for the one before: an error about it goes, and a chart it was waiting for
  // does not start a play.
  const selectionRun = useRef(0);
  useEffect(() => {
    selectionRun.current++;
    setError(null);
  }, [selected?.id, keyMode, entryChartKey, selected?.status]);
  useEffect(() => setNotice(null), [selected?.id]);

  // Once the cursor rests on a song: the chart of the selected entry (the panels, the summary and
  // Enter want it), then the levels of the other tiers, one at a time. The server makes the chart
  // of the entry once and keeps it; the store keeps what came for the next visit, and asks again
  // what found the server down then (each visit, and a new connection, asks).
  // (a song whose saved chart was chosen last waits for its list: that chart is the one wanted first)
  const entryLoading = picked !== null && !savedLoaded;
  const prefetchKey = selected && ready && !entryLoading ? `${tiers.map((t) => tierChart(selected, t.id).key).join(' ')} ${entryChartKey}` : null;
  // the song the cursor stayed on while it was analyzed: once ready, its charts are asked for at
  // once (the server started them as the analysis ended; the cursor has rested long enough)
  const analyzedUnderCursor = useRef<string | null>(null);
  useEffect(() => {
    if (!selected || !ready || prefetchKey === null) return;
    const song = selected;
    const entry = savedEntry;
    const at = difficulty;
    let alive = true;
    const delay = analyzedUnderCursor.current === song.id ? 0 : PREFETCH_DELAY_MS;
    const timer = window.setTimeout(async () => {
      if (entry) await chartStore.loadSaved(entry.chartId);
      // Mapperatorinator makes a chart when it is played (a minute or more on the GPU), not when
      // the cursor rests on it: its brief only
      else await loadTier(song, at, !chartStore.aiCharts);
      for (const t of tiers) {
        if (!alive) return;
        if (entry || t.id !== at) await loadTier(song, t.id, false);
      }
      // a chart chosen from the records that the server no longer has (the song was taken out and
      // added again, another data folder): its tier goes back to the default pattern
      const gone = tiers.filter((t) => {
        const c = tierChart(song, t.id);
        return c.chartId !== null && chartStore.failure(c.key) === 404;
      });
      if (alive && gone.length > 0) onSettingsChange(gone.reduce((next, t) => withPattern(next, tierKey(song, t.id), null), current.current));
    }, delay);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [prefetchKey, health]);
  // (after the effect above, which reads it when the song turns ready)
  useEffect(() => {
    analyzedUnderCursor.current = selected && !ready ? selected.id : null;
  }, [selected?.id, ready]);

  // Mapperatorinator makes the chart played, then the other tiers of its key mode, one at a time:
  // while one of the song's tiers is being made or waits (or Enter waits for one), their plates
  // ask again every few seconds, so a chart made shows its level and notes
  const aiPending =
    selected !== null && ready && chartStore.aiCharts && prefetchKey !== null
      ? makingKeys.size > 0 ||
        tiers.some((t) => {
          const b = chartStore.brief(tierChart(selected, t.id).key);
          return b?.predicted === true && (b.making === true || b.queued === true);
        })
      : false;
  useEffect(() => {
    if (!aiPending || !selected) return;
    const song = selected;
    const timer = window.setInterval(() => {
      for (const t of tiers) {
        const { spec, key } = tierChart(song, t.id);
        if (spec && chartStore.brief(key)?.predicted) void chartStore.refreshBrief(spec);
      }
    }, AI_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [aiPending, prefetchKey]);

  // The background video's shift in its sheet follows the song's saved one (not while it is being changed)
  useEffect(() => {
    bgaShiftDirty.current = false;
    setBgaShiftDraft(String(selected?.bgaOffsetMs ?? 0));
  }, [selected?.id]);
  useEffect(() => {
    if (!bgaShiftDirty.current) setBgaShiftDraft(String(selected?.bgaOffsetMs ?? 0));
  }, [selected?.bgaOffsetMs]);

  // Highlight preview of the selected song: fades in, loops, fades out when leaving the song. It
  // plays on behind the settings (App), so coming back from them keeps the one playing; until the
  // song list is back, nothing is decided.
  const listed = songs.length > 0;
  useEffect(() => {
    if (!selected || selected.status !== 'ready') {
      if (listed) menuMusic.stop();
      return;
    }
    if (menuMusic.playing(selected.id)) return;
    menuMusic.stop();
    const timer = window.setTimeout(() => {
      menuMusic.play(selected.id, api.audioUrl(selected.id), selected.previewMs ?? 0, settings.musicVolume * PREVIEW_VOLUME);
    }, 350);
    return () => window.clearTimeout(timer);
    // Restart the preview only when the song (or its readiness) changes, not on volume edits.
  }, [selected?.id, selected?.status, listed]);

  /**
   * Puts the cursor on a song just added (uploaded, imported, a demo): a search or the favourites
   * that would leave it out give way (the list goes back to every song), or the cursor could not
   * stay on it. `next` is the settings to go on from (an import puts its key mode and chart there).
   */
  const selectAdded = (song: Song, list: Song[] | null, next: Settings = current.current) => {
    const added = list?.find((s) => s.id === song.id) ?? song;
    setQuery((q) => (`${added.title} ${added.artist}`.toLowerCase().includes(q.trim().toLowerCase()) ? q : ''));
    const shown = inFolder(added, next.songFolder, new Set(next.favorites));
    if (!shown || next !== current.current) onSettingsChange(shown ? next : { ...next, songFolder: 'all' });
    onSelectSong(added.id);
  };

  const upload = async (files: FileList | File[]) => {
    setError(null);
    for (const file of Array.from(files)) {
      setBusy(`${file.name} 올리는 중…`);
      try {
        const { song } = await api.upload(file);
        selectAdded(song, await refresh());
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    setBusy(null);
  };

  /**
   * Chart packages: files picked one by one, a picked or dropped folder, or .zip/.osz archives
   * (with the pictures their charts name for a cover). The first chart imported is chosen, on its
   * key mode.
   */
  const importFiles = async (list: FileList | DroppedFile[]) => {
    const all = Array.from<File | DroppedFile, DroppedFile>(list, (f) => (f instanceof File ? { file: f, path: f.webkitRelativePath || f.name } : f));
    if (!all.some((f) => CHART_FILE.test(f.file.name))) {
      setError('가져올 채보 파일이 없습니다 (.osz · .zip · .osu · .bms · .bme · .bml · .bmson)');
      return;
    }
    setBusy('채보 가져오는 중… (키음이 많으면 시간이 걸립니다)');
    setError(null);
    setImportReport(null);
    try {
      const pictures = await namedPictures(all, (name) => CHART_FILE.test(name), (name) => IMAGE_FILE.test(name));
      const result = await api.importPackage([...all.filter((f) => IMPORT_FILE.test(f.file.name)), ...pictures]);
      setImportReport(result);
      const list = await refresh();
      const first = result.charts[0];
      if (result.songs.length > 0) {
        const song = result.songs.find((s) => s.id === first?.songId) ?? result.songs[0];
        let next = current.current;
        if (first && enabledKeyModes.includes(first.keyMode)) next = withChartPick({ ...next, lastKeyMode: first.keyMode }, chartPickKey(first.songId, first.keyMode), first.chartId);
        selectAdded(song, list, next);
        await loadSaved(song.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  };

  const watchReplay = async (replay: ReplayData, song: Song | null = selected) => {
    setError(null);
    try {
      const target = song && song.id === replay.songId ? song : replay.songId ? await api.song(replay.songId) : null;
      if (!target) throw new Error('리플레이의 곡이 라이브러리에 없습니다');
      const c = chart?.meta.chartId === replay.chartId ? chart : await api.chart(replay.chartId);
      onPlay(buildPlayRequest(target, c, settings, { autoPlay: false, replay }));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? '리플레이의 채보를 찾을 수 없습니다' : e instanceof Error ? e.message : String(e));
    }
  };

  const openReplayFile = async (file: File) => {
    try {
      const data: unknown = JSON.parse(await file.text());
      if (!isReplay(data)) throw new Error('리플레이 파일이 아닙니다');
      await watchReplay(data, null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const watchBest = async (scoreId: number) => {
    try {
      await watchReplay(await api.replay(scoreId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /** Chooses an entry of the difficulty row: a tier, or a saved chart of the song (by id). */
  const pickEntry = (entry: { tier: string } | { chartId: string }) => {
    if (!pickKey) return;
    const next = withChartPick(settings, pickKey, 'chartId' in entry ? entry.chartId : null);
    onSettingsChange('tier' in entry ? { ...next, lastDifficulty: entry.tier } : next);
  };

  // (asked once more by its button: a second press, see useTwoPress)
  const deleteSaved = async (c: SavedChart) => {
    await api.deleteChart(c.chartId).catch((e: Error) => setError(e.message));
    if (pickKey && chartPickOf(current.current, pickKey) === c.chartId) onSettingsChange(withChartPick(current.current, pickKey, null));
    await loadSaved(selected?.id ?? null);
    await refresh();
  };

  const addDemo = async () => {
    setBusy('데모 곡 만드는 중…');
    setError(null);
    try {
      const song = await api.addDemo(128, 48);
      selectAdded(song, await refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  };

  /**
   * The chart of the selected entry, loaded now if it is not yet (a play, a practice): an error
   * says why it could not be. Null when the cursor moved on meanwhile, or before the entry is
   * known (the song's saved chart chosen last, its list not here yet).
   */
  const loadSelected = async (): Promise<ServerChart | null> => {
    if (!selected || !ready || !entryChartKey || entryLoading) return null;
    const kept = chartStore.chart(entryChartKey);
    if (kept) return kept;
    const run = selectionRun.current;
    setBusy('채보 생성 중…');
    markMaking(entryChartKey, true);
    try {
      const c = (savedEntry ? await chartStore.loadSaved(savedEntry.chartId, true) : await loadTier(selected, difficulty, true, true)) as ServerChart | null;
      // the cursor moved on while the server was making it: it is not for the chart chosen now
      return run === selectionRun.current ? c : null;
    } catch (e) {
      if (run === selectionRun.current) setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(null);
      markMaking(entryChartKey, false);
    }
  };

  /**
   * Mapperatorinator makes a chart in minutes on the GPU: Enter on a tier not made yet asks the
   * server for it and comes back at once. Its plate says so, the status line names it, and any
   * chart already made can be played meanwhile; when it is done its plate shows its level, and
   * Enter plays it (it does not start by itself: minutes may have passed).
   */
  const makeAi = async (song: Song, tier: string, key: string, spec: ChartSpec) => {
    const name = `${song.title} ${tier}`;
    if (makingRef.current.has(key)) {
      setNotice(`${name} 채보는 만들고 있습니다. 다 되면 Enter로 플레이합니다.`);
      return;
    }
    markMaking(key, true);
    setError(null);
    setNotice(`채보를 만들고 있습니다: ${name} (곡 길이에 따라 1–3분). 다른 채보는 그동안 플레이할 수 있습니다.`);
    try {
      const c = await chartStore.loadChart(spec, true);
      if (c) setNotice(`${name} 채보가 준비되었습니다 (레벨 ${c.meta.level}${aiMakingLabel(c.meta) ? `, ${aiMakingLabel(c.meta)}` : ''}). Enter로 플레이합니다.`);
    } catch (e) {
      setNotice(null);
      setError(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      markMaking(key, false);
    }
  };

  // one play per press: a held Enter or a second press while the chart is generated starts nothing more
  const starting = useRef(false);
  /** Plays the chart chosen; `auto` plays it on autoplay (Shift+Enter, the menu's 오토 플레이: nothing is recorded). */
  const play = async ({ auto = false }: { auto?: boolean } = {}) => {
    if (!selected || selected.status !== 'ready' || busy !== null || starting.current) return;
    starting.current = true;
    try {
      if (chartStore.aiCharts && !savedEntry && entryChartKey && !entryLoading && !chartStore.chart(entryChartKey)) {
        // a chart Mapperatorinator has not made yet is asked for in the background (makeAi)
        const { spec, key } = tierChart(selected, difficulty);
        const brief = spec ? (chartStore.brief(key) ?? (await chartStore.loadBrief(spec))) : null;
        if (spec && brief?.predicted) {
          void makeAi(selected, difficulty, key, spec);
          return;
        }
      }
      const c = await loadSelected();
      if (!c || (c.meta.songId && c.meta.songId !== selected.id)) return;
      const best = recordOf(selected, c.meta.chartId);
      // the start card's jacket comes from where this one stands
      setJacketOrigin(jacket.current?.getBoundingClientRect() ?? null);
      onPlay(
        buildPlayRequest(selected, c, settings, {
          autoPlay: auto,
          best: best ? { score: best.score, rate: best.rate, scoreId: best.bestScoreId, hasReplay: best.hasReplay } : null,
          practice: practice ?? undefined,
        }),
      );
    } finally {
      starting.current = false;
    }
  };

  /**
   * F5: another pattern of the selected tier (a new seed), kept as its pattern from now on: Enter,
   * the plates and the records follow it. Shift+F5 goes back to the default pattern.
   */
  const newPattern = async () => {
    if (!selected || !ready || busy !== null || savedEntry || entryLoading) return;
    const key = tierKey(selected, difficulty);
    const base = specOf(selected, difficulty, null);
    const plate = tierChart(selected, difficulty).key;
    // with Mapperatorinator (minutes) the screen stays free meanwhile, as for a chart asked for by Enter
    const ai = chartStore.aiCharts;
    if (ai) {
      if (makingRef.current.has(plate)) return;
      setNotice(`새 패턴을 만들고 있습니다: ${selected.title} ${difficulty} (곡 길이에 따라 1–3분).`);
    } else setBusy('새 패턴 만드는 중…');
    markMaking(plate, true);
    setError(null);
    try {
      const { chart: c } = await api.generate(selected.id, { ...requestOf(base), seed: null, newSeed: true });
      const seed = c.meta.generator?.seed;
      if (seed === undefined) return;
      chartStore.put(chartKey({ ...base, seed }), c);
      onSettingsChange(withPattern(current.current, key, seed));
      if (ai) setNotice(`${selected.title} ${difficulty}의 새 패턴이 준비되었습니다 (레벨 ${c.meta.level}${aiMakingLabel(c.meta) ? `, ${aiMakingLabel(c.meta)}` : ''}). Enter로 플레이합니다.`);
    } catch (e) {
      if (ai) setNotice(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!ai) setBusy(null);
      markMaking(plate, false);
    }
  };
  const defaultPattern = () => {
    if (selected && pattern !== null) onSettingsChange(withPattern(settings, tierKey(selected, difficulty), null));
  };
  /** The selected tier's pattern from the records (a chart chosen by its id is played as it was made). */
  const pickPattern = (p: Pattern | null) => {
    if (selected) onSettingsChange(withPattern(settings, tierKey(selected, difficulty), p));
  };

  const reanalyze = async () => {
    if (!selected) return;
    setError(null);
    try {
      await api.reanalyze(selected.id);
      forgetSongBuffer(selected.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const uploadBga = async (file: File) => {
    if (!selected) return;
    setBusy('배경 영상 올리는 중…');
    setError(null);
    try {
      await api.uploadBga(selected.id, file);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  };

  const removeBga = async () => {
    if (!selected) return;
    await api.deleteBga(selected.id).catch((e: Error) => setError(e.message));
    await refresh();
  };

  const uploadCover = async (file: File) => {
    if (!selected) return;
    setError(null);
    try {
      await api.uploadCover(selected.id, file);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const removeCover = async () => {
    if (!selected) return;
    await api.deleteCover(selected.id).catch((e: Error) => setError(e.message));
    await refresh();
  };

  // Practice runs on the chart: turned on before it is loaded, it loads it first.
  const togglePractice = async (on: boolean) => {
    if (!on) {
      setPractice(null);
      return;
    }
    const c = chart ?? (busy === null ? await loadSelected() : null);
    if (!c || c.notes.length === 0) return;
    // Start on the bar of the first note and take eight bars.
    const bars = new TempoMap(c.timing).barLines(c.meta.durationMs ?? 0);
    const first = Math.min(...c.notes.map((n) => n.t));
    let i = bars.findIndex((b) => b > first);
    i = i < 0 ? Math.max(0, bars.length - 1) : Math.max(0, i - 1);
    const startMs = bars[i] ?? 0;
    const endMs = bars[Math.min(bars.length - 1, i + 8)] ?? c.meta.durationMs ?? startMs + 15000;
    setPractice({ startMs, endMs: endMs > startMs ? endMs : startMs + 15000, rate: 1, loop: true });
  };

  /** Saves song settings; false when the server refused them (the error is shown). */
  const patch = async (body: Parameters<typeof api.patchSong>[1]): Promise<boolean> => {
    if (!selected) return false;
    setError(null);
    try {
      await api.patchSong(selected.id, body);
      forgetSongBuffer(selected.id);
      await refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  // (asked once more by its button, as deleteSaved)
  const remove = async () => {
    if (!selected) return;
    const id = selected.id;
    try {
      await api.deleteSong(id);
      // what was kept for it goes with it (added again, it would come back with the same id)
      onSettingsChange(withoutSong(current.current, id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    const list = await refresh();
    onSelectSong(list && list.length > 0 ? list[0].id : null);
  };

  const setKeyMode = (m: KeyModeId) => onSettingsChange({ ...settings, lastKeyMode: m });
  const setDifficulty = (d: string) => pickEntry({ tier: d });
  /** ←→: the next entry of the difficulty row (the tiers the song has, then the saved charts), none past either end. */
  const stepEntry = (dir: 1 | -1) => {
    const row = tiersShown;
    const at = savedEntry ? row.length + savedOnMode.indexOf(savedEntry) : row.findIndex((t) => t.id === difficulty);
    const next = at + dir;
    if (next < 0 || next >= row.length + savedOnMode.length) return;
    pickEntry(next < row.length ? { tier: row[next].id } : { chartId: savedOnMode[next - row.length].chartId });
  };
  const toggleFavorite = (id: string) => {
    const was = favorites.has(id);
    onSettingsChange({ ...settings, favorites: was ? settings.favorites.filter((f) => f !== id) : [...settings.favorites, id] });
    say(was ? '즐겨찾기에서 뺐습니다' : '즐겨찾기에 넣었습니다');
  };
  const toggleSelectedFavorite = () => {
    if (selected) toggleFavorite(selected.id);
  };
  /**
   * A press on a filter (its key 1 to 5, its chip, its row of the filter sheet): 전체 and 즐겨찾기
   * choose which songs are listed (즐겨찾기 again goes back to every song), each of the three names
   * orders them: downward, a second press upward, a third no order. A filter that leaves the
   * selected song out puts the cursor on its first song (see `selected`).
   */
  const pressFilter = (f: SongFilter) => {
    if (f === 'all' || f === 'favorites') {
      const next: SongFolder = f === 'all' || folder === 'favorites' ? 'all' : 'favorites';
      if (next === folder) return;
      onSettingsChange({ ...settings, songFolder: next });
      say(next === 'favorites' ? '즐겨찾기한 곡만' : '모든 곡');
      return;
    }
    const next = nextSongSort(sort, f);
    onSettingsChange({ ...settings, songSort: next });
    say(sortSaid(f, next));
  };

  const screen = useRef<HTMLDivElement>(null);
  const songList = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const jacket = useRef<HTMLDivElement>(null);
  // how many rows the wheel shows on each side of the picked one (its height decides)
  const [reach, setReach] = useState(4);
  useLayoutEffect(() => {
    const list = songList.current;
    if (!list) return;
    const measure = () => setReach(wheelReach(list.clientHeight / (Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);
  // a song row that has the focus (it was clicked, or a panel closed on it) hands it to the row the
  // cursor moves to, so one row looks selected; the new row may only be drawn by the move itself
  const rowHadFocus = useRef(false);
  /** Puts the cursor on the song at `index` of the list (the focus follows when a row has it). */
  const cursorTo = (index: number) => {
    const song = filtered[index];
    if (!song || song.id === selected?.id) return;
    rowHadFocus.current = document.activeElement instanceof HTMLElement && Boolean(songList.current?.contains(document.activeElement));
    onSelectSong(song.id);
  };
  useEffect(() => {
    if (!rowHadFocus.current) return;
    rowHadFocus.current = false;
    if (selected) songList.current?.querySelector<HTMLElement>(`[data-song-id="${selected.id}"]`)?.focus({ preventScroll: true });
  }, [selected?.id]);
  /** A page of PageUp / PageDown: the rows under the cursor, and one more, so every row passes through the wheel. */
  const pageRows = () => reach + 1;
  const randomSong = () => {
    const at = randomIndex(filtered.length, filtered.findIndex((s) => s.id === selected?.id));
    if (at >= 0) cursorTo(at);
  };
  /**
   * The song row under the cursor takes the focus (leaving the search, a panel or a sheet); with
   * no server, the offline panel's 다시 연결 (as when it came), and in an empty library its first
   * button; else nothing does.
   */
  const focusList = () => {
    const row = selected ? songList.current?.querySelector<HTMLElement>(`[data-song-id="${selected.id}"]`) : null;
    const button = offline
      ? offlinePanel.current?.querySelector<HTMLElement>('[data-testid="reconnect"]')
      : firstRun
        ? startPanel.current?.querySelector<HTMLElement>('button')
        : null;
    if (row) row.focus({ preventScroll: true });
    else if (button) button.focus();
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };

  const closePanel = () => {
    setPanel('none');
    focusList();
  };
  const togglePanel = (p: Exclude<Panel, 'none'>) => (panel === p ? closePanel() : setPanel(p));
  const stepInfoTab = (dir: 1 | -1) => setInfoTab((t) => INFO_TABS[(INFO_TABS.indexOf(t) + dir + INFO_TABS.length) % INFO_TABS.length]);
  const openSheet = (id: SheetId) => {
    setYoutubeDraft(null);
    setSheet(id);
  };
  /** Closes the sheet; the focus goes back to the list (`run`: what its row was pressed for, done once it is closed). */
  const closeSheet = (run?: () => void) => {
    setSheet(null);
    setYoutubeDraft(null);
    focusList();
    run?.();
  };
  // the search: Enter leaves it with what was typed, Esc gives it up (what was typed goes, and the
  // cursor is back on the song it left)
  const searchFrom = useRef<string | null>(null);
  const endSearch = (clear: boolean) => {
    const back = clear && searchFrom.current && songs.some((s) => s.id === searchFrom.current) ? searchFrom.current : null;
    searchFrom.current = null;
    if (clear) setQuery('');
    if (back && back !== selected?.id) {
      // the row it goes back to is drawn by this change: the focus follows it (the effect above)
      rowHadFocus.current = true;
      searchBox.current?.blur();
      onSelectSong(back);
    } else focusList();
  };

  /**
   * The keys of an open panel (Space, I): Q / E (and PageUp / PageDown, LB / RB) change the song
   * info's page; ↑↓ go from line to line (the pages' names are the line above a page's first row,
   * so the menu buttons of any controller reach every page), ←→ change the focused row, pick the
   * neighbour of a chosen choice (a page, on the pages' names) or move along a line of buttons,
   * Home / End go to the first or the last line, and Enter presses a focused button or box. On a
   * page with nothing to press (a chart's numbers, its records) ←→ are the difficulty's. The rest
   * is the screen's (Enter plays). True when the key was the panel's.
   */
  const panelKey = (e: KeyboardEvent): boolean => {
    const root = screen.current?.querySelector<HTMLElement>('.select-panel');
    const body = root?.querySelector<HTMLElement>('.select-panel-body');
    if (!root || !body) return false;
    const at = document.activeElement instanceof HTMLElement && root.contains(document.activeElement) ? document.activeElement : null;
    const tabKey = e.code === 'KeyQ' || e.code === 'KeyE' || e.code === 'PageUp' || e.code === 'PageDown';
    if (tabKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // (the play options have no pages: the page keys rest, the list under them does not move)
      if (panel !== 'info') return e.code.startsWith('Page');
      e.preventDefault();
      if (!e.repeat) stepInfoTab(e.code === 'KeyQ' || e.code === 'PageUp' ? -1 : 1);
      return true;
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      // a focused button, link or box is pressed (an option row or a choice leaves Enter to the play)
      if (!at || !pressesOnEnter(at)) return false;
      e.preventDefault();
      if (!e.repeat) at.click();
      return true;
    }
    const rows = panelStops(body);
    const go = (el: HTMLElement | undefined) => {
      el?.focus();
      el?.scrollIntoView({ block: 'nearest' });
    };
    if ((e.code === 'Home' || e.code === 'End') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      go(rows[edgeLine(panelLines(rows), e.code === 'End')]);
      return true;
    }
    if (!e.code.startsWith('Arrow')) return false;
    e.preventDefault();
    const tabs = root.querySelector<HTMLElement>('[role="tablist"]');
    const stops = [...(tabs ? panelStops(tabs) : []), ...rows];
    const lines = panelLines(stops);
    const from = at ? stops.indexOf(at) : -1;
    if (rows.length === 0 && from < 0) {
      // nothing to press on this page: ←→ go through the difficulties (its numbers follow)
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') stepEntry(e.code === 'ArrowRight' ? 1 : -1);
    } else if (from < 0) {
      // from nowhere (the panel's body) the arrows start on its first row
      go(rows[edgeLine(panelLines(rows), false)]);
    } else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      go(stops[lineStep(lines, from, e.code === 'ArrowDown' ? 1 : -1)]);
    } else {
      // ←→: a choice takes the neighbour of its chosen one, a line of buttons moves the focus along it
      const next = stops[alongLine(lines, from, e.code === 'ArrowRight' ? 1 : -1)];
      if (next?.closest('.segmented, [role="tablist"]')) next.click();
      next?.focus();
    }
    return true;
  };

  // Keyboard: ↑↓ song (PageUp / PageDown a page, Home / End the ends), ←→ difficulty (and the
  // saved charts after it), Enter plays (Shift+Enter on autoplay: a pad's RS), Tab (Shift+Tab
  // back) key mode, 1 to 5 the filters, / or Ctrl+F the search, Space the play options, I the song
  // info, C the cover, V the background video, + adds a song, F2 a random song, F3 a favourite, F5
  // a new pattern (Shift+F5 the default one), F10 the settings, Esc the menu (or closes what is
  // open). An open panel takes the arrows, Home / End and Enter (panelKey) and the list under it
  // rests; an open sheet takes every key (its own listener, before this one). A text field, a
  // slider or a drop-down keeps the keys it uses itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
      if (FUNCTION_KEYS.has(e.code)) {
        // F3 would search the page, F5 reload it and F10 open the browser's menu
        e.preventDefault();
        if (e.repeat) return;
        if (e.code === 'F2') {
          if (panel === 'none') randomSong();
        } else if (e.code === 'F3') toggleSelectedFavorite();
        else if (e.code === 'F5' && e.shiftKey) defaultPattern();
        else if (e.code === 'F5') void newPattern();
        else props.onOpenSettings();
        return;
      }
      if (panel === 'none' && ((e.code === 'KeyF' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) || (e.code === 'Slash' && plain && !e.shiftKey && !keepsKey(e.target, e.code)))) {
        e.preventDefault();
        searchBox.current?.focus();
        searchBox.current?.select();
        return;
      }
      if (e.target === searchBox.current) {
        // the search: ↑↓ and the page keys move the list's cursor, Enter leaves it on that song
        // with what was typed, Esc gives the search up
        if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'NumpadEnter') {
          e.preventDefault();
          endSearch(e.code === 'Escape');
        } else if (e.code === 'ArrowDown' || e.code === 'ArrowUp' || e.code === 'PageDown' || e.code === 'PageUp') {
          e.preventDefault();
          const page = e.code.startsWith('Page') ? pageRows() : 1;
          const at = filtered.findIndex((s) => s.id === selected?.id);
          cursorTo(cursorStep(at, filtered.length, e.code === 'ArrowDown' || e.code === 'PageDown' ? page : -page, !e.repeat));
        }
        return;
      }
      if (e.code === 'Escape') {
        if (e.repeat) return;
        if (panel !== 'none') closePanel();
        // a search that shows no song is given up first: the list comes back
        else if (query.trim() && filtered.length === 0) endSearch(true);
        else openSheet('menu');
        return;
      }
      if (e.code === 'Enter' && e.shiftKey && !keepsKey(e.target, e.code)) {
        // Shift+Enter (a pad's RS) is the autoplay wherever the focus is: it presses no focused button
        e.preventDefault();
        if (!e.repeat) void play({ auto: true });
        return;
      }
      const buttonPanel = offline ? offlinePanel.current : firstRun ? startPanel.current : null;
      if (buttonPanel && e.target instanceof HTMLElement && buttonPanel.contains(e.target)) {
        // the offline panel's buttons, or an empty library's: the arrows go between them, Enter (a
        // pad's A) presses one, and Space too on the offline panel (else it is the play options')
        if (e.code.startsWith('Arrow')) {
          e.preventDefault();
          const buttons = [...buttonPanel.querySelectorAll<HTMLElement>('button')];
          const at = buttons.indexOf(e.target);
          buttons[(at + (e.code === 'ArrowRight' || e.code === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
          return;
        }
        if (e.code === 'Enter' || e.code === 'NumpadEnter' || (offline && e.code === 'Space')) {
          // (pressed here: the select keeps Space's key-up from the buttons)
          e.preventDefault();
          if (!e.repeat) e.target.click();
          return;
        }
      }
      if (firstRun && panel === 'none' && e.code.startsWith('Arrow') && !keepsKey(e.target, e.code)) {
        // the focus left an empty library's buttons (a sheet closed, a file was picked): the arrows bring it back
        e.preventDefault();
        focusList();
        return;
      }
      if (keepsKey(e.target, e.code)) return;
      if (panel !== 'none') {
        if (e.defaultPrevented || panelKey(e)) return;
        // under a panel the list rests: Enter plays, Space and I close the panel or change it
        if (e.code === 'Enter' || e.code === 'NumpadEnter') {
          e.preventDefault();
          if (!e.repeat) void play();
        } else if (e.code === 'Space' && plain) {
          e.preventDefault();
          if (!e.repeat) togglePanel('options');
        } else if (e.code === 'KeyI' && plain && !e.shiftKey) {
          if (!e.repeat) togglePanel('info');
        } else if (e.code === 'Tab') e.preventDefault();
        return;
      }
      const idx = filtered.findIndex((s) => s.id === selected?.id);
      const digit = plain && !e.shiftKey ? /^(?:Digit|Numpad)([1-5])$/.exec(e.code) : null;
      if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        e.preventDefault();
        cursorTo(cursorStep(idx, filtered.length, e.code === 'ArrowDown' ? 1 : -1, !e.repeat));
      } else if (e.code === 'PageDown' || e.code === 'PageUp') {
        e.preventDefault();
        cursorTo(cursorStep(idx, filtered.length, (e.code === 'PageDown' ? 1 : -1) * pageRows(), false));
      } else if ((e.code === 'Home' || e.code === 'End') && plain) {
        e.preventDefault();
        cursorTo(e.code === 'Home' ? 0 : filtered.length - 1);
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        stepEntry(e.code === 'ArrowRight' ? 1 : -1);
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        if (!e.repeat) void play();
      } else if (e.code === 'Tab') {
        e.preventDefault();
        const step = e.shiftKey ? enabledKeyModes.length - 1 : 1;
        setKeyMode(enabledKeyModes[(enabledKeyModes.indexOf(keyMode) + step) % enabledKeyModes.length]);
      } else if (e.code === 'Space' && plain) {
        // a focused button is not pressed by it: Space is the play options' key here
        e.preventDefault();
        if (!e.repeat) togglePanel('options');
      } else if (digit) {
        e.preventDefault();
        if (!e.repeat) pressFilter(SONG_FILTERS[Number(digit[1]) - 1]);
      } else if (e.code === 'KeyI' && plain && !e.shiftKey) {
        if (!e.repeat) togglePanel('info');
      } else if ((e.code === 'KeyC' || e.code === 'KeyV') && plain && !e.shiftKey) {
        if (!e.repeat && selected) openSheet(e.code === 'KeyC' ? 'cover' : 'video');
      } else if ((e.key === '+' || e.code === 'Equal' || e.code === 'NumpadAdd') && plain) {
        e.preventDefault();
        if (!e.repeat && !offline) openSheet('add');
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !keepsKey(e.target, e.code)) e.preventDefault();
    };
    // (no key reaches this listener while a sheet is open: the sheet stops them on their way down)
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  });

  // Whether Enter presses what has the focus (a panel's button or box, an empty library's button), for the key hints; a
  // render can take the focused control away (a panel closing, a tab changing), so it is read
  // after every render as well as on every move of the focus.
  const [enterPresses, setEnterPresses] = useState(false);
  // whether the open panel has anything to press (a page of the song info may have nothing: its ←→ are the difficulty's)
  const [panelPresses, setPanelPresses] = useState(false);
  const readFocus = useCallback(() => {
    const at = document.activeElement;
    const body = screen.current?.querySelector<HTMLElement>('.select-panel .select-panel-body');
    setPanelPresses(Boolean(body && panelStops(body).length > 0));
    setEnterPresses(Boolean(at && [...(screen.current?.querySelectorAll('.select-panel, .first-run') ?? [])].some((el) => el.contains(at))) && pressesOnEnter(at));
  }, []);
  useEffect(readFocus);
  useEffect(() => {
    window.addEventListener('focusin', readFocus);
    window.addEventListener('focusout', readFocus);
    return () => {
      window.removeEventListener('focusin', readFocus);
      window.removeEventListener('focusout', readFocus);
    };
  }, [readFocus]);

  /** A drop: a chart package or its folder (as the folder picker gives it), a replay file, or music. */
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    // the entries are taken now (the drop's data is gone once the handler returns); a file with
    // no entry (a page's own drop) is taken as it is
    const dropped = [...e.dataTransfer.items].filter((item) => item.kind === 'file').map((item) => item.webkitGetAsEntry() ?? item.getAsFile());
    // a text or a link dragged across the page is no file: nothing to say about it
    if (dropped.length === 0) return;
    void (async () => {
      try {
        const files = (await Promise.all(dropped.map((d) => (d instanceof File ? [{ file: d, path: d.name }] : d ? entryFiles(d) : [])))).flat();
        const drop = sortDrop(files);
        if (drop?.kind === 'import') await importFiles(drop.files);
        else if (drop?.kind === 'replay') await openReplayFile(drop.file);
        else if (drop?.kind === 'upload') await upload(drop.files);
        else setError('음악 파일 · 채보 파일이나 폴더 · 리플레이 파일을 놓을 수 있습니다');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  };

  /** A tier's chart is being worked out, so its record is not known yet either (a chart chosen by its id is known at once). */
  const recordPending = (song: Song, tier: string): boolean => {
    if (song.status !== 'ready') return false;
    const { key, chartId } = tierChart(song, tier);
    return chartId === null && !chartStore.brief(key) && !chartStore.hasFailed(key);
  };
  /**
   * The record a plate shows: its chart's (the pattern Enter plays, known by its brief, or chosen
   * by its id). A song being analysed again (or whose analysis failed), and a chart that could not
   * be made, have no chart to speak of: the tier's best of any chart.
   */
  const tierRecord = (song: Song, tier: string): ScoreRecord | null => {
    if (song.status === 'ready') {
      const { key, chartId } = tierChart(song, tier);
      const known = chartId ?? chartStore.brief(key)?.chartId;
      if (known || !chartStore.hasFailed(key)) return recordOf(song, known);
    }
    return bestByTier(recordsOn(song, keyMode)).get(tier) ?? null;
  };
  // the record of the chart chosen (the pattern Enter plays, or the saved chart): on the summary
  const selectedTier = tierOf(difficulty);
  const entryRecord = !selected ? null : savedEntry ? recordOf(selected, savedEntry.chartId) : tierRecord(selected, difficulty);
  // known once the tier's chart is (a saved chart's at once; a song not analysed shows the tier's best)
  const entryKnown = !selected || savedEntry !== null || !recordPending(selected, difficulty);
  // the generator of the moment (a chart of another one is played as it was made)
  const generator = health && health !== 'offline' ? health.generator : null;

  // The wheel's rows: the chart Enter plays on each tier of each song listed is worked out when
  // the list or the patterns change, and its level and lamp are looked up again as levels come in.
  const listCharts = useMemo(() => filtered.map((s) => tiers.map((t) => tierChart(s, t.id).key)), [filtered, keyMode, settings.patterns]);
  const listCells = useMemo(
    () =>
      filtered.map((s, i): ListCells => {
        const records = recordsOn(s, keyMode);
        return {
          tiers: tiers.map((t, j) => ({
            tier: t,
            ...tierMark(records, t.id, s.status === 'ready' ? chartStore.brief(listCharts[i][j]) : null),
            absent: s.status === 'ready' && tierAbsent(chartStore, listCharts[i][j]),
          })),
          saved: savedMark(savedRecordsOn(s, keyMode)),
        };
      }),
    [listCharts, chartsIn],
  );

  // the keys of the list, or of the open panel; a pad's buttons while the pad is used (the minor
  // ones give way on a narrow window, so the bar keeps what Enter does). With no server, the
  // offline panel's; with no songs, 곡 추가 and what needs no song (the play options, and the
  // song info's tools: the sync test, the calibration).
  const padOnly = (pad: string[], label: string, testId?: string): KeyHint => ({ keys: [], pad, label, testId });
  // (a panel opened over the offline one has its own keys)
  const offlineKeys = offline && panel === 'none';
  const optionsHint: KeyHint = { keys: ['Space'], pad: ['X'], label: '플레이 옵션', onClick: () => togglePanel('options'), testId: 'hint-options' };
  const infoHint: KeyHint = { keys: ['I'], pad: ['LT'], label: '곡 정보·도구', onClick: () => togglePanel('info'), testId: 'hint-info' };
  const modeHint: KeyHint = { keys: ['Tab'], pad: ['Y'], label: '키 모드' };
  const hints: KeyHint[] = offlineKeys
    ? [{ keys: ['←', '→'], pad: ['←', '→'], label: '버튼' }, padOnly(['RT'], '설정')]
    : panel === 'options'
      ? [
          { keys: ['↑', '↓'], pad: ['↑', '↓'], label: '항목' },
          { keys: ['←', '→'], pad: ['←', '→'], label: '값' },
          { keys: ['Shift'], label: '큰 단계', minor: true },
        ]
      : panel === 'info'
        ? [
            { keys: ['Q', 'E'], pad: ['LB', 'RB'], label: '탭' },
            // a page with nothing to press: its ←→ go through the difficulties
            ...(panelPresses ? [{ keys: ['↑', '↓'], pad: ['↑', '↓'], label: '항목' }, { keys: ['←', '→'], pad: ['←', '→'], label: '값' }] : selected ? [{ keys: ['←', '→'], pad: ['←', '→'], label: '난이도' }] : []),
          ]
        : songs.length === 0
          ? [
              ...(firstRun ? [{ keys: ['↑', '↓'], pad: ['↑', '↓'], label: '버튼' }] : []),
              { keys: ['+'], label: '곡 추가', onClick: () => openSheet('add'), testId: 'hint-add' },
              modeHint,
              optionsHint,
              infoHint,
              padOnly(['RT'], '설정'),
            ]
          : filtered.length === 0
            ? // a filter or a search that shows no song: the keys that change it, and what needs no song
              [
                { keys: ['1'], label: '전체', onClick: () => pressFilter('all'), testId: 'hint-all' },
                { keys: ['/'], label: '검색', onClick: () => searchBox.current?.focus(), testId: 'hint-search' },
                modeHint,
                optionsHint,
                infoHint,
                padOnly(['RT'], '설정'),
              ]
            : [
                { keys: ['↑', '↓'], pad: ['↑', '↓'], label: '곡' },
                padOnly(['LB', 'RB'], '페이지'),
                { keys: ['←', '→'], pad: ['←', '→'], label: '난이도' },
                modeHint,
                optionsHint,
                infoHint,
                padOnly(['RT'], '설정'),
              ];
  // Enter presses a panel's focused button or box (or the offline panel's, or an empty library's),
  // or plays (nothing to play without a song in sight)
  const playLabel = practice ? '연습 시작' : '플레이';
  const enterLabel = offlineKeys ? '누르기' : enterPresses ? '누르기' : filtered.length > 0 ? playLabel : null;
  const endHints: KeyHint[] = [];
  if (panel === 'options') endHints.push({ keys: ['Space'], pad: ['X'], label: '닫기', onClick: closePanel, testId: 'hint-options' });
  else if (panel === 'info') endHints.push({ keys: ['Esc'], pad: ['B'], label: '닫기', onClick: closePanel, testId: 'hint-info' });
  else endHints.push({ keys: ['Esc'], pad: ['B'], label: '메뉴', onClick: () => openSheet('menu'), testId: 'hint-menu' });
  // (a pad has the autoplay on a button of its own; a keyboard finds it in the menu, with its key)
  if (enterLabel === playLabel && panel === 'none') endHints.push(padOnly(['RS'], '오토 플레이', 'hint-autoplay'));
  if (enterLabel) endHints.push({ keys: ['Enter'], pad: ['A'], label: enterLabel, testId: 'hint-enter', main: enterLabel !== '누르기', onClick: enterLabel === '누르기' ? undefined : () => void play() });

  // ── the sheets: the menu, adding a song, the cover, the background video, the filters ─────────
  const pickFile = (input: HTMLInputElement | null) => closeSheet(() => input?.click());
  const hasVideo = Boolean(selected && (selected.hasBga || selected.bgaYoutube));
  const linkYoutube = async () => {
    const url = youtubeDraft?.trim();
    if (url && (await patch({ bgaYoutube: url }))) setYoutubeDraft(null);
  };
  const savedShift = selected?.bgaOffsetMs ?? 0;
  const typedShift = parseShift(bgaShiftDraft);
  const shownShift = typedShift ?? savedShift;
  /** Puts `ms` in the sheet and saves it after `delay` ms (steps that follow put the save off). */
  const setVideoShift = (ms: number, delay: number) => {
    const next = clampBgaOffset(ms);
    if (next === null || !selected) return;
    setBgaShiftDraft(String(next));
    bgaShiftDirty.current = true;
    window.clearTimeout(bgaShiftTimer.current);
    bgaShiftTimer.current = window.setTimeout(() => {
      void patch({ bgaOffsetMs: next }).finally(() => {
        bgaShiftDirty.current = false;
      });
    }, delay);
  };
  const shiftVideo = (dir: 1 | -1, big: boolean) => setVideoShift(shownShift + dir * (big ? BGA_BIG_STEP_MS : BGA_STEP_MS), BGA_SAVE_AFTER_MS);
  const YOUTUBE_NOTE = '유튜브 영상은 유튜브 플레이어로 재생돼 인터넷 연결이 필요합니다. 퍼가기를 막은 영상은 나오지 않고, 광고가 있는 영상은 광고가 먼저 나올 수 있습니다.';
  const sheetItems = (): SheetItem[] => {
    if (sheet === 'add') {
      return [
        { id: 'upload', label: '음악 파일', sub: 'mp3 · ogg · wav · flac · m4a', testId: 'upload-button', onPress: () => pickFile(fileInput.current) },
        { id: 'demo', label: '데모 곡', sub: '합성한 128 BPM 곡', testId: 'demo-button', onPress: () => closeSheet(() => void addDemo()) },
        { id: 'import', label: '채보 가져오기 · 파일', sub: '.osz · .zip · .osu · .bms · .bmson', testId: 'import-button', onPress: () => pickFile(importInput.current) },
        { id: 'import-folder', label: '채보 가져오기 · 폴더', sub: 'BMS · bmson 폴더 (키음 포함)', testId: 'import-folder-button', onPress: () => pickFile(folderInput.current) },
        { id: 'replay', label: '리플레이 파일 보기', sub: '결과 화면에서 내보낸 .grgreplay.json', testId: 'open-replay', apart: true, onPress: () => pickFile(replayInput.current) },
      ];
    }
    if (sheet === 'cover') {
      return [
        { id: 'pick', label: '커버 이미지 고르기', sub: 'png · jpg · webp · gif · bmp', testId: 'cover-upload', onPress: () => pickFile(coverInput.current) },
        { id: 'remove', label: '지우기', testId: 'cover-remove', disabled: !selected?.hasCover, onPress: () => closeSheet(() => void removeCover()) },
      ];
    }
    if (sheet === 'video') {
      return hasVideo
        ? [
            {
              id: 'shift',
              label: '영상 싱크',
              sub: describeBgaOffset(shownShift),
              value: signedMs(shownShift),
              testId: 'bga-shift',
              onStep: shiftVideo,
              // Enter: type the number
              onPress: () => bgaShiftInput.current?.select(),
            },
            { id: 'remove', label: '지우기', testId: 'bga-remove', onPress: () => closeSheet(() => void removeBga()) },
          ]
        : [
            { id: 'pick', label: '영상 고르기', sub: 'mp4 · webm', testId: 'bga-upload', onPress: () => pickFile(bgaInput.current) },
            { id: 'youtube', label: '유튜브 링크', sub: 'youtube.com/watch?v=… · youtu.be/…', testId: 'bga-youtube', onPress: () => setYoutubeDraft((d) => (d === null ? '' : null)) },
          ];
    }
    if (sheet === 'filter') {
      return SONG_FILTERS.map((f, i) => ({
        id: f,
        label: FILTER_LABELS[f],
        sub: f === 'all' || f === 'favorites' ? (folder === f ? '보는 중' : undefined) : sort?.key === f ? SORT_DIR_LABELS[sort.dir] : undefined,
        cap: String(i + 1),
        testId: `filter-row-${f}`,
        onPress: () => pressFilter(f),
      }));
    }
    const patternable = Boolean(selected && ready && !savedEntry && busy === null);
    return [
      { id: 'add', label: '곡 추가', cap: '+', testId: 'menu-add', disabled: offline, onPress: () => openSheet('add') },
      { id: 'random', label: '무작위 선곡', cap: 'F2', testId: 'menu-random', disabled: filtered.length < 2, onPress: () => closeSheet(randomSong) },
      {
        id: 'favorite',
        label: selected && favorites.has(selected.id) ? '즐겨찾기에서 빼기' : '즐겨찾기에 넣기',
        cap: 'F3',
        testId: 'menu-favorite',
        disabled: !selected,
        onPress: () => closeSheet(toggleSelectedFavorite),
      },
      { id: 'pattern', label: '새 패턴 만들기', sub: selected && !savedEntry ? `${keyMode} ${selectedTier.label}` : undefined, cap: 'F5', testId: 'menu-pattern', disabled: !patternable, onPress: () => closeSheet(() => void newPattern()) },
      ...(pattern !== null ? [{ id: 'default-pattern', label: '기본 패턴으로', sub: '처음의 패턴과 그 기록', cap: 'Shift+F5', testId: 'menu-default-pattern', disabled: !patternable, onPress: () => closeSheet(defaultPattern) }] : []),
      { id: 'autoplay', label: '오토 플레이로 보기', sub: '기록은 남지 않습니다', cap: 'Shift+Enter', testId: 'menu-autoplay', disabled: !selected || !ready || busy !== null || entryLoading, onPress: () => closeSheet(() => void play({ auto: true })) },
      { id: 'filter', label: '필터 · 정렬', cap: '1–5', testId: 'menu-filter', disabled: songs.length === 0, apart: true, onPress: () => openSheet('filter') },
      { id: 'settings', label: '설정', cap: 'F10', testId: 'menu-settings', onPress: () => closeSheet(props.onOpenSettings) },
    ];
  };

  // ── what the screen says under the song: an error, what is being done, a word on what a key did ──
  const entryFailed = entryChartKey !== null && chartStore.hasFailed(entryChartKey);
  const entryBrief = selected && !savedEntry ? briefOn(selected, difficulty) : null;
  const entryNote =
    !selected || !ready || chart
      ? null
      : entryFailed
        ? '채보를 만들지 못했습니다. Enter를 누르면 다시 만들고 이유를 알려 줍니다.'
        : entryBrief?.predicted
          ? entryBrief.making || (entryChartKey !== null && makingKeys.has(entryChartKey))
            ? '이 채보를 만들고 있습니다 (곡 길이에 따라 1–3분).'
            : entryBrief.queued
              ? '이 채보가 만들 차례를 기다리고 있습니다.'
              : '이 채보는 Enter를 누르면 만들기 시작합니다 (곡 길이에 따라 1–3분).'
          : '채보를 계산하는 중…';
  const other = selected && entryBrief && !entryRecord ? otherBest(recordsOn(selected, keyMode), difficulty, entryBrief.chartId) : null;
  // an error, or what is being done: said by whichever part of the screen is in front (the song's
  // column, the play options' foot, the song info's foot)
  const status = error ? (
    <span className="error" data-testid="select-error">
      {error}
    </span>
  ) : busy ? (
    <span data-testid="busy">{busy}</span>
  ) : null;
  const saved = (m: KeyModeId) => (savedLoaded ? savedCharts.charts.filter((c) => c.keyMode === m).length : 0);
  const at = filtered.findIndex((s) => s.id === selected?.id);
  // the wheel is drawn around the cursor only (a library may hold thousands of songs)
  const from = Math.max(0, at - reach - 2);
  const shownRows = at < 0 ? [] : filtered.slice(from, at + reach + 3);
  const wheelDelta = useRef(0);

  return (
    <div
      ref={screen}
      className={`select-screen screen-enter ${panel !== 'none' ? `panel-${panel}` : ''}`}
      style={{ ['--diff' as string]: savedEntry ? 'var(--text)' : selectedTier.color } as CSSProperties}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <Backdrop song={selected} />
      <TopBar
        nav={
          <nav className="key-modes" aria-label="키 모드">
            {enabledKeyModes.map((m) => (
              // the song's edited and imported charts are entries on their own key mode only: the others say they have some
              // (the count is the button's description, its name stays the key mode's)
              <button key={m} className={m === keyMode ? 'active' : ''} aria-pressed={m === keyMode} disabled={panel === 'info'} onClick={() => setKeyMode(m)} title={saved(m) > 0 ? `가져오거나 편집한 채보 ${saved(m)}개` : undefined}>
                <span>{m}</span>
                {saved(m) > 0 && (
                  <small className="mode-saved" data-testid={`mode-saved-${m}`} aria-hidden="true">
                    {saved(m)}
                  </small>
                )}
              </button>
            ))}
            <kbd>Tab</kbd>
          </nav>
        }
      >
        <button className="quiet" data-testid="open-settings" onClick={props.onOpenSettings}>
          설정 <kbd>F10</kbd>
        </button>
      </TopBar>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        data-testid="file-input"
        onChange={(e) => {
          if (e.target.files) void upload(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={importInput}
        type="file"
        accept={IMPORT_ACCEPT}
        multiple
        hidden
        data-testid="import-input"
        onChange={(e) => {
          if (e.target.files) void importFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={(el) => {
          folderInput.current = el;
          el?.setAttribute('webkitdirectory', '');
        }}
        type="file"
        multiple
        hidden
        data-testid="import-folder-input"
        onChange={(e) => {
          if (e.target.files) void importFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={replayInput}
        type="file"
        accept=".json,application/json"
        hidden
        data-testid="replay-input"
        onChange={(e) => {
          if (e.target.files?.[0]) void openReplayFile(e.target.files[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={coverInput}
        type="file"
        accept={IMAGE_ACCEPT}
        hidden
        data-testid="cover-input"
        onChange={(e) => {
          if (e.target.files?.[0]) void uploadCover(e.target.files[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={bgaInput}
        type="file"
        accept={VIDEO_ACCEPT}
        hidden
        data-testid="bga-input"
        onChange={(e) => {
          if (e.target.files?.[0]) void uploadBga(e.target.files[0]);
          e.target.value = '';
        }}
      />

      <div className="select-body">
        <main className="song-detail">
          {panel === 'options' ? (
            <PlayOptionsPanel
              settings={settings}
              onSettingsChange={onSettingsChange}
              song={selected}
              entry={selected ? (savedEntry ? { name: savedLabel(savedEntry), color: 'var(--text)', level: savedEntry.level } : { name: selectedTier.label, color: selectedTier.color, level: entryBrief?.level ?? null }) : null}
              chart={chart}
              practice={practice}
              onPracticeToggle={(on) => void togglePractice(on)}
              onPracticeChange={setPractice}
              status={status}
            />
          ) : panel === 'info' ? null : offline ? (
            <section className="detail-empty offline" data-testid="server-offline" ref={offlinePanel}>
              <h2>분석 서버에 연결할 수 없습니다</h2>
              {desktopShell() ? (
                // the desktop app starts its server itself: one that stopped comes back with the app
                <p className="hint">곡 분석과 채보 생성을 맡는 서버가 멈췄습니다. 앱을 다시 시작하세요.</p>
              ) : (
                <>
                  <p className="hint">곡 분석과 채보 생성은 로컬 Python 서버가 맡습니다. 터미널에서 서버를 실행하면 몇 초 안에 저절로 다시 연결합니다.</p>
                  <pre>
                    {'cd server\n'}
                    {'.venv/bin/python -m rhythm_server        # Windows: .venv\\Scripts\\python -m rhythm_server'}
                  </pre>
                </>
              )}
              <div className="row">
                <button className="primary" data-testid="reconnect" onClick={() => void connect()}>
                  다시 연결
                </button>
                <button data-testid="offline-sync-test" onClick={() => onPlay(syncTestRequest(keyMode, false))}>
                  서버 없이 싱크 테스트
                </button>
              </div>
            </section>
          ) : selected ? (
            <>
              <section className="hero">
                <div className="hero-art" ref={jacket}>
                  <SongArt song={selected} size={300} fit />
                  <button className={`art-btn video ${hasVideo ? 'has' : ''}`} data-testid="open-video" onClick={() => openSheet('video')} title="배경 영상 (V)">
                    <FilmIcon />
                    <span>{selected.bgaYoutube ? '유튜브' : selected.hasBga ? '등록됨' : '배경 영상'}</span>
                    <kbd>V</kbd>
                  </button>
                  <button className="art-btn edit" data-testid="open-cover" onClick={() => openSheet('cover')} title="커버 수정 (C)" aria-label="커버 수정">
                    <PencilIcon />
                    <kbd>C</kbd>
                  </button>
                </div>
                <div className="hero-text">
                  <button
                    className={`fav-toggle ${favorites.has(selected.id) ? 'on' : ''}`}
                    aria-pressed={favorites.has(selected.id)}
                    aria-label="즐겨찾기"
                    data-testid="favorite-toggle"
                    onClick={() => toggleFavorite(selected.id)}
                    title="즐겨찾기 (F3)"
                  >
                    <StarIcon filled={favorites.has(selected.id)} />
                  </button>
                  <p className="album">{selected.album}</p>
                  <h1 data-testid="song-title" data-size={titleSize(selected.title)} title={selected.title}>
                    {selected.title}
                  </h1>
                  <p className="artist">{selected.artist || '알 수 없는 아티스트'}</p>
                  <dl className="hero-facts">
                    <div>
                      <dt className="en">BPM</dt>
                      <dd className="num" data-testid="song-bpm">
                        {bpmLabel(selected)}
                      </dd>
                      <BeatDot songId={selected.id} chart={chart} />
                    </div>
                    <div>
                      <dt>길이</dt>
                      <dd className="num">{formatTime(selected.durationMs)}</dd>
                    </div>
                  </dl>
                </div>
              </section>

              <div className="difficulty-row" data-testid="difficulty-row">
                {tiers.map((t) => {
                  if (!tiersShown.includes(t)) return <AbsentPlate key={t.id} tier={t} />;
                  const brief = briefOn(selected, t.id);
                  const record = tierRecord(selected, t.id);
                  const key = tierChart(selected, t.id).key;
                  const failed = ready && !brief && chartStore.hasFailed(key);
                  return (
                    <TierPlate
                      key={t.id}
                      tier={t}
                      active={!savedEntry && t.id === difficulty}
                      brief={brief}
                      // its chart comes by itself once the song is analysed (unless the server could not make it)
                      pending={ready && !brief && !failed}
                      failed={failed}
                      record={record}
                      // with no play of its own, the best lamp of the tier's other charts, faint
                      other={brief && !record ? otherBest(recordsOn(selected, keyMode), t.id, brief.chartId) : null}
                      generating={!savedEntry && makingKeys.has(key)}
                      onPick={() => setDifficulty(t.id)}
                    />
                  );
                })}
              </div>

              {/* the song's edited and imported charts of this key mode, each its own entry after the tiers */}
              {savedOnMode.length > 0 && (
                <section className="saved-charts" data-testid="saved-charts" aria-label="저장된 채보">
                  {savedOnMode.map((c) => (
                    <SavedPlate key={c.chartId} chart={c} active={savedEntry?.chartId === c.chartId} record={recordOf(selected, c.chartId)} generating={makingKeys.has(savedChartKey(c.chartId))} onPick={() => pickEntry({ chartId: c.chartId })} />
                  ))}
                </section>
              )}

              {ready ? (
                <>
                  <ChartFacts chart={chart} brief={entryBrief} saved={savedEntry} best={entryRecord} known={entryKnown} ruleset={settings.ruleset} />
                  {/* what makes this play another than the default one: its pattern, a rule, a practice */}
                  <EntryMarks>
                    {pattern !== null && (
                      <>
                        <span className="mark-chip" data-testid="pattern-mark">
                          {typeof pattern === 'number' ? '새 패턴' : '고른 패턴'}
                        </span>
                        <button className="mark-chip" data-testid="default-pattern" disabled={busy !== null} onClick={defaultPattern} title="이 난이도를 처음의 패턴으로 되돌립니다 (그 패턴의 기록으로)">
                          기본 패턴 <kbd>Shift+F5</kbd>
                        </button>
                      </>
                    )}
                    {other && (
                      <span className="mark-chip other-best" title={`${otherLabel(other, generator)}의 기록: ${other.lamp} ${headlineText(other, settings.ruleset)} (곡 정보에서 고를 수 있습니다)`}>
                        {otherLabel(other, generator)}
                        <span className={`lamp-text lamp-${lampClass(other.lamp)}`}>
                          <LampMark />
                          <span className="lamp-name">{other.lamp}</span>
                        </span>
                      </span>
                    )}
                    {/* a judgement or score rule that is not the default (the records are kept by it) */}
                    {judgementChip(settings.judgementMode) && (
                      <span className="mark-chip" data-testid="chip-judgement">
                        {judgementChip(settings.judgementMode)}
                      </span>
                    )}
                    {settings.ruleset !== DEFAULT_SETTINGS.ruleset && (
                      <span className="mark-chip" data-testid="chip-ruleset">
                        {rulesetConfigs[settings.ruleset].label}
                      </span>
                    )}
                    {practice && (
                      <span className="mark-chip" data-testid="chip-practice">
                        연습 {pointText(practice.startMs)} – {pointText(practice.endMs)}
                        {practice.rate !== 1 ? ` · ×${practice.rate.toFixed(2)}` : ''}
                      </span>
                    )}
                  </EntryMarks>
                  <button className="quick" data-testid="play-options-button" aria-label="플레이 옵션" onClick={() => setPanel('options')}>
                    <span className="quick-head">
                      <span>플레이 옵션</span>
                      <kbd>Space</kbd>
                    </span>
                    <span className="quick-cell">
                      <span className="cap">노트 속도</span>
                      <b className="num">{speedText(settings.hiSpeed)}</b>
                    </span>
                    <span className="quick-cell">
                      <span className="cap">배치</span>
                      <b>{placementLabels[settings.placement]}</b>
                    </span>
                    <span className="quick-cell">
                      <span className="cap">FEVER</span>
                      <b>{FEVER_SHORT[settings.fever]}</b>
                    </span>
                  </button>
                </>
              ) : (
                // why play is off: the song is still being analysed, or its analysis failed (why
                // first, the server's own words folded under it)
                <div className="analysis-status" data-testid="analysis-status">
                  {selected.status === 'error' ? (
                    <>
                      <span className="error" data-testid="analysis-error">
                        분석 실패 · {failureReason(selected.error)}
                      </span>
                      <button className="small" data-testid="reanalyze-failed" onClick={() => void reanalyze()}>
                        다시 분석
                      </button>
                      {selected.error && (
                        <details className="raw-error">
                          <summary>자세히</summary>
                          <code>{selected.error}</code>
                        </details>
                      )}
                    </>
                  ) : (
                    <>
                      <span>
                        {selected.progressLabel || '분석 대기'} <span className="value num">{Math.round(selected.progress * 100)}%</span>
                      </span>
                      <span className="progress">
                        <span style={{ width: `${Math.round(selected.progress * 100)}%` }} />
                      </span>
                    </>
                  )}
                </div>
              )}
            </>
          ) : firstRun ? (
            <section className="detail-empty first-run" data-testid="first-run" ref={startPanel} aria-label="시작하기">
              <button className="primary" data-testid="first-upload" onClick={() => fileInput.current?.click()}>
                음악 파일 고르기
              </button>
              <button data-testid="first-demo" onClick={() => void addDemo()}>
                데모 곡으로 해 보기
              </button>
              <button data-testid="first-calibrate" onClick={() => props.onCalibrate('input')}>
                판정 오프셋 측정
              </button>
              <p className="hint" data-testid="first-run-keys">
                {keyMode} 키는{' '}
                {bindingsFor(settings, keyMode).map((code, lane) => (
                  <kbd key={lane}>{keyLabel(code)}</kbd>
                ))}
                입니다. 음악 파일(mp3 · ogg · wav · flac · m4a)과 채보 파일(.osz · .zip · .osu · .bms · .bmson)을 넣을 수 있습니다.
              </p>
            </section>
          ) : (
            <div className="detail-empty">
              <p className="hint">{!loaded ? '곡 목록을 불러오는 중…' : '보이는 곡이 없습니다.'}</p>
            </div>
          )}
          {panel === 'none' && (
            <p className="select-status" aria-live="polite">
              {status ? (
                status
              ) : notice ? (
                <span data-testid="ai-notice">{notice}</span>
              ) : said ? (
                <span data-testid="said">{said}</span>
              ) : entryNote ? (
                <span data-testid="chart-pending">{entryNote}</span>
              ) : null}
            </p>
          )}
        </main>

        <section className="song-list-panel" aria-label="곡 목록">
          <div className="filters">
            {SONG_FILTERS.map((f, i) => {
              const on = f === 'all' || f === 'favorites' ? folder === f : sort?.key === f;
              const dir = f !== 'all' && f !== 'favorites' && sort?.key === f ? sort.dir : undefined;
              return (
                <button key={f} className={`filter ${on ? 'active' : ''}`} aria-pressed={on} data-dir={dir} data-testid={`filter-${f}`} onClick={() => pressFilter(f)} title={dir ? SORT_DIR_LABELS[dir] : undefined}>
                  <kbd>{i + 1}</kbd>
                  <span>{FILTER_LABELS[f]}</span>
                  {dir && <ArrowIcon dir={dir === 'desc' ? 'down' : 'up'} />}
                </button>
              );
            })}
            <label className={`find ${query ? 'has' : ''}`} title="제목 · 아티스트 검색">
              <SearchIcon />
              <input
                ref={searchBox}
                type="search"
                placeholder="제목 · 아티스트"
                aria-label="곡 검색"
                data-testid="song-search"
                spellCheck={false}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => {
                  if (!query) searchFrom.current = selected?.id ?? null;
                }}
              />
              <kbd>/</kbd>
            </label>
          </div>
          {importReport && (
            <div className="import-report" data-testid="import-report">
              <strong>채보 {importReport.charts.length}개를 가져왔습니다</strong>
              {importReport.warnings.length > 0 && (
                <details>
                  <summary>알림 {importReport.warnings.length}개</summary>
                  <ul>{importReport.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </details>
              )}
              <button className="small quiet" onClick={() => setImportReport(null)}>
                닫기
              </button>
            </div>
          )}
          <div
            ref={songList}
            className={`song-list ${dragOver ? 'drag' : ''}`}
            data-testid="song-list"
            onWheel={(e) => {
              // the pointer's wheel turns the song wheel, a row for each notch
              wheelDelta.current += e.deltaY;
              if (Math.abs(wheelDelta.current) < 60 || at < 0) return;
              const step = wheelDelta.current > 0 ? 1 : -1;
              wheelDelta.current = 0;
              cursorTo(cursorStep(at, filtered.length, step, false));
            }}
          >
            {filtered.length === 0 && (
              <div className="empty-list">
                {songs.length === 0 ? (
                  <b>{offline ? '서버에 연결되면 곡을 추가할 수 있습니다.' : !loaded ? '' : '음악 파일을 끌어다 놓거나 곡 추가(+)로 넣으세요.'}</b>
                ) : query.trim() ? (
                  <>
                    <b>'{query.trim()}'에 맞는 곡이 없습니다</b>
                    <span>
                      <kbd>Esc</kbd> 검색 지우기
                    </span>
                  </>
                ) : (
                  <>
                    <b>즐겨찾기한 곡이 없습니다</b>
                    <span>
                      곡에서 <kbd>F3</kbd>으로 넣습니다 · <kbd>1</kbd> 전체 보기
                    </span>
                  </>
                )}
              </div>
            )}
            {shownRows.map((s, i) => {
              const index = from + i;
              const cells = listCells[index];
              // a song without the tier chosen plays the hardest it has under it; on the selected
              // song a saved chart picked there is the entry
              const onSaved = savedEntry !== null && s.id === selected?.id;
              const playedTier = tierUpTo(cells.tiers.filter((m) => !m.absent).map((m) => m.tier), chosen);
              const played = cells.tiers.find((m) => m.tier.id === playedTier) ?? null;
              return (
                <SongRow
                  key={s.id}
                  song={s}
                  d={index - at}
                  reach={reach}
                  favorite={favorites.has(s.id)}
                  second={sort?.key === 'album' ? s.album || '앨범 정보 없음' : s.artist || '알 수 없는 아티스트'}
                  mark={onSaved ? (cells.saved ?? { level: savedEntry.level, lamp: null }) : played}
                  color={onSaved ? 'var(--text)' : (played?.tier.color ?? 'var(--text-dim)')}
                  onPick={s.id === selected?.id ? () => void play() : () => onSelectSong(s.id)}
                />
              );
            })}
          </div>
        </section>
      </div>

      {panel === 'info' && (
        <SongInfoPanel
          song={selected}
          tab={infoTab}
          onTab={setInfoTab}
          chart={chart}
          chartFailed={entryFailed}
          entry={selected ? (savedEntry ? { name: savedLabel(savedEntry), color: 'var(--text)', level: savedEntry.level } : { name: selectedTier.label, color: selectedTier.color, level: entryBrief?.level ?? null }) : null}
          keyMode={keyMode}
          settings={settings}
          keysound={settings.keysound}
          practice={practice}
          onSelectRange={(startMs, endMs) => setPractice({ rate: 1, loop: true, ...practice, startMs, endMs })}
          onEditChart={() => selected && chart && props.onEdit(chart, selected)}
          onWatchBest={(id) => void watchBest(id)}
          records={selected ? (savedEntry ? savedRecordsOn(selected, keyMode) : recordsOn(selected, keyMode).filter((r) => r.difficulty === difficulty)) : []}
          recordFor={savedEntry ? savedLabel(savedEntry) : `${keyMode} ${selectedTier.label}`}
          currentChartId={savedEntry ? savedEntry.chartId : selected ? (briefOn(selected, difficulty)?.chartId ?? null) : null}
          ruleset={settings.ruleset}
          onPattern={savedEntry ? undefined : pickPattern}
          generator={generator}
          onPickChart={(chartId) => pickEntry({ chartId })}
          savedChart={savedEntry}
          onDeleteSaved={(c) => void deleteSaved(c)}
          onPatch={patch}
          songOffsetMs={songOffsetOf(settings, selected?.id)}
          onSongOffset={(ms) => selected && onSettingsChange(withSongOffset(settings, selected.id, ms))}
          songOffsetKeys={offsetKeysText(playKeysOf(settings))}
          onReanalyze={() => void reanalyze()}
          onRemoveSong={() => void remove()}
          onSyncTest={(byHand) => onPlay(syncTestRequest(keyMode, !byHand))}
          onCalibrate={props.onCalibrate}
          status={status}
        />
      )}

      {sheet && (
        <Sheet
          key={sheet}
          testId={`sheet-${sheet}`}
          title={{ menu: '메뉴', add: '곡 추가', cover: '커버', video: '배경 영상', filter: '필터 · 정렬' }[sheet]}
          anchor={sheet === 'cover' || sheet === 'video' ? 'jacket' : 'center'}
          status={
            sheet === 'cover' ? (
              <span data-testid="cover-status">{selected?.hasCover ? '그림' : '디스크'}</span>
            ) : sheet === 'video' ? (
              hasVideo ? (
                <span data-testid="bga-status">{selected?.bgaYoutube ? '유튜브' : '등록됨'}</span>
              ) : (
                '없음'
              )
            ) : sheet === 'add' ? (
              '음악 파일은 화면에 끌어다 놓아도 됩니다'
            ) : undefined
          }
          items={sheetItems()}
          onClose={() => closeSheet()}
          note={
            sheet === 'cover' ? (
              '목록과 플레이 배경에 쓰는 그림입니다. 지우면 곡을 이끄는 악기 색의 디스크로 돌아갑니다.'
            ) : sheet === 'video' ? (
              selected?.bgaYoutube || youtubeDraft !== null ? (
                <span data-testid="bga-youtube-hint">{YOUTUBE_NOTE}</span>
              ) : (
                '플레이 화면의 배경에 깔리는 영상입니다.'
              )
            ) : sheet === 'filter' ? (
              '전체와 즐겨찾기는 보이는 곡을, 곡명 · 아티스트명 · 앨범명은 순서를 정합니다: 내림차순, 한 번 더 오름차순, 또 한 번 해제.'
            ) : undefined
          }
        >
          {sheet === 'video' && hasVideo && (
            <form
              className="sheet-form"
              style={{ flexWrap: 'wrap' }}
              data-testid="bga-shift-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (typedShift !== null) setVideoShift(typedShift, 0);
                (e.currentTarget.closest('.sheet-box')?.querySelector('[data-item="shift"]') as HTMLElement | null)?.focus();
              }}
            >
              <input
                ref={bgaShiftInput}
                type="text"
                inputMode="numeric"
                data-testid="bga-shift-input"
                aria-label="영상 싱크 (ms)"
                placeholder="ms"
                spellCheck={false}
                value={bgaShiftDraft}
                onChange={(e) => {
                  bgaShiftDirty.current = true;
                  setBgaShiftDraft(e.target.value);
                }}
                onBlur={() => {
                  // left without Enter: back to what is saved (or being saved)
                  if (typedShift === null) setBgaShiftDraft(String(savedShift));
                }}
              />
              <span aria-hidden="true">ms</span>
              <button className="small" type="submit" data-testid="bga-shift-save" disabled={typedShift === null}>
                적용
              </button>
              <span style={{ flexBasis: '100%', fontSize: '0.8em', opacity: 0.75 }} data-testid="bga-shift-help">
                + 숫자는 영상을 늦게 시작하고, − 숫자는 영상 앞부분을 건너뜁니다. 예: 영상 앞 13초를 건너뛰려면 −13000. ←→ 10ms · Shift+←→ 100ms
              </span>
            </form>
          )}
          {sheet === 'video' && youtubeDraft !== null && !hasVideo && (
            // a form on the page, not window.prompt: the desktop app has no prompt dialog
            <form
              className="sheet-form"
              data-testid="bga-youtube-form"
              onSubmit={(e) => {
                e.preventDefault();
                void linkYoutube();
              }}
            >
              <input
                type="text"
                inputMode="url"
                data-testid="bga-youtube-input"
                aria-label="유튜브 영상 링크"
                placeholder="유튜브 영상 링크"
                spellCheck={false}
                value={youtubeDraft}
                autoFocus
                onChange={(e) => setYoutubeDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Escape') return;
                  // Esc closes the form first (the sheet stays, the cursor back on its row)
                  setYoutubeDraft(null);
                  (e.currentTarget.closest('.sheet-box')?.querySelector('[data-item="youtube"]') as HTMLElement | null)?.focus();
                }}
              />
              <button className="small" type="submit" data-testid="bga-youtube-save" disabled={!youtubeDraft.trim()}>
                등록
              </button>
              <button className="small quiet" type="button" onClick={() => setYoutubeDraft(null)}>
                취소
              </button>
            </form>
          )}
        </Sheet>
      )}
      <HintBar hints={hints} end={endHints} />
    </div>
  );
}

/**
 * Keys a focused control uses itself: a text field keeps them all, a drop-down its arrows, a slider
 * (and the practice minimap) ←→ (↑↓ go on through the panel's lines). Checkboxes and buttons leave
 * every key to the song select (Enter plays, Tab switches).
 */
function keepsKey(target: EventTarget | null, code: string): boolean {
  if (target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return true;
  if (target instanceof HTMLCanvasElement && target.classList.contains('selectable')) return code === 'ArrowLeft' || code === 'ArrowRight';
  const arrow = code.startsWith('Arrow');
  if (target instanceof HTMLSelectElement) return arrow;
  if (target instanceof HTMLInputElement) {
    if (['checkbox', 'button', 'submit', 'reset'].includes(target.type)) return false;
    if (target.type === 'range' || target.type === 'radio') return code === 'ArrowLeft' || code === 'ArrowRight';
    return true;
  }
  return false;
}

/** A saved chart's kind as its plate names it: the format it came in, or 편집. */
function savedLabel(c: SavedChart): string {
  return c.kind === 'imported' && c.format ? EXPORT_LABELS[c.format] : (KIND_LABELS[c.kind] ?? c.kind);
}

/** Its level: the one its file gives beside our estimate (imported), or ours. */
function savedLevels(c: SavedChart): string {
  if (c.kind !== 'imported') return `Lv.${c.level}`;
  return c.sourceLevel ? `원본 ${c.sourceLevel} · 추정 ${c.level}` : `추정 ${c.level}`;
}

/** A record's number under the score rule: 94.81%, S+ 931,900, EX 1,234. */
function headlineText(r: ScoreRecord, ruleset: RulesetId): string {
  const head = recordHeadline(r, ruleset);
  return head.label === 'RATE' ? head.value : `${head.label} ${head.value}`;
}

/** How long the dot by the BPM stays lit after a beat. */
const BEAT_DOT_MS = 160;

/**
 * The dot by the BPM: it ticks on the beats the analysis found (the chosen chart's own timing)
 * while the song's preview plays, so a tempo read wrong is seen at once against what is heard. It
 * rests without a chart, without sound, and with reduced motion.
 */
function BeatDot({ songId, chart }: { songId: string; chart: ServerChart | null }) {
  const dot = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = dot.current;
    if (!el || !chart || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const tempo = new TempoMap(chart.timing);
    let raf = 0;
    let shown = '';
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = menuMusic.songMs(songId);
      let lit = 0;
      if (now !== null) {
        const beat = tempo.msToBeat(now);
        const since = now - tempo.beatToMs(Math.floor(beat));
        if (beat >= 0 && since >= 0 && since < BEAT_DOT_MS) lit = 1 - since / BEAT_DOT_MS;
      }
      const opacity = (0.22 + 0.78 * lit).toFixed(2);
      if (opacity !== shown) el.style.opacity = shown = opacity;
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      el.style.opacity = '';
    };
  }, [songId, chart]);
  return <i className="beat" ref={dot} aria-hidden="true" />;
}

/** A tier's cell of a song on the list with its tier (`absent`: the song has no chart on it). */
type RowMark = TierMark & { tier: DifficultyTier; absent: boolean };

/** A song's cells on the list: its tiers', and its saved charts' best (null: none played). */
interface ListCells {
  tiers: RowMark[];
  saved: (TierMark & { name: string }) | null;
}

/** A lamp's mark in its colour (nothing for a chart never played); `faint`: another chart's of the tier. */
function Lamp({ lamp, faint = false }: { lamp: string | null; faint?: boolean }) {
  if (!lamp) return null;
  return (
    <span className={`lamp-text lamp-${lampClass(lamp)} ${faint ? 'other' : ''}`} title={faint ? `다른 채보 ${lamp}` : lamp}>
      <LampMark />
    </span>
  );
}

/**
 * A row of the song wheel: the song's picture and name, and at its end the level and lamp of the
 * chart Enter plays on it (the tier chosen, or the hardest the song has under it), the level in
 * the tier's colour. It stands `d` rows from the picked one, which is the paper plate in the
 * middle; a press on another row picks it, a press on the picked one plays.
 */
function SongRow(props: { song: Song; d: number; reach: number; favorite: boolean; second: string; mark: TierMark | null; color: string; onPick: () => void }) {
  const { song, d, mark } = props;
  const { x, y, opacity } = wheelPlace(d, props.reach);
  const working = song.status === 'queued' || song.status === 'analyzing';
  return (
    <button
      className={`song-item ${d === 0 ? 'active' : ''} lamp-${mark?.lamp ? lampClass(mark.lamp) : 'none'}`}
      data-testid="song-item"
      data-song-id={song.id}
      style={{ transform: `translate(${x.toFixed(3)}rem, ${y}rem)`, opacity, ['--diff' as string]: props.color } as CSSProperties}
      // (a row past the wheel's end is there only to slide in: it takes no press and no focus)
      tabIndex={Math.abs(d) > props.reach ? -1 : 0}
      aria-current={d === 0 ? 'true' : undefined}
      onClick={props.onPick}
    >
      <span className="song-plate" aria-hidden="true" />
      <SongArt song={song} size={68} fit />
      <span className="song-item-text">
        <span className="song-title">{song.title}</span>
        <span className="song-sub">{props.second}</span>
      </span>
      {props.favorite && (
        <i className="fav-mark" aria-label="즐겨찾기">
          <StarIcon filled />
        </i>
      )}
      {working ? (
        <span className="song-state">
          분석 중 <b className="num">{Math.round(song.progress * 100)}%</b>
        </span>
      ) : song.status === 'error' ? (
        <span className="song-state error">분석 실패</span>
      ) : (
        <span className={`tier-level ${mark?.level === null || !mark ? 'unknown' : ''} ${mark?.other ? 'other' : ''}`}>
          <LampMark />
          <b className="num">{mark?.level ?? '–'}</b>
        </span>
      )}
    </button>
  );
}

/**
 * A difficulty of the song as a leaning plate: its name, the level of the chart Enter plays on it
 * (worked out as soon as the song is chosen) and that chart's lamp. The chosen one is filled with
 * its colour. Where the chart is not there yet, the lamp's place says why: being worked out, made
 * when it is played (nothing on the plate: every chart is made so), being made, waiting its turn, or not made.
 */
function TierPlate(props: {
  tier: DifficultyTier;
  active: boolean;
  /** The chart Enter plays on this tier, once known. */
  brief: ChartBrief | null;
  /** Its level is being worked out. */
  pending: boolean;
  /** Its chart could not be made (Enter makes it again and says why). */
  failed: boolean;
  record: ScoreRecord | null;
  /** With no play of its own, the tier's best on another of its charts. */
  other: ScoreRecord | null;
  generating: boolean;
  onPick: () => void;
}) {
  const { tier: t, brief, record } = props;
  const level = brief?.level ?? null;
  const waiting = props.pending || props.generating;
  // a tier Mapperatorinator has not made yet: being made, waiting its turn, or made when played
  const state = brief?.predicted
    ? brief.making || props.generating
      ? ['생성 중', '채보를 만들고 있습니다']
      : brief.queued
        ? ['대기', '채보가 만들 차례를 기다리고 있습니다']
        : ['', '플레이하면 채보를 만듭니다']
    : props.generating
      ? ['생성 중', '채보를 만들고 있습니다']
      : props.pending
        ? ['계산 중', '레벨을 계산하고 있습니다']
        : props.failed
          ? ['실패', '채보를 만들지 못했습니다. Enter를 누르면 다시 만들고 이유를 알려 줍니다']
          : null;
  // the level the tests and the other screens read: the selected tier's, once known
  const levelId = { 'data-testid': props.active && brief ? 'chart-level' : undefined, 'data-chart-id': props.active ? brief?.chartId : undefined };
  const said = `${t.label}${level === null ? '' : ` Lv.${level}`}${record ? ` · ${record.lamp}` : ''}${state ? ` · ${state[1]}` : ''}`;
  return (
    <button
      className={`difficulty ${props.active ? 'active' : ''} ${brief?.predicted ? 'predicted' : ''}`}
      style={{ ['--diff' as string]: t.color } as CSSProperties}
      aria-pressed={props.active}
      onClick={props.onPick}
      title={`${said} (레벨 범위 Lv.${t.levels[0]}–${t.levels[1]})`}
    >
      <span className="diff-in">
        <span className="diff-name">{t.label}</span>
        {state?.[0] ? <span className="diff-state">{state[0]}</span> : <Lamp lamp={record?.lamp ?? props.other?.lamp ?? null} faint={!record} />}
        <b className={`diff-level num ${level === null ? 'none' : ''} ${waiting ? 'level-pending' : ''}`} {...levelId}>
          {level ?? '–'}
        </b>
        {(props.generating || (props.active && props.pending)) && <i className="plate-pending" aria-hidden="true" />}
      </span>
    </button>
  );
}

/** A tier the song has no chart on (too calm for it): its place is kept, empty, so the row reads the same on every song. */
function AbsentPlate({ tier: t }: { tier: DifficultyTier }) {
  return (
    <span className="difficulty absent" style={{ ['--diff' as string]: t.color } as CSSProperties} title={`${t.label} 채보가 없는 곡입니다`}>
      <span className="diff-in">
        <span className="diff-name">{t.label}</span>
      </span>
    </span>
  );
}

/**
 * An edited or imported chart of the song as an entry after the tiers: the format it came in and
 * its name, the level its file gives it beside our estimate, and its lamp. The chosen one is a
 * paper plate, and is kept in view (the row scrolls across when a song has many).
 */
function SavedPlate(props: { chart: SavedChart; active: boolean; record: ScoreRecord | null; generating: boolean; onPick: () => void }) {
  const { chart: c, record } = props;
  const levels = savedLevels(c);
  const plate = useRef<HTMLDivElement>(null);
  // the chosen one is in view: the row scrolls across, and ←→ go past what it shows
  useEffect(() => {
    const el = plate.current;
    const row = el?.parentElement;
    if (!props.active || !el || !row) return;
    const at = el.getBoundingClientRect();
    const box = row.getBoundingClientRect();
    if (at.left < box.left) row.scrollLeft -= box.left - at.left;
    else if (at.right > box.right) row.scrollLeft += Math.min(at.right - box.right, at.left - box.left);
  }, [props.active]);
  return (
    <div ref={plate} className={`saved-chart ${props.active ? 'active' : ''}`} data-testid="saved-chart">
      <button className="saved-plate" data-testid="pick-saved" aria-pressed={props.active} onClick={props.onPick} title={`${savedLabel(c)} ${c.name} · ${levels} · ${c.noteCount.toLocaleString('en-US')} 노트${record ? ` · ${record.lamp}` : ''}`}>
        <span className={`kind kind-${c.kind}`}>{savedLabel(c)}</span>
        <span className="name">{c.name || c.difficulty}</span>
        <span className="saved-level" data-testid={props.active ? 'saved-level' : undefined}>
          {levels}
        </span>
        <Lamp lamp={record?.lamp ?? null} />
        {props.generating && <i className="plate-pending" aria-hidden="true" />}
      </button>
    </div>
  );
}

/**
 * The chart chosen in four numbers: its notes, its density, its fine difficulty, and the best play
 * on it (its lamp and the score rule's number; a dash until the chart is `known`). The rest of a
 * chart and of its records is the song info's.
 */
function ChartFacts(props: { chart: ServerChart | null; brief: ChartBrief | null; saved: SavedChart | null; best: ScoreRecord | null; known: boolean; ruleset: RulesetId }) {
  const { chart, best } = props;
  const m = chart?.meta;
  // a chart not loaded yet still has its note count where its brief gives it (not a guess: an AI chart not made has none)
  const notes = m?.noteCount ?? props.saved?.noteCount ?? (props.brief && !props.brief.predicted ? props.brief.noteCount : null);
  const head = best ? recordHeadline(best, props.ruleset) : null;
  return (
    <dl className="chart-facts" data-testid="chart-summary">
      <div>
        <dt>노트</dt>
        <dd className="num" data-testid="chart-notes-count">
          {notes === null ? '–' : notes.toLocaleString('en-US')}
        </dd>
      </div>
      <div>
        <dt>평균 / 최대 NPS</dt>
        <dd className="num">{m ? `${m.nps.avg} / ${m.nps.peak}` : '–'}</dd>
      </div>
      <div>
        <dt>세부 난이도</dt>
        <dd className="num">{m ? m.rating.toFixed(2) : '–'}</dd>
      </div>
      <div className="best" data-testid="summary-record">
        {best && head ? (
          <>
            <dt className={`lamp-text lamp-${lampClass(best.lamp)}`}>
              <LampMark />
              <span className="lamp-name">{best.lamp}</span>
            </dt>
            <dd className="num" title={head.label === 'RATE' ? 'RATE' : `${head.label} · RATE ${best.rate.toFixed(2)}%`}>
              {head.label === 'RATE' ? (
                <>
                  {best.rate.toFixed(2)}
                  <small>%</small>
                </>
              ) : (
                <>
                  <small>{head.label}</small> {head.value}
                </>
              )}
            </dd>
          </>
        ) : (
          <>
            <dt className="en">BEST</dt>
            <dd className="none">{props.known ? '기록 없음' : '–'}</dd>
          </>
        )}
      </div>
    </dl>
  );
}

/** The line of marks under the chart's numbers: there only when it has something to say. */
function EntryMarks({ children }: { children: ReactNode }) {
  const shown = (Array.isArray(children) ? children : [children]).some(Boolean);
  return shown ? <div className="entry-marks">{children}</div> : null;
}
