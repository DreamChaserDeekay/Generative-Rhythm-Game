import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { autoplay, escWhenLoaded, songInfo, tool } from './songSelect';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const isChartPost = (method: string, url: string) => method === 'POST' && new URL(url).pathname.endsWith('/charts');
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}') as Record<string, unknown>);
/** The result has shown itself (its reveal's time is up): its keys act from now on. */
const settled = (page: Page) => expect(page.getByTestId('result-screen')).toHaveAttribute('data-settled', 'true', { timeout: 60_000 });

/**
 * A pad the page reads through navigator.getGamepads (`__pad` in the page): a standard-mapping one,
 * or (mapping '') a controller of its own layout. Returns a press of a button, held long enough for
 * the menus' 16 ms polling to see it.
 */
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
  return async (button: number) => {
    for (const down of [true, false]) {
      await page.evaluate(
        ([b, d]) => {
          const pad = (window as unknown as { __pad: { buttons: { pressed: boolean }[]; timestamp: number } }).__pad;
          pad.buttons[b as number].pressed = d as boolean;
          pad.timestamp = performance.now();
        },
        [button, down],
      );
      await page.waitForTimeout(80);
    }
  };
}

test('on the result Enter continues, R plays the same lane order again and Shift+R a new one; a held Enter starts nothing more', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', placement: 'RANDOM' })));
  await page.goto('/');
  await tool(page, 'sync-auto');
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
  // autoplay earns no lamp
  await expect(page.getByTestId('result-lamp')).toHaveText('AUTO');
  await expect(page.getByTestId('result-lamp')).toHaveClass(/aided/);
  await expect(page.getByTestId('result-back')).toBeFocused();
  // a random placement offers both retries
  await expect(page.locator('.hintbar')).toContainText('같은 배치로 다시');
  await expect(page.locator('.hintbar')).toContainText('새 배치로 다시');
  const placed = page.getByTestId('result-placement');
  const seed = await placed.getAttribute('data-seed');
  const order = await placed.textContent();

  // R acts at once, even as the result shows itself: the same lane order
  await page.keyboard.press('KeyR');
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
  await expect(placed).toHaveAttribute('data-seed', seed!);
  await expect(placed).toHaveText(order!);
  // Shift+R draws another
  await page.keyboard.press('Shift+KeyR');
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
  expect(await placed.getAttribute('data-seed')).not.toBe(seed);
  await settled(page);

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
  // on DJMAX, not the default GRG (the system a request falls back to)
  await page.addInitScript(() => {
    if (!localStorage.getItem('grg.settings.v1')) localStorage.setItem('grg.settings.v1', JSON.stringify({ difficultySystem: 'DJMAX' }));
  });
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

  // the new pattern is kept as the difficulty's, as F5 on the song select keeps one
  await expect(page.getByTestId('song-list')).toBeVisible();
  await expect(page.locator('.difficulty.active')).toContainText('새 패턴');

  // leaving while it is generating: the late pattern does not start a song (the Esc once the result
  // takes keys: in its first moments it holds Esc off, and the late pattern would play)
  await playToResult();
  await settled(page);
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

test('as the result shows itself, Enter, Space, Esc, the arrows, Tab and the lane keys only show it all; then Enter goes on', async ({ page }) => {
  const errors = trackErrors(page);
  // R is a lane's key here: pressed out of habit, it does not play again either
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', bindings: { '4K': ['KeyD', 'KeyF', 'KeyJ', 'KeyR'] } })));
  await page.goto('/');
  await tool(page, 'sync-auto');
  await expect(page.getByTestId('play-screen')).toBeVisible();
  // the keys come just after the result is there, to the focused button, as the pad's A and B send
  // theirs (a key the screen leaves alone presses the button); which ones the screen took is kept
  await page.evaluate(() => {
    const taken: string[] = [];
    (window as unknown as { __taken: string[] }).__taken = taken;
    const watch = new MutationObserver(() => {
      if (!document.querySelector('[data-testid="result-screen"]')) return;
      watch.disconnect();
      setTimeout(() => {
        for (const code of ['Enter', 'Space', 'Escape', 'ArrowDown', 'Tab', 'KeyR', 'Enter']) {
          const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
          const unhandled = target.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }));
          if (!unhandled) taken.push(code);
          else if (code === 'Enter') target.click();
          target.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true, cancelable: true }));
        }
      }, 150);
    });
    watch.observe(document.body, { childList: true, subtree: true });
  });
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
  await settled(page);
  await page.waitForTimeout(500);
  // the menu keys reached the screen, which kept them from the button (and the menu bridge)
  expect(await page.evaluate(() => (window as unknown as { __taken: string[] }).__taken)).toEqual(['Enter', 'Space', 'Escape', 'ArrowDown', 'Tab', 'KeyR', 'Enter']);
  await expect(page.getByTestId('result-screen')).toBeVisible();
  await expect(page.getByTestId('result-details-panel')).toHaveCount(0);
  await expect(page.getByTestId('play-screen')).toHaveCount(0);
  // the main key is named at the end: Enter goes back (Esc too, not named twice)
  await expect(page.getByTestId('hint-back')).toHaveText(/Enter.*선곡으로/);
  await expect(page.locator('.hintbar')).not.toContainText('Esc');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('song-list')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a pad whose lanes are its d-pad and Y: pressed as the result shows, even held on past it, they move nothing; then A goes on', async ({ page }) => {
  const errors = trackErrors(page);
  // a standard pad played 4K on ← ↑ ↓ and Y: in the menus they are arrows and Tab, which move the focus
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', padBindings: { '4K': ['Pad:B14', 'Pad:B12', 'Pad:B13', 'Pad:B3'] } })));
  const press = await plugPad(page);
  await page.goto('/');
  await tool(page, 'sync-auto');
  await expect(page.getByTestId('play-screen')).toBeVisible();
  // from the moment the result is there: ↓ and Y tapped, ← held on past the reveal (the bridge
  // repeats it from 400 ms on); where the focus is after each is kept
  await page.evaluate(() => {
    const focus: (string | null)[] = [];
    (window as unknown as { __focus: typeof focus }).__focus = focus;
    const pad = (window as unknown as { __pad: { buttons: { pressed: boolean }[]; timestamp: number } }).__pad;
    const set = (buttons: number[], down: boolean) => {
      for (const b of buttons) pad.buttons[b].pressed = down;
      pad.timestamp = performance.now();
    };
    const steps: [number, () => void][] = [
      [80, () => set([13, 14], true)],
      [160, () => set([13], false)],
      [200, () => set([3], true)],
      [280, () => set([3], false)],
      [1500, () => set([14], false)],
    ];
    const watch = new MutationObserver(() => {
      if (!document.querySelector('[data-testid="result-screen"]')) return;
      watch.disconnect();
      for (const [at, step] of steps) {
        setTimeout(() => {
          step();
          setTimeout(() => focus.push(document.activeElement?.getAttribute('data-testid') ?? null), 60);
        }, at);
      }
    });
    watch.observe(document.body, { childList: true, subtree: true });
  });
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
  await settled(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __focus: unknown[] }).__focus.length)).toBe(5);
  expect(await page.evaluate(() => (window as unknown as { __focus: unknown[] }).__focus)).toEqual(new Array(5).fill('result-back'));
  await expect(page.getByTestId('result-back')).toBeFocused();
  // A presses the focused button: to the song select (not a retry)
  await press(0);
  await expect(page.getByTestId('song-list')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('play-screen')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a pad's X plays again on the same lane order; where X is a lane, held on from the play or pressed as the result shows, it only shows it all", async ({ page }) => {
  const errors = trackErrors(page);
  // a standard pad played 4K on ← ↑ ↓ and X, on RANDOM: X, the result's 다시 하기, is a lane's button too
  await page.addInitScript(() =>
    localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', placement: 'RANDOM', padBindings: { '4K': ['Pad:B14', 'Pad:B12', 'Pad:B13', 'Pad:B2'] } })),
  );
  const press = await plugPad(page);
  await page.goto('/');
  await tool(page, 'sync-auto');
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.getByTestId('play-loading')).toHaveCount(0, { timeout: 60_000 });
  // X held down in the play, let go once the result is there and tapped again in its first 600 ms;
  // how the result is after that is kept
  await page.evaluate(() => {
    const w = window as unknown as { __pad: { buttons: { pressed: boolean }[]; timestamp: number }; __shownAt: number; __after: unknown };
    const setX = (down: boolean) => {
      w.__pad.buttons[2].pressed = down;
      w.__pad.timestamp = performance.now();
    };
    setX(true);
    const watch = new MutationObserver(() => {
      const result = document.querySelector('[data-testid="result-screen"]');
      if (!result) return;
      watch.disconnect();
      w.__shownAt = performance.now();
      setTimeout(() => setX(false), 100);
      setTimeout(() => setX(true), 200);
      setTimeout(() => setX(false), 350);
      setTimeout(() => {
        w.__after = { settled: result.getAttribute('data-settled'), shown: result.isConnected, playing: document.querySelector('[data-testid="play-screen"]') !== null };
      }, 500);
    });
    watch.observe(document.body, { childList: true, subtree: true });
  });
  // the tap reached the result before its reveal was over (it showed it all) and played nothing
  await expect.poll(() => page.evaluate(() => (window as unknown as { __after?: unknown }).__after ?? null), { timeout: 60_000 }).not.toBeNull();
  expect(await page.evaluate(() => (window as unknown as { __after: unknown }).__after)).toEqual({ settled: 'true', shown: true, playing: false });
  await expect(page.getByTestId('result-screen')).toBeVisible();
  // the pad works the menus: the hint and the buttons name its X and A
  await expect(page.getByTestId('hint-retry')).toHaveText(/X\s*같은 배치로 다시/);
  await expect(page.getByTestId('result-retry')).toHaveText('같은 배치로 다시 X');
  await expect(page.getByTestId('result-back')).toHaveText('선곡으로 A');

  // past those 600 ms X plays again, on the lane order just played
  await page.waitForFunction(() => performance.now() > (window as unknown as { __shownAt: number }).__shownAt + 700);
  await expect(page.getByTestId('play-screen')).toHaveCount(0);
  const placed = page.getByTestId('result-placement');
  const seed = await placed.getAttribute('data-seed');
  const order = await placed.textContent();
  await press(2);
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
  await expect(placed).toHaveAttribute('data-seed', seed!);
  await expect(placed).toHaveText(order!);
  expect(errors).toEqual([]);
});

