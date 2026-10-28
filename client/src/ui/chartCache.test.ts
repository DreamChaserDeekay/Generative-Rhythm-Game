import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type ServerChart } from '../api/client';
import { difficultyTiers, tierUpTo } from '../engine/config';
import { analysisStamp, BRIEFS_STORAGE_KEY, BRIEFS_STORED, ChartStore, chartKey, savedChartKey, tierAbsent, type ChartSpec } from './chartCache';

const spec = (extra: Partial<ChartSpec> = {}): ChartSpec => ({
  songId: '0123456789abcdef',
  analysis: '1:null',
  keyMode: '4K',
  difficulty: 'NORMAL',
  targetLevel: null,
  seed: null,
  params: { style: 'balanced' },
  ...extra,
});

const chartOf = (s: ChartSpec, seed = 7): ServerChart =>
  ({ meta: { chartId: `c-${s.difficulty}-${s.seed ?? 'd'}`, level: 5, noteCount: 120, generator: { version: '1', analyzer: 'a', seed: s.seed ?? seed, params: {} } }, notes: [] }) as unknown as ServerChart;

/** A store whose requests fail for the tiers in `fail` (and the saved charts in it) with the error given. */
function store(fail = new Map<string, Error>()) {
  const calls: string[] = [];
  const refuse = (what: string) => {
    const e = fail.get(what);
    if (e) throw e;
  };
  const s = new ChartStore({
    chart: async (x) => {
      calls.push(`chart ${x.difficulty}`);
      refuse(x.difficulty);
      return chartOf(x);
    },
    meta: async (x) => {
      calls.push(`meta ${x.difficulty}`);
      refuse(x.difficulty);
      return chartOf(x).meta;
    },
    saved: async (id) => {
      calls.push(`saved ${id}`);
      refuse(id);
      return { meta: { chartId: id, level: 9, noteCount: 800 }, notes: [] } as unknown as ServerChart;
    },
  });
  return { s, calls };
}

const cannot = () => new ApiError(422, 'nope');
const down = () => new ApiError(503, 'down');

