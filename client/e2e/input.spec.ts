import { expect, test, type Page } from '@playwright/test';
import { chooseSetting, playOptions, settingsTab } from './songSelect';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const SONG = 'Demo Groove 143';
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}') as Record<string, unknown>);

/** Settings to start from, kept over reloads (written only when there are none). */
async function startWith(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript((s) => {
    if (!localStorage.getItem('grg.settings.v1')) localStorage.setItem('grg.settings.v1', JSON.stringify(s));
  }, settings);
}

/** The demo song these tests play (made once), selected; its id. */
async function demoSong(page: Page): Promise<string> {
  const find = async () => ((await (await page.request.get('/api/songs')).json()).songs as { id: string; title: string; status: string }[]).find((s) => s.title === SONG);
  if (!(await find())) expect((await page.request.post('/api/songs/demo', { data: { bpm: 143, bars: 8, seed: 7 } })).ok()).toBe(true);
  await expect.poll(async () => (await find())?.status, { timeout: 60_000 }).toBe('ready');
  await page.goto('/');
  await page.getByTestId('song-item').filter({ hasText: SONG }).click();
  return (await find())!.id;
}

/** Starts the selected chart and waits for its loading card to go. */
async function play(page: Page) {
  await page.getByTestId('play-button').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.getByTestId('play-loading')).toHaveCount(0, { timeout: 60_000 });
}

/** A pad the page reads through navigator.getGamepads (`mapping` '' for a controller of its own layout). */
async function plugPad(page: Page, mapping: string, axes = [0, 0, 0, 0]) {
  await page.addInitScript(
    ([m, a]) => {
      const pad = {
        index: 0,
        id: 'E2E Controller',
        connected: true,
        mapping: m,
        timestamp: 1,
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
        axes: [...a],
      };
      (window as unknown as { __pad: typeof pad }).__pad = pad;
      Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
    },
    [mapping, axes] as const,
  );
  const button = (b: number, down: boolean) =>
    page.evaluate(
      ([i, d]) => {
        const pad = (window as unknown as { __pad: { buttons: { pressed: boolean }[]; timestamp: number } }).__pad;
        pad.buttons[i as number].pressed = d as boolean;
        pad.timestamp = performance.now();
      },
      [b, down],
    );
  const axis = (a: number, v: number) =>
    page.evaluate(
      ([i, value]) => {
        const pad = (window as unknown as { __pad: { axes: number[]; timestamp: number } }).__pad;
        pad.axes[i] = value;
        pad.timestamp = performance.now();
      },
      [a, v],
    );
  // each change held long enough for the slowest polling (the menus', 16 ms) to see it
  const hold = () => page.waitForTimeout(80);
  return { button: async (b: number, down: boolean) => (await button(b, down), await hold()), axis: async (a: number, v: number) => (await axis(a, v), await hold()) };
}

const PAD = { B0: 0, B1: 1, B2: 2, B3: 3, SELECT: 8, START: 9 };

