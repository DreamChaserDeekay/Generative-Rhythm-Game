// Desktop shell: starts the bundled analysis server on a local port and opens the game in a
// Chromium window. Electron (not Tauri) so the audio clock behaves exactly as in Chrome/Edge on
// every OS: the game relies on AudioContext.getOutputTimestamp() and outputLatency for sync.
// The window opens as it was left (size, place, maximized, full screen), on the home port (the
// game's settings are kept in that origin's storage).
const { app, BrowserWindow, crashReporter, dialog, ipcMain, Menu, powerMonitor, screen, shell } = require('electron');
const { execFile, spawn, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { MAX_DUMP_BYTES, dumpSummary } = require('./crashDump');
const { LOG_NAME, REGISTRY_KEYS, appendLine, featureFields, graphicsWatch, memoryFields, pruneShots } = require('./graphicsLog');
const { CONFIRM_MS, EARLY_LOSSES, MODES, MODE_IDS, NO_WEBGL_MS, confirmed, drawnByCard, givenUp, picked, startPlan } = require('./graphicsMode');
const { PORT_MIN, restoredBounds, sanitizeState, usablePort, windowState, workAreasOf } = require('./windowState');

// generous: on a first launch antivirus scanners look at every DLL of the bundled server
const HEALTH_TIMEOUT_MS = 120_000;
/** How long the home port is waited for while a server left on it stops (or one just quit lets it go). */
const HOME_WAIT_MS = 4000;
/** A picture of the window kept beside the logs is no wider than this (a 4K window's would be several MB). */
const SHOT_MAX_WIDTH = 1920;
/** Chromium's own log beside the app's (the processes' warnings and errors), and how much of its end is read after a loss. */
const CHROMIUM_LOG = 'chromium.log';
const CHROMIUM_TAIL_BYTES = 128 * 1024;
/** Past this size Chromium's log is emptied (a driver that warns on every frame must not fill the disk). */
const CHROMIUM_LOG_MAX_BYTES = 16 * 1024 * 1024;
/** How often the GPU process is looked at (its memory, for the line written should it go). */
const GPU_SAMPLE_MS = 5000;
/** The graphics compatibility modes as the app's own messages name them (the settings name them the same). */
const MODE_LABELS = { default: '기본', 'no-dcomp': 'DirectComposition 끄기', gl: 'OpenGL', d3d11on12: 'Direct3D 11on12' };
const isWindows = process.platform === 'win32';

// keep timers and audio steady when the window is in the background, allow audio before a click
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
// The game draws with WebGL: without usable GPU drivers (VMs, remote desktop) let Chromium fall back
// to its software renderer, which it no longer does on its own. The window only ever shows the
// game's own local page (see will-navigate below) and, inside it, YouTube's embedded player for
// background videos (see will-frame-navigate), so arbitrary pages never reach that renderer.
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
// After a second loss of the graphics process within a few seconds Chromium gives a page no WebGL
// context back until the app is restarted: the track would stay empty for the rest of the play.
// The window shows the game only, so it is given back every time.
app.disableDomainBlockingFor3DAPIs();

// YouTube's embedded player and the Google services it loads (video, ads, sign-in check)
const YOUTUBE_FRAME_HOSTS = /(^|\.)(youtube\.com|youtube-nocookie\.com|googlevideo\.com|google\.com|doubleclick\.net|googlesyndication\.com|googleapis\.com|gstatic\.com)$/;

let server = null;
let quitting = false;
let gameOrigin = null;
/** The game's window (the app has the one; a test may open others). */
let gameWindow = null;
/** What is kept between launches (windowState.js), read when the app is ready. */
let state = sanitizeState(null);

function statePath() {
  return path.join(app.getPath('userData'), 'desktop-state.json');
}

function readState() {
  try {
    return sanitizeState(JSON.parse(fs.readFileSync(statePath(), 'utf8')));
  } catch {
    return sanitizeState(null);
  }
}

function writeState() {
  try {
    // whole or not at all: written aside, then moved over the old one
    const file = statePath();
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(state));
    fs.renameSync(`${file}.tmp`, file);
  } catch (e) {
    console.error('could not keep the window state:', e);
  }
}

