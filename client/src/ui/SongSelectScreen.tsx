import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { api, ApiError, type Health, type ImportResult, type SavedChart, type ScoreRecord, type ServerChart, type Song } from '../api/client';
import { forgetSongBuffer } from '../audio/bufferCache';
import { menuMusic, PREVIEW_VOLUME } from '../audio/songPreview';
import { difficultySystems, enabledKeyModes, gaugeRules, tierOf, type DifficultyTier } from '../engine/config';
import { placementLabels } from '../engine/placement';
import { isReplay, type ReplayData } from '../engine/replay';
import { rulesetConfigs } from '../engine/ruleset';
import { TempoMap } from '../engine/tempo';
import type { KeyModeId } from '../engine/types';
import type { PlayAction } from '../input/playKeys';
import {
  bindingLabel,
  DEFAULT_SETTINGS,
  laneKeysFor,
  playKeysOf,
  SONG_FOLDERS,
  SONG_SORTS,
  songOffsetOf,
  withSongOffset,
  type Settings,
  type SongFolder,
} from '../settings/settings';
import type { PlayRequest, PracticeOptions } from './App';
import { speedText } from './format';
import { lampClass } from './lamps';
import { FEVER_SHORT, generationParams, PLAY_OPTIONS_TABS, PlayOptionsPanel, type PlayOptionsTab } from './PlayOptions';
import { buildPlayRequest } from './playRequest';
import { judgementChip } from './playRules';
import { alongLine, cursorStep, edgeLine, lineStep, panelLines, panelStops, pressesOnEnter, randomIndex, shiftChangesFolder } from './selectNav';
import { HintBar, TopBar, type KeyHint } from './shell';
import { KIND_LABELS, NpsGraph, SongInfoPanel } from './SongInfoPanel';
import { Backdrop, bpmLabel, SongArt, useSketch } from './songArt';
import { bestByTier, FOLDER_LABELS, inFolder, recordsOn, sortSongs, SORT_LABELS } from './songRecords';
import { syncTestRequest } from './syncTestRequest';

interface Props {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onPlay: (request: PlayRequest) => void;
  onCalibrate: () => void;
  onOpenSettings: () => void;
  /** Open the chart editor on a chart of the selected song. */
  onEdit: (chart: ServerChart, song: Song) => void;
  selectedSongId: string | null;
  onSelectSong: (id: string | null) => void;
}

const ACCEPT = '.mp3,.ogg,.oga,.opus,.wav,.flac,.m4a,.aac,audio/*';
const IMPORT_ACCEPT = '.osz,.zip,.osu,.bms,.bme,.bml,.bmson';
const CHART_FILE = /\.(osz|zip|osu|bms|bme|bml|pms|bmson)$/i;
const IMPORT_FILE = /\.(osz|zip|osu|bms|bme|bml|pms|bmson|wav|ogg|oga|flac|mp3|m4a|aac|opus)$/i;

/** The part of the detail column above the key modes: the song, or one of the two panels. */
type Panel = 'none' | 'options' | 'info';

/** The in-play keys of the song offset, as the song info names them. */
function offsetKeysText(keys: Record<PlayAction, string>): string {
  const pair = (down: PlayAction, up: PlayAction) => `${bindingLabel(keys[down])} / ${bindingLabel(keys[up])}`;
  return `${pair('offsetDown', 'offsetUp')} (5ms씩 ${pair('offsetDownBig', 'offsetUpBig')})`;
}

/** The function keys of the song select (each with its own job, never repeated by a held key). */
const FUNCTION_KEYS = new Set(['F2', 'F3', 'F4', 'F5', 'F6', 'F10']);

/** A day as the record shows it: 2026. 10. 21. */
function dateText(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString('ko-KR');
}

