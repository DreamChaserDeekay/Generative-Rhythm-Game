import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { autoplay, chooseSetting, settingsTab, songInfo, tool } from './songSelect';

// Screenshots for the README and docs/TESTING.md, saved to docs/screenshots. Not part of the normal
// E2E run:  GRG_SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
// Everything on them is synthesized here (songs, keysounds, background video).
test.skip(!process.env.GRG_SCREENSHOTS, 'set GRG_SCREENSHOTS=1 to capture the screenshots');
test.describe.configure({ mode: 'serial' });

const OUT = '../docs/screenshots';
const venvPython = process.platform === 'win32' ? '../server/.venv/Scripts/python.exe' : '../server/.venv/bin/python';
const python = process.env.GRG_PYTHON ?? (existsSync(venvPython) ? venvPython : 'python');
const SHOWCASE = 'Demo Groove 150';
// song select is a tall page: show the chart's summary (and its NPS graph) under the buttons too
const TALL = { width: 1280, height: 1080 };

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

/** The saved settings. */
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
  await expect(page.getByTestId('chart-level')).toBeVisible({ timeout: 30_000 });
}

/** Every difficulty's level is known (the song select asks for them as the cursor rests on the song). */
async function levelsKnown(page: Page): Promise<void> {
  await expect(page.getByText('계산 중')).toHaveCount(0, { timeout: 60_000 });
}

async function autoplayFor(page: Page, ms: number): Promise<void> {
  await autoplay(page);
  await page.getByTestId('play-button').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await page.waitForTimeout(ms);
}

/** The chart the song select plays for a tier of the showcase (its default pattern). */
async function showcaseChart(page: Page, keyMode: string, difficulty: string): Promise<ChartNoteLite[]> {
  const songs = (await (await page.request.get('/api/songs')).json()).songs as { id: string; title: string }[];
  const song = songs.find((s) => s.title === SHOWCASE)!;
  const res = await page.request.post(`/api/songs/${song.id}/charts`, { data: { keyMode, difficulty } });
  return (await res.json()).chart.notes;
}

/** Where every buffer source starts on its context's clock: the song's start is its time 0. */
async function watchSources(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const starts: { when: number; offset: number; length: number; ctx: BaseAudioContext }[] = [];
    (window as unknown as { __starts: typeof starts }).__starts = starts;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, when = 0, offset = 0, duration?: number) {
      starts.push({ when, offset, length: this.buffer?.duration ?? 0, ctx: this.context });
      return duration === undefined ? start.call(this, when, offset) : start.call(this, when, offset, duration);
    };
  });
}

const startsSoFar = (page: Page) => page.evaluate(() => (window as unknown as { __starts: unknown[] }).__starts.length);

/** Starts the play and waits for its loading card to go. */
async function startPlay(page: Page): Promise<number> {
  const before = await startsSoFar(page);
  await page.getByTestId('play-button').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.getByTestId('play-loading')).toHaveCount(0, { timeout: 90_000 });
  return before;
}

/** Autoplay until the song heard is `ms` in (the song's sources are the first long ones the play starts). */
async function autoplayAt(page: Page, ms: number): Promise<void> {
  await autoplay(page);
  const before = await startPlay(page);
  await page.waitForFunction(
    ({ before, ms }) => {
      type Start = { when: number; offset: number; length: number; ctx: AudioContext };
      const song = (window as unknown as { __starts: Start[] }).__starts.slice(before).find((s) => s.length > 5);
      if (!song) return false;
      const heard = song.ctx.getOutputTimestamp().contextTime ?? song.ctx.currentTime;
      return (heard - (song.when - song.offset)) * 1000 >= ms;
    },
    { before, ms },
    { timeout: 120_000, polling: 16 },
  );
}

interface Hand {
  /** How late the presses are on average (ms) and how far they spread. */
  meanMs: number;
  sdMs: number;
  /** The share of the notes not played. */
  missRate: number;
  seed: number;
}

/**
 * A person's presses of a chart: each note pressed around `meanMs` late (within ±75 ms), some not
 * played at all, long notes let go around their ends.
 */
