import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { autoplay, chooseSetting, difficultySystem, songInfo, tool } from './songSelect';

// Screenshots for the README and docs/TESTING.md, saved to docs/screenshots. Not part of the normal
// E2E run:  GRG_SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
// Everything on them is synthesized here (songs, keysounds, background video).
test.skip(!process.env.GRG_SCREENSHOTS, 'set GRG_SCREENSHOTS=1 to capture the screenshots');
test.describe.configure({ mode: 'serial' });

const OUT = '../docs/screenshots';
const venvPython = process.platform === 'win32' ? '../server/.venv/Scripts/python.exe' : '../server/.venv/bin/python';
const python = process.env.GRG_PYTHON ?? (existsSync(venvPython) ? venvPython : 'python');
const SHOWCASE = 'Demo Groove 150';
// song select is a tall page: show the chart preview under the options too
const TALL = { width: 1280, height: 1000 };

// An animated plasma background video (VP8), made with PyAV.
const MAKE_VIDEO = `
import sys, av, numpy as np
out = av.open(sys.argv[1], mode="w")
stream = out.add_stream("libvpx", rate=24)
stream.width, stream.height, stream.pix_fmt = 320, 180, "yuv420p"
stream.bit_rate = 1_500_000
y, x = np.mgrid[0:180, 0:320].astype(np.float32)
for i in range(24 * 50):
    t = i / 24
    v = np.sin(x * 0.045 + t * 1.1) + np.sin(y * 0.06 - t * 1.4) + np.sin((x + y) * 0.025 + t * 0.6)
    v += np.sin(np.hypot(x - 160 - 90 * np.sin(t * 0.4), y - 90 - 50 * np.cos(t * 0.5)) * 0.05)
    glow = 0.5 + 0.5 * np.sin(v * 1.5)
    img = np.stack([0.10 + 0.55 * glow ** 2, 0.04 + 0.22 * glow ** 3, 0.22 + 0.55 * glow], -1)
    frame = av.VideoFrame.from_ndarray((img * 255).clip(0, 255).astype(np.uint8), format="rgb24")
    for packet in stream.encode(frame):
        out.mux(packet)
for packet in stream.encode():
    out.mux(packet)
out.close()
`;

// A small keysounded BMS package with synthesized samples.
const MAKE_BMS = `
import sys, numpy as np, soundfile as sf
from pathlib import Path
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
SR = 44100
def tone(f, dur, decay, amp, harmonics=3):
    t = np.arange(int(dur * SR)) / SR
    x = sum(amp / (h + 1) * np.sin(2 * np.pi * f * (h + 1) * t) for h in range(harmonics)) * np.exp(-t / decay)
    x = x.astype(np.float32)
    return np.stack([x, x], 1)
sf.write(out / "kick.wav", tone(52, 0.35, 0.09, 0.9, 1), SR)
sf.write(out / "hat.wav", (np.random.default_rng(1).normal(0, 0.15, (3000, 2)) * np.exp(-np.arange(3000) / 500)[:, None]).astype(np.float32), SR)
notes = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3]
for i, f in enumerate(notes):
    sf.write(out / f"key{i}.wav", tone(f, 0.5, 0.25, 0.35), SR)
lines = ["#PLAYER 1", "#TITLE Keysound Sketch [ANOTHER]", "#ARTIST GRG synth", "#GENRE TEST", "#BPM 140", "#PLAYLEVEL 9",
         "#WAV01 kick.wav", "#WAV02 hat.wav"] + [f"#WAV1{i} key{i}.wav" for i in range(7)]
lanes = ["11", "12", "13", "14", "15", "18", "19"]
rng = np.random.default_rng(5)
for m in range(1, 17):
    lines += [f"#{m:03d}01:0100010001000100", f"#{m:03d}01:0000020000000200"]
    cells = [["00"] * 8 for _ in lanes]
    for step in range(8):
        for k in rng.choice(7, size=1 + int(rng.random() < 0.3), replace=False):
            cells[k][step] = f"1{(k + step) % 7}"
    lines += [f"#{m:03d}{lane}:" + "".join(c) for lane, c in zip(lanes, cells)]
(out / "sketch_another.bme").write_text("\\n".join(lines) + "\\n", encoding="utf-8")
`;

