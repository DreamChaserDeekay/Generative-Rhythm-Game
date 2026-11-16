import { expect, type Page } from '@playwright/test';

/** The demo song the server makes by itself (8 bars at 143 BPM, about 13.4 s). */
export const DEMO_SONG = 'Demo Groove 143';
const DEMO_BPM = 143;

/**
 * The demo song (made once, analysed) under the cursor of the song select; its id. Its row is clicked
 * only where the cursor is on another song: a click on the row under the cursor plays it, and a served
 * chart is there to play at once.
 */
export async function pickDemoSong(page: Page): Promise<string> {
  const find = async () => ((await (await page.request.get('/api/songs')).json()).songs as { id: string; title: string; status: string }[]).find((s) => s.title === DEMO_SONG);
  if (!(await find())) expect((await page.request.post('/api/songs/demo', { data: { bpm: DEMO_BPM, bars: 8, seed: 7 } })).ok()).toBe(true);
  await expect.poll(async () => (await find())?.status, { timeout: 60_000 }).toBe('ready');
  await page.goto('/');
  const picked = page.locator('.song-item.active .song-title');
  await expect(picked).toBeVisible();
  if ((await picked.textContent()) !== DEMO_SONG) await page.getByTestId('song-item').filter({ hasText: DEMO_SONG }).click();
  await expect(picked).toHaveText(DEMO_SONG);
  return (await find())!.id;
}

/**
 * Answers every request for a song's chart with a chart of the test's own, so that a play can be
 * started where no chart can be made (the generator needs a GPU): 4K at the demo song's tempo, a
 * quarter note a beat walking over the lanes from `fromBeat` up to (not with) `toBeat`. Set up
 * before the song select is opened.
 */
export async function serveChart(page: Page, fromBeat: number, toBeat: number) {
  const ms = (beat: number) => (beat * 60_000) / DEMO_BPM;
  await page.route(
    (url) => /^\/api\/songs\/[^/]+\/charts$/.test(url.pathname),
    (route) => {
      if (route.request().method() !== 'POST') return route.fulfill({ json: { charts: [] } });
      const body = JSON.parse(route.request().postData() ?? '{}') as { difficulty?: string; brief?: boolean };
      const songId = new URL(route.request().url()).pathname.split('/')[3];
      const difficulty = body.difficulty ?? 'NORMAL';
      const notes = Array.from({ length: toBeat - fromBeat }, (_, i) => ({ beat: fromBeat + i, t: ms(fromBeat + i), lane: i % 4, type: 'tap' }));
      const meta = {
        chartId: `c${songId.slice(-4)}${String(fromBeat).padStart(14, '0')}${difficulty.slice(0, 2).toLowerCase()}`,
        songId,
        audioHash: 'e2e',
        title: DEMO_SONG,
        artist: 'E2E',
        keyMode: '4K',
        lanes: ['1', '2', '3', '4'],
        difficulty,
        level: 3,
        durationMs: Math.round(ms(32)),
        noteCount: notes.length,
        nps: { avg: 2, peak: 3, graph: [2, 2], binMs: 1000 },
        rating: 3,
        effectiveNps: 2,
        densityLimited: false,
        generator: { seed: 7, version: 'now', analyzer: 'now', params: {} },
      };
      const timing = { offsetMs: 0, tempoMap: [{ beat: 0, bpm: DEMO_BPM }], meter: [{ measure: 0, beatsPerMeasure: 4 }] };
      return route.fulfill({ json: body.brief ? { meta, cached: true } : { chart: { formatVersion: 1, meta, timing, notes, sections: [] }, cached: true } });
    },
  );
}
