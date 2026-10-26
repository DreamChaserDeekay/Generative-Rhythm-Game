import { expect, test, type Page } from '@playwright/test';
import { fakeSongs, tool } from './songSelect';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** A pad the page reads through navigator.getGamepads: a standard-mapping one, or (mapping '') a controller of its own layout. */
async function plugPad(page: Page, mapping = 'standard') {
  await page.addInitScript((m) => {
    const pad = {
      index: 0,
      id: 'E2E Pad',
      connected: true,
      mapping: m,
      timestamp: 1,
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      axes: [0, 0, 0, 0],
    };
    (window as unknown as { __pad: typeof pad }).__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
  }, mapping);
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

const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
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

  // RB steps to the next tab (기어), where A flips a switch
  await press(PAD.RB);
  await expect(page.getByTestId('settings-tab-gear')).toHaveAttribute('aria-selected', 'true');
  // its gear preview starts a renderer: a tap made and let go while that keeps the page busy is
  // never seen by the pad's polling (on a loaded machine), so wait for two frames first
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const bars = page.getByTestId('bar-lines');
  const checked = (await bars.getAttribute('aria-checked')) === 'true';
  await bars.focus();
  await press(PAD.A);
  await expect(bars).toHaveAttribute('aria-checked', String(!checked));
  expect((await stored(page)).barLines).toBe(!checked);
  // on (노트 색), the d-pad goes along the lanes' swatches and down to the hue, whose ←→ change
  // the lane's colour (a copy of the preset takes it)
  await press(PAD.RB);
  await expect(page.getByTestId('settings-tab-colors')).toHaveAttribute('aria-selected', 'true');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.getByTestId('color-lane-0').focus();
  await press(PAD.RIGHT);
  await expect(page.getByTestId('color-lane-1')).toBeFocused();
  await press(PAD.DOWN);
  await expect(page.getByTestId('opt-color-hue')).toBeFocused();
  const hue = Number(await page.getByTestId('opt-color-hue').getAttribute('data-value'));
  await press(PAD.RIGHT);
  await expect(page.getByTestId('opt-color-hue')).toHaveAttribute('data-value', String((hue + 1) % 360));
  expect((await stored(page)).noteColors).toBe('user-1');
  // and on (연출·배경), where ← on a row lowers its value; LB steps back
  await press(PAD.RB);
  await expect(page.getByTestId('settings-tab-fx')).toHaveAttribute('aria-selected', 'true');
  const fx = page.getByTestId('camera-fx');
  await fx.focus();
  const before = Number(await fx.getAttribute('data-value'));
  await press(PAD.LEFT);
  await expect.poll(async () => Number(await fx.getAttribute('data-value'))).toBeLessThan(before);
  expect((await stored(page)).cameraFx).toBeLessThan(before);
  await press(PAD.LB);
  await expect(page.getByTestId('settings-tab-colors')).toHaveAttribute('aria-selected', 'true');
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

test('a pad works the song select: LB / RB a page, X the play options on their first row (RB the tab), B back to the list, LT the song info, RT the settings', async ({ page }) => {
  const errors = trackErrors(page);
  const press = await plugPad(page);
  const songs = fakeSongs(30);
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs } }));
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K' })));
  await page.goto('/');
  await expect(page.getByTestId('song-item')).toHaveCount(30);
  const title = page.getByTestId('song-title');
  await expect(title).toHaveText('Fake Song 01');

  // the d-pad moves the cursor, RB a page down, LB back up; the key hints name the pad's buttons
  await press(PAD.DOWN);
  await expect(title).toHaveText('Fake Song 02');
  const hints = page.locator('.hintbar');
  await expect(hints).toContainText('LT');
  await expect(hints).not.toContainText('Space');
  await press(PAD.RB);
  await expect.poll(async () => Number(((await title.textContent()) ?? '').replace(/\D/g, ''))).toBeGreaterThan(5);
  await press(PAD.LB);
  await expect(title).toHaveText('Fake Song 02');

  // X: the play options, their first row focused; → changes it, RB the next tab, B closes them
  await press(PAD.X);
  await expect(page.getByTestId('rule-placement')).toBeFocused();
  await press(PAD.RIGHT);
  await expect(page.getByTestId('rule-placement')).not.toHaveAttribute('data-value', 'OFF');
  await press(PAD.DOWN);
  await expect(page.getByTestId('rule-gauge')).toBeFocused();
  await expect(title).toHaveText('Fake Song 02');
  await press(PAD.RB);
  await expect(page.getByTestId('toggle-gear')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('quick-speed')).toBeFocused();
  await press(PAD.B);
  await expect(page.getByTestId('play-options')).toHaveCount(0);
  expect(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.songId)).toBe(songs[1].id);
  // Y is the key mode, as before
  await press(PAD.Y);
  await expect(page.locator('.key-modes button.active')).not.toHaveText('4K');

  // LT: the song info; B closes it; RT: the settings
  await press(PAD.LT);
  await expect(page.getByTestId('song-info')).toBeVisible();
  await expect(page.getByTestId('song-info').locator(':focus')).toHaveCount(1);
  await press(PAD.B);
  await expect(page.getByTestId('song-info')).toHaveCount(0);
  await press(PAD.RT);
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a controller of its own layout reaches every tab of the play options with its menu buttons, and the hints name keys of the keyboard', async ({ page }) => {
  const errors = trackErrors(page);
  const press = await plugPad(page, '');
  const songs = fakeSongs(6);
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs } }));
  // its menu buttons as assigned in 게임패드 (결정, 취소, the four directions, 옵션)
  const padMenu = { ok: 'Pad:B0', back: 'Pad:B1', up: 'Pad:B2', down: 'Pad:B3', left: 'Pad:B4', right: 'Pad:B5', options: 'Pad:B6' };
  await page.addInitScript((menu) => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', padMenu: menu })), padMenu);
  await page.goto('/');
  await expect(page.getByTestId('song-item')).toHaveCount(6);
  const MENU = { OK: 0, BACK: 1, UP: 2, DOWN: 3, LEFT: 4, RIGHT: 5, OPTIONS: 6 };

  // 옵션: the play options on their first row; the hints name keys, not buttons it does not have
  await press(MENU.OPTIONS);
  await expect(page.getByTestId('rule-placement')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.dataset.input)).toBe('controller');
  const hints = page.locator('.hintbar');
  await expect(hints).toContainText('Space');
  await expect(hints).not.toContainText('LB');
  // 위 from the first row: the tabs; 오른쪽 the next tab (the focus stays on them), 아래 its first row
  await press(MENU.UP);
  await expect(page.getByTestId('toggle-rules')).toBeFocused();
  await press(MENU.RIGHT);
  await expect(page.getByTestId('toggle-gear')).toHaveAttribute('aria-selected', 'true');
  await press(MENU.RIGHT);
  await expect(page.getByTestId('toggle-generation')).toHaveAttribute('aria-selected', 'true');
  await press(MENU.LEFT);
  await expect(page.getByTestId('toggle-gear')).toBeFocused();
  await press(MENU.DOWN);
  await expect(page.getByTestId('quick-speed')).toBeFocused();
  const speed = Number(await page.getByTestId('quick-speed').getAttribute('data-value'));
  await press(MENU.RIGHT);
  await expect.poll(async () => (await stored(page)).hiSpeed).toBe(Math.round((speed + 0.1) * 10) / 10);
  // and the cover below it
  await press(MENU.DOWN);
  await expect(page.getByTestId('quick-sudden')).toBeFocused();
  await press(MENU.RIGHT);
  await expect.poll(async () => (await stored(page)).sudden).toBeGreaterThan(0);
  // 취소 closes them, the song under the cursor has the focus
  await press(MENU.BACK);
  await expect(page.getByTestId('play-options')).toHaveCount(0);
  expect(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.songId)).toBe(songs[0].id);
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
