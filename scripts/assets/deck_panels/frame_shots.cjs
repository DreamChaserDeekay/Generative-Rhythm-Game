// node frame_shots.cjs <keyMode> <outPrefix> <extraJson> <ms,ms,...>  : as shots2, with STANDEES=<gear>:<file,file,...> put in the stage's storage first
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const [,, keyMode, out, extra = '{}', times = '9000'] = process.argv;
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const [vw, vh] = (process.env.VIEW || '1280x720').split('x').map(Number);
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: Number(process.env.DSF || 1) });
  page.on('pageerror', (e) => console.log('pageerror:', String(e).slice(0, 500)));
  if (process.env.NET) page.on('response', (r) => { if (r.status() >= 400 || /stage\/|media\//.test(r.url())) console.log(r.status(), r.url()); });
  page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 300)); });
  const B = process.env.BRAND || 'fire'; const parts = { note: B, side: 'bar', deck: B, hit: B };
  const values = { lastKeyMode: keyMode, parts, cameraPreset: 'SDVX', hiSpeed: 3, ...JSON.parse(extra) };
  await page.addInitScript((v) => localStorage.setItem('grg.settings.v1', JSON.stringify(v)), values);
  const PORT = process.env.PORT || '5198';
  await page.goto(`http://127.0.0.1:${PORT}/`);
  if (process.env.STANDEES) {
    const [gear, list] = process.env.STANDEES.split(':');
    const files = list.split(',').filter(Boolean).map((f) => ({ name: path.basename(f), type: /\.jpe?g$/i.test(f) ? 'image/jpeg' : /\.webp$/i.test(f) ? 'image/webp' : 'image/png', b64: fs.readFileSync(f).toString('base64') }));
    await page.evaluate(async ({ gear, files }) => {
      const kept = files.map((f) => ({ name: f.name, blob: new Blob([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], { type: f.type }) }));
      await new Promise((resolve, reject) => {
        const open = indexedDB.open('grg.standees.v1', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('pictures');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('pictures', 'readwrite');
          if (kept.length) tx.objectStore('pictures').put(kept, gear); else tx.objectStore('pictures').delete(gear);
          tx.oncomplete = () => { open.result.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
      });
    }, { gear, files });
    await page.reload();
  }
  await page.waitForTimeout(3000);
  const title = page.getByTestId('song-title');
  if (!(await title.count()) || !(await title.textContent()).includes('Demo Groove')) await page.getByTestId('song-item').filter({ hasText: 'Demo Groove 150' }).click();
  await page.waitForTimeout(1500);
  const active = async (b) => /active|selected/.test((await b.getAttribute('class')) || '') || (await b.getAttribute('aria-pressed')) === 'true';
  const km = page.getByRole('button', { name: keyMode, exact: true });
  if (!(await active(km))) await km.click({ timeout: 8000 });
  await page.waitForTimeout(1000);
  const df = page.getByRole('button', { name: /EXPERT/ }).first();
  if (!(await active(df))) await df.click({ timeout: 8000 });
  await page.getByTestId('chart-level').waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  if (await page.getByTestId('play-screen').count()) throw new Error('a play started early');
  await page.keyboard.press('Shift+Enter');
  await page.getByTestId('play-screen').waitFor({ timeout: 30000 });
  if (process.env.HIDEHUD) await page.addStyleTag({ content: '.hud, .hud * { visibility: hidden !important }' });
  const t0 = Date.now();
  // RAPID=<n>: from the first time on, n shots one after another of the CLIP=x,y,w,h part of the screen
  const rapid = Number(process.env.RAPID || 0);
  const clip = process.env.CLIP ? (([x, y, width, height]) => ({ x, y, width, height }))(process.env.CLIP.split(',').map(Number)) : undefined;
  if (rapid) {
    await page.waitForTimeout(Math.max(0, Number(times.split(',')[0]) - (Date.now() - t0)));
    for (let i = 0; i < rapid; i++) await page.screenshot({ path: `${out}-${String(i).padStart(2, '0')}.png`, clip });
    console.log('rapid ms per shot', Math.round((Date.now() - t0 - Number(times.split(',')[0])) / rapid));
  } else
  for (const [i, t] of times.split(',').map(Number).entries()) {
    await page.waitForTimeout(Math.max(0, t - (Date.now() - t0)));
    await page.screenshot({ path: `${out}-${i}.png`, clip });
  }
  await browser.close();
})().catch((e) => { console.log('FAILED', String(e).slice(0, 600)); process.exit(1); });