/**
 * Chromium's own log goes to chromium.log beside the app's: what its processes warn of and fail at, the
 * GPU process among them (a lost Direct3D device and the reason the driver gave are written there and
 * nowhere else). Set before the app is ready: the switches for the window's own process and for the GPU
 * process's leave to write the file, the environment for the processes started from here on, which read
 * the file's name from it. The last run's log is kept as chromium.log.1.
 */
function keepChromiumLog() {
  const file = path.join(app.getPath('userData'), CHROMIUM_LOG);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) fs.renameSync(file, `${file}.1`);
  } catch {
    // held by a process an earlier run left: this run's lines are added to it
  }
  process.env.ELECTRON_ENABLE_LOGGING = 'file';
  process.env.ELECTRON_LOG_FILE = file;
  app.commandLine.appendSwitch('enable-logging', 'file');
  app.commandLine.appendSwitch('log-file', file);
  // warnings and errors (0 for everything, a test's)
  app.commandLine.appendSwitch('log-level', /^[0-3]$/.test(process.env.GRG_CHROMIUM_LOG_LEVEL ?? '') ? process.env.GRG_CHROMIUM_LOG_LEVEL : '1');
}

/** The end of Chromium's log, as text; emptied first should it have grown past all use. */
function chromiumTail() {
  const file = path.join(app.getPath('userData'), CHROMIUM_LOG);
  const { size } = fs.statSync(file);
  const length = Math.min(size, CHROMIUM_TAIL_BYTES);
  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, buffer, 0, length, size - length);
  } finally {
    fs.closeSync(fd);
  }
  return buffer.toString('utf8');
}

function trimChromiumLog() {
  const file = path.join(app.getPath('userData'), CHROMIUM_LOG);
  try {
    if (fs.statSync(file).size > CHROMIUM_LOG_MAX_BYTES) fs.truncateSync(file, 0);
  } catch {
    // no log, or not ours to cut
  }
}

/** Whether this is the app's one running copy (a second one hands over to it and quits: see the end of the file). */
const primary = app.requestSingleInstanceLock();
/**
 * How this launch draws (graphicsMode.js): the mode's switches are set here, before the app is ready,
 * and the start is counted against a mode that has yet to come up. A mode asked for by the environment
 * (GRG_GRAPHICS_MODE: tests) is this launch's only.
 */
let launch = { mode: 'default', forced: false, note: null };
if (primary) {
  state = readState();
  launch = startPlan(state.graphics, process.env.GRG_GRAPHICS_MODE);
  if (!launch.forced && JSON.stringify(launch.graphics) !== JSON.stringify(state.graphics)) {
    state.graphics = launch.graphics;
    writeState();
  }
  for (const [name, value] of MODES[launch.mode]) app.commandLine.appendSwitch(name, value);
  keepChromiumLog();
  // a process of the app that crashes leaves a dump beside the logs (crashDump.js reads where it stopped);
  // nothing is sent anywhere
  try {
    crashReporter.start({ uploadToServer: false });
  } catch (e) {
    console.error('could not start the crash reporter:', e);
  }
}

function listenOn(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => {
      const { port: free } = probe.address();
      probe.close(() => resolve(free));
    });
  });
}

/** Any free port the game may be served on (the system's pick, else one drawn from the dynamic ports). */
async function freePort() {
  for (let i = 0; i < 20; i++) {
    const port = await listenOn(i === 0 ? 0 : PORT_MIN + Math.floor(Math.random() * (65536 - PORT_MIN))).catch(() => null);
    if (usablePort(port)) return port;
  }
  throw new Error('분석 서버에 쓸 빈 포트가 없습니다');
}

/** Asks the server an earlier launch left on `port` (its window gone by force, it stayed) to stop; true when it will. */
function stopLeftServer(port, token) {
  return new Promise((resolve) => {
    if (!token) {
      resolve(false);
      return;
    }
    const req = http.request({ host: '127.0.0.1', port, path: '/api/shutdown', method: 'POST', headers: { 'X-Shutdown-Token': token }, timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 202);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => req.destroy());
    req.end();
  });
}

/**
 * The port to serve the game on: the home port while it can be had (the page's origin, whose
 * storage keeps the game's settings: keys, offsets, parts, favourites). A server of ours left on it
 * is asked to stop, and one stopping is waited for a moment. Taken by something else, or held back
 * by the system (Windows' excluded port ranges, which can change at a restart), any free port for
 * this launch only: the home port stays the home port (`home` false). The first launch makes its
 * port the home port.
 */
