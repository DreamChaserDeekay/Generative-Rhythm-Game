import { expect, test, type Page } from '@playwright/test';
import { settingsTab, tool } from './songSelect';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}') as Record<string, unknown>);

/** The settings' 판정·싱크 tab. */
async function judgeTab(page: Page) {
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'judge');
}

test('the display offset is set by eye: notes on the clicks, ←→ move them at once, Enter keeps it, Esc goes back to the tab', async ({ page }) => {
  const errors = trackErrors(page);
  await judgeTab(page);
  await page.getByTestId('open-visual-calibration-settings').click();
  const screen = page.getByTestId('calibration-screen');
  await expect(screen).toHaveAttribute('data-step', 'visual');
  await expect(page.locator('.topbar .screen-name')).toHaveText('표시 오프셋 맞추기');
  // the gear on the metronome, and 저장 under Enter
  await expect(page.getByTestId('calib-gear').locator('canvas')).toBeVisible();
  await expect(page.getByTestId('calib-visual-save')).toBeFocused();
  const offset = page.getByTestId('calib-visual-offset');
  await expect(offset).toHaveText('0ms');
  await page.keyboard.press('ArrowRight');
  await expect(offset).toHaveText('+1ms');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(offset).toHaveText('+6ms');
  await page.keyboard.press('ArrowLeft');
  await expect(offset).toHaveText('+5ms');
  // not kept until 저장, and the hints say Esc leaves without it
  expect((await stored(page)).visualOffsetMs ?? 0).toBe(0);
  await expect(page.getByTestId('calib-visual-saved')).toContainText('저장 안 됨');
  await expect(page.getByTestId('hint-esc')).toContainText('저장하지 않고 돌아가기');
  // a look at the other step keeps it
  await page.keyboard.press('KeyQ');
  await expect(screen).toHaveAttribute('data-step', 'input');
  await page.keyboard.press('KeyE');
  await expect(offset).toHaveText('+5ms');
  await expect(page.getByTestId('calib-visual-saved')).toContainText('저장 안 됨');
  // Enter presses what has the focus, as the hints say: 돌아가기 after a Tab, 저장 back on it
  await expect(page.getByTestId('hint-enter')).toContainText('저장');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('calib-back')).toBeFocused();
  await expect(page.getByTestId('hint-enter')).toContainText('저장하지 않고 돌아가기');
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByTestId('calib-visual-save')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await stored(page)).visualOffsetMs).toBe(5);
  await expect(page.getByTestId('calib-visual-saved')).toContainText('저장했습니다');
  await expect(page.getByTestId('hint-esc')).toHaveText(/돌아가기/);
  await expect(page.getByTestId('hint-esc')).not.toContainText('저장하지');

  // Q / E between the steps: the judgement offset's by ear, its ring counting the beats unlit
  await page.keyboard.press('KeyQ');
  await expect(screen).toHaveAttribute('data-step', 'input');
  await expect(page.locator('.topbar .screen-name')).toHaveText('판정 오프셋 측정');
  await expect(page.getByTestId('calib-start')).toBeFocused();
  await expect(page.locator('.hintbar')).toContainText('시작');
  await page.keyboard.press('KeyE');
  await expect(screen).toHaveAttribute('data-step', 'visual');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  await expect(page.getByTestId('settings-tab-judge')).toHaveAttribute('aria-selected', 'true');
  // back on the row it was opened from
  await expect(page.getByTestId('open-visual-calibration-settings')).toBeFocused();
  expect(errors).toEqual([]);
});

test('the judgement offset by ear: Esc stops a run and stays, the ring counts unlit, and 다음 goes to the display step', async ({ page }) => {
  const errors = trackErrors(page);
  await judgeTab(page);
  await page.getByTestId('open-calibration-settings').click();
  const ring = page.locator('.beat-ring');
  await expect(page.getByTestId('calib-start')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('calib-start')).toBeDisabled();
  // the tabs wait for the run (a tap would move them otherwise)
  await expect(page.getByTestId('calib-step-visual')).toBeDisabled();
  await expect.poll(async () => Number(await ring.getAttribute('data-beat')), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
  expect(await ring.getAttribute('class')).toBe('beat-ring');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('calib-start')).toBeEnabled();
  await expect(page.getByTestId('calibration-screen')).toBeVisible();
  await page.getByTestId('calib-next').click();
  await expect(page.getByTestId('calibration-screen')).toHaveAttribute('data-step', 'visual');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-tab-judge')).toHaveAttribute('aria-selected', 'true');
  expect(errors).toEqual([]);
});

