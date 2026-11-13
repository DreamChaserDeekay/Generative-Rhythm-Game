// node --test (in desktop/)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  GIVE_UP_MS,
  PAGE_LINES_PER_MINUTE,
  QUIET_MS,
  SETTLE_MS,
  appendLine,
  entry,
  featureFields,
  goneFields,
  graphicsWatch,
  pageRecord,
  pruneShots,
  queueFields,
  shotName,
  staleShots,
  stamp,
} = require('./graphicsLog');

const NIGHT = new Date(2026, 10, 13, 21, 4, 5, 78);
const GPU_GONE = { type: 'GPU', reason: 'crashed', exitCode: -1073741819, name: 'GPU Process' };

/** A world for the watcher: a clock moved by hand, the lines written, the server's answer and the window's picture as the test sets them. */
function world() {
  let t = NIGHT.getTime();
  const timers = [];
  const w = {
    lines: [],
    asked: 0,
    shots: [],
    answer: { ok: true, body: { making: 'c0ffee', waiting: 3 } },
    features: { gpu_compositing: 'enabled', webgl: 'enabled', webgl2: 'enabled', '2d_canvas': 'enabled', rasterization: 'enabled', video_decode: 'enabled' },
    shotFails: null,
    /** The clock goes on `ms`: the timers due are run, and what they started is let finish. */
    async advance(ms) {
      t += ms;
      for (const timer of timers.filter((x) => x.live && x.at <= t)) {
        timer.live = false;
        timer.fn();
      }
      await new Promise(setImmediate);
    },
    /** The lines without their time: "event  fields". */
    events: () => w.lines.map((line) => line.slice(stamp(NIGHT).length + 2)),
  };
  w.watch = graphicsWatch({
    write: (line) => w.lines.push(line),
    now: () => new Date(t),
    later(fn, ms) {
      const timer = { at: t + ms, fn, live: true };
      timers.push(timer);
      return () => {
        timer.live = false;
      };
    },
    queue: async () => {
      w.asked += 1;
      return w.answer;
    },
    features: () => w.features,
    shot: async (name) => {
      if (w.shotFails) throw new Error(w.shotFails);
      w.shots.push(name);
      return name;
    },
  });
  return w;
}

test('a line: the PC’s own time with its distance from UTC, what happened, and what is known of it', () => {
  const offset = -NIGHT.getTimezoneOffset();
  const zone = `${offset < 0 ? '-' : '+'}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')}`;
  assert.equal(stamp(NIGHT), `2026-11-13 21:04:05.078 ${zone}`);
  assert.equal(entry(NIGHT, 'start'), `${stamp(NIGHT)}  start`);
  // one word bare, more quoted on one line, the unknown left out, a zero kept
  assert.equal(
    entry(NIGHT, 'server', { making: 'none', waiting: 0, why: undefined, name: 'GPU Process', note: 'a\nb', list: ['10de:2504*', '8086:4680'], empty: '', none: [] }),
    `${stamp(NIGHT)}  server  making=none waiting=0 name="GPU Process" note="a\\nb" list=10de:2504*,8086:4680`,
  );
  assert.equal(entry(NIGHT, 'x', { long: 'a'.repeat(300) }).length, `${stamp(NIGHT)}  x  long=`.length + 200 + 3);
});

test('a process that went: its type, reason and exit code, a Windows code in hex as well', () => {
  assert.deepEqual(goneFields(GPU_GONE), { type: 'GPU', reason: 'crashed', exitCode: -1073741819, exitHex: '0xC0000005', name: 'GPU Process', serviceName: undefined });
  assert.deepEqual(goneFields({ reason: 'killed', exitCode: 9 }), { type: undefined, reason: 'killed', exitCode: 9, exitHex: undefined, name: undefined, serviceName: undefined });
  assert.deepEqual(goneFields({ type: 'Utility', reason: 'oom', exitCode: 3221225477, serviceName: 'network.mojom.NetworkService' }).exitHex, '0xC0000005');
  // nothing to go by: a line with no fields, not an error
  assert.deepEqual(Object.values(goneFields(null)).filter((v) => v !== undefined), []);
  assert.deepEqual(Object.values(goneFields({ type: 7, reason: {}, exitCode: '1' })).filter((v) => v !== undefined), []);
});