async function serverPort() {
  if (state.port === null) return { port: await freePort(), home: true };
  const deadline = Date.now() + HOME_WAIT_MS;
  let asked = false;
  for (;;) {
    try {
      return { port: await listenOn(state.port), home: true };
    } catch (e) {
      // taken (by a server of ours left behind, or another program), or not to be had at all
      if (e?.code === 'EACCES') return { port: await freePort(), home: false };
    }
    if (!asked) {
      asked = true;
      await stopLeftServer(state.port, state.token);
    }
    if (Date.now() >= deadline) return { port: await freePort(), home: false };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** The bundled server when packaged, the repository's Python server in development. */
function serverCommand(port, dataDir) {
  const args = ['--port', String(port), '--data', dataDir];
  const bundled = path.join(process.resourcesPath, 'server', isWindows ? 'rhythm-server.exe' : 'rhythm-server');
  if (app.isPackaged || fs.existsSync(bundled)) return { cmd: bundled, args, env: {} };
  const repo = path.resolve(__dirname, '..');
  const venv = path.join(repo, 'server', '.venv', isWindows ? 'Scripts/python.exe' : 'bin/python');
  const python = process.env.GRG_PYTHON || (fs.existsSync(venv) ? venv : 'python');
  return { cmd: python, args: ['-m', 'rhythm_server', ...args], env: { PYTHONPATH: path.join(repo, 'server') } };
}

function waitForHealth(port) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else retry();
      });
      req.on('error', retry);
      req.on('timeout', () => req.destroy());
    };
    const retry = () => {
      if (server && server.exitCode !== null) reject(new Error(`분석 서버가 종료되었습니다 (코드 ${server.exitCode})`));
      else if (Date.now() > deadline) reject(new Error('분석 서버가 응답하지 않습니다'));
      else setTimeout(attempt, 250);
    };
    attempt();
  });
}

async function startServer() {
  const { port, home } = await serverPort();
  const dataDir = process.env.GRG_DATA_DIR || path.join(app.getPath('userData'), 'library');
  fs.mkdirSync(dataDir, { recursive: true });
  const { cmd, args, env } = serverCommand(port, dataDir);
  // the server stops when asked with this token: by the next launch, should this one leave it behind
  const token = crypto.randomBytes(16).toString('hex');
  server = spawn(cmd, args, {
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', GRG_SHUTDOWN_TOKEN: token, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (home) {
    // kept at once: a launch closed by force while its server starts still leaves the way to stop it
    state.port = port;
    state.token = token;
    writeState();
  }
  const log = fs.createWriteStream(path.join(app.getPath('userData'), 'server.log'), { flags: 'a' });
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  server.on('exit', (code) => {
    if (!quitting) console.error(`analysis server exited with code ${code}`);
  });
  await waitForHealth(port);
  return { port, home };
}

function stopServer() {
  if (!server || server.exitCode !== null) return;
  // waited for: on will-quit the app may exit before an async taskkill /t reaches the server's children
  if (isWindows) spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { windowsHide: true });
  else server.kill('SIGTERM');
}

/** Whether an IPC call comes from the game's own page (not a frame inside it, nor the start page). */
function fromGame(event) {
  const url = event.senderFrame?.url ?? '';
  return gameOrigin !== null && url.startsWith(`${gameOrigin}/`);
}

const within = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

/** The server's JSON answer to a GET, as { ok: true, body } or { ok: false, error }: never rejects. */
function serverJson(pathname) {
  return new Promise((resolve) => {
    if (gameOrigin === null) {
      resolve({ ok: false, error: 'no server' });
      return;
    }
    const req = http.get({ host: '127.0.0.1', port: Number(new URL(gameOrigin).port), path: pathname, timeout: 3000 }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        if (text.length < 65536) text += chunk;
      });
      res.on('end', () => {
        try {
          resolve(res.statusCode === 200 ? { ok: true, body: JSON.parse(text) } : { ok: false, error: `HTTP ${res.statusCode}` });
        } catch {
          resolve({ ok: false, error: 'not JSON' });
        }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.code || e.message }));
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

/**
 * How full the NVIDIA cards' memory is, as nvidia-smi tells (it comes with the driver), as { ok: true,
 * text } or { ok: false, error }: never rejects. The game shares the card with what else runs on it:
 * the chart model above all, which keeps a few GB once it has made a chart.
 */
function cardMemory() {
  return new Promise((resolve) => {
    execFile('nvidia-smi', ['--query-gpu=memory.used,memory.total,utilization.gpu', '--format=csv,noheader,nounits'], { timeout: 4000, windowsHide: true }, (error, stdout) => {
      resolve(error ? { ok: false, error: error.code === 'ENOENT' ? 'no nvidia-smi' : String(error.code || error.message).slice(0, 60) } : { ok: true, text: String(stdout) });
    });
  });
}

/** A command's output as { ok: true, text } or { ok: false, error } (its exit code, or why it did not run): never rejects. */
function commandText(cmd, args, timeout = 6000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      resolve(error ? { ok: false, error: String(error.code ?? error.message).slice(0, 60) } : { ok: true, text: String(stdout) });
    });
  });
}

