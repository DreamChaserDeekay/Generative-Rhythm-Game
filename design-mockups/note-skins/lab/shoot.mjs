// Shoots the note skin sheets with the lab page (index.html / lab.ts) served by vite on :5199.
//   node ../../../client/node_modules/vite/bin/vite.js --config vite.config.mjs &   then   node shoot.mjs <outdir> [sheet|play|all]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const out = process.argv[2] ?? 'out';
const what = process.argv[3] ?? 'all';
const only = process.argv[4]?.split(',');
mkdirSync(out, { recursive: true });

const STYLES = ['flat', 'prism', 'sky', 'fire', 'gpt', 'gemini', 'grok', 'claude', 'aqua', 'steel', 'noir', 'wire', 'astral', 'chrome', 'hairline', 'glass', 'enamel', 'pearl', 'carbon', 'chamfer', 'round', 'star4', 'star5'];
const SKIN_DECK = { flat: 'standard', prism: 'prism', sky: 'sky', fire: 'fire', gpt: 'gpt', gemini: 'gemini', grok: 'grok', claude: 'claude', aqua: 'aqua', steel: 'steel', noir: 'noir', wire: 'wire', astral: 'astral' };

const T = 10000;
// one tap near and one far, then a long note idle, held and missed: lanes 0..3 of 4K
const SHEET_NOTES = [
  { lane: 0, t: T + 120 }, { lane: 0, t: T + 620 },
  { lane: 1, t: T + 150, endT: T + 800 },
  { lane: 2, t: T - 300, endT: T + 650, state: 'held' },
  { lane: 3, t: T + 200, endT: T + 850, state: 'missed' },
];
const PLAY_NOTES = (lanes) => {
  const ns = [];
  for (let i = 0; i < 14; i++) ns.push({ lane: (i * 3) % lanes, t: T + 80 + i * 85 });
  ns.push({ lane: 1 % lanes, t: T - 200, endT: T + 500, state: 'held' });
  ns.push({ lane: 2 % lanes, t: T + 260, endT: T + 950 });
  ns.push({ lane: (lanes - 1), t: T + 350, endT: T + 1100 });
  return ns.filter((n, i, all) => !all.some((m, j) => j !== i && m.endT && m.lane === n.lane && n.t >= m.t - 60 && n.t <= m.endT + 60 && !n.endT));
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://127.0.0.1:5199/');
await page.waitForFunction(() => window.labReady === true);

async function shot(job, file, clip) {
  await page.evaluate((j) => window.labRender(j), job);
  await page.waitForTimeout(50);
  await page.screenshot({ path: `${out}/${file}.png`, clip });
}

if (what === 'sheet' || what === 'all') {
  for (const note of STYLES.filter((s) => !only || only.includes(s))) {
    for (const camera of ['SDVX']) {
      await shot({ note, deck: 'standard', hit: 'flash', mode: '4K', camera, width: 1280, height: 720, notes: SHEET_NOTES, timeMs: T, visibleMs: 1000 }, `sheet-${note}-${camera}`, { x: 420, y: 60, width: 440, height: 540 });
    }
  }
}
if (what === 'zoom') {
  await page.setViewportSize({ width: 1920, height: 1080 });
  for (const note of STYLES.filter((s) => !only || only.includes(s))) {
    const notes = [
      { lane: 0, t: T + 60 }, { lane: 0, t: T + 330 },
      { lane: 1, t: T + 40, endT: T + 330 },
      { lane: 2, t: T - 300, endT: T + 450, state: 'held' },
      { lane: 3, t: T + 60, endT: T + 600, state: 'missed' },
    ];
    await shot({ note, deck: 'standard', hit: 'flash', mode: '4K', camera: 'SDVX', width: 1920, height: 1080, notes, timeMs: T, visibleMs: 1000 }, `zoom-${note}`, { x: 600, y: 330, width: 720, height: 480 });
  }
}
if (what === 'taps') {
  await page.setViewportSize({ width: 1920, height: 1080 });
  for (const note of STYLES.filter((s) => !only || only.includes(s))) {
    const notes = [];
    for (let lane = 0; lane < 8; lane++) notes.push({ lane, t: T + 90 + (lane % 2) * 140 }, { lane, t: T + 520 + (lane % 3) * 60 });
    await shot({ note, deck: 'standard', hit: 'flash', mode: '7K+1S', camera: 'SDVX', width: 1920, height: 1080, notes, timeMs: T, visibleMs: 1000 }, `taps-${note}`, { x: 480, y: 330, width: 960, height: 470 });
  }
}
if (what === 'heads') {
  // the heads (near the judge line) and the tails (a short note's far end) of the long notes, close up: 4K SDVX
  await page.setViewportSize({ width: 1920, height: 1080 });
  for (const note of STYLES.filter((s) => !only || only.includes(s))) {
    const notes = [
      { lane: 0, t: T + 60, endT: T + 260 },
      { lane: 1, t: T + 40, endT: T + 700 },
      { lane: 2, t: T - 300, endT: T + 450, state: 'held' },
      { lane: 3, t: T + 60, endT: T + 600, state: 'missed' },
    ];
    await shot({ note, deck: 'standard', hit: 'flash', mode: '4K', camera: 'SDVX', width: 1920, height: 1080, notes, timeMs: T, visibleMs: 1000 }, `heads-${note}`, { x: 420, y: 330, width: 1080, height: 480 });
  }
}
if (what === 'play' || what === 'all') {
  const plays = [
    ['default', 'flat', '7K+1S', 'SDVX'], ['fire', 'fire', '7K+1S', 'SDVX'], ['gemini', 'gemini', '6K', 'LOW'], ['claude', 'claude', '4K', 'PLANE'],
    ['steel', 'steel', '6K+FX', 'SDVX'], ['aqua', 'aqua', '7K+1S', 'LOW'], ['crystal', 'prism', '4K', 'SDVX'], ['gpt', 'gpt', '7K+1S', 'SDVX'], ['grok', 'grok', '6K+FX', 'PLANE'],
  ];
  for (const [skin, note, mode, camera] of plays.filter((p) => !only || only.includes(p[0]))) {
    const lanes = { '4K': 4, '6K': 6, '6K+FX': 8, '7K+1S': 8 }[mode];
    await shot({ note, deck: SKIN_DECK[note], hit: note === 'flat' ? 'flash' : note, mode, camera, width: 1280, height: 720, notes: PLAY_NOTES(lanes), timeMs: T, visibleMs: 1300 }, `play-${skin}-${mode}-${camera}`);
  }
}
await browser.close();
