import { expect, test, type Page } from '@playwright/test';
import { settingsTab } from './songSelect';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}') as Record<string, unknown>);

/** Settings to start from, kept over reloads (written only when there are none). */
async function startWith(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript((s) => {
    if (!localStorage.getItem('grg.settings.v1')) localStorage.setItem('grg.settings.v1', JSON.stringify(s));
  }, settings);
}

async function openSettings(page: Page) {
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-screen')).toBeVisible();
}

test('모두 초기화 takes a second press within 3 s, keeps the favourites, and can be undone', async ({ page }) => {
  const errors = trackErrors(page);
  await startWith(page, { hiSpeed: 6.5, inputOffsetMs: 12, favorites: ['00000000000000aa'], songOffsets: { '00000000000000aa': 7 } });
  await openSettings(page);
  await settingsTab(page, 'advanced');
  const reset = page.getByTestId('reset-all');
  await reset.click();
  await expect(reset).toHaveText('한 번 더 누르면 초기화');
  expect((await stored(page)).hiSpeed).toBe(6.5);
  // armed for 3 s only
  await expect(reset).toHaveText('모두 초기화', { timeout: 5_000 });
  await reset.click();
  await reset.click();
  await expect.poll(async () => (await stored(page)).hiSpeed).toBe(4);
  expect(await stored(page)).toMatchObject({ inputOffsetMs: 0, favorites: ['00000000000000aa'], songOffsets: { '00000000000000aa': 7 } });
  await expect(page.getByTestId('reset-done')).toBeVisible();
  // the undo is on the reset's line: → from the reset reaches it, Enter presses it, and the focus
  // goes back to the reset (the arrows go on from there)
  await reset.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('reset-undo')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await stored(page)).hiSpeed).toBe(6.5);
  expect((await stored(page)).inputOffsetMs).toBe(12);
  await expect(page.getByTestId('reset-undo')).toHaveCount(0);
  await expect(reset).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(reset).not.toBeFocused();
  expect(errors).toEqual([]);
});

test('a held Enter on 모두 초기화 arms it once: its repeats are no second press', async ({ page }) => {
  const errors = trackErrors(page);
  await startWith(page, { hiSpeed: 6.5 });
  await openSettings(page);
  await settingsTab(page, 'advanced');
  const reset = page.getByTestId('reset-all');
  await reset.focus();
  // held: the first keydown, then the key's repeats
  await page.keyboard.down('Enter');
  await expect(reset).toHaveText('한 번 더 누르면 초기화');
  for (let i = 0; i < 4; i++) {
    await page.keyboard.down('Enter');
    await page.waitForTimeout(50);
  }
  await page.keyboard.up('Enter');
  await expect(reset).toHaveText('한 번 더 누르면 초기화');
  await expect(page.getByTestId('reset-undo')).toHaveCount(0);
  expect((await stored(page)).hiSpeed).toBe(6.5);
  // a second press of its own resets; held, it does not arm the reset again
  await page.keyboard.down('Enter');
  await expect.poll(async () => (await stored(page)).hiSpeed).toBe(4);
  for (let i = 0; i < 3; i++) await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(reset).toHaveText('모두 초기화');
  await expect(page.getByTestId('reset-undo')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a reset can be undone after leaving the settings, until its time is up', async ({ page }) => {
  const errors = trackErrors(page);
  await startWith(page, { hiSpeed: 6.5 });
  await openSettings(page);
  await settingsTab(page, 'advanced');
  await page.getByTestId('reset-all').click();
  await page.getByTestId('reset-all').click();
  await expect.poll(async () => (await stored(page)).hiSpeed).toBe(4);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('song-list')).toBeVisible();
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'advanced');
  await page.getByTestId('reset-undo').click();
  await expect.poll(async () => (await stored(page)).hiSpeed).toBe(6.5);
  await expect(page.getByTestId('reset-undo')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the key settings: ↑↓ from a key to its second key and through the buttons to the next mode in the same lane, ←→ along the lanes, and hints that say so', async ({ page }) => {
  const errors = trackErrors(page);
  await openSettings(page);
  await settingsTab(page, 'keys');
  const hints = page.locator('.hintbar');
  await expect(hints).toContainText('모드');
  await expect(hints).toContainText('레인');
  await expect(hints).toContainText('바꾸기');
  await page.getByTestId('key-4K-1').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('key-4K-2')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('key2-4K-2')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('keys-run-4K')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('key-4K+FX-2')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('key2-4K-2')).toBeFocused();
  // Enter binds the key: the hints say what the next key does, Esc stops it and stays in the settings
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('key-4K-2')).toHaveText('…');
  await expect(hints).toContainText('이 레인에 지정');
  await expect(hints).toContainText('취소');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('key-4K-2')).toHaveText('J');
  await expect(hints).toContainText('바꾸기');
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Q / E keep the help on the row the focus lands on, and the custom skin help names the gear tab', async ({ page }) => {
  const errors = trackErrors(page);
  await openSettings(page);
  await settingsTab(page, 'judge');
  // its tools open with Enter
  await expect(page.locator('.hintbar')).toContainText('열기');
  await page.getByTestId('opt-judgement').focus();
  const help = page.getByTestId('settings-help');
  await expect(help).toContainText('HARD JUDGEMENT');
  // 플레이 and 판정·싱크 both start on a row of the same kind: the help is the new row's, not empty
  await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('opt-ruleset')).toBeFocused();
  await expect(help).toContainText('점수를 세는 방식');
  await page.keyboard.press('KeyE');
  await expect(page.getByTestId('opt-judgement')).toBeFocused();
  await expect(help).toContainText('HARD JUDGEMENT');
  // 고급 starts on 화면 모드 (Q / E still change the tab: the focus is in no text field)
  await settingsTab(page, 'advanced');
  await page.keyboard.press('KeyQ');
  await page.keyboard.press('KeyE');
  await expect(page.getByTestId('opt-display-mode')).toBeFocused();
  await expect(help).toContainText('전체 화면');
  await page.locator('textarea.skin-json').focus();
  await expect(help).toContainText('기어 탭');
  expect(errors).toEqual([]);
});

test('화면 모드 puts the page in full screen with Esc kept for the game, and back; full screen left the setting follows', async ({ page }) => {
  const errors = trackErrors(page);
  await openSettings(page);
  await settingsTab(page, 'advanced');
  const row = page.getByTestId('opt-display-mode');
  await row.focus();
  await page.keyboard.press('ArrowRight');
  await expect(row).toHaveAttribute('data-value', 'fullscreen');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  expect((await stored(page)).displayMode).toBe('fullscreen');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  expect((await stored(page)).displayMode).toBe('window');
  // in full screen again, left another way (as a held Esc does): the setting says 창
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await page.evaluate(() => document.exitFullscreen());
  await expect(row).toHaveAttribute('data-value', 'window');
  expect(errors).toEqual([]);
});