/** Windows' settings that change how a window gets to the screen (graphicsLog.js's registryFields reads them). */
async function registryAnswers() {
  const answers = await Promise.all(Object.entries(REGISTRY_KEYS).map(async ([name, key]) => [name, await commandText('reg', ['query', key], 4000)]));
  return Object.fromEntries(answers);
}

/** The game's window as it is: in full screen or not, with the keyboard or not, its size. */
function windowFields() {
  const win = gameWindow;
  if (!win || win.isDestroyed()) return {};
  const { width, height } = win.getBounds();
  const yes = (on) => (on ? 'yes' : 'no');
  return { fullScreen: yes(win.isFullScreen()), maximized: win.isMaximized() ? 'yes' : undefined, minimized: win.isMinimized() ? 'yes' : undefined, focused: yes(win.isFocused()), size: `${width}x${height}` };
}

/** The GPU process as it was last looked at (every few seconds: once it is gone there is nothing to look at). */
let gpuSample = null;
function sampleGpuProcess() {
  const mb = (kb) => (Number.isFinite(kb) ? Math.round(kb / 1024) : undefined);
  // (Chromium may run a second, short-lived one to ask the card something: the one that draws is the larger)
  const [gpu] = app
    .getAppMetrics()
    .filter((m) => m.type === 'GPU')
    .sort((a, b) => (b.memory?.workingSetSize ?? 0) - (a.memory?.workingSetSize ?? 0));
  if (gpu) gpuSample = { at: Date.now(), pid: gpu.pid, workingSetMB: mb(gpu.memory?.workingSetSize), peakMB: mb(gpu.memory?.peakWorkingSetSize), privateMB: mb(gpu.memory?.privateBytes) };
}

function gpuProcessFields() {
  if (!gpuSample) return {};
  const { at, ...fields } = gpuSample;
  return { ...fields, seenMsAgo: Date.now() - at };
}

/**
 * The crash dump written since `sinceMs` (Crashpad's, beside the logs), as { file, summary }: the newest
 * one, with where the process stopped (crashDump.js), or null when there is none.
 */
function newestDump(sinceMs) {
  const root = app.getPath('crashDumps');
  let newest = null;
  const look = (dir, depth) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (depth < 2) look(file, depth + 1);
      } else if (item.name.endsWith('.dmp')) {
        const { mtimeMs, size } = fs.statSync(file);
        if (mtimeMs >= sinceMs && (!newest || mtimeMs > newest.mtimeMs)) newest = { file, mtimeMs, size };
      }
    }
  };
  try {
    look(root, 0);
  } catch {
    return null;
  }
  if (!newest) return null;
  const name = path.relative(app.getPath('userData'), newest.file).replace(/\\/g, '/');
  let summary = null;
  try {
    if (newest.size <= MAX_DUMP_BYTES) summary = dumpSummary(fs.readFileSync(newest.file));
  } catch {
    // not to be read: the file's name is told all the same
  }
  return { file: name, summary };
}

/**
 * The renderer a WebGL canvas of the game's page gets (the card and ANGLE's backend, as the page is
 * given them: "ANGLE (NVIDIA, … Direct3D11 …)"), 'none' when it gets no context; undefined while the
 * window does not show the game. The canvas is the question's own and is let go at once.
 */
async function pageRenderer() {
  const win = gameWindow;
  if (!win || win.isDestroyed() || gameOrigin === null || !win.webContents.getURL().startsWith(`${gameOrigin}/`)) return undefined;
  const ask = `(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return 'none';
      const names = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = String(names ? gl.getParameter(names.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return renderer;
    } catch (e) {
      return 'none';
    }
  })()`;
  return within(win.webContents.executeJavaScript(ask), 4000).catch(() => undefined);
}

