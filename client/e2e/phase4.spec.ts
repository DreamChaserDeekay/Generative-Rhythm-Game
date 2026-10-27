import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { keysoundBusGain } from './audio';
import { addFromMenu, autoplay, settingsTab, songInfo } from './songSelect';

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
  await addFromMenu(page, 'demo-button');
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole('button', { name: '4K', exact: true }).click();
  await page.getByRole('button', { name: /NORMAL/ }).first().click();
  await expect(page.getByTestId('chart-level')).toBeVisible({ timeout: 30_000 });
  await songInfo(page);
  await expect(page.getByTestId('chart-preview')).toBeVisible({ timeout: 30_000 });
}

async function noteCount(page: Page): Promise<number> {
  return Number(await page.getByTestId('editor-note-count').textContent());
}

/**
 * Waits for the play's loading overlay to go, polling it: the page must keep answering meanwhile
 * (only the server and the audio decoder are waited on). A backdrop blur on the overlay once kept
 * a software GPU busy, and the track's WebGL setup froze the page behind it for over 10 s.
 */
async function waitForPlayStart(page: Page, timeoutMs: number): Promise<void> {
  const start = Date.now();
  let slowestMs = 0;
  for (;;) {
    const asked = Date.now();
    const shown = await page.locator('.play-overlay').count();
    slowestMs = Math.max(slowestMs, Date.now() - asked);
    if (shown === 0) break;
    expect(Date.now() - start, 'the play should have started').toBeLessThan(timeoutMs);
    await page.waitForTimeout(100);
  }
  console.log('play start:', JSON.stringify({ overlayMs: Date.now() - start, slowestMs }));
  expect(slowestMs, 'slowest answer while the play was loading (ms)').toBeLessThan(3000);
}

