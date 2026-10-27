import { useSyncExternalStore } from 'react';
import { api, ApiError, type ChartRequest, type ServerChart, type Song } from '../api/client';
import type { KeyModeId } from '../engine/types';

/** What a generated chart is made of: the song as analysed, its difficulty, the options and the pattern. */
export interface ChartSpec {
  songId: string;
  /** The song's analysis as it stands (a new analysis or edited sections make other charts). */
  analysis: string;
  keyMode: KeyModeId;
  difficulty: string;
  targetLevel: number | null;
  /** The pattern made with 새 패턴 (null: the default one). */
  seed: number | null;
  /** The generation options as the generator gets them. */
  params: Record<string, unknown>;
}

/** A chart as the song select names it before its notes are needed. */
export interface ChartBrief {
  chartId: string;
  level: number;
  noteCount: number;
  /** The seed it was made with (the default pattern's too; none for a chart not generated). */
  seed: number | null;
}

// The song list asks for the key of every tier of every song it shows: the parts of a key that are
// objects are written once per object (a song as listed, the options of the moment).
const stamps = new WeakMap<object, string>();
const paramsTexts = new WeakMap<object, string>();

/** The song's analysis as charts depend on it. */
export function analysisStamp(song: Pick<Song, 'analyzedAt' | 'sections'>): string {
  let stamp = stamps.get(song);
  if (stamp === undefined) {
    stamp = `${song.analyzedAt ?? ''}:${JSON.stringify(song.sections ?? null)}`;
    stamps.set(song, stamp);
  }
  return stamp;
}

function paramsText(params: Record<string, unknown>): string {
  let text = paramsTexts.get(params);
  if (text === undefined) {
    text = JSON.stringify(params);
    paramsTexts.set(params, text);
  }
  return text;
}

export function chartKey(spec: ChartSpec): string {
  const { songId, analysis, keyMode, difficulty, targetLevel, seed, params } = spec;
  return JSON.stringify([songId, analysis, keyMode, difficulty, targetLevel, seed, paramsText(params)]);
}

const SAVED = 'saved:';

/** The key of a saved (edited or imported) chart, which is known by its id. */
export const savedChartKey = (chartId: string) => `${SAVED}${chartId}`;

export function requestOf(spec: ChartSpec): ChartRequest {
  return { keyMode: spec.keyMode, difficulty: spec.difficulty, targetLevel: spec.targetLevel, seed: spec.seed, params: spec.params };
}

export function briefOf(meta: ServerChart['meta']): ChartBrief {
  return { chartId: meta.chartId, level: meta.level, noteCount: meta.noteCount, seed: meta.generator?.seed ?? null };
}

/** So many briefs (a few numbers each) and whole charts are kept, the oldest going first. */
const BRIEFS_KEPT = 4000;
const CHARTS_KEPT = 8;
/** So many briefs of generated charts outlive a restart (the ones asked for last), under the generator's version. */
export const BRIEFS_STORED = 2000;
export const BRIEFS_STORAGE_KEY = 'grg.briefs.v1';
/** Answers that asking again will not change (a bad request, no such chart, one that cannot be made). */
const LASTING_FAILURES = new Set([400, 404, 422]);

interface Fetchers {
  chart: (spec: ChartSpec) => Promise<ServerChart>;
  meta: (spec: ChartSpec) => Promise<ServerChart['meta']>;
  saved: (chartId: string) => Promise<ServerChart>;
}

/**
 * The charts of the song select: the brief of every chart asked for, and the last few whole
 * charts, kept across the song select's visits (a play, the settings). A request is made once
 * however many ask for it. One the server refused for good (LASTING_FAILURES) is not made again
 * until it is asked for anew (`retry`); one that found the server or the network down is made
 * again the next time it is asked for (the song select asks once per visit of a song). Once the
 * server names its generator (`remember`), the briefs of generated charts also outlive a restart.
 */
