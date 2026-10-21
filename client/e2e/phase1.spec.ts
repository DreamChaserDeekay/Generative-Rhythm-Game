import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { autoplay, songInfo } from './songSelect';

const venvPython = process.platform === 'win32' ? '../server/.venv/Scripts/python.exe' : '../server/.venv/bin/python';
const python = process.env.GRG_PYTHON ?? (existsSync(venvPython) ? venvPython : 'python');

test('upload a song, wait for analysis, generate a chart and autoplay it to PERFECT PLAY', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  mkdirSync('test-results', { recursive: true });
  const wav = 'test-results/e2e-upload.wav';
  execFileSync(python, ['-m', 'rhythm_server', 'synth', '-o', wav, '--bpm', '140', '--bars', '16', '--seed', '5'], {
    env: { ...process.env, PYTHONPATH: '../server' },
  });

  await page.goto('/');
  await expect(page.getByTestId('server-offline')).toHaveCount(0);
  await page.getByTestId('file-input').setInputFiles(wav);
  await expect(page.getByTestId('song-title')).toHaveText('e2e-upload', { timeout: 30_000 });
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByTestId('song-bpm')).toHaveText('140');

  // the chart of the difficulty chosen comes by itself (its level on the plate)
  await page.getByRole('button', { name: /NORMAL/ }).click();
  await expect(page.getByTestId('chart-level')).toBeVisible({ timeout: 30_000 });
  const level = Number((await page.getByTestId('chart-level').textContent())?.replace('Lv.', ''));
  expect(level).toBeGreaterThanOrEqual(3);
  expect(level).toBeLessThanOrEqual(7);
  await page.screenshot({ path: 'test-results/song-select.png' });

  await songInfo(page);
  await expect(page.getByTestId('chart-preview')).toBeVisible();
  await page.getByTestId('toggle-analysis').click();
  await expect(page.getByTestId('analysis-view')).toBeVisible();

  await autoplay(page);
  await page.getByTestId('play-button').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await page.waitForTimeout(12000);
  await page.screenshot({ path: 'test-results/play-generated.png' });
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('result-lamp')).toHaveText('AUTO');
  await expect(page.getByTestId('result-lamp')).toHaveAttribute('data-lamp', 'PERFECT PLAY');
  await expect(page.getByTestId('result-rate')).toHaveText('100.00%');
  expect(errors).toEqual([]);
});
