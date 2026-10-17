// Desktop shell: starts the bundled analysis server on a free local port and opens the game in a
// Chromium window. Electron (not Tauri) so the audio clock behaves exactly as in Chrome/Edge on
// every OS: the game relies on AudioContext.getOutputTimestamp() and outputLatency for sync.
const { app, BrowserWindow, Menu, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const HEALTH_TIMEOUT_MS = 60_000;
const isWindows = process.platform === 'win32';

// keep timers and audio steady when the window is in the background, allow audio before a click
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

let server = null;
let quitting = false;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
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
  const port = await freePort();
  const dataDir = process.env.GRG_DATA_DIR || path.join(app.getPath('userData'), 'library');
  fs.mkdirSync(dataDir, { recursive: true });
  const { cmd, args, env } = serverCommand(port, dataDir);
  server = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const log = fs.createWriteStream(path.join(app.getPath('userData'), 'server.log'), { flags: 'a' });
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  server.on('exit', (code) => {
    if (!quitting) console.error(`analysis server exited with code ${code}`);
  });
  await waitForHealth(port);
  return port;
}

function stopServer() {
  if (!server || server.exitCode !== null) return;
  if (isWindows) spawn('taskkill', ['/pid', String(server.pid), '/t', '/f']);
  else server.kill('SIGTERM');
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#05070f',
    title: 'Generative Rhythm',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent('<body style="background:#05070f;color:#8d98c4;font:16px sans-serif;display:grid;place-items:center;height:100vh">분석 서버를 시작하는 중…</body>')}`);
  try {
    const port = await startServer();
    await win.loadURL(`http://127.0.0.1:${port}/`);
  } catch (e) {
    const message = String(e instanceof Error ? e.message : e).replace(/</g, '&lt;');
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<body style="background:#05070f;color:#ff8fa3;font:16px sans-serif;padding:40px">${message}<br><br>로그: ${path.join(app.getPath('userData'), 'server.log')}</body>`)}`);
  }
  // links to other sites open in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
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
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { role: 'fileMenu' },
        { role: 'viewMenu' },
        { label: '창', submenu: [{ role: 'togglefullscreen' }, { role: 'minimize' }] },
      ]),
    );
    createWindow();
  });
  app.on('before-quit', () => {
    quitting = true;
    stopServer();
  });
  app.on('window-all-closed', () => app.quit());
}
