import { expect, test, type Page } from '@playwright/test';
import { pickDemoSong, serveChart } from './servedChart';
import { autoplay } from './songSelect';

/**
 * What a play tells the desktop app for its log (client/src/render/frameWatch.ts → desktop/preload.js →
 * graphics.log): the pulse of its frames going on, a stall once the frames go on again, and the page's
 * errors. The window is played by the test: what it is told is kept on the page.
 */
interface Told {
  pulses: { state: string; songMs?: number }[];
  lines: { type: string; canvas?: string; about: Record<string, string> }[];
}

async function asDesktop(page: Page) {
  await page.addInitScript(() => {
    const told: Told = { pulses: [], lines: [] };
    const shell = {
      setFullScreen: (on: boolean) => Promise.resolve(on),
      isFullScreen: () => Promise.resolve(false),
      onFullScreen: () => () => undefined,
      tellGraphics: (record: Told['lines'][number]) => void told.lines.push(record),
      pulse: (record: Told['pulses'][number]) => void told.pulses.push(record),
    };
    Object.assign(window, { grgDesktop: shell, grgTold: told });
  });
}

const told = (page: Page) => page.evaluate(() => (window as unknown as { grgTold: Told }).grgTold);

async function play(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('grg.settings.v1')) localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', hiSpeed: 4 }));
  });
  // notes from the second bar on: the play is running and its picture moves
  await serveChart(page, 4, 30);
  await pickDemoSong(page);
  await expect(page.getByTestId('chart-level')).toBeVisible({ timeout: 30_000 });
  await autoplay(page);
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.getByTestId('play-loading')).toHaveCount(0, { timeout: 60_000 });
}

test('a play sends its pulse while its frames come, says so when it is paused, and "off" when it is left', async ({ page }) => {
  await asDesktop(page);
  await play(page);
  await expect.poll(async () => (await told(page)).pulses.filter((p) => p.state === 'running').length, { timeout: 15_000 }).toBeGreaterThan(3);
  const running = (await told(page)).pulses.filter((p) => p.state === 'running');
  // about every half second, with the song's time going on
  expect(running.at(-1)!.songMs!).toBeGreaterThan(running[0].songMs!);
  // the frames drawn are counted where the app can ask for them (desktop/main.js's pageProbe)
  expect(await page.evaluate(() => (window as unknown as { __grgFrames?: number }).__grgFrames ?? 0)).toBeGreaterThan(10);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await told(page)).pulses.at(-1)?.state).toBe('paused');
  // out of the play from its pause: no pulse is owed any more
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('play-screen')).toHaveCount(0, { timeout: 10_000 });
  expect((await told(page)).pulses.at(-1)).toEqual({ state: 'off' });
  // nothing stood still and nothing was thrown
  expect((await told(page)).lines.filter((l) => l.type === 'page-error')).toEqual([]);
});

test('a play whose frames stood still tells of it once they go on: how long, and that the page’s own thread was busy', async ({ page }) => {
  await asDesktop(page);
  await play(page);
  // (well into the play: its first frames may be a stall of their own where the graphics are slow, and stalls
  // within two seconds of one told are counted with the next)
  await expect.poll(async () => (await told(page)).pulses.filter((p) => p.state === 'running').length, { timeout: 20_000 }).toBeGreaterThan(6);
  // the page's thread held for 0.7 s by something that is not the game's frame
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          const until = performance.now() + 700;
          while (performance.now() < until);
          resolve();
        }, 0);
      }),
  );
  await expect.poll(async () => (await told(page)).lines.filter((l) => l.type === 'page-stall' && Number(l.about.gapMs) >= 600).length, { timeout: 10_000 }).toBeGreaterThan(0);
  const stall = (await told(page)).lines.find((l) => l.type === 'page-stall' && Number(l.about.gapMs) >= 600)!;
  expect(stall, JSON.stringify((await told(page)).lines.map((l) => l.about))).toBeTruthy();
  expect(stall.canvas).toBe('play-canvas');
  expect(stall.about.state).toBe('running');
  // the frame before it worked no longer than usual; the page's thread was busy: its timer did not run in the
  // stall, or (held after a frame's time was set) that frame began late
  expect(Number(stall.about.workMs)).toBeLessThan(250);
  expect(Math.max(Number(stall.about.timerMs), Number(stall.about.lateMs))).toBeGreaterThan(500);
  expect(Number(stall.about.songMs)).toBeGreaterThan(0);
  // what the track was (its skin), and its frames before the stall
  expect(stall.about.style).toContain('flat');
  expect(stall.about.trailFrames).toMatch(/^n=\d+ med=[\d.]+ max=[\d.]+/);
  expect(Object.values(stall.about).every((v) => typeof v === 'string')).toBe(true);
});