test("a controller's own 다시 하기 button plays again from the result, whose hints name the keyboard's keys its buttons send", async ({ page }) => {
  const errors = trackErrors(page);
  // a controller of its own layout played 4K on buttons 0–3 (the menus' 결정, 취소, 왼쪽, 오른쪽 come
  // from them), its 다시 하기 assigned in 게임패드 to button 9
  await page.addInitScript(() =>
    localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', padBindings: { '4K': ['Pad:B0', 'Pad:B1', 'Pad:B2', 'Pad:B3'] }, padMenu: { retry: 'Pad:B9' } })),
  );
  const press = await plugPad(page, '');
  await page.goto('/');
  await tool(page, 'sync-auto');
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
  await settled(page);
  // 오른쪽 moves the focus to 다시 하기; the hint and the button name R, the key the controller sends
  await press(3);
  await expect(page.getByTestId('result-retry')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.dataset.input)).toBe('controller');
  await expect(page.getByTestId('hint-retry')).toHaveText(/R\s*다시 하기/);
  await expect(page.getByTestId('result-retry')).toHaveText('다시 하기 R');
  await press(9);
  await expect(page.getByTestId('play-screen')).toBeVisible();
  expect(errors).toEqual([]);
});

const LATE_SONG = 'Demo Groove 136';
const LANE_KEYS = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'];