test('the page is taken at its word only for a WebGL canvas losing or getting back its context', () => {
  assert.deepEqual(pageRecord({ type: 'webglcontextlost', canvas: 'play-canvas', stage: 'play' }), { type: 'webglcontextlost', canvas: 'play-canvas', stage: 'play' });
  assert.deepEqual(pageRecord({ type: 'webglcontextrestored', canvas: 'a b\n<script>', stage: 5, more: 'x'.repeat(999) }), { type: 'webglcontextrestored', canvas: 'a bscript', stage: '' });
  assert.equal(pageRecord({ type: 'webglcontextlost', canvas: 'x'.repeat(500) }).canvas.length, 40);
  for (const not of [null, 'webglcontextlost', {}, { type: 'click' }, { type: 'contextlost' }]) assert.equal(pageRecord(not), null);
});

test('what the server was making: a chart’s id, none, or unknown with the reason', () => {
  assert.deepEqual(queueFields({ ok: true, body: { making: 'c0ffee', waiting: 3 } }), { making: 'c0ffee', waiting: 3 });
  assert.deepEqual(queueFields({ ok: true, body: { making: null, waiting: 0 } }), { making: 'none', waiting: 0 });
  assert.deepEqual(queueFields({ ok: false, error: 'HTTP 404' }), { making: 'unknown', why: 'HTTP 404' });
  // a server of an older build answers its page, or something else
  assert.deepEqual(queueFields({ ok: true, body: { detail: 'Not Found' } }), { making: 'unknown', why: 'no answer' });
  assert.deepEqual(queueFields(undefined), { making: 'unknown', why: 'no answer' });
});

test('of the GPU features, the ones that say whether the graphics card still draws the game', () => {
  assert.deepEqual(featureFields({ gpu_compositing: 'disabled_software', webgl: 'unavailable_software', video_decode: 'enabled' }), {
    gpu_compositing: 'disabled_software',
    webgl: 'unavailable_software',
    webgl2: undefined,
    '2d_canvas': undefined,
    rasterization: undefined,
  });
  assert.deepEqual(Object.values(featureFields(null)).filter(Boolean), []);
});

test('the GPU process gone in play: the server asked once, the window pictured a second after the page’s graphics are back', async () => {
  const w = world();
  w.watch.childGone(GPU_GONE);
  w.watch.page({ type: 'webglcontextlost', canvas: 'play-canvas', stage: 'play' });
  await w.advance(0);
  assert.equal(w.asked, 1);
  await w.advance(840);
  w.watch.page({ type: 'webglcontextrestored', canvas: 'play-canvas', stage: 'play' });
  await w.advance(SETTLE_MS - 1);
  assert.deepEqual(w.shots, []);
  await w.advance(1);
  assert.deepEqual(w.shots, ['graphics-lost-20261113-210406.jpg']);
  assert.deepEqual(w.events(), [
    'child-process-gone  type=GPU reason=crashed exitCode=-1073741819 exitHex=0xC0000005 name="GPU Process"',
    'webglcontextlost  canvas=play-canvas stage=play',
    'server  making=c0ffee waiting=3',
    'webglcontextrestored  canvas=play-canvas stage=play afterMs=840',
    'gpu-features  gpu_compositing=enabled webgl=enabled webgl2=enabled 2d_canvas=enabled rasterization=enabled',
    'picture  file=graphics-lost-20261113-210406.jpg webgl=back',
  ]);
  // the old timer (should the graphics not come back) was called off: no second picture
  await w.advance(GIVE_UP_MS);
  assert.equal(w.shots.length, 1);
});

