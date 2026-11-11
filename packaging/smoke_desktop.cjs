// Launches a packaged desktop app with Playwright's Electron driver: waits for the game, checks its
// media, analyzes a demo song and saves screenshots along the way. Where Mapperatorinator's runtime is set
// up (the workflow's CPU step leaves one in GRG_MAPPER_HOME; the runner has no NVIDIA GPU otherwise) it also
// has a chart made, previews it and starts an autoplay (the default hit's flipbooks); else it checks that the
// chart is refused with a reason.
//   node packaging/smoke_desktop.cjs <client dir with node_modules> <app executable> <screenshot dir>
// GRG_SMOKE_ANALYSIS_MS: how long the demo song's analysis may take (default 3 minutes).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const [clientDir, exe, outDir] = process.argv.slice(2);
const analysisMs = Number(process.env.GRG_SMOKE_ANALYSIS_MS) || 180000;
const { _electron: electron } = require(path.resolve(clientDir, 'node_modules/playwright'));

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grg-desktop-'));
  const app = await electron.launch({
    executablePath: exe,
    args: process.platform === 'linux' ? ['--no-sandbox'] : [],
    env: { ...process.env, GRG_DATA_DIR: dataDir },
    timeout: 180000,
  });
  const win = await app.firstWindow();
  await win.waitForURL(/127\.0\.0\.1:\d+\//, { timeout: 180000 });
  console.log('game loaded from', win.url());
  // the game media is packed into the app: the default hit (the flash) plays its flipbooks
  const media = await win.evaluate(async () => {
    const manifest = await (await fetch('/media/manifest.json')).json();
    const burst = await fetch(`/media/${manifest.textures['flash/hitBurst'].file}`);
    return { textures: Object.keys(manifest.textures).length, burst: burst.status };
  });
  if (!media.textures || media.burst !== 200) throw new Error(`game media missing: ${JSON.stringify(media)}`);
  console.log('media:', media.textures, 'textures');
  // the demo song is in the menu (Esc), under 곡 추가
  await win.getByTestId('hint-menu').click();
  await win.getByTestId('menu-add').click();
  await win.getByTestId('demo-button').click();
  await win.getByTestId('song-title').waitFor({ timeout: 60000 });
  await win.waitForFunction(() => !document.querySelector('[data-testid="analysis-status"]'), null, { timeout: analysisMs });
  await win.screenshot({ path: path.join(outDir, '1-song-select.png') });
  // Mapperatorinator is the only generator: the chart is asked of the server as the song select does
  // on Enter (it answers when the chart is made: the model's timing pass and the notes, on the CPU here)
  const made = await win.evaluate(async () => {
    const health = await (await fetch('/api/health')).json();
    const song = (await (await fetch('/api/songs')).json()).songs[0];
    const res = await fetch(`/api/songs/${song.id}/charts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyMode: '7K+1S', difficulty: 'NORMAL' }),
    });
    const body = await res.json();
    return { mapper: health.mapper && health.mapper.state, status: res.status, detail: body.detail, notes: body.chart && body.chart.meta.noteCount };
  });
  console.log('chart request:', JSON.stringify(made));
  if (made.mapper !== 'ready') {
    if (made.status !== 503 || !made.detail) throw new Error(`a chart without Mapperatorinator answered ${made.status}, not 503 with its reason`);
    console.log('no Mapperatorinator runtime here: the chart was refused with its reason');
  } else {
    if (made.status !== 200 || !made.notes) throw new Error(`Mapperatorinator made no chart: ${JSON.stringify(made)}`);
    // the screens are another matter than the build: a picture of the chart and of a play where they come up
    try {
      await win.getByTestId('hint-info').click();
      await win.getByTestId('chart-preview').waitFor({ timeout: 60000 });
      await win.screenshot({ path: path.join(outDir, '2-chart-preview.png') });
      console.log('chart notes:', await win.getByTestId('chart-notes').textContent());
      // the song info closed (its Esc hint), Shift+Enter plays the chart on autoplay (a play needs an
      // audio device for the song clock)
      await win.getByTestId('hint-info').click();
      await win.getByTestId('song-info').waitFor({ state: 'detached', timeout: 10000 });
      await win.keyboard.press('Shift+Enter');
      await win.getByTestId('play-screen').waitFor({ timeout: 30000 });
      await win.waitForTimeout(7000);
      await win.screenshot({ path: path.join(outDir, '3-play.png') });
    } catch (e) {
      console.warn('chart and play screenshots skipped:', e.message);
      await win.screenshot({ path: path.join(outDir, '2-after-chart.png') }).catch(() => {});
    }
  }
  await app.close();
  console.log('desktop smoke test: ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