interface ChartNoteLite {
  t: number;
  lane: number;
  type: 'tap' | 'hold';
  endT?: number;
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

async function settings(page: Page, values: Record<string, unknown>): Promise<void> {
  await page.addInitScript((v) => localStorage.setItem('grg.settings.v1', JSON.stringify(v)), values);
}

async function selectShowcase(page: Page, keyMode: string, difficulty: string): Promise<void> {
  await page.goto('/');
  await page.getByTestId('song-item').filter({ hasText: SHOWCASE }).click();
  await expect(page.getByTestId('song-title')).toHaveText(SHOWCASE);
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 90_000 });
  await page.getByRole('button', { name: keyMode, exact: true }).click();
  await page.getByRole('button', { name: new RegExp(difficulty) }).first().click();
  await page.getByTestId('generate-button').click();
  await expect(page.getByTestId('chart-level')).toBeVisible({ timeout: 30_000 });
}

async function autoplayFor(page: Page, ms: number): Promise<void> {
  await autoplay(page);
  await page.getByTestId('play-button').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await page.waitForTimeout(ms);
}

/**
 * A replay of a good (not perfect) player: presses spread around each note like a human's,
 * a few notes skipped. The game judges it like any other replay.
 */
function humanReplay(notes: ChartNoteLite[], chartId: string, songId: string): unknown {
  let seed = 20261017;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-9))) * Math.cos(2 * Math.PI * rand());
  const sorted = [...notes].sort((a, b) => a.t - b.t);
  const hit = sorted.map(() => rand() > 0.012);
  const press = sorted.map((n) => n.t + Math.max(-75, Math.min(75, -4 + gauss() * 17)));
  const events: [number, number, number][] = [];
  sorted.forEach((n, i) => {
    if (!hit[i]) return;
    let release = n.type === 'hold' && n.endT !== undefined ? n.endT + Math.max(-50, Math.min(60, 10 + gauss() * 14)) : press[i] + 55 + rand() * 30;
    const next = sorted.findIndex((m, j) => j > i && m.lane === n.lane && hit[j]);
    if (next >= 0) release = Math.min(release, press[next] - 8);
    events.push([1, n.lane, press[i]], [0, n.lane, Math.max(press[i] + 8, release)]);
  });
  const last = Math.max(...events.map((e) => e[2]));
  for (let t = sorted[0].t - 1500; t < last + 1500; t += 16) events.push([2, 0, t]);
  // in time order; at equal times release (0) before press (1) before update (2)
  events.sort((a, b) => a[2] - b[2] || a[0] - b[0]);
  return {
    version: 1,
    chartId,
    songId,
    recordedAt: Date.now(),
    settings: { judgementMode: 'NORMAL', ruleset: 'RESPECT', gaugeType: 'NORMAL', fever: 'AUTO', placement: 'OFF', placementSeed: 0, hiSpeed: 4 },
    log: events.flat().map((v) => Math.round(v * 1000) / 1000),
    result: { score: 0, rate: 0, maxCombo: 0, lamp: 'CLEAR' },
  };
}