/** A picture of the window as it is now, saved beside the logs under `name` (the newest few are kept). */
async function pictureWindow(name) {
  const win = gameWindow;
  if (!win || win.isDestroyed()) throw new Error('no window');
  let image = await within(win.webContents.capturePage(), 5000);
  if (image.isEmpty()) throw new Error('an empty picture');
  if (image.getSize().width > SHOT_MAX_WIDTH) image = image.resize({ width: SHOT_MAX_WIDTH });
  const dir = app.getPath('userData');
  fs.writeFileSync(path.join(dir, name), image.toJPEG(85));
  pruneShots(dir);
  return name;
}

/**
 * What is written down when the graphics are lost (graphicsLog.js), in graphics.log beside
 * server.log: the process that went and why, what the page's WebGL canvases went through
 * (preload.js tells), whether the server was making a chart then (its model works on the same
 * GPU), and a picture of the window once the graphics are back, or did not come back.
 */
const graphics = graphicsWatch({
  write(line) {
    try {
      appendLine(path.join(app.getPath('userData'), LOG_NAME), line);
    } catch (e) {
      console.error('could not write the graphics log:', e);
    }
  },
  now: () => new Date(),
  later(fn, ms) {
    const timer = setTimeout(fn, ms);
    return () => clearTimeout(timer);
  },
  queue: () => serverJson('/api/mapper/queue'),
  memory: cardMemory,
  features: () => app.getGPUFeatureStatus(),
  shot: pictureWindow,
  // how Chromium draws: the renderer and the way to the screen (some PCs never answer the whole of it)
  info: () => within(app.getGPUInfo('complete'), 10_000),
  page: pageRenderer,
  displays: () => screen.getAllDisplays(),
  window: windowFields,
  gpuProcess: gpuProcessFields,
  chromium: async () => chromiumTail(),
  dump: async (sinceMs) => newestDump(sinceMs),
  // what Windows keeps: its settings for the graphics drivers, and its logs of them and of crashed programs
  ...(isWindows
    ? {
        registry: registryAnswers,
        events: (log, query) => commandText('wevtutil', ['qe', log, `/q:${query}`, '/f:xml', '/c:8', '/rd:true']),
      }
    : {}),
});

/** The first line of a run: the versions, the graphics cards, and whether they draw the game. */
async function noteStart() {
  const hex = (n) => Number(n).toString(16).padStart(4, '0');
  const gpu = await within(app.getGPUInfo('basic'), 5000).catch(() => null);
  const mapper = await serverJson('/api/mapper');
  const memory = memoryFields(await cardMemory());
  graphics.started({
    app: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    os: `${process.platform} ${os.release()}`,
    // the graphics compatibility mode this launch runs in, with the switches it started Chromium with
    mode: launch.mode,
    switches: MODES[launch.mode].map((s) => s.join('=')),
    asked: launch.forced ? 'for this launch' : undefined,
    pid: process.pid,
    // vendor:device of each card, the one in use starred, with its name and driver where Chromium knows
    // them; NVIDIA's by name with their memory (the server lists them)
    cards: Array.isArray(gpu?.gpuDevice)
      ? gpu.gpuDevice.map((d) => [`${hex(d.vendorId)}:${hex(d.deviceId)}${d.active ? '*' : ''}`, d.deviceString, d.driverVersion && `driver ${d.driverVersion}`].filter(Boolean).join(' '))
      : undefined,
    gl: typeof gpu?.auxAttributes?.glRenderer === 'string' ? gpu.auxAttributes.glRenderer : undefined,
    nvidia: mapper.ok && Array.isArray(mapper.body?.gpus) ? mapper.body.gpus.map((g) => `${g.name} ${g.memoryMB}MB`) : undefined,
    mapper: mapper.ok ? mapper.body?.state : undefined,
    // (how full the cards' memory is as the app starts; left out where it cannot be read)
    vram: Array.isArray(memory.vram) ? memory.vram : undefined,
    ...featureFields(app.getGPUFeatureStatus()),
  });
  if (launch.note) graphics.note('graphics-mode', { givenUp: launch.note.from, why: launch.note.why });
  // how Chromium draws under that mode (the renderer, the way to the screen, every GPU feature), the screens, Windows' settings
  sampleGpuProcess();
  await graphics.config();
  await graphics.windows();
}

