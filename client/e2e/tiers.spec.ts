import { expect, test } from '@playwright/test';
import { addFromMenu, playOptions, settingsTab, songInfo } from './songSelect';

// The four tiers of the game's own scale (Lv.4–15); the DJMAX and EZ2ON difficulty systems were taken out.
test('charts are generated on the four tiers, and settings saved on a removed difficulty system load on NORMAL', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // settings of a version with the DJMAX system (written only when there are none)
  await page.addInitScript(() => {
    if (!localStorage.getItem('grg.settings.v1')) localStorage.setItem('grg.settings.v1', JSON.stringify({ difficultySystem: 'DJMAX', lastDifficulty: 'MX' }));
  });
  await page.goto('/');
  await addFromMenu(page, 'demo-button');
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 60_000 });
  const tiers = page.getByTestId('difficulty-row').getByRole('button');
  await expect(tiers).toHaveText([/NORMAL\s*NM/, /HARD\s*HD/, /EXPERT\s*EX/, /MASTER\s*MX/]);
  await expect(page.locator('.difficulty.active')).toContainText('NORMAL');

  await page.getByRole('button', { name: /EXPERT/ }).click();
  await expect(page.getByTestId('chart-level')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.difficulty.active')).toContainText('EXPERT');
  const ex = Number((await page.getByTestId('chart-level').textContent())?.replace(/\D/g, ''));
  expect(ex).toBeGreaterThanOrEqual(8);
  // the chart's pattern profile: six shares in percent
  await songInfo(page);
  await expect(page.getByTestId('pattern-mix').locator('.pattern-chip')).toHaveText([/계단 \d+%/, /트릴 \d+%/, /동치 \d+%/, /연타 \d+%/, /롱잡 \d+%/, /도약 \d+%/]);
  // the earlier note-by-note placement stays available to compare
  const classic = page.waitForRequest(
    (r) => r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/charts') && (r.postData() ?? '').includes('"patternEngine":"classic"'),
  );
  await playOptions(page, 'generation');
  await page.getByTestId('pattern-engine-classic').click();
  await classic;
  await expect(page.getByTestId('toggle-generation')).toContainText('이전 배치');
  await page.getByTestId('pattern-engine').getByRole('button', { name: '악구·패턴' }).click();
  await page.getByTestId('toggle-generation').click();
  await expect(page.getByTestId('toggle-generation')).not.toContainText('이전 배치');
  await page.getByRole('button', { name: /MASTER/ }).click();
  await expect(page.getByTestId('chart-level')).toHaveText(/^\d+$/, { timeout: 30_000 });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}'));
  expect(stored.difficultySystem).toBeUndefined();
  expect(stored.lastDifficulty).toBe('MASTER');

  // no difficulty system to choose in the settings
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'play');
  await expect(page.getByTestId('opt-system')).toHaveCount(0);
  expect(errors).toEqual([]);
});
