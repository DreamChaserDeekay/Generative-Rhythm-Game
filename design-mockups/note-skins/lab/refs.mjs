// Saves the references for the image model:  node refs.mjs <outdir>   (the lab served on :5199)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2];
mkdirSync(out, { recursive: true });
// each code-drawn long note, and the tap of its skin
const LONGS = { solid: 'flat', prism: 'prism', sky: 'sky', fire: 'fire', aqua: 'aqua', steel: 'steel', noir: 'noir', wire: 'wire', astral: 'astral' };
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://127.0.0.1:5199/');
await page.waitForFunction(() => window.labReady === true);
for (const [long, note] of Object.entries(LONGS)) {
  const url = await page.evaluate(([l, n]) => window.labLongRef(l, n), [long, note]);
  writeFileSync(`${out}/${long}.png`, Buffer.from(url.split(',')[1], 'base64'));
}
await browser.close();