/** Animation frames per second the page runs at over `ms`. */
async function framesPerSecond(page: Page, ms: number): Promise<number> {
  return page.evaluate(
    (ms) =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = (now: number) => {
          if (now - start >= ms) resolve((frames * 1000) / (now - start));
          else {
            frames++;
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
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
  // the first lane is where its head is under the canvas: aim at it, above the playhead
  const head = (await page.getByTestId('editor-lane-0').boundingBox())!;
  let placedAt: { x: number; y: number } | null = null;
  for (let dy = 40; dy < box.height * 0.7 && !placedAt; dy += 13) {
    const before = await noteCount(page);
    const at = { x: head.x + head.width / 2, y: box.y + box.height * 0.8 - dy };
    await page.mouse.click(at.x, at.y);
    if ((await noteCount(page)) === before + 1) placedAt = at;
  }
  expect(placedAt).not.toBeNull();
  await page.screenshot({ path: 'test-results/editor.png' });
  // right click removes it, undo brings it back (from the 편집 menu, as Ctrl+Z does)
  await page.mouse.click(placedAt!.x, placedAt!.y, { button: 'right' });
  expect(await noteCount(page)).toBe(generated);
  await page.getByTestId('editor-edit-menu').click();
  await expect(page.getByTestId('editor-undo')).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await noteCount(page)).toBe(generated + 1);
  await expect(page.getByTestId('editor-undo')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  expect(await noteCount(page)).toBe(generated);
  await page.keyboard.press('Control+y');
  expect(await noteCount(page)).toBe(generated + 1);

  await page.getByTestId('editor-save').click();
  await expect(page.getByTestId('editor-toast')).toContainText('저장했습니다');

  // test play from the cursor, then back to the editor with the edit intact
  await page.getByTestId('editor-test').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  // the play starts once its audio and keysound stems are loaded (the first time the server may
  // still be separating the stems, which it starts right after the analysis)
  await waitForPlayStart(page, 30_000);
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  // the paused track is not redrawn, so the pause screen stays smooth without a GPU too (redrawn
  // every frame under the pause menu's former backdrop blur, it ran at ~4 fps there)
  await page.waitForTimeout(500);
  const pausedFps = await framesPerSecond(page, 1000);
  console.log('paused fps:', pausedFps.toFixed(1));
  expect(pausedFps).toBeGreaterThan(20);
  await page.getByRole('button', { name: /나가기/ }).click();
  await expect(page.getByTestId('editor-screen')).toBeVisible();
  expect(await noteCount(page)).toBe(generated + 1);

  await page.getByTestId('editor-exit').click();
  await expect(page.getByTestId('saved-charts')).toBeVisible();
  await expect(page.getByTestId('saved-chart')).toHaveCount(1);
  await expect(page.getByTestId('saved-chart').first()).toContainText('편집');
  await page.getByTestId('pick-saved').click();
  await songInfo(page);
  await expect(page.getByTestId('chart-notes')).toHaveText(String(generated + 1));
  const osu = await page.request.get(await page.getByTestId('export-osu').getAttribute('href') as string);
  expect(osu.ok()).toBe(true);
  expect(await osu.text()).toContain('[HitObjects]');
  expect(errors).toEqual([]);
});

test('the chart editor zooms its timeline with Ctrl+wheel, not the page', async ({ page }) => {
  const errors = trackErrors(page);
  await addDemoAndPreview(page);
  await page.getByTestId('edit-chart').click();
  await expect(page.getByTestId('editor-screen')).toBeVisible();
  const stats = page.locator('.editor-stats');
  await expect(stats).toContainText('확대 ×1.00');

  // Ctrl+wheel up over the timeline: one step in, the page's own zoom untouched
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  const ratio = await page.evaluate(() => devicePixelRatio);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect(stats).toContainText('확대 ×1.20');
  expect(await page.evaluate(() => devicePixelRatio)).toBe(ratio);
  // the browser is told the wheel is the editor's
  const prevented = await canvas.evaluate((c) => {
    const e = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true });
    c.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect(stats).toContainText('확대 ×1.44');

  // the wheel alone still moves the cursor, at the same zoom
  const cursor = stats.locator('div').nth(1);
  const before = (await cursor.textContent())!;
  await page.mouse.wheel(0, -300);
  await expect(cursor).not.toHaveText(before);
  await expect(stats).toContainText('확대 ×1.44');
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
  // its own entry after the difficulties, on its key mode, chosen already; its file's level beside ours
  await expect(page.getByTestId('saved-chart')).toHaveCount(1);
  await expect(page.getByTestId('saved-chart').first()).toContainText('BMS');
  await expect(page.getByTestId('saved-chart').first()).toContainText('원본 5 · 추정');
  await expect(page.getByTestId('saved-chart').first()).toHaveClass(/active/);
  await page.getByTestId('pick-saved').click();
  await songInfo(page);
  await expect(page.getByTestId('chart-source')).toContainText('키음 4개');
  await expect(page.getByTestId('export-bms')).toBeVisible();
  const bms = await page.request.get(await page.getByTestId('export-bms').getAttribute('href') as string);
  expect(await bms.text()).toContain('kick.wav');
  // the gain that keeps the package's mix from clipping
  const { songs } = (await (await page.request.get('/api/songs')).json()) as { songs: { id: string; title: string }[] };
  const songId = songs.find((s) => s.title === 'E2E Keysound')?.id;
  const { gain } = (await (await page.request.get(`/api/songs/${songId}/keysounds.json`)).json()) as { gain: number };

  await autoplay(page);
  await page.getByTestId('play-button').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  // the note keysounds sound 1.2 times as loud as that
  await expect.poll(() => keysoundBusGain(page), { timeout: 60_000 }).toBeCloseTo(gain * 1.2, 5);
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('result-lamp')).toHaveText('AUTO');
  await expect(page.getByTestId('result-lamp')).toHaveAttribute('data-lamp', 'PERFECT PLAY');
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
  // the replay and the chart files are in the details (Space)
  await page.keyboard.press('Space');
  await expect(page.getByTestId('result-export-osu')).toBeVisible();

  await page.getByTestId('watch-replay').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.locator('.hud')).toHaveAttribute('data-mode', 'replay');
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 90_000 });
  expect(await page.getByTestId('result-score').textContent()).toBe(score);
  expect(await page.getByTestId('result-rate').textContent()).toBe(rate);

  // the best play's replay is offered on the chart again
  await page.getByTestId('result-back').click();
  await expect(page.getByTestId('chart-level')).toBeVisible({ timeout: 30_000 });
  await songInfo(page);
  await expect(page.getByTestId('watch-best')).toBeVisible();
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
  await settingsTab(page, 'pad');
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

