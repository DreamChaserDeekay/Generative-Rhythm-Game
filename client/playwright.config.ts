import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const webPort = Number(process.env.GRG_E2E_PORT ?? 5199);
const apiPort = Number(process.env.GRG_E2E_API_PORT ?? 8799);
const venvPython = process.platform === 'win32' ? '../server/.venv/Scripts/python.exe' : '../server/.venv/bin/python';
const python = process.env.GRG_PYTHON ?? (existsSync(venvPython) ? venvPython : 'python');
const dataDir = 'test-results/e2e-data';

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } }],
  webServer: [
    {
      command: `node -e "require('fs').rmSync('${dataDir}',{recursive:true,force:true})" && ${python} -m rhythm_server --port ${apiPort} --data ${dataDir}`,
      url: `http://127.0.0.1:${apiPort}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { PYTHONPATH: '../server' },
    },
    {
      command: `npx vite --port ${webPort} --strictPort`,
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { GRG_SERVER_URL: `http://127.0.0.1:${apiPort}` },
    },
  ],
});