/** Where every buffer source starts on its context's clock: the song's start is its song time 0. */
async function watchSources(page: Page) {
  await page.addInitScript(() => {
    const starts: { when: number; offset: number; length: number; ctx: BaseAudioContext }[] = [];
    (window as unknown as { __starts: typeof starts }).__starts = starts;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, when = 0, offset = 0, duration?: number) {
      starts.push({ when, offset, length: this.buffer?.duration ?? 0, ctx: this.context });
      return duration === undefined ? start.call(this, when, offset) : start.call(this, when, offset, duration);
    };
  });
}

/**
 * Plays the chart on the keyboard, every note `lateMs` after its time: the keys are sent in the
 * page, on the song's clock as the game reads it (its audio output time).
 */
async function playLate(page: Page, notes: { t: number; lane: number; type: string; endT?: number }[], lateMs: number) {
  const before = await page.evaluate(() => (window as unknown as { __starts: unknown[] }).__starts.length);
  await page.getByTestId('play-button').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.getByTestId('play-loading')).toHaveCount(0, { timeout: 60_000 });
  await page.evaluate(
    ({ notes, keys, lateMs, before }) =>
      new Promise<void>((resolve) => {
        type Start = { when: number; offset: number; length: number; ctx: AudioContext };
        const song = (window as unknown as { __starts: Start[] }).__starts.slice(before).filter((s) => s.length > 5).pop() as Start;
        const zero = (song.when - song.offset) * 1000;
        // the context's time heard now, less the performance clock's (as the game's clock measures it)
        const offset = () => {
          const ts = song.ctx.getOutputTimestamp();
          if (ts.contextTime && ts.performanceTime) return ts.contextTime * 1000 - ts.performanceTime;
          return (song.ctx.currentTime - (song.ctx.outputLatency || song.ctx.baseLatency || 0)) * 1000 - performance.now();
        };
        const events = notes.flatMap((n) => [
          { t: n.t + lateMs, code: keys[n.lane], down: true },
          { t: (n.type === 'hold' && n.endT ? n.endT : n.t + 40) + lateMs, code: keys[n.lane], down: false },
        ]);
        events.sort((a, b) => a.t - b.t || Number(a.down) - Number(b.down));
        let i = 0;
        const next = () => {
          if (i >= events.length) return resolve();
          const e = events[i];
          const at = zero + e.t - offset();
          if (at - performance.now() > 6) return void setTimeout(next, at - performance.now() - 4);
          while (performance.now() < at);
          window.dispatchEvent(new KeyboardEvent(e.down ? 'keydown' : 'keyup', { code: e.code, key: e.code, bubbles: true, cancelable: true }));
          i++;
          next();
        };
        next();
      }),
    { notes, keys: LANE_KEYS, lateMs, before },
  );
}

