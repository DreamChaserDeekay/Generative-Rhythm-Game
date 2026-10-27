import { expect, type Page } from '@playwright/test';

/**
 * A library of songs that failed to analyse (the list and the controls, with nothing to play), or
 * of `ready` ones that only the routes of a test answer for.
 */
export function fakeSongs(n: number, status: 'error' | 'ready' = 'error') {
  return Array.from({ length: n }, (_, i) => ({
    id: (0xa000 + i).toString(16).padStart(16, '0'),
    title: `Fake Song ${String(i + 1).padStart(2, '0')}`,
    artist: 'E2E',
    album: '',
    audioHash: `fake${i}`,
    durationMs: 60_000,
    hasCover: false,
    status,
    progress: status === 'ready' ? 1 : 0,
    progressLabel: '',
    error: status === 'error' ? 'e2e' : null,
    bpm: null,
    bpmMin: null,
    bpmMax: null,
    previewMs: null,
    overrides: {},
    createdAt: i,
    analyzedAt: null,
    analyzer: {},
    hasBga: false,
    bgaOffsetMs: 0,
    bgaYoutube: null,
    sections: null,
    records: [] as Record<string, unknown>[],
  }));
}

/** Opens the song select's play options (Space), on a tab when one is given. */
export async function playOptions(page: Page, tab?: 'rules' | 'gear' | 'generation') {
  const panel = page.getByTestId('play-options');
  if (!(await panel.isVisible())) await page.getByTestId('hint-options').click();
  await expect(panel).toBeVisible();
  if (tab) await page.getByTestId(`toggle-${tab}`).click();
}

/** Plays the next chart on autoplay. */
export async function autoplay(page: Page) {
  await playOptions(page, 'rules');
  await page.getByTestId('autoplay-toggle').check();
}

/** Presses Esc (a key event on the page) the moment the next play's loading card leaves the page. */
export async function escWhenLoaded(page: Page) {
  await page.evaluate(() => {
    let seen = false;
    const watch = new MutationObserver(() => {
      if (document.querySelector('[data-testid="play-loading"]')) seen = true;
      else if (seen) {
        watch.disconnect();
        document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true }));
      }
    });
    watch.observe(document.body, { childList: true, subtree: true });
  });
}

/** Opens the song info and tools (I): the chart's numbers, the song's settings, the sync test. */
export async function songInfo(page: Page) {
  const panel = page.getByTestId('song-info');
  if (!(await panel.isVisible())) await page.getByTestId('hint-info').click();
  await expect(panel).toBeVisible();
}

/** Presses a tool of the song info panel: the sync test (on autoplay, by hand) or a step of the calibration. */
export async function tool(page: Page, testId: 'sync-auto' | 'sync-play' | 'open-calibration' | 'open-visual-calibration') {
  await songInfo(page);
  await page.getByTestId(testId).click();
}

/**
 * Adds a song from the top bar's menu (demo-button, upload-button, import-button …). The demo takes
 * a few seconds to make: this waits until it is made and chosen, as the song chosen before stays
 * until then (and its chart comes by itself).
 */
export async function addFromMenu(page: Page, testId: 'demo-button' | 'upload-button' | 'import-button' | 'import-folder-button') {
  await page.getByTestId('add-menu').click();
  const demo = testId === 'demo-button' ? page.waitForResponse((r) => r.url().endsWith('/api/songs/demo'), { timeout: 60_000 }) : null;
  await page.getByTestId(testId).click();
  if (!demo) return;
  await demo;
  await expect(page.getByTestId('busy')).toHaveCount(0, { timeout: 30_000 });
}

/** Opens a tab of the settings (the settings are open). */
export async function settingsTab(page: Page, tab: 'play' | 'judge' | 'speed' | 'gear' | 'colors' | 'fx' | 'sound' | 'keys' | 'pad' | 'advanced') {
  await page.getByTestId(`settings-tab-${tab}`).click();
  await expect(page.getByTestId(`settings-tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
}

/** Steps a settings row with → until it holds `value`. */
export async function chooseSetting(page: Page, testId: string, value: string) {
  const row = page.getByTestId(testId);
  await row.focus();
  for (let i = 0; i < 24 && (await row.getAttribute('data-value')) !== value; i++) await page.keyboard.press('ArrowRight');
  await expect(row).toHaveAttribute('data-value', value);
}
