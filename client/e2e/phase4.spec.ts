import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';

const venvPython = process.platform === 'win32' ? '../server/.venv/Scripts/python.exe' : '../server/.venv/bin/python';
const python = process.env.GRG_PYTHON ?? (existsSync(venvPython) ? venvPython : 'python');

// A small keysounded BMS package with synthesized samples (no copyrighted material).
const MAKE_BMS = `
import sys, numpy as np, soundfile as sf
from pathlib import Path
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
SR = 44100
def tone(f, dur, decay, amp):
    t = np.arange(int(dur * SR)) / SR
    x = (amp * np.sin(2 * np.pi * f * t) * np.exp(-t / decay)).astype(np.float32)
    return np.stack([x, x], 1)
sf.write(out / "kick.ogg", tone(55, 0.3, 0.08, 0.9), SR)
for i, f in enumerate([261.6, 329.6, 392.0]):
    sf.write(out / f"lead{i}.wav", tone(f, 0.4, 0.2, 0.4), SR)
lines = ["#TITLE E2E Keysound [HYPER]", "#ARTIST Synth", "#BPM 120", "#PLAYLEVEL 5", "#WAV01 kick.wav"]
lines += [f"#WAV1{i} lead{i}.wav" for i in range(3)]
for m in range(1, 7):
    lines += [f"#{m:03d}01:01010101", f"#{m:03d}12:10001100", f"#{m:03d}19:00120012"]
(out / "e2e_hyper.bme").write_text("\\n".join(lines) + "\\n", encoding="utf-8")
`;

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function addDemoAndPreview(page: Page) {
  await page.goto('/');
  await page.getByTestId('demo-button').click();
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole('button', { name: '4K', exact: true }).click();
  await page.getByRole('button', { name: /NORMAL/ }).first().click();
  await page.getByTestId('generate-button').click();
  await expect(page.getByTestId('chart-preview')).toBeVisible({ timeout: 30_000 });
}

async function noteCount(page: Page): Promise<number> {
  return Number(await page.getByTestId('editor-note-count').textContent());
}

test('chart editor: place, remove and save notes, then test-play from the cursor', async ({ page }) => {
  const errors = trackErrors(page);
  await addDemoAndPreview(page);
  const generated = Number(await page.getByTestId('chart-notes').textContent());
  await page.getByTestId('edit-chart').click();
  await expect(page.getByTestId('editor-screen')).toBeVisible();
  expect(await noteCount(page)).toBe(generated);

  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  // lanes are centred left of the waveform strip; aim at the first lane, above the playhead
  const laneX = Math.max(16, (box.width - 4 * 46 - 90 - 24) / 2) + 23;
  let placedAt: { x: number; y: number } | null = null;
  for (let dy = 40; dy < box.height * 0.7 && !placedAt; dy += 13) {
    const before = await noteCount(page);
    const at = { x: box.x + laneX, y: box.y + box.height * 0.8 - dy };
    await page.mouse.click(at.x, at.y);
    if ((await noteCount(page)) === before + 1) placedAt = at;
  }
  expect(placedAt).not.toBeNull();
  await page.screenshot({ path: 'test-results/editor.png' });
  // right click removes it, undo brings it back
  await page.mouse.click(placedAt!.x, placedAt!.y, { button: 'right' });
  expect(await noteCount(page)).toBe(generated);
  await page.keyboard.press('Control+z');
  expect(await noteCount(page)).toBe(generated + 1);

  await page.getByTestId('editor-save').click();
  await expect(page.getByTestId('editor-toast')).toContainText('저장했습니다');

  // test play from the cursor, then back to the editor with the edit intact
  await page.getByTestId('editor-test').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  // the play starts once its audio (and keysound stems) are loaded
  await expect(page.locator('.play-overlay')).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await page.getByRole('button', { name: /나가기/ }).click();
  await expect(page.getByTestId('editor-screen')).toBeVisible();
  expect(await noteCount(page)).toBe(generated + 1);

  await page.getByTestId('editor-exit').click();
  await expect(page.getByTestId('saved-charts')).toBeVisible();
  await expect(page.getByTestId('saved-chart')).toHaveCount(1);
  await expect(page.getByTestId('saved-chart').first()).toContainText('편집');
  await page.getByTestId('pick-saved').click();
  await expect(page.getByTestId('chart-notes')).toHaveText(String(generated + 1));
  const osu = await page.request.get(await page.getByTestId('export-osu').getAttribute('href') as string);
  expect(osu.ok()).toBe(true);
  expect(await osu.text()).toContain('[HitObjects]');
  expect(errors).toEqual([]);
});

