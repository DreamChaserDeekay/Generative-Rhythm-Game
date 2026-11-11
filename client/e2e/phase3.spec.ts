import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { keysoundBusGain } from './audio';
import { addFromMenu, autoplay, chooseSetting, fakeSongs, playOptions, settingsTab, songInfo, tool } from './songSelect';

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

/**
 * The widest run of FXL's colour (the default palette's purple) along a row of the play's track
 * above the judge line, and its middle, as shares of the screen's width: a side note in a lane of
 * its own is a narrow one at the track's edge; laid over the keys, a bar across their left half.
 */
async function sideBar(page: Page): Promise<{ width: number; middle: number }> {
  const screen = page.viewportSize() ?? { width: 1280, height: 720 };
  // from near the track's far end down to just above the judge line (77 % of the height)
  const png = await page.screenshot({ clip: { x: 0, y: Math.round(screen.height * 0.1), width: screen.width, height: Math.round(screen.height * 0.62) } });
  return page.evaluate(async (data) => {
    const picture = await createImageBitmap(await (await fetch(data)).blob());
    const canvas = new OffscreenCanvas(picture.width, picture.height);
    const g = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    g.drawImage(picture, 0, 0);
    const { width, height } = canvas;
    const px = g.getImageData(0, 0, width, height).data;
    const widest = { width: 0, middle: 0 };
    for (let y = 0; y < height; y += 2) {
      let run = 0;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const [r, gr, b] = [px[i], px[i + 1], px[i + 2]];
        run = b > 120 && b - r > 25 && r - gr > 15 ? run + 1 : 0;
        if (run / width > widest.width) Object.assign(widest, { width: run / width, middle: (x - run / 2) / width });
      }
    }
    return widest;
  }, `data:image/png;base64,${png.toString('base64')}`);
}

test('stem keysound, background video and camera effects on a generated chart', async ({ page }) => {
  const errors = trackErrors(page);
  mkdirSync('test-results', { recursive: true });
  const wav = 'test-results/e2e-phase3.wav';
  const video = 'test-results/e2e-phase3.webm';
  execFileSync(python, ['-m', 'rhythm_server', 'synth', '-o', wav, '--bpm', '126', '--bars', '12', '--seed', '4'], {
    env: { ...process.env, PYTHONPATH: '../server' },
  });
  execFileSync(python, ['-c', MAKE_VIDEO, video], { env: { ...process.env, PYTHONPATH: '../server' } });
  await page.addInitScript(() => {
    localStorage.setItem('grg.settings.v1', JSON.stringify({ keysound: true, cameraFx: 1, bgBrightness: 0.6, visualizer: true }));
  });

  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(wav);
  await expect(page.getByTestId('song-title')).toHaveText('e2e-phase3', { timeout: 30_000 });
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 60_000 });
  await songInfo(page);
  await expect(page.getByTestId('analysis-backends')).toContainText('스템 기본');

  await page.getByTestId('bga-input').setInputFiles(video);
  await expect(page.getByTestId('bga-status')).toHaveText('등록됨', { timeout: 30_000 });

  await page.getByRole('button', { name: /NORMAL/ }).first().click();
  await expect(page.getByTestId('chart-preview')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('stem-mix')).toBeVisible();

  await autoplay(page);
  await page.getByTestId('hint-enter').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  // the play's keysounds come from the stems (the HUD names them, not on the screen)
  await expect(page.locator('.hud')).toHaveAttribute('data-keysounds', /\S/, { timeout: 60_000 });
  // a hit sounds 1.2 times as loud as its stem in the song
  await expect.poll(() => keysoundBusGain(page)).toBeCloseTo(1.2, 5);
  await expect(page.locator('.play-bg video.bg-video')).toHaveCount(1);
  // the background visualizer is gone: an earlier version's saved visualizer: true draws none
  await expect(page.locator('.play-bg canvas.bg-visualizer')).toHaveCount(0);
  await page.waitForTimeout(9000);
  await page.screenshot({ path: 'test-results/play-phase3.png' });
  // the default gear's deck houses the score, SPEED and the rate: under the judge line, on the screen, the score between the two
  const [speed, score, rate] = await Promise.all(['.hud-speed', '.hud-score', '.hud-rate'].map((sel) => page.locator(sel).boundingBox()));
  expect(speed && score && rate && speed.x >= 0 && speed.x < score.x && score.x < rate.x && rate.x + rate.width <= 1280 && score.y > 360 && score.y + score.height <= 720).toBe(true);
  const videoTime = await page.locator('.play-bg video.bg-video').evaluate((v) => (v as HTMLVideoElement).currentTime);
  expect(videoTime).toBeGreaterThan(1);
  // the chart tilts the track at 12 s: the combo and the judgement lie on it and turn with it
  // (the screen angle of a line across the track through each, under the HUD plane's projection)
  const tilt = (sel: string) =>
    page.locator(sel).evaluate((el) => {
      const box = el as HTMLElement;
      const m = new DOMMatrix(getComputedStyle(box.offsetParent as HTMLElement).transform);
      const at = (dx: number) => {
        const p = m.transformPoint(new DOMPoint(box.offsetLeft + dx, box.offsetTop));
        return [p.x / p.w, p.y / p.w];
      };
      const [a, b] = [at(-50), at(50)];
      return Math.abs((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI);
    });
  await expect.poll(() => tilt('.hud-combo'), { timeout: 15_000 }).toBeGreaterThan(2);
  expect(await tilt('.hud-judge')).toBeGreaterThan(2);
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('result-lamp')).toHaveText('AUTO');
  await expect(page.getByTestId('result-lamp')).toHaveAttribute('data-lamp', 'PERFECT PLAY');
  expect(errors).toEqual([]);
});

// Stands in for YouTube's IFrame Player API (no network): records what the game asks of the player.
const FAKE_YOUTUBE_API = `
window.__yt = { calls: [] };
window.YT = {
  Player: function (element, options) {
    const rec = window.__yt;
    rec.videoId = options.videoId;
    rec.host = options.host;
    let state = -1;
    let time = 0;
    const frame = document.createElement('iframe');
    element.replaceWith(frame);
    this.playVideo = () => { rec.calls.push('play'); state = 1; };
    this.pauseVideo = () => { rec.calls.push('pause'); state = 2; };
    this.seekTo = (s) => { rec.calls.push('seek'); time = s; };
    this.getCurrentTime = () => time;
    this.getDuration = () => 600;
    this.getPlayerState = () => state;
    this.setPlaybackRate = (r) => rec.calls.push('rate ' + r);
    this.mute = () => rec.calls.push('mute');
    this.destroy = () => rec.calls.push('destroy');
    setTimeout(() => options.events.onReady(), 0);
  },
};
if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
`;

