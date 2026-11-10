// Makes the page the Artifact tool publishes from a build (dist/page.html: the page without the
// document skeleton the tool adds itself) and lists the files that go with it.
//   cd design-mockups && npx vite build && node tools/package.mjs
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
const js = [...html.matchAll(/<script type="module"[^>]*src="([^"]+)"/g)].map((m) => m[1]);
const page = [
  '<title>Generative Rhythm 한 줄 시안</title>',
  ...css.map((href) => `<link rel="stylesheet" href="${href}">`),
  '<div id="app"></div>',
  ...js.map((src) => `<script type="module" src="${src}"></script>`),
  '',
].join('\n');
writeFileSync(join(dist, 'page.html'), page);

const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));
const files = walk(dist)
  .map((f) => relative(dist, f).replaceAll('\\', '/'))
  .filter((f) => f !== 'index.html' && f !== 'page.html' && f !== 'files.json');
const size = (list) => list.reduce((sum, f) => sum + statSync(join(dist, f)).size, 0);
const audio = files.filter((f) => f.startsWith('audio/'));
const rest = files.filter((f) => !f.startsWith('audio/'));
writeFileSync(join(dist, 'files.json'), JSON.stringify({ first: rest, second: audio }));
console.log(`${files.length} files, ${(size(files) / 1e6).toFixed(1)} MB (without audio ${rest.length} files ${(size(rest) / 1e6).toFixed(1)} MB, audio ${audio.length} files ${(size(audio) / 1e6).toFixed(1)} MB)`);
