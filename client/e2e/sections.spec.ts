import { expect, test, type Page } from '@playwright/test';
import { addFromMenu, songInfo } from './songSelect';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('song sections: analysed by group and shown with the chart', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await addFromMenu(page, 'demo-button');
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByTestId('chart-level')).toBeVisible({ timeout: 30_000 });
  await songInfo(page);
  await expect(page.getByTestId('chart-preview')).toBeVisible();
  await expect(page.getByTestId('loop-consistency')).toBeVisible();

  // other specs share the library: find the selected song by its title
  const title = await page.getByTestId('song-title').textContent();
  const songs = (await (await page.request.get('/api/songs')).json()).songs as { id: string; title: string }[];
  const id = (songs.find((s) => s.title === title) ?? songs[0]).id;
  const analysed = await (await page.request.get(`/api/songs/${id}/sections`)).json();
  expect(analysed.edited).toBe(false);
  expect(analysed.sections.length).toBeGreaterThanOrEqual(3);
  expect(analysed.sections.every((s: { group?: string; loopBars?: number }) => s.group && s.loopBars)).toBe(true);

  expect(errors).toEqual([]);
});