test('a YouTube link as the background video', async ({ page }) => {
  const errors = trackErrors(page);
  await page.route('https://www.youtube.com/iframe_api', (route) => route.fulfill({ contentType: 'text/javascript', body: FAKE_YOUTUBE_API }));
  const calls = () => page.evaluate(() => ((window as unknown as { __yt?: { calls: string[] } }).__yt?.calls ?? []).join(' '));
  await page.goto('/');
  await addFromMenu(page, 'demo-button');
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 60_000 });
  await songInfo(page);
  // the link is typed into the page: the desktop app (Electron) cannot show prompt dialogs
  page.on('dialog', (d) => {
    errors.push(`unexpected dialog: ${d.message()}`);
    void d.dismiss();
  });
  await page.getByTestId('bga-youtube').click();
  // a link the server cannot read keeps the form open and says so
  await page.getByTestId('bga-youtube-input').fill('https://example.com/video');
  await page.getByTestId('bga-youtube-save').click();
  await expect(page.getByTestId('select-error')).toContainText('유튜브 영상 링크');
  await expect(page.getByTestId('bga-youtube-form')).toBeVisible();
  await page.getByTestId('bga-youtube-input').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s');
  await page.getByTestId('bga-youtube-input').press('Enter');
  await expect(page.getByTestId('bga-status')).toHaveText('유튜브');
  await expect(page.getByTestId('bga-youtube-form')).toHaveCount(0);
  await expect(page.getByTestId('bga-youtube-hint')).toBeVisible();

  await page.getByRole('button', { name: /NORMAL/ }).first().click();
  await expect(page.getByTestId('chart-preview')).toBeVisible({ timeout: 30_000 });
  await autoplay(page);
  await page.getByTestId('hint-enter').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect.poll(calls, { timeout: 60_000 }).toContain('seek play');
  const yt = await page.evaluate(() => (window as unknown as { __yt: { videoId: string; host: string; calls: string[] } }).__yt);
  expect(yt.videoId).toBe('dQw4w9WgXcQ');
  expect(yt.host).toBe('https://www.youtube-nocookie.com');
  expect(yt.calls[0]).toBe('mute');
  await expect(page.locator('.play-bg .bg-youtube iframe')).toHaveCount(1);
  // the video pauses with the song
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await expect.poll(calls).toMatch(/pause$/);
  expect(errors).toEqual([]);

  // the other tests play the demo song without a background video
  const songs = (await (await page.request.get('/api/songs')).json()).songs as { id: string; title: string }[];
  for (const s of songs) await page.request.delete(`/api/songs/${s.id}/bga`);
});

test('the advanced tab: no user skins (the track has one look), the install hint with its Windows path', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'gear');
  await expect(page.getByTestId('opt-skin')).toHaveCount(0);
  await settingsTab(page, 'advanced');
  await expect(page.getByTestId('skin-settings')).toHaveCount(0);
  await expect(page.locator('.install-hint')).toContainText('.venv\\Scripts\\pip');
  expect(errors).toEqual([]);
});

test('the plane camera and smaller or no hit effects, in the settings and in a play', async ({ page }) => {
  const errors = trackErrors(page);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}') as Record<string, unknown>);
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'gear');
  await chooseSetting(page, 'opt-camera', 'PLANE');
  await expect(page.getByTestId('opt-camera')).toContainText('평면');
  await expect(page.getByTestId('settings-help')).toContainText('레일이 나란하고');
  await expect(page.getByTestId('settings-help')).toContainText('같은 빠르기');
  // the hit effects' size sits with the other effects, and the gear beside it shows them
  await settingsTab(page, 'fx');
  await expect(page.getByTestId('gear-preview')).toBeVisible();
  await expect(page.getByTestId('opt-hit-effect')).toContainText('타격 효과 크기');
  await expect(page.getByTestId('opt-hit-effect')).toHaveAttribute('data-value', 'normal');
  await chooseSetting(page, 'opt-hit-effect', 'small');
  await expect(page.getByTestId('opt-hit-effect')).toContainText('작게');
  expect(await stored()).toMatchObject({ cameraPreset: 'PLANE', hitEffectSize: 'small' });
  await page.getByRole('button', { name: /완료/ }).click();
  const play = async (shot: string) => {
    await tool(page, 'sync-auto');
    await expect(page.getByTestId('play-screen')).toBeVisible();
    await expect(page.locator('.play-overlay')).toHaveCount(0, { timeout: 30_000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `test-results/play-plane-${shot}.png` });
  };
  await play('small-hits');

  // no hit effects, the camera's zoom and tilt at full strength on a lifted judge line
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}') as Record<string, unknown>;
    localStorage.setItem('grg.settings.v1', JSON.stringify({ ...s, hitEffectSize: 'off', cameraFx: 1, judgeLinePosition: 0.5 }));
  });
  await page.goto('/');
  await play('no-hits-lift');
  expect(errors).toEqual([]);
});