export class ChartStore {
  private readonly briefs = new Map<string, ChartBrief>();
  /** The generator version the briefs are of (null: not heard yet, nothing is stored). */
  private generator: string | null = null;
  private readonly charts = new Map<string, ServerChart>();
  /** The requests that failed, with the server's status (0: no answer). */
  private readonly failed = new Map<string, number>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly listeners = new Set<() => void>();
  private version = 0;

  constructor(private readonly fetchers: Fetchers) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Changes with everything stored (React re-renders on it). */
  readonly getVersion = (): number => this.version;

  brief(key: string): ChartBrief | null {
    return this.briefs.get(key) ?? null;
  }

  /** A whole chart kept (null: not loaded, or let go). */
  chart(key: string): ServerChart | null {
    return this.charts.get(key) ?? null;
  }

  /** The request for it failed (and was not made again since). */
  hasFailed(key: string): boolean {
    return this.failed.has(key);
  }

  /** How the request for it failed: the server's status (0: no answer), null when it did not. */
  failure(key: string): number | null {
    return this.failed.get(key) ?? null;
  }

  /**
   * The server's generator version: the briefs stored under it come back (the song list shows
   * their levels at once), and from now on what comes in is stored under it. Another version makes
   * other charts of the same options, so the briefs of any other one go.
   */
  remember(generator: string): void {
    if (generator === this.generator) return;
    // the server updated in this run: what its old generator made (briefs, whole charts, refusals)
    // goes as well, the saved charts (known by their id) stay
    const updated = this.generator !== null;
    const mine = [...this.briefs].filter(([key]) => !updated || key.startsWith(SAVED));
    if (updated) {
      for (const kept of [this.charts, this.failed]) {
        for (const key of [...kept.keys()]) if (!key.startsWith(SAVED)) kept.delete(key);
      }
    }
    this.generator = generator;
    this.briefs.clear();
    for (const [key, brief] of [...storedBriefs(generator), ...mine]) this.keepBrief(key, brief, false);
    this.saveBriefs();
    this.changed();
  }

  /** Stores a chart (and its brief) under the key of what it was made of. */
  put(key: string, chart: ServerChart): void {
    this.failed.delete(key);
    this.keepBrief(key, briefOf(chart.meta));
    this.keepChart(key, chart);
    this.changed();
  }

  /** The whole generated chart of `spec` (after its brief, when that is on its way: one generation). */
  loadChart(spec: ChartSpec, retry = false): Promise<ServerChart | null> {
    const key = chartKey(spec);
    const brief = this.pending.get(`brief:${key}`);
    return this.load(
      key,
      async () => {
        await brief;
        return this.fetchers.chart(spec);
      },
      retry,
    );
  }

  /** A saved chart, by its id. */
  loadSaved(chartId: string, retry = false): Promise<ServerChart | null> {
    return this.load(savedChartKey(chartId), () => this.fetchers.saved(chartId), retry);
  }

  /** The brief of the generated chart of `spec` (the server makes the chart all the same). */
  loadBrief(spec: ChartSpec): Promise<ChartBrief | null> {
    const key = chartKey(spec);
    const known = this.briefs.get(key);
    if (known) {
      // the one asked for last goes last (stored with the next brief that comes in, kept the longest)
      this.keepBrief(key, known, false);
      return Promise.resolve(known);
    }
    const whole = this.pending.get(key);
    if (whole) return whole.then(() => this.briefs.get(key) ?? null);
    if (!this.pending.has(`brief:${key}`) && !this.askAgain(key, false)) return Promise.resolve(null);
    return this.once(`brief:${key}`, async () => {
      try {
        this.keepBrief(key, briefOf(await this.fetchers.meta(spec)));
        this.changed();
      } catch (e) {
        this.fail(key, e);
      }
      return this.briefs.get(key) ?? null;
    });
  }

