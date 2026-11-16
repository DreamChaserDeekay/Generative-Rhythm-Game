// Launches a packaged desktop app with Playwright's Electron driver: waits for the game, checks its
// media, analyzes a demo song and saves screenshots along the way. Where Mapperatorinator's runtime is set
// up (the workflow's CPU step leaves one in GRG_MAPPER_HOME; the runner has no NVIDIA GPU otherwise) it also
// has a chart made, previews it and starts an autoplay (the default hit's flipbooks); else it checks that the
// chart is refused with a reason.
// It then kills the app's GPU process and prints what the app wrote down of it (graphics.log): informational.
// Last, the app is started once in each graphics compatibility mode (desktop/graphicsMode.js): it has to come
// up in every one; how it draws there (the renderer the game's page gets, should it get one) is printed.
//   node packaging/smoke_desktop.cjs <client dir with node_modules> <app executable> <screenshot dir>
// GRG_SMOKE_ANALYSIS_MS: how long the demo song's analysis may take (default 3 minutes).
// GRG_SMOKE_MODES_ONLY=1: the graphics modes' part alone.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const [clientDir, exe, outDir] = process.argv.slice(2);
const analysisMs = Number(process.env.GRG_SMOKE_ANALYSIS_MS) || 180000;
const { _electron: electron } = require(path.resolve(clientDir, 'node_modules/playwright'));

const until = async (ok, ms) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 250))) if (ok()) return true;
  return false;
};

/**
 * The app's GPU process is killed, as a driver reset or a crash of it takes it away: the app writes it
 * down in graphics.log beside server.log, with a picture of the window afterwards (desktop/graphicsLog.js).
 * Informational: what it wrote is printed and copied beside the screenshots, and nothing here fails the
 * test (a runner has no graphics card, and how its software one takes the kill is not the build's matter).
 */
async function graphicsLoss(app, win) {
  const userData = await app.evaluate(({ app: a }) => a.getPath('userData'));
  const logFile = path.join(userData, 'graphics.log');
  const log = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '');
  if (!(await until(() => /  start  /.test(log()), 15000))) console.warn('graphics.log: no start line');
  const before = log().length;
  const gpu = await app.evaluate(({ app: a }) => a.getAppMetrics().filter((m) => m.type === 'GPU').map((m) => m.pid));
  if (!gpu.length) {
    console.log('graphics-loss check: the app has no GPU process here');
  } else {
    await app.evaluate((_electron, pid) => process.kill(pid), gpu[0]);
    const pictured = await until(() => /  picture  /.test(log().slice(before)), 20000);
    console.log(`graphics-loss check: the GPU process (${gpu[0]}) was killed; ${pictured ? 'the app wrote it down and pictured its window' : 'no picture line within 20 s'}`);
    await win.screenshot({ path: path.join(outDir, '4-after-graphics-loss.png') }).catch(() => {});
  }
  console.log(`--- graphics.log\n${log()}`);
  for (const name of fs.readdirSync(userData).filter((n) => /^graphics(-lost-.*\.jpg|\.log)$/.test(n))) fs.copyFileSync(path.join(userData, name), path.join(outDir, `desktop-${name}`));
}

/**
 * The app once more, in the graphics compatibility mode `mode` (asked for this launch only: nothing is
 * kept). It has to come up: the game's page in its window, the run's first line in graphics.log with
 * the mode. How it draws there is printed, and is not the build's matter: a runner has no graphics
 * card, and under a mode whose renderer its software one lacks the page gets no WebGL at all. In one of
 * the modes (`crash`) the GPU process is made to crash as a driver's fault would, for the lines the app
 * writes of a crash (Chromium's log, Windows' events, the crash dump): printed, informational.
 * `switches`: Chromium switches of the test's own, given on the command line beside the mode's (to see one
 * mode's switch take effect where this machine's usual way of drawing would not show it).
 */