test('side notes always over half the keys (반쪽 덮기): no row to lay them in lanes in the settings or on the song select, their row’s preview, and in a play', async ({ page }) => {
  const errors = trackErrors(page);
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs: fakeSongs(3) } }));
  // slow, so each side note of the sync test is in view for a few of the checks of its drawing below;
  // side notes in lanes of their own, as an earlier version saved them, are laid over the keys all the same
  await page.addInitScript(() => {
    if (!localStorage.getItem('grg.settings.v1')) localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '7K+1S', hiSpeed: 1, sideNotes: 'lanes' }));
  });
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'gear');
  await expect(page.getByTestId('opt-side-notes')).toHaveCount(0);
  // the side notes' look is picked in the 노트 tab, with the notes
  await settingsTab(page, 'notes');
  await expect(page.getByTestId('opt-side-notes')).toHaveCount(0);
  const row = page.getByTestId('opt-side-style');
  const head = page.locator('.settings-side-head');
  // on the side notes' row the preview has side lanes, though the last key mode has none; on another row it has that mode again
  await expect(head).toContainText('7K+1S');
  await row.focus();
  await expect(head).toContainText('6K+FX');
  await expect(page.getByTestId('settings-help')).toContainText('DJMAX');
  await expect(page.getByTestId('gear-preview')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(head).toContainText('7K+1S');
  await page.getByRole('button', { name: /완료/ }).click();

  // the song select's speed and gear rows have no side notes' row, on a key mode with side lanes either
  await playOptions(page);
  await expect(page.getByTestId('quick-speed')).toBeVisible();
  await expect(page.getByTestId('quick-side-notes')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('.key-modes').getByRole('button', { name: '6K+FX', exact: true }).click();
  await playOptions(page);
  await expect(page.getByTestId('quick-speed')).toBeVisible();
  await expect(page.getByTestId('quick-side-notes')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // the sync test on 6K+FX draws its side notes over the keys: from the 17th beat (10 s in) bars of
  // FXL's colour across the left half, wider than a tenth of the screen (its own lane never is)
  await tool(page, 'sync-auto');
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-side-notes', 'half');
  await expect(page.locator('.play-overlay')).toHaveCount(0, { timeout: 30_000 });
  let bar = { width: 0, middle: 0 };
  await expect.poll(async () => (bar = await sideBar(page)).width, { timeout: 30_000, intervals: [250] }).toBeGreaterThan(0.1);
  expect(bar.middle).toBeLessThan(0.5);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('song-list')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the parts drawn from their pictures, in code where their media is missing or broken', async ({ page }) => {
  const errors = trackErrors(page);
  const loaded: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/media/') && r.ok()) loaded.push(new URL(r.url()).pathname);
  });
  // routed requests skip the browser's caches, so a picture an earlier play loaded is seen again
  await page.route('**/media/**', (r) => r.fallback());
  // the mecha notes and the flash, as the 노트 and 기어 tabs pick them
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ parts: { note: 'chamfer', side: 'bar', deck: 'standard', hit: 'flash' } })));
  const play = async (shot: string) => {
    loaded.length = 0;
    await page.goto('/');
    await tool(page, 'sync-auto');
    await expect(page.getByTestId('play-screen')).toBeVisible();
    await expect(page.locator('.play-overlay')).toHaveCount(0, { timeout: 30_000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `test-results/play-parts-${shot}.png` });
  };

  await play('art');
  // (the flash and the default gear are drawn in code: no pictures of theirs to load)
  for (const file of ['manifest.json', 'styles/mecha/notes.png', 'styles/mecha/long.png']) expect(loaded).toContain(`/media/${file}`);
  // a broken note picture: the notes are drawn in code, the rest from its pictures
  await page.route('**/media/styles/mecha/notes.png', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: 'not a png' }));
  await play('broken-note');
  expect(loaded).toContain('/media/styles/mecha/long.png');
  // no manifest at all: everything is drawn in code
  await page.route('**/media/manifest.json', (r) => r.fulfill({ status: 404, body: '' }));
  await play('no-media');
  expect(loaded.filter((f) => f.endsWith('.png') || f.endsWith('.webp'))).toEqual([]);
  expect(errors).toEqual([]);
});

test('note colours: a preset, a lane set by hue, typed in or dragged in a copy of it, shown at once on the gear and played; named, deleted, kept over a reset', async ({ page }) => {
  const errors = trackErrors(page);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}') as { noteColors: string; colorPresets: { id: string; name: string; lanes: Record<string, string[]> }[] });
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '7K+1S' })));
  await page.reload();
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'notes');
  const preview = page.getByTestId('gear-preview');
  const shown = async () => (await preview.getAttribute('data-lane-colors'))!.split(' ');
  await expect(page.getByTestId('opt-color-preset')).toHaveAttribute('data-value', 'skin');
  await expect(page.getByTestId('opt-color-preset')).toContainText('기본');
  // the track's colours: the scratch and the white keys of 7K+1S
  expect((await shown()).slice(0, 2)).toEqual(['#ff5c8a', '#eaf6ff']);

  // a preset: its colours on the gear at once, the lanes of the key mode shown
  await chooseSetting(page, 'opt-color-preset', 'aurora');
  const aurora = ['#27d4e8', '#d4fff0', '#2ee0a0', '#d4fff0', '#c7a2ff', '#d4fff0', '#2ee0a0', '#d4fff0'];
  await expect(preview).toHaveAttribute('data-lane-colors', aurora.join(' '));
  await chooseSetting(page, 'opt-color-mode', '4K');
  await expect(page.getByTestId('color-lanes').locator('button')).toHaveCount(4);
  await expect(preview).toHaveAttribute('data-lane-colors', '#d4fff0 #2ee0a0 #2ee0a0 #d4fff0');
  await chooseSetting(page, 'opt-color-mode', '7K+1S');
  await expect(page.getByTestId('color-lane-0')).toHaveText('S');

  // ←→ along the lanes, ↓ to the hue: a colour changed on a built-in preset goes to a copy of it
  await page.getByTestId('color-lane-1').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('color-lane-3')).toBeFocused();
  await expect(page.getByTestId('color-lane-3')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('opt-color-hue')).toBeFocused();
  const hue = Number(await page.getByTestId('opt-color-hue').getAttribute('data-value'));
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.getByTestId('opt-color-hue')).toHaveAttribute('data-value', String((hue + 15) % 360));
  await expect(page.getByTestId('opt-color-preset')).toHaveAttribute('data-value', 'user-1');
  await expect(page.getByTestId('opt-color-preset')).toContainText('내 색 1');
  await expect(page.getByTestId('settings-help')).toContainText('그대로 두고');
  const edited = await shown();
  expect(edited.filter((c, i) => c !== aurora[i])).toEqual([edited[3]]);
  let saved = await stored();
  expect(saved.noteColors).toBe('user-1');
  expect(saved.colorPresets.map((p) => [p.id, p.name])).toEqual([['user-1', '내 색 1']]);
  expect(saved.colorPresets[0].lanes['7K+1S']).toEqual(edited);
  // the preset itself is as it was
  await chooseSetting(page, 'opt-color-preset', 'aurora');
  await expect(preview).toHaveAttribute('data-lane-colors', aurora.join(' '));
  await chooseSetting(page, 'opt-color-preset', 'user-1');

  // a colour typed in shows at once, Enter keeps it
  const hex = page.getByTestId('color-hex');
  await hex.fill('#ff8800');
  await expect(preview).toHaveAttribute('data-lane-colors', /^(\S+ ){3}#ff8800 /);
  expect((await stored()).colorPresets[0].lanes['7K+1S'][3]).toBe(edited[3]);
  await hex.press('Enter');
  await expect.poll(async () => (await stored()).colorPresets[0].lanes['7K+1S'][3]).toBe('#ff8800');
  await expect(page.getByTestId('color-lane-3')).toHaveAttribute('data-color', '#ff8800');

  // a drag on the colour box: the gear shows each colour on the way, the last is kept when let go
  const box = (await page.locator('.color-box').boundingBox())!;
  // its top left corner: no saturation, full value
  await page.mouse.move(box.x + 0.5, box.y + 0.5);
  await page.mouse.down();
  await expect(preview).toHaveAttribute('data-lane-colors', /^(\S+ ){3}#ffffff /);
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 6 });
  const dragging = (await shown())[3];
  expect(dragging).not.toBe('#ffffff');
  expect((await stored()).colorPresets[0].lanes['7K+1S'][3]).toBe('#ff8800');
  await page.mouse.up();
  await expect.poll(async () => (await stored()).colorPresets[0].lanes['7K+1S'][3]).toBe(dragging);

  // named; played in its colours
  await page.getByTestId('color-preset-name').fill('밤 연습');
  await page.getByTestId('color-preset-name').press('Enter');
  await expect(page.getByTestId('opt-color-preset')).toContainText('밤 연습');
  const played = await shown();
  await page.getByRole('button', { name: /완료/ }).click();
  await tool(page, 'sync-auto');
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-lane-colors', played.join(' '));
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('song-list')).toBeVisible();

  // a new preset from a built-in one; a reset keeps the player's presets; one deleted on a second press
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'notes');
  await chooseSetting(page, 'opt-color-preset', 'hands');
  await page.getByTestId('color-preset-new').click();
  await expect(page.getByTestId('opt-color-preset')).toHaveAttribute('data-value', 'user-2');
  saved = await stored();
  expect(saved.colorPresets.map((p) => [p.id, p.name])).toEqual([
    ['user-1', '밤 연습'],
    ['user-2', '내 색 2'],
  ]);
  expect(saved.colorPresets[1].lanes['7K+1S']).toEqual(['#4f8dff', '#cfe2ff', '#4f8dff', '#cfe2ff', '#f4f4f4', '#ffe0c4', '#ff9a3c', '#ffe0c4']);
  await settingsTab(page, 'advanced');
  await page.getByTestId('reset-all').click();
  await page.getByTestId('reset-all').click();
  await expect(page.getByTestId('reset-done')).toBeVisible();
  await settingsTab(page, 'notes');
  await expect(page.getByTestId('opt-color-preset')).toHaveAttribute('data-value', 'skin');
  expect((await stored()).colorPresets).toHaveLength(2);
  await chooseSetting(page, 'opt-color-preset', 'user-1');
  const del = page.getByTestId('color-preset-delete');
  await del.click();
  await expect(del).toHaveText('한 번 더 누르면 삭제');
  await del.click();
  await expect(page.getByTestId('opt-color-preset')).toHaveAttribute('data-value', 'skin');
  await expect(page.getByTestId('opt-color-preset')).toBeFocused();
  expect((await stored()).colorPresets.map((p) => p.id)).toEqual(['user-2']);
  expect(errors).toEqual([]);
});