describe('the song select chart store', () => {
  it('keys a chart by all it is made of', () => {
    expect(chartKey(spec())).toBe(chartKey(spec()));
    for (const other of [spec({ seed: 3 }), spec({ targetLevel: 9 }), spec({ params: { style: 'jack' } }), spec({ analysis: '2:null' }), spec({ keyMode: '7K+1S' }), spec({ difficulty: 'HARD' })]) {
      expect(chartKey(other)).not.toBe(chartKey(spec()));
    }
    // a new analysis or edited sections make other charts
    expect(analysisStamp({ analyzedAt: 5, sections: null })).not.toBe(analysisStamp({ analyzedAt: 6, sections: null }));
    expect(analysisStamp({ analyzedAt: 5, sections: [{ startBeat: 0, label: 'intro', group: 'A' }] })).not.toBe(analysisStamp({ analyzedAt: 5, sections: null }));
  });

  it('asks once for a chart however many ask, and keeps its brief', async () => {
    const { s, calls } = store();
    const [a, b] = await Promise.all([s.loadChart(spec()), s.loadChart(spec())]);
    expect(a).toBe(b);
    expect(calls).toEqual(['chart NORMAL']);
    expect(s.brief(chartKey(spec()))).toMatchObject({ chartId: 'c-NORMAL-d', level: 5, noteCount: 120, seed: 7 });
    // kept: no more requests, its brief included
    expect(await s.loadChart(spec())).toBe(a);
    expect(await s.loadBrief(spec())).toMatchObject({ level: 5 });
    expect(calls).toEqual(['chart NORMAL']);
  });

  it('loads a whole chart after its brief on its way: one generation, then the stored chart', async () => {
    const { s, calls } = store();
    const brief = s.loadBrief(spec({ difficulty: 'HARD' }));
    const chart = s.loadChart(spec({ difficulty: 'HARD' }));
    expect(await brief).toMatchObject({ level: 5 });
    expect((await chart)?.meta.chartId).toBe('c-HARD-d');
    expect(calls).toEqual(['meta HARD', 'chart HARD']);
  });

  it('tells whoever renders when a chart or a brief comes in, not when it is asked for', async () => {
    const { s } = store();
    const version = s.getVersion();
    const brief = s.loadBrief(spec({ difficulty: 'HARD' }));
    expect(s.getVersion()).toBe(version);
    await brief;
    expect(s.getVersion()).toBe(version + 1);
  });

  it('a chart the server cannot make is not asked again until asked anew, which hears why', async () => {
    const fail = new Map([['MASTER', cannot()]]);
    const { s, calls } = store(fail);
    expect(await s.loadBrief(spec({ difficulty: 'MASTER' }))).toBeNull();
    expect(s.hasFailed(chartKey(spec({ difficulty: 'MASTER' })))).toBe(true);
    expect(s.failure(chartKey(spec({ difficulty: 'MASTER' })))).toBe(422);
    expect(await s.loadChart(spec({ difficulty: 'MASTER' }))).toBeNull();
    expect(await s.loadBrief(spec({ difficulty: 'MASTER' }))).toBeNull();
    expect(calls).toEqual(['meta MASTER']);
    await expect(s.loadChart(spec({ difficulty: 'MASTER' }), true)).rejects.toThrow('nope');
    expect(calls).toEqual(['meta MASTER', 'chart MASTER']);
    // asked anew while the song select's own request is under way: it waits, then asks itself
    const quiet = s.loadChart(spec({ difficulty: 'EXPERT', seed: 1 }));
    fail.set('EXPERT', cannot());
    await expect(s.loadChart(spec({ difficulty: 'EXPERT', seed: 1 }), true)).rejects.toThrow('nope');
    expect(await quiet).toBeNull();
    expect(calls.filter((c) => c === 'chart EXPERT')).toHaveLength(2);
    // a chosen chart that is gone says so (the song select goes back to the default pattern)
    fail.set('c' + 'e'.repeat(20), new ApiError(404, 'gone'));
    expect(await s.loadSaved('c' + 'e'.repeat(20))).toBeNull();
    expect(s.failure(savedChartKey('c' + 'e'.repeat(20)))).toBe(404);
  });

  it('a chart that found the server or the network down is asked again the next time, and then known', async () => {
    const fail = new Map<string, Error>([
      ['HARD', down()],
      ['MASTER', new ApiError(0, 'offline')],
    ]);
    const { s, calls } = store(fail);
    expect(await s.loadBrief(spec({ difficulty: 'HARD' }))).toBeNull();
    expect(await s.loadChart(spec({ difficulty: 'MASTER' }))).toBeNull();
    expect(s.hasFailed(chartKey(spec({ difficulty: 'HARD' })))).toBe(true);
    // the server is back: the next visit asks again, and the failure is forgotten as it does
    fail.clear();
    const version = s.getVersion();
    const again = s.loadBrief(spec({ difficulty: 'HARD' }));
    expect(s.hasFailed(chartKey(spec({ difficulty: 'HARD' })))).toBe(false);
    expect(s.getVersion()).toBeGreaterThan(version);
    expect(await again).toMatchObject({ level: 5 });
    expect(await s.loadChart(spec({ difficulty: 'MASTER' }))).not.toBeNull();
    expect(calls).toEqual(['meta HARD', 'chart MASTER', 'meta HARD', 'chart MASTER']);
  });

  it('keeps the last few whole charts, the one used last the longest', async () => {
    const { s, calls } = store();
    const tiers = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    for (const d of tiers) await s.loadChart(spec({ difficulty: d }));
    // A used again (looking at a chart is not using it): B goes when the ninth comes
    expect(s.chart(chartKey(spec({ difficulty: 'B' })))).not.toBeNull();
    expect(await s.loadChart(spec({ difficulty: 'A' }))).not.toBeNull();
    await s.loadChart(spec({ difficulty: 'I' }));
    expect(s.chart(chartKey(spec({ difficulty: 'B' })))).toBeNull();
    expect(s.chart(chartKey(spec({ difficulty: 'A' })))).not.toBeNull();
    // its brief stays
    expect(s.brief(chartKey(spec({ difficulty: 'B' })))).not.toBeNull();
    expect(calls).toHaveLength(9);
  });

  it('a new pattern is stored under its seed, a saved chart under its id', async () => {
    const { s } = store();
    let version = s.getVersion();
    const next = spec({ seed: 99 });
    s.put(chartKey(next), chartOf(next));
    expect(s.getVersion()).toBeGreaterThan(version);
    expect(s.brief(chartKey(next))?.seed).toBe(99);
    version = s.getVersion();
    const saved = await s.loadSaved('c' + 'a'.repeat(20));
    expect(saved?.meta.level).toBe(9);
    expect(s.chart(savedChartKey('c' + 'a'.repeat(20)))).toBe(saved);
    expect(s.getVersion()).toBeGreaterThan(version);
  });
});

