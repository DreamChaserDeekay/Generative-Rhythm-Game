import { expect, test, type Page } from '@playwright/test';
import { tool } from './songSelect';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** The HUD's end show as the play's own HUD will leave it (data-testid="hud-lamp"), put there by hand. */
async function putHudLamp(page: Page, lamp: string) {
  await page.evaluate((l) => {
    const el = document.createElement('div');
    el.dataset.testid = 'hud-lamp';
    el.dataset.lamp = l;
    el.textContent = 'MAX COMBO';
    el.style.cssText = 'position:absolute;left:440px;top:320px;width:400px;height:80px';
    document.querySelector('.hud')?.appendChild(el);
  }, lamp);
}

test('the start card gives way into the track once the play has started (the play takes keys at once); the result stamp comes from the play’s lamp', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K' })));
  await page.goto('/');
  await tool(page, 'sync-auto');
  // the card stays a moment over the play as it goes: no longer "loading", and nothing of it takes a click
  await expect(page.getByTestId('play-loading')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByTestId('play-loading-leaving')).toHaveAttribute('inert', '');
  // its jacket flies toward the far end of the track: up the screen and small
  const fly = await page.locator('[data-testid="play-loading-leaving"] .loading-jacket').evaluate((el) => {
    const a = el.getAnimations()[0];
    const frames = a?.effect instanceof KeyframeEffect ? a.effect.getKeyframes() : [];
    return String(frames[frames.length - 1]?.transform ?? '');
  });
  expect(fly).toMatch(/translate\(-?[\d.]+px, -[\d.]+px\) scale\(0\.06\)/);
  // gone within the second
  await expect(page.getByTestId('play-loading-leaving')).toHaveCount(0, { timeout: 1500 });

  // the end: the HUD's lamp, then the result whose stamp comes over from it
  await putHudLamp(page, 'perfect');
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 90_000 });
  const line = page.locator('.result-lamp-line');
  await expect(line).toHaveAttribute('data-flown', 'perfect');
  const from = await line.locator('.lamp-text').evaluate((el) => {
    const a = el.getAnimations()[0];
    const frames = a?.effect instanceof KeyframeEffect ? a.effect.getKeyframes() : [];
    return String(frames[0]?.transform ?? '');
  });
  expect(from).toMatch(/^translate\(/);
  expect(errors).toEqual([]);
});

test('with less motion asked for, the card is gone at once, and a play that ends without the HUD lamp stamps the result in place', async ({ page }) => {
  const errors = trackErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K' })));
  await page.goto('/');
  await tool(page, 'sync-auto');
  await expect(page.getByTestId('play-loading')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByTestId('play-loading-leaving')).toHaveCount(0, { timeout: 300 });
  // Esc as the play starts pauses it (the card no longer has it)
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.result-lamp-line')).not.toHaveAttribute('data-flown', /.*/);
  expect(errors).toEqual([]);
});