test('notes and side notes picked in the 노트 tab, gear and hit effect in the 기어 tab: plain names, kept, and played; long notes go with the note', async ({ page }) => {
  const errors = trackErrors(page);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}') as Record<string, unknown>);
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  // the 노트 tab: the note and side note rows first, then the note colours
  await settingsTab(page, 'notes');
  await expect(page.getByTestId('settings-tab-notes')).toHaveText('노트');
  await expect(page.locator('.settings-rows .opt-name').first()).toHaveText('노트');
  await expect(page.getByTestId('opt-color-preset')).toBeVisible();
  // the notes to pick: the plain bar (what a player starts with), the crystal skin's cut glass, the sky skin's
  // soft bar, the bar in its six finishes and the four shapes, the piano note gone (its hit is the 기어 tab's still)
  await expect(page.getByTestId('opt-note-style')).toHaveAttribute('data-value', 'flat');
  const notes = page.getByTestId('opt-note-style');
  await notes.focus();
  const seen = new Set<string>();
  for (let i = 0; i < 26; i++) {
    seen.add((await notes.getAttribute('data-value')) ?? '');
    await page.keyboard.press('ArrowRight');
  }
  expect([...seen].sort()).toEqual(['aqua', 'astral', 'carbon', 'chamfer', 'chrome', 'claude', 'enamel', 'fire', 'flat', 'gemini', 'glass', 'gpt', 'grok', 'hairline', 'magenta', 'noir', 'pearl', 'prism', 'rainbow', 'round', 'sky', 'star4', 'star5', 'steel', 'wire']);
  await chooseSetting(page, 'opt-note-style', 'flat');
  for (const [id, value, name] of [
    ['opt-note-style', 'flat', '기본'],
    ['opt-side-style', 'bar', '기본'],
  ]) {
    await expect(page.getByTestId(id)).toHaveAttribute('data-value', value);
    await expect(page.getByTestId(id)).toContainText(name);
  }
  // no row of its own for the long notes: they are of the note's family
  await expect(page.getByTestId('opt-long-style')).toHaveCount(0);
  await chooseSetting(page, 'opt-note-style', 'round');
  await chooseSetting(page, 'opt-side-style', 'dots');
  await page.getByTestId('opt-side-style').press('ArrowRight');
  await expect(page.getByTestId('opt-side-style')).toHaveAttribute('data-value', 'bar');
  await page.getByTestId('opt-side-style').press('ArrowRight');
  await expect(page.getByTestId('opt-side-style')).toHaveAttribute('data-value', 'dots');
  await expect(page.getByTestId('gear-preview')).toBeVisible();
  // the 기어 tab: the gear and the hit, no track skin, no colour palette, no note rows
  await settingsTab(page, 'gear');
  for (const gone of ['opt-skin', 'opt-palette', 'opt-note-style', 'opt-side-style']) await expect(page.getByTestId(gone)).toHaveCount(0);
  for (const [id, value, name] of [
    ['opt-deck-style', 'standard', '기본'],
    ['opt-hit-style', 'flash', '플래시'],
  ]) {
    await expect(page.getByTestId(id)).toHaveAttribute('data-value', value);
    await expect(page.getByTestId(id)).toContainText(name);
  }
  await chooseSetting(page, 'opt-deck-style', 'receiver');
  await chooseSetting(page, 'opt-hit-style', 'grid');
  await expect(page.getByTestId('gear-preview')).toBeVisible();
  const kept = await stored();
  expect(kept).toMatchObject({ parts: { note: 'round', side: 'dots', deck: 'receiver', hit: 'grid' } });
  expect(kept).not.toHaveProperty('skin');
  await page.getByRole('button', { name: /완료/ }).click();

  await tool(page, 'sync-auto');
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-style', 'round capsule dots receiver grid');
  // the LED grid drawn from its flipbooks, the receiver from its pictures
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-art', 'notes long gear hit');
  await expect(page.locator('.play-overlay')).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/play-parts.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('song-list')).toBeVisible();

  // back to the defaults
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'notes');
  await chooseSetting(page, 'opt-note-style', 'flat');
  await chooseSetting(page, 'opt-side-style', 'bar');
  await settingsTab(page, 'gear');
  await chooseSetting(page, 'opt-deck-style', 'standard');
  await chooseSetting(page, 'opt-hit-style', 'flash');
  await page.getByRole('button', { name: /완료/ }).click();
  await tool(page, 'sync-auto');
  // the default skin: its notes, its long note, its gear and its hit, all drawn in code
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-style', 'flat solid bar standard flash');
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-art', 'gear');
  // and the crystal skin (its parts saved as 'prism'), picked part by part, drawn in code too
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('song-list')).toBeVisible();
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'notes');
  await chooseSetting(page, 'opt-note-style', 'prism');
  await expect(page.getByTestId('opt-note-style')).toContainText('크리스털');
  await settingsTab(page, 'gear');
  await chooseSetting(page, 'opt-deck-style', 'prism');
  await expect(page.getByTestId('opt-deck-style')).toContainText('크리스털');
  await chooseSetting(page, 'opt-hit-style', 'prism');
  await expect(page.getByTestId('opt-hit-style')).toContainText('크리스털 분광');
  await page.getByRole('button', { name: /완료/ }).click();
  await tool(page, 'sync-auto');
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-style', 'prism prism bar prism prism');
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-art', 'gear');
  // its HUD: the gauge named FEVER, the letters cut into planes (each word carries its text for them)
  await expect(page.locator('.hud')).toHaveAttribute('data-gear', 'prism');
  await expect(page.locator('.hud')).toHaveAttribute('data-fill', 'crystal');
  await expect(page.locator('.hud-gauge-name')).toHaveText('FEVER');
  await expect(page.locator('.hud-combo-label')).toHaveAttribute('data-text', 'COMBO');
  await expect(page.locator('.hud-judge-label .hud-fill').first()).toBeVisible({ timeout: 30_000 });
  const cut = await page.locator('.hud-judge-label').evaluate((label) =>
    [...label.querySelectorAll<HTMLElement>('.hud-fill')].map((word) => {
      const planes = getComputedStyle(word, '::after');
      return { text: word.textContent, carried: word.dataset.text, clip: planes.backgroundClip, image: planes.backgroundImage.slice(0, 15), fill: planes.color };
    }),
  );
  expect(cut.length).toBeGreaterThan(0);
  for (const word of cut) {
    expect(word.carried).toBe(word.text);
    expect(word.clip).toBe('text');
    expect(word.image).toMatch(/^(linear-gradient|url)/);
    expect(word.fill).toBe('rgba(0, 0, 0, 0)');
  }
  await expect.poll(() => page.locator('.hud-combo-num').evaluate((el) => (el as HTMLElement).dataset.text === el.textContent && el.textContent !== '')).toBe(true);
  // its deck houses the score, SPEED and the rate as the default one does, on its own plates
  const [speed, score, rate] = await Promise.all(['.hud-speed', '.hud-score', '.hud-rate'].map((sel) => page.locator(sel).boundingBox()));
  expect(speed && score && rate && speed.x >= 0 && speed.x < score.x && score.x < rate.x && rate.x + rate.width <= 1280 && score.y > 360 && score.y + score.height <= 720).toBe(true);
  expect(await page.locator('.hud-score-label').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(124, 200, 255)');
  expect(errors).toEqual([]);
});

