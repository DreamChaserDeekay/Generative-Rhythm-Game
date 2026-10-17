import { expect, test } from '@playwright/test';

for (const keyMode of ['4K', '7K+1S']) {
  test(`sync test autoplay is a PERFECT PLAY (${keyMode})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.getByRole('button', { name: keyMode, exact: true }).click();
    await page.getByTestId('sync-auto').click();
    await expect(page.getByTestId('play-screen')).toBeVisible();
    await page.waitForTimeout(9000);
    await page.screenshot({ path: `test-results/play-${keyMode.replace('+', '')}.png` });
    await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('result-lamp')).toHaveText('PERFECT PLAY');
    await expect(page.getByTestId('result-rate')).toHaveText('100.00%');
    await expect(page.getByTestId('result-breaks')).toHaveText('0');
    expect(errors).toEqual([]);
  });
}
