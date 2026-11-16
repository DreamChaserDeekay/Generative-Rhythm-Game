import { expect, test, type Browser, type BrowserType, type LaunchOptions, type Page } from '@playwright/test';
import { pickDemoSong } from './servedChart';
import { tool } from './songSelect';

/**
 * The two ways a browser draws the page. With a graphics card (here one made of software, ANGLE on
 * SwiftShader, which the tests' browser is started with), as a PC does with its own. Or all in software:
 * where no card can be used, and from the third loss of the graphics process on. Which canvases the
 * browser wipes when that process goes is not the same in the two (src/render/paintCanvas.ts).
 */
const MODES = [
  { name: 'the page drawn by the graphics card', software: false },
  { name: 'the page drawn in software', software: true },
] as const;

/**
 * A browser of the test's own (its graphics process is killed), drawing the page in one of the two ways.
 * As the desktop app, it gives a page its WebGL context back after every loss (left to itself Chromium
 * gives none back after a second loss within a few seconds, see desktop/main.js).
 */
async function launch(type: BrowserType, options: LaunchOptions, software: boolean): Promise<Browser> {
  const args = [...(options.args ?? []).filter((arg) => !software || !arg.startsWith('--use-angle')), '--disable-domain-blocking-for-3d-apis'];
  const browser = await type.launch({ ...options, args });
  const cdp = await browser.newBrowserCDPSession();
  const { gpu } = (await cdp.send('SystemInfo.getInfo')) as { gpu: { featureStatus: Record<string, string> } };
  if (software) expect(gpu.featureStatus.gpu_compositing).toContain('software');
  else expect(gpu.featureStatus.gpu_compositing).toBe('enabled');
  return browser;
}

/**
 * Kills the browser's graphics process, as a driver reset or a crash of it does, and waits until the
 * WebGL context of `canvas` (a selector) was lost and given back.
 */
async function loseGraphics(browser: Browser, page: Page, canvas: string) {
  await page.evaluate((selector) => {
    const seen = window as unknown as { __lost?: boolean; __restored?: boolean };
    [seen.__lost, seen.__restored] = [false, false];
    const target = document.querySelector(selector) as HTMLCanvasElement;
    target.addEventListener('webglcontextlost', () => (seen.__lost = true), { once: true });
    target.addEventListener('webglcontextrestored', () => (seen.__restored = true), { once: true });
  }, canvas);
  const cdp = await browser.newBrowserCDPSession();
  await cdp.send('Browser.crashGpuProcess');
  const seen = (key: '__lost' | '__restored') => page.evaluate((k) => (window as unknown as Record<string, boolean | undefined>)[k] === true, key);
  await expect.poll(() => seen('__lost'), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => seen('__restored'), { timeout: 30_000 }).toBe(true);
}

/**
 * How bright the screen is where the gear's deck lies and over its lanes (0 … 1), from a screenshot: after the
 * graphics process has come back the play's canvas cannot be read from within the page, though it is drawn.
 */
async function trackBrightness(page: Page): Promise<{ deck: number; lanes: number }> {
  const shot = (await page.screenshot()).toString('base64');
  return page.evaluate(async (png) => {
    const picture = await createImageBitmap(new Blob([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], { type: 'image/png' }));
    const small = new OffscreenCanvas(128, 72);
    const g = small.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
    g.drawImage(picture, 0, 0, 128, 72);
    picture.close();
    const mean = (x0: number, y0: number, x1: number, y1: number) => {
      const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += Math.max(d[i], d[i + 1], d[i + 2]) / 255;
      return sum / (d.length / 4);
    };
    return { deck: mean(38, 52, 90, 70), lanes: mean(47, 15, 81, 43) };
  }, shot);
}

