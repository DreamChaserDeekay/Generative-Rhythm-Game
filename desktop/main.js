// Desktop shell: starts the bundled analysis server on a local port and opens the game in a
// Chromium window. Electron (not Tauri) so the audio clock behaves exactly as in Chrome/Edge on
// every OS: the game relies on AudioContext.getOutputTimestamp() and outputLatency for sync.
// The window opens as it was left (size, place, maximized, full screen), on the home port (the
// game's settings are kept in that origin's storage).
const { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell } = require('electron');
const { spawn, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { PORT_MIN, restoredBounds, sanitizeState, usablePort, windowState, workAreasOf } = require('./windowState');

// generous: on a first launch antivirus scanners look at every DLL of the bundled server
const HEALTH_TIMEOUT_MS = 120_000;
/** How long the home port is waited for while a server left on it stops (or one just quit lets it go). */
const HOME_WAIT_MS = 4000;
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

// YouTube's embedded player and the Google services it loads (video, ads, sign-in check)
const YOUTUBE_FRAME_HOSTS = /(^|\.)(youtube\.com|youtube-nocookie\.com|googlevideo\.com|google\.com|doubleclick\.net|googlesyndication\.com|googleapis\.com|gstatic\.com)$/;

let server = null;
let quitting = false;
let gameOrigin = null;
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
 * storage keeps the game's settings: keys, offsets, skin, favourites). A server of ours left on it
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
  if (saved.maximized && !saved.fullScreen) win.maximize();
  keepWindowState(win);
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

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    state = readState();
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
