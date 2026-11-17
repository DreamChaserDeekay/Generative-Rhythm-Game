import { expect, test, type Page } from '@playwright/test';
import { addFromMenu, tool } from './songSelect';

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
  // the sync test has no jacket on its song plate: the card's jacket flies toward the far end of the track instead, up the screen and small
  // (where it goes is left on it: the flight may be over before this reads it)
  await expect(page.locator('[data-testid="play-loading-leaving"] .loading-jacket')).toHaveAttribute('data-into', /^translate\(-?[\d.]+px, -[\d.]+px\) scale\(0\.06\)$/);
  // gone soon after (0.7 s; software rendering here runs its frames late)
  await expect(page.getByTestId('play-loading-leaving')).toHaveCount(0, { timeout: 3000 });

  // the end: the HUD's lamp, then the result whose stamp comes over from it
  await putHudLamp(page, 'perfect');
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 90_000 });
  const line = page.locator('.result-lamp-line');
  await expect(line).toHaveAttribute('data-flown', 'perfect');
  // (where it came from is left on it: the flight may be over before this reads it)
  await expect(line.locator('.lamp-text')).toHaveAttribute('data-stamp-from', /^translate\(-?[\d.]+px, -?[\d.]+px\) scale\([\d.]+\)$/);
  // flown once, from the lamp: the dev server's StrictMode runs the effect twice, and a second
  // flight measured mid-air would start where the stamp already is
  expect(await line.locator('.lamp-text').getAttribute('data-stamp-from')).not.toBe('translate(0px, 0px) scale(1)');
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

/** The demo song played on autoplay from a plain chart the test hands over (this machine has no GPU to make one). */
async function demoWithChart(page: Page) {
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', lastDifficulty: 'NORMAL' })));
  await page.goto('/');
  await addFromMenu(page, 'demo-button');
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 90_000 });
  const song = ((await (await page.request.get('/api/songs')).json()).songs as { id: string; title: string; durationMs: number }[])[0];
  await page.route(
    (url) => /^\/api\/songs\/[^/]+\/charts$/.test(url.pathname),
    async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      const body = JSON.parse(route.request().postData() ?? '{}');
      const notes = [] as { beat: number; t: number; lane: number; type: 'tap' }[];
      for (let b = 8; b < 168; b++) notes.push({ beat: b, t: (b * 60000) / 128, lane: b % 4, type: 'tap' });
      const meta = { chartId: 'c' + 'f'.repeat(19), audioHash: 'demo', title: song.title, artist: 'Generative Rhythm', keyMode: '4K', lanes: ['1', '2', '3', '4'], difficulty: body.difficulty ?? 'NORMAL', level: 3, songId: song.id, durationMs: song.durationMs, noteCount: notes.length, nps: { avg: 2, peak: 3, graph: [1, 2] }, rating: 3, generator: { version: 'e2e', analyzer: 'e2e', seed: 7, params: {} } };
      const chart = { formatVersion: 1, meta, timing: { offsetMs: 0, tempoMap: [{ beat: 0, bpm: 128 }], meter: [{ measure: 0, beatsPerMeasure: 4 }] }, notes, sections: [] };
      return route.fulfill({ json: body.brief ? { meta, cached: true } : { chart, cached: true } });
    },
  );
  await page.reload();
  await expect(page.getByTestId('chart-level')).toHaveText('3', { timeout: 60_000 });
}

test("the start card's jacket lands on the song plate's (a disc here: no cover), which takes over as it lands", async ({ page }) => {
  const errors = trackErrors(page);
  await demoWithChart(page);
  // the card's animations held the moment they start, to look at their end
  await page.evaluate(() => {
    const w = window as unknown as { __held?: Animation[] };
    const look = () => {
      // (once the jacket's own flight has started: the loading bar runs before)
      const card = document.querySelector('[data-testid="play-loading-leaving"]');
      const jacket = card?.querySelector('.loading-jacket');
      const anims = card && jacket && jacket.getAnimations().length > 0 ? card.getAnimations({ subtree: true }) : [];
      if (anims.length > 0) {
        for (const a of anims) a.pause();
        w.__held = anims;
      } else requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  await page.keyboard.press('Shift+Enter');
  await page.waitForFunction(() => (window as unknown as { __held?: Animation[] }).__held !== undefined, null, { timeout: 60_000 });
  const card = page.locator('[data-testid="play-loading-leaving"] .loading-jacket');
  await expect(card).toHaveAttribute('data-into-hud', '');
  // the plate's own is hidden while the card's is on its way
  const plate = page.locator('.hud .hud-jacket');
  await expect(plate).toHaveCSS('visibility', 'hidden');
  // at its end the card's jacket covers the plate's to the pixel
  const at = await page.evaluate(() => {
    for (const a of (window as unknown as { __held: Animation[] }).__held) a.currentTime = 699.9;
    const r = (sel: string) => {
      const b = document.querySelector(sel)!.getBoundingClientRect();
      return [b.left, b.top, b.width, b.height];
    };
    return { card: r('[data-testid="play-loading-leaving"] .loading-jacket'), plate: r('.hud .hud-jacket') };
  });
  for (let i = 0; i < 4; i++) expect(Math.abs(at.card[i] - at.plate[i])).toBeLessThan(1.5);
  // landed: the plate's own shows, the card is gone
  await page.evaluate(() => {
    for (const a of (window as unknown as { __held: Animation[] }).__held) a.play();
  });
  await expect(page.getByTestId('play-loading-leaving')).toHaveCount(0, { timeout: 3000 });
  await expect(plate).toHaveCSS('visibility', 'visible');
  expect(errors).toEqual([]);
});
