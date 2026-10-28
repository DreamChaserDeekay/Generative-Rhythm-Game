import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { api, ApiError, EXPORT_LABELS, type Health, type ImportResult, type SavedChart, type ScoreRecord, type ServerChart, type Song } from '../api/client';
import { forgetSongBuffer } from '../audio/bufferCache';
import { menuMusic, PREVIEW_VOLUME } from '../audio/songPreview';
import { difficultyTiers as tiers, enabledKeyModes, gaugeRules, maxLevel, tierOf, tierUpTo, type DifficultyTier } from '../engine/config';
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
  laneKeysFor,
  patternKey,
  patternOf,
  playKeysOf,
  SONG_FOLDERS,
  SONG_SORTS,
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
import { analysisStamp, chartKey, chartStore, requestOf, savedChartKey, tierAbsent, useChartStore, type ChartBrief, type ChartSpec } from './chartCache';
import { desktopShell } from './displayMode';
import { CHART_FILE, entryFiles, sortDrop, type DroppedFile } from './dropFiles';
import { dayText, speedText } from './format';
import { namedPictures } from './importPictures';
import { lampClass, LampMark } from './lamps';
import { FEVER_SHORT, generationChanges, generationParams, PLAY_OPTIONS_TABS, PlayOptionsPanel, type PlayOptionsTab } from './PlayOptions';
import { buildPlayRequest } from './playRequest';
import { judgementChip } from './playRules';
import { alongLine, cursorStep, edgeLine, lineStep, panelLines, panelStops, pressesOnEnter, randomIndex, shiftChangesFolder } from './selectNav';
import { HintBar, TopBar, type KeyHint } from './shell';
import { KIND_LABELS, NpsGraph, SongInfoPanel } from './SongInfoPanel';
import { Backdrop, bpmLabel, SongArt, useSketch } from './songArt';
import {
  bestByTier,
  FOLDER_LABELS,
  inFolder,
  otherBest,
  otherLabel,
  recordHeadline,
  recordOf,
  recordScore,
  recordsOn,
  sameMark,
  savedMark,
  savedRecordsOn,
  sortSongs,
  SORT_LABELS,
  tierMark,
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
  /** Kept while the song select is away (a play, the settings), per chart (practiceKey): its practice and target level. */
  practices: Record<string, PracticeOptions>;
  onPractice: (key: string, practice: PracticeOptions | null) => void;
  targetLevels: Record<string, number>;
  onTargetLevel: (key: string, level: number | null) => void;
}

const ACCEPT = '.mp3,.ogg,.oga,.opus,.wav,.flac,.m4a,.aac,audio/*';
const IMPORT_ACCEPT = '.osz,.zip,.osu,.bms,.bme,.bml,.bmson';
const IMPORT_FILE = /\.(osz|zip|osu|bms|bme|bml|pms|bmson|wav|ogg|oga|flac|mp3|m4a|aac|opus)$/i;
const IMAGE_FILE = /\.(png|jpe?g|bmp|gif|webp)$/i;
/** The charts of a song are asked for once the cursor has rested on it this long (not on every song passed). */
const PREFETCH_DELAY_MS = 300;
/** A server that does not answer is asked again this often. */
const RECONNECT_MS = 3000;

/** The part of the detail column above the key modes: the song, or one of the two panels. */
type Panel = 'none' | 'options' | 'info';

/** The in-play keys of the song offset, as the song info names them. */
function offsetKeysText(keys: Record<PlayAction, string>): string {
  const pair = (down: PlayAction, up: PlayAction) => `${bindingLabel(keys[down])} / ${bindingLabel(keys[up])}`;
  return `${pair('offsetDown', 'offsetUp')} (5ms씩 ${pair('offsetDownBig', 'offsetUpBig')})`;
}

/** The function keys of the song select (each with its own job, never repeated by a held key). */
const FUNCTION_KEYS = new Set(['F2', 'F3', 'F4', 'F5', 'F6', 'F10']);

