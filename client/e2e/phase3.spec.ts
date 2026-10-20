import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { addFromMenu, autoplay, songInfo, tool } from './songSelect';

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
  await songInfo(page);
  await expect(page.getByTestId('analysis-backends')).toContainText('스템 기본');

  await page.getByTestId('bga-input').setInputFiles(video);
  await expect(page.getByTestId('bga-status')).toHaveText('등록됨', { timeout: 30_000 });

  await page.getByRole('button', { name: /NORMAL/ }).first().click();
  await page.getByTestId('generate-button').click();
  await expect(page.getByTestId('chart-preview')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('stem-mix')).toBeVisible();

  await autoplay(page);
  await page.getByTestId('play-button').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.locator('.hud-chart')).toContainText('키음', { timeout: 60_000 });
  await expect(page.locator('.play-bg video.bg-video')).toHaveCount(1);
  await expect(page.locator('.play-bg canvas.bg-visualizer')).toHaveCount(1);
  await page.waitForTimeout(9000);
  await page.screenshot({ path: 'test-results/play-phase3.png' });
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
  await page.getByTestId('generate-button').click();
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
  await expect(page.getByTestId('skin-settings')).toBeVisible();
  await page.getByTestId('skin-club').click();
  await expect(page.getByTestId('skin-club')).toHaveClass(/active/);
  await page.locator('.skin-json').fill('{"label": "테스트 스킨", "noteShape": "round", "laneLayout": "rainbow", "colors": {"judgeLine": "#ff00aa"}}');
  await page.getByRole('button', { name: '사용자 스킨 적용' }).click();
  await expect(page.getByTestId('skin-settings').getByRole('button', { name: '테스트 스킨' })).toHaveClass(/active/);
  await page.getByRole('button', { name: /완료/ }).click();
  await tool(page, 'sync-auto');
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'test-results/play-custom-skin.png' });
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
    await page.getByTestId('skin-jewel').click();
    await expect(page.getByTestId('skin-jewel')).toHaveClass(/active/);
  });
  await play('jewel');
  for (const file of ['manifest.json', 'fx/hit_burst_glow.png', 'fx/hit_hold.png']) expect(loaded).toContain(`/media/${file}`);

  // a user skin of textures
  const textured = { label: '텍스처 스킨', hitEffect: 'sprite', textures: { note: 'glass/note', floor: 'glass/floor', hitBurst: 'fx/hitBurstRing', hitHold: 'fx/hitHold' } };
  await inSettings(async () => {
    await page.locator('.skin-json').fill(JSON.stringify(textured));
    await page.getByRole('button', { name: '사용자 스킨 적용' }).click();
    await expect(page.getByTestId('skin-settings').getByRole('button', { name: '텍스처 스킨' })).toHaveClass(/active/);
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