test('in play: LIFT on Alt+PageUp/Down, the song offset on - and =, held keys act once, and leaving the window pauses', async ({ page }) => {
  const errors = trackErrors(page);
  await startWith(page, { lastKeyMode: '4K', hiSpeed: 4 });
  const id = await demoSong(page);
  await play(page);
  const toast = page.getByTestId('hud-toast');
  const menu = page.getByTestId('pause-menu');

  // LIFT left Shift (a scratch and the FX modes' side lanes): Shift+PageDown is SUDDEN+ now
  await page.keyboard.press('Alt+PageDown');
  await expect(toast).toHaveText('LIFT 2.5%');
  await page.keyboard.press('Shift+PageDown');
  await expect(toast).toHaveText('SUDDEN+ 2.5%');
  expect(await stored(page)).toMatchObject({ lift: 0.025, sudden: 0.025 });

  // the song's own offset: 1 ms, 5 with Shift (its own function), kept for the song
  await page.keyboard.press('Equal');
  await expect(toast).toHaveText('곡 오프셋 +1ms');
  await page.keyboard.press('Shift+Equal');
  await expect(toast).toHaveText('곡 오프셋 +6ms');
  await page.keyboard.press('Minus');
  await expect(toast).toHaveText('곡 오프셋 +5ms');
  expect((await stored(page)).songOffsets).toEqual({ [id]: 5 });

  // a held Home turns the covers off once (its repeats do nothing), a held Esc pauses once
  await page.keyboard.down('Home');
  await page.keyboard.down('Home');
  await page.keyboard.down('Home');
  await page.keyboard.up('Home');
  await expect(toast).toHaveText('커버 끔');
  expect((await stored(page)).coversOn).toBe(false);
  await page.keyboard.down('Escape');
  await page.keyboard.down('Escape');
  await page.keyboard.down('Escape');
  await page.keyboard.up('Escape');
  await expect(menu).toBeVisible();
  await page.waitForTimeout(300);
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  // the window losing the focus pauses, and so does the page being hidden
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(menu).toBeVisible();
  await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('song-list')).toBeVisible();

  // with the setting off, it plays on; the song's offset shows while it loads
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}');
    localStorage.setItem('grg.settings.v1', JSON.stringify({ ...s, pauseOnBlur: false }));
  });
  await page.reload();
  await page.getByTestId('song-item').filter({ hasText: SONG }).click();
  await page.route('**/api/songs/*/audio', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.getByTestId('play-button').click();
  await expect(page.getByTestId('loading-rules')).toContainText('곡 오프셋 +5ms', { timeout: 60_000 });
  await expect(page.getByTestId('play-loading')).toHaveCount(0, { timeout: 60_000 });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(500);
  await expect(menu).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a play that starts after the window was left during its loading starts paused', async ({ page }) => {
  const errors = trackErrors(page);
  await startWith(page, { lastKeyMode: '4K', hiSpeed: 4 });
  await demoSong(page);
  await page.route('**/api/songs/*/audio', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.getByTestId('play-button').click();
  await expect(page.getByTestId('play-loading')).toBeVisible();
  // the player switches to another window while it loads
  await page.evaluate(() => {
    document.hasFocus = () => false;
    window.dispatchEvent(new Event('blur'));
  });
  await expect(page.getByTestId('play-loading')).toHaveCount(0, { timeout: 60_000 });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const menu = page.getByTestId('pause-menu');
  await expect(menu).toBeVisible();
  await page.waitForTimeout(500);
  await expect(menu).toBeVisible();
  // back at the window, Esc plays on
  await page.evaluate(() => {
    document.hasFocus = () => true;
  });
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a practice run gives three seconds and READY before its first note, every loop', async ({ page }) => {
  const errors = trackErrors(page);
  await startWith(page, { lastKeyMode: '4K', hiSpeed: 4 });
  await demoSong(page);
  await page.keyboard.press('F5');
  await expect(page.getByTestId('chart-level')).toBeVisible({ timeout: 30_000 });
  await playOptions(page, 'rules');
  await page.getByTestId('autoplay-toggle').check();
  await page.getByTestId('practice-toggle').check();
  await page.keyboard.press('Escape');
  await play(page);
  const t0 = await page.evaluate(() => performance.now());
  await expect(page.getByTestId('hud-ready')).toHaveText('READY');
  // autoplay hits the first note on time: not before the lead-in is over
  await expect.poll(async () => Number((await page.locator('.hud-combo-num').textContent()) || 0), { timeout: 20_000 }).toBeGreaterThan(0);
  const t1 = await page.evaluate(() => performance.now());
  expect(t1 - t0).toBeGreaterThan(2500);
  await expect(page.getByTestId('hud-ready')).toHaveText('');
  // the next loop starts over with READY (written down as it happens: it shows under two seconds)
  await page.evaluate(() => {
    const log: string[] = [];
    (window as unknown as { __hud: string[] }).__hud = log;
    for (const id of ['hud-toast', 'hud-ready']) {
      const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
      new MutationObserver(() => log.push(`${id}:${el.textContent}`)).observe(el, { childList: true, characterData: true, subtree: true });
    }
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const log = (window as unknown as { __hud: string[] }).__hud;
          const at = log.findIndex((line) => line.includes('LOOP 2'));
          return at >= 0 && log.slice(at).includes('hud-ready:READY');
        }),
      { timeout: 60_000 },
    )
    .toBe(true);
  expect(errors).toEqual([]);
});

