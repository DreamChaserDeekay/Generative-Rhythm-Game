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
  await songInfo(page);
  await expect(page.getByTestId('analysis-backends')).toContainText('스템 기본');

  await page.getByTestId('bga-input').setInputFiles(video);
  await expect(page.getByTestId('bga-status')).toHaveText('등록됨', { timeout: 30_000 });

  await page.getByRole('button', { name: /NORMAL/ }).first().click();
  await expect(page.getByTestId('chart-preview')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('stem-mix')).toBeVisible();

  await autoplay(page);
  await page.getByTestId('play-button').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  // the play's keysounds come from the stems (the HUD names them, not on the screen)
  await expect(page.locator('.hud')).toHaveAttribute('data-keysounds', /\S/, { timeout: 60_000 });
  // a hit sounds 1.2 times as loud as its stem in the song
  await expect.poll(() => keysoundBusGain(page)).toBeCloseTo(1.2, 5);
  await expect(page.locator('.play-bg video.bg-video')).toHaveCount(1);
  await expect(page.locator('.play-bg canvas.bg-visualizer')).toHaveCount(1);
  await page.waitForTimeout(9000);
  await page.screenshot({ path: 'test-results/play-phase3.png' });
  // the score panel stands over SPEED left of the gear, on the screen; under the judge line is the gear's
  // (its rows are laid one by one: their boxes together)
  const panel = await page.locator('.hud-panel .hud-row').evaluateAll((rows) => {
    const boxes = rows.map((r) => r.getBoundingClientRect());
    return { x: Math.min(...boxes.map((b) => b.left)), right: Math.max(...boxes.map((b) => b.right)), bottom: Math.max(...boxes.map((b) => b.bottom)) };
  });
  const speed = await page.locator('.hud-speed').boundingBox();
  expect(speed && panel.x >= 0 && panel.right < 640 && panel.bottom <= speed.y + 2).toBe(true);
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
  await page.getByTestId('play-button').click();
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

test('custom skin from JSON in the settings', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'gear');
  await chooseSetting(page, 'opt-skin', 'club');
  await settingsTab(page, 'advanced');
  await expect(page.getByTestId('skin-settings')).toBeVisible();
  await page.locator('.skin-json').fill('{"label": "테스트 스킨", "noteShape": "round", "laneLayout": "rainbow", "colors": {"judgeLine": "#ff00aa"}}');
  await page.getByRole('button', { name: '사용자 스킨 적용' }).click();
  // the user skin is now the track's skin
  await settingsTab(page, 'gear');
  await expect(page.getByTestId('opt-skin')).toHaveAttribute('data-value', 'custom');
  await expect(page.getByTestId('opt-skin')).toContainText('테스트 스킨');
  await page.getByRole('button', { name: /완료/ }).click();
  await tool(page, 'sync-auto');
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'test-results/play-custom-skin.png' });
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
    localStorage.setItem('grg.settings.v1', JSON.stringify({ ...s, hitEffectSize: 'off', cameraFx: 1, lift: 0.1 }));
  });
  await page.goto('/');
  await play('no-hits-lift');
  expect(errors).toEqual([]);
});

