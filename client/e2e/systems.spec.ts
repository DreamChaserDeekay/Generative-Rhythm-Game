import { expect, test } from '@playwright/test';

// Difficulty systems: DJMAX RESPECT V tiers by default, EZ2ON's on a 1-20 scale, and the
// original five steps.
test('charts are generated on the DJMAX, EZ2ON and original difficulty scales', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('demo-button').click();
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 60_000 });
  const tiers = page.getByTestId('difficulty-row').getByRole('button');

  // DJMAX is the default: NORMAL · HARD · MAXIMUM · SC
  await expect(page.getByTestId('system-DJMAX')).toHaveClass(/active/);
  await expect(tiers).toHaveText([/NORMAL\s*NM/, /HARD\s*HD/, /MAXIMUM\s*MX/, /SC\s*SC/]);
  await page.getByRole('button', { name: /MAXIMUM/ }).click();
  await page.getByTestId('generate-button').click();
  await expect(page.getByTestId('chart-preview')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.level-badge span')).toHaveText('DJMAX MX');
  const mx = Number((await page.getByTestId('chart-level').textContent())?.replace(/\D/g, ''));
  expect(mx).toBeGreaterThanOrEqual(8);
  await page.getByRole('button', { name: /^SC/ }).click();
  await page.getByTestId('generate-button').click();
  await expect(page.getByTestId('chart-level')).toHaveText(/^SC \d+$/, { timeout: 30_000 });

  // EZ2ON: EASY · NORMAL · HARD · SUPER HARD, the tier carried over by name
  await page.getByTestId('system-EZ2ON').click();
  await expect(tiers).toHaveText([/EASY\s*EZ/, /NORMAL\s*NM/, /HARD\s*HD/, /SUPER HARD\s*SHD/]);
  await page.getByRole('button', { name: /SUPER HARD/ }).click();
  await page.getByTestId('generate-button').click();
  await expect(page.locator('.level-badge span')).toHaveText('EZ2ON SHD', { timeout: 30_000 });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}'));
  expect(stored.difficultySystem).toBe('EZ2ON');
  expect(stored.lastDifficulty).toBe('SHD');

  // the original five steps
  await page.getByTestId('system-GRG').click();
  await expect(tiers).toHaveCount(5);
  await expect(tiers.first()).toHaveText(/EASY/);
  expect(errors).toEqual([]);
});