test('song select with a generated chart, and the analysis view', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize(TALL);
  await page.goto('/');
  for (const demo of [
    { bpm: 128, bars: 48, seed: 7 },
    { bpm: 174, bars: 32, seed: 3 },
    { bpm: 150, bars: 24, seed: 21 },
  ]) {
    expect((await page.request.post('/api/songs/demo', { data: demo })).ok()).toBe(true);
  }
  await selectShowcase(page, '7K+1S', 'MAXIMUM');
  await page.mouse.move(0, 0);
  await shot(page, '01-song-select');

  await songInfo(page);
  await page.getByTestId('toggle-analysis').click();
  await expect(page.getByTestId('analysis-view')).toBeVisible();
  await page.getByTestId('analysis-view').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(500);
  await shot(page, '02-analysis');

  // the song's sections: coloured by repetition group on the minimap, editable in the song settings
  await page.getByTestId('toggle-analysis').click();
  await page.getByTestId('edit-sections').click();
  await expect(page.getByTestId('section-row').first()).toBeVisible();
  await page.getByTestId('chart-minimap').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  await shot(page, '02b-sections');
  await page.getByTestId('edit-sections').click();
  await page.getByTestId('toggle-analysis').click();

  // the same song on EZ2ON's scale
  await page.getByTestId('toggle-analysis').click();
  await difficultySystem(page, 'EZ2ON');
  await page.getByRole('button', { name: /SUPER HARD/ }).click();
  await page.getByTestId('generate-button').click();
  await expect(page.getByTestId('chart-level')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.difficulty.active')).toContainText('SUPER HARD');
  await page.mouse.move(0, 0);
  await shot(page, '01b-song-select-ez2on');
  await difficultySystem(page, 'DJMAX');
});

test('play: 7K+1S', async ({ page }) => {
  await settings(page, { lastKeyMode: '7K+1S', hiSpeed: 3.6 });
  await selectShowcase(page, '7K+1S', 'MAXIMUM');
  await autoplayFor(page, 15_500);
  await shot(page, '03-play-7k');
});

test('play: background video, visualizer, camera effects and a skin', async ({ page }) => {
  mkdirSync('test-results', { recursive: true });
  const video = 'test-results/showcase-bga.webm';
  if (!existsSync(video)) execFileSync(python, ['-c', MAKE_VIDEO, video]);
  await settings(page, { lastKeyMode: '5K', skin: 'pop', cameraFx: 1, bgBrightness: 0.6, visualizer: true, keysound: true });
  await selectShowcase(page, '5K', 'HARD');
  await songInfo(page);
  await page.getByTestId('bga-input').setInputFiles(video);
  await expect(page.getByTestId('bga-status')).toHaveText('등록됨', { timeout: 60_000 });
  // the chart tilts the track at 13.6 s (until 26.4 s)
  await autoplayFor(page, 19_000);
  await shot(page, '04-play-effects');
  // the other shots go without the video
  const songs = (await (await page.request.get('/api/songs')).json()).songs as { id: string; title: string }[];
  await page.request.delete(`/api/songs/${songs.find((x) => x.title === SHOWCASE)!.id}/bga`);
});

test('play: 6K+FX side tracks with a lane cover', async ({ page }) => {
  await settings(page, { lastKeyMode: '6K+FX', skin: 'club', cameraPreset: 'FLAT', sudden: 0.18, hiSpeed: 3.2 });
  await selectShowcase(page, '6K+FX', 'MAXIMUM');
  await autoplayFor(page, 16_000);
  await shot(page, '05-play-6kfx');
});

test('play: four of the skins', async ({ page }) => {
  // also runs on its own (-g "four of the skins"): makes the showcase song when it is missing
  await page.goto('/');
  const songs = (await (await page.request.get('/api/songs')).json()).songs as { title: string }[];
  if (!songs.some((s) => s.title === SHOWCASE)) await page.request.post('/api/songs/demo', { data: { bpm: 150, bars: 24, seed: 21 } });
  // each with the camera it was drawn for; FEVER off: its tint would cover the skins' rail colours
  for (const [skin, keyMode, name, cameraPreset] of [
    ['glass', '7K+1S', '15-skin-crystal', 'SDVX'],
    ['jewel', '6K+FX', '16-skin-jewel', 'SDVX'],
    ['arcade', '8K', '17-skin-arcade', 'FLAT'],
    ['pop', '4K', '18-skin-pop', 'SDVX'],
  ]) {
    await settings(page, { lastKeyMode: keyMode, skin, cameraPreset, hiSpeed: 3, fever: 'OFF' });
    await selectShowcase(page, keyMode, 'MAXIMUM');
    await autoplayFor(page, 14_200);
    await shot(page, name);
  }
});

