// Launches a packaged desktop app with Playwright's Electron driver: waits for the game, analyzes a
// demo song, previews a chart, starts an autoplay and saves screenshots along the way.
//   node packaging/smoke_desktop.cjs <client dir with node_modules> <app executable> <screenshot dir>
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const [clientDir, exe, outDir] = process.argv.slice(2);
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
  await win.getByTestId('demo-button').click();
  await win.getByTestId('song-title').waitFor({ timeout: 60000 });
  await win.waitForFunction(() => !document.querySelector('[data-testid="analysis-status"]'), null, { timeout: 180000 });
  await win.screenshot({ path: path.join(outDir, '1-song-select.png') });
  await win.getByTestId('generate-button').click();
  await win.getByTestId('chart-preview').waitFor({ timeout: 60000 });
  await win.screenshot({ path: path.join(outDir, '2-chart-preview.png') });
  console.log('chart notes:', await win.getByTestId('chart-notes').textContent());
  // a play needs an audio device for the song clock; take a picture whatever happens
  try {
    await win.getByTestId('autoplay-toggle').check();
    await win.getByTestId('play-button').click();
    await win.getByTestId('play-screen').waitFor({ timeout: 30000 });
    await win.waitForTimeout(7000);
    await win.screenshot({ path: path.join(outDir, '3-play.png') });
  } catch (e) {
    console.warn('play screenshot skipped:', e.message);
  }
  await app.close();
  console.log('desktop smoke test: ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