function handPresses(notes: ChartNoteLite[], hand: Hand): { t: number; lane: number; down: boolean }[] {
  let seed = hand.seed;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-9))) * Math.cos(2 * Math.PI * rand());
  const sorted = [...notes].sort((a, b) => a.t - b.t);
  const hit = sorted.map(() => rand() >= hand.missRate);
  const press = sorted.map((n) => n.t + Math.max(-75, Math.min(75, hand.meanMs + gauss() * hand.sdMs)));
  const events: { t: number; lane: number; down: boolean }[] = [];
  sorted.forEach((n, i) => {
    if (!hit[i]) return;
    let release = n.type === 'hold' && n.endT !== undefined ? n.endT + Math.max(-40, Math.min(60, 10 + gauss() * 14)) : press[i] + 55 + rand() * 30;
    const next = sorted.findIndex((m, j) => j > i && m.lane === n.lane && hit[j]);
    if (next >= 0) release = Math.min(release, press[next] - 8);
    events.push({ t: press[i], lane: n.lane, down: true }, { t: Math.max(press[i] + 8, release), lane: n.lane, down: false });
  });
  return events.sort((a, b) => a.t - b.t || Number(a.down) - Number(b.down));
}

/**
 * Plays the selected chart on the keyboard as `hand` would: the keys are sent in the page on the
 * song's clock as the game reads it (its audio output time), so it is judged as a play of one's own.
 */
async function playByHand(page: Page, notes: ChartNoteLite[], keys: string[], hand: Hand): Promise<void> {
  const before = await startPlay(page);
  await page.evaluate(
    ({ events, keys, before }) =>
      new Promise<void>((resolve) => {
        type Start = { when: number; offset: number; length: number; ctx: AudioContext };
        const song = (window as unknown as { __starts: Start[] }).__starts.slice(before).find((s) => s.length > 5) as Start;
        const zero = (song.when - song.offset) * 1000;
        // the context's time heard now, less the performance clock's (as the game's clock measures it)
        const offset = () => {
          const ts = song.ctx.getOutputTimestamp();
          if (ts.contextTime && ts.performanceTime) return ts.contextTime * 1000 - ts.performanceTime;
          return (song.ctx.currentTime - (song.ctx.outputLatency || song.ctx.baseLatency || 0)) * 1000 - performance.now();
        };
        let i = 0;
        const next = () => {
          if (i >= events.length) return resolve();
          const e = events[i];
          const at = zero + e.t - offset();
          if (at - performance.now() > 6) return void setTimeout(next, at - performance.now() - 4);
          while (performance.now() < at);
          const code = keys[e.lane];
          window.dispatchEvent(new KeyboardEvent(e.down ? 'keydown' : 'keyup', { code, key: code, bubbles: true, cancelable: true }));
          i++;
          next();
        };
        next();
      }),
    { events: handPresses(notes, hand), keys, before },
  );
}

test('song select with a generated chart, and the analysis view', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await settings(page, {});
  await page.setViewportSize(TALL);
  await page.goto('/');
  for (const demo of [
    { bpm: 128, bars: 48, seed: 7 },
    { bpm: 174, bars: 32, seed: 3 },
    { bpm: 150, bars: 24, seed: 21 },
  ]) {
    expect((await page.request.post('/api/songs/demo', { data: demo })).ok()).toBe(true);
  }
  await selectShowcase(page, '7K+1S', 'EXPERT');
  await levelsKnown(page);
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
});

test('play: 7K+1S', async ({ page }) => {
  await settings(page, { lastKeyMode: '7K+1S', hiSpeed: 3.6 });
  await selectShowcase(page, '7K+1S', 'EXPERT');
  await autoplayFor(page, 15_500);
  await shot(page, '03-play-7k');
});

test('play: background video, camera effects and a skin', async ({ page }) => {
  mkdirSync('test-results', { recursive: true });
  const video = 'test-results/showcase-bga.webm';
  if (!existsSync(video)) execFileSync(python, ['-c', MAKE_VIDEO, video]);
  // visualizer: true as an earlier version saved it; the background draws no visualizer now
  await settings(page, { lastKeyMode: '5K', skin: 'pop', cameraFx: 1, bgBrightness: 0.6, visualizer: true, keysound: true });
  await selectShowcase(page, '5K', 'HARD');
  await songInfo(page);
  await page.getByTestId('bga-input').setInputFiles(video);
  await expect(page.getByTestId('bga-status')).toHaveText('등록됨', { timeout: 60_000 });
  // the chart tilts the track at 13.6 s (until 26.4 s)
  await autoplayFor(page, 19_000);
  await expect(page.locator('canvas.bg-visualizer')).toHaveCount(0);
  await shot(page, '04-play-effects');
  // the other shots go without the video
  const songs = (await (await page.request.get('/api/songs')).json()).songs as { id: string; title: string }[];
  await page.request.delete(`/api/songs/${songs.find((x) => x.title === SHOWCASE)!.id}/bga`);
});