test('result of a good play', async ({ page }) => {
  await settings(page, { lastKeyMode: '7K+1S' });
  await selectShowcase(page, '7K+1S', 'MAXIMUM');
  const songs = (await (await page.request.get('/api/songs')).json()).songs as { id: string; title: string }[];
  const song = songs.find((s) => s.title === SHOWCASE)!;
  const chart = (await (await page.request.post(`/api/songs/${song.id}/charts`, { data: { keyMode: '7K+1S', difficulty: 'MX', system: 'DJMAX' } })).json()).chart;
  const file = 'test-results/showcase.grgreplay.json';
  writeFileSync(file, JSON.stringify(humanReplay(chart.notes, chart.meta.chartId, song.id)));
  await page.getByTestId('replay-input').setInputFiles(file);
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.getByTestId('result-screen')).toHaveAttribute('data-settled', 'true', { timeout: 120_000 });
  await page.waitForTimeout(1500);
  await shot(page, '06-result');
  await page.getByTestId('result-details').click();
  await page.waitForTimeout(800);
  await shot(page, '07-result-graphs');
});

test('chart editor', async ({ page }) => {
  await settings(page, { lastKeyMode: '7K+1S' });
  await selectShowcase(page, '7K+1S', 'MAXIMUM');
  await songInfo(page);
  await page.getByTestId('edit-chart').click();
  await expect(page.getByTestId('editor-screen')).toBeVisible();
  for (let i = 0; i < 9; i++) await page.keyboard.press('Shift+ArrowUp');
  await page.waitForTimeout(500);
  await shot(page, '08-editor');
});

test('importing a keysounded BMS folder', async ({ page }) => {
  const dir = 'test-results/showcase-bms';
  rmSync(dir, { recursive: true, force: true });
  execFileSync(python, ['-c', MAKE_BMS, dir]);
  await page.setViewportSize(TALL);
  await page.goto('/');
  await page.getByTestId('import-folder-input').setInputFiles(dir);
  await expect(page.getByTestId('import-report')).toContainText('채보 1개', { timeout: 60_000 });
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 90_000 });
  await page.getByTestId('pick-saved').click();
  await songInfo(page);
  await expect(page.getByTestId('chart-source')).toContainText('키음');
  // picking the imported chart shows its key mode and difficulty on the tabs
  await expect(page.getByRole('button', { name: '7K+1S', exact: true })).toHaveClass(/active/);
  await page.mouse.move(0, 0);
  await shot(page, '09-import');
});

test('settings and calibration', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  await page.waitForTimeout(1000);
  await shot(page, '10-settings');
  // another skin in the preview
  await chooseSetting(page, 'opt-skin', 'jewel');
  await page.waitForTimeout(1500);
  await shot(page, '11-settings-skins');

  await page.goto('/');
  await tool(page, 'open-calibration');
  await expect(page.getByTestId('calibration-screen')).toBeVisible();
  // a player tapping a little after each click (as people do), from the beat lamp
  await page.evaluate(() => {
    const lamp = document.querySelector('.beat-ring') as HTMLElement;
    new MutationObserver(() => {
      if (!lamp.classList.contains('on')) return;
      setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' })), 4 + Math.random() * 18);
    }).observe(lamp, { attributes: true, attributeFilter: ['class'] });
  });
  await page.getByRole('button', { name: '시작' }).click();
  await expect.poll(async () => Number(await page.getByTestId('calib-count').textContent()), { timeout: 30_000 }).toBeGreaterThanOrEqual(10);
  await shot(page, '12-calibration');
});