test('the offset fix of a late play: the song offset changed in play counted, once, to all songs or to this one, undone, kept from the replay', async ({ page }) => {
  const errors = trackErrors(page);
  await watchSources(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem('grg.settings.v1')) localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', difficultySystem: 'DJMAX', lastDifficulty: 'NM' }));
  });
  const find = async () => ((await (await page.request.get('/api/songs')).json()).songs as { id: string; title: string; status: string }[]).find((s) => s.title === LATE_SONG);
  expect((await page.request.post('/api/songs/demo', { data: { bpm: 136, bars: 8, seed: 3 } })).ok()).toBe(true);
  await expect.poll(async () => (await find())?.status, { timeout: 60_000 }).toBe('ready');
  const id = (await find())!.id;
  await page.goto('/');
  // the chart the song select gets for NM, to press along with
  const chart = page.waitForResponse(async (r) => isChartPost(r.request().method(), r.url()) && !JSON.parse(r.request().postData() ?? '{}').brief && (await r.json()).chart?.meta.difficulty === 'NM');
  await page.getByTestId('song-item').filter({ hasText: LATE_SONG }).click();
  const notes = (await (await chart).json()).chart.notes;
  await expect(page.getByTestId('chart-level')).toBeVisible({ timeout: 30_000 });

  await playLate(page, notes, 30);
  // the song's own offset 10 ms up (Shift+= twice) after the last note: every hit was judged on the old one
  await page.keyboard.press('Shift+Equal');
  await page.keyboard.press('Shift+Equal');
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
  await settled(page);
  // a first record: the tag beside the headline, the line under it that it was kept
  await expect(page.getByTestId('record-tag')).toHaveText('첫 기록');
  await expect(page.getByTestId('save-state')).toHaveText('기록 저장됨');
  // the notes as the song select counts them, and the long notes' ends the judgements count too
  const holds = notes.filter((n: { type: string }) => n.type === 'hold').length;
  await expect(page.getByTestId('result-notes')).toContainText(holds > 0 ? `${notes.length} + 롱노트 끝 ${holds}` : String(notes.length));

  await page.keyboard.press('Space');
  const suggestion = page.getByTestId('offset-suggestion');
  await expect(suggestion).toBeVisible();
  // as judged the hits were about 30 ms late; the offsets at the end judge them 10 ms less so
  const median = Number(/중앙값 \+?([\d.]+)ms/.exec((await page.locator('.error-stats').textContent()) ?? '')?.[1]);
  expect(median).toBeGreaterThanOrEqual(20);
  expect(median).toBeLessThanOrEqual(45);
  const late = Number(await suggestion.getAttribute('data-error-ms'));
  expect(Math.abs(late - (median - 10))).toBeLessThanOrEqual(4);
  await expect(suggestion).toContainText(`${late}ms 늦게`);
  await expect(suggestion).toContainText('플레이 중에 바꾼 곡 오프셋도 반영했습니다');
  await expect(page.getByTestId('offset-apply-text')).toHaveText(`판정 오프셋 0ms → +${late}ms`);
  await expect(page.getByTestId('offset-apply-song-text')).toHaveText(`곡 오프셋 +10ms → +${late + 10}ms`);

  // to all songs: the line says so, both buttons are off, and Enter is the song select's again
  await page.getByTestId('offset-apply').click();
  expect((await stored(page)).inputOffsetMs).toBe(late);
  await expect(page.getByTestId('offset-apply-text')).toHaveText(`판정 오프셋 0ms → +${late}ms 적용됨`);
  await expect(page.getByTestId('offset-apply')).toBeDisabled();
  await expect(page.getByTestId('offset-apply-song')).toBeDisabled();
  await expect(page.getByTestId('result-back')).toBeFocused();
  // undone, then to this song alone
  await page.getByTestId('offset-undo').click();
  expect((await stored(page)).inputOffsetMs).toBe(0);
  await expect(page.getByTestId('offset-apply')).toBeEnabled();
  await page.getByTestId('offset-apply-song').click();
  expect((await stored(page)).songOffsets).toEqual({ [id]: late + 10 });
  await expect(page.getByTestId('offset-apply-song-text')).toHaveText(`곡 오프셋 +10ms → +${late + 10}ms 적용됨`);
  await expect(page.getByTestId('offset-apply')).toBeDisabled();

  // F7 hands the replay over as a file and says so; it names the offsets it was played on (at its end)
  const download = page.waitForEvent('download');
  await page.keyboard.press('F7');
  await expect(page.getByTestId('replay-exported')).toBeVisible();
  const file = JSON.parse(readFileSync(await (await download).path(), 'utf8'));
  expect([file.settings.inputOffsetMs, file.settings.songOffsetMs]).toEqual([0, 10]);

  // Enter leaves, the offsets as they were set (not once more)
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('song-list')).toBeVisible();
  const after = await stored(page);
  expect([after.inputOffsetMs, after.songOffsets]).toEqual([0, { [id]: late + 10 }]);
  const record = (await (await page.request.get(`/api/songs/${id}/scores`)).json()).records[0];
  expect(record.byMode.NORMAL.plays).toBe(1);
  const kept = await (await page.request.get(`/api/scores/${record.bestScoreId}/replay`)).json();
  expect([kept.settings.inputOffsetMs, kept.settings.songOffsetMs]).toEqual([0, 10]);

  // its replay's result offers no fix: it names the offsets it was played on
  await expect(page.getByTestId('chart-level')).toBeVisible({ timeout: 30_000 });
  await songInfo(page);
  await page.getByTestId('watch-best').click();
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 90_000 });
  await settled(page);
  await page.keyboard.press('Space');
  await expect(page.locator('.error-stats')).toContainText('녹화 때 판정 오프셋 0ms · 곡 오프셋 +10ms');
  await expect(page.getByTestId('offset-suggestion')).toHaveCount(0);
  expect(errors).toEqual([]);
});
