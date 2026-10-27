import { expect, test, type Page } from '@playwright/test';
import { fakeSongs } from './songSelect';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('with no server the select says how to start it, its buttons work by keys, it connects by itself once the server answers', async ({ page }) => {
  const errors = trackErrors(page);
  let down = true;
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => (down ? route.abort() : route.fallback()),
  );
  await page.goto('/');
  const panel = page.getByTestId('server-offline');
  await expect(panel).toBeVisible();
  // the command as the README gives it, the focus on 다시 연결, hints for these buttons only
  await expect(panel.locator('pre')).toContainText('.venv/bin/python -m rhythm_server');
  await expect(page.getByTestId('reconnect')).toBeFocused();
  const hints = page.locator('.hintbar');
  await expect(hints).toContainText('버튼');
  await expect(hints).toContainText('누르기');
  await expect(hints).not.toContainText('플레이 옵션');
  await expect(page.getByTestId('song-list')).toContainText('서버에 연결되면 곡을 추가할 수 있습니다');
  // 곡 추가 cannot be pressed, and looks it (a quiet button's colours alone are those of a disabled one)
  const add = page.getByTestId('add-menu');
  await expect(add).toBeDisabled();
  expect(Number(await add.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(1);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('offline-sync-test')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('reconnect')).toBeFocused();
  // the server comes up: the panel goes within a few seconds, nothing pressed
  down = false;
  await expect(panel).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByTestId('song-list')).not.toContainText('서버에 연결되면');
  expect(errors).toEqual([]);
});

for (const key of ['Enter', 'Space']) {
  test(`${key} on the offline panel presses its focused button: the sync test without a server`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      (route) => route.abort(),
    );
    await page.goto('/');
    await expect(page.getByTestId('reconnect')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('offline-sync-test')).toBeFocused();
    await page.keyboard.press(key);
    await expect(page.getByTestId('play-screen')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('with no server a panel opened over the offline one has its own hints, and closing it gives the focus back to 다시 연결', async ({ page }) => {
  const errors = trackErrors(page);
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.abort(),
  );
  await page.goto('/');
  await expect(page.getByTestId('reconnect')).toBeFocused();
  const hints = page.locator('.hintbar');
  await page.keyboard.press('KeyI');
  await expect(page.getByTestId('sync-auto')).toBeVisible();
  await expect(hints).toContainText('닫기');
  await expect(hints).not.toContainText('버튼');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('sync-auto')).toHaveCount(0);
  await expect(page.getByTestId('reconnect')).toBeFocused();
  await expect(hints).toContainText('버튼');
  // the arrows work the offline panel again
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('offline-sync-test')).toBeFocused();
  expect(errors).toEqual([]);
});

test('an empty library: the hints name 곡 추가 and the song tools, nothing to play', async ({ page }) => {
  const errors = trackErrors(page);
  await page.route(
    (url) => url.pathname === '/api/songs',
    (route) => route.fulfill({ json: { songs: [] } }),
  );
  await page.goto('/');
  await expect(page.getByTestId('song-list')).toContainText('곡 추가');
  const hints = page.locator('.hintbar');
  await expect(page.getByTestId('hint-add')).toBeVisible();
  // Enter presses the focused first step, it plays nothing
  await expect(page.getByTestId('first-upload')).toBeFocused();
  await expect(page.getByTestId('hint-enter')).toContainText('누르기');
  await expect(hints).not.toContainText('난이도');
  await expect(hints).not.toContainText('랜덤');
  // the sync test and the calibration need no song: the song info's tools are a key away
  await expect(page.getByTestId('hint-info')).toBeVisible();
  await page.keyboard.press('KeyI');
  await expect(page.getByTestId('sync-auto')).toBeVisible();
  await page.keyboard.press('KeyI');
  await page.getByTestId('hint-add').click();
  await expect(page.getByTestId('upload-button')).toBeFocused();
  await expect(hints).toContainText('고르기');
  expect(errors).toEqual([]);
});

test('an empty library starts from a music file, the demo song or the judgement offset: ↑↓ and Enter press them, and they go once a song is in', async ({ page }) => {
  const errors = trackErrors(page);
  const songs: ReturnType<typeof fakeSongs> = [];
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs } }));
  await page.route(
    (url) => url.pathname === '/api/songs/demo',
    (route) => {
      songs.push(...fakeSongs(1));
      return route.fulfill({ status: 201, json: { song: songs[0] } });
    },
  );
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K' })));
  await page.goto('/');
  const start = page.getByTestId('first-run');
  await expect(start.getByRole('button')).toHaveText(['음악 파일 고르기', '데모 곡으로 해 보기', '판정 오프셋 측정']);
  await expect(page.getByTestId('first-upload')).toBeFocused();
  // the key mode's keys and what can be put in, on one line
  await expect(page.getByTestId('first-run-keys')).toContainText('4K 키는');
  await expect(page.getByTestId('first-run-keys').locator('kbd')).toHaveText(['D', 'F', 'J', 'K']);
  await expect(page.getByTestId('first-run-keys')).toContainText('mp3');
  await expect(page.locator('.hintbar')).toContainText('버튼');

  // ↓↓: the calibration, which Enter opens; back from it, the first button has the focus again
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('first-demo')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('first-calibrate')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('calib-start')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('first-upload')).toBeFocused();
  // + then Esc leaves the focus on 곡 추가: ↓ brings it back to the first button
  await page.keyboard.press('Shift+Equal');
  await expect(page.getByTestId('upload-button')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('add-menu')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('first-upload')).toBeFocused();

  // ↑ (round to the last) ↑: the demo song; once it is in, the buttons are gone and the song is chosen
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('first-demo')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('song-item')).toHaveCount(1);
  await expect(start).toHaveCount(0);
  await expect(page.getByTestId('song-title')).toHaveText('Fake Song 01');
  expect(errors).toEqual([]);
});
