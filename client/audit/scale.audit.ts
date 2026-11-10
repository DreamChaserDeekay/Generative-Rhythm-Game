import { expect, test } from '@playwright/test';
import { defaultSettings, ensureDemoSong, installAudit, openRoot, writeData } from './lib';
import { fakeSongList } from './states';

/**
 * The menus at scale: a library of 500 songs (the list's size on the page, how long a step of the
 * cursor takes, how many presses reach a song in the middle, what a search costs) and twenty note
 * colour presets (how many presses reach the last).
 */

test('500 songs and 20 presets', async ({ page }) => {
  await installAudit(page);
  await page.goto('/');
  await ensureDemoSong(page);
  const base = await defaultSettings(page);
  const out: Record<string, unknown> = {};

  for (const n of [1, 100, 500]) {
    await openRoot(page, 'lib', base);
    const songs = fakeSongList(n);
    await page.route(/^https?:\/\/[^/]+\/api\/songs$/, (route) => route.fulfill({ json: { songs } }));
    const t0 = Date.now();
    await page.reload();
    await expect(page.locator('[data-testid="song-item"]').first()).toBeVisible({ timeout: 30_000 });
    const shownMs = Date.now() - t0;
    await page.waitForTimeout(500);
    const dom = await page.evaluate(() => ({ nodes: document.querySelectorAll('*').length, rows: document.querySelectorAll('[data-testid="song-item"]').length }));
    // a step of the cursor: from the key to the next frame after the row is marked
    const stepMs = await page.evaluate(async () => {
      const times: number[] = [];
      for (let i = 0; i < 30; i++) {
        const t = performance.now();
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', key: 'ArrowDown', bubbles: true, cancelable: true }));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        times.push(performance.now() - t);
      }
      times.sort((a, b) => a - b);
      return { median: Math.round(times[15] * 10) / 10, p95: Math.round(times[28] * 10) / 10 };
    });
    // the song in the middle of the list from its top: page keys, then arrows
    await page.keyboard.press('Home');
    const target = Math.floor(n / 2);
    const index = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="song-item"]')].findIndex((el) => el.classList.contains('active')));
    let presses = 0;
    let pageRows = 0;
    if (n > 1) {
      await page.keyboard.press('PageDown');
      pageRows = await index();
      await page.keyboard.press('Home');
      while ((await index()) + pageRows <= target && presses < 200) {
        await page.keyboard.press('PageDown');
        presses++;
      }
      while ((await index()) < target && presses < 400) {
        await page.keyboard.press('ArrowDown');
        presses++;
      }
    }
    // the same song by its name: /, the fewest letters that leave it alone on the list, Enter
    let searchPresses: number | null = null;
    if (n > 1) {
      const title = songs[target].title;
      await page.keyboard.press('Slash');
      searchPresses = 1;
      const number = String(target + 1).padStart(3, '0');
      for (const ch of number) {
        await page.keyboard.type(ch);
        searchPresses++;
      }
      await page.waitForTimeout(150);
      const left = await page.locator('[data-testid="song-item"]').count();
      await page.keyboard.press('Enter');
      searchPresses++;
      const picked = await page.getByTestId('song-title').first().textContent();
      out[`songs${n}.search`] = { typed: number, rowsLeft: left, picked, wanted: title };
    }
    out[`songs${n}`] = { shownMs, ...dom, cursorStepMs: stepMs, pageRows, pressesToMiddleByKeys: presses, pressesToMiddleBySearch: searchPresses };
    console.log(n, JSON.stringify(out[`songs${n}`]));
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }

  // twenty presets of the player's own: → from 기본 to the last one
  const presets = Array.from({ length: 20 }, (_, i) => ({ id: `user-${i + 1}`, name: `내 색 프리셋 ${i + 1}`, lanes: {} }));
  await openRoot(page, 'lib', JSON.stringify({ ...(JSON.parse(base) as object), colorPresets: presets }));
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-tab-notes').click();
  const row = page.getByTestId('opt-color-preset');
  await row.focus();
  let n = 0;
  const seen = new Set<string>();
  for (; n < 60; n++) {
    const v = (await row.getAttribute('data-value')) ?? '';
    if (v === 'user-20') break;
    seen.add(v);
    await page.keyboard.press('ArrowRight');
  }
  const names = await row.locator('.opt-value b').first().textContent();
  out.presets20 = { pressesToLast: n, choices: seen.size + 1, lastShownAs: names, canJump: false };
  console.log('presets', JSON.stringify(out.presets20));
  writeData('scale.json', out);
});