function formatTime(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function SongSelectScreen(props: Props) {
  const { settings, onSettingsChange, onPlay, selectedSongId, onSelectSong } = props;
  const [health, setHealth] = useState<Health | null | 'offline'>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  // the library has come once (until then no song is not an empty library)
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [panel, setPanel] = useState<Panel>('none');
  const [optionsTab, setOptionsTab] = useState<PlayOptionsTab>('rules');
  const [addMenu, setAddMenu] = useState(false);
  // the edited and imported charts of a song (the one they are of: a list never shows on another song)
  const [savedCharts, setSavedCharts] = useState<{ songId: string | null; charts: SavedChart[] }>({ songId: null, charts: [] });
  const [importReport, setImportReport] = useState<ImportResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const replayInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const addMenuWrap = useRef<HTMLDivElement>(null);
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
  const generationKey = JSON.stringify(settings.generation);
  const params = useMemo(() => generationParams(settings.generation, keyMode), [generationKey, keyMode]);
  const generationChanged = useMemo(() => generationChanges(settings.generation, keyMode), [generationKey, keyMode]);

  /** Where a tier of a song keeps its pattern and target level. */
  const tierKey = (song: Song, tier: string) => patternKey(song.id, keyMode, tier);
  /** What a tier's chart on a song is made of with a seed (null: the default): its target level, the generation options. */
  const specOf = (song: Song, tier: string, seed: number | null): ChartSpec => {
    const target = props.targetLevels[tierKey(song, tier)];
    return {
      songId: song.id,
      analysis: analysisStamp(song),
      keyMode,
      difficulty: tier,
      targetLevel: target === undefined ? null : Math.min(target, maxLevel),
      seed,
      params,
    };
  };
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

  // the folder, then the search, in the chosen order
  const folderCounts = useMemo(
    () => Object.fromEntries(SONG_FOLDERS.map((f) => [f, songs.filter((s) => inFolder(s, f, keyMode, favorites)).length])) as Record<SongFolder, number>,
    [songs, keyMode, favorites],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = songs.filter((s) => inFolder(s, folder, keyMode, favorites) && (!q || `${s.title} ${s.artist}`.toLowerCase().includes(q)));
    // 레벨순 takes the levels known when the list is ordered (a level coming in later does not move
    // the songs under the cursor; the next order, folder or search takes it)
    const knownLevel = (s: Song) => briefOn(s, tierOn(s, chosen))?.level ?? null;
    return sortSongs(shown, settings.songSort, { keyMode, difficulty: chosen, knownLevel });
  }, [songs, query, folder, keyMode, chosen, favorites, settings.songSort]);
  // The song under the cursor is always one the list shows: a folder or a search that leaves the
  // chosen one out puts the cursor on its first song, and with no song shown nothing is selected
  // (or played).
  const selected = filtered.find((s) => s.id === selectedSongId) ?? filtered[0] ?? null;
  const difficulty = selected ? tierOn(selected, chosen) : chosen;
  const tiersShown = selected ? tiersOn(selected) : tiers;
  useEffect(() => {
    if (selected && selected.id !== selectedSongId) onSelectSong(selected.id);
  }, [selected?.id, selectedSongId]);
  // the list's songs in order (it changes with the folder, the search and the order, not with every poll)
  const order = useMemo(() => filtered.map((s) => s.id).join(' '), [filtered]);

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

  // Poll while something is being analyzed.
  const analyzing = songs.some((s) => s.status === 'queued' || s.status === 'analyzing');
  useEffect(() => {
    if (!analyzing) return;
    const id = window.setInterval(() => void refresh(), 800);
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
  const spec = tierEntry?.spec ?? null;
  const pattern = selected && !savedEntry ? patternOf(settings, tierKey(selected, difficulty)) : null;
  const entryChartKey = savedEntry ? savedChartKey(savedEntry.chartId) : (tierEntry?.key ?? null);
  const practiceKey = selected && pickKey ? (savedEntry ? `${pickKey}|${savedEntry.chartId}` : tierKey(selected, difficulty)) : null;
  const practice = (practiceKey && props.practices[practiceKey]) || null;
  const setPractice = (p: PracticeOptions | null) => practiceKey && props.onPractice(practiceKey, p);
  const targetLevel = spec?.targetLevel ?? null;
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

  // Once the cursor rests on a song: the chart of the selected entry (the panels, the summary and
  // Enter want it), then the levels of the other tiers, one at a time. The server makes the chart
  // of the entry once and keeps it; the store keeps what came for the next visit, and asks again
  // what found the server down then (each visit, and a new connection, asks).
  // (a song whose saved chart was chosen last waits for its list: that chart is the one wanted first)
  const entryLoading = picked !== null && !savedLoaded;
  const prefetchKey = selected && ready && !entryLoading ? `${tiers.map((t) => tierChart(selected, t.id).key).join(' ')} ${entryChartKey}` : null;
  useEffect(() => {
    if (!selected || !ready || prefetchKey === null) return;
    const song = selected;
    const entry = savedEntry;
    const at = difficulty;
    let alive = true;
    const timer = window.setTimeout(async () => {
      if (entry) await chartStore.loadSaved(entry.chartId);
      else await loadTier(song, at, true);
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
    }, PREFETCH_DELAY_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [prefetchKey, health]);

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
   * Puts the cursor on a song just added (uploaded, imported, a demo): a search or a folder that
   * would leave it out gives way (the folder goes to 전체), or the cursor could not stay on it.
   * `next` is the settings to go on from (an import puts its key mode and chart there).
   */
  const selectAdded = (song: Song, list: Song[] | null, next: Settings = current.current) => {
    const added = list?.find((s) => s.id === song.id) ?? song;
    setQuery((q) => (`${added.title} ${added.artist}`.toLowerCase().includes(q.trim().toLowerCase()) ? q : ''));
    const shown = inFolder(added, next.songFolder, next.lastKeyMode, new Set(next.favorites));
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
    setGenerating(true);
    try {
      const c = (savedEntry ? await chartStore.loadSaved(savedEntry.chartId, true) : await loadTier(selected, difficulty, true, true)) as ServerChart | null;
      // the cursor moved on while the server was making it: it is not for the chart chosen now
      return run === selectionRun.current ? c : null;
    } catch (e) {
      if (run === selectionRun.current) setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(null);
      setGenerating(false);
    }
  };

  // one play per press: a held Enter or a second press while the chart is generated starts nothing more
  const starting = useRef(false);
  /** Plays the chart chosen; `auto` plays this one on autoplay (오토 플레이, Shift+Enter) whatever the play options' switch says. */
  const play = async ({ auto = autoPlay }: { auto?: boolean } = {}) => {
    if (!selected || selected.status !== 'ready' || busy !== null || starting.current) return;
    starting.current = true;
    try {
      const c = await loadSelected();
      if (!c || (c.meta.songId && c.meta.songId !== selected.id)) return;
      const best = recordOf(selected, c.meta.chartId);
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
    setBusy('새 패턴 만드는 중…');
    setGenerating(true);
    setError(null);
    try {
      const { chart: c } = await api.generate(selected.id, { ...requestOf(base), seed: null, newSeed: true });
      const seed = c.meta.generator?.seed;
      if (seed === undefined) return;
      chartStore.put(chartKey({ ...base, seed }), c);
      onSettingsChange(withPattern(current.current, key, seed));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setGenerating(false);
    }
  };
  const defaultPattern = () => {
    if (selected && pattern !== null) onSettingsChange(withPattern(settings, tierKey(selected, difficulty), null));
  };
  /** The selected tier's pattern from the records: a chart chosen by its id is played as it was made, so its target level goes. */
  const pickPattern = (p: Pattern | null) => {
    if (!selected) return;
    const key = tierKey(selected, difficulty);
    if (typeof p === 'string') props.onTargetLevel(key, null);
    onSettingsChange(withPattern(settings, key, p));
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
  const setTargetLevel = (level: number | null) => selected && props.onTargetLevel(tierKey(selected, difficulty), level);
  /** ←→: the next entry of the difficulty row (the tiers, then the saved charts), none past either end. */
  const stepEntry = (dir: 1 | -1) => {
    const row = tiersShown;
    const at = savedEntry ? row.length + savedOnMode.indexOf(savedEntry) : row.findIndex((t) => t.id === difficulty);
    const next = at + dir;
    if (next < 0 || next >= row.length + savedOnMode.length) return;
    pickEntry(next < row.length ? { tier: row[next].id } : { chartId: savedOnMode[next - row.length].chartId });
  };
  const toggleFavorite = (id: string) =>
    onSettingsChange({ ...settings, favorites: favorites.has(id) ? settings.favorites.filter((f) => f !== id) : [...settings.favorites, id] });
  const toggleSelectedFavorite = () => {
    if (selected) toggleFavorite(selected.id);
  };
  // a folder that leaves the selected song out puts the cursor on its first song (see `selected`)
  const setFolder = (f: SongFolder) => onSettingsChange({ ...settings, songFolder: f });
  const stepFolder = () => setFolder(SONG_FOLDERS[(SONG_FOLDERS.indexOf(folder) + 1) % SONG_FOLDERS.length]);
  const stepSort = () => onSettingsChange({ ...settings, songSort: SONG_SORTS[(SONG_SORTS.indexOf(settings.songSort) + 1) % SONG_SORTS.length] });
  // Shift alone is the folder key unless the key mode plays a lane with it (7K+1S scratch, FX)
  const shiftFolder = shiftChangesFolder(laneKeysFor(settings, keyMode));
  const folderKey = shiftFolder ? 'Shift' : 'F6';

  const songList = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const detailTop = useRef<HTMLDivElement>(null);
  // the next move of the cursor by key or pad keeps it in the middle of the list (a click does not scroll)
  const centerCursor = useRef(false);
  /** Brings the cursor's row into view: in the middle of the list, or just inside its edge. */
  const showCursor = (center: boolean) => {
    const list = songList.current;
    const row = selected ? list?.querySelector<HTMLElement>(`[data-song-id="${selected.id}"]`) : null;
    if (!list || !row) return;
    if (!center) row.scrollIntoView({ block: 'nearest' });
    else list.scrollTop += row.getBoundingClientRect().top - list.getBoundingClientRect().top - (list.clientHeight - row.offsetHeight) / 2;
  };
  /** Puts the cursor on the song at `index` of the list (the focus follows when a row has it). */
  const cursorTo = (index: number) => {
    const song = filtered[index];
    if (!song) return;
    // a song row that has focus (it was clicked) hands it to the new row, so one row looks selected
    if (document.activeElement instanceof HTMLElement && songList.current?.contains(document.activeElement)) {
      songList.current.querySelector<HTMLElement>(`[data-song-id="${song.id}"]`)?.focus({ preventScroll: true });
    }
    if (song.id === selected?.id) return showCursor(true);
    centerCursor.current = true;
    onSelectSong(song.id);
  };
  /** The rows the list shows at once, less one: a page of PageUp / PageDown. */
  const pageRows = () => {
    const list = songList.current;
    const row = list?.querySelector<HTMLElement>('.song-item');
    return list && row ? Math.max(1, Math.floor(list.clientHeight / (row.offsetHeight + 2)) - 1) : 1;
  };
  const randomSong = () => {
    const at = randomIndex(filtered.length, filtered.findIndex((s) => s.id === selected?.id));
    if (at >= 0) cursorTo(at);
  };
  /**
   * The song row under the cursor takes the focus (leaving the search or a panel); with no server,
   * the offline panel's 다시 연결 (as when it came), and in an empty library its first button; else
   * nothing does.
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
  const openOptions = (tab?: PlayOptionsTab) => {
    if (tab) setOptionsTab(tab);
    setPanel('options');
  };
  const stepOptionsTab = (dir: 1 | -1) => {
    const at = PLAY_OPTIONS_TABS.indexOf(optionsTab);
    setOptionsTab(PLAY_OPTIONS_TABS[(at + dir + PLAY_OPTIONS_TABS.length) % PLAY_OPTIONS_TABS.length]);
  };
  const closeAddMenu = (refocus: boolean) => {
    setAddMenu(false);
    if (refocus) addMenuWrap.current?.querySelector<HTMLElement>('[data-testid="add-menu"]')?.focus();
  };

  /**
   * The keys of an open panel (Space, I): Q / E (and PageUp / PageDown, LB / RB) change the play
   * options' tab; while the focus is not in the song list ↑↓ go from line to line (the play
   * options' tabs are the line above their first row, so the menu buttons of any controller reach
   * every tab), ←→ change the focused row, pick a segmented choice's neighbour of the chosen one
   * (a tab, on the tabs) or move along a line of buttons, Home / End go to the first or the last
   * line, and Enter presses a focused button or box. The rest is the screen's (Enter plays). True
   * when the key was the panel's.
   */
  const panelKey = (e: KeyboardEvent, inList: boolean): boolean => {
    const root = detailTop.current?.querySelector<HTMLElement>('.select-panel');
    const body = root?.querySelector<HTMLElement>('.select-panel-body');
    if (!root || !body) return false;
    const at = document.activeElement instanceof HTMLElement && root.contains(document.activeElement) ? document.activeElement : null;
    const tabKey = e.code === 'KeyQ' || e.code === 'KeyE' || (!inList && (e.code === 'PageUp' || e.code === 'PageDown'));
    if (tabKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (panel !== 'options') return e.code.startsWith('Page');
      e.preventDefault();
      if (!e.repeat) stepOptionsTab(e.code === 'KeyQ' || e.code === 'PageUp' ? -1 : 1);
      return true;
    }
    if (inList) return false;
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
    if (from < 0) {
      // from nowhere (the panel's body, its close button) the arrows start on its first row
      go(rows[edgeLine(panelLines(rows), false)]);
    } else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      go(stops[lineStep(lines, from, e.code === 'ArrowDown' ? 1 : -1)]);
    } else {
      // ←→: a choice takes the neighbour of its chosen one, a line of buttons moves the focus along it
      const next = stops[alongLine(lines, from, e.code === 'ArrowRight' ? 1 : -1)];
      if (next?.closest('.segmented')) next.click();
      next?.focus();
    }
    return true;
  };

  // Keyboard: ↑↓ song (PageUp / PageDown a page, Home / End the ends), ←→ difficulty (and the
  // saved charts after it), Enter plays (Shift+Enter on autoplay: a pad's RS), Tab (Shift+Tab
  // back) key mode, Shift alone or F6 the folder, F2 a random song, F3 a favourite, Space the play
  // options, I the song info, / or Ctrl+F the search, + the add menu, F4 the order, F5 a new
  // pattern (Shift+F5 the default one), F10 the settings, Esc closes what is open. A panel takes
  // the arrows, Home / End and Enter while it is open (panelKey), and the song under it stays (F2
  // waits). A text field, a slider or a drop-down keeps the keys it uses itself.
  const shiftAlone = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'ShiftLeft' && e.code !== 'ShiftRight') shiftAlone.current = false;
      else if (!e.repeat) shiftAlone.current = shiftFolder && !keepsKey(e.target, e.code);
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
      // an open panel has the keys, but not while the focus is in the song list (a row was clicked)
      const inList = e.target instanceof Node && Boolean(songList.current?.contains(e.target));
      if (FUNCTION_KEYS.has(e.code)) {
        // F3 would search the page, F5 reload it, F6 go to the address bar and F10 open the browser's menu
        e.preventDefault();
        if (e.repeat) return;
        if (e.code === 'F2') {
          if (panel === 'none' || inList) randomSong();
        } else if (e.code === 'F3') toggleSelectedFavorite();
        else if (e.code === 'F4') stepSort();
        else if (e.code === 'F5' && e.shiftKey) defaultPattern();
        else if (e.code === 'F5') void newPattern();
        else if (e.code === 'F6') stepFolder();
        else props.onOpenSettings();
        return;
      }
      if ((e.code === 'KeyF' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) || (e.code === 'Slash' && plain && !e.shiftKey && !keepsKey(e.target, e.code))) {
        e.preventDefault();
        setAddMenu(false);
        searchBox.current?.focus();
        searchBox.current?.select();
        return;
      }
      if (e.target === searchBox.current) {
        // the search: ↑↓ and the page keys move the list's cursor, Enter and Esc leave it on that song
        if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'NumpadEnter') {
          // (Esc keeps what was typed: the browser's own Esc would clear it)
          e.preventDefault();
          focusList();
        } else if (e.code === 'ArrowDown' || e.code === 'ArrowUp' || e.code === 'PageDown' || e.code === 'PageUp') {
          e.preventDefault();
          const page = e.code.startsWith('Page') ? pageRows() : 1;
          const at = filtered.findIndex((s) => s.id === selected?.id);
          cursorTo(cursorStep(at, filtered.length, e.code === 'ArrowDown' || e.code === 'PageDown' ? page : -page, !e.repeat));
        }
        return;
      }
      if (e.code === 'Escape') {
        if (addMenu) closeAddMenu(true);
        else if (panel !== 'none') closePanel();
        return;
      }
      if (e.code === 'Enter' && e.shiftKey && !keepsKey(e.target, e.code)) {
        // Shift+Enter (a pad's RS) is the autoplay wherever the focus is: it presses no focused button or menu item
        e.preventDefault();
        if (!e.repeat && !addMenu) void play({ auto: true });
        return;
      }
      if (addMenu) {
        // the menu keeps the arrows; Enter presses its focused item
        if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
          e.preventDefault();
          const items = [...(addMenuWrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])];
          const at = items.indexOf(document.activeElement as HTMLElement);
          items[(at + (e.code === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
        }
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
        // the focus left an empty library's buttons (the add menu closed, a file was picked): the arrows bring it back
        e.preventDefault();
        focusList();
        return;
      }
      if (keepsKey(e.target, e.code)) return;
      if (panel !== 'none' && (e.defaultPrevented || panelKey(e, inList))) return;
      const idx = filtered.findIndex((s) => s.id === selected?.id);
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
      } else if (e.code === 'Enter') {
        e.preventDefault();
        if (!e.repeat) void play();
      } else if (e.code === 'Tab') {
        e.preventDefault();
        const step = e.shiftKey ? enabledKeyModes.length - 1 : 1;
        setKeyMode(enabledKeyModes[(enabledKeyModes.indexOf(keyMode) + step) % enabledKeyModes.length]);
      } else if (e.code === 'Space' && plain) {
        // a focused checkbox or button is not pressed by it: Space is the panel's key here
        e.preventDefault();
        if (!e.repeat) togglePanel('options');
      } else if (e.code === 'KeyI' && plain && !e.shiftKey) {
        if (!e.repeat) togglePanel('info');
      } else if (e.key === '+' && plain) {
        e.preventDefault();
        if (!e.repeat && health !== 'offline') setAddMenu(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !keepsKey(e.target, e.code)) e.preventDefault();
      if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && shiftAlone.current) {
        shiftAlone.current = false;
        if (!addMenu && shiftFolder) stepFolder();
      }
    };
    const onPointer = () => {
      shiftAlone.current = false;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  });

  // Whether Enter presses what has the focus (a panel's button or box, an empty library's button), for the key hints; a
  // render can take the focused control away (a panel closing, a tab changing), so it is read
  // after every render as well as on every move of the focus.
  const [enterPresses, setEnterPresses] = useState(false);
  const readFocus = useCallback(() => {
    const at = document.activeElement;
    setEnterPresses(Boolean(at && detailTop.current?.querySelector('.select-panel, .first-run')?.contains(at)) && pressesOnEnter(at));
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

  // The add menu: its first item takes the focus, and a press outside it closes it.
  useEffect(() => {
    if (!addMenu) return;
    addMenuWrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (e: PointerEvent) => {
      if (!addMenuWrap.current?.contains(e.target as Node)) setAddMenu(false);
    };
    window.addEventListener('pointerdown', outside);
    return () => window.removeEventListener('pointerdown', outside);
  }, [addMenu]);

  // The selected row stays in view however it was chosen (a new upload, a click, a new order);
  // moved by a key or the pad it sits in the middle of the list, with the songs around it in view.
  useEffect(() => {
    showCursor(centerCursor.current);
    centerCursor.current = false;
  }, [selected?.id, order]);

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

  // The song list's cells: the chart Enter plays on each tier of each song shown is worked out
  // when the list, the patterns or the options change, and its level and lamp are looked up again
  // as levels come in. A row is drawn again only when its own cells change (SongRow): a move of
  // the cursor draws two rows, a level coming in one.
  const listCharts = useMemo(
    () => filtered.map((s) => tiers.map((t) => tierChart(s, t.id).key)),
    [filtered, keyMode, settings.patterns, props.targetLevels, params],
  );
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
  const pick = (run: () => void) => () => {
    setAddMenu(false);
    run();
  };

  // the keys of the list, or of the open panel; a pad's buttons while the pad is used (the minor
  // ones give way on a narrow window, so the bar keeps what Enter does). With no server, the
  // offline panel's; with no songs, 곡 추가 and what needs no song (the play options, and the
  // song info's tools: the sync test, the calibration).
  const settingsHint: KeyHint = { keys: [], pad: ['RT'], label: '설정' };
  // (a panel opened over the offline one has its own keys)
  const offlineKeys = offline && panel === 'none';
  const hints: KeyHint[] = offlineKeys
    ? [{ keys: ['←', '→'], pad: ['←', '→'], label: '버튼' }, settingsHint]
    : songs.length === 0 && panel === 'none'
      ? [
          ...(firstRun ? [{ keys: ['↑', '↓'], pad: ['↑', '↓'], label: '버튼' }] : []),
          { keys: ['+'], label: '곡 추가', onClick: () => setAddMenu(true), testId: 'hint-add' },
          { keys: ['Tab'], pad: ['Y'], label: '키 모드' },
          { keys: ['Space'], pad: ['X'], label: '플레이 옵션', onClick: () => togglePanel('options'), testId: 'hint-options' },
          { keys: ['I'], pad: ['LT'], label: '곡 정보·도구', onClick: () => togglePanel('info'), testId: 'hint-info' },
          settingsHint,
        ]
      : filtered.length === 0 && panel === 'none'
      ? // a folder or a search that shows no song: the folder key that changes it, and what needs no song
        [
          { keys: [folderKey], label: '폴더', onClick: stepFolder, testId: 'hint-folder' },
          { keys: ['Tab'], pad: ['Y'], label: '키 모드' },
          { keys: ['Space'], pad: ['X'], label: '플레이 옵션', onClick: () => togglePanel('options'), testId: 'hint-options' },
          { keys: ['I'], pad: ['LT'], label: '곡 정보·도구', onClick: () => togglePanel('info'), testId: 'hint-info' },
          settingsHint,
        ]
      : panel === 'none'
      ? [
          { keys: ['↑', '↓'], pad: ['↑', '↓'], label: '곡' },
          { keys: ['PgUp', 'PgDn'], pad: ['LB', 'RB'], label: '페이지', minor: true },
          { keys: ['←', '→'], pad: ['←', '→'], label: '난이도' },
          { keys: ['Tab'], pad: ['Y'], label: '키 모드' },
          { keys: [folderKey], label: '폴더', onClick: stepFolder, testId: 'hint-folder' },
          { keys: ['Space'], pad: ['X'], label: '플레이 옵션', onClick: () => togglePanel('options'), testId: 'hint-options' },
          { keys: ['I'], pad: ['LT'], label: '곡 정보·도구', onClick: () => togglePanel('info'), testId: 'hint-info' },
          { keys: ['F2'], label: '랜덤', onClick: randomSong, testId: 'hint-random', minor: true },
          { keys: ['F3'], label: '즐겨찾기', onClick: toggleSelectedFavorite, testId: 'hint-favorite', minor: true },
          { keys: [], pad: ['RT'], label: '설정' },
        ]
      : [
          { keys: ['↑', '↓'], pad: ['↑', '↓'], label: '항목' },
          { keys: ['←', '→'], pad: ['←', '→'], label: '값' },
          ...(panel === 'options' ? [{ keys: ['Q', 'E'], pad: ['LB', 'RB'], label: '탭' }] : []),
          { keys: ['Space'], pad: ['X'], label: panel === 'options' ? '플레이 옵션 닫기' : '플레이 옵션', onClick: () => togglePanel('options'), testId: 'hint-options' },
          { keys: ['I'], pad: ['LT'], label: panel === 'info' ? '곡 정보·도구 닫기' : '곡 정보·도구', onClick: () => togglePanel('info'), testId: 'hint-info' },
        ];
  // Enter picks an item of the add menu, presses a panel's focused button or box (or the offline
  // panel's, or an empty library's), or plays (nothing to play without a song in sight)
  const enterLabel = offlineKeys ? '누르기' : addMenu ? '고르기' : enterPresses ? '누르기' : filtered.length > 0 ? '플레이' : null;
  const endHints: KeyHint[] = enterLabel ? [{ keys: ['Enter'], pad: ['A'], label: enterLabel, testId: 'hint-enter' }] : [];
  // beside it the play on autoplay (with the play options' switch on, Enter is one already)
  if (enterLabel === '플레이' && !autoPlay) endHints.unshift({ keys: ['Shift+Enter'], pad: ['RS'], label: '오토 플레이', testId: 'hint-autoplay', minor: true });
  if (panel !== 'none' || addMenu) endHints.unshift({ keys: ['Esc'], pad: ['B'], label: '닫기', onClick: () => (addMenu ? closeAddMenu(false) : closePanel()) });

  return (
    <div
      className="select-screen screen-enter"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <Backdrop song={selected} />
      <TopBar name="선곡">
        <div className="add-menu-wrap" ref={addMenuWrap}>
          <button
            className={songs.length === 0 && health !== 'offline' ? 'primary' : 'quiet'}
            data-testid="add-menu"
            aria-haspopup="menu"
            aria-expanded={addMenu}
            disabled={health === 'offline'}
            onClick={() => setAddMenu((v) => !v)}
          >
            곡 추가 <kbd>+</kbd>
          </button>
          {addMenu && (
            <div className="add-menu" role="menu" aria-label="곡 추가">
              <button role="menuitem" data-testid="upload-button" onClick={pick(() => fileInput.current?.click())}>
                <b>음악 파일</b>
                <span>mp3 · ogg · wav · flac · m4a</span>
              </button>
              <button role="menuitem" data-testid="demo-button" onClick={pick(() => void addDemo())}>
                <b>데모 곡</b>
                <span>합성한 128 BPM 곡</span>
              </button>
              <button role="menuitem" data-testid="import-button" onClick={pick(() => importInput.current?.click())} title="osu!mania(.osz·.osu) · BMS · bmson 채보 파일이나 압축 파일">
                <b>채보 가져오기 · 파일</b>
                <span>.osz · .zip · .osu · .bms · .bmson</span>
              </button>
              <button role="menuitem" data-testid="import-folder-button" onClick={pick(() => folderInput.current?.click())} title="BMS·bmson 폴더(키음 포함)">
                <b>채보 가져오기 · 폴더</b>
                <span>BMS · bmson 폴더 (키음 포함)</span>
              </button>
              <button role="menuitem" className="menu-apart" data-testid="open-replay" onClick={pick(() => replayInput.current?.click())}>
                <b>리플레이 파일 보기</b>
                <span>결과 화면에서 내보낸 .grgreplay.json</span>
              </button>
            </div>
          )}
        </div>
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

      {offline && (
        <section className="panel offline" data-testid="server-offline" ref={offlinePanel}>
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
      )}

      <div className="select-body">
        <section className="song-list-panel" aria-label="곡 목록">
          <div className="folders">
            {SONG_FOLDERS.map((f) => (
              <button key={f} className={`chip ${folder === f ? 'active' : ''}`} aria-pressed={folder === f} data-testid={`folder-${f}`} onClick={() => setFolder(f)}>
                {FOLDER_LABELS[f]} <b>{folderCounts[f]}</b>
              </button>
            ))}
          </div>
          <div className="list-tools">
            <input
              ref={searchBox}
              type="search"
              className="search"
              placeholder="제목·아티스트 검색 ( / )"
              aria-label="곡 검색"
              data-testid="song-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="chip sort" data-testid="song-sort" onClick={stepSort} title="정렬 바꾸기">
              {SORT_LABELS[settings.songSort]} <kbd>F4</kbd>
            </button>
          </div>
          {importReport && (
            <div className="import-report" data-testid="import-report">
              <div className="row">
                <strong>채보 {importReport.charts.length}개를 가져왔습니다</strong>
                <button className="small" onClick={() => setImportReport(null)}>닫기</button>
              </div>
              {importReport.warnings.length > 0 && (
                <details>
                  <summary>알림 {importReport.warnings.length}개</summary>
                  <ul>{importReport.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </details>
              )}
            </div>
          )}
          <div ref={songList} className={`song-list ${dragOver ? 'drag' : ''}`} data-testid="song-list">
            {filtered.length === 0 && (
              <div className="empty-list">
                {songs.length === 0
                  ? offline
                    ? '서버에 연결되면 곡을 추가할 수 있습니다.'
                    : '음악 파일을 끌어다 놓거나 "곡 추가"를 누르세요. (mp3 · ogg · wav · flac · m4a)'
                  : query.trim()
                    ? '검색 결과가 없습니다'
                    : `${FOLDER_LABELS[folder]} 폴더에 곡이 없습니다 (${folderKey}로 다음 폴더)`}
              </div>
            )}
            {filtered.map((s, i) => (
              <SongRow
                key={s.id}
                song={s}
                active={s.id === selected?.id}
                favorite={favorites.has(s.id)}
                cells={listCells[i]}
                // the column ←→ picked; on the selected song a saved chart picked there takes it
                tier={savedEntry && s.id === selected?.id ? null : chosen}
                onPick={onSelectSong}
              />
            ))}
          </div>
        </section>

        <main className={`song-detail ${panel !== 'none' ? 'panel-open' : ''}`}>
          <div className="detail-top" ref={detailTop}>
            {panel === 'options' ? (
              <PlayOptionsPanel
                settings={settings}
                onSettingsChange={onSettingsChange}
                keyMode={keyMode}
                tab={optionsTab}
                onTab={setOptionsTab}
                autoPlay={autoPlay}
                onAutoPlay={setAutoPlay}
                chart={chart}
                practice={practice}
                onPracticeToggle={(on) => void togglePractice(on)}
                onPracticeChange={setPractice}
                targetLevel={spec ? targetLevel : undefined}
                onTargetLevel={setTargetLevel}
                maxLevel={maxLevel}
                defaultLevel={Math.round((selectedTier.levels[0] + selectedTier.levels[1]) / 2)}
                levelLabel={levelLabel}
                songTitle={selected?.title ?? null}
                onClose={closePanel}
              />
            ) : panel === 'info' ? (
              <SongInfoPanel
                song={selected}
                chart={chart}
                chartFailed={entryChartKey !== null && chartStore.hasFailed(entryChartKey)}
                palette={settings.palette}
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
                onUploadBga={(file) => void uploadBga(file)}
                onRemoveBga={() => void removeBga()}
                onUploadCover={(file) => void uploadCover(file)}
                onRemoveCover={() => void removeCover()}
                onRemoveSong={() => void remove()}
                // the sections are part of what the charts are made of: the new chart comes by itself
                onSectionsSaved={async () => {
                  await refresh();
                }}
                onSyncTest={(byHand) => onPlay(syncTestRequest(keyMode, !byHand))}
                onCalibrate={props.onCalibrate}
                onClose={closePanel}
              />
            ) : selected ? (
              <SongHero
                song={selected}
                favorite={favorites.has(selected.id)}
                onFavorite={() => toggleFavorite(selected.id)}
                onInfo={() => setPanel('info')}
                onReanalyze={() => void reanalyze()}
                onAutoplay={ready && !autoPlay ? () => void play({ auto: true }) : null}
                autoplayDisabled={busy !== null || entryLoading}
              />
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
                <p className="hint">
                  {songs.length === 0
                    ? offline
                      ? '서버에 연결되면 곡을 추가할 수 있습니다.'
                      : '오른쪽 위 "곡 추가"로 음악 파일을 넣거나, 파일을 이 화면에 끌어다 놓으세요.'
                    : `보이는 곡이 없습니다. 검색어를 지우거나 폴더를 바꾸세요 (${folderKey}).`}
                </p>
              </div>
            )}
          </div>

          {selected && (
            <>
              <div className="mode-row">
                <div className="key-modes">
                  <div className="segmented">
                    {enabledKeyModes.map((m) => {
                      // the song's edited and imported charts are entries on their own key mode only: the others say they have some
                      // (the count is the button's description, its name stays the key mode's)
                      const saved = savedLoaded ? savedCharts.charts.filter((c) => c.keyMode === m).length : 0;
                      return (
                        <button key={m} className={m === keyMode ? 'active' : ''} onClick={() => setKeyMode(m)} title={saved > 0 ? `가져오거나 편집한 채보 ${saved}개` : undefined}>
                          {m}
                          {saved > 0 && (
                            <small className="mode-saved" data-testid={`mode-saved-${m}`} aria-hidden="true">
                              {saved}
                            </small>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <kbd>Tab</kbd>
                </div>
                <span className="mode-rules">
                  {/* generation options that make another chart (Space → 생성 옵션): its records are of that chart */}
                  {generationChanged.length > 0 && (
                    <span className="rule-chip" data-testid="chip-generation" title={generationChanged.join(' · ')}>
                      생성 옵션 변경
                    </span>
                  )}
                  {/* a judgement or score rule that is not the default (Space → 플레이 규칙) */}
                  {judgementChip(settings.judgementMode) && (
                    <span className="rule-chip" data-testid="chip-judgement">
                      {judgementChip(settings.judgementMode)}
                    </span>
                  )}
                  {settings.ruleset !== DEFAULT_SETTINGS.ruleset && (
                    <span className="rule-chip" data-testid="chip-ruleset">
                      {rulesetConfigs[settings.ruleset].label}
                    </span>
                  )}
                </span>
              </div>

              <div className="difficulty-row" data-testid="difficulty-row">
                {tiersShown.map((t) => {
                  const brief = briefOn(selected, t.id);
                  const record = tierRecord(selected, t.id);
                  const target = props.targetLevels[tierKey(selected, t.id)];
                  const other = brief && !record ? otherBest(recordsOn(selected, keyMode), t.id, brief.chartId) : null;
                  const failed = ready && !brief && chartStore.hasFailed(tierChart(selected, t.id).key);
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
                      recordPending={recordPending(selected, t.id)}
                      other={other}
                      otherLabel={other ? otherLabel(other, generator) : ''}
                      ruleset={settings.ruleset}
                      targetLevel={target === undefined ? null : Math.min(target, maxLevel)}
                      pattern={patternOf(settings, tierKey(selected, t.id))}
                      generating={!savedEntry && t.id === difficulty && generating}
                      folded={panel !== 'none'}
                      onPick={() => setDifficulty(t.id)}
                    />
                  );
                })}
              </div>

              {/* the song's edited and imported charts of this key mode, each its own entry after the
                  tiers (under an open panel, which takes the column's height, only the chosen one) */}
              {(panel === 'none' ? savedOnMode : savedEntry ? [savedEntry] : []).length > 0 && (
                <section className="saved-charts" data-testid="saved-charts" aria-label="저장된 채보">
                  {(panel === 'none' ? savedOnMode : savedEntry ? [savedEntry] : []).map((c) => (
                    <SavedPlate
                      key={c.chartId}
                      chart={c}
                      active={savedEntry?.chartId === c.chartId}
                      record={recordOf(selected, c.chartId)}
                      ruleset={settings.ruleset}
                      generating={savedEntry?.chartId === c.chartId && generating}
                      folded={panel !== 'none'}
                      onPick={() => pickEntry({ chartId: c.chartId })}
                    />
                  ))}
                </section>
              )}

              <div className="go-row">
                {ready ? (
                  <button className="option-chips" data-testid="play-options-button" aria-label="플레이 옵션" aria-expanded={panel === 'options'} onClick={() => (panel === 'options' ? setPanel('none') : openOptions())}>
                    <span className="chip">
                      SPEED <b>{speedText(settings.hiSpeed)}</b>
                    </span>
                    <span className="chip">
                      게이지 <b>{gaugeRules[settings.gaugeType].label}</b>
                    </span>
                    <span className="chip">
                      배치 <b>{placementLabels[settings.placement]}</b>
                    </span>
                    <span className="chip">
                      FEVER <b>{FEVER_SHORT[settings.fever]}</b>
                    </span>
                  </button>
                ) : (
                  // why play is off: the song is still being analysed, or its analysis failed (why
                  // first, the server's own words folded under it)
                  <div className="analysis-status" data-testid="analysis-status">
                    {selected.status === 'error' ? (
                      <>
                        <span className="error" data-testid="analysis-error">
                          분석 실패 · {failureReason(selected.error)}
                        </span>
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
                          {selected.progressLabel || '분석 대기'} <span className="value">{Math.round(selected.progress * 100)}%</span>
                        </span>
                        <span className="progress">
                          <span style={{ width: `${Math.round(selected.progress * 100)}%` }} />
                        </span>
                      </>
                    )}
                  </div>
                )}
                <div className="go-actions">
                  {pattern !== null && (
                    <button data-testid="default-pattern" disabled={!ready || busy !== null} onClick={defaultPattern} title="이 난이도를 처음의 패턴으로 되돌립니다 (그 패턴의 기록으로)">
                      기본 패턴 <kbd>Shift+F5</kbd>
                    </button>
                  )}
                  <button
                    data-testid="generate-button"
                    disabled={!ready || busy !== null || savedEntry !== null}
                    onClick={() => void newPattern()}
                    title={savedEntry ? '가져오거나 편집한 채보는 새 패턴을 만들지 않습니다' : '같은 난이도로 다른 패턴을 만듭니다. 이 난이도는 앞으로 그 패턴으로 칩니다'}
                  >
                    새 패턴 <kbd>F5</kbd>
                  </button>
                  <button className="primary play" data-testid="play-button" disabled={!ready || busy !== null || entryLoading} onClick={() => void play()}>
                    {practice ? '연습 시작' : autoPlay ? '오토 플레이' : '플레이'} <kbd>Enter</kbd>
                  </button>
                </div>
              </div>
            </>
          )}
          {selected && panel === 'none' && (
            <div className="summary-room">
              <ChartSummary
                chart={chart}
                ready={ready}
                failed={entryChartKey !== null && chartStore.hasFailed(entryChartKey)}
                best={entryRecord}
                known={entryKnown}
                name={savedEntry ? savedEntry.name || savedLabel(savedEntry) : selectedTier.label}
                ruleset={settings.ruleset}
              />
            </div>
          )}
          <p className="select-status" aria-live="polite">
            {error ? (
              <span className="error" data-testid="select-error">
                {error}
              </span>
            ) : busy ? (
              <span data-testid="busy">{busy}</span>
            ) : null}
          </p>
        </main>
      </div>
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

function levelLabel(level: number): string {
  return `Lv.${level}`;
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

/** A tier's cell on the song list with its tier (`absent`: the song has no chart on it, the cell is left empty). */
type RowMark = TierMark & { tier: DifficultyTier; absent: boolean };

/** A song's cells on the song list: its tiers', and its saved charts' best (null: none played). */
interface ListCells {
  tiers: RowMark[];
  saved: (TierMark & { name: string }) | null;
}

/**
 * A level on the song list with its lamp's mark beside it (on a full combo the whole cell is the
 * lamp's); a level never played has no mark, one not known yet a dash. A lamp of another chart of
 * the tier than the one Enter plays is a faint mark. The entry picked with ←→ is underlined.
 */
function LampCell({ mark, title, saved = false, active }: { mark: TierMark; title: string; saved?: boolean; active: boolean }) {
  return (
    <span
      className={`tier-level lamp-${mark.lamp ? lampClass(mark.lamp) : 'none'} ${mark.level === null ? 'unknown' : ''} ${mark.other ? 'other' : ''} ${saved ? 'saved' : ''} ${active ? 'active' : ''}`}
      title={title}
    >
      <LampMark />
      {mark.level ?? '–'}
    </span>
  );
}

interface SongRowProps {
  song: Song;
  active: boolean;
  favorite: boolean;
  cells: ListCells;
  /** The tier picked with ←→ (null: the song's saved chart is picked, its cell is the one). */
  tier: string | null;
  onPick: (songId: string) => void;
}

/** Two rows that draw the same (the song as listed, and what its cells show). */
function sameRow(a: SongRowProps, b: SongRowProps): boolean {
  const at = a.cells.tiers;
  const bt = b.cells.tiers;
  return (
    a.song === b.song &&
    a.active === b.active &&
    a.favorite === b.favorite &&
    a.tier === b.tier &&
    a.onPick === b.onPick &&
    at.length === bt.length &&
    at.every((m, i) => m.tier === bt[i].tier && m.absent === bt[i].absent && sameMark(m, bt[i])) &&
    sameMark(a.cells.saved, b.cells.saved) &&
    a.cells.saved?.name === b.cells.saved?.name
  );
}

/** What a tier's cell says when pointed at: its tier, level and lamp (another chart's: whose). */
function cellTitle(m: RowMark): string {
  const level = m.level === null ? '' : ` ${levelLabel(m.level)}`;
  return `${m.tier.label}${level} · ${m.lamp === null ? '기록 없음' : m.other ? `기록 없음 (다른 채보 ${m.lamp})` : m.lamp}`;
}

/**
 * A row of the song list: the song's picture, its name, and for each tier the level and lamp of
 * the chart Enter plays (what its records say until that is known); before them, set apart, its
 * saved charts' best lamp (the tiers line up at the row's end in every row). Drawn again only when
 * what it shows changes (the list has a row per song).
 */
const SongRow = memo(function SongRow(props: SongRowProps) {
  const { song, cells } = props;
  // a song without the tier chosen plays the hardest it has under it
  const playedTier = props.tier === null ? null : tierUpTo(cells.tiers.filter((m) => !m.absent).map((m) => m.tier), props.tier);
  const working = song.status === 'queued' || song.status === 'analyzing';
  return (
    <button className={`song-item ${props.active ? 'active' : ''}`} data-testid="song-item" data-song-id={song.id} onClick={() => props.onPick(song.id)}>
      <SongArt song={song} size={48} />
      <span className="song-item-text">
        <span className="song-title">{song.title}</span>
        <span className="song-sub">{song.artist || '알 수 없는 아티스트'}</span>
      </span>
      {working ? (
        <span className="song-state">
          분석 중
          <span className="progress small">
            <span style={{ width: `${Math.round(song.progress * 100)}%` }} />
          </span>
        </span>
      ) : song.status === 'error' ? (
        <span className="song-state error">분석 실패</span>
      ) : (
        <span className="song-tiers">
          {cells.saved && <LampCell mark={cells.saved} saved title={`${cells.saved.name} · ${cells.saved.lamp}`} active={props.tier === null} />}
          {cells.tiers.map((m) =>
            m.absent ? <span key={m.tier.id} className="tier-level absent" /> : <LampCell key={m.tier.id} mark={m} title={cellTitle(m)} active={m.tier.id === playedTier} />,
          )}
        </span>
      )}
      {props.favorite && <i className="fav-mark" aria-label="즐겨찾기" />}
    </button>
  );
}, sameRow);

/**
 * The selected song: its picture, name, tempo, length and metre (and, when its analysis failed, a
 * new try). One of its buttons plays the chart on autoplay (`onAutoplay`; null before the song is
 * ready, or while the play options' switch makes Enter one already): up here rather than beside
 * the play button, so the play row keeps one line and a 900 px window the room for the summary.
 */
function SongHero({
  song,
  favorite,
  onFavorite,
  onInfo,
  onReanalyze,
  onAutoplay,
  autoplayDisabled,
}: {
  song: Song;
  favorite: boolean;
  onFavorite: () => void;
  onInfo: () => void;
  onReanalyze: () => void;
  onAutoplay: (() => void) | null;
  autoplayDisabled: boolean;
}) {
  const sketch = useSketch(song);
  return (
    <section className="hero">
      <div className="hero-art">
        <SongArt song={song} size={400} />
      </div>
      <div className="hero-text">
        <h2 data-testid="song-title" title={song.title}>
          {song.title}
        </h2>
        <p className="artist">{song.artist || '알 수 없는 아티스트'}</p>
        <div className="hero-facts">
          <span>
            <span className="label">BPM</span>
            <b data-testid="song-bpm">{bpmLabel(song)}</b>
            {song.overrides.bpm ? <small>보정됨</small> : null}
          </span>
          <span>
            <span className="label">길이</span>
            <b>{formatTime(song.durationMs)}</b>
          </span>
          <span>
            <span className="label">박자</span>
            <b>{sketch ? `${sketch.beatsPerBar}/4` : '-'}</b>
          </span>
          <span className="hero-actions">
            {song.status === 'error' && (
              <button className="small" data-testid="reanalyze-failed" onClick={onReanalyze}>
                다시 분석
              </button>
            )}
            {onAutoplay && (
              <button className="quiet small autoplay" data-testid="autoplay-button" disabled={autoplayDisabled} onClick={onAutoplay} title="이번 판만 노트를 자동으로 칩니다(Shift+Enter). 기록은 남지 않습니다">
                오토 플레이 <kbd>Shift+Enter</kbd>
              </button>
            )}
            <button className={`quiet small fav-toggle ${favorite ? 'on' : ''}`} aria-pressed={favorite} data-testid="favorite-toggle" onClick={onFavorite}>
              {favorite ? '즐겨찾기 해제' : '즐겨찾기'} <kbd>F3</kbd>
            </button>
            <button className="quiet small" data-testid="open-song-info" onClick={onInfo}>
              정보·도구 <kbd>I</kbd>
            </button>
          </span>
        </div>
      </div>
    </section>
  );
}

/**
 * The best play of a plate's chart: its lamp, the score rule's number and its MAX COMBO; a chart
 * never played names the tier's best on another of its charts (`otherLabel`: another pattern, the
 * default one as an earlier generator made it). While the chart is worked out its record is not
 * known either (a dash, not 기록 없음).
 */
function PlateRecord({ record, other = null, otherLabel = '', pending = false, ruleset }: { record: ScoreRecord | null; other?: ScoreRecord | null; otherLabel?: string; pending?: boolean; ruleset: RulesetId }) {
  return (
    <>
      <span className="diff-record">
        {record ? (
          <>
            <span className={`lamp-text lamp-${lampClass(record.lamp)}`}>
              <LampMark />
              <span className="lamp-name">{record.lamp}</span>
            </span>
            <span className="diff-lamp">{headlineText(record, ruleset)}</span>
          </>
        ) : (
          <span className="none">{pending ? '–' : '기록 없음'}</span>
        )}
      </span>
      <span className="diff-sub">
        {record ? (
          <span>
            MAX COMBO <b>{record.maxCombo.toLocaleString('en-US')}</b>
          </span>
        ) : (
          other && (
            <span className="other-best" title={`${otherLabel}의 기록: ${other.lamp} ${headlineText(other, ruleset)} (곡 정보에서 고를 수 있습니다)`}>
              {otherLabel}{' '}
              <span className={`lamp-text lamp-${lampClass(other.lamp)}`}>
                <LampMark />
                <span className="lamp-name">{other.lamp}</span>
              </span>
            </span>
          )
        )}
      </span>
    </>
  );
}

/**
 * A difficulty of the song: the level and notes of the chart Enter plays on it (worked out as soon
 * as the song is chosen: 계산 중 until then), and that chart's best play. Folded under an open
 * panel it is a line: its short name, level and lamp.
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
  /** Its record is not known until its chart is. */
  recordPending: boolean;
  /** With no play of its own, the tier's best on another of its charts, and what that chart is. */
  other: ScoreRecord | null;
  otherLabel: string;
  ruleset: RulesetId;
  targetLevel: number | null;
  /** Its pattern, when it is not the default one: made with 새 패턴 (a seed), or chosen from its records (a chart's id). */
  pattern: Pattern | null;
  generating: boolean;
  folded: boolean;
  onPick: () => void;
}) {
  const { tier: t, brief, record } = props;
  const level = brief?.level ?? null;
  const waiting = props.pending || props.generating;
  // the level the tests and the summary read: the selected tier's, once known
  const levelId = { 'data-testid': props.active && brief ? 'chart-level' : undefined, 'data-chart-id': props.active ? brief?.chartId : undefined };
  if (props.folded) {
    // the level follows the short name (HD 8)
    const name = `${t.label}${level === null ? '' : ` ${levelLabel(level)}`}${record ? ` · ${record.lamp}` : ''}`;
    return (
      <button
        className={`difficulty folded ${props.active ? 'active' : ''}`}
        style={{ ['--diff' as string]: t.color } as CSSProperties}
        onClick={props.onPick}
        aria-label={name}
        title={name}
      >
        <span className="diff-name">{t.short}</span>
        <strong className={`diff-fold-level ${level === null ? 'none' : ''} ${waiting ? 'level-pending' : ''}`} {...levelId}>
          {level ?? '–'}
        </strong>
        {record && (
          <span className={`lamp-text lamp-${lampClass(record.lamp)}`}>
            <LampMark />
            <span className="lamp-name">{record.lamp}</span>
          </span>
        )}
        {props.generating && <i className="plate-pending" aria-hidden="true" />}
      </button>
    );
  }
  const note = props.generating
    ? '만드는 중'
    : props.pending
      ? '계산 중'
      : brief
        ? `${brief.noteCount.toLocaleString('en-US')} 노트`
        : props.failed
          ? '만들지 못함'
          : `${levelLabel(t.levels[0])}–${t.levels[1]}`;
  // the short name, or what makes its chart another than the default: its target level, its pattern
  const marks = [props.targetLevel !== null ? `목표 ${levelLabel(props.targetLevel)}` : null, props.pattern === null ? null : typeof props.pattern === 'number' ? '새 패턴' : '고른 패턴'];
  const side = marks.filter((m) => m !== null).join(' · ') || t.short;
  return (
    <button
      className={`difficulty ${props.active ? 'active' : ''}`}
      style={{ ['--diff' as string]: t.color } as CSSProperties}
      onClick={props.onPick}
      title={`${t.label}의 레벨 범위 Lv.${t.levels[0]}–${t.levels[1]}`}
    >
      <span className="diff-head">
        <span className="diff-name">{t.label}</span>
        <span className={`diff-short ${side !== t.short ? 'pattern-tag' : ''}`} hidden={side === t.label}>
          {side}
        </span>
      </span>
      <span className={`diff-level ${waiting ? 'level-pending' : ''}`}>
        <strong className={level === null ? 'none' : ''} {...levelId}>
          <small>Lv.</small>
          {level ?? '–'}
        </strong>
        <em>{note}</em>
      </span>
      <PlateRecord record={record} other={props.other} otherLabel={props.otherLabel} pending={props.recordPending} ruleset={props.ruleset} />
      {(props.generating || (props.active && props.pending)) && <i className="plate-pending" aria-hidden="true" />}
    </button>
  );
}

/**
 * An edited or imported chart of the song as an entry of the difficulty row, after the tiers: the
 * format it came in and its name, the level its file gives it beside our estimate, and its best
 * play. Folded under an open panel it is a line.
 */
function SavedPlate(props: { chart: SavedChart; active: boolean; record: ScoreRecord | null; ruleset: RulesetId; generating: boolean; folded: boolean; onPick: () => void }) {
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
  }, [props.active, props.folded]);
  return (
    <div ref={plate} className={`saved-chart ${props.active ? 'active' : ''} ${props.folded ? 'folded' : ''}`} data-testid="saved-chart">
      <button
        className="saved-plate"
        data-testid="pick-saved"
        aria-pressed={props.active}
        onClick={props.onPick}
        title={`${savedLabel(c)} ${c.name} · ${levels} · ${c.noteCount.toLocaleString('en-US')} 노트`}
      >
        <span className="saved-head">
          <span className={`kind kind-${c.kind}`}>{savedLabel(c)}</span>
          <span className="name">{c.name || c.difficulty}</span>
        </span>
        <span className="saved-line">
          <span className="saved-level" data-testid={props.active ? 'saved-level' : undefined}>
            {levels}
          </span>
          {record ? (
            <span className={`lamp-text lamp-${lampClass(record.lamp)}`}>
              <LampMark />
              {record.lamp} <b>{headlineText(record, props.ruleset)}</b>
            </span>
          ) : (
            <span className="none">기록 없음</span>
          )}
        </span>
        {props.generating && <i className="plate-pending" aria-hidden="true" />}
      </button>
    </div>
  );
}

/**
 * Under the play buttons on a tall window (900 px and up): the chart's numbers and density, and
 * the best play of the chart chosen (a dash until it is `known`), as much of them as the room left
 * under the buttons holds (the graph goes first, then the record). A song not analysed has no
 * chart to speak of.
 */
function ChartSummary(props: { chart: ServerChart | null; ready: boolean; failed: boolean; best: ScoreRecord | null; known: boolean; name: string; ruleset: RulesetId }) {
  const { chart, best, ruleset } = props;
  const m = chart?.meta;
  const rules = rulesetConfigs[ruleset];
  // the score of the rule and its grade (EX-SCORE's rank needs the chart's maximum: none)
  const { score, grade } = best ? recordScore(best, ruleset) : { score: null, grade: null };
  return (
    <section className="chart-summary" data-testid="chart-summary" aria-label="채보 요약">
      {!props.ready ? null : chart && m ? (
        <>
          <dl className="summary-stats">
            <div>
              <dt>노트</dt>
              <dd>{m.noteCount.toLocaleString('en-US')}</dd>
            </div>
            <div>
              <dt>롱노트</dt>
              <dd>{chart.notes.filter((n) => n.type === 'hold').length.toLocaleString('en-US')}</dd>
            </div>
            <div>
              <dt>평균 / 최대 NPS</dt>
              <dd>
                {m.nps.avg} / {m.nps.peak}
              </dd>
            </div>
            <div>
              <dt>세부 난이도</dt>
              <dd>{m.rating.toFixed(2)}</dd>
            </div>
          </dl>
          <NpsGraph graph={m.nps.graph} />
        </>
      ) : (
        <p className="hint">{props.failed ? '채보를 만들지 못했습니다. Enter를 누르면 다시 만들고 이유를 알려 줍니다.' : '채보를 계산하는 중…'}</p>
      )}
      <dl className="summary-stats summary-record" data-testid="summary-record">
        <div>
          <dt>{props.name} 최고 기록</dt>
          <dd className={best ? `lamp-text lamp-${lampClass(best.lamp)}` : 'none'}>
            {best && <LampMark />}
            {best ? best.lamp : props.known ? '기록 없음' : '–'}
          </dd>
        </div>
        {best && (
          <>
            <div>
              <dt>{rules.scoring === 'exscore' ? 'EX-SCORE' : '점수'}</dt>
              <dd>{score === null ? '–' : score.toLocaleString('en-US')}</dd>
            </div>
            {grade && (
              <div>
                <dt>등급</dt>
                <dd>{grade}</dd>
              </div>
            )}
            <div>
              <dt>RATE</dt>
              <dd>{best.rate.toFixed(2)}%</dd>
            </div>
            <div>
              <dt>MAX COMBO</dt>
              <dd>{best.maxCombo.toLocaleString('en-US')}</dd>
            </div>
            {best.minBreaks !== undefined && (
              <div>
                <dt>최소 {rules.missLabel}</dt>
                {/* none yet: every play so far failed partway */}
                <dd>{best.minBreaks === null ? '–' : best.minBreaks.toLocaleString('en-US')}</dd>
              </div>
            )}
            <div>
              <dt>플레이</dt>
              <dd>{best.plays}회</dd>
            </div>
            {best.lastPlayedAt !== undefined && (
              <div>
                <dt>마지막 플레이</dt>
                <dd>{dayText(best.lastPlayedAt)}</dd>
              </div>
            )}
          </>
        )}
      </dl>
    </section>
  );
}
