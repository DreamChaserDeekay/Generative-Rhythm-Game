import { expect, test, type Page } from '@playwright/test';
import { settingsTab } from './songSelect';

/**
 * The desktop app's window as the page sees it (desktop/preload.js), played by the test: the full screen
 * calls the settings' 화면 모드 uses, and the graphics compatibility mode's, which keep what the test picks
 * as the window does (the next start's mode; the one running stays).
 */
async function asDesktop(page: Page, start: { mode: string; running: string; reverted?: { from: string; why: string } | null }, withModes = true) {
  await page.addInitScript(
    ([first, modes]) => {
      const kept = { ...(first as { mode: string; running: string; reverted?: unknown }), modes: ['default', 'no-dcomp', 'gl', 'd3d11on12'] };
      const calls: string[] = [];
      const shell: Record<string, unknown> = {
        setFullScreen: (on: boolean) => Promise.resolve(on),
        isFullScreen: () => Promise.resolve(false),
        onFullScreen: () => () => undefined,
      };
      if (modes) {
        shell.graphicsMode = () => Promise.resolve({ reverted: null, ...kept });
        shell.setGraphicsMode = (mode: string) => {
          calls.push(`set ${mode}`);
          kept.mode = mode;
          kept.reverted = null;
          return Promise.resolve({ reverted: null, ...kept });
        };
        shell.restart = () => {
          calls.push('restart');
          return Promise.resolve(true);
        };
      }
      Object.assign(window, { grgDesktop: shell, grgDesktopCalls: calls });
    },
    [start, withModes] as const,
  );
}

async function openFx(page: Page) {
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  await settingsTab(page, 'fx');
}

const calls = (page: Page) => page.evaluate(() => (window as unknown as { grgDesktopCalls: string[] }).grgDesktopCalls);

test('그래픽 호환 모드: the desktop app keeps the mode picked, and a restart applies it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await asDesktop(page, { mode: 'default', running: 'default' });
  await openFx(page);
  const row = page.getByTestId('opt-graphics-mode');
  const help = page.getByTestId('settings-help');
  await expect(row).toHaveAttribute('data-value', 'default');
  await expect(row).toContainText('기본');
  // under 화면 모드, and running as picked: nothing to restart for
  expect((await row.boundingBox())!.y).toBeGreaterThan((await page.getByTestId('opt-display-mode').boundingBox())!.y);
  await expect(page.getByTestId('graphics-mode-restart')).toHaveCount(0);
  await row.focus();
  await expect(help).toContainText("지금 '기본' 모드로 실행 중입니다.");
  await page.keyboard.press('ArrowRight');
  await expect(row).toHaveAttribute('data-value', 'no-dcomp');
  await expect(row).toContainText('DirectComposition 끄기');
  await page.keyboard.press('ArrowRight');
  await expect(row).toHaveAttribute('data-value', 'gl');
  // the window was told each pick; the help says what a restart would do, and names the default
  expect(await calls(page)).toEqual(['set no-dcomp', 'set gl']);
  await expect(help).toContainText("지금은 '기본' 모드로 실행 중이고, 앱을 다시 시작하면 'OpenGL' 모드로 열립니다.");
  await expect(help).toContainText('기본값');
  const restart = page.getByTestId('graphics-mode-restart');
  await expect(restart).toContainText('지금 다시 시작');
  await restart.focus();
  await expect(help).toContainText("'OpenGL' 모드로 다시 엽니다");
  await page.keyboard.press('Enter');
  expect(await calls(page)).toEqual(['set no-dcomp', 'set gl', 'restart']);
  // back on the mode that is running: no restart owed
  await row.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(row).toHaveAttribute('data-value', 'default');
  await expect(restart).toHaveCount(0);
  // none of it is the game's own setting
  expect(await page.evaluate(() => localStorage.getItem('grg.settings.v1') ?? '')).not.toContain('graphics');
  expect(errors).toEqual([]);
});

test('그래픽 호환 모드: a mode the app gave up is said so, with the reason', async ({ page }) => {
  await asDesktop(page, { mode: 'default', running: 'default', reverted: { from: 'gl', why: 'the game gets no WebGL under it' } });
  await openFx(page);
  await page.getByTestId('opt-graphics-mode').focus();
  await expect(page.getByTestId('settings-help')).toContainText("'OpenGL' 모드는 게임이 그래픽을 받지 못했습니다: 앱이 기본으로 되돌렸습니다.");
});

test('그래픽 호환 모드: a browser, and a desktop app older than the modes, show no row', async ({ page, context }) => {
  await openFx(page);
  await expect(page.getByTestId('opt-display-mode')).toBeVisible();
  await expect(page.getByTestId('opt-graphics-mode')).toHaveCount(0);
  const older = await context.newPage();
  await asDesktop(older, { mode: 'default', running: 'default' }, false);
  await openFx(older);
  await expect(older.getByTestId('opt-display-mode')).toBeVisible();
  await expect(older.getByTestId('opt-graphics-mode')).toHaveCount(0);
});