test('graphics that do not come back: the window is pictured all the same, and the line says so', async () => {
  const w = world();
  w.watch.page({ type: 'webglcontextlost', canvas: 'play-canvas', stage: 'play' });
  await w.advance(GIVE_UP_MS - 1);
  assert.deepEqual(w.shots, []);
  await w.advance(1);
  assert.equal(w.shots.length, 1);
  assert.match(w.events().at(-1), /^picture {2}file=graphics-lost-\d{8}-\d{6}\.jpg webgl=lost$/);
  // the GPU process gone with no WebGL canvas on the page (the song select): no word from the page
  const menu = world();
  menu.watch.childGone(GPU_GONE);
  await menu.advance(GIVE_UP_MS);
  assert.match(menu.events().at(-1), /webgl=none$/);
});

test('losses that keep coming: every one is written down, the server and the window are asked once in a while', async () => {
  const w = world();
  w.watch.childGone(GPU_GONE);
  await w.advance(GIVE_UP_MS);
  assert.deepEqual([w.asked, w.shots.length], [1, 1]);
  // within the quiet time after a picture: lines only
  w.watch.childGone(GPU_GONE);
  w.watch.page({ type: 'webglcontextlost', canvas: 'play-canvas', stage: 'play' });
  await w.advance(QUIET_MS - 1);
  assert.deepEqual([w.asked, w.shots.length], [1, 1]);
  assert.equal(w.events().filter((e) => e.startsWith('child-process-gone')).length, 2);
  // after it: followed up again
  await w.advance(1);
  w.watch.childGone(GPU_GONE);
  await w.advance(GIVE_UP_MS);
  assert.deepEqual([w.asked, w.shots.length], [2, 2]);
});

test('graphics lost again and again before the picture: it is taken at twice the wait at the latest', async () => {
  const w = world();
  w.watch.page({ type: 'webglcontextlost', canvas: 'play-canvas', stage: 'play' });
  for (let i = 0; i < 30; i++) {
    await w.advance(500);
    w.watch.page({ type: i % 2 ? 'webglcontextlost' : 'webglcontextrestored', canvas: 'play-canvas', stage: 'play' });
    if (w.shots.length) break;
  }
  await w.advance(GIVE_UP_MS * 2);
  assert.equal(w.shots.length, 1);
  assert.equal(w.asked, 1);
});

test('a server that does not answer and a window that cannot be pictured are lines, not errors', async () => {
  const w = world();
  w.answer = { ok: false, error: 'ECONNREFUSED' };
  w.shotFails = 'empty';
  w.watch.childGone(GPU_GONE);
  await w.advance(0);
  await w.advance(GIVE_UP_MS);
  assert.deepEqual(w.events().slice(1), [
    'server  making=unknown why=ECONNREFUSED',
    'gpu-features  gpu_compositing=enabled webgl=enabled webgl2=enabled 2d_canvas=enabled rasterization=enabled',
    'picture  failed=empty webgl=none',
  ]);
  // and the next loss is followed up as any other
  await w.advance(QUIET_MS);
  w.shotFails = null;
  w.watch.childGone(GPU_GONE);
  await w.advance(GIVE_UP_MS);
  assert.equal(w.shots.length, 1);
});

test('other processes and the page’s own process: a line each, nothing followed up', async () => {
  const w = world();
  w.watch.childGone({ type: 'Utility', reason: 'crashed', exitCode: 1, serviceName: 'audio.mojom.AudioService', name: 'Audio Service' });
  w.watch.renderGone({ reason: 'oom', exitCode: -536870904 });
  w.watch.started({ app: '0.1.0', os: 'win32 10.0.26100' });
  await w.advance(GIVE_UP_MS * 2);
  assert.deepEqual(w.events(), [
    'child-process-gone  type=Utility reason=crashed exitCode=1 name="Audio Service" serviceName=audio.mojom.AudioService',
    'render-process-gone  reason=oom exitCode=-536870904 exitHex=0xE0000008',
    'start  app=0.1.0 os="win32 10.0.26100"',
  ]);
  assert.deepEqual([w.asked, w.shots.length], [0, 0]);
});