test('a pad in play: Start tapped pauses, Start + lane buttons step SPEED and SUDDEN+, Select + Start held retries', async ({ page }) => {
  const errors = trackErrors(page);
  const pad = await plugPad(page, 'standard');
  await startWith(page, { lastKeyMode: '4K', hiSpeed: 4, padBindings: { '4K': ['Pad:B0', 'Pad:B1', 'Pad:B2', 'Pad:B3'] } });
  await demoSong(page);
  await play(page);
  const toast = page.getByTestId('hud-toast');
  const menu = page.getByTestId('pause-menu');

  // Start held: lane button 2 is SPEED +, 4 SUDDEN+ +; no pause on the release
  await pad.button(PAD.START, true);
  await pad.button(PAD.B1, true);
  await expect(toast).toHaveText('SPEED 4.10');
  await pad.button(PAD.B1, false);
  await pad.button(PAD.B3, true);
  await expect(toast).toHaveText('SUDDEN+ 2.5%');
  await pad.button(PAD.B3, false);
  await pad.button(PAD.START, false);
  await page.waitForTimeout(300);
  await expect(menu).toHaveCount(0);
  expect(await stored(page)).toMatchObject({ hiSpeed: 4.1, sudden: 0.025 });

  // Start tapped alone pauses, and again resumes; Select alone (no Esc there) leaves the pause menu be
  await pad.button(PAD.START, true);
  await pad.button(PAD.START, false);
  await expect(menu).toBeVisible();
  await pad.button(PAD.SELECT, true);
  await pad.button(PAD.SELECT, false);
  await page.waitForTimeout(200);
  await expect(menu).toBeVisible();
  await pad.button(PAD.START, true);
  await pad.button(PAD.START, false);
  await expect(menu).toHaveCount(0);

  // Select + Start held for a second: the play starts over
  const seconds = async () => {
    const [m, s] = ((await page.getByTestId('hud-remaining').textContent()) ?? '0:00').split(':').map(Number);
    return m * 60 + s;
  };
  await page.waitForTimeout(2500);
  const before = await seconds();
  await pad.button(PAD.SELECT, true);
  await pad.button(PAD.START, true);
  await page.waitForTimeout(1300);
  await pad.button(PAD.START, false);
  await pad.button(PAD.SELECT, false);
  await expect.poll(seconds).toBeGreaterThan(before);
  await page.waitForTimeout(300);
  await expect(menu).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a controller without the standard mapping: no menu keys from its lanes or a turntable left past the middle; a turn steps once', async ({ page }) => {
  const errors = trackErrors(page);
  // the turntable's axis rests just under the middle
  const pad = await plugPad(page, '', [0.45, 0, 0, 0]);
  await startWith(page, { lastKeyMode: '7K+1S', padBindings: { '7K+1S': ['Pad:TT0', 'Pad:B0', 'Pad:B1', 'Pad:B2', 'Pad:B3', 'Pad:B4', 'Pad:B5', 'Pad:B6'] } });
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('opt-hi-speed')).toBeFocused();

  // turned a little past the middle: one row down (the inferred 아래), and stopped there nothing
  // repeats (a gamepad's stick held there would be an arrow key held)
  for (const v of [0.47, 0.49, 0.51, 0.53]) await pad.axis(0, v);
  await expect(page.getByTestId('opt-sudden')).toBeFocused();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId('opt-sudden')).toBeFocused();
  expect((await stored(page)).sudden ?? 0).toBe(0);
  // its buttons 9 and 8 (a gamepad's Start and Back) are no Enter or Esc; key 2 (button 1) is the inferred cancel
  await pad.button(PAD.START, true);
  await pad.button(PAD.START, false);
  await pad.button(PAD.SELECT, true);
  await pad.button(PAD.SELECT, false);
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  await pad.button(PAD.B1, true);
  await pad.button(PAD.B1, false);
  await expect(page.getByTestId('song-list')).toBeVisible();
  expect(errors).toEqual([]);
});