test('side notes over half the keys (반쪽 덮기): in the settings and on the song select with their previews, and in a play', async ({ page }) => {
  const errors = trackErrors(page);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}') as Record<string, unknown>);
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs: fakeSongs(3) } }));
  // slow, so each side note of the sync test is in view for a few of the checks of its drawing below
  await page.addInitScript(() => {
    if (!localStorage.getItem('grg.settings.v1')) localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '7K+1S', hiSpeed: 1 }));
  });
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'gear');
  const row = page.getByTestId('opt-side-notes');
  const head = page.locator('.settings-side-head');
  await expect(row).toHaveAttribute('data-value', 'lanes');
  await expect(row).toContainText('별도 레인');
  // on its row the preview has side lanes, though the last key mode has none; on another row it has that mode again
  await expect(head).toContainText('7K+1S');
  await row.focus();
  await expect(head).toContainText('6K+FX');
  await expect(page.getByTestId('settings-help')).toContainText('DJMAX');
  await page.keyboard.press('ArrowRight');
  await expect(row).toHaveAttribute('data-value', 'half');
  await expect(row).toContainText('반쪽 덮기');
  await expect(page.getByTestId('gear-preview')).toBeVisible();
  expect(await stored()).toMatchObject({ sideNotes: 'half' });
  await page.keyboard.press('ArrowDown');
  await expect(head).toContainText('7K+1S');
  await page.getByRole('button', { name: /완료/ }).click();

  // the song select's speed and gear rows have it on a key mode with side lanes only
  await playOptions(page, 'gear');
  await expect(page.getByTestId('quick-speed')).toBeVisible();
  await expect(page.getByTestId('quick-side-notes')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('.key-modes').getByRole('button', { name: '6K+FX', exact: true }).click();
  await playOptions(page, 'gear');
  const quick = page.getByTestId('quick-side-notes');
  await expect(quick).toHaveAttribute('data-value', 'half');
  await quick.focus();
  await expect(page.getByTestId('play-options-help')).toContainText('DJMAX');
  await page.keyboard.press('ArrowRight');
  await expect(quick).toHaveAttribute('data-value', 'lanes');
  expect(await stored()).toMatchObject({ sideNotes: 'lanes' });
  await page.keyboard.press('ArrowLeft');
  await expect(quick).toHaveAttribute('data-value', 'half');
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

test('textured skins, drawn in code where their media is missing or broken', async ({ page }) => {
  const errors = trackErrors(page);
  const loaded: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/media/') && r.ok()) loaded.push(new URL(r.url()).pathname);
  });
  // routed requests skip the browser's caches, so a picture an earlier play loaded is seen again
  await page.route('**/media/**', (r) => r.fallback());
  const inSettings = async (step: () => Promise<void>) => {
    await page.goto('/');
    await page.getByTestId('open-settings').click();
    await step();
    await page.getByRole('button', { name: /완료/ }).click();
  };
  const play = async (shot: string) => {
    loaded.length = 0;
    await page.goto('/');
    await tool(page, 'sync-auto');
    await expect(page.getByTestId('play-screen')).toBeVisible();
    await expect(page.locator('.play-overlay')).toHaveCount(0, { timeout: 30_000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `test-results/play-textured-${shot}.png` });
  };

  // JEWEL plays the crystal set's flipbooks
  await inSettings(async () => {
    await settingsTab(page, 'gear');
    await chooseSetting(page, 'opt-skin', 'jewel');
  });
  await play('jewel');
  for (const file of ['manifest.json', 'fx/hit_burst_glow.png', 'fx/hit_hold.png']) expect(loaded).toContain(`/media/${file}`);

  // a user skin of textures
  const textured = { label: '텍스처 스킨', hitEffect: 'sprite', textures: { note: 'glass/note', floor: 'glass/floor', hitBurst: 'fx/hitBurstRing', hitHold: 'fx/hitHold' } };
  await inSettings(async () => {
    await settingsTab(page, 'advanced');
    await page.locator('.skin-json').fill(JSON.stringify(textured));
    await page.getByRole('button', { name: '사용자 스킨 적용' }).click();
    await settingsTab(page, 'gear');
    await expect(page.getByTestId('opt-skin')).toHaveAttribute('data-value', 'custom');
    await expect(page.getByTestId('opt-skin')).toContainText('텍스처 스킨');
  });
  await play('user');
  for (const file of ['manifest.json', 'skins/glass/note_tap.png', 'skins/glass/floor.png', 'fx/hit_burst_ring.png', 'fx/hit_hold.png']) {
    expect(loaded).toContain(`/media/${file}`);
  }
  // a broken note texture: the notes are drawn in code, the rest stays textured
  await page.route('**/media/skins/glass/note_tap.png', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: 'not a png' }));
  await play('broken-note');
  expect(loaded).toContain('/media/skins/glass/floor.png');
  // no manifest at all: everything is drawn in code
  await page.route('**/media/manifest.json', (r) => r.fulfill({ status: 404, body: '' }));
  await play('no-media');
  expect(loaded.filter((f) => f.endsWith('.png'))).toEqual([]);
  expect(errors).toEqual([]);
});

test('notes, long notes, side notes, gear and hit effect picked apart from the skin: named with the skin’s own, kept, and played', async ({ page }) => {
  const errors = trackErrors(page);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}') as Record<string, unknown>);
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'gear');
  await chooseSetting(page, 'opt-skin', 'arcade');
  // each part names what the skin draws while it follows the skin
  await expect(page.getByTestId('opt-note-style')).toHaveAttribute('data-value', 'skin');
  await expect(page.getByTestId('opt-note-style')).toContainText('스킨 (메카 챔퍼)');
  await expect(page.getByTestId('opt-long-style')).toContainText('노트에 맞춤 (레일)');
  await expect(page.getByTestId('opt-deck-style')).toContainText('스킨 (아케이드)');
  // a note picked brings its own family's long note
  await chooseSetting(page, 'opt-note-style', 'round');
  await expect(page.getByTestId('opt-long-style')).toContainText('노트에 맞춤 (캡슐)');
  await chooseSetting(page, 'opt-side-style', 'dots');
  await chooseSetting(page, 'opt-deck-style', 'grand');
  await chooseSetting(page, 'opt-hit-style', 'wave');
  await expect(page.getByTestId('gear-preview')).toBeVisible();
  expect(await stored()).toMatchObject({ skin: 'arcade', parts: { note: 'round', long: 'auto', side: 'dots', deck: 'grand', hit: 'wave' } });
  await page.getByRole('button', { name: /완료/ }).click();

  await tool(page, 'sync-auto');
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-style', 'round capsule dots grand wave');
  await expect(page.locator('.play-overlay')).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/play-parts.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('song-list')).toBeVisible();

  // back to the skin's own: the skin as it was
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'gear');
  for (const id of ['opt-note-style', 'opt-side-style', 'opt-deck-style', 'opt-hit-style']) await chooseSetting(page, id, 'skin');
  await page.getByRole('button', { name: /완료/ }).click();
  await tool(page, 'sync-auto');
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-style', 'chamfer rail bar arcade star');
  expect(errors).toEqual([]);
});