test('the sync test played by hand from the settings: ←→ the display offset, Shift+←→ the judgement offset, shown as they move; leaving it goes back to the tab', async ({ page }) => {
  const errors = trackErrors(page);
  await judgeTab(page);
  await page.getByTestId('settings-sync-play').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.getByTestId('play-loading')).toHaveCount(0, { timeout: 60_000 });
  const visual = page.getByTestId('hud-sync-visual');
  const input = page.getByTestId('hud-sync-input');
  await expect(visual).toHaveText('0ms');
  await expect(input).toHaveText('0ms');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(visual).toHaveText('+2ms');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(input).toHaveText('-1ms');
  await expect(page.getByTestId('hud-toast')).toContainText('판정 오프셋 -1ms');
  await expect.poll(async () => {
    const s = await stored(page);
    return [s.visualOffsetMs, s.inputOffsetMs];
  }).toEqual([2, -1]);
  // the pause takes the arrows: nothing moves
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(visual).toHaveText('+2ms');
  await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  await expect(page.getByTestId('settings-tab-judge')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('settings-sync-play')).toBeFocused();
  expect(errors).toEqual([]);
});

test('the sync test by hand in 7K+1S leaves Shift to the scratch: the judgement offset on [ ], the keys shown as they are', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem('grg.settings.v1')) localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '7K+1S' }));
  });
  await judgeTab(page);
  const row = page.getByTestId('settings-sync-play');
  await row.focus();
  await expect(page.getByTestId('settings-help')).toContainText('←→로 표시 오프셋, [ ]로 판정 오프셋');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('play-loading')).toHaveCount(0, { timeout: 60_000 });
  const rows = page.getByTestId('hud-sync').locator('.hud-sync-row');
  await expect(rows.nth(0).locator('kbd')).toHaveText(['←', '→']);
  await expect(rows.nth(1).locator('kbd')).toHaveText(['[', ']']);
  await page.keyboard.press('BracketRight');
  await expect(page.getByTestId('hud-sync-input')).toHaveText('+1ms');
  // the scratch held (L-Shift) with →: the display offset, the judgement offset left alone
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.getByTestId('hud-sync-visual')).toHaveText('+1ms');
  await expect(page.getByTestId('hud-sync-input')).toHaveText('+1ms');
  await expect.poll(async () => {
    const s = await stored(page);
    return [s.visualOffsetMs, s.inputOffsetMs];
  }).toEqual([1, 1]);
  expect(errors).toEqual([]);
});

test('the song info has the sync test on autoplay (←→ the display offset only) and by hand, and both calibration steps; a replay file is opened from the + menu', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await tool(page, 'open-visual-calibration');
  await expect(page.getByTestId('calibration-screen')).toHaveAttribute('data-step', 'visual');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('song-list')).toBeVisible();

  await tool(page, 'sync-auto');
  await expect(page.getByTestId('play-loading')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByTestId('hud-sync-input')).toHaveCount(0);
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('hud-sync-visual')).toHaveText('-1ms');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(async () => (await stored(page)).visualOffsetMs).toBe(-1);
  expect((await stored(page)).inputOffsetMs ?? 0).toBe(0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('song-list')).toBeVisible();

  // 리플레이 파일 보기 is in the add menu: a file that is no replay says so
  await page.getByTestId('add-menu').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('open-replay').click();
  await (await chooser).setFiles({ name: 'not-a-replay.json', mimeType: 'application/json', buffer: Buffer.from('{"hello": 1}') });
  await expect(page.getByTestId('select-error')).toContainText('리플레이 파일이 아닙니다');
  expect(errors).toEqual([]);
});
