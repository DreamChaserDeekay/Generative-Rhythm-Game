import { expect, test } from '@playwright/test';
import { addFromMenu, difficultySystem, playOptions, songInfo } from './songSelect';

// Difficulty systems: DJMAX RESPECT V tiers, EZ2ON's on a 1-20 scale, and the original five
// steps (the default).
test('charts are generated on the DJMAX, EZ2ON and original difficulty scales', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // start on DJMAX (written only when there are no settings, so a reload keeps the switches below)
  await page.addInitScript(() => {
    if (!localStorage.getItem('grg.settings.v1')) localStorage.setItem('grg.settings.v1', JSON.stringify({ difficultySystem: 'DJMAX' }));
  });
  await page.goto('/');
  await addFromMenu(page, 'demo-button');
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 60_000 });
  const tiers = page.getByTestId('difficulty-row').getByRole('button');

  // DJMAX: NORMAL · HARD · MAXIMUM · SC
  await expect(page.locator('.system-label')).toHaveText('난이도 기준 DJMAX');
  await expect(tiers).toHaveText([/NORMAL\s*NM/, /HARD\s*HD/, /MAXIMUM\s*MX/, /SC\s*SC/]);
  await page.getByRole('button', { name: /MAXIMUM/ }).click();
  await expect(page.getByTestId('chart-level')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.difficulty.active')).toContainText('MAXIMUM');
  const mx = Number((await page.getByTestId('chart-level').textContent())?.replace(/\D/g, ''));
  expect(mx).toBeGreaterThanOrEqual(8);
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
  await page.getByRole('button', { name: /^SC/ }).click();
  await expect(page.getByTestId('chart-level')).toHaveText(/^SC \d+$/, { timeout: 30_000 });

  // EZ2ON: EASY · NORMAL · HARD · SUPER HARD, the tier carried over by name
  await difficultySystem(page, 'EZ2ON');
  await expect(tiers).toHaveText([/EASY\s*EZ/, /NORMAL\s*NM/, /HARD\s*HD/, /SUPER HARD\s*SHD/]);
  await page.getByRole('button', { name: /SUPER HARD/ }).click();
  await expect(page.getByTestId('chart-level')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.difficulty.active')).toContainText('SUPER HARD');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}'));
  expect(stored.difficultySystem).toBe('EZ2ON');
  expect(stored.lastDifficulty).toBe('SHD');

  // the original five steps
  await difficultySystem(page, 'GRG');
  await expect(tiers).toHaveCount(5);
  await expect(tiers.first()).toHaveText(/EASY/);
  expect(errors).toEqual([]);
});