test('key settings: lanes bound in a run, a second key and its clearing, the rollover test with it, the in-play keys and their clashes', async ({ page }) => {
  const errors = trackErrors(page);
  await startWith(page, { lastKeyMode: '4K' });
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'keys');

  // 차례로 지정: one key a lane from the first, then it stops by itself
  await page.getByTestId('keys-run-4K').click();
  for (const key of ['KeyA', 'KeyS', 'KeyD', 'KeyF']) await page.keyboard.press(key);
  await expect(page.getByTestId('keys-4K').locator('.key-cap:not(.second)')).toHaveText(['A', 'S', 'D', 'F']);
  await expect(page.getByTestId('keys-run-4K')).toHaveText('차례로 지정');
  // a run of 5K, whose middle lane is Space: its release does not start the capture again
  await page.getByTestId('keys-run-5K').click();
  for (const key of ['KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK']) await page.keyboard.press(key);
  await expect(page.getByTestId('keys-5K').locator('.key-cap:not(.second)')).toHaveText(['D', 'F', 'Space', 'J', 'K']);
  await expect(page.getByTestId('keys-run-5K')).toHaveText('차례로 지정');
  expect((await stored(page)).bindings).toMatchObject({ '4K': ['KeyA', 'KeyS', 'KeyD', 'KeyF'] });

  // a second key for lane 1; a lane's only key is no other lane's second key; Backspace clears it
  await page.getByTestId('key2-4K-0').click();
  await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('key2-4K-0')).toHaveText('Q');
  expect((await stored(page)).secondBindings).toEqual({ '4K': ['KeyQ', null, null, null] });
  await page.getByTestId('key2-4K-1').click();
  await page.keyboard.press('KeyD');
  await expect(page.getByTestId('key2-4K-1')).toHaveText('…');
  await expect(page.getByTestId('settings-help')).toContainText('하나뿐인 키');
  // its own first key is named as such
  await page.keyboard.press('KeyS');
  await expect(page.getByTestId('settings-help')).toContainText('이 레인의 첫 키');
  await page.keyboard.press('Escape');
  // an empty slot is drawn empty (a dash is the Minus key's name)
  await expect(page.getByTestId('key2-4K-1')).toHaveText('');
  await expect(page.getByTestId('key2-4K-1')).toHaveClass(/empty/);
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  await page.getByTestId('key2-4K-0').click();
  await page.keyboard.press('Backspace');
  await expect(page.getByTestId('key2-4K-0')).toHaveText('');
  expect((await stored(page)).secondBindings).toEqual({});
  await page.getByTestId('key2-4K-0').click();
  await page.keyboard.press('KeyQ');

  // the rollover test counts the second key too; Esc closes it, not the settings
  await page.getByTestId('ghost-4K').click();
  for (const key of ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyQ']) await page.keyboard.down(key);
  await expect(page.getByTestId('ghost-result')).toContainText('5 / 5');
  for (const key of ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyQ']) await page.keyboard.up(key);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('ghost-test')).toHaveCount(0);
  await expect(page.getByTestId('settings-screen')).toBeVisible();

  // a lane on Enter is marked against FEVER and the skip; L-Shift lanes get the Windows note
  await page.getByTestId('key-4K-3').click();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('keys-clash-4K')).toContainText('Enter');
  await expect(page.getByTestId('play-key-fever')).toHaveClass(/clash/);
  await expect(page.getByTestId('play-key-clash-fever')).toContainText('4K');
  await expect(page.getByTestId('keys-note-7K+1S')).toContainText('고정 키');
  // the bigger SPEED and offset steps are on Shift: the 7K+1S scratch on L-Shift and both FX side lanes take them
  await expect(page.getByTestId('keys-clash-7K+1S')).toContainText('L-Shift SPEED −0.5·SPEED +0.5·곡 오프셋 −5ms·곡 오프셋 +5ms');
  await expect(page.getByTestId('keys-clash-7K+1S')).toContainText('R-Shift');
  await expect(page.getByTestId('keys-clash-6K+FX')).toContainText('L-Shift R-Shift SPEED −0.5');
  await expect(page.getByTestId('play-key-speedUpBig')).toHaveClass(/clash/);
  await expect(page.getByTestId('play-key-clash-speedUpBig')).toContainText('7K+1S');
  // moved off Shift, the scratch takes them no more (a binding may have Shift too)
  await page.getByTestId('play-key-speedUpBig').click();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(page.getByTestId('play-key-speedUpBig')).toHaveText('Alt+↑');
  await page.getByTestId('play-key-speedDownBig').click();
  await page.keyboard.press('Control+Shift+ArrowDown');
  await expect(page.getByTestId('play-key-speedDownBig')).toHaveText('Ctrl+Shift+↓');
  await expect(page.getByTestId('play-key-speedUpBig')).not.toHaveClass(/clash/);
  await expect(page.getByTestId('keys-clash-7K+1S')).toContainText('L-Shift SPEED −0.5·곡 오프셋 −5ms·곡 오프셋 +5ms');

  // in-play keys: with Alt, a modifier alone; two on one key are marked; 기본값 brings them back
  await page.getByTestId('play-key-retry').click();
  await page.keyboard.press('Alt+KeyR');
  await expect(page.getByTestId('play-key-retry')).toHaveText('Alt+R');
  await page.getByTestId('play-key-fever').click();
  await page.keyboard.press('ControlRight');
  await expect(page.getByTestId('play-key-fever')).toHaveText('R-Ctrl');
  await page.getByTestId('play-key-covers').click();
  await page.keyboard.press('Alt+KeyR');
  await expect(page.getByTestId('play-key-clash-covers')).toContainText('다시 하기');
  expect((await stored(page)).playKeys).toEqual({ speedUpBig: 'Alt+ArrowUp', speedDownBig: 'Ctrl+Shift+ArrowDown', retry: 'Alt+KeyR', fever: 'ControlRight', covers: 'Alt+KeyR' });
  await page.getByTestId('play-keys-default').click();
  expect((await stored(page)).playKeys).toEqual({});
  expect(errors).toEqual([]);
});

