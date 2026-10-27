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
  // the background visualizer is gone: an earlier version's saved visualizer: true draws none
  await expect(page.locator('.play-bg canvas.bg-visualizer')).toHaveCount(0);
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
  // the skin is colours, track and type: the notes and the gear are the gear tab's
  await expect(page.getByTestId('skin-settings')).toContainText('노트·사이드 노트·기어·타격 효과는 기어 탭에서 고릅니다');
  await page.getByRole('button', { name: '현재 스킨 JSON 보기' }).click();
  await expect(page.locator('.skin-json')).toHaveValue(/"judgeLine"/);
  await expect(page.locator('.skin-json')).not.toHaveValue(/noteShape|hitEffect|"note"|"deck"/);
  // the install hint has the Windows path too
  await expect(page.locator('.install-hint')).toContainText('.venv\\Scripts\\pip');
  await page.locator('.skin-json').fill('{"label": "테스트 스킨", "laneLayout": "rainbow", "colors": {"judgeLine": "#ff00aa"}}');
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
    localStorage.setItem('grg.settings.v1', JSON.stringify({ ...s, hitEffectSize: 'off', cameraFx: 1, lift: 0.1 }));
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
  await playOptions(page, 'gear');
  await expect(page.getByTestId('quick-speed')).toBeVisible();
  await expect(page.getByTestId('quick-side-notes')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('.key-modes').getByRole('button', { name: '6K+FX', exact: true }).click();
  await playOptions(page, 'gear');
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

test('note colours: a preset, a lane set by hue, typed in or dragged in a copy of it, shown at once on the gear and played; named, deleted, kept over a reset', async ({ page }) => {
  const errors = trackErrors(page);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}') as { noteColors: string; colorPresets: { id: string; name: string; lanes: Record<string, string[]> }[] });
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '7K+1S' })));
  await page.reload();
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'colors');
  const preview = page.getByTestId('gear-preview');
  const shown = async () => (await preview.getAttribute('data-lane-colors'))!.split(' ');
  await expect(page.getByTestId('opt-color-preset')).toHaveAttribute('data-value', 'skin');
  await expect(page.getByTestId('opt-color-preset')).toContainText('기본');
  // the skin's colours: the scratch and the white keys of 7K+1S
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
  await settingsTab(page, 'colors');
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
  await settingsTab(page, 'colors');
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

test('notes, side notes, gear and hit effect picked whatever the skin: plain names, the same defaults on any skin, kept, and played; long notes go with the note', async ({ page }) => {
  const errors = trackErrors(page);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}') as Record<string, unknown>);
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'gear');
  await chooseSetting(page, 'opt-skin', 'arcade');
  // each part is named as picked, the defaults on this skin too: there is no skin's own to follow
  for (const [id, value, name] of [
    ['opt-note-style', 'flat', '기본'],
    ['opt-side-style', 'bar', '기본'],
    ['opt-deck-style', 'grand', '그랜드 피아노'],
    ['opt-hit-style', 'flash', '플래시'],
  ]) {
    await expect(page.getByTestId(id)).toHaveAttribute('data-value', value);
    await expect(page.getByTestId(id)).toContainText(name);
    await expect(page.getByTestId(id)).not.toContainText('스킨');
  }
  // no row of its own for the long notes: they are of the note's family
  await expect(page.getByTestId('opt-long-style')).toHaveCount(0);
  await chooseSetting(page, 'opt-note-style', 'round');
  await chooseSetting(page, 'opt-side-style', 'dots');
  await page.getByTestId('opt-side-style').press('ArrowRight');
  await expect(page.getByTestId('opt-side-style')).toHaveAttribute('data-value', 'bar');
  await page.getByTestId('opt-side-style').press('ArrowRight');
  await expect(page.getByTestId('opt-side-style')).toHaveAttribute('data-value', 'dots');
  await chooseSetting(page, 'opt-deck-style', 'cassette');
  await chooseSetting(page, 'opt-hit-style', 'wave');
  await expect(page.getByTestId('gear-preview')).toBeVisible();
  expect(await stored()).toMatchObject({ skin: 'arcade', parts: { note: 'round', side: 'dots', deck: 'cassette', hit: 'wave' } });
  await page.getByRole('button', { name: /완료/ }).click();

  await tool(page, 'sync-auto');
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-style', 'round capsule dots cassette wave');
  await expect(page.locator('.play-overlay')).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/play-parts.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('song-list')).toBeVisible();

  // back to the defaults: drawn as on any skin, not as arcade's own (chamfer rail bar arcade star)
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'gear');
  for (const [id, value] of [
    ['opt-note-style', 'flat'],
    ['opt-side-style', 'bar'],
    ['opt-deck-style', 'grand'],
    ['opt-hit-style', 'flash'],
  ]) {
    await chooseSetting(page, id, value);
  }
  await page.getByRole('button', { name: /완료/ }).click();
  await tool(page, 'sync-auto');
  await expect(page.locator('.play-canvas')).toHaveAttribute('data-style', 'flat solid bar grand flash');
  expect(errors).toEqual([]);
});