/**
 * The 6K+FX showcase as its side notes are drawn (over half the keys, whatever was saved: lanes of
 * their own are no longer offered), at the same moment: a side long note held, the next ones coming.
 */
async function sideNotesShot(page: Page, side: 'bar' | 'dots', name: string): Promise<void> {
  await watchSources(page);
  // an earlier version's saved 별도 레인 is drawn over half the keys too
  await settings(page, { lastKeyMode: '6K+FX', skin: 'club', cameraPreset: 'FLAT', sudden: 0.18, hiSpeed: 3.2, sideNotes: 'lanes', parts: { note: 'round', side, deck: 'mixer', hit: 'bomb' } });
  await selectShowcase(page, '6K+FX', 'EXPERT');
  const notes = await showcaseChart(page, '6K+FX', 'EXPERT');
  const held = notes.find((n) => (n.lane === 0 || n.lane === 7) && n.type === 'hold' && n.t > 8000 && (n.endT ?? 0) - n.t >= 700)!;
  await autoplayAt(page, held.t + 250);
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-side-notes', 'half');
  await shot(page, name);
}

test('play: 6K+FX side notes over half the keys with a lane cover', async ({ page }) => {
  await sideNotesShot(page, 'bar', '05-play-6kfx');
});

test('play: 6K+FX side notes of dots over half the keys', async ({ page }) => {
  await sideNotesShot(page, 'dots', '19-play-6kfx-half');
});

test('play: the flat PLANE camera, with the judge counter and a pacemaker', async ({ page }) => {
  await settings(page, { lastKeyMode: '7K+1S', cameraPreset: 'PLANE', hiSpeed: 3.6, judgeCounter: true, pacemaker: '98' });
  await selectShowcase(page, '7K+1S', 'EXPERT');
  await autoplayFor(page, 15_500);
  await shot(page, '20-play-plane');
});

test('play: four of the skins', async ({ page }) => {
  // also runs on its own (-g "four of the skins"): makes the showcase song when it is missing
  await page.goto('/');
  const songs = (await (await page.request.get('/api/songs')).json()).songs as { title: string }[];
  if (!songs.some((s) => s.title === SHOWCASE)) await page.request.post('/api/songs/demo', { data: { bpm: 150, bars: 24, seed: 21 } });
  // each with the camera it was drawn for and the parts that suit it (the skin draws colours, track
  // and type only); FEVER off: its tint would cover the skins' rail colours
  for (const [skin, keyMode, name, cameraPreset, parts] of [
    ['glass', '7K+1S', '15-skin-crystal', 'SDVX', { note: 'star4', side: 'bar', deck: 'crystal', hit: 'shards' }],
    ['jewel', '6K+FX', '16-skin-jewel', 'SDVX', { note: 'chamfer', side: 'bar', deck: 'jewel', hit: 'shards' }],
    ['arcade', '8K', '17-skin-arcade', 'FLAT', { note: 'chamfer', side: 'bar', deck: 'arcade', hit: 'star' }],
    ['pop', '4K', '18-skin-pop', 'SDVX', { note: 'round', side: 'bar', deck: 'candy', hit: 'bubbles' }],
  ] as const) {
    await settings(page, { lastKeyMode: keyMode, skin, cameraPreset, hiSpeed: 3, fever: 'OFF', parts });
    await selectShowcase(page, keyMode, 'EXPERT');
    await autoplayFor(page, 14_200);
    await shot(page, name);
  }
});

test('play: the gears for any skin, each with notes, side notes and a hit effect picked apart from the skin', async ({ page }) => {
  // also runs on its own (-g "gears for any skin"): makes the showcase song when it is missing
  await page.goto('/');
  const songs = (await (await page.request.get('/api/songs')).json()).songs as { title: string }[];
  if (!songs.some((s) => s.title === SHOWCASE)) await page.request.post('/api/songs/demo', { data: { bpm: 150, bars: 24, seed: 21 } });
  for (const [parts, keyMode, name] of [
    [{ note: 'chamfer', side: 'bar', deck: 'concrete', hit: 'wave' }, '7K+1S', '22-gear-concrete'],
    [{ note: 'round', side: 'bar', deck: 'avionics', hit: 'spark' }, '8K', '23-gear-avionics'],
    [{ note: 'star4', side: 'dots', deck: 'cassette', hit: 'grid' }, '6K+FX', '24-gear-cassette'],
    [{ note: 'star5', side: 'dots', deck: 'grand', hit: 'shutter' }, '6K+FX', '25-gear-grand'],
  ] as const) {
    await settings(page, { lastKeyMode: keyMode, skin: 'flat', parts, hiSpeed: 3, fever: 'OFF' });
    await selectShowcase(page, keyMode, 'EXPERT');
    await autoplayFor(page, 14_200);
    await shot(page, name);
  }
});