test('import a keysounded BMS folder and autoplay it with its keysounds', async ({ page }) => {
  const errors = trackErrors(page);
  const dir = 'test-results/e2e-bms';
  rmSync(dir, { recursive: true, force: true });
  mkdirSync('test-results', { recursive: true });
  execFileSync(python, ['-c', MAKE_BMS, dir]);

  await page.goto('/');
  await page.getByTestId('import-folder-input').setInputFiles(dir);
  await expect(page.getByTestId('import-report')).toContainText('채보 1개', { timeout: 60_000 });
  await expect(page.getByTestId('song-title')).toHaveText('E2E Keysound');
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByTestId('saved-chart')).toHaveCount(1);
  await expect(page.getByTestId('saved-chart').first()).toContainText('가져옴');
  await page.getByTestId('pick-saved').click();
  await expect(page.getByTestId('chart-source')).toContainText('키음 4개');
  await expect(page.getByTestId('export-bms')).toBeVisible();
  const bms = await page.request.get(await page.getByTestId('export-bms').getAttribute('href') as string);
  expect(await bms.text()).toContain('kick.wav');

  await page.getByTestId('autoplay-toggle').check();
  await page.getByTestId('play-button').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('result-lamp')).toHaveText('PERFECT PLAY');
  expect(errors).toEqual([]);
});

test('a played run keeps its replay, and watching it gives the same result', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const demo = await page.request.post('/api/songs/demo', { data: { bpm: 140, bars: 8, seed: 11 } });
  expect(demo.ok()).toBe(true);
  await page.reload();
  await page.getByTestId('song-item').first().click();
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole('button', { name: '4K', exact: true }).click();
  await page.getByRole('button', { name: /NORMAL/ }).first().click();
  await page.getByTestId('play-button').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  // sloppy keyboard play until the result screen appears
  const keys = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'];
  for (let i = 0; i < 400; i++) {
    if (await page.getByTestId('result-screen').isVisible()) break;
    const key = keys[i % 4];
    await page.keyboard.down(key);
    await page.waitForTimeout(40);
    await page.keyboard.up(key);
    await page.waitForTimeout(60 + (i % 3) * 25);
  }
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('save-state')).toBeVisible({ timeout: 10_000 });
  const score = await page.getByTestId('result-score').textContent();
  const rate = await page.getByTestId('result-rate').textContent();
  await expect(page.getByTestId('result-regenerate')).toBeVisible();
  await expect(page.getByTestId('result-export-osu')).toBeVisible();

  await page.getByTestId('watch-replay').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.locator('.hud-chart')).toContainText('REPLAY');
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 90_000 });
  expect(await page.getByTestId('result-score').textContent()).toBe(score);
  expect(await page.getByTestId('result-rate').textContent()).toBe(rate);

  // the best play's replay is offered on the chart again
  await page.getByTestId('result-back').click();
  await page.getByTestId('generate-button').click();
  await expect(page.getByTestId('watch-best')).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('a gamepad is bound per lane in the settings and works the menus', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    const pad = {
      index: 0,
      id: 'E2E Pad',
      connected: true,
      mapping: 'standard',
      timestamp: 1,
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      axes: [0, 0, 0, 0],
    };
    (window as unknown as { __pad: typeof pad }).__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
  });
  const press = async (button: number, down: boolean) =>
    page.evaluate(
      ([b, d]) => {
        const pad = (window as unknown as { __pad: { buttons: { pressed: boolean }[]; timestamp: number } }).__pad;
        pad.buttons[b as number].pressed = d as boolean;
        pad.timestamp = performance.now();
      },
      [button, down],
    );
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('gamepad-status')).toContainText('E2E Pad');
  const firstCap = page.getByTestId('gamepad-settings').locator('.pad-cap').first();
  await firstCap.click();
  await expect(firstCap).toHaveText('…');
  await press(2, true);
  await expect(firstCap).toHaveText('버튼 2');
  await press(2, false);
  // B (button 1) is Escape in the menus: back to song select (held long enough to be polled)
  await page.waitForTimeout(100);
  await press(1, true);
  await page.waitForTimeout(100);
  await press(1, false);
  await expect(page.getByTestId('song-list')).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}'));
  expect(stored.padBindings['4K'][0]).toBe('Pad:B2');
  expect(errors).toEqual([]);
});