async function modeRun(mode, { crash = false, switches = [] } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grg-desktop-'));
  const app = await electron.launch({
    executablePath: exe,
    args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), ...switches],
    // (everything Chromium's processes log, to see which of them reach the log file here)
    env: { ...process.env, GRG_DATA_DIR: dataDir, GRG_GRAPHICS_MODE: mode, GRG_CHROMIUM_LOG_LEVEL: '0' },
    timeout: 180000,
  });
  try {
    const win = await app.firstWindow();
    await win.waitForURL(/127\.0\.0\.1:\d+\//, { timeout: 180000 });
    await win.getByTestId('hint-menu').waitFor({ timeout: 60000 });
    const userData = await app.evaluate(({ app: a }) => a.getPath('userData'));
    const read = (name) => (fs.existsSync(path.join(userData, name)) ? fs.readFileSync(path.join(userData, name), 'utf8') : '');
    // this launch's lines: from its own first one on (the log holds the earlier launches' too)
    const mine = () => {
      const log = read('graphics.log');
      const at = log.lastIndexOf('  start  ');
      return at < 0 ? '' : log.slice(log.lastIndexOf('\n', at) + 1);
    };
    const started = await until(() => new RegExp(`  start  .* mode=${mode} `).test(mine()) && /  gpu-config  when=start/.test(mine()), 30000);
    if (!started) throw new Error(`mode ${mode}: graphics.log has no first line of this launch with the mode:\n${mine()}`);
    // every mode but the one that keeps the old way starts Chromium with the page rasterized on the CPU (Skia's
    // text drawing on the graphics card is where a player's GPU process stopped); what Chromium makes of it is
    // printed (a runner rasterizes in software whatever is asked)
    const first = mine().split('\n')[0];
    const cpuRaster = /\bswitches="?[^" ]*disable-gpu-rasterization/.test(first);
    if (cpuRaster !== (mode !== 'gpu-raster')) throw new Error(`mode ${mode}: the page should ${mode !== 'gpu-raster' ? '' : 'not '}be rasterized on the CPU, by its switches:\n${first}`);
    console.log(`graphics mode ${mode}: ${(/ switches=("[^"]*"|\S+)/.exec(first) || ['', 'no switches'])[1]}, ${(/ rasterization=\S+/.exec(first) || [' rasterization unknown'])[0].trim()}`);
    const renderer = await win.evaluate(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return 'none';
      const names = gl.getExtension('WEBGL_debug_renderer_info');
      return String(names ? gl.getParameter(names.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    });
    const name = [mode, ...switches].join(' ');
    console.log(`graphics mode ${name}: the app came up; the page's WebGL renderer: ${renderer}`);
    await win.screenshot({ path: path.join(outDir, `5-mode-${[mode, ...switches].join('').replace(/[^\w-]/g, '')}.png`) }).catch(() => {});
    const processes = await app.evaluate(({ app: a }) => a.getAppMetrics().map((m) => [m.pid, m.type]));
    if (crash) {
      await app.evaluate(({ BrowserWindow }) => {
        const side = new BrowserWindow({ show: false });
        side.loadURL('chrome://gpucrash').catch(() => {});
        setTimeout(() => side.destroy(), 1500);
      });
      const written = await until(() => /  crash-dump  /.test(mine()) && /  picture  /.test(mine()), 25000);
      console.log(`graphics mode ${name}: the GPU process was crashed; ${written ? 'the app wrote down the crash and pictured its window' : 'no crash-dump and picture lines within 25 s'}`);
      // the dump itself beside the screenshots: what the app read of it can be read again from it
      const dump = / {2}crash-dump {2}file=(\S+\.dmp)/.exec(mine());
      if (dump) fs.copyFileSync(path.join(userData, dump[1]), path.join(outDir, 'desktop-gpu-crash.dmp'));
      fs.copyFileSync(path.join(userData, 'chromium.log'), path.join(outDir, 'desktop-chromium.log'));
    }
    // which of the app's processes reach Chromium's log file here (the GPU process's own lines are the ones wanted
    // of a loss: a process started since the list was taken is told by its number)
    const kinds = Object.fromEntries(processes);
    const kind = (line) => {
      const pid = /^\[(\d+):/.exec(line);
      return pid ? kinds[pid[1]] || `pid ${pid[1]}` : null;
    };
    const lines = read('chromium.log').split(/\r?\n/);
    const counts = {};
    for (const line of lines) if (kind(line)) counts[kind(line)] = (counts[kind(line)] || 0) + 1;
    console.log(`chromium.log, mode ${name}: ${lines.length} lines, by process: ${JSON.stringify(counts)}`);
    const others = lines.filter((line) => kind(line) && kind(line) !== 'Browser');
    if (others.length) console.log(`--- chromium.log, the lines of processes other than the window's own (the first 12 of ${others.length})\n${others.slice(0, 12).join('\n')}`);
    console.log(`--- graphics.log, mode ${name}\n${mine()}`);
  } finally {
    await app.close().catch(() => {});
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 3 });
  }
}

/**
 * The graphics modes' runs: each mode once (default again, asked for by name, for its switches), the GPU
 * process crashed in the second. The last is Direct3D 11 on 12 without DirectComposition: a runner draws in
 * software, where DirectComposition is off whatever is asked, and only under Direct3D 11 on 12 does its
 * software adapter say that it has it; so there the first mode's switch is seen to take it away.
 */
const MODE_RUNS = [
  ['default', {}],
  ['no-dcomp', { crash: true }],
  ['gl', {}],
  ['d3d11on12', {}],
  ['gpu-raster', {}],
  ['d3d11on12', { switches: ['--disable-direct-composition'] }],
];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  if (process.env.GRG_SMOKE_MODES_ONLY === '1') {
    for (const [mode, how] of MODE_RUNS) await modeRun(mode, how);
    console.log('desktop smoke test (graphics modes only): ok');
    return;
  }
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
  await graphicsLoss(app, win).catch((e) => console.warn('graphics-loss check skipped:', e.message));
  await app.close();
  // the graphics compatibility modes: the app comes up in each (default is the run above)
  for (const [mode, how] of MODE_RUNS) await modeRun(mode, how);
  console.log('desktop smoke test: ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