describe('the briefs kept across restarts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** The browser's storage, as a map. */
  function storage() {
    const items = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
    });
    return items;
  }
  const storedOf = (items: Map<string, string>) => JSON.parse(items.get(BRIEFS_STORAGE_KEY) ?? 'null') as { generator: string; briefs: [string, unknown][] } | null;

  it('come back on the next run of the same generator: known at once, nothing asked', async () => {
    storage();
    const first = store();
    first.s.remember('0.9.35');
    await first.s.loadChart(spec());
    await first.s.loadBrief(spec({ difficulty: 'HARD' }));

    const next = store();
    const version = next.s.getVersion();
    next.s.remember('0.9.35');
    expect(next.s.getVersion()).toBeGreaterThan(version);
    expect(next.s.brief(chartKey(spec({ difficulty: 'HARD' })))).toEqual({ chartId: 'c-HARD-d', level: 5, noteCount: 120, seed: 7 });
    expect(await next.s.loadBrief(spec())).toMatchObject({ level: 5 });
    expect(next.calls).toEqual([]);
    // the whole charts are not kept: Enter asks for its own
    expect(next.s.chart(chartKey(spec()))).toBeNull();
    // the server answering again (another visit of the song select) changes nothing
    next.s.remember('0.9.35');
    expect(next.s.brief(chartKey(spec()))).not.toBeNull();
  });

  it('go with another generator, whose charts are other ones', async () => {
    const items = storage();
    const first = store();
    first.s.remember('0.9.35');
    await first.s.loadBrief(spec());

    const next = store(new Map([['MASTER', cannot()]]));
    next.s.remember('0.9.36');
    expect(next.s.brief(chartKey(spec()))).toBeNull();
    expect(storedOf(items)).toEqual({ generator: '0.9.36', briefs: [] });
    // the server updated while the game runs: what came from the old one goes too (whole charts and
    // refusals with the briefs), the saved charts stay
    const saved = 'c' + 'a'.repeat(20);
    await next.s.loadBrief(spec({ difficulty: 'HARD' }));
    await next.s.loadChart(spec());
    await next.s.loadBrief(spec({ difficulty: 'MASTER' }));
    await next.s.loadSaved(saved);
    next.s.remember('0.9.37');
    expect(next.s.brief(chartKey(spec({ difficulty: 'HARD' })))).toBeNull();
    expect(next.s.chart(chartKey(spec()))).toBeNull();
    expect(next.s.hasFailed(chartKey(spec({ difficulty: 'MASTER' })))).toBe(false);
    expect(next.s.brief(savedChartKey(saved))).toMatchObject({ level: 9 });
    expect(next.s.chart(savedChartKey(saved))).not.toBeNull();
    expect(storedOf(items)?.briefs).toEqual([]);
  });

  it('are stored once the generator is known, generated charts only; an unreadable store is an empty one', async () => {
    const items = storage();
    const { s } = store();
    await s.loadBrief(spec());
    expect(items.size).toBe(0);
    // what came before is stored then
    s.remember('g');
    expect(storedOf(items)?.briefs.map(([key]) => key)).toEqual([chartKey(spec())]);
    // a saved chart is known by its id (and can be deleted): not stored
    await s.loadSaved('c' + 'a'.repeat(20));
    expect(storedOf(items)?.briefs).toHaveLength(1);

    items.set(BRIEFS_STORAGE_KEY, '{not json');
    const broken = store();
    expect(() => broken.s.remember('g')).not.toThrow();
    expect(broken.s.brief(chartKey(spec()))).toBeNull();
    items.set(BRIEFS_STORAGE_KEY, JSON.stringify({ generator: 'g', briefs: [['k', { level: 'x' }], 5, [chartKey(spec()), { chartId: 'c', level: 3, noteCount: 9, seed: 1 }]] }));
    const odd = store();
    odd.s.remember('g');
    expect(odd.s.brief('k')).toBeNull();
    expect(odd.s.brief(chartKey(spec()))).toMatchObject({ level: 3 });
  });

  it('keep the most recent ones only', async () => {
    const items = storage();
    const brief = { chartId: 'c', level: 1, noteCount: 1, seed: null };
    const old = Array.from({ length: BRIEFS_STORED + 5 }, (_, i) => [`k${i}`, brief]);
    items.set(BRIEFS_STORAGE_KEY, JSON.stringify({ generator: 'g', briefs: old }));
    const { s } = store();
    s.remember('g');
    expect(s.brief('k4')).toBeNull();
    expect(s.brief('k5')).not.toBeNull();
    // one more: the oldest goes, the newest is last
    await s.loadBrief(spec());
    const kept = storedOf(items)?.briefs.map(([key]) => key) ?? [];
    expect(kept).toHaveLength(BRIEFS_STORED);
    expect(kept[0]).toBe('k6');
    expect(kept.at(-1)).toBe(chartKey(spec()));
  });

  it('keep the ones asked for again, however long ago they came in', async () => {
    const items = storage();
    const brief = { chartId: 'c', level: 1, noteCount: 1, seed: null };
    const old = [[chartKey(spec()), brief], ...Array.from({ length: BRIEFS_STORED - 1 }, (_, i) => [`k${i}`, brief])];
    items.set(BRIEFS_STORAGE_KEY, JSON.stringify({ generator: 'g', briefs: old }));
    const { s, calls } = store();
    s.remember('g');
    // the oldest one is asked for again (nothing written), then a new one comes in: the next oldest goes
    await s.loadBrief(spec());
    await s.loadBrief(spec({ difficulty: 'HARD' }));
    expect(calls).toEqual(['meta HARD']);
    const kept = storedOf(items)?.briefs.map(([key]) => key) ?? [];
    expect(kept).toHaveLength(BRIEFS_STORED);
    expect(kept).not.toContain('k0');
    expect(kept.slice(-2)).toEqual([chartKey(spec()), chartKey(spec({ difficulty: 'HARD' }))]);
  });
});

