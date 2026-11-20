import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { chooseSetting, settingsTab, tool } from './songSelect';

/**
 * The player's own asset packs (docs/CUSTOM_ASSETS.md): packs drawn in code (scripts/assets/make_test_pack.py) put in
 * the data folder's skins/, picked in the settings and played.
 */
const python = existsSync('../server/.venv/bin/python') ? '../server/.venv/bin/python' : process.platform === 'win32' ? '../server/.venv/Scripts/python.exe' : 'python3';

const SKINS = 'test-results/e2e-data/skins';

test.beforeAll(() => {
  execFileSync(python, ['../scripts/assets/make_test_pack.py', SKINS]);
});

// the packs are not left for the specs after this one (their parts' choices would hold them)
test.afterAll(() => {
  for (const pack of ['시험 팩', 'broken', 'sheet-only']) rmSync(`${SKINS}/${pack}`, { recursive: true, force: true });
});

test('a pack in the skins folder is picked part by part, shows in the preview and is played; a broken one says why', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', hiSpeed: 4 })));
  await page.goto('/');
  await tool(page, 'sync-auto');
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.locator('.play-overlay')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-custom', '');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/custom-assets-before.png' });
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('song-list')).toBeVisible();

  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'gear');
  // the packs' rows, and each pack with what of it can be used and why not
  await expect(page.getByTestId('custom-assets')).toBeVisible();
  await expect(page.getByTestId('pack-broken-deck')).toHaveAttribute('data-status', 'error');
  await expect(page.getByTestId('pack-broken-deck')).toContainText('비율');
  await expect(page.getByTestId('pack-broken-hit')).toContainText('검정');
  await expect(page.getByTestId('pack-sheet-only-hit')).toHaveAttribute('data-status', 'ok');
  await expect(page.getByTestId('pack-시험 팩-deck')).toHaveAttribute('data-status', 'ok');
  await chooseSetting(page, 'opt-deck-style', 'pack:시험 팩');
  await expect(page.getByTestId('opt-deck-style')).toContainText('내 에셋: 시험 팩');
  await chooseSetting(page, 'opt-hit-style', 'pack:시험 팩');
  // a pack whose part cannot be used is not among a part's choices
  await expect(page.getByTestId('opt-deck-style')).not.toHaveAttribute('data-value', 'pack:broken');
  // the prompt is copied (the clipboard is the page's to read here)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByTestId('copy-prompt-panel').click();
  await expect(page.getByTestId('settings-help')).toContainText('복사했습니다');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('배치 밑그림');
  // the layout template is served
  const template = await page.request.get('/api/skins/templates/panel.png');
  expect(template.ok()).toBe(true);
  expect(template.headers()['content-type']).toBe('image/png');
  await page.screenshot({ path: 'test-results/custom-assets-gear.png' });
  await settingsTab(page, 'notes');
  await chooseSetting(page, 'opt-note-style', 'pack:시험 팩');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/custom-assets-notes.png' });
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}'));
  expect(kept.parts).toMatchObject({ custom: { note: '시험 팩', deck: '시험 팩', hit: '시험 팩' } });
  await page.getByRole('button', { name: /완료/ }).click();

  await tool(page, 'sync-auto');
  await expect(page.getByTestId('play-screen')).toBeVisible();
  // drawn as the default parts the pack's pictures stand in for, from the pack's pictures
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-style', 'flat solid bar standard flash');
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-art', 'notes long gear hit');
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-custom', 'note deck hit');
  await expect(page.locator('.play-overlay')).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/custom-assets-after.png' });
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('song-list')).toBeVisible();

  // the pack taken away: its rows say so, and the play draws the default parts, with no error
  rmSync(`${SKINS}/시험 팩`, { recursive: true, force: true });
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'gear');
  // (a click on a row first puts the cursor on it, scrolling it into view: the cursor is put there first)
  await page.getByTestId('reload-skins').focus();
  await page.getByTestId('reload-skins').click();
  await expect(page.getByTestId('settings-help')).toContainText('팩 2개를 읽었습니다');
  await expect(page.getByTestId('opt-deck-style')).toContainText('읽지 못함');
  await page.getByRole('button', { name: /완료/ }).click();
  await tool(page, 'sync-auto');
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-art', 'notes long gear hit');
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-custom', '');
  await expect(page.locator('.play-overlay')).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(async () => Number((await page.locator('.hud-combo-num').textContent()) || 0), { timeout: 30_000 }).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});