test('gamepad settings: the turntable, lanes bound in a run, the play buttons with a clash, a menu direction from a turn; pausing when the window is left', async ({ page }) => {
  const errors = trackErrors(page);
  const pad = await plugPad(page, 'standard');
  await startWith(page, { lastKeyMode: '4K' });
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'play');
  await chooseSetting(page, 'opt-pause-on-blur', 'false');
  await settingsTab(page, 'pad');
  await chooseSetting(page, 'opt-tt-steps', '2');
  await chooseSetting(page, 'opt-tt-release', '150');

  await page.getByTestId('pad-run-4K').click();
  for (const b of [PAD.B0, PAD.B1, PAD.B2, PAD.B3]) {
    await pad.button(b, true);
    await pad.button(b, false);
  }
  await expect(page.getByTestId('pad-run-4K')).toHaveText('차례로 지정');
  // Start on a lane's button: marked, the lane takes it
  await page.getByTestId('pad-play-start').click();
  await pad.button(PAD.B2, true);
  await pad.button(PAD.B2, false);
  await expect(page.getByTestId('pad-play-note-start')).toContainText('4K 레인과 겹침');
  await page.getByTestId('pad-play-fever').click();
  await pad.button(5, true);
  await pad.button(5, false);
  await expect(page.getByTestId('pad-play-fever')).toHaveText('버튼 5');
  // a menu direction from a turn of an axis one way, or a push of a d-pad that comes as an axis
  await page.getByTestId('pad-menu-up').click();
  await pad.axis(2, -0.05);
  await expect(page.getByTestId('pad-menu-up')).toHaveText('턴테이블 2 −');
  await page.getByTestId('pad-menu-down').click();
  await pad.axis(1, 1);
  await expect(page.getByTestId('pad-menu-down')).toHaveText('축 1+');
  await pad.axis(1, 0);
  expect(await stored(page)).toMatchObject({
    pauseOnBlur: false,
    turntableSteps: 2,
    turntableReleaseMs: 150,
    padBindings: { '4K': ['Pad:B0', 'Pad:B1', 'Pad:B2', 'Pad:B3'] },
    padPlay: { start: 'Pad:B2', fever: 'Pad:B5' },
    padMenu: { up: 'Pad:TT2-', down: 'Pad:A1+' },
  });
  await page.getByTestId('pad-play-default').click();
  expect((await stored(page)).padPlay).toEqual({});
  expect(errors).toEqual([]);
});