test('a skin picked in one row of the 기어 tab: its gear, its notes, its hit and its lettering together, the side notes left as picked; a part changed after it reads 직접 고름', async ({ page }) => {
  const errors = trackErrors(page);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}') as { parts?: Record<string, string>; hudType?: string });
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'notes');
  await chooseSetting(page, 'opt-side-style', 'dots');
  await settingsTab(page, 'gear');
  // the tab's first row (a set of parts: the track skins an earlier version had, 'opt-skin', stay gone); what a player
  // starts with is the default skin
  const skin = page.getByTestId('opt-skin-set');
  await expect(page.locator('.settings-rows .opt-name').first()).toHaveText('스킨');
  await expect(skin).toHaveAttribute('data-value', 'default');
  await expect(skin).toContainText('기본');
  // one step: the crystal skin's gear, hit and (in the 노트 tab) notes, written in the gear's type; the side notes stay
  await chooseSetting(page, 'opt-skin-set', 'crystal');
  await expect(skin).toContainText('크리스털');
  await expect(page.getByTestId('opt-deck-style')).toHaveAttribute('data-value', 'prism');
  await expect(page.getByTestId('opt-hit-style')).toHaveAttribute('data-value', 'prism');
  await expect(page.getByTestId('opt-hud-type')).toHaveAttribute('data-value', 'gear');
  await expect.poll(async () => (await stored()).parts).toEqual({ note: 'prism', side: 'dots', deck: 'prism', hit: 'prism' });
  await settingsTab(page, 'notes');
  await expect(page.getByTestId('opt-note-style')).toHaveAttribute('data-value', 'prism');
  // a part changed by hand is no skin: the row says so
  await chooseSetting(page, 'opt-note-style', 'round');
  await settingsTab(page, 'gear');
  await expect(skin).toHaveAttribute('data-value', 'custom');
  await expect(skin).toContainText('직접 고름');
  // 직접 고름 is nothing to pick: a step from it lands on a skin, all its parts with it
  await skin.focus();
  await page.keyboard.press('ArrowRight');
  await expect(skin).toHaveAttribute('data-value', 'default');
  await expect.poll(async () => (await stored()).parts).toEqual({ note: 'flat', side: 'dots', deck: 'standard', hit: 'flash' });
  await page.keyboard.press('ArrowRight');
  await expect(skin).toHaveAttribute('data-value', 'crystal');
  // the sky skin after it: its gear, its notes, its hit (and its lettering, the gear's); then round to the default again
  await page.keyboard.press('ArrowRight');
  await expect(skin).toHaveAttribute('data-value', 'sky');
  await expect(skin).toContainText('하늘');
  await expect(page.getByTestId('opt-deck-style')).toContainText('하늘');
  await expect(page.getByTestId('opt-hit-style')).toContainText('구름 깃털');
  await expect.poll(async () => (await stored()).parts).toEqual({ note: 'sky', side: 'dots', deck: 'sky', hit: 'sky' });
  // the Firestarter skin after it
  await page.keyboard.press('ArrowRight');
  await expect(skin).toHaveAttribute('data-value', 'fire');
  await expect(skin).toContainText('파이어스타터');
  await expect(page.getByTestId('opt-hit-style')).toContainText('불똥');
  await expect.poll(async () => (await stored()).parts).toEqual({ note: 'fire', side: 'dots', deck: 'fire', hit: 'fire' });
  // the four AI companies' skins after it, each its own gear, notes and hit under the company's name
  for (const [id, name, hit] of [
    ['gpt', 'GPT', '입력 중 점'],
    ['gemini', 'Gemini', '반짝임'],
    ['grok', 'Grok', '펜 엑스'],
    ['claude', 'Claude', '손 빛살'],
  ] as const) {
    await page.keyboard.press('ArrowRight');
    await expect(skin).toHaveAttribute('data-value', id);
    await expect(skin).toContainText(name);
    await expect(page.getByTestId('opt-deck-style')).toContainText(name);
    await expect(page.getByTestId('opt-hit-style')).toContainText(hit);
    await expect.poll(async () => (await stored()).parts).toEqual({ note: id, side: 'dots', deck: id, hit: id });
  }
  // the skins after the reference panels the user showed, each its own gear, notes and hit under one name
  for (const [id, name, hit] of [['aqua', '아쿠아', '록온'], ['steel', '스틸', '십자 섬광'], ['rainbow', '무지개', '색종이'], ['noir', '레드라인', '글리치'], ['magenta', '크림슨', '파편 섬광'], ['wire', '화이트 라인', '선 고리'], ['astral', '별밤', '별빛']] as const) {
    await page.keyboard.press('ArrowRight');
    await expect(skin).toHaveAttribute('data-value', id);
    await expect(skin).toContainText(name);
    await expect(page.getByTestId('opt-deck-style')).toContainText(name);
    await expect(page.getByTestId('opt-hit-style')).toContainText(hit);
    await expect.poll(async () => (await stored()).parts).toEqual({ note: id, side: 'dots', deck: id, hit: id });
  }
  await page.keyboard.press('ArrowRight');
  await expect(skin).toHaveAttribute('data-value', 'default');
  // the lettering kept the track's own is no skin either; picking a skin gives it back to the gear
  await chooseSetting(page, 'opt-hud-type', 'skin');
  await expect(skin).toHaveAttribute('data-value', 'custom');
  await chooseSetting(page, 'opt-skin-set', 'crystal');
  await expect(page.getByTestId('opt-hud-type')).toHaveAttribute('data-value', 'gear');
  await expect.poll(async () => (await stored()).hudType).toBe('gear');
  // and it plays as the crystal skin
  await page.getByRole('button', { name: /완료/ }).click();
  await tool(page, 'sync-auto');
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-style', 'prism prism dots prism prism');
  await expect(page.locator('.hud')).toHaveAttribute('data-fill', 'crystal');
  expect(errors).toEqual([]);
});

