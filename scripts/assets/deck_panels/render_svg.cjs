// node render_svg.cjs <out dir> <height px> <colour or "-"> <svg>...  : each SVG as a PNG of that height on a clear ground
// (the files are downloads: shown only as <img>, where nothing in them runs); a colour makes a mark drawn in the page's ink (currentColor) that colour
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const [,, out, h, ink, ...files] = process.argv;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 2400, height: 1200 }, deviceScaleFactor: 1 });
  for (const f of files) {
    let svg = fs.readFileSync(f, 'utf8');
    if (ink !== '-') {
      svg = svg.replace(/currentColor/g, ink);
      // a mark with no fill of its own on its root is drawn in the ink (one fill attribute only: two would not parse)
      const root = (svg.match(/<svg\b[^>]*>/) || [''])[0];
      if (!/\sfill=/.test(root)) svg = svg.replace(/<svg\b/, `<svg fill="${ink}"`);
    }
    const src = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
    await page.setContent(`<html><body style="margin:0;background:transparent"><img id="i" src="${src}" style="height:${h}px;display:block"></body></html>`);
    await page.waitForFunction(() => { const i = document.getElementById('i'); return i.complete; });
    const el = await page.$('#i');
    const box = await el.boundingBox();
    const name = path.basename(f).replace(/\.svg$/, '') + (ink !== '-' ? '-' + ink.replace('#', '') : '') + '.png';
    if (!box || box.width < 2) { console.log('NOT DRAWN', f); continue; }
    await el.screenshot({ path: path.join(out, name), omitBackground: true });
    console.log(name, Math.round(box.width) + 'x' + Math.round(box.height));
  }
  await browser.close();
})();