describe('a tier a song does not have', () => {
  it('is one the server answered 404 for, not a refusal or a saved chart that is gone', async () => {
    const { s } = store(new Map([['MASTER', new ApiError(404, 'none')], ['EXPERT', cannot()], ['c-gone', new ApiError(404, 'gone')]]));
    await s.loadBrief(spec({ difficulty: 'MASTER' }));
    await s.loadBrief(spec({ difficulty: 'EXPERT' }));
    await s.loadSaved('c-gone');
    expect(tierAbsent(s, chartKey(spec({ difficulty: 'MASTER' })))).toBe(true);
    expect(tierAbsent(s, chartKey(spec({ difficulty: 'EXPERT' })))).toBe(false);
    expect(tierAbsent(s, savedChartKey('c-gone'))).toBe(false);
    expect(tierAbsent(s, chartKey(spec()))).toBe(false);
  });

  it('plays the hardest tier the song has up to the one chosen', () => {
    const noTop = difficultyTiers.slice(0, -1);
    expect(tierUpTo(noTop, 'MASTER')).toBe('EXPERT');
    expect(tierUpTo(noTop, 'HARD')).toBe('HARD');
    expect(tierUpTo(difficultyTiers, 'MASTER')).toBe('MASTER');
    expect(tierUpTo(difficultyTiers.slice(1), 'NORMAL')).toBe('HARD');
  });
});
