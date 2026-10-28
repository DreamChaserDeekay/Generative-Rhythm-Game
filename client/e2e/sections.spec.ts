import { expect, test, type Page } from '@playwright/test';
import { addFromMenu, songInfo } from './songSelect';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('song sections: shown by group on the minimap, edited and reset in the song settings', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await addFromMenu(page, 'demo-button');
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 60_000 });
  await page.getByTestId('generate-button').click();
  await expect(page.getByTestId('chart-level')).toBeVisible({ timeout: 30_000 });
  await songInfo(page);
  await expect(page.getByTestId('chart-preview')).toBeVisible();
  await expect(page.getByTestId('loop-consistency')).toBeVisible();

  // other specs share the library: find the selected song by its title
  const title = await page.getByTestId('song-title').textContent();
  const songs = (await (await page.request.get('/api/songs')).json()).songs as { id: string; title: string }[];
  const id = (songs.find((s) => s.title === title) ?? songs[0]).id;
  const analysed = await (await page.request.get(`/api/songs/${id}/sections`)).json();
  expect(analysed.edited).toBe(false);
  expect(analysed.sections.length).toBeGreaterThanOrEqual(3);
  expect(analysed.sections.every((s: { group?: string; loopBars?: number }) => s.group && s.loopBars)).toBe(true);

  await expect(page.getByTestId('sections-status')).toHaveText('자동 분석');
  await page.getByTestId('edit-sections').click();
  await expect(page.getByTestId('section-row')).toHaveCount(analysed.sections.length);
  // the second section becomes a chorus of a new group H
  const second = page.getByTestId('section-row').nth(1);
  await second.getByLabel('구간').selectOption('chorus');
  await second.getByLabel('반복 묶음').selectOption('H');
  await page.getByTestId('save-sections').click();
  await expect(page.getByTestId('sections-status')).toHaveText('직접 고침');
  const edited = await (await page.request.get(`/api/songs/${id}/sections`)).json();
  expect(edited.edited).toBe(true);
  expect(edited.sections[1]).toMatchObject({ label: 'chorus', group: 'H', startBeat: analysed.sections[1].startBeat });
  // the shown chart was made again from the edited sections
  await expect(page.getByTestId('chart-preview')).toBeVisible();
  const chart = await page.evaluate(async (songId) => {
    const res = await fetch(`/api/songs/${songId}/charts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keyMode: '4K', difficulty: 'NORMAL' }) });
    return (await res.json()).chart;
  }, id);
  expect(chart.sections[1]).toMatchObject({ label: 'chorus', group: 'H' });

  await page.getByTestId('reset-sections').click();
  await expect(page.getByTestId('sections-status')).toHaveText('자동 분석');
  expect((await (await page.request.get(`/api/songs/${id}/sections`)).json()).edited).toBe(false);

  // a boundary set by ear: a click on the waveform goes there, M adds a section on that bar line,
  // and Enter (which plays the chart in the song select) plays the section from just before it
  await expect(page.getByTestId('section-row')).toHaveCount(analysed.sections.length);
  const analysis = await (await page.request.get(`/api/songs/${id}/analysis`)).json();
  const middle = (analysis.sections[1].t + analysis.sections[1].endT) / 2;
  const wave = page.locator('.section-wave').first();
  const box = (await wave.boundingBox())!;
  await wave.click({ position: { x: (middle / analysis.durationMs) * box.width, y: box.height / 2 } });
  await page.keyboard.press('KeyM');
  await expect(page.getByTestId('section-row')).toHaveCount(analysed.sections.length + 1);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('section-play')).toHaveText('멈춤');
  await expect(page.getByTestId('section-editor')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('section-play')).toHaveText('재생');
  expect(errors).toEqual([]);
});
