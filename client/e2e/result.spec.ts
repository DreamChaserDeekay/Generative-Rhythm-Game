import { expect, test, type Page } from '@playwright/test';
import { autoplay, escWhenLoaded, tool } from './songSelect';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const isChartPost = (method: string, url: string) => method === 'POST' && new URL(url).pathname.endsWith('/charts');

test('on the result Enter continues and R plays again; a held Enter starts nothing more', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await tool(page, 'sync-auto');
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
  // autoplay earns no lamp
  await expect(page.getByTestId('result-lamp')).toHaveText('AUTO');
  await expect(page.getByTestId('result-lamp')).toHaveClass(/aided/);
  await expect(page.getByTestId('result-back')).toBeFocused();

  await page.keyboard.press('KeyR');
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });

  // held: the first press continues to the song select, the repeats do not start a song there
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(page.getByTestId('song-list')).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId('play-screen')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a new pattern from the result keeps its difficulty system; a failure is shown, a late one dropped', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  expect((await page.request.post('/api/songs/demo', { data: { bpm: 131, bars: 8, seed: 9 } })).ok()).toBe(true);
  await expect
    .poll(async () => {
      const list = (await (await page.request.get('/api/songs')).json()).songs as { title: string; status: string }[];
      return list.some((s) => s.title === 'Demo Groove 131' && s.status === 'ready');
    }, { timeout: 60_000 })
    .toBe(true);
  await page.reload();
  await page.getByTestId('song-item').filter({ hasText: 'Demo Groove 131' }).click();
  await page.getByRole('button', { name: '4K', exact: true }).click();
  await page.getByRole('button', { name: /NORMAL/ }).first().click();
  const playToResult = async () => {
    await autoplay(page);
    await page.getByTestId('play-button').click();
    await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 90_000 });
  };
  await playToResult();

  // the server refuses: the result screen says so and stays
  await page.route('**/api/songs/*/charts', (route) =>
    route.request().method() === 'POST' ? route.fulfill({ status: 500, json: { detail: 'e2e refusal' } }) : route.fallback(),
  );
  await page.getByTestId('result-regenerate').click();
  await expect(page.getByTestId('result-regenerate-error')).toContainText('새 패턴을 만들지 못했습니다');
  await expect(page.getByTestId('result-screen')).toBeVisible();
  await page.unroute('**/api/songs/*/charts');

  // the new pattern is asked for on the chart's own system (DJMAX NM), and played
  const asked = page.waitForRequest((r) => isChartPost(r.method(), r.url()));
  // Esc pauses once the play has loaded (while it loads, Esc leaves it), even the moment it has
  await escWhenLoaded(page);
  await page.getByTestId('result-regenerate').click();
  const body = JSON.parse((await asked).postData() ?? '{}');
  expect([body.system, body.difficulty, body.newSeed]).toEqual(['DJMAX', 'NM', true]);
  await expect(page.getByTestId('play-screen')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('pause-menu')).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('KeyQ');

  // leaving while it is generating: the late pattern does not start a song
  await expect(page.getByTestId('song-list')).toBeVisible();
  await playToResult();
  await page.route('**/api/songs/*/charts', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  const late = page.waitForResponse((r) => isChartPost(r.request().method(), r.url()));
  await page.getByTestId('result-regenerate').click();
  await expect(page.getByTestId('result-regenerate')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('song-list')).toBeVisible();
  await late;
  await page.waitForTimeout(500);
  await expect(page.getByTestId('play-screen')).toHaveCount(0);
  expect(errors).toEqual([]);
});