test('the sky skin in play: its notes, gear and hit drawn in code, the lettering round and slanted in its own fill, the readouts on the deck’s sky, the gauge in its capsule', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem('grg.settings.v1')) localStorage.setItem('grg.settings.v1', JSON.stringify({ parts: { note: 'sky', side: 'bar', deck: 'sky', hit: 'sky' } }));
  });
  await page.goto('/');
  // the skin row reads the parts back as the sky skin
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'gear');
  await expect(page.getByTestId('opt-skin-set')).toHaveAttribute('data-value', 'sky');
  await page.getByRole('button', { name: /완료/ }).click();
  await tool(page, 'sync-auto');
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-style', 'sky sky bar sky sky');
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-art', 'gear');
  const hud = page.locator('.hud');
  await expect(hud).toHaveAttribute('data-gear', 'sky');
  await expect(hud).toHaveAttribute('data-fill', 'sky');
  await expect(page.locator('.hud-gauge-name')).toHaveText('FEVER');
  // the lettering in the skin's own face (bundled), each word carrying its text for the fill over it
  await expect(page.locator('.hud-judge-label .hud-fill').first()).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => document.fonts.check('italic 800 40px Nunito'))).toBe(true);
  const words = await page.locator('.hud-judge-label').evaluate((label) =>
    [...label.querySelectorAll<HTMLElement>('.hud-fill')].map((word) => {
      const fill = getComputedStyle(word, '::after');
      return { text: word.textContent, carried: word.dataset.text, clip: fill.backgroundClip, image: fill.backgroundImage.slice(0, 15), face: getComputedStyle(word).fontFamily };
    }),
  );
  expect(words.length).toBeGreaterThan(0);
  for (const word of words) {
    expect(word.carried).toBe(word.text);
    expect(word.clip).toBe('text');
    expect(word.image).toBe('linear-gradient');
    expect(word.face).toContain('Nunito');
  }
  // the score, SPEED and the rate on the deck, written in white on its sky; the gauge's cells inside a capsule
  const [speed, score, rate] = await Promise.all(['.hud-speed', '.hud-score', '.hud-rate'].map((sel) => page.locator(sel).boundingBox()));
  expect(speed && score && rate && speed.x >= 0 && speed.x < score.x && score.x < rate.x && rate.x + rate.width <= 1280 && score.y > 360 && score.y + score.height <= 720).toBe(true);
  expect(await page.locator('.hud-score-label').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
  const capsule = await page.locator('.hud-gauge').evaluate((el) => {
    const box = getComputedStyle(el, '::before');
    return { round: parseFloat(box.borderTopLeftRadius) > 100, ground: box.backgroundColor, cells: getComputedStyle(el).backgroundImage };
  });
  expect(capsule).toEqual({ round: true, ground: 'rgb(12, 28, 51)', cells: 'none' });
  expect(errors).toEqual([]);
});

