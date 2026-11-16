import { expect, test, type Page } from '@playwright/test';
import { chooseSetting, fakeSongs, settingsTab, tool } from './songSelect';

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}') as { parts?: { deck?: string }; patterns?: Record<string, unknown> });

// A chart made in minutes (Mapperatorinator) ends after the player went elsewhere: what it changes
// goes to the settings as they are then, not as the song select left them (a gear picked meanwhile
// came back as it was).
test('a new pattern that ends while the settings are open keeps what was changed there (a gear picked meanwhile)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const songs = fakeSongs(1, 'ready').map((s) => ({ ...s, analyzedAt: 1 }));
  const timing = { offsetMs: 0, tempoMap: [{ beat: 0, bpm: 120 }], meter: [{ measure: 0, beatsPerMeasure: 4 }] };
  // the new pattern is held until the gear has been changed
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs } }));
  await page.route(
    (url) => /^\/api\/songs\/[^/]+\/charts$/.test(url.pathname),
    async (route) => {
      if (route.request().method() !== 'POST') return route.fulfill({ json: { charts: [] } });
      const body = JSON.parse(route.request().postData() ?? '{}');
      const seed = body.newSeed ? 4242 : 7;
      if (body.newSeed) await held;
      const meta = { chartId: `c${seed}${'b'.repeat(16)}`.slice(0, 20), songId: songs[0].id, keyMode: '4K', difficulty: body.difficulty, level: 5, noteCount: 300, durationMs: 60_000, nps: { avg: 5, peak: 9, graph: [1, 2] }, rating: 5, generator: { seed, version: 'now' } };
      return route.fulfill({ json: body.brief ? { meta, cached: true } : { chart: { meta, timing, notes: [], sections: [] }, cached: true } });
    },
  );
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', lastDifficulty: 'NORMAL' })));
  await page.goto('/');
  await expect(page.getByTestId('chart-level')).toHaveText('5', { timeout: 30_000 });

  await page.keyboard.press('F5');
  // meanwhile: to the settings, another gear, back to the song select
  await page.keyboard.press('F10');
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  await settingsTab(page, 'gear');
  await chooseSetting(page, 'opt-deck-style', 'piano');
  await expect.poll(async () => (await stored(page)).parts?.deck).toBe('piano');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('song-list')).toBeVisible();

  // the pattern comes: it is kept as the tier's, and the gear stays
  release();
  await expect.poll(async () => Object.values((await stored(page)).patterns ?? {}), { timeout: 15_000 }).toContain(4242);
  expect((await stored(page)).parts?.deck).toBe('piano');
  expect(errors).toEqual([]);
});

// Mapperatorinator makes one chart at a time: the one being made says so on its plate, the tiers
// waiting behind it say nothing (no "대기"), as the tiers not asked for yet.
test('while a chart is made, only its plate says so: the tiers waiting their turn show no state', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const songs = fakeSongs(1, 'ready').map((s) => ({ ...s, analyzedAt: 1 }));
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
      if (route.request().method() !== 'POST') return route.fulfill({ json: { charts: [] } });
      const body = JSON.parse(route.request().postData() ?? '{}');
      const tier = body.difficulty as string;
      const level = ({ NORMAL: 3, HARD: 7, EXPERT: 11, ELITE: 15, MASTER: 19 } as Record<string, number>)[tier];
      const meta = {
        chartId: `c${tier.slice(0, 2).toLowerCase()}${'d'.repeat(18)}`,
        songId: songs[0].id,
        keyMode: '4K',
        difficulty: tier,
        level,
        noteCount: 0,
        durationMs: 60_000,
        nps: { avg: 0, peak: 0, graph: [] },
        rating: level,
        predicted: true,
        making: tier === 'NORMAL',
        queued: tier === 'HARD' || tier === 'EXPERT',
      };
      return route.fulfill({ json: { meta, cached: false } });
    },
  );
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', lastDifficulty: 'ELITE' })));
  await page.goto('/');
  const plates = page.getByTestId('difficulty-row').getByRole('button');
  await expect(plates).toHaveText([/NORMAL/, /HARD/, /EXPERT/, /ELITE/, /MASTER/], { timeout: 30_000 });
  await expect(page.locator('.difficulty', { hasText: 'NORMAL' }).locator('.diff-state')).toHaveText('생성 중');
  for (const tier of ['HARD', 'EXPERT', 'ELITE', 'MASTER']) await expect(page.locator('.difficulty', { hasText: tier }).locator('.diff-state')).toHaveCount(0);
  await expect(page.getByTestId('difficulty-row')).not.toContainText('대기');
  await expect(page.getByTestId('difficulty-row')).not.toContainText('AI');
  expect(errors).toEqual([]);
});