test('result of a good play: a record beaten, the offset fix', async ({ page }) => {
  // two plays of the showcase by hand
  test.setTimeout(420_000);
  await watchSources(page);
  await settings(page, { lastKeyMode: '7K+1S' });
  await selectShowcase(page, '7K+1S', 'EXPERT');
  const notes = await showcaseChart(page, '7K+1S', 'EXPERT');
  const keys = ['ShiftLeft', 'KeyS', 'KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK', 'KeyL'];
  const result = page.getByTestId('result-screen');
  // a first try, short of the clear
  await playByHand(page, notes, keys, { meanMs: 16, sdMs: 36, missRate: 0.15, seed: 20261017 });
  await expect(result).toHaveAttribute('data-settled', 'true', { timeout: 120_000 });
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('song-list')).toBeVisible();
  // then a good one, a little late
  await playByHand(page, notes, keys, { meanMs: 9, sdMs: 16, missRate: 0.012, seed: 20261022 });
  await expect(result).toHaveAttribute('data-settled', 'true', { timeout: 120_000 });
  await expect(page.getByTestId('record-tag')).toHaveText('최고 기록 갱신');
  await page.waitForTimeout(1500);
  await shot(page, '06-result');
  await page.getByTestId('result-details').click();
  await expect(page.getByTestId('offset-suggestion')).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, '07-result-graphs');
});

test('chart editor', async ({ page }) => {
  await settings(page, { lastKeyMode: '7K+1S' });
  await selectShowcase(page, '7K+1S', 'EXPERT');
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
  await songInfo(page);
  await expect(page.getByTestId('chart-source')).toContainText('키음');
  // the imported chart is chosen on its own key mode
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
  await settingsTab(page, 'gear');
  await chooseSetting(page, 'opt-skin', 'jewel');
  await page.waitForTimeout(1500);
  await shot(page, '11-settings-skins');
  // the parts picked for the gear, drawn whatever the skin
  await chooseSetting(page, 'opt-skin', 'arcade');
  await chooseSetting(page, 'opt-note-style', 'round');
  await chooseSetting(page, 'opt-deck-style', 'cassette');
  await page.getByTestId('opt-note-style').focus();
  await page.waitForTimeout(1500);
  await shot(page, '26-settings-parts');
  // the note colours: a preset, one lane chosen and its colour on the box, the hue bar and the rows
  await settingsTab(page, 'colors');
  await chooseSetting(page, 'opt-color-preset', 'hands');
  await page.getByTestId('color-lane-2').focus();
  await page.waitForTimeout(1500);
  await shot(page, '27-settings-colors');

  await page.goto('/');
  await tool(page, 'open-calibration');
  await expect(page.getByTestId('calibration-screen')).toBeVisible();
  // a player tapping a little after each click (as people do), from the beat count: data-beat
  // changes half a beat (250 ms at the screen's 120 BPM) after a click, so the tap goes on the next one
  await page.evaluate(() => {
    const ring = document.querySelector('.beat-ring') as HTMLElement;
    new MutationObserver(() => {
      if (Number(ring.dataset.beat) < 0) return;
      setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' })), 250 + 4 + Math.random() * 18);
    }).observe(ring, { attributes: true, attributeFilter: ['data-beat'] });
  });
  await page.getByRole('button', { name: '시작' }).click();
  await expect.poll(async () => Number(await page.getByTestId('calib-count').textContent()), { timeout: 30_000 }).toBeGreaterThanOrEqual(10);
  await shot(page, '12-calibration');

  // the second step: the display offset set by eye on the gear, moved a few ms and not kept yet
  await page.goto('/');
  await tool(page, 'open-visual-calibration');
  await expect(page.getByTestId('calibration-screen')).toHaveAttribute('data-step', 'visual');
  await page.waitForTimeout(2500);
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('calib-visual-offset')).toHaveText('+4ms');
  await page.waitForTimeout(400);
  await shot(page, '21-visual-calibration');
});