test('an AI company’s skin in play: the build’s two stickers over the gear’s near corners and its notes cut in the build’s mark, with nothing to pick in the settings', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem('grg.settings.v1')) localStorage.setItem('grg.settings.v1', JSON.stringify({ parts: { note: 'gemini', side: 'bar', deck: 'gemini', hit: 'gemini' } }));
  });
  await page.goto('/');
  // the build lists its pictures by gear: two stickers and a mark for each of the four, two figures for the Firestarter gear
  const index = (await (await page.request.get('/stage/index.json')).json()) as Record<string, string[]>;
  expect(Object.keys(index).sort()).toEqual(['claude', 'fire', 'gemini', 'gpt', 'grok']);
  for (const gear of ['gpt', 'gemini', 'grok', 'claude']) {
    expect(index[gear]).toHaveLength(3);
    expect(index[gear].filter((name) => /note/.test(name))).toHaveLength(1);
    for (const name of index[gear]) expect((await page.request.get(`/stage/${gear}/${name}`)).ok(), `${gear}/${name}`).toBe(true);
  }
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'gear');
  await expect(page.getByTestId('opt-skin-set')).toHaveAttribute('data-value', 'gemini');
  // the pictures are the build's: no row picks them
  await expect(page.getByTestId('standee-pick')).toHaveCount(0);
  await page.getByRole('button', { name: /완료/ }).click();
  await tool(page, 'sync-auto');
  // its notes a shape of their own (the mark) with the star family's band of light for a long note
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-style', 'gemini ray bar gemini gemini');
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-art', 'gear');
  // the two stickers by the gear, and the mark in the notes
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-stage', '2', { timeout: 30_000 });
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-mark', '1', { timeout: 30_000 });
  const hud = page.locator('.hud');
  await expect(hud).toHaveAttribute('data-gear', 'gemini');
  await expect(hud).toHaveAttribute('data-fill', 'gemini');
  await expect(page.locator('.hud-gauge-name')).toHaveText('FEVER');
  await expect(page.locator('.hud-judge-label .hud-fill').first()).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => document.fonts.check("700 40px 'Outfit'"))).toBe(true);
  expect(errors).toEqual([]);
});

test('the Firestarter skin in play: drawn in code, its lettering tall and slanted in a heat of its own, and the build’s two pictures standing at the gear’s two sides', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem('grg.settings.v1')) localStorage.setItem('grg.settings.v1', JSON.stringify({ parts: { note: 'fire', side: 'bar', deck: 'fire', hit: 'fire' } }));
  });
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'gear');
  await expect(page.getByTestId('opt-skin-set')).toHaveAttribute('data-value', 'fire');
  // the gear's pictures are the build's: no row picks them
  await expect(page.getByTestId('standee-pick')).toHaveCount(0);
  await page.getByRole('button', { name: /완료/ }).click();
  await tool(page, 'sync-auto');
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-style', 'fire fire bar fire fire');
  // drawn in code, as the default skin is
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-art', 'gear');
  // the two stand by the gear, one a side
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-stage', '2', { timeout: 30_000 });
  const hud = page.locator('.hud');
  await expect(hud).toHaveAttribute('data-gear', 'fire');
  await expect(hud).toHaveAttribute('data-fill', 'fire');
  await expect(page.locator('.hud-gauge-name')).toHaveText('FEVER');
  await expect(page.locator('.hud-judge-label .hud-fill').first()).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => document.fonts.check("italic 800 40px 'Barlow Condensed Italic'"))).toBe(true);
  const words = await page.locator('.hud-judge-label').evaluate((label) =>
    [...label.querySelectorAll<HTMLElement>('.hud-fill')].map((word) => {
      const fill = getComputedStyle(word, '::after');
      return { text: word.textContent, carried: word.dataset.text, clip: fill.backgroundClip, image: fill.backgroundImage.slice(0, 15), face: getComputedStyle(word).fontFamily };
    }),
  );
  expect(words.length).toBeGreaterThan(0);
  for (const word of words) {
    expect(word.carried).toBe(word.text);
    expect(word.clip).toBe('text');
    expect(word.image).toBe('linear-gradient');
    expect(word.face).toContain('Barlow Condensed Italic');
  }
  // the score, SPEED and the rate on the deck
  const [speed, score, rate] = await Promise.all(['.hud-speed', '.hud-score', '.hud-rate'].map((sel) => page.locator(sel).boundingBox()));
  expect(speed && score && rate && speed.x >= 0 && speed.x < score.x && score.x < rate.x && rate.x + rate.width <= 1280 && score.y > 360 && score.y + score.height <= 720).toBe(true);
  expect(errors).toEqual([]);
});

test('the mecha set on the arcade cabinet picked part by part: a gear taken out opens as the standard one, the cabinet drawn from its pictures, its HUD in its type or the track’s own', async ({ page }) => {
  const errors = trackErrors(page);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}') as { parts?: Record<string, unknown>; hudType?: string });
  // a track skin and a gear colour an earlier version saved are dropped, and its gear, taken out, opens as the standard one
  await page.addInitScript(() => {
    if (!localStorage.getItem('grg.settings.v1')) localStorage.setItem('grg.settings.v1', JSON.stringify({ skin: 'arcade', parts: { deck: 'arcade', deckColour: 'red' } }));
  });
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'notes');
  await chooseSetting(page, 'opt-note-style', 'chamfer');
  await settingsTab(page, 'gear');
  // no gear colour to pick: each gear has one look
  await expect(page.getByTestId('opt-deck-style')).toHaveAttribute('data-value', 'standard');
  await expect(page.getByTestId('opt-deck-colour')).toHaveCount(0);
  await expect(page.getByText('기어 색', { exact: true })).toHaveCount(0);
  await chooseSetting(page, 'opt-deck-style', 'cabinet');
  await expect(page.getByTestId('opt-deck-style')).toContainText('오락실 기체');
  await chooseSetting(page, 'opt-hit-style', 'mecha');
  await expect(page.getByTestId('opt-hit-style')).toContainText('메카 섬광');
  // the judgement and combo follow the gear unless the track's own (기본) are kept
  await expect(page.getByTestId('opt-hud-type')).toHaveAttribute('data-value', 'gear');
  expect((await stored()).parts).toEqual({ note: 'chamfer', side: 'bar', deck: 'cabinet', hit: 'mecha' });
  await page.getByRole('button', { name: /완료/ }).click();

  const play = async (comboFont: RegExp) => {
    await tool(page, 'sync-auto');
    await expect(page.getByTestId('play-screen')).toBeVisible();
    await expect(page.locator('.play-canvas')).toHaveAttribute('data-style', 'chamfer rail bar cabinet mecha');
    // the notes, long notes, side notes and hit drawn from the mecha set's art, the cabinet from its pictures
    await expect(page.locator('.play-canvas')).toHaveAttribute('data-art', 'notes long side gear hit');
    await expect(page.locator('.play-overlay')).toHaveCount(0, { timeout: 30_000 });
    // the HUD beside the track is the cabinet's: its gauge named GROOVE, its readouts in seven segments
    await expect(page.locator('.hud')).toHaveAttribute('data-gear', 'cabinet');
    await expect(page.locator('.hud-gauge-name')).toHaveText('GROOVE');
    await expect(page.locator('.hud-panel-plate')).toBeVisible();
    expect(await page.locator('.hud-score').evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/DSEG7 Classic/);
    expect(await page.locator('.hud-combo-num').evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(comboFont);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: 'test-results/play-mecha.png' });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-menu')).toBeVisible();
    await page.keyboard.press('KeyQ');
    await expect(page.getByTestId('song-list')).toBeVisible();
  };
  await play(/DSEG7 Classic/);
  // the track's own type for the judgement and combo (기본), the gear's HUD otherwise as it was
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'gear');
  await chooseSetting(page, 'opt-hud-type', 'skin');
  await expect(page.getByTestId('opt-hud-type')).toContainText('기본');
  expect((await stored()).hudType).toBe('skin');
  await page.getByRole('button', { name: /완료/ }).click();
  await play(/Barlow Condensed/);
  expect(errors).toEqual([]);
});

