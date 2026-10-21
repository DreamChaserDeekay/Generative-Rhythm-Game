import { describe, expect, it } from 'vitest';
import { ApiError, type ServerChart } from '../api/client';
import { analysisStamp, ChartStore, chartKey, savedChartKey, type ChartSpec } from './chartCache';

const spec = (extra: Partial<ChartSpec> = {}): ChartSpec => ({
  songId: '0123456789abcdef',
  analysis: '1:null',
  keyMode: '4K',
  system: 'DJMAX',
  difficulty: 'NM',
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
    for (const other of [spec({ seed: 3 }), spec({ targetLevel: 9 }), spec({ params: { style: 'jack' } }), spec({ analysis: '2:null' }), spec({ keyMode: '7K+1S' }), spec({ system: 'EZ2ON' })]) {
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
    expect(calls).toEqual(['chart NM']);
    expect(s.brief(chartKey(spec()))).toMatchObject({ chartId: 'c-NM-d', level: 5, noteCount: 120, seed: 7 });
    // kept: no more requests, its brief included
    expect(await s.loadChart(spec())).toBe(a);
    expect(await s.loadBrief(spec())).toMatchObject({ level: 5 });
    expect(calls).toEqual(['chart NM']);
  });

  it('loads a whole chart after its brief on its way: one generation, then the stored chart', async () => {
    const { s, calls } = store();
    const brief = s.loadBrief(spec({ difficulty: 'HD' }));
    const chart = s.loadChart(spec({ difficulty: 'HD' }));
    expect(await brief).toMatchObject({ level: 5 });
    expect((await chart)?.meta.chartId).toBe('c-HD-d');
    expect(calls).toEqual(['meta HD', 'chart HD']);
  });

  it('tells whoever renders when a chart or a brief comes in, not when it is asked for', async () => {
    const { s } = store();
    const version = s.getVersion();
    const brief = s.loadBrief(spec({ difficulty: 'HD' }));
    expect(s.getVersion()).toBe(version);
    await brief;
    expect(s.getVersion()).toBe(version + 1);
  });

  it('a chart the server cannot make is not asked again until asked anew, which hears why', async () => {
    const fail = new Map([['MX', cannot()]]);
    const { s, calls } = store(fail);
    expect(await s.loadBrief(spec({ difficulty: 'MX' }))).toBeNull();
    expect(s.hasFailed(chartKey(spec({ difficulty: 'MX' })))).toBe(true);
    expect(s.failure(chartKey(spec({ difficulty: 'MX' })))).toBe(422);
    expect(await s.loadChart(spec({ difficulty: 'MX' }))).toBeNull();
    expect(await s.loadBrief(spec({ difficulty: 'MX' }))).toBeNull();
    expect(calls).toEqual(['meta MX']);
    await expect(s.loadChart(spec({ difficulty: 'MX' }), true)).rejects.toThrow('nope');
    expect(calls).toEqual(['meta MX', 'chart MX']);
    // asked anew while the song select's own request is under way: it waits, then asks itself
    const quiet = s.loadChart(spec({ difficulty: 'SC', seed: 1 }));
    fail.set('SC', cannot());
    await expect(s.loadChart(spec({ difficulty: 'SC', seed: 1 }), true)).rejects.toThrow('nope');
    expect(await quiet).toBeNull();
    expect(calls.filter((c) => c === 'chart SC')).toHaveLength(2);
    // a chosen chart that is gone says so (the song select goes back to the default pattern)
    fail.set('c' + 'e'.repeat(20), new ApiError(404, 'gone'));
    expect(await s.loadSaved('c' + 'e'.repeat(20))).toBeNull();
    expect(s.failure(savedChartKey('c' + 'e'.repeat(20)))).toBe(404);
  });

  it('a chart that found the server or the network down is asked again the next time, and then known', async () => {
    const fail = new Map<string, Error>([
      ['HD', down()],
      ['MX', new ApiError(0, 'offline')],
    ]);
    const { s, calls } = store(fail);
    expect(await s.loadBrief(spec({ difficulty: 'HD' }))).toBeNull();
    expect(await s.loadChart(spec({ difficulty: 'MX' }))).toBeNull();
    expect(s.hasFailed(chartKey(spec({ difficulty: 'HD' })))).toBe(true);
    // the server is back: the next visit asks again, and the failure is forgotten as it does
    fail.clear();
    const version = s.getVersion();
    const again = s.loadBrief(spec({ difficulty: 'HD' }));
    expect(s.hasFailed(chartKey(spec({ difficulty: 'HD' })))).toBe(false);
    expect(s.getVersion()).toBeGreaterThan(version);
    expect(await again).toMatchObject({ level: 5 });
    expect(await s.loadChart(spec({ difficulty: 'MX' }))).not.toBeNull();
    expect(calls).toEqual(['meta HD', 'chart MX', 'meta HD', 'chart MX']);
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
