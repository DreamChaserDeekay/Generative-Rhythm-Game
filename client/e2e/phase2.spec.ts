import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

const venvPython = process.platform === 'win32' ? '../server/.venv/Scripts/python.exe' : '../server/.venv/bin/python';
const python = process.env.GRG_PYTHON ?? (existsSync(venvPython) ? venvPython : 'python');

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('side tracks, EX-SCORE, HARD gauge, MIRROR and covers on the sync test', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      'grg.settings.v1',
      JSON.stringify({ lastKeyMode: '6K+FX', ruleset: 'EXSCORE', gaugeType: 'HARD', placement: 'MIRROR', sudden: 0.2, lift: 0.1, fever: 'AUTO' }),
    );
  });
  await page.goto('/');
  await page.getByTestId('sync-auto').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await page.waitForTimeout(9000);
  await page.screenshot({ path: 'test-results/play-phase2-fx.png' });
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('result-lamp')).toHaveText('PERFECT PLAY');
  await expect(page.getByTestId('result-score')).toContainText('AAA');
  const [ex, max] = ((await page.getByTestId('result-score').textContent()) ?? '').match(/[\d,]+/g)!.map((v) => Number(v.replace(/,/g, '')));
  expect(ex).toBe(max);
  await expect(page.getByTestId('result-fever')).toBeVisible();
  await page.screenshot({ path: 'test-results/result-phase2.png' });
  await page.locator('.result-screen').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.screenshot({ path: 'test-results/result-phase2-graphs.png' });
  expect(errors).toEqual([]);
});

test('generation styles, practice at 0.75x, and a HAZARD failure', async ({ page }) => {
  const errors = trackErrors(page);
  mkdirSync('test-results', { recursive: true });
  const wav = 'test-results/e2e-phase2.wav';
  execFileSync(python, ['-m', 'rhythm_server', 'synth', '-o', wav, '--bpm', '132', '--bars', '12', '--seed', '9'], {
    env: { ...process.env, PYTHONPATH: '../server' },
  });
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(wav);
  await expect(page.getByTestId('song-title')).toHaveText('e2e-phase2', { timeout: 30_000 });
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 60_000 });

  // Long-note style gives more long notes than the balanced default.
  await page.getByRole('button', { name: /HARD/ }).first().click();
  await page.getByTestId('generate-button').click();
  await expect(page.getByTestId('chart-preview')).toBeVisible({ timeout: 30_000 });
  const holds = async () => Number(((await page.getByTestId('chart-preview').locator('.preview-stats div').nth(1).textContent()) ?? '').replace(/\D/g, ''));
  const balancedHolds = await holds();
  await page.getByTestId('toggle-generation').click();
  await page.getByTestId('style-longnote').click();
  await page.getByTestId('generate-button').click();
  await expect(page.getByTestId('chart-preview')).toBeVisible({ timeout: 30_000 });
  expect(await holds()).toBeGreaterThan(balancedHolds);
  await expect(page.getByTestId('chart-minimap')).toBeVisible();

  // Practice: default eight-bar segment, 0.75x, no loop, autoplay.
  await page.getByTestId('practice-toggle').check();
  await expect(page.getByTestId('practice-options')).toBeVisible();
  const rate = page.getByTestId('practice-rate');
  await rate.focus();
  for (let i = 0; i < 5; i++) await rate.press('ArrowLeft');
  await expect(page.getByTestId('practice-options')).toContainText('0.75배');
  await page.getByTestId('practice-options').getByRole('checkbox').uncheck();
  await page.locator('.song-detail').evaluate((el) => el.scrollTo(0, 200));
  await page.screenshot({ path: 'test-results/select-phase2.png' });
  await page.getByTestId('autoplay-toggle').check();
  await page.getByTestId('play-button').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'test-results/play-practice.png' });
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('result-lamp')).toHaveText('PRACTICE');
  await expect(page.getByTestId('result-rate')).toHaveText('100.00%');
  await page.getByTestId('result-back').click();

  // HAZARD fails on the first BREAK; nobody presses anything here. (Back on the song select the
  // generated chart, the practice segment and autoplay start over.)
  await expect(page.getByTestId('autoplay-toggle')).not.toBeChecked();
  await expect(page.getByTestId('practice-toggle')).not.toBeChecked();
  await page.getByTestId('toggle-rules').click();
  await page.getByTestId('gauge-HAZARD').click();
  await page.getByTestId('play-button').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('result-lamp')).toHaveText('FAILED');
  expect(errors).toEqual([]);
});

test('keyboard rollover test and colour-blind palette in the settings', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await page.getByTestId('palette-colorblind').click();
  await expect(page.locator('html')).toHaveClass(/palette-cb/);
  await page.getByTestId('ghost-4K').click();
  await expect(page.getByTestId('ghost-test')).toBeVisible();
  for (const key of ['KeyD', 'KeyF', 'KeyJ', 'KeyK']) await page.keyboard.down(key);
  await expect(page.getByTestId('ghost-result')).toContainText('4 / 4');
  for (const key of ['KeyD', 'KeyF', 'KeyJ', 'KeyK']) await page.keyboard.up(key);
  expect(errors).toEqual([]);
});
