import { expect, test, type Page } from '@playwright/test';
import { autoplay, difficultySystem, playOptions, songInfo } from './songSelect';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** A library of songs that failed to analyse: the list and the controls, with nothing to play. */
function fakeSongs(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: (0xa000 + i).toString(16).padStart(16, '0'),
    title: `Fake Song ${String(i + 1).padStart(2, '0')}`,
    artist: 'E2E',
    album: '',
    audioHash: `fake${i}`,
    durationMs: 60_000,
    hasCover: false,
    status: 'error',
    progress: 0,
    progressLabel: '',
    error: 'e2e',
    bpm: null,
    bpmMin: null,
    bpmMax: null,
    previewMs: null,
    overrides: {},
    createdAt: i,
    analyzedAt: null,
    analyzer: {},
    hasBga: false,
    bgaOffsetMs: 0,
    bgaYoutube: null,
    sections: null,
    records: [],
  }));
}

const isChartPost = (method: string, url: string) => method === 'POST' && new URL(url).pathname.endsWith('/charts');

test('the song list keeps the cursor in view and in focus; Shift+Tab steps back; a drop-down and the speed and gear rows keep their arrows', async ({ page }) => {
  const errors = trackErrors(page);
  const songs = fakeSongs(16);
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs } }));
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K' })));
  await page.goto('/');
  const rows = page.getByTestId('song-item');
  await expect(rows).toHaveCount(16);
  const list = page.getByTestId('song-list');

  // a clicked row passes its focus on with the cursor, and the cursor never leaves the list's view
  await rows.first().click();
  for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('song-title')).toHaveText('Fake Song 16');
  const active = page.locator('.song-item.active');
  await expect(active).toHaveCount(1);
  const [box, view] = [await active.boundingBox(), await list.boundingBox()];
  expect(box && view && box.y >= view.y - 1 && box.y + box.height <= view.y + view.height + 1).toBe(true);
  expect(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.songId)).toBe(songs[15].id);

  // Tab steps the key mode forward, Shift+Tab back (from 4K to the last mode)
  const modes = page.locator('.key-modes button');
  await page.keyboard.press('Shift+Tab');
  await expect(modes.last()).toHaveClass(/active/);
  await page.keyboard.press('Tab');
  await expect(modes.first()).toHaveClass(/active/);

  // a focused drop-down changes its own value with the arrows, not the song
  await playOptions(page, 'rules');
  const select = page.getByTestId('play-options').locator('select').first();
  const before = await select.inputValue();
  await select.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('song-title')).toHaveText('Fake Song 16');
  expect(await select.inputValue()).not.toBe(before);

  // the speed and gear rows: ←→ change a row and ↑↓ go through the rows, not the songs
  await playOptions(page, 'gear');
  const speed = page.getByTestId('quick-speed');
  await speed.focus();
  const speedBefore = Number(await speed.getAttribute('data-value'));
  await page.keyboard.press('ArrowRight');
  await expect(speed).toHaveAttribute('data-value', String(Math.round((speedBefore + 0.1) * 10) / 10));
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('quick-sudden')).toBeFocused();
  const skin = page.getByTestId('quick-skin');
  const camera = await page.getByTestId('quick-camera').getAttribute('data-value');
  await skin.focus();
  const skinBefore = (await skin.getAttribute('data-value')) ?? '';
  await page.keyboard.press('ArrowRight');
  await expect(skin).not.toHaveAttribute('data-value', skinBefore);
  await expect(page.getByTestId('song-title')).toHaveText('Fake Song 16');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}'));
  expect(stored.skin).toBe(await skin.getAttribute('data-value'));
  // a skin keeps the camera
  expect(stored.cameraPreset).toBe(camera);
  expect(errors).toEqual([]);
});

test('a chart never lands on another song, Enter starts one play, and a new analysis drops the old chart', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  for (const bpm of [133, 137]) expect((await page.request.post('/api/songs/demo', { data: { bpm, bars: 8, seed: 5 } })).ok()).toBe(true);
  await expect
    .poll(async () => {
      const list = (await (await page.request.get('/api/songs')).json()).songs as { title: string; status: string }[];
      return list.filter((s) => /^Demo Groove 13[37]$/.test(s.title) && s.status === 'ready').length;
    }, { timeout: 90_000 })
    .toBe(2);
  await page.reload();
  const row = (bpm: number) => page.getByTestId('song-item').filter({ hasText: `Demo Groove ${bpm}` });
  await row(133).click();
  await expect(page.getByTestId('song-title')).toHaveText('Demo Groove 133');
  await page.getByRole('button', { name: '4K', exact: true }).click();

  // the chart asked for on one song arrives after the cursor moved to the next: it is dropped
  // (only the generation is held back: the saved-charts list shares the path)
  await page.route('**/api/songs/*/charts', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  const late = page.waitForResponse((r) => isChartPost(r.request().method(), r.url()));
  await page.getByTestId('generate-button').click();
  await row(137).click();
  await late;
  await expect(page.getByTestId('busy')).toHaveCount(0);
  await expect(page.getByTestId('song-title')).toHaveText('Demo Groove 137');
  await expect(page.getByTestId('chart-level')).toHaveCount(0);
  await expect(page.locator('.level-pending')).toBeVisible();
  await page.unroute('**/api/songs/*/charts');

  // Enter held down on the focused autoplay box: one chart request, one play
  let posts = 0;
  page.on('request', (r) => {
    if (isChartPost(r.method(), r.url())) posts++;
  });
  await autoplay(page);
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(page.getByTestId('play-screen')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);
  expect(posts).toBe(1);
  // Esc pauses once the play has loaded (while it loads, Esc leaves it)
  await expect(page.getByTestId('play-loading')).toHaveCount(0, { timeout: 30_000 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await page.keyboard.press('KeyQ');

  // a BPM fix analyses the song again: the chart made on the old analysis is gone, and Enter
  // does not play while the analysis runs
  await expect(page.getByTestId('song-title')).toHaveText('Demo Groove 137');
  await page.getByTestId('generate-button').click();
  await expect(page.getByTestId('chart-level')).toBeVisible({ timeout: 30_000 });
  await songInfo(page);
  await page.locator('.song-tools').getByRole('button', { name: '×2' }).click();
  await expect(page.getByTestId('analysis-status')).toBeVisible();
  await expect(page.getByTestId('chart-level')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('play-screen')).toHaveCount(0);
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator('.level-pending')).toBeVisible();
  await expect(page.getByTestId('chart-level')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a best shows on its own difficulty system only (DJMAX NM is not EZ2ON NM)', async ({ page }) => {
  const errors = trackErrors(page);
  const [song] = fakeSongs(1);
  const record = { chartId: 'c' + '1'.repeat(20), songId: song.id, keyMode: '4K', difficulty: 'NM', level: 5, seed: 1, score: 912_000, rate: 91.2, maxCombo: 40, lamp: 'CLEAR', plays: 1 };
  const songs = [{ ...song, records: [{ ...record, system: 'DJMAX' }] }];
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs } }));
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', difficultySystem: 'DJMAX' })));
  await page.goto('/');
  const plate = page.getByTestId('difficulty-row').getByRole('button', { name: /NORMAL/ });
  await expect(plate.locator('.diff-lamp')).toHaveText('91.20%');
  await difficultySystem(page, 'EZ2ON');
  await expect(page.getByTestId('difficulty-row').getByRole('button')).toHaveText([/EASY/, /NORMAL/, /HARD/, /SUPER HARD/]);
  await expect(page.getByTestId('difficulty-row').locator('.diff-lamp')).toHaveCount(0);
  expect(errors).toEqual([]);
});
