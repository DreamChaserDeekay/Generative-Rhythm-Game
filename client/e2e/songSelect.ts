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

/**
 * Puts the cursor on the song of that title (its whole title) and the focus on its row, wherever it
 * is in the library: the wheel draws only the rows around the cursor, and a click on the row under
 * the cursor plays it, so a song is found through the search, which is cleared again.
 */
export async function pickSong(page: Page, title: string) {
  const search = page.getByTestId('song-search');
  const picked = page.locator('.song-item.active .song-title');
  await search.fill(title);
  await expect(picked).toHaveText(title);
  // the search over, the cursor stays on the song it found; Enter leaves the search for its row
  await search.fill('');
  await search.press('Enter');
  await expect(picked).toHaveText(title);
  await expect(page.locator('.song-item.active')).toBeFocused();
}

/** Opens the song select's play options (Space): the rows of the next play, in the song's place. */
export async function playOptions(page: Page) {
  const panel = page.getByTestId('play-options');
  if (!(await panel.isVisible())) await page.getByTestId('hint-options').click();
  await expect(panel).toBeVisible();
}

/** Plays the chart chosen: the Enter plate at the end of the key hints (as Enter does). */
export async function play(page: Page) {
  await page.getByTestId('hint-enter').click();
}

/** Plays the chart chosen on autoplay (Shift+Enter, as the menu's 오토 플레이로 보기 does): nothing is recorded. */
export async function autoplay(page: Page) {
  await page.keyboard.press('Shift+Enter');
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

export type InfoTab = 'chart' | 'records' | 'tools' | 'song';

/** Opens the song info and tools (I), on a page of it when one is given: the chart, its records, the tools, the song's settings. */
export async function songInfo(page: Page, tab?: InfoTab) {
  const panel = page.getByTestId('song-info');
  if (!(await panel.isVisible())) await page.getByTestId('hint-info').click();
  await expect(panel).toBeVisible();
  if (!tab) return;
  await page.getByTestId(`info-tab-${tab}`).click();
  await expect(page.getByTestId(`info-tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
}

/** Presses a tool of the song info's 도구 page: the sync test (on autoplay, by hand) or a step of the calibration. */
export async function tool(page: Page, testId: 'sync-auto' | 'sync-play' | 'open-calibration' | 'open-visual-calibration') {
  await songInfo(page, 'tools');
  await page.getByTestId(testId).click();
}

/** Opens one of the song select's sheets from the list: the menu (Esc), or what the menu and a key open (+ adds a song, C the cover, V the background video). */
export async function openSheet(page: Page, sheet: 'menu' | 'add' | 'cover' | 'video' | 'filter') {
  const box = page.getByTestId(`sheet-${sheet}`);
  if (await box.isVisible()) return;
  if (sheet === 'cover') await page.getByTestId('open-cover').click();
  else if (sheet === 'video') await page.getByTestId('open-video').click();
  else {
    await page.getByTestId('hint-menu').click();
    if (sheet !== 'menu') await page.getByTestId(`menu-${sheet}`).click();
  }
  await expect(box).toBeVisible();
}

/**
 * Adds a song from the 곡 추가 sheet (demo-button, upload-button, import-button …). The demo takes
 * a few seconds to make: this waits until it is made and chosen, as the song chosen before stays
 * until then (and its chart comes by itself).
 */
export async function addFromMenu(page: Page, testId: 'demo-button' | 'upload-button' | 'import-button' | 'import-folder-button') {
  await openSheet(page, 'add');
  const demo = testId === 'demo-button' ? page.waitForResponse((r) => r.url().endsWith('/api/songs/demo'), { timeout: 60_000 }) : null;
  await page.getByTestId(testId).click();
  if (!demo) return;
  await demo;
  await expect(page.getByTestId('busy')).toHaveCount(0, { timeout: 30_000 });
}

/** Opens a tab of the settings (the settings are open). */
export async function settingsTab(page: Page, tab: 'play' | 'judge' | 'speed' | 'gear' | 'notes' | 'fx' | 'sound' | 'keys' | 'pad' | 'mapper') {
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