test('the club, crystal and neon sets and the piano hit picked part by part, each on one of the gears: all of it drawn from art in play, the HUD the gear’s', async ({ page }) => {
  const errors = trackErrors(page);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}') as { parts?: Record<string, unknown> });
  for (const [note, deck, hit, hitName, style] of [
    ['round', 'receiver', 'club', '클럽 링', 'round capsule bar receiver club'],
    ['star4', 'standard', 'crystal', '크리스털 파편', 'star4 ray bar standard crystal'],
    ['star5', 'najeon', 'neon', '네온 아크', 'star5 ray bar najeon neon'],
    ['chamfer', 'cabinet', 'piano', '피아노 음표', 'chamfer rail bar cabinet piano'],
  ] as const) {
    await page.goto('/');
    await page.getByTestId('open-settings').click();
    await settingsTab(page, 'notes');
    await chooseSetting(page, 'opt-note-style', note);
    await settingsTab(page, 'gear');
    await chooseSetting(page, 'opt-deck-style', deck);
    await chooseSetting(page, 'opt-hit-style', hit);
    await expect(page.getByTestId('opt-hit-style')).toContainText(hitName);
    await expect(page.getByTestId('opt-deck-colour')).toHaveCount(0);
    expect((await stored()).parts).toMatchObject({ note, deck, hit });
    await page.getByRole('button', { name: /완료/ }).click();

    await tool(page, 'sync-auto');
    await expect(page.getByTestId('play-screen')).toBeVisible();
    await expect(page.locator('.play-canvas')).toHaveAttribute('data-style', style);
    // the notes, long notes, side notes and hit effect drawn from the set's art, the gear from its pictures
    await expect(page.locator('.play-canvas')).toHaveAttribute('data-art', 'notes long side gear hit');
    await expect(page.locator('.play-overlay')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator('.hud')).toHaveAttribute('data-gear', deck);
    // the receiver's gauge is a needle meter (its name on the meter); the others' a column of cells, named
    await expect(page.getByTestId('hud-meter')).toHaveCount(deck === 'receiver' ? 1 : 0);
    await expect(page.locator('.hud-gauge')).toHaveCount(deck === 'receiver' ? 0 : 1);
    await expect(page.locator('.hud-gauge-name')).toHaveCount(deck === 'receiver' ? 0 : 1);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `test-results/play-${hit}.png` });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-menu')).toBeVisible();
    await page.keyboard.press('KeyQ');
    await expect(page.getByTestId('song-list')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('the bar in six finishes picked by name in the notes tab, each with a long note of its own, drawn in code in play', async ({ page }) => {
  const errors = trackErrors(page);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}') as { parts?: Record<string, unknown> });
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'notes');
  for (const [note, name] of [
    ['chrome', '크롬 베벨'],
    ['hairline', '헤어라인'],
    ['glass', '유리'],
    ['enamel', '에나멜'],
    ['pearl', '펄'],
    ['carbon', '카본'],
  ] as const) {
    await chooseSetting(page, 'opt-note-style', note);
    await expect(page.getByTestId('opt-note-style')).toContainText(name);
    expect((await stored()).parts).toMatchObject({ note });
  }
  await page.getByRole('button', { name: /완료/ }).click();

  await tool(page, 'sync-auto');
  await expect(page.getByTestId('play-screen')).toBeVisible();
  // the last one picked, with its own long note; drawn in code (no notes from art)
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-style', /^carbon carbon bar /);
  await expect(page.locator('.play-overlay')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('.play-canvas')).not.toHaveAttribute('data-art', /\bnotes\b/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('song-list')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the custom keyboard, the racing wheel, the orbital panel, the piano and the moon picked by name: drawn from their pictures in play, the HUD dressed for each', async ({ page }) => {
  const errors = trackErrors(page);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}') as { parts?: Record<string, unknown> });
  for (const [deck, name, gauge, judgeFont, numFont] of [
    ['keyboard', '커스텀 키보드', 'CHARGE', /Silkscreen/, /Silkscreen/],
    ['racing', '레이싱 휠', 'FUEL', /Chakra Petch/, /Chakra Petch/],
    ['orbital', '우주선 계기판', 'O2', /Saira Stencil One/, /DSEG7 Classic/],
    ['piano', '피아노', 'FORTE', /Bodoni Moda/, /Bodoni Moda/],
    ['rawglass', '달', 'CLARITY', /Orbitron/, /Orbitron/],
  ] as const) {
    await page.goto('/');
    await page.getByTestId('open-settings').click();
    await settingsTab(page, 'gear');
    await chooseSetting(page, 'opt-deck-style', deck);
    await expect(page.getByTestId('opt-deck-style')).toContainText(name);
    expect((await stored()).parts).toMatchObject({ deck });
    await page.getByRole('button', { name: /완료/ }).click();

    await tool(page, 'sync-auto');
    await expect(page.getByTestId('play-screen')).toBeVisible();
    // the gear drawn from its pictures (with the default notes, drawn in code, and the flash hit's flipbooks)
    await expect(page.locator('.play-canvas')).toHaveAttribute('data-art', /\bgear\b/);
    await expect(page.locator('.play-overlay')).toHaveCount(0, { timeout: 30_000 });
    // the HUD beside the track is the gear's: its gauge named, its panel's housing, its digits and type
    await expect(page.locator('.hud')).toHaveAttribute('data-gear', deck);
    await expect(page.locator('.hud-gauge')).toHaveCount(1);
    await expect(page.locator('.hud-gauge-name')).toHaveText(gauge);
    await expect(page.locator('.hud-panel-plate')).toBeVisible();
    expect(await page.locator('.hud-score').evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(numFont);
    expect(await page.locator('.hud').evaluate((el) => getComputedStyle(el).getPropertyValue('--hud-font'))).toMatch(judgeFont);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `test-results/play-gear-${deck}.png` });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-menu')).toBeVisible();
    await page.keyboard.press('KeyQ');
    await expect(page.getByTestId('song-list')).toBeVisible();
  }
  expect(errors).toEqual([]);
});
