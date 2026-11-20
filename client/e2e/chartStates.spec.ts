import { expect, test } from '@playwright/test';
import { chartStates } from './chartStates';

// Whether a tier's chart is there to play at once is told on its plate by its outline, its level's
// shape and a word, not by colour alone; on the song list, the cell of the chosen tier says it too.
test('each tier says whether its chart is made: made, being made, not made, failed; the list cell of a tier not made is hollow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await chartStates(page);
  await page.goto('/');
  const row = page.getByTestId('difficulty-row');
  const plates = row.locator('.difficulty');
  await expect(row.getByRole('button')).toHaveText([/EASY/, /NORMAL/, /HARD/, /EXPERT/, /ELITE/], { timeout: 30_000 });
  await expect.poll(() => plates.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.state))).toEqual(['made', 'making', 'unmade', 'failed', 'unmade']);
  await expect(plates.nth(0).locator('.diff-state')).toHaveCount(0);
  await expect(plates.nth(1).locator('.diff-state')).toHaveText('생성 중');
  await expect(plates.nth(2).locator('.diff-state')).toHaveText('미생성');
  await expect(plates.nth(3).locator('.diff-state')).toHaveText('실패');
  // waiting its turn behind the one being made: not made, no "대기"
  await expect(plates.nth(4).locator('.diff-state')).toHaveText('미생성');
  await expect(row).not.toContainText('대기');
  // not by colour alone: a dashed outline and a hollow level where the chart is not made
  const look = (i: number) =>
    plates.nth(i).evaluate((el) => ({ border: getComputedStyle(el, '::before').borderStyle, stroke: getComputedStyle(el.querySelector('.diff-level')!).webkitTextStrokeWidth }));
  expect(await look(0)).toEqual({ border: 'none', stroke: '0px' });
  expect((await look(2)).border).toBe('dashed');
  expect((await look(2)).stroke).not.toBe('0px');
  expect((await look(3)).border).toBe('dashed');
  // the chart being made has stripes that run to the right (picked or not), moved by a transform so
  // that they run smoothly; the other plates have none that run
  await expect(plates.nth(1).locator('.plate-stripes')).toHaveCount(1);
  for (const i of [0, 2, 3, 4]) await expect(plates.nth(i).locator('.plate-stripes')).toHaveCount(0);
  const stripes = plates.nth(1).locator('.plate-stripes');
  expect(await stripes.evaluate((el) => getComputedStyle(el, '::before').animationName)).toBe('plate-making');
  // held at points of its 0.7 s: the strip moves right by 0.75 rem a run, by fractions of a pixel
  // between frames (a transform, moved by the compositor; not whole pixels at a time)
  const at = (ms: number) =>
    stripes.evaluate((el, t) => {
      const run = document.getAnimations().find((a) => (a as CSSAnimation).animationName === 'plate-making')!;
      const running = run.playState === 'running';
      run.pause();
      run.currentTime = t;
      const x = new DOMMatrix(getComputedStyle(el, '::before').transform).m41;
      run.play();
      return { running, x };
    }, ms);
  const steps = [await at(0), await at(100), await at(350), await at(690)];
  expect(steps[0].running).toBe(true);
  const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  expect(steps.map((s) => s.x)).toEqual([0, (0.75 * rem * 100) / 700, (0.75 * rem * 350) / 700, (0.75 * rem * 690) / 700].map((x) => expect.closeTo(x, 1)));
  expect(Math.abs(steps[1].x - Math.round(steps[1].x))).toBeGreaterThan(0.05);
  // the imported chart stands apart after the tiers
  await expect(page.getByTestId('saved-chart')).toHaveCount(1);
  // a tier not made yet (or being made) shows no level ("–"), not the one aimed at; a made one its level
  await expect(plates.nth(0).locator('.diff-level')).not.toHaveText('–');
  for (const i of [1, 2]) await expect(plates.nth(i).locator('.diff-level')).toHaveText('–');
  // the list: the chosen tier (HARD) is made on the second song only (a song's charts are known once it has been on the cursor)
  const cell = (title: string) => page.locator('.song-item', { hasText: title }).locator('.tier-level');
  // (each waited on until its chart is known: a made one's level, a not made one's mark)
  await page.locator('.song-item', { hasText: 'All Made' }).click();
  await expect(page.getByTestId('song-title')).toHaveText('All Made');
  await expect(cell('All Made').locator('b')).not.toHaveText('–');
  await page.locator('.song-item', { hasText: 'None Made' }).click();
  await expect(page.getByTestId('song-title')).toHaveText('None Made');
  await expect(cell('None Made')).toHaveClass(/unmade/);
  await expect(cell('All Made')).not.toHaveClass(/unmade/);
  await expect(cell('All Made').locator('b')).not.toHaveText('–');
  await expect(cell('None Made').locator('b')).toHaveText('–');
  await expect(cell('Five States')).toHaveClass(/unmade/);
  // a song with a chart being made shows it in its cell on the list (whichever tier it is); the others do not
  const making = (title: string) => page.locator('.song-item', { hasText: title }).getByTestId('tier-making');
  await expect(making('Five States')).toHaveAttribute('data-state', 'making');
  await expect(making('All Made')).toHaveCount(0);
  await expect(making('None Made')).toHaveCount(0);
  expect(await making('Five States').evaluate((el) => getComputedStyle(el).animationName)).toBe('tier-making');
  expect(errors).toEqual([]);
});
