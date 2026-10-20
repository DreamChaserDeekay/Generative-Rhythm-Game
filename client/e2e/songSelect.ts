import { expect, type Page } from '@playwright/test';
import type { DifficultySystemId } from '../src/engine/config';

/** Opens the song select's play options (Space), on a tab when one is given. */
export async function playOptions(page: Page, tab?: 'rules' | 'generation') {
  const panel = page.getByTestId('play-options');
  if (!(await panel.isVisible())) await page.getByTestId('hint-options').click();
  await expect(panel).toBeVisible();
  if (tab) await page.getByTestId(`toggle-${tab}`).click();
}

/** Plays the next chart on autoplay. */
export async function autoplay(page: Page) {
  await playOptions(page);
  await page.getByTestId('autoplay-toggle').check();
}

/** Opens the song info and tools (I): the chart's numbers, the song's settings, the sync test. */
export async function songInfo(page: Page) {
  const panel = page.getByTestId('song-info');
  if (!(await panel.isVisible())) await page.getByTestId('hint-info').click();
  await expect(panel).toBeVisible();
}

/** Presses a tool of the song info panel (sync-auto, open-calibration, open-replay). */
export async function tool(page: Page, testId: 'sync-auto' | 'open-calibration' | 'open-replay') {
  await songInfo(page);
  await page.getByTestId(testId).click();
}

/** Adds a song from the top bar's menu (demo-button, upload-button, import-button …). */
export async function addFromMenu(page: Page, testId: 'demo-button' | 'upload-button' | 'import-button' | 'import-folder-button') {
  await page.getByTestId('add-menu').click();
  await page.getByTestId(testId).click();
}

/** Switches the difficulty system in the settings and comes back to the song select. */
export async function difficultySystem(page: Page, id: DifficultySystemId) {
  await page.getByTestId('open-settings').click();
  await page.getByTestId(`system-${id}`).click();
  await expect(page.getByTestId(`system-${id}`)).toHaveClass(/active/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('song-list')).toBeVisible();
}