test('the chart editor names its lanes under the canvas, keeps its menu and hints, and tests the chart as written', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem('grg.settings.v1')) localStorage.setItem('grg.settings.v1', JSON.stringify({ placement: 'R-RANDOM', gaugeType: 'HARD' }));
  });
  await addDemoAndPreview(page);
  await page.getByTestId('edit-chart').click();
  await expect(page.getByTestId('editor-screen')).toBeVisible();
  // the top bar names the screen and what it is on; the lanes' keys under them, in order
  await expect(page.locator('.topbar .screen-name')).toHaveText('채보 편집');
  await expect(page.locator('.topbar .screen-detail')).toContainText('4K');
  await expect(page.getByTestId('editor-lanes').locator('kbd')).toHaveText(['D', 'F', 'J', 'K']);
  const canvas = (await page.getByTestId('editor-canvas').boundingBox())!;
  const heads = await Promise.all([0, 3].map(async (i) => (await page.getByTestId(`editor-lane-${i}`).boundingBox())!));
  expect(heads[0].x).toBeGreaterThan(canvas.x + 90);
  expect(heads[1].x).toBeGreaterThan(heads[0].x);
  await expect(page.getByTestId('editor-bpm')).toContainText('BPM');
  const hints = page.locator('.hintbar');
  await expect(hints).toContainText('커서부터 테스트');
  await expect(hints).toContainText('나가기');
  await expect(page.getByTestId('editor-exit')).toContainText('Esc');
  // the 편집 menu: ↓ through it, Esc closes it (and leaves the editor open)
  await page.getByTestId('editor-edit-menu').click();
  await expect(page.getByTestId('editor-mirror')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('editor-mirror')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('editor-mirror')).toHaveCount(0);
  await expect(page.getByTestId('editor-edit-menu')).toBeFocused();
  await expect(page.getByTestId('editor-screen')).toBeVisible();
  // the open menu has the keys: M waits (no mirror), Space presses the focused item (미러), not
  // the playback; ↑ from none of its items goes to the last; Tab out of it closes it
  const detail = page.locator('.topbar .screen-detail');
  await expect(detail).not.toContainText('저장 안 됨');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('editor-mirror')).toBeFocused();
  await page.keyboard.press('KeyM');
  await expect(page.getByTestId('editor-mirror')).toBeFocused();
  await expect(detail).not.toContainText('저장 안 됨');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('editor-mirror')).toHaveCount(0);
  await expect(detail).toContainText('저장 안 됨');
  await expect(hints).toContainText('재생');
  await expect(hints).not.toContainText('정지');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('editor-undo')).toBeFocused();
  await page.getByTestId('editor-edit-menu').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('editor-mirror')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('editor-mirror')).toHaveCount(0);
  await expect(page.getByTestId('editor-screen')).toBeVisible();

  // T: an editor test, on no placement whatever the settings say (they stay the player's)
  await page.keyboard.press('KeyT');
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await waitForPlayStart(page, 30_000);
  await expect(page.locator('.hud-chip')).toContainText(['에디터 테스트']);
  // SPEED changed in it is kept, over the player's own placement and gauge
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('hud-speed')).toHaveText('4.10');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /나가기/ }).click();
  await expect(page.getByTestId('editor-screen')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}'))).toMatchObject({ placement: 'R-RANDOM', gaugeType: 'HARD', hiSpeed: 4.1 });
  expect(errors).toEqual([]);
});
