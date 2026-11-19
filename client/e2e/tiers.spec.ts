import { expect, test } from '@playwright/test';
import { addFromMenu, fakeSongs, playOptions, settingsTab, songInfo } from './songSelect';

// The five tiers of the game's own scale (Lv.1–20: EASY 1–5, NORMAL 6–10, HARD 11–14, EXPERT 15–18, ELITE 19–20); the DJMAX and EZ2ON difficulty systems were taken out.
test('charts are generated on the five tiers, and settings saved on a removed difficulty system load on NORMAL', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // settings of a version with the DJMAX system (written only when there are none)
  await page.addInitScript(() => {
    if (!localStorage.getItem('grg.settings.v1')) localStorage.setItem('grg.settings.v1', JSON.stringify({ difficultySystem: 'DJMAX', lastDifficulty: 'MX' }));
  });
  await page.goto('/');
  await addFromMenu(page, 'demo-button');
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 60_000 });
  const tiers = page.getByTestId('difficulty-row').getByRole('button');
  await expect(tiers).toHaveText([/EASY\s*EZ/, /NORMAL\s*NM/, /HARD\s*HD/, /EXPERT\s*EX/, /ELITE\s*EL/]);
  await expect(page.locator('.difficulty.active')).toContainText('NORMAL');

  await page.getByRole('button', { name: /EXPERT/ }).click();
  await expect(page.getByTestId('chart-level')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.difficulty.active')).toContainText('EXPERT');
  const ex = Number((await page.getByTestId('chart-level').textContent())?.replace(/\D/g, ''));
  expect(ex).toBeGreaterThanOrEqual(15);
  expect(ex).toBeLessThanOrEqual(18);
  // the chart's pattern profile: six shares in percent
  await songInfo(page);
  await expect(page.getByTestId('pattern-mix').locator('.pattern-chip')).toHaveText([/계단 \d+%/, /트릴 \d+%/, /동치 \d+%/, /연타 \d+%/, /롱잡 \d+%/, /도약 \d+%/]);
  // the earlier note-by-note placement stays available to compare
  const classic = page.waitForRequest(
    (r) => r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/charts') && (r.postData() ?? '').includes('"patternEngine":"classic"'),
  );
  await playOptions(page);
  await page.getByTestId('pattern-engine-classic').click();
  await classic;
  await expect(page.getByTestId('toggle-generation')).toContainText('이전 배치');
  await page.getByTestId('pattern-engine').getByRole('button', { name: '악구·패턴' }).click();
  await page.getByTestId('toggle-generation').click();
  await expect(page.getByTestId('toggle-generation')).not.toContainText('이전 배치');
  await page.getByRole('button', { name: /ELITE/ }).click();
  await expect(page.getByTestId('chart-level')).toHaveText(/^\d+$/, { timeout: 30_000 });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}'));
  expect(stored.difficultySystem).toBeUndefined();
  expect(stored.lastDifficulty).toBe('ELITE');

  // no difficulty system to choose in the settings
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'play');
  await expect(page.getByTestId('opt-system')).toHaveCount(0);
  expect(errors).toEqual([]);
});

// A song too calm for the top tier has none (the server answers 404: no try of the model came into
// its range, mapper/fit.py): its cell on the list is left empty and, with ELITE chosen, Enter plays
// its EXPERT; no notice says so.
test('a song without an ELITE leaves its cell empty and plays its EXPERT, and the next song is on ELITE again', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const songs = fakeSongs(2, 'ready').map((s) => ({ ...s, analyzedAt: 1 }));
  const timing = { offsetMs: 0, tempoMap: [{ beat: 0, bpm: 120 }], meter: [{ measure: 0, beatsPerMeasure: 4 }] };
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs } }));
  await page.route(
    (url) => /^\/api\/songs\/[^/]+\/charts$/.test(url.pathname),
    (route) => {
      if (route.request().method() !== 'POST') return route.fulfill({ json: { charts: [] } });
      const body = JSON.parse(route.request().postData() ?? '{}');
      const songId = new URL(route.request().url()).pathname.split('/')[3];
      if (songId === songs[1].id && body.difficulty === 'ELITE') return route.fulfill({ status: 404, json: { detail: '곡이 조용해 ELITE(레벨 19–20) 채보가 없습니다.' } });
      const level = ({ EASY: 3, NORMAL: 8, HARD: 12, EXPERT: 16, ELITE: 20 } as Record<string, number>)[body.difficulty];
      const meta = { chartId: `c${songId.slice(-4)}${'b'.repeat(14)}${body.difficulty.slice(0, 2).toLowerCase()}`, songId, keyMode: '8K', difficulty: body.difficulty, level, noteCount: 100 * level, durationMs: 60_000, nps: { avg: 5, peak: 9, graph: [1, 2] }, rating: level, generator: { seed: 7, version: 'now' } };
      return route.fulfill({ json: body.brief ? { meta, cached: true } : { chart: { meta, timing, notes: [], sections: [] }, cached: true } });
    },
  );
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '8K', lastDifficulty: 'ELITE' })));
  await page.goto('/');
  const plates = page.getByTestId('difficulty-row').getByRole('button');
  const cells = (i: number) => page.locator(`[data-song-id="${songs[i].id}"] .tier-level`);

  await expect(cells(0)).toHaveText(['3', '8', '12', '16', '20'], { timeout: 30_000 });
  await expect(plates).toHaveText([/EASY/, /NORMAL/, /HARD/, /EXPERT/, /ELITE/]);
  await expect(page.locator('.difficulty.active')).toContainText('ELITE');

  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('song-title')).toHaveText('Fake Song 02');
  await expect(plates).toHaveText([/EASY/, /NORMAL/, /HARD/, /EXPERT/], { timeout: 30_000 });
  await expect(page.locator('.difficulty.active')).toContainText('EXPERT');
  await expect(cells(1)).toHaveText(['3', '8', '12', '16', '']);
  await expect(cells(1).nth(4)).toHaveClass(/absent/);
  await expect(cells(1).nth(3)).toHaveClass(/active/);
  await expect(page.getByTestId('chart-level')).toHaveText('Lv.16');
  // → past the song's last tier goes nowhere; the choice stays ELITE
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.difficulty.active')).toContainText('EXPERT');

  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.difficulty.active')).toContainText('ELITE');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}'));
  expect(stored.lastDifficulty).toBe('ELITE');
  expect(errors).toEqual([]);
});