/** What the settings' 그래픽 호환 모드 shows: the mode kept (the next start's), the one running, and one given up. */
function graphicsModeInfo() {
  return { mode: state.graphics.mode, running: launch.mode, modes: MODE_IDS, reverted: state.graphics.reverted ?? null };
}

/** The app again, from its start: in the graphics mode kept. */
function restartApp() {
  // (the new process reads Chromium's log file from its own start: not from this one's environment)
  delete process.env.ELECTRON_ENABLE_LOGGING;
  delete process.env.ELECTRON_LOG_FILE;
  app.relaunch();
  app.quit();
}

/**
 * A mode other than default has to come up: the game drawn by the graphics card for a while, the GPU
 * process staying. Once it has, nothing is counted against it any more. Should the game be drawn in
 * software under it (the driver has no such renderer), or the GPU process go twice before that, the mode
 * is given up: default from the next start on, and the player is told and offered the restart.
 */
function watchGraphicsMode(win) {
  if (launch.note) {
    void dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Generative Rhythm',
      buttons: ['확인'],
      message: '그래픽 호환 모드를 기본으로 되돌렸습니다',
      detail: `"${MODE_LABELS[launch.note.from]}" 모드로는 앱이 두 번 이어서 끝까지 뜨지 못해, 이번에는 기본 모드로 열었습니다. 다른 모드는 설정 → 연출·배경 → 그래픽 호환 모드에서 고를 수 있습니다.`,
    });
  }
  if (launch.forced || launch.mode === 'default') return;
  let settled = false;
  let losses = 0;
  const giveUp = (why, told) => {
    if (settled) return;
    settled = true;
    // (the player picked another one in the meantime: that one is not this one's to give up)
    if (state.graphics.mode !== launch.mode) return;
    state.graphics = givenUp(state.graphics, why);
    writeState();
    graphics.note('graphics-mode', { mode: launch.mode, givenUp: why });
    if (win.isDestroyed()) return;
    void dialog
      .showMessageBox(win, {
        type: 'warning',
        title: 'Generative Rhythm',
        buttons: ['지금 다시 시작', '나중에'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
        message: '그래픽 호환 모드를 기본으로 되돌립니다',
        detail: `"${MODE_LABELS[launch.mode]}" 모드에서는 ${told} 앱을 다시 시작하면 기본 모드로 열립니다.`,
      })
      .then(({ response }) => {
        if (response === 0) restartApp();
      });
  };
  app.on('child-process-gone', (_event, details) => {
    if (settled || details.type !== 'GPU' || details.reason === 'clean-exit') return;
    losses += 1;
    if (losses >= EARLY_LOSSES) giveUp(`the GPU process went ${losses} times before the mode had come up`, '앱이 뜨는 동안 그래픽 프로세스가 두 번 끊겼습니다.');
  });
  // (a page that gets no WebGL at all has no track: not waited out)
  setTimeout(async () => {
    if ((await pageRenderer()) === 'none') giveUp('the game gets no WebGL under it', '게임이 그래픽(WebGL)을 받지 못해 기어를 그릴 수 없습니다(이 PC의 드라이버가 이 방식을 지원하지 않는 것으로 보입니다).');
  }, NO_WEBGL_MS);
  setTimeout(async () => {
    const renderer = await pageRenderer();
    if (settled) return;
    if (!drawnByCard(app.getGPUFeatureStatus(), renderer)) {
      giveUp(
        renderer === 'none' ? 'the game gets no WebGL under it' : 'the game is drawn in software under it',
        '게임을 그래픽 카드로 그리지 못합니다(이 PC의 드라이버가 이 방식을 지원하지 않는 것으로 보입니다).',
      );
      return;
    }
    settled = true;
    if (state.graphics.mode === launch.mode) {
      state.graphics = confirmed(state.graphics);
      writeState();
    }
    graphics.note('graphics-mode', { mode: launch.mode, cameUp: 'yes', webgl: renderer });
  }, CONFIRM_MS);
}

/**
 * What the window and the screens do is kept for a while (graphicsLog.js's `seen`): a loss of the graphics
 * that follows a screen changing its mode, or the window losing the keyboard, is told with it. A screen
 * that changes is written down at once: no one asks for that in play.
 */