/** How much of each canvas of the page matching `selector` is painted (0 … 1: the share of its pixels that are not clear). */
function painted(page: Page, selector: string): Promise<number[]> {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll<HTMLCanvasElement>(sel)].map((canvas) => {
      // copied onto a canvas off the page: reading must not make the canvas itself another kind
      const copy = new OffscreenCanvas(Math.max(1, canvas.width), Math.max(1, canvas.height));
      const g = copy.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
      if (canvas.width > 0 && canvas.height > 0) g.drawImage(canvas, 0, 0);
      const d = g.getImageData(0, 0, copy.width, copy.height).data;
      let filled = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) filled += 1;
      return filled / (d.length / 4);
    });
  }, selector);
}

for (const mode of MODES) {
  test(`the track comes back whole after the graphics process is lost in play: the gear, its rails and its notes (${mode.name})`, async ({ playwright, browserName, launchOptions, baseURL }) => {
    const browser = await launch(playwright[browserName], launchOptions, mode.software);
    try {
      const page = await browser.newPage({ baseURL, viewport: { width: 1280, height: 720 } });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      // the sky gear: its deck is a painting, its rails, lanes and notes are all painted on canvases
      await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', hiSpeed: 4, parts: { note: 'sky', side: 'bar', deck: 'sky', hit: 'sky' } })));
      await page.goto('/');
      await tool(page, 'sync-auto');
      await expect(page.getByTestId('play-screen')).toBeVisible();
      // the play runs and the deck's picture is laid
      await expect.poll(async () => Number((await page.locator('.hud-combo-num').textContent()) || 0), { timeout: 30_000 }).toBeGreaterThan(3);
      await expect.poll(async () => (await trackBrightness(page)).deck, { timeout: 10_000 }).toBeGreaterThan(0.4);
      const before = await trackBrightness(page);

      await loseGraphics(browser, page, 'canvas.play-canvas');

      // the play went on meanwhile, and the track is drawn again as it was: not a black deck under bare lanes
      await expect.poll(async () => (await trackBrightness(page)).deck, { timeout: 10_000 }).toBeGreaterThan(before.deck * 0.75);
      const after = await trackBrightness(page);
      expect(after.lanes).toBeGreaterThan(before.lanes * 0.75);
      await expect(page.getByTestId('play-screen')).toBeVisible();

      // and a second loss a few seconds after the first is got over as well
      await loseGraphics(browser, page, 'canvas.play-canvas');
      await expect.poll(async () => (await trackBrightness(page)).deck, { timeout: 10_000 }).toBeGreaterThan(before.deck * 0.75);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  });

  test(`the menus’ pictures come back after the graphics process is lost: a song’s disc and the wash behind the list (${mode.name})`, async ({ playwright, browserName, launchOptions, baseURL }) => {
    const browser = await launch(playwright[browserName], launchOptions, mode.software);
    try {
      const page = await browser.newPage({ baseURL, viewport: { width: 1280, height: 720 } });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('/');
      // a song with no cover of its own: its disc is painted on canvases, and so is the wash of its colour behind the list
      await pickDemoSong(page);
      const discs = 'canvas.song-art';
      const wash = '.backdrop canvas';
      await expect.poll(async () => (await painted(page, discs)).length).toBeGreaterThan(0);
      await expect.poll(async () => Math.min(...(await painted(page, discs)), ...(await painted(page, wash)))).toBeGreaterThan(0.9);
      const count = (await painted(page, discs)).length;

      // (the menus have no WebGL canvas of their own: one is put in the page to see the loss by)
      await page.evaluate(() => {
        const probe = document.createElement('canvas');
        probe.id = 'graphics-probe';
        probe.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0';
        probe.getContext('webgl2');
        probe.addEventListener('webglcontextlost', (e) => e.preventDefault());
        document.body.appendChild(probe);
      });
      await loseGraphics(browser, page, '#graphics-probe');

      // every disc and the wash are painted, as before: kept, or painted again once handed back empty
      await expect
        .poll(
          async () => {
            const all = [...(await painted(page, discs)), ...(await painted(page, wash))];
            return all.length === count + 1 ? Math.min(...all) : 0;
          },
          { timeout: 15_000 },
        )
        .toBeGreaterThan(0.9);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  });
}
