import { expect, test, type Page } from '@playwright/test';
import { tool } from './songSelect';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** A standard-mapping pad the page reads through navigator.getGamepads. */
async function plugPad(page: Page) {
  await page.addInitScript(() => {
    const pad = {
      index: 0,
      id: 'E2E Pad',
      connected: true,
      mapping: 'standard',
      timestamp: 1,
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      axes: [0, 0, 0, 0],
    };
    (window as unknown as { __pad: typeof pad }).__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
  });
  const set = (button: number, down: boolean) =>
    page.evaluate(
      ([b, d]) => {
        const pad = (window as unknown as { __pad: { buttons: { pressed: boolean }[]; timestamp: number } }).__pad;
        pad.buttons[b as number].pressed = d as boolean;
        pad.timestamp = performance.now();
      },
      [button, down],
    );
  // held long enough for the 16 ms menu polling to see it; with `busyMs` the page is kept busy that
  // long (no polling, no frames) before the button is let go
  return async (button: number, busyMs = 0) => {
    await set(button, true);
    await page.waitForTimeout(80);
    if (busyMs > 0)
      await page.evaluate((ms) => {
        const end = performance.now() + ms;
        while (performance.now() < end);
      }, busyMs);
    await set(button, false);
    await page.waitForTimeout(80);
  };
}

const PAD = { A: 0, B: 1, LB: 4, RB: 5, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}'));

test('a pad works the settings: the d-pad moves the focus, ←→ change a row, A flips one, LB/RB change the tab; binding B stays in the settings', async ({ page }) => {
  const errors = trackErrors(page);
  const press = await plugPad(page);
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  // the settings open on their first row
  await expect(page.getByTestId('opt-hi-speed')).toBeFocused();

  // from nowhere, ↓ focuses the first control (완료); a pad's focus is outlined
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await press(PAD.DOWN);
  await expect(page.locator('.settings-screen .topbar button.primary')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.dataset.input)).toBe('pad');
  await press(PAD.DOWN);
  await expect(page.locator('.settings-nav button').first()).toBeFocused();
  // from the tabs ↓ goes into the rows, and on through them
  await press(PAD.DOWN);
  await expect(page.getByTestId('opt-hi-speed')).toBeFocused();
  await press(PAD.DOWN);
  await expect(page.getByTestId('opt-sudden')).toBeFocused();
  // a tap that ends while the page is too busy to read the pad (a renderer starting) is one step
  await press(PAD.DOWN, 600);
  await expect(page.getByTestId('opt-hidden')).toBeFocused();

  // ← on a row lowers its value; A flips a switch
  const fx = page.getByTestId('camera-fx');
  await fx.focus();
  const before = Number(await fx.getAttribute('data-value'));
  await press(PAD.LEFT);
  await expect.poll(async () => Number(await fx.getAttribute('data-value'))).toBeLessThan(before);
  expect((await stored(page)).cameraFx).toBeLessThan(before);
  const bars = page.getByTestId('bar-lines');
  const checked = (await bars.getAttribute('aria-checked')) === 'true';
  await bars.focus();
  await press(PAD.A);
  await expect(bars).toHaveAttribute('aria-checked', String(!checked));
  expect((await stored(page)).barLines).toBe(!checked);

  // RB and LB step through the tabs
  await press(PAD.RB);
  await expect(page.getByTestId('settings-tab-sound')).toHaveAttribute('aria-selected', 'true');
  await press(PAD.LB);
  await expect(page.getByTestId('settings-tab-display')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('settings-tab-pad').click();
  await expect(page.getByTestId('gamepad-status')).toContainText('E2E Pad');

  // binding B to a lane does not also press Esc on the settings
  const firstCap = page.getByTestId('gamepad-settings').locator('.pad-cap').first();
  await firstCap.click();
  await expect(firstCap).toHaveText('…');
  await press(PAD.B);
  await expect(firstCap).toHaveText('버튼 1');
  await page.waitForTimeout(200);
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  // and afterwards B is Esc again
  await press(PAD.B);
  await expect(page.getByTestId('song-list')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the pause menu, the calibration and a song that fails to load answer to Esc and the pad', async ({ page }) => {
  const errors = trackErrors(page);
  const press = await plugPad(page);
  await page.goto('/');

  // pause menu: focus starts on 계속하기, the d-pad moves it (and leaves the hi-speed alone)
  await tool(page, 'sync-auto');
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  const menu = page.getByTestId('pause-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('button', { name: /계속하기/ })).toBeFocused();
  const speed = (await stored(page)).hiSpeed;
  await press(PAD.DOWN);
  await expect(menu.getByRole('button', { name: /다시 하기/ })).toBeFocused();
  await press(PAD.DOWN);
  await expect(menu.getByRole('button', { name: /나가기/ })).toBeFocused();
  expect((await stored(page)).hiSpeed).toBe(speed);
  await press(PAD.A);
  await expect(page.getByTestId('song-list')).toBeVisible();

  // calibration: Esc goes back; the pad starts a run (A on 시작), B stops it and then goes back
  await tool(page, 'open-calibration');
  await expect(page.getByTestId('calib-start')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('song-list')).toBeVisible();
  await tool(page, 'open-calibration');
  await expect(page.getByTestId('calib-start')).toBeFocused();
  await press(PAD.A);
  await expect(page.getByTestId('calib-start')).toBeDisabled();
  await press(PAD.B);
  await expect(page.getByTestId('calib-start')).toBeEnabled();
  await press(PAD.B);
  await expect(page.getByTestId('song-list')).toBeVisible();

  // a song whose audio does not come: the wait and the error can both be left
  expect((await page.request.post('/api/songs/demo', { data: { bpm: 127, bars: 8, seed: 3 } })).ok()).toBe(true);
  await expect
    .poll(async () => {
      const list = (await (await page.request.get('/api/songs')).json()).songs as { title: string; status: string }[];
      return list.some((s) => s.title === 'Demo Groove 127' && s.status === 'ready');
    }, { timeout: 60_000 })
    .toBe(true);
  await page.reload();
  await page.getByTestId('song-item').filter({ hasText: 'Demo Groove 127' }).click();
  await page.route('**/api/songs/*/audio', async (route) => {
    await new Promise((r) => setTimeout(r, 4000));
    await route.abort();
  });
  await page.getByTestId('play-button').click();
  await expect(page.getByTestId('play-loading')).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('song-list')).toBeVisible();
  await page.getByTestId('play-button').click();
  const back = page.getByRole('button', { name: /돌아가기/ });
  await expect(back).toBeVisible({ timeout: 30_000 });
  await expect(back).toBeFocused();
  await press(PAD.B);
  await expect(page.getByTestId('song-list')).toBeVisible();
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  expect(errors).toEqual([]);
});
