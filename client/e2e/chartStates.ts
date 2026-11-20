import type { Page } from '@playwright/test';
import { fakeSongs } from './songSelect';

/**
 * A library of three songs whose charts are in every state the song select tells apart, as the
 * server would answer with Mapperatorinator (this machine has no GPU to make any):
 * - the first: EASY made (and played: a lamp), NORMAL being made, HARD not made, EXPERT failed,
 *   ELITE waiting its turn; and an imported chart beside them
 * - the second: every tier made
 * - the third: none made
 * and the generator's queue says so (the first song's NORMAL being made, its ELITE waiting).
 */
export async function chartStates(page: Page, settings: Record<string, unknown> = {}) {
  const songs = fakeSongs(3, 'ready').map((s, i) => ({ ...s, analyzedAt: 1, title: ['Five States', 'All Made', 'None Made'][i], artist: 'E2E' }));
  const level: Record<string, number> = { EASY: 3, NORMAL: 8, HARD: 12, EXPERT: 16, ELITE: 20 };
  const chartId = (song: number, tier: string) => `c${song}${tier.slice(0, 2).toLowerCase()}${'a'.repeat(17)}`;
  songs[0].records = [
    { songId: songs[0].id, keyMode: '4K', seed: 7, score: 912_000, rate: 91.2, maxCombo: 300, plays: 2, kind: 'generated', chartId: chartId(0, 'EASY'), difficulty: 'EASY', level: 3, lamp: 'HARD CLEAR' },
  ];
  const timing = { offsetMs: 0, tempoMap: [{ beat: 0, bpm: 120 }], meter: [{ measure: 0, beatsPerMeasure: 4 }] };
  await page.route(
    (url) => url.pathname === '/api/health',
    async (route) => {
      const res = await route.fetch();
      const health = await res.json();
      await route.fulfill({ response: res, json: { ...health, generator: `${health.generator ?? 'e2e'}+mapper-e2e` } });
    },
  );
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs } }));
  await page.route(
    (url) => /^\/api\/songs\/[^/]+\/charts$/.test(url.pathname),
    (route) => {
      const songId = new URL(route.request().url()).pathname.split('/')[3];
      const at = songs.findIndex((s) => s.id === songId);
      if (route.request().method() !== 'POST') {
        // the first song has an imported chart of 4K beside its tiers
        const charts =
          at === 0
            ? [{ chartId: 'c0im' + 'b'.repeat(16), songId, keyMode: '4K', difficulty: 'NORMAL', level: 8, noteCount: 640, kind: 'imported', name: 'Insane', createdAt: 1, format: 'osu', sourceLevel: null }]
            : [];
        return route.fulfill({ json: { charts } });
      }
      const body = JSON.parse(route.request().postData() ?? '{}');
      const tier = body.difficulty as string;
      const made = at === 1 || (at === 0 && tier === 'EASY');
      if (at === 0 && tier === 'EXPERT') return route.fulfill({ status: 500, json: { detail: 'e2e: 채보를 만들지 못했습니다' } });
      const base = { chartId: chartId(at, tier), songId, keyMode: '4K', difficulty: tier, level: level[tier], durationMs: 60_000, rating: level[tier] };
      const meta = made
        ? { ...base, noteCount: 100 * level[tier], nps: { avg: level[tier] / 2, peak: level[tier], graph: [1, 2] }, generator: { seed: 7, version: 'now' } }
        : { ...base, noteCount: 0, nps: { avg: 0, peak: 0, graph: [] }, predicted: true, making: at === 0 && tier === 'NORMAL', queued: at === 0 && tier === 'ELITE' };
      if (body.brief || !made) return route.fulfill({ json: { meta, cached: made } });
      return route.fulfill({ json: { chart: { meta, timing, notes: [], sections: [] }, cached: true } });
    },
  );
  // the generator's queue: the first song's NORMAL being made, its ELITE waiting
  await page.route(
    (url) => url.pathname === '/api/mapper/queue',
    (route) =>
      route.fulfill({
        json: {
          making: chartId(0, 'NORMAL'),
          waiting: 1,
          loaded: true,
          charts: [
            { chartId: chartId(0, 'NORMAL'), songId: songs[0].id, keyMode: '4K', difficulty: 'NORMAL', state: 'making' },
            { chartId: chartId(0, 'ELITE'), songId: songs[0].id, keyMode: '4K', difficulty: 'ELITE', state: 'queued' },
          ],
        },
      }),
  );
  await page.addInitScript((s) => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', lastDifficulty: 'HARD', ...s })), settings);
  return songs;
}