function watchWindowAndScreens(win) {
  for (const event of ['blur', 'focus', 'minimize', 'restore', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'show', 'hide', 'resize', 'move']) {
    win.on(event, () => graphics.seen(event));
  }
  screen.on('display-metrics-changed', (_event, _display, changed) => graphics.seen(`display-metrics-changed ${(changed ?? []).join('+')}`, true));
  screen.on('display-added', () => graphics.seen('display-added', true));
  screen.on('display-removed', () => graphics.seen('display-removed', true));
  for (const event of ['suspend', 'resume', 'lock-screen', 'unlock-screen', 'on-ac', 'on-battery']) {
    powerMonitor.on(event, () => graphics.seen(event));
  }
  let ticks = 0;
  const timer = setInterval(() => {
    sampleGpuProcess();
    ticks += 1;
    if (ticks % 12 === 0) trimChromiumLog();
  }, GPU_SAMPLE_MS);
  // (the app does not stay for it)
  timer.unref();
}

/**
 * Keeps the window's state as it changes (its size and place a moment after a drag ends) and
 * tells the page when it goes into or out of full screen (the settings' 화면 모드 follows F11).
 */
function keepWindowState(win) {
  let timer = null;
  /** Maximized, under its full screen too (a full screen opened over a maximized window leaves it maximized). */
  let maximized = state.window.maximized === true;
  const keep = () => {
    clearTimeout(timer);
    if (win.isDestroyed()) return;
    const fullScreen = win.isFullScreen();
    if (!fullScreen) maximized = win.isMaximized();
    state.window = windowState(win.getNormalBounds(), maximized, fullScreen);
    writeState();
  };
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(keep, 500);
  };
  win.on('resize', later);
  win.on('move', later);
  win.on('maximize', keep);
  win.on('unmaximize', keep);
  for (const [event, on] of [
    ['enter-full-screen', true],
    ['leave-full-screen', false],
  ]) {
    win.on(event, () => {
      // out of a full screen the app opened in over a maximized window: maximized again
      if (!on && maximized && !win.isDestroyed() && !win.isMaximized()) win.maximize();
      keep();
      // (closing in full screen can leave it on the way out)
      if (!win.isDestroyed()) win.webContents.send('grg:full-screen', on);
    });
  }
  win.on('close', keep);
}

