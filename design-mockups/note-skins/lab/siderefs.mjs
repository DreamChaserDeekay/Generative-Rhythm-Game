// Saves the side notes' references for the image model:  node siderefs.mjs <outdir>   (the lab served on :5199)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://127.0.0.1:5199/');
await page.waitForFunction(() => window.labReady === true);
for (const side of ['bar', 'dots']) {
  const url = await page.evaluate((s) => window.labSideRef(s), side);
  writeFileSync(`${out}/${side}.png`, Buffer.from(url.split(',')[1], 'base64'));
}
await browser.close();
