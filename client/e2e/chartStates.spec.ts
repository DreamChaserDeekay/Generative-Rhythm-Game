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
  // the imported chart stands apart after the tiers
  await expect(page.getByTestId('saved-chart')).toHaveCount(1);
  // the list: the chosen tier (HARD) is made on the second song only (a song's charts are known once it has been on the cursor)
  const cell = (title: string) => page.locator('.song-item', { hasText: title }).locator('.tier-level');
  for (const title of ['All Made', 'None Made']) {
    await page.locator('.song-item', { hasText: title }).click();
    await expect(page.getByTestId('song-title')).toHaveText(title);
    await expect(cell(title).locator('b')).not.toHaveText('–');
  }
  await expect(cell('All Made')).not.toHaveClass(/unmade/);
  await expect(cell('None Made')).toHaveClass(/unmade/);
  await expect(cell('Five States')).toHaveClass(/unmade/);
  expect(errors).toEqual([]);
});
