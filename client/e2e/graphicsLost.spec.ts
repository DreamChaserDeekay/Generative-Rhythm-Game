import { expect, test, type Page } from '@playwright/test';
import { tool } from './songSelect';

/**
 * How bright the screen is where the gear's deck lies and over its lanes (0 … 1), from a screenshot: after the
 * graphics process has come back the play's canvas cannot be read from within the page, though it is drawn.
 */
async function trackBrightness(page: Page): Promise<{ deck: number; lanes: number }> {
  const shot = (await page.screenshot()).toString('base64');
  return page.evaluate(async (png) => {
    const picture = await createImageBitmap(new Blob([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], { type: 'image/png' }));
    const small = document.createElement('canvas');
    [small.width, small.height] = [128, 72];
    const g = small.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
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

test('the track comes back whole after the graphics process is lost in play: the gear, its rails and its notes', async ({ playwright, browserName, launchOptions, baseURL }) => {
  // a browser of the test's own: its graphics process is killed, as a driver reset or a crash of it does
  const browser = await playwright[browserName].launch(launchOptions);
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

    await page.evaluate(() => {
      const canvas = document.querySelector('canvas.play-canvas') as HTMLCanvasElement;
      const seen = window as unknown as { __lost?: boolean; __restored?: boolean };
      canvas.addEventListener('webglcontextlost', () => (seen.__lost = true));
      canvas.addEventListener('webglcontextrestored', () => (seen.__restored = true));
    });
    const cdp = await browser.newBrowserCDPSession();
    await cdp.send('Browser.crashGpuProcess');
    const seen = (key: '__lost' | '__restored') => page.evaluate((k) => (window as unknown as Record<string, boolean | undefined>)[k] === true, key);
    await expect.poll(() => seen('__lost'), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => seen('__restored'), { timeout: 30_000 }).toBe(true);

    // the play went on meanwhile, and the track is drawn again as it was: not a black deck under bare lanes
    await expect.poll(async () => (await trackBrightness(page)).deck, { timeout: 10_000 }).toBeGreaterThan(before.deck * 0.75);
    const after = await trackBrightness(page);
    expect(after.lanes).toBeGreaterThan(before.lanes * 0.75);
    await expect(page.getByTestId('play-screen')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});