function formatTime(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function SongSelectScreen(props: Props) {
  const { settings, onSettingsChange, onPlay, selectedSongId, onSelectSong } = props;
  const [health, setHealth] = useState<Health | null | 'offline'>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [query, setQuery] = useState('');
  const [chart, setChart] = useState<ServerChart | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [targetLevel, setTargetLevel] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [panel, setPanel] = useState<Panel>('none');
  const [optionsTab, setOptionsTab] = useState<PlayOptionsTab>('rules');
  const [addMenu, setAddMenu] = useState(false);
  const [practice, setPractice] = useState<PracticeOptions | null>(null);
  const [savedCharts, setSavedCharts] = useState<SavedChart[]>([]);
  const [importReport, setImportReport] = useState<ImportResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const replayInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const addMenuWrap = useRef<HTMLDivElement>(null);

  // the settings as they are now, for what ends after an await (an upload, an import)
  const current = useRef(settings);
  current.current = settings;
  const keyMode = settings.lastKeyMode;
  const system = difficultySystems[settings.difficultySystem];
  const tiers = system.tiers;
  const difficulty = tierOf(system, settings.lastDifficulty).id;
  const favorites = useMemo(() => new Set(settings.favorites), [settings.favorites]);
  const folder = settings.songFolder;

  // the folder, then the search, in the chosen order
  const folderCounts = useMemo(
    () => Object.fromEntries(SONG_FOLDERS.map((f) => [f, songs.filter((s) => inFolder(s, f, keyMode, system.id, favorites)).length])) as Record<SongFolder, number>,
    [songs, keyMode, system.id, favorites],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = songs.filter((s) => inFolder(s, folder, keyMode, system.id, favorites) && (!q || `${s.title} ${s.artist}`.toLowerCase().includes(q)));
    return sortSongs(shown, settings.songSort, { keyMode, system: system.id, difficulty });
  }, [songs, query, folder, keyMode, system.id, difficulty, favorites, settings.songSort]);
  // The song under the cursor is always one the list shows: a folder or a search that leaves the
  // chosen one out puts the cursor on its first song, and with no song shown nothing is selected
  // (or played).
  const selected = filtered.find((s) => s.id === selectedSongId) ?? filtered[0] ?? null;
  useEffect(() => {
    if (selected && selected.id !== selectedSongId) onSelectSong(selected.id);
  }, [selected?.id, selectedSongId]);
  // the list's songs in order (it changes with the folder, the search and the order, not with every poll)
  const order = useMemo(() => filtered.map((s) => s.id).join(' '), [filtered]);

  const refresh = useCallback(async () => {
    try {
      const list = await api.songs();
      setSongs(list);
      return list;
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) setHealth('offline');
      return null;
    }
  }, []);

  const connect = useCallback(async () => {
    setHealth(null);
    try {
      setHealth(await api.health());
      const list = await refresh();
      if (list && list.length > 0 && !list.some((s) => s.id === selectedSongId)) onSelectSong(list[0].id);
    } catch {
      setHealth('offline');
    }
  }, [refresh, selectedSongId, onSelectSong]);

  // Connect once on mount.
  useEffect(() => {
    void connect();
  }, []);

  // Poll while something is being analyzed.
  const analyzing = songs.some((s) => s.status === 'queued' || s.status === 'analyzing');
  useEffect(() => {
    if (!analyzing) return;
    const id = window.setInterval(() => void refresh(), 800);
    return () => window.clearInterval(id);
  }, [analyzing, refresh]);

  // Any change of selection (or of the generation options, or a new analysis of the song)
  // invalidates the generated chart, except the switch of key mode / difficulty tabs that picking
  // a saved chart makes. A chart still being fetched for the old selection is dropped when it
  // arrives (chartRequest), so it never lands on another song.
  const generationKey = JSON.stringify(settings.generation);
  const pickedChart = useRef<ServerChart | null>(null);
  const chartRequest = useRef(0);
  useEffect(() => {
    chartRequest.current++;
    const picked = pickedChart.current;
    pickedChart.current = null;
    // set right before the tab switch it causes, so this run is that switch
    setChart(picked && picked.meta.keyMode === keyMode ? picked : null);
    setError(null);
    setPractice(null);
  }, [selected?.id, keyMode, difficulty, system.id, targetLevel, generationKey, selected?.status, selected?.analyzedAt]);

  // Edited and imported charts of the selected song.
  const loadSaved = useCallback(async (songId: string | null) => {
    if (!songId) {
      setSavedCharts([]);
      return;
    }
    try {
      setSavedCharts(await api.savedCharts(songId));
    } catch {
      setSavedCharts([]);
    }
  }, []);
  useEffect(() => {
    void loadSaved(selected?.id ?? null);
  }, [selected?.id, loadSaved]);

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
   */
  const selectAdded = (song: Song, list: Song[] | null) => {
    const added = list?.find((s) => s.id === song.id) ?? song;
    setQuery((q) => (`${added.title} ${added.artist}`.toLowerCase().includes(q.trim().toLowerCase()) ? q : ''));
    const s = current.current;
    if (!inFolder(added, s.songFolder, s.lastKeyMode, s.difficultySystem, new Set(s.favorites))) onSettingsChange({ ...s, songFolder: 'all' });
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

  /** Chart packages: files picked one by one, a picked folder, or .zip/.osz archives. */
  const importFiles = async (list: FileList | File[]) => {
    const files = Array.from(list)
      .filter((f) => IMPORT_FILE.test(f.name))
      .map((f) => ({ file: f, path: f.webkitRelativePath || f.name }));
    if (!files.some((f) => CHART_FILE.test(f.file.name))) {
      setError('가져올 채보 파일이 없습니다 (.osz · .zip · .osu · .bms · .bme · .bml · .bmson)');
      return;
    }
    setBusy('채보 가져오는 중… (키음이 많으면 시간이 걸립니다)');
    setError(null);
    setImportReport(null);
    try {
      const result = await api.importPackage(files);
      setImportReport(result);
      const list = await refresh();
      if (result.songs.length > 0) {
        selectAdded(result.songs[0], list);
        await loadSaved(result.songs[0].id);
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

  const pickSaved = async (c: SavedChart) => {
    setError(null);
    setPractice(null);
    const request = ++chartRequest.current;
    try {
      const picked = await api.chart(c.chartId);
      if (request !== chartRequest.current) return;
      const { keyMode: mode, difficulty: diff, difficultySystem } = picked.meta;
      // show its key mode on the tabs (an imported 7K+1S chart while 4K is selected), and its
      // difficulty too when it is on the selected system or was made on DJMAX / EZ2ON; an
      // imported chart (five-step scale) leaves the chosen difficulty system alone
      const next = { ...settings };
      if (enabledKeyModes.includes(mode)) next.lastKeyMode = mode;
      const pickedSystem = difficultySystem && difficultySystem !== 'GRG' ? difficultySystem : null;
      if (pickedSystem && difficultySystems[pickedSystem]?.tiers.some((t) => t.id === diff)) {
        next.difficultySystem = pickedSystem;
        next.lastDifficulty = diff;
      } else if (system.tiers.some((t) => t.id === diff)) {
        next.lastDifficulty = diff;
      }
      const changed = next.lastKeyMode !== keyMode || next.difficultySystem !== system.id || next.lastDifficulty !== difficulty;
      if (changed) {
        pickedChart.current = picked;
        setTargetLevel(null);
        onSettingsChange(next);
      } else {
        setChart(picked);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteSaved = async (c: SavedChart) => {
    if (!window.confirm(`"${c.name}" 채보를 지울까요? 이 채보의 기록도 함께 지워집니다.`)) return;
    await api.deleteChart(c.chartId).catch((e: Error) => setError(e.message));
    if (chart?.meta.chartId === c.chartId) setChart(null);
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

  const generate = async (newSeed = false) => {
    if (!selected || selected.status !== 'ready') return null;
    const request = ++chartRequest.current;
    setBusy(newSeed ? '새 패턴 생성 중…' : '채보 생성 중…');
    setGenerating(true);
    setError(null);
    try {
      const { chart: c } = await api.generate(selected.id, {
        keyMode,
        difficulty,
        system: system.id,
        targetLevel,
        newSeed,
        params: generationParams(settings.generation, keyMode),
      });
      // the selection moved on while the server was generating: this chart is not for it
      if (request !== chartRequest.current) return null;
      setChart(c);
      return c;
    } catch (e) {
      if (request === chartRequest.current) setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(null);
      setGenerating(false);
    }
  };

  // one play per press: a held Enter or a second press while the chart is generated starts nothing more
  const starting = useRef(false);
  const play = async () => {
    if (!selected || selected.status !== 'ready' || busy !== null || starting.current) return;
    starting.current = true;
    try {
      const c = chart ?? (await generate());
      if (!c || (c.meta.songId && c.meta.songId !== selected.id)) return;
      const best = (selected.records ?? []).find((r) => r.chartId === c.meta.chartId) ?? null;
      onPlay(
        buildPlayRequest(selected, c, settings, {
          autoPlay,
          best: best ? { score: best.score, rate: best.rate, scoreId: best.bestScoreId, hasReplay: best.hasReplay } : null,
          practice: practice ?? undefined,
        }),
      );
    } finally {
      starting.current = false;
    }
  };

  const newPattern = () => {
    if (selected?.status === 'ready' && busy === null) void generate(chart !== null);
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

  // Practice runs on the chart: turned on before there is one, it makes it first.
  const togglePractice = async (on: boolean) => {
    if (!on) {
      setPractice(null);
      return;
    }
    const c = chart ?? (busy === null ? await generate() : null);
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

  const remove = async () => {
    if (!selected || !window.confirm(`"${selected.title}"을(를) 라이브러리에서 지울까요? 기록도 함께 지워집니다.`)) return;
    await api.deleteSong(selected.id).catch((e: Error) => setError(e.message));
    const list = await refresh();
    onSelectSong(list && list.length > 0 ? list[0].id : null);
  };

  const setKeyMode = (m: KeyModeId) => onSettingsChange({ ...settings, lastKeyMode: m });
  const setDifficulty = (d: string) => {
    setTargetLevel(null);
    onSettingsChange({ ...settings, lastDifficulty: d });
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
  /** The song row under the cursor takes the focus (leaving the search or a panel), or nothing does. */
  const focusList = () => {
    const row = selected ? songList.current?.querySelector<HTMLElement>(`[data-song-id="${selected.id}"]`) : null;
    if (row) row.focus({ preventScroll: true });
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

  // Keyboard: ↑↓ song (PageUp / PageDown a page, Home / End the ends), ←→ difficulty, Enter plays,
  // Tab (Shift+Tab back) key mode, Shift alone or F6 the folder, F2 a random song, F3 a favourite,
  // Space the play options, I the song info, / or Ctrl+F the search, + the add menu, F4 the order,
  // F5 a new pattern, F10 the settings, Esc closes what is open. A panel takes the arrows, Home /
  // End and Enter while it is open (panelKey), and the song under it stays (F2 waits). A text
  // field, a slider or a drop-down keeps the keys it uses itself.
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
        else if (e.code === 'F5') newPattern();
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
        const d = tiers.findIndex((t) => t.id === difficulty) + (e.code === 'ArrowRight' ? 1 : -1);
        if (d >= 0 && d < tiers.length) setDifficulty(tiers[d].id);
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

  // Whether Enter presses what has the focus (a panel's button or box), for the key hints; a
  // render can take the focused control away (a panel closing, a tab changing), so it is read
  // after every render as well as on every move of the focus.
  const [enterPresses, setEnterPresses] = useState(false);
  const readFocus = useCallback(() => {
    const at = document.activeElement;
    setEnterPresses(Boolean(at && detailTop.current?.querySelector('.select-panel')?.contains(at)) && pressesOnEnter(at));
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

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.some((f) => CHART_FILE.test(f.name))) void importFiles(files);
    else if (files.length > 0) void upload(files);
  };

  // the plates' bests: this key mode on this difficulty system (DJMAX NM is not EZ2ON NM)
  const bests = selected ? bestByTier(recordsOn(selected, keyMode, system.id)) : new Map();
  const selectedTier = tierOf(system, difficulty);
  const ready = selected?.status === 'ready';
  const pick = (run: () => void) => () => {
    setAddMenu(false);
    run();
  };

  // the keys of the list, or of the open panel; a pad's buttons while the pad is used (the minor
  // ones give way on a narrow window, so the bar keeps what Enter does)
  const hints: KeyHint[] =
    panel === 'none'
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
  // Enter picks an item of the add menu, presses a panel's focused button or box, or plays
  const endHints: KeyHint[] = [{ keys: ['Enter'], pad: ['A'], label: addMenu ? '고르기' : panel !== 'none' && enterPresses ? '누르기' : '플레이', testId: 'hint-enter' }];
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

      {health === 'offline' && (
        <section className="panel offline" data-testid="server-offline">
          <h2>분석 서버에 연결할 수 없습니다</h2>
          <p className="hint">곡 분석과 채보 생성은 로컬 Python 서버가 맡습니다. 터미널에서 서버를 실행한 뒤 다시 연결하세요.</p>
          <pre>cd server{'\n'}python -m rhythm_server</pre>
          <div className="row">
            <button className="primary" onClick={() => void connect()}>다시 연결</button>
            <button onClick={() => onPlay(syncTestRequest(keyMode, false))}>서버 없이 싱크 테스트</button>
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
                  ? '음악 파일을 끌어다 놓거나 "곡 추가"를 누르세요. (mp3 · ogg · wav · flac · m4a)'
                  : query.trim()
                    ? '검색 결과가 없습니다'
                    : `${FOLDER_LABELS[folder]} 폴더에 곡이 없습니다 (${folderKey}로 다음 폴더)`}
              </div>
            )}
            {filtered.map((s) => (
              <SongRow
                key={s.id}
                song={s}
                active={s.id === selected?.id}
                favorite={favorites.has(s.id)}
                tiers={tiers}
                bests={bestByTier(recordsOn(s, keyMode, system.id))}
                onPick={() => onSelectSong(s.id)}
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
                targetLevel={targetLevel}
                onTargetLevel={setTargetLevel}
                maxLevel={system.maxLevel}
                defaultLevel={Math.round((selectedTier.levels[0] + selectedTier.levels[1]) / 2)}
                levelLabel={(level) => levelLabel(selectedTier, level)}
                songTitle={selected?.title ?? null}
                onClose={closePanel}
              />
            ) : panel === 'info' ? (
              <SongInfoPanel
                song={selected}
                chart={chart}
                palette={settings.palette}
                keysound={settings.keysound}
                practice={practice}
                onSelectRange={(startMs, endMs) => setPractice((p) => ({ rate: 1, loop: true, ...p, startMs, endMs }))}
                onEditChart={() => selected && chart && props.onEdit(chart, selected)}
                onWatchBest={(id) => void watchBest(id)}
                onPatch={patch}
                songOffsetMs={songOffsetOf(settings, selected?.id)}
                onSongOffset={(ms) => selected && onSettingsChange(withSongOffset(settings, selected.id, ms))}
                songOffsetKeys={offsetKeysText(playKeysOf(settings))}
                onReanalyze={() => void reanalyze()}
                onUploadBga={(file) => void uploadBga(file)}
                onRemoveBga={() => void removeBga()}
                onRemoveSong={() => void remove()}
                onSectionsSaved={async () => {
                  await refresh();
                  if (chart && chart.meta.source?.kind !== 'edited' && chart.meta.source?.kind !== 'imported') await generate();
                }}
                onSyncTest={() => onPlay(syncTestRequest(keyMode, true))}
                onCalibrate={props.onCalibrate}
                onOpenReplay={() => replayInput.current?.click()}
                onClose={closePanel}
              />
            ) : selected ? (
              <SongHero song={selected} favorite={favorites.has(selected.id)} onFavorite={() => toggleFavorite(selected.id)} onInfo={() => setPanel('info')} />
            ) : (
              <div className="detail-empty">
                <p className="hint">
                  {songs.length === 0
                    ? '오른쪽 위 "곡 추가"로 음악 파일을 넣거나, 파일을 이 화면에 끌어다 놓으세요.'
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
                    {enabledKeyModes.map((m) => (
                      <button key={m} className={m === keyMode ? 'active' : ''} onClick={() => setKeyMode(m)}>
                        {m}
                      </button>
                    ))}
                  </div>
                  <kbd>Tab</kbd>
                </div>
                <span className="mode-rules">
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
                  <span className="system-label" title="설정(F10)의 난이도 기준에서 바꿉니다">
                    난이도 기준 <b>{system.label}</b>
                  </span>
                </span>
              </div>

              <div className="difficulty-row" data-testid="difficulty-row">
                {tiers.map((t) => (
                  <TierPlate
                    key={t.id}
                    tier={t}
                    active={t.id === difficulty}
                    chart={t.id === difficulty ? chart : null}
                    best={bests.get(t.id) ?? null}
                    targetLevel={t.id === difficulty && targetLevel !== null ? Math.min(targetLevel, system.maxLevel) : null}
                    generating={t.id === difficulty && generating}
                    folded={panel !== 'none'}
                    onPick={() => setDifficulty(t.id)}
                  />
                ))}
              </div>

              {/* (they wait under an open panel, which takes the column's height) */}
              {savedCharts.length > 0 && panel === 'none' && (
                <section className="saved-charts" data-testid="saved-charts" aria-label="저장된 채보">
                  <span className="label">저장된 채보</span>
                  {savedCharts.map((c) => (
                    <div key={c.chartId} className={`saved-chart ${chart?.meta.chartId === c.chartId ? 'active' : ''}`} data-testid="saved-chart">
                      <span className={`kind kind-${c.kind}`}>{KIND_LABELS[c.kind] ?? c.kind}</span>
                      <span className="name">{c.name || `${c.keyMode} ${c.difficulty}`}</span>
                      <span className="sub">
                        {c.keyMode} · Lv.{c.level} · 노트 {c.noteCount}
                      </span>
                      <button className="small" data-testid="pick-saved" onClick={() => void pickSaved(c)}>
                        고르기
                      </button>
                      <button className="small danger" onClick={() => void deleteSaved(c)}>
                        삭제
                      </button>
                    </div>
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
                  // why play is off: the song is still being analysed (or its analysis failed)
                  <div className="analysis-status" data-testid="analysis-status">
                    {selected.status === 'error' ? (
                      <span className="error">분석 실패: {selected.error}</span>
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
                  <button data-testid="generate-button" disabled={!ready || busy !== null} onClick={newPattern} title={chart ? '같은 난이도로 다른 패턴을 만듭니다' : '채보를 만들어 레벨과 노트 수를 봅니다'}>
                    {chart ? '새 패턴' : '채보 미리보기'} <kbd>F5</kbd>
                  </button>
                  <button
                    className="primary play"
                    data-testid="play-button"
                    disabled={!ready || busy !== null}
                    onClick={() => void play()}
                    title={chart ? undefined : '채보를 만든 뒤 바로 시작합니다'}
                  >
                    {practice ? '연습 시작' : autoPlay ? '오토 플레이' : '플레이'} <kbd>Enter</kbd>
                  </button>
                </div>
              </div>
            </>
          )}
          {selected && panel === 'none' && (
            <div className="summary-room">
              <ChartSummary chart={chart} ready={ready} best={bests.get(difficulty) ?? null} tier={selectedTier} />
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
 * ←→ (↑↓ go on through the panel's lines). Checkboxes and buttons leave every key to the song
 * select (Enter plays, Tab switches).
 */
function keepsKey(target: EventTarget | null, code: string): boolean {
  if (target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return true;
  const arrow = code.startsWith('Arrow');
  if (target instanceof HTMLSelectElement) return arrow;
  if (target instanceof HTMLInputElement) {
    if (['checkbox', 'button', 'submit', 'reset'].includes(target.type)) return false;
    if (target.type === 'range' || target.type === 'radio') return code === 'ArrowLeft' || code === 'ArrowRight';
    return true;
  }
  return false;
}

/** "Lv." before a level, or "SC " for a tier on a scale of its own. */
function levelPrefix(t: { levelScale?: string }): string {
  return t.levelScale ? `${t.levelScale} ` : 'Lv.';
}

function levelLabel(t: { levelScale?: string }, level: number): string {
  return `${levelPrefix(t)}${level}`;
}

/** A row of the song list: the song's picture, its name, and its tiers' best levels and lamps. */
function SongRow(props: { song: Song; active: boolean; favorite: boolean; tiers: DifficultyTier[]; bests: Map<string, { level: number; lamp: string }>; onPick: () => void }) {
  const { song } = props;
  const working = song.status === 'queued' || song.status === 'analyzing';
  return (
    <button className={`song-item ${props.active ? 'active' : ''}`} data-testid="song-item" data-song-id={song.id} onClick={props.onPick}>
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
          {props.tiers.map((t) => {
            const best = props.bests.get(t.id);
            return (
              <span key={t.id} className={`tier-level ${best ? '' : 'none'}`} style={{ ['--diff' as string]: t.color } as CSSProperties} title={best ? `${t.label} ${levelLabel(t, best.level)} · ${best.lamp}` : `${t.label}: 기록 없음`}>
                {best ? best.level : '–'}
                <i className={best ? `lamp-${lampClass(best.lamp)}` : ''} />
              </span>
            );
          })}
        </span>
      )}
      {props.favorite && <i className="fav-mark" aria-label="즐겨찾기" />}
    </button>
  );
}

/** The selected song: its picture, name, tempo, length and metre. */
function SongHero({ song, favorite, onFavorite, onInfo }: { song: Song; favorite: boolean; onFavorite: () => void; onInfo: () => void }) {
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
 * A difficulty of the song: its level (the chart's once made, else the best play's) and its best
 * play. Folded under an open panel it is a line: its short name, level and lamp.
 */
function TierPlate(props: {
  tier: DifficultyTier;
  active: boolean;
  chart: ServerChart | null;
  best: { level: number; lamp: string; rate: number } | null;
  targetLevel: number | null;
  generating: boolean;
  folded: boolean;
  onPick: () => void;
}) {
  const { tier: t, chart, best } = props;
  const level = chart ? chart.meta.level : best?.level ?? null;
  const prefix = chart ? (chart.meta.levelScale ? `${chart.meta.levelScale} ` : 'Lv.') : levelPrefix(t);
  if (props.folded) {
    // a level on a scale of its own names itself (SC 7); the others follow the short name (HD 8)
    const scale = prefix !== 'Lv.';
    const name = `${t.label}${level === null ? '' : ` ${levelLabel(t, level)}`}${best ? ` · ${best.lamp}` : ''}`;
    return (
      <button
        className={`difficulty folded ${props.active ? 'active' : ''}`}
        style={{ ['--diff' as string]: t.color } as CSSProperties}
        onClick={props.onPick}
        aria-label={name}
        title={name}
      >
        {!scale && <span className="diff-name">{t.short}</span>}
        <strong className={`diff-fold-level ${level === null ? 'none' : ''} ${props.active && !chart ? 'level-pending' : ''}`} data-testid={chart ? 'chart-level' : undefined}>
          {scale && <small>{prefix}</small>}
          {level ?? '–'}
        </strong>
        {best && <span className={`lamp-text lamp-${lampClass(best.lamp)}`}>{best.lamp}</span>}
        {props.generating && <i className="plate-pending" aria-hidden="true" />}
      </button>
    );
  }
  const note = props.generating
    ? '만드는 중'
    : chart
      ? `${chart.meta.noteCount.toLocaleString('en-US')} 노트`
      : props.targetLevel !== null
        ? `목표 ${levelLabel(t, props.targetLevel)}`
        : `${levelLabel(t, t.levels[0])}–${t.levels[1]}`;
  return (
    <button
      className={`difficulty ${props.active ? 'active' : ''}`}
      style={{ ['--diff' as string]: t.color } as CSSProperties}
      onClick={props.onPick}
      title={t.levelScale ? `${t.label}: 레벨이 따로 매겨지는 고난도 채보 (${t.levelScale} 1–15)` : `${t.label}의 레벨 범위 Lv.${t.levels[0]}–${t.levels[1]}`}
    >
      <span className="diff-head">
        <span className="diff-name">{t.label}</span>
        <span className="diff-short" hidden={t.short === t.label}>
          {t.short}
        </span>
      </span>
      <span className={`diff-level ${props.active && !chart ? 'level-pending' : ''}`}>
        {chart ? (
          <strong data-testid="chart-level">
            <small>{prefix}</small>
            {level}
          </strong>
        ) : (
          <strong className={level === null ? 'none' : ''}>
            <small>{prefix}</small>
            {level ?? '–'}
          </strong>
        )}
        <em>{note}</em>
      </span>
      <span className="diff-record">
        {best ? (
          <>
            <span className={`lamp-text lamp-${lampClass(best.lamp)}`}>{best.lamp}</span>
            <span className="diff-lamp">{best.rate.toFixed(2)}%</span>
          </>
        ) : (
          <span className="none">기록 없음</span>
        )}
      </span>
      {props.generating && <i className="plate-pending" aria-hidden="true" />}
    </button>
  );
}

/**
 * Under the play buttons on a tall window (900 px and up): the chart's numbers and density, and
 * the best play of the selected difficulty, as much of them as the room left under the buttons
 * holds (the graph goes first, then the record). A song not analysed has no chart to speak of.
 */
function ChartSummary({ chart, ready, best, tier }: { chart: ServerChart | null; ready: boolean; best: ScoreRecord | null; tier: DifficultyTier }) {
  const m = chart?.meta;
  return (
    <section className="chart-summary" data-testid="chart-summary" aria-label="채보 요약">
      {!ready ? null : chart && m ? (
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
        <p className="hint">
          채보를 만들면 노트 수와 밀도가 여기에 나옵니다 (<kbd>F5</kbd>).
        </p>
      )}
      <dl className="summary-stats summary-record" data-testid="summary-record">
        <div>
          <dt>{tier.label} 최고 기록</dt>
          <dd className={best ? `lamp-text lamp-${lampClass(best.lamp)}` : 'none'}>{best ? best.lamp : '기록 없음'}</dd>
        </div>
        {best && (
          <>
            <div>
              <dt>점수</dt>
              <dd>{best.score.toLocaleString('en-US')}</dd>
            </div>
            <div>
              <dt>RATE</dt>
              <dd>{best.rate.toFixed(2)}%</dd>
            </div>
            <div>
              <dt>MAX COMBO</dt>
              <dd>{best.maxCombo.toLocaleString('en-US')}</dd>
            </div>
            <div>
              <dt>플레이</dt>
              <dd>{best.plays}회</dd>
            </div>
            {best.lastPlayedAt !== undefined && (
              <div>
                <dt>마지막 플레이</dt>
                <dd>{dateText(best.lastPlayedAt)}</dd>
              </div>
            )}
          </>
        )}
      </dl>
    </section>
  );
}