async function createWindow() {
  const saved = state.window;
  const win = new BrowserWindow({
    // the main screen first: a window with no place of its own is centred on it
    ...restoredBounds(saved, workAreasOf(screen.getAllDisplays(), screen.getPrimaryDisplay().id)),
    minWidth: 960,
    minHeight: 600,
    fullscreen: saved.fullScreen === true,
    backgroundColor: '#05070f',
    title: 'Generative Rhythm',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      // full screen for the settings' 화면 모드 (preload.js)
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  gameWindow = win;
  if (saved.maximized && !saved.fullScreen) win.maximize();
  keepWindowState(win);
  watchWindowAndScreens(win);
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent('<body style="background:#05070f;color:#8d98c4;font:16px sans-serif;display:grid;place-items:center;height:100vh">분석 서버를 시작하는 중…</body>')}`);
  try {
    const { port, home } = await startServer();
    gameOrigin = `http://127.0.0.1:${port}`;
    // the same origin as the last launch may have the game of an older version in its HTTP cache
    // (its page names the files of that build): the game's files are local, so none of them is
    // kept (other sites' stay: a background video's player)
    await win.webContents.session.clearData({ dataTypes: ['cache'], origins: [gameOrigin], originMatchingMode: 'origin-in-all-contexts' });
    // YouTube refuses a video whose owner limits embedding (error 150, e.g. official MVs) to a page
    // on an IP address: its player is told the page is on localhost (the game's origin stays
    // 127.0.0.1, where the settings are kept)
    const ipReferer = `${gameOrigin}/`;
    win.webContents.session.webRequest.onBeforeSendHeaders({ urls: ['https://*.youtube.com/*', 'https://*.youtube-nocookie.com/*'] }, (details, callback) => {
      const headers = details.requestHeaders;
      for (const name of Object.keys(headers)) {
        if (/^referer$/i.test(name) && headers[name].startsWith(ipReferer)) headers[name] = headers[name].replace('://127.0.0.1:', '://localhost:');
      }
      callback({ requestHeaders: headers });
    });
    await win.loadURL(`${gameOrigin}/`);
    if (!home) {
      void dialog.showMessageBox(win, {
        type: 'warning',
        title: 'Generative Rhythm',
        buttons: ['확인'],
        message: '저장된 설정을 이번에는 쓸 수 없습니다',
        detail: `설정이 저장된 포트(${state.port})를 다른 프로그램이 쓰고 있거나 시스템이 막아 두어 이번에는 다른 포트로 열었습니다. 이번 실행에서는 키·오프셋·스킨·즐겨찾기가 처음 값으로 보이고, 여기서 바꾼 설정은 남지 않습니다. 그 프로그램을 닫거나 컴퓨터를 다시 시작한 뒤 앱을 열면 원래 설정으로 돌아옵니다.`,
      });
    }
  } catch (e) {
    const message = String(e instanceof Error ? e.message : e).replace(/</g, '&lt;');
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<body style="background:#05070f;color:#ff8fa3;font:16px sans-serif;padding:40px">${message}<br><br>로그: ${path.join(app.getPath('userData'), 'server.log')}</body>`)}`);
  }
  void noteStart().catch((e) => console.error('could not note the start in the graphics log:', e));
  watchGraphicsMode(win);
  // the page holds the window over unsaved edits (the chart editor's beforeunload): the player picks
  // here, as Electron otherwise keeps the window open without a word (the same event for a close
  // and a reload, so the button names neither)
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: 'Generative Rhythm',
      buttons: ['편집 버리기', '돌아가기'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      message: '저장하지 않은 편집이 있습니다',
    });
    // prevented, the page's beforeunload is ignored and the window goes on closing (or reloading)
    if (choice === 0) event.preventDefault();
  });
  // links to other sites open in the system browser, the window stays on the game
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (gameOrigin && url.startsWith(`${gameOrigin}/`)) return;
    event.preventDefault();
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });
  // frames inside the game: only YouTube's player (a background video) and what it loads itself
  win.webContents.on('will-frame-navigate', (details) => {
    if (details.isMainFrame) return;
    let host = '';
    try {
      host = new URL(details.url).hostname;
    } catch {
      // not a URL
    }
    if (details.url.startsWith('about:') || (gameOrigin && details.url.startsWith(`${gameOrigin}/`)) || YOUTUBE_FRAME_HOSTS.test(host)) return;
    details.preventDefault();
  });
}

if (!primary) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = gameWindow;
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  // a process of the app gone under it (the GPU's above all: the game's graphics with it): written down
  app.on('child-process-gone', (_event, details) => graphics.childGone(details));
  app.on('render-process-gone', (_event, _contents, details) => graphics.renderGone(details));
  // (how the game is drawn after it: by the graphics card still, or in software from then on)
  app.on('gpu-info-update', () => graphics.featuresMayHaveChanged());
  app.whenReady().then(() => {
    // the settings' 화면 모드: the window of the page that asks
    ipcMain.handle('grg:set-full-screen', (event, on) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || !fromGame(event)) return false;
      win.setFullScreen(on === true);
      return on === true;
    });
    ipcMain.handle('grg:is-full-screen', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      return Boolean(win && fromGame(event) && win.isFullScreen());
    });
    // a WebGL canvas of the game losing its context, or getting it back (preload.js)
    ipcMain.on('grg:graphics', (event, record) => {
      if (fromGame(event)) graphics.page(record);
    });
    // the settings' 그래픽 호환 모드: the mode kept is the next start's (Chromium's switches cannot change while it runs)
    ipcMain.handle('grg:graphics-mode', (event) => (fromGame(event) ? graphicsModeInfo() : null));
    ipcMain.handle('grg:set-graphics-mode', (event, mode) => {
      if (!fromGame(event)) return null;
      state.graphics = picked(mode);
      writeState();
      graphics.note('graphics-mode', { picked: state.graphics.mode, running: launch.mode });
      return graphicsModeInfo();
    });
    ipcMain.handle('grg:restart', (event) => {
      if (!fromGame(event)) return false;
      restartApp();
      return true;
    });
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { role: 'fileMenu' },
        { role: 'viewMenu' },
        { label: '창', submenu: [{ role: 'togglefullscreen' }, { role: 'minimize' }] },
      ]),
    );
    createWindow();
  });
  // once the window has closed: a quit the window turns back (돌아가기 over unsaved edits) keeps the server
  app.on('will-quit', () => {
    quitting = true;
    stopServer();
  });
  app.on('window-all-closed', () => app.quit());
}