test('the page’s errors are told once and counted: an uncaught one, a promise no one heard', async ({ page }) => {
  const thrown: string[] = [];
  page.on('pageerror', (e) => thrown.push(e.message));
  await asDesktop(page);
  await play(page);
  await page.evaluate(() => {
    for (let i = 0; i < 12; i++) setTimeout(() => {
      throw new TypeError('the test threw this');
    }, 0);
    void Promise.reject(new Error('and rejected this'));
  });
  await expect.poll(async () => (await told(page)).lines.filter((l) => l.type === 'page-error').length, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  const errors = (await told(page)).lines.filter((l) => l.type === 'page-error').map((l) => l.about);
  const first = errors.find((e) => e.where === 'window' && e.count === '1')!;
  expect(first.message).toBe('TypeError: the test threw this');
  expect(first.id).toBeTruthy();
  // twelve of them: told the first time, and again at the tenth with its count
  expect(errors.filter((e) => e.id === first.id).map((e) => e.count)).toEqual(['1', '10']);
  expect(errors.find((e) => e.where === 'promise')?.message).toBe('Error: and rejected this');
  expect(thrown.filter((m) => m.includes('the test threw this'))).toHaveLength(12);
  // the play went on through it
  await expect(page.getByTestId('play-screen')).toBeVisible();
  const before = (await told(page)).pulses.length;
  await expect.poll(async () => (await told(page)).pulses.length, { timeout: 5000 }).toBeGreaterThan(before);
});

test('a part of a frame that throws is told and counted, and the rest of the frame is drawn all the same', async ({ page }) => {
  await asDesktop(page);
  await play(page);
  await expect.poll(async () => (await told(page)).pulses.filter((p) => p.state === 'running').length, { timeout: 15_000 }).toBeGreaterThan(1);
  // the HUD's score cannot be written any more: every hit of the autoplay makes the HUD's part of the frame throw
  await page.evaluate(() => {
    const score = document.querySelector('.hud-num.hud-score')!;
    Object.defineProperty(score, 'textContent', {
      configurable: true,
      get: () => '0',
      set: () => {
        throw new Error('the score cannot be written');
      },
    });
  });
  await expect.poll(async () => (await told(page)).lines.filter((l) => l.type === 'page-error' && l.about.where === 'frame:hud').length, { timeout: 15_000 }).toBeGreaterThan(0);
  const error = (await told(page)).lines.find((l) => l.type === 'page-error' && l.about.where === 'frame:hud')!.about;
  expect(error).toMatchObject({ count: '1', message: 'Error: the score cannot be written' });
  expect(error.stack).toMatch(/Hud/i);
  // the track is drawn on (the song's time on its canvas goes on) and the play's pulse with it
  const canvas = page.locator('canvas[data-song-ms]').first();
  const drawn = Number(await canvas.getAttribute('data-song-ms'));
  await expect.poll(async () => Number(await canvas.getAttribute('data-song-ms')), { timeout: 10_000 }).toBeGreaterThan(drawn + 1500);
  expect((await told(page)).pulses.at(-1)!.state).toBe('running');
  // told once, however often it is thrown (its count comes at the tenth)
  expect((await told(page)).lines.filter((l) => l.type === 'page-error' && l.about.where === 'frame:hud' && l.about.count === '1')).toHaveLength(1);
});