test('the GPU features are written down when they change, not every time Chromium says something of the GPU', () => {
  const w = world();
  w.watch.started({ app: '0.1.0', ...w.features });
  w.watch.featuresMayHaveChanged();
  w.watch.featuresMayHaveChanged();
  assert.equal(w.lines.length, 1);
  // the fall back to software after too many losses
  w.features = { ...w.features, gpu_compositing: 'disabled_software', webgl: 'unavailable_software' };
  w.watch.featuresMayHaveChanged();
  w.watch.featuresMayHaveChanged();
  // (a feature that says nothing of how the game is drawn is no change)
  w.features = { ...w.features, video_decode: 'disabled_software' };
  w.watch.featuresMayHaveChanged();
  assert.deepEqual(w.events().slice(1), ['gpu-features  gpu_compositing=disabled_software webgl=unavailable_software webgl2=enabled 2d_canvas=enabled rasterization=enabled']);
  // before the run's first line (which names them) Chromium's word of the GPU is not written
  const early = world();
  early.features = { ...early.features, webgl: 'disabled_off' };
  early.watch.featuresMayHaveChanged();
  assert.equal(early.lines.length, 0);
  early.features = { ...early.features, webgl: 'enabled' };
  early.watch.started({ app: '0.1.0', ...early.features });
  early.watch.featuresMayHaveChanged();
  assert.equal(early.lines.length, 1);
});

test('a page that writes without end fills no disk: its lines stop for the minute, and it is said once', async () => {
  const w = world();
  for (let i = 0; i < PAGE_LINES_PER_MINUTE * 3; i++) w.watch.page({ type: 'webglcontextrestored', canvas: 'x', stage: '' });
  assert.equal(w.lines.length, PAGE_LINES_PER_MINUTE + 1);
  assert.equal(w.events().at(-1), 'page  dropped="too many lines this minute"');
  w.watch.page({ type: 'click' });
  assert.equal(w.lines.length, PAGE_LINES_PER_MINUTE + 1);
  await w.advance(60_000);
  w.watch.page({ type: 'webglcontextrestored', canvas: 'x', stage: '' });
  assert.equal(w.lines.length, PAGE_LINES_PER_MINUTE + 2);
});

test('the log starts over past its size with the old one kept, and the five newest pictures stay', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grg-graphics-log-'));
  try {
    const file = path.join(dir, 'sub', 'graphics.log');
    appendLine(file, 'one', 10);
    appendLine(file, 'two two two', 10);
    assert.equal(fs.readFileSync(file, 'utf8'), 'one\ntwo two two\n');
    appendLine(file, 'three', 10);
    assert.equal(fs.readFileSync(file, 'utf8'), 'three\n');
    assert.equal(fs.readFileSync(`${file}.1`, 'utf8'), 'one\ntwo two two\n');

    assert.equal(shotName(NIGHT), 'graphics-lost-20261113-210405.jpg');
    const shots = [1, 2, 3, 4, 5, 6, 7].map((day) => shotName(new Date(2026, 10, day, 9, 0, 0)));
    assert.deepEqual(staleShots([...shots].reverse()), shots.slice(0, 2));
    assert.deepEqual(staleShots(['server.log', 'graphics-lost-x.jpg', 'graphics-lost-20261113-210405.jpg.tmp', shots[0]]), []);
    for (const name of [...shots, 'server.log', 'graphics-lost-note.txt']) fs.writeFileSync(path.join(dir, name), 'x');
    pruneShots(dir);
    assert.deepEqual(fs.readdirSync(dir).sort(), [...shots.slice(2), 'graphics-lost-note.txt', 'server.log', 'sub'].sort());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