// The server goes on making a chart while another screen is up: back on the song select, its plate
// still says 생성 중 (after the settings, and after a play's result), and shows its level once made.
test('a chart being made still says so on its plate after the settings and after a result, until it is made', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const songs = fakeSongs(1, 'ready').map((s) => ({ ...s, analyzedAt: 1 }));
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
  // NORMAL is asked for by Enter and made only when the test lets it
  let asked = false;
  let made = false;
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route(
    (url) => /^\/api\/songs\/[^/]+\/charts$/.test(url.pathname),
    async (route) => {
      if (route.request().method() !== 'POST') return route.fulfill({ json: { charts: [] } });
      const body = JSON.parse(route.request().postData() ?? '{}');
      const tier = body.difficulty as string;
      const level = ({ NORMAL: 3, HARD: 7, EXPERT: 11, ELITE: 15, MASTER: 19 } as Record<string, number>)[tier];
      const normal = tier === 'NORMAL';
      const base = { chartId: `c${tier.slice(0, 2).toLowerCase()}${'e'.repeat(18)}`, songId: songs[0].id, keyMode: '4K', difficulty: tier, level, durationMs: 60_000, rating: level };
      const done = { ...base, noteCount: 200, nps: { avg: 4, peak: 8, graph: [1, 2] }, generator: { seed: 7, version: 'now' } };
      const waiting = { ...base, noteCount: 0, nps: { avg: 0, peak: 0, graph: [] }, predicted: true, making: normal && asked };
      if (body.brief) return route.fulfill({ json: { meta: normal && made ? done : waiting, cached: false } });
      if (!normal) return route.fulfill({ json: { meta: waiting, cached: false } });
      asked = true;
      await held;
      made = true;
      return route.fulfill({ json: { chart: { meta: done, timing, notes: [], sections: [] }, cached: true } });
    },
  );
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', lastDifficulty: 'NORMAL' })));
  await page.goto('/');
  const normal = page.locator('.difficulty', { hasText: 'NORMAL' });
  await expect(page.getByTestId('difficulty-row').getByRole('button')).toHaveText([/NORMAL/, /HARD/, /EXPERT/, /ELITE/, /MASTER/], { timeout: 30_000 });
  await expect(normal.locator('.diff-state')).toHaveCount(0);

  // Enter on a chart not made yet asks for it and stays
  await page.getByTestId('hint-enter').click();
  await expect(normal.locator('.diff-state')).toHaveText('생성 중');
  // the settings and back
  await page.keyboard.press('F10');
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('song-list')).toBeVisible();
  await expect(normal.locator('.diff-state')).toHaveText('생성 중');
  // a play (the sync test on autoplay), its result, and back
  await tool(page, 'sync-auto');
  await expect(page.getByTestId('result-screen')).toHaveAttribute('data-settled', 'true', { timeout: 90_000 });
  await page.getByTestId('result-back').click();
  await expect(page.getByTestId('song-list')).toBeVisible();
  await expect(normal.locator('.diff-state')).toHaveText('생성 중');

  // made: the plate shows its level and says nothing more
  release();
  await expect(normal.locator('.diff-state')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByTestId('chart-level')).toHaveText('3');
  expect(errors).toEqual([]);
});