  private load(key: string, fetch: () => Promise<ServerChart>, retry: boolean): Promise<ServerChart | null> {
    const kept = this.charts.get(key);
    if (kept) {
      // the one used last goes last (the first is let go first)
      this.keepChart(key, kept);
      return Promise.resolve(kept);
    }
    const running = this.pending.get(key) as Promise<ServerChart | null> | undefined;
    // one asking anew waits for the request under way, and asks again when it failed (to hear why)
    if (running) return retry ? running.then((c) => c ?? this.load(key, fetch, true)) : running;
    if (!this.askAgain(key, retry)) return Promise.resolve(null);
    return this.once(key, async () => {
      try {
        this.put(key, await fetch());
      } catch (e) {
        this.fail(key, e);
        // the one who asked anew hears why; the song select's own requests fail quietly
        if (retry) throw e;
      }
      return this.charts.get(key) ?? null;
    });
  }

  /**
   * Whether a chart that failed is asked for again: always when asked anew, else unless the server
   * refused it for good. Its failure is forgotten then (its plate is worked out again).
   */
  private askAgain(key: string, retry: boolean): boolean {
    const status = this.failed.get(key);
    if (status === undefined) return true;
    if (!retry && LASTING_FAILURES.has(status)) return false;
    this.failed.delete(key);
    this.changed();
    return true;
  }

  private fail(key: string, e: unknown): void {
    this.failed.set(key, e instanceof ApiError ? e.status : 0);
    this.changed();
  }

  // (nothing shows a request under way: starting one changes nothing anyone renders)
  private once<T>(key: string, run: () => Promise<T>): Promise<T> {
    const running = this.pending.get(key) as Promise<T> | undefined;
    if (running) return running;
    const promise = run().finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }

  private keepBrief(key: string, brief: ChartBrief, save = true): void {
    this.briefs.delete(key);
    this.briefs.set(key, brief);
    while (this.briefs.size > BRIEFS_KEPT) this.briefs.delete(this.briefs.keys().next().value as string);
    if (save && !key.startsWith(SAVED)) this.saveBriefs();
  }

  /** The most recent briefs of generated charts, to the browser's storage (a saved chart is known by its id, and can be deleted). */
  private saveBriefs(): void {
    if (this.generator === null) return;
    const briefs = [...this.briefs].filter(([key]) => !key.startsWith(SAVED)).slice(-BRIEFS_STORED);
    try {
      localStorage.setItem(BRIEFS_STORAGE_KEY, JSON.stringify({ generator: this.generator, briefs }));
    } catch {
      // storage unavailable or full: the briefs stay for this run only
    }
  }

  private keepChart(key: string, chart: ServerChart): void {
    this.charts.delete(key);
    this.charts.set(key, chart);
    while (this.charts.size > CHARTS_KEPT) this.charts.delete(this.charts.keys().next().value as string);
  }

  private changed(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }
}

/** The briefs stored under `generator`, oldest first (none when another generator stored them, or the storage is unreadable). */
function storedBriefs(generator: string): [string, ChartBrief][] {
  try {
    const stored = JSON.parse(localStorage.getItem(BRIEFS_STORAGE_KEY) ?? 'null') as { generator?: unknown; briefs?: unknown } | null;
    if (stored?.generator !== generator || !Array.isArray(stored.briefs)) return [];
    return stored.briefs.filter((e): e is [string, ChartBrief] => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1]?.level === 'number').slice(-BRIEFS_STORED);
  } catch {
    return [];
  }
}

export const chartStore = new ChartStore({
  chart: async (spec) => (await api.generate(spec.songId, requestOf(spec))).chart,
  meta: (spec) => api.chartMeta(spec.songId, requestOf(spec)),
  saved: (chartId) => api.chart(chartId),
});

/** The chart store's version: a component re-renders when a chart or a brief comes in. */
export function useChartStore(): number {
  return useSyncExternalStore(chartStore.subscribe, chartStore.getVersion);
}
