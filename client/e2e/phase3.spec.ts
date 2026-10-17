import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

const venvPython = process.platform === 'win32' ? '../server/.venv/Scripts/python.exe' : '../server/.venv/bin/python';
const python = process.env.GRG_PYTHON ?? (existsSync(venvPython) ? venvPython : 'python');

// A short VP8 clip with changing colours, made with PyAV (no copyrighted material).
const MAKE_VIDEO = `
import sys, av, numpy as np
out = av.open(sys.argv[1], mode="w")
stream = out.add_stream("libvpx", rate=30)
stream.width, stream.height, stream.pix_fmt = 320, 180, "yuv420p"
for i in range(240):
    img = np.zeros((180, 320, 3), np.uint8)
    img[:, :, 0] = (i * 3) % 256
    img[:, :, 2] = 255 - (i * 2) % 256
    img[60:120, (i * 4) % 320:(i * 4) % 320 + 40, 1] = 255
    for packet in stream.encode(av.VideoFrame.from_ndarray(img, format="rgb24")):
        out.mux(packet)
for packet in stream.encode():
    out.mux(packet)
out.close()
`;

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('stem keysound, background video, camera effects and a skin on a generated chart', async ({ page }) => {
  const errors = trackErrors(page);
  mkdirSync('test-results', { recursive: true });
  const wav = 'test-results/e2e-phase3.wav';
  const video = 'test-results/e2e-phase3.webm';
  execFileSync(python, ['-m', 'rhythm_server', 'synth', '-o', wav, '--bpm', '126', '--bars', '12', '--seed', '4'], {
    env: { ...process.env, PYTHONPATH: '../server' },
  });
  execFileSync(python, ['-c', MAKE_VIDEO, video], { env: { ...process.env, PYTHONPATH: '../server' } });
  await page.addInitScript(() => {
    localStorage.setItem('grg.settings.v1', JSON.stringify({ keysound: true, skin: 'sunset', cameraFx: 1, bgBrightness: 0.6, visualizer: true }));
  });

  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(wav);
  await expect(page.getByTestId('song-title')).toHaveText('e2e-phase3', { timeout: 30_000 });
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByTestId('analysis-backends')).toContainText('스템 기본');

  await page.getByTestId('bga-input').setInputFiles(video);
  await expect(page.getByTestId('bga-status')).toHaveText('등록됨', { timeout: 30_000 });

  await page.getByRole('button', { name: /NORMAL/ }).first().click();
  await page.getByTestId('generate-button').click();
  await expect(page.getByTestId('chart-preview')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('stem-mix')).toBeVisible();

  await page.getByTestId('autoplay-toggle').check();
  await page.getByTestId('play-button').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.locator('.hud-chart')).toContainText('키음', { timeout: 60_000 });
  await expect(page.locator('.play-bg video.bg-video')).toHaveCount(1);
  await expect(page.locator('.play-bg canvas.bg-visualizer')).toHaveCount(1);
  await page.waitForTimeout(9000);
  await page.screenshot({ path: 'test-results/play-phase3.png' });
  const videoTime = await page.locator('.play-bg video.bg-video').evaluate((v) => (v as HTMLVideoElement).currentTime);
  expect(videoTime).toBeGreaterThan(1);
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('result-lamp')).toHaveText('PERFECT PLAY');
  expect(errors).toEqual([]);
});

test('custom skin from JSON in the settings', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('skin-settings')).toBeVisible();
  await page.getByTestId('skin-classic').click();
  await expect(page.getByTestId('skin-classic')).toHaveClass(/active/);
  await page.locator('.skin-json').fill('{"label": "테스트 스킨", "noteShape": "round", "laneLayout": "rainbow", "colors": {"judgeLine": "#ff00aa"}}');
  await page.getByRole('button', { name: '사용자 스킨 적용' }).click();
  await expect(page.getByTestId('skin-settings').getByRole('button', { name: '테스트 스킨' })).toHaveClass(/active/);
  await page.getByRole('button', { name: /완료/ }).click();
  await page.getByTestId('sync-auto').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'test-results/play-custom-skin.png' });
  expect(errors).toEqual([]);
});