test('a controller in the gamepad settings: a run whose turntable keeps turning binds it once, and a d-pad on axes is a menu direction', async ({ page }) => {
  const errors = trackErrors(page);
  const pad = await plugPad(page, '', [0.4, 0, 0, 0]);
  await startWith(page, { lastKeyMode: '7K+1S' });
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'pad');

  // 차례로 지정: a quarter turn of the turntable spread over about 200 ms, one 8-bit step at a time
  // (past the middle of its axis on the way), then keys 1 to 7
  await page.getByTestId('pad-run-7K+1S').click();
  await page.evaluate(async () => {
    const p = (window as unknown as { __pad: { axes: number[]; timestamp: number } }).__pad;
    for (let i = 1; i <= 60; i++) {
      p.axes[0] = 0.4 + (i * 2) / 255;
      p.timestamp = performance.now();
      await new Promise((r) => setTimeout(r, 3));
    }
  });
  await page.waitForTimeout(300);
  for (let b = 0; b < 7; b++) {
    await pad.button(b, true);
    await pad.button(b, false);
  }
  await expect(page.getByTestId('pad-run-7K+1S')).toHaveText('차례로 지정');
  expect((await stored(page)).padBindings).toEqual({ '7K+1S': ['Pad:TT0', 'Pad:B0', 'Pad:B1', 'Pad:B2', 'Pad:B3', 'Pad:B4', 'Pad:B5', 'Pad:B6'] });

  // a d-pad that comes as an axis (a generic controller): its push is the direction, and a push is one step
  await page.getByTestId('pad-menu-up').click();
  await pad.axis(3, -1);
  await expect(page.getByTestId('pad-menu-up')).toHaveText('축 3-');
  await pad.axis(3, 0);
  await page.getByTestId('pad-menu-down').click();
  await pad.axis(3, 1);
  await expect(page.getByTestId('pad-menu-down')).toHaveText('축 3+');
  await pad.axis(3, 0);
  expect((await stored(page)).padMenu).toEqual({ up: 'Pad:A3-', down: 'Pad:A3+' });
  // where the arrow key takes the focus from 아래, one push of the d-pad takes it too, and no further
  await page.getByTestId('pad-menu-down').focus();
  await page.keyboard.press('ArrowDown');
  const next = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
  await page.getByTestId('pad-menu-down').focus();
  await pad.axis(3, 1);
  await pad.axis(3, 0);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe(next);
  expect(errors).toEqual([]);
});

