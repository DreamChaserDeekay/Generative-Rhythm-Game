// node --test (in desktop/)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  AFTERMATH_MS,
  GIVE_UP_MS,
  HUNG_CHECK_MS,
  HUNG_MS,
  PAGE_ERROR_LINES,
  PAGE_LINES_PER_MINUTE,
  QUIET_MS,
  SETTLE_MS,
  STALL_FULL_EVERY_MS,
  TRAIL_LENGTH,
  appendLine,
  chromiumLines,
  configFields,
  crashEventQuery,
  displayList,
  driverEventQuery,
  entry,
  featureFields,
  goneFields,
  graphicsWatch,
  logEvents,
  memoryFields,
  pageRecord,
  probeFields,
  pruneShots,
  queueFields,
  registryFields,
  shotName,
  staleShots,
  stamp,
  statusList,
} = require('./graphicsLog');

const NIGHT = new Date(2026, 10, 13, 21, 4, 5, 78);
const GPU_GONE = { type: 'GPU', reason: 'crashed', exitCode: -1073741819, name: 'GPU Process' };

/**
 * A world for the watcher: a clock moved by hand, the lines written, the server's answer and the window's
 * picture as the test sets them; `more`: what else of the world it is given (the parts it does without).
 */
function world(more = {}) {
  let t = NIGHT.getTime();
  const timers = [];
  const w = {
    lines: [],
    asked: 0,
    shots: [],
    answer: { ok: true, body: { making: 'c0ffee', waiting: 3, loaded: true } },
    smi: { ok: true, text: '7421, 8192, 97\r\n' },
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
    memory: async () => w.smi,
    features: () => w.features,
    shot: async (name) => {
      if (w.shotFails) throw new Error(w.shotFails);
      w.shots.push(name);
      return name;
    },
    ...more,
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
  assert.deepEqual(pageRecord({ type: 'webglcontextlost', canvas: 'play-canvas', about: { stage: 'play', songMs: '83210', bga: 'youtube' } }), {
    type: 'webglcontextlost',
    canvas: 'play-canvas',
    about: { stage: 'play', songMs: '83210', bga: 'youtube' },
    trail: {},
  });
  // what it says of the canvas is written down as it comes, a line's worth of it: text values under plain names
  const told = pageRecord({
    type: 'webglcontextrestored',
    canvas: 'a b\n<script>',
    more: 'x'.repeat(999),
    about: { stage: 'end', gfx: 'tex=112 geo=45\nprog=18', 'bad key': 'x', __proto__x: 'y', count: 5, empty: '', long: 'y'.repeat(999), title: '하늘 기어' },
  });
  assert.deepEqual(told, { type: 'webglcontextrestored', canvas: 'a bscript', about: { stage: 'end', gfx: 'tex=112 geo=45 prog=18', long: 'y'.repeat(120), title: '하늘 기어' }, trail: {} });
  const many = pageRecord({ type: 'webglcontextlost', canvas: 'c', about: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, 'v'])) });
  assert.equal(Object.keys(many.about).length, 24);
  assert.equal(pageRecord({ type: 'webglcontextlost', canvas: 'x'.repeat(500) }).canvas.length, 40);
  assert.deepEqual(pageRecord({ type: 'webglcontextlost', canvas: 'c', about: 'play' }).about, {});
  for (const not of [null, 'webglcontextlost', {}, { type: 'click' }, { type: 'contextlost' }]) assert.equal(pageRecord(not), null);
});

test('what the page did before a loss is kept apart from the rest: two long values, not counted among the short ones', () => {
  const about = { ...Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`k${i}`, 'v'])), trailFrames: `n=420 ${'7 '.repeat(2000)}`, trailEvents: '-2100 fever:on\n-35 tex:41>42' };
  const record = pageRecord({ type: 'webglcontextlost', canvas: 'play-canvas', about });
  assert.equal(Object.keys(record.about).length, 24);
  assert.equal(record.trail.trailFrames.length, TRAIL_LENGTH);
  assert.equal(record.trail.trailEvents, '-2100 fever:on -35 tex:41>42');
  assert.deepEqual(pageRecord({ type: 'webglcontextlost', canvas: 'c', about: { trailFrames: 7, trailEvents: '' } }).trail, {});
});

test('what the server was making: a chart’s id, none, or unknown with the reason; and whether the model was loaded', () => {
  assert.deepEqual(queueFields({ ok: true, body: { making: 'c0ffee', waiting: 3, loaded: true } }), { making: 'c0ffee', waiting: 3, loaded: 'yes' });
  assert.deepEqual(queueFields({ ok: true, body: { making: null, waiting: 0, loaded: false } }), { making: 'none', waiting: 0, loaded: 'no' });
  // (a server that does not say: left out)
  assert.deepEqual(queueFields({ ok: true, body: { making: null, waiting: 0 } }), { making: 'none', waiting: 0, loaded: undefined });
  assert.deepEqual(queueFields({ ok: false, error: 'HTTP 404' }), { making: 'unknown', why: 'HTTP 404' });
  // a server of an older build answers its page, or something else
  assert.deepEqual(queueFields({ ok: true, body: { detail: 'Not Found' } }), { making: 'unknown', why: 'no answer' });
  assert.deepEqual(queueFields(undefined), { making: 'unknown', why: 'no answer' });
});

test('how full the graphics card’s memory is, a card a line of nvidia-smi’s; unknown where there is none', () => {
  assert.deepEqual(memoryFields({ ok: true, text: '7421, 8192, 97\n' }), { vram: ['7421/8192MB 97%'] });
  assert.deepEqual(memoryFields({ ok: true, text: '512, 12288, 3\r\n9000, 24564, [N/A]\r\n' }), { vram: ['512/12288MB 3%', '9000/24564MB'] });
  assert.deepEqual(memoryFields({ ok: false, error: 'ENOENT' }), { vram: 'unknown', why: 'ENOENT' });
  assert.deepEqual(memoryFields({ ok: true, text: 'NVIDIA-SMI has failed because it could not communicate with the driver.' }), { vram: 'unknown', why: 'not read' });
  assert.deepEqual(memoryFields(undefined), { vram: 'unknown', why: 'no answer' });
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
  w.watch.page({ type: 'webglcontextlost', canvas: 'play-canvas', about: { stage: 'play', songMs: '83210' } });
  await w.advance(0);
  assert.equal(w.asked, 1);
  await w.advance(840);
  w.watch.page({ type: 'webglcontextrestored', canvas: 'play-canvas', about: { stage: 'play', songMs: '84050' } });
  await w.advance(SETTLE_MS - 1);
  assert.deepEqual(w.shots, []);
  await w.advance(1);
  assert.deepEqual(w.shots, ['graphics-lost-20261113-210406.jpg']);
  assert.deepEqual(w.events(), [
    'child-process-gone  type=GPU reason=crashed exitCode=-1073741819 exitHex=0xC0000005 name="GPU Process"',
    'webglcontextlost  canvas=play-canvas stage=play songMs=83210',
    'server  making=c0ffee waiting=3 loaded=yes',
    'gpu-memory  vram="7421/8192MB 97%"',
    'webglcontextrestored  canvas=play-canvas afterMs=840 stage=play songMs=84050',
    'gpu-features  gpu_compositing=enabled webgl=enabled webgl2=enabled 2d_canvas=enabled rasterization=enabled',
    'picture  file=graphics-lost-20261113-210406.jpg webgl=back',
  ]);
  // the old timer (should the graphics not come back) was called off: no second picture
  await w.advance(GIVE_UP_MS);
  assert.equal(w.shots.length, 1);
});

test('graphics that do not come back: the window is pictured all the same, and the line says so', async () => {
  const w = world();
  w.watch.page({ type: 'webglcontextlost', canvas: 'play-canvas', about: { stage: 'play', songMs: '83210' } });
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
  w.watch.page({ type: 'webglcontextlost', canvas: 'play-canvas', about: { stage: 'play', songMs: '83210' } });
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
  w.watch.page({ type: 'webglcontextlost', canvas: 'play-canvas', about: { stage: 'play', songMs: '83210' } });
  for (let i = 0; i < 30; i++) {
    await w.advance(500);
    w.watch.page({ type: i % 2 ? 'webglcontextlost' : 'webglcontextrestored', canvas: 'play-canvas', about: { stage: 'play' } });
    if (w.shots.length) break;
  }
  await w.advance(GIVE_UP_MS * 2);
  assert.equal(w.shots.length, 1);
  assert.equal(w.asked, 1);
});

test('a server that does not answer and a window that cannot be pictured are lines, not errors', async () => {
  const w = world();
  w.answer = { ok: false, error: 'ECONNREFUSED' };
  w.smi = { ok: false, error: 'ENOENT' };
  w.shotFails = 'empty';
  w.watch.childGone(GPU_GONE);
  await w.advance(0);
  await w.advance(GIVE_UP_MS);
  assert.deepEqual(w.events().slice(1), [
    'server  making=unknown why=ECONNREFUSED',
    'gpu-memory  vram=unknown why=ENOENT',
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
  // (a GPU process Chromium started to ask the card something, ended as it should: no loss)
  w.watch.childGone({ type: 'GPU', reason: 'clean-exit', exitCode: 0, name: 'GPU Process' });
  await w.advance(GIVE_UP_MS * 2);
  assert.deepEqual([w.asked, w.shots.length, w.lines.length], [0, 0, 1]);
  w.lines.length = 0;
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
  for (let i = 0; i < PAGE_LINES_PER_MINUTE * 3; i++) w.watch.page({ type: 'webglcontextrestored', canvas: 'x', about: {} });
  assert.equal(w.lines.length, PAGE_LINES_PER_MINUTE + 1);
  assert.equal(w.events().at(-1), 'page  dropped="too many lines this minute"');
  w.watch.page({ type: 'click' });
  assert.equal(w.lines.length, PAGE_LINES_PER_MINUTE + 1);
  await w.advance(60_000);
  w.watch.page({ type: 'webglcontextrestored', canvas: 'x', about: {} });
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

// what a Windows PC with an NVIDIA card answers, cut down to what is read
const GPU_INFO = {
  auxAttributes: {
    glRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 (0x00001F08) Direct3D11 vs_5_0 ps_5_0, D3D11-32.0.16.1714)',
    glVersion: 'OpenGL ES 3.0.0 (ANGLE 2.1.26000)',
    glExtensions: 'GL_ANGLE_base_vertex_base_instance '.repeat(40),
    displayType: 'ANGLE_D3D11',
    skiaBackendType: 'GraphiteDawnD3D11',
    directComposition: true,
    supportsOverlays: true,
    nv12OverlaySupport: 'SCALING',
    yuy2OverlaySupport: 'NONE',
    bgra8OverlaySupport: 'DIRECT',
    passthroughCmdDecoder: true,
    sandboxed: true,
    d3d12FeatureLevel: 49664,
    dxDiagnostics: { children: {} },
  },
  gpuDevice: [{ vendorId: 4318, deviceId: 7944, active: true }],
};

test('how Chromium draws: the renderer, the way to the screen, and every other plain value as it comes', () => {
  assert.deepEqual(configFields(GPU_INFO), {
    gl: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 (0x00001F08) Direct3D11 vs_5_0 ps_5_0, D3D11-32.0.16.1714)',
    glVersion: 'OpenGL ES 3.0.0 (ANGLE 2.1.26000)',
    display: 'ANGLE_D3D11',
    skia: 'GraphiteDawnD3D11',
    dcomp: 'yes',
    overlays: 'yes',
    planes: ['nv12:SCALING', 'yuy2:NONE', 'bgra8:DIRECT'],
    aux: ['passthroughCmdDecoder:yes', 'sandboxed:yes', 'd3d12FeatureLevel:49664'],
  });
  // the overlay planes in a part of their own, inside the rest or beside it (the names moved between Chromium versions)
  const nested = { auxAttributes: { glRenderer: 'ANGLE (OpenGL)', overlayInfo: { directComposition: false, supportsOverlays: false, nv12OverlaySupport: 'NONE' } } };
  assert.deepEqual([configFields(nested).dcomp, configFields(nested).overlays, configFields(nested).planes], ['no', 'no', ['nv12:NONE']]);
  assert.equal(configFields({ auxAttributes: {}, overlayInfo: { directComposition: true } }).dcomp, 'yes');
  // nothing to go by: a line with no fields
  for (const none of [null, undefined, {}, { failed: 'timeout' }]) assert.deepEqual(Object.values(configFields(none)).filter((v) => v !== undefined && v.length !== 0), []);
});

test('the GPU features as they come, the screens by size, refresh rate and depth', () => {
  assert.deepEqual(statusList({ gpu_compositing: 'enabled', skia_graphite: 'enabled_on', webgl: 'enabled', odd: 3 }), ['gpu_compositing:enabled', 'skia_graphite:enabled_on', 'webgl:enabled']);
  assert.deepEqual(statusList(null), []);
  const screens = [
    { size: { width: 2560, height: 1440 }, displayFrequency: 143.99, depthPerComponent: 10, scaleFactor: 1, colorSpace: '{primaries:BT2020, transfer:PQ, matrix:RGB, range:FULL}' },
    { size: { width: 1920, height: 1080 }, displayFrequency: 60, depthPerComponent: 8, scaleFactor: 1.25, colorSpace: '{primaries:BT709, transfer:SRGB, matrix:RGB, range:FULL}' },
    { size: { width: 1280, height: 1024 }, displayFrequency: 0 },
  ];
  assert.deepEqual(displayList(screens), ['2560x1440@144Hz 10bit primaries:BT2020,transfer:PQ,matrix:RGB,range:FULL', '1920x1080@60Hz 8bit x1.25', '1280x1024']);
  assert.deepEqual(displayList(undefined), []);
});

test('Windows’ settings from reg’s answers: the values set, a key that is not there as nothing set', () => {
  const drivers = { ok: true, text: '\r\nHKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers\r\n    DxgKrnlVersion    REG_DWORD    0x5023\r\n    HwSchMode    REG_DWORD    0x2\r\n    TdrDelay    REG_DWORD    0xa\r\n\r\nHKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers\\Configuration\r\n' };
  const game = { ok: true, text: '    GameDVR_Enabled    REG_DWORD    0x0\r\n    GameDVR_FSEBehaviorMode    REG_DWORD    0x2\r\n' };
  assert.deepEqual(registryFields({ drivers, dwm: { ok: true, text: '    OverlayTestMode    REG_DWORD    0x5\r\n' }, game }), {
    HwSchMode: '2',
    TdrDelay: '10',
    TdrDdiDelay: undefined,
    TdrLevel: undefined,
    OverlayTestMode: '5',
    GameDVR: '0',
    FSEBehavior: '2',
    why: undefined,
  });
  // the key not there (reg ends with 1): nothing set under it, and nothing wrong
  const unset = registryFields({ drivers, dwm: { ok: false, error: '1' }, game });
  assert.deepEqual([unset.OverlayTestMode, unset.why], [undefined, undefined]);
  // reg not there, or not answering
  assert.equal(registryFields({ drivers: { ok: false, error: 'ENOENT' }, dwm: { ok: false, error: 'ENOENT' }, game }).why, 'ENOENT');
  assert.equal(registryFields(null).why, 'no answer');
});

test('Windows’ event log: asked for the graphics drivers’ and the crashed programs’ events of late, read from its XML', () => {
  assert.match(driverEventQuery(120_000), /^\*\[System\[Provider\[@Name='Display' or @Name='nvlddmkm' or .*\] and TimeCreated\[timediff\(@SystemTime\) <= 120000\]\]\]$/);
  assert.match(crashEventQuery(60_000.4), /@Name='Application Error'.*<= 60000\]\]\]$/);
  const xml =
    "<Event xmlns='http://schemas.microsoft.com/win/2004/08/events/event'><System><Provider Name='Display'/><EventID Qualifiers='0'>4101</EventID><Level>3</Level>" +
    "<TimeCreated SystemTime='2026-11-16T10:03:58.1234567Z'/><Channel>System</Channel></System><EventData><Data>nvlddmkm</Data><Data></Data></EventData></Event>\r\n" +
    "<Event xmlns='http://schemas.microsoft.com/win/2004/08/events/event'><System><Provider Name='Application Error' Guid='{a0e9b465}'/><EventID>1000</EventID>" +
    "<TimeCreated SystemTime='2026-11-16T10:03:59.5000000Z'/></System><EventData><Data Name='AppName'>Generative Rhythm.exe</Data><Data Name='AppVersion'>44.5.1.0</Data>" +
    "<Data Name='ModuleName'>nvwgf2umx.dll</Data><Data Name='ExceptionCode'>80000003</Data><Data Name='FaultingOffset'>00000000001a2b3c</Data><Data>a &amp; b</Data></EventData></Event>";
  assert.deepEqual(logEvents(xml), [
    { source: 'Display', id: 4101, at: '2026-11-16T10:03:58.123Z', data: 'nvlddmkm' },
    { source: 'Application Error', id: 1000, at: '2026-11-16T10:03:59.500Z', data: 'Generative Rhythm.exe | 44.5.1.0 | nvwgf2umx.dll | 80000003 | 00000000001a2b3c | a b' },
  ]);
  assert.equal(logEvents(xml, 1).length, 1);
  assert.deepEqual(logEvents(''), []);
  assert.deepEqual(logEvents(undefined), []);
});

test('Chromium’s own log: the lines of the seconds asked for, whichever build wrote them', () => {
  const at = (h, m, sec, ms) => new Date(2026, 10, 16, h, m, sec, ms).getTime();
  const tail = [
    '[4321:1116/190350.100:WARNING:gpu\\command_buffer\\service\\x.cc:10] long before',
    'and its second line',
    '[4321:1116/190358.900:ERROR:third_party\\angle\\src\\libANGLE\\renderer\\d3d\\d3d11\\Renderer11.cpp:1234] Device lost reason code 0x887A0006',
    '[4321:7788:1116/190359.010123:ERROR:gpu/ipc/service/gpu_service_impl.cc(1021)] Exiting GPU process because some drivers can\'t recover from errors. GPU process will restart shortly.',
    '  a second line of it',
    '  a third',
    '[1200:1116/190359.250:ERROR:content\\browser\\gpu\\gpu_process_host.cc:1035] GPU process exited unexpectedly: exit_code=-2147483645',
    'not a line of the log',
    '[1200:1116/190410.000:WARNING:x.cc:1] long after',
    'and what follows it',
  ].join('\r\n');
  assert.deepEqual(chromiumLines(tail, at(19, 3, 55, 0), at(19, 4, 1, 0)), [
    { pid: 4321, level: 'ERROR', at: '19:03:58.900', src: 'Renderer11.cpp:1234', text: 'Device lost reason code 0x887A0006' },
    { pid: 4321, level: 'ERROR', at: '19:03:59.010', src: 'gpu_service_impl.cc(1021)', text: "Exiting GPU process because some drivers can't recover from errors. GPU process will restart shortly. / a second line of it" },
    { pid: 1200, level: 'ERROR', at: '19:03:59.250', src: 'gpu_process_host.cc:1035', text: 'GPU process exited unexpectedly: exit_code=-2147483645 / not a line of the log' },
  ]);
  // the newest of them when there are many
  assert.deepEqual(
    chromiumLines(tail, at(19, 3, 55, 0), at(19, 4, 1, 0), 1).map((line) => line.pid),
    [1200],
  );
  assert.deepEqual(chromiumLines('', 0, 1), []);
  assert.deepEqual(chromiumLines(undefined, 0, 1), []);
});

/** The rest of the world a desktop gives the watcher: the GPU's information, the screens, the window, Windows' logs, Chromium's log, the crash dump. */
function desktop(w) {
  return {
    info: async () => w.info,
    page: async () => w.page,
    displays: () => [{ size: { width: 2560, height: 1440 }, displayFrequency: 144, depthPerComponent: 8, scaleFactor: 1 }],
    window: () => ({ fullScreen: 'yes', focused: 'yes' }),
    gpuProcess: () => ({ pid: 4321, workingSetMB: 412 }),
    registry: async () => w.registry,
    events: async (log) => (log === 'System' ? w.system : w.application),
    chromium: async () => w.chromium,
    dump: async (since) => {
      w.dumpSince = since;
      return w.dump;
    },
  };
}

test('a run’s start: how Chromium draws, the screens, and Windows’ settings, each a line', async () => {
  const d = {};
  const w = world(desktop(d));
  d.info = GPU_INFO;
  d.page = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 (0x00001F08) Direct3D11 vs_5_0 ps_5_0, D3D11-32.0.16.1714)';
  d.registry = { drivers: { ok: true, text: '    HwSchMode    REG_DWORD    0x2\r\n' }, dwm: { ok: false, error: '1' }, game: { ok: false, error: '1' } };
  await w.watch.config();
  await w.watch.windows();
  w.watch.note('graphics-mode', { mode: 'no-dcomp', cameUp: 'yes' });
  const lines = w.events();
  assert.match(lines[0], /^gpu-config {2}when=start gl="ANGLE \(NVIDIA, NVIDIA GeForce RTX 2060 \(0x00001F08\) Direct3D11 vs_5_0 ps_5_0, D3D11-32\.0\.16\.1714\)" glVersion="OpenGL ES 3\.0\.0 \(ANGLE 2\.1\.26000\)" display=ANGLE_D3D11 skia=GraphiteDawnD3D11 dcomp=yes overlays=yes planes=nv12:SCALING,yuy2:NONE,bgra8:DIRECT aux=passthroughCmdDecoder:yes,sandboxed:yes,d3d12FeatureLevel:49664 webgl="ANGLE \(NVIDIA, NVIDIA GeForce RTX 2060 \(0x00001F08\) Direct3D11 vs_5_0 ps_5_0, D3D11-32\.0\.16\.1714\)" gpuPid=4321$/);
  assert.equal(lines[1], 'gpu-status  when=start status=gpu_compositing:enabled,webgl:enabled,webgl2:enabled,2d_canvas:enabled,rasterization:enabled,video_decode:enabled');
  assert.equal(lines[2], 'screens  when=start screens="2560x1440@144Hz 8bit" fullScreen=yes focused=yes');
  assert.equal(lines[3], 'windows  HwSchMode=2');
  assert.equal(lines[4], 'graphics-mode  mode=no-dcomp cameUp=yes');
  // the GPU's information not to be had: the line says so, the rest is written all the same
  const slow = {};
  const s = world({ ...desktop(slow), info: async () => Promise.reject(new Error('timeout')) });
  await s.watch.config();
  assert.deepEqual(s.events().slice(0, 2), ['gpu-config  when=start gpuPid=4321 why=timeout', 'gpu-status  when=start status=gpu_compositing:enabled,webgl:enabled,webgl2:enabled,2d_canvas:enabled,rasterization:enabled,video_decode:enabled']);
});

test('a loss on a desktop: what the window saw before it, then what Chromium, Windows and the crash dump say of it', async () => {
  const d = {
    info: GPU_INFO,
    system: { ok: true, text: "<Event><System><Provider Name='Display'/><EventID>4101</EventID><TimeCreated SystemTime='2026-11-13T12:04:04.9000000Z'/></System><EventData><Data>nvlddmkm</Data></EventData></Event>" },
    application: { ok: true, text: '' },
    chromium:
      '[4321:1113/210300.000:ERROR:x.cc:1] a minute before\n[4321:1113/210425.100:ERROR:Renderer11.cpp:1234] Device lost reason code 0x887A0006\n' +
      // (what the page says on its console is left out)
      '[1200:1113/210425.200:INFO:CONSOLE:1] "a word from the page", source: http://127.0.0.1:40000/ (1)',
    dump: {
      file: 'reports/abc.dmp',
      summary: { code: '0x80000003', thread: 77, at: 'Generative Rhythm.exe+0x3a4f21c', ip: undefined, frames: ['Generative Rhythm.exe+0x3a4f000', 'd3d11.dll+0x1234'], modules: [{ name: 'Generative Rhythm.exe', version: '44.5.1.0', id: 'ABCDEF1', pdb: 'electron.exe.pdb' }] },
    },
  };
  const w = world(desktop(d));
  w.watch.seen('blur');
  await w.advance(20_000);
  w.watch.seen('display-metrics-changed 2560x1440@144Hz', true);
  await w.advance(310);
  w.watch.childGone(GPU_GONE);
  w.watch.page({ type: 'webglcontextlost', canvas: 'play-canvas', about: { stage: 'play', songMs: '83210', trailFrames: 'n=432 med=6.9 max=41.7', trailEvents: '-2100 fever:on; -35 tex:41>42' } });
  await w.advance(0);
  const first = w.events();
  assert.equal(first[0], 'screen  what="display-metrics-changed 2560x1440@144Hz" screens="2560x1440@144Hz 8bit"');
  assert.equal(first[1], 'child-process-gone  type=GPU reason=crashed exitCode=-1073741819 exitHex=0xC0000005 name="GPU Process" pid=4321 workingSetMB=412');
  // (what happened longer ago than a few seconds is not told again)
  assert.equal(first[2], 'window  fullScreen=yes focused=yes before="-310ms display-metrics-changed 2560x1440@144Hz"');
  assert.deepEqual(first.slice(3, 6), [
    'webglcontextlost  canvas=play-canvas stage=play songMs=83210',
    'page-frames  frames="n=432 med=6.9 max=41.7"',
    'page-events  events="-2100 fever:on; -35 tex:41>42"',
  ]);
  await w.advance(AFTERMATH_MS);
  const after = w.events().slice(first.length);
  assert.deepEqual(after, [
    'chromium  pid=4321 level=ERROR at=21:04:25.100 src=Renderer11.cpp:1234 text="Device lost reason code 0x887A0006"',
    'driver-event  source=Display id=4101 at=2026-11-13T12:04:04.900Z data=nvlddmkm',
    'crash-events  found=none sinceMs=120000',
    'crash-dump  file=reports/abc.dmp code=0x80000003 at="Generative Rhythm.exe+0x3a4f21c" thread=77',
    'crash-stack  frames="Generative Rhythm.exe+0x3a4f000,d3d11.dll+0x1234"',
    'crash-module  name="Generative Rhythm.exe" version=44.5.1.0 id=ABCDEF1 pdb=electron.exe.pdb',
  ]);
  // (a dump written a moment before the process was seen to go is the one)
  assert.equal(d.dumpSince, NIGHT.getTime() + 20_310 - 2000);
  // how it is drawn afterwards, with the picture
  await w.advance(GIVE_UP_MS);
  const end = w.events().slice(first.length + after.length);
  assert.equal(end.length, 5);
  for (const line of [/^gpu-features {2}/, /^gpu-config {2}when=after-loss gl="ANGLE/, /^gpu-status {2}when=after-loss /, /^screens {2}when=after-loss /, /^picture {2}/]) {
    assert.ok(end.some((e) => line.test(e)), String(line));
  }
});

test('what cannot be read of a loss is a line that says so', async () => {
  const d = { system: { ok: false, error: 'ENOENT' }, application: undefined, chromium: '', dump: null };
  const w = world({ ...desktop(d), chromium: async () => Promise.reject(new Error('EBUSY: locked')) });
  w.watch.childGone(GPU_GONE);
  await w.advance(AFTERMATH_MS);
  // (each as it is answered: in no order of their own)
  assert.deepEqual(
    w.events().filter((line) => /^(chromium|driver|crash)/.test(line)).sort(),
    ['chromium  why="EBUSY: locked"', 'crash-dump  found=none', 'crash-events  why="no answer"', 'driver-events  why=ENOENT'],
  );
  // a dump that is there but could not be read
  const unread = { system: { ok: true, text: '' }, application: { ok: true, text: '' }, chromium: '', dump: { file: 'reports/x.dmp', summary: null } };
  const u = world(desktop(unread));
  u.watch.childGone(GPU_GONE);
  await u.advance(AFTERMATH_MS);
  assert.deepEqual(
    u.events().filter((line) => /^(chromium|driver|crash)/.test(line)).sort(),
    ['chromium  found=none', 'crash-dump  file=reports/x.dmp why="not read"', 'crash-events  found=none sinceMs=120000', 'driver-events  found=none sinceMs=120000'],
  );
});

const STALL = {
  type: 'page-stall',
  canvas: 'play-canvas',
  about: { gapMs: '3120', workMs: '4', timerMs: '104', ticks: '30', state: 'running', songMs: '83210', trailFrames: 'n=180 med=6.9 max=7.4 last=6.9,6.9', trailEvents: '-2100 fever:off>x2' },
};

/** The clock goes on `ms` in the steps the watcher looks at the pulse in (a timer due is run at its time, not later). */
async function wait(w, ms) {
  for (let left = ms; left > 0; left -= HUNG_CHECK_MS) await w.advance(Math.min(HUNG_CHECK_MS, left));
}

test('a play’s frames that stood still: what the page measured, then the frames before, the window, the server and the card’s memory', async () => {
  const w = world({ window: () => ({ fullScreen: 'yes', focused: 'yes', size: '1920x1080' }) });
  w.watch.seen('blur');
  await w.advance(700);
  w.watch.page(STALL);
  await w.advance(0);
  assert.deepEqual(w.events(), [
    'page-stall  canvas=play-canvas gapMs=3120 workMs=4 timerMs=104 ticks=30 state=running songMs=83210',
    'page-frames  frames="n=180 med=6.9 max=7.4 last=6.9,6.9"',
    'page-events  events="-2100 fever:off>x2"',
    'window  fullScreen=yes focused=yes size=1920x1080 before="-700ms blur"',
    'server  making=c0ffee waiting=3 loaded=yes',
    'gpu-memory  vram="7421/8192MB 97%"',
  ]);
  // more of them soon after: a line each, the rest not asked again
  w.watch.page({ ...STALL, about: { ...STALL.about, gapMs: '410' } });
  await w.advance(STALL_FULL_EVERY_MS - 1);
  w.watch.page({ ...STALL, about: { ...STALL.about, gapMs: '520' } });
  await w.advance(0);
  assert.deepEqual(w.events().slice(6), [
    'page-stall  canvas=play-canvas gapMs=410 workMs=4 timerMs=104 ticks=30 state=running songMs=83210',
    'page-stall  canvas=play-canvas gapMs=520 workMs=4 timerMs=104 ticks=30 state=running songMs=83210',
  ]);
  assert.equal(w.asked, 1);
  // and the whole of it again once that time is over
  await w.advance(1);
  w.watch.page(STALL);
  await w.advance(0);
  assert.equal(w.asked, 2);
  assert.equal(w.events().filter((line) => line.startsWith('page-frames')).length, 2);
});

test('the page’s errors: its message and where it was thrown from as they come, long as they are; a run writes so many', () => {
  const w = world();
  const stack = `drawNotes@assets/index-abc.js:1:${'9'.repeat(40)} < render@assets/index-abc.js:1:5120 < frame@assets/index-abc.js:1:9001`;
  w.watch.page({ type: 'page-error', about: { id: '1', count: '1', where: 'track:notes', message: "Cannot read properties of undefined (reading 'width')", at: 'assets/index-abc.js:1:4022', stack } });
  w.watch.page({ type: 'page-error', about: { id: '1', count: '100', where: 'track:notes' } });
  assert.deepEqual(w.events(), [
    `page-error  id=1 count=1 where=track:notes message="Cannot read properties of undefined (reading 'width')" at=assets/index-abc.js:1:4022 stack="${stack}"`,
    'page-error  id=1 count=100 where=track:notes',
  ]);
  // a message and a stack are cut at their own lengths, nothing else of the page's is as long
  const long = pageRecord({ type: 'page-error', about: { message: 'm'.repeat(999), stack: 's'.repeat(2000), where: 'w'.repeat(999) } });
  assert.deepEqual([long.about.message.length, long.about.stack.length, long.about.where.length], [300, 900, 120]);
  assert.equal(pageRecord({ type: 'page-stall', about: {} }).type, 'page-stall');
  // a page that throws something new without end
  const many = world();
  for (let i = 0; i < PAGE_ERROR_LINES + 40; i++) {
    many.watch.page({ type: 'page-error', about: { id: String(i), count: '1', message: `error ${i}` } });
    if (i % 20 === 19) many.advance(60_000);
  }
  assert.equal(many.lines.length, PAGE_ERROR_LINES + 1);
  assert.equal(many.events().at(-1), 'page-error  dropped="too many errors this run"');
});

test('a play’s pulse that stops while it runs: the page is hung, told with the window, the sound, the server, the card, the page’s answer and a picture; then its coming back', async () => {
  const w = world({
    window: () => ({ fullScreen: 'yes', focused: 'yes', size: '1920x1080' }),
    audible: () => true,
    probe: async () => ({ visibility: 'visible', focus: true, frames: 5120, raf: 'none' }),
  });
  w.watch.pulse({ state: 'running', songMs: 61234.4 });
  await wait(w, HUNG_MS - HUNG_CHECK_MS);
  w.watch.pulse({ state: 'running', songMs: 62734.4 });
  await wait(w, HUNG_MS - HUNG_CHECK_MS);
  assert.deepEqual(w.lines, []);
  await wait(w, HUNG_CHECK_MS);
  assert.equal(w.events()[0], 'page-hung  silentMs=2000 state=running songMs=62734 audible=yes fullScreen=yes focused=yes size=1920x1080');
  // (what is asked of the world answers in its own time: the lines' order among themselves is no matter)
  assert.deepEqual(w.events().slice(1).sort(), [
    'gpu-memory  vram="7421/8192MB 97%"',
    'page-probe  answered=yes tookMs=0 visibility=visible focus=yes frames=5120 raf=none',
    'picture  file=graphics-hung-20261113-210408.jpg hung=yes',
    'server  making=c0ffee waiting=3 loaded=yes',
  ]);
  assert.deepEqual(w.shots, ['graphics-hung-20261113-210408.jpg']);
  // its frames go on a second later
  await w.advance(1000);
  w.watch.pulse({ state: 'running', songMs: 65000 });
  assert.equal(w.events().at(-1), 'page-resumed  afterMs=3000 state=running');
  // hung again soon after: not followed up again, but its end says how long it was
  await wait(w, HUNG_MS + HUNG_CHECK_MS);
  assert.equal(w.lines.length, 6);
  w.watch.pulse({ state: 'running', songMs: 68000 });
  assert.equal(w.events().at(-1), 'page-resumed  afterMs=2500 state=running told=no');
  assert.equal(w.asked, 1);
  // and followed up again once the quiet time is over
  await w.advance(QUIET_MS);
  w.watch.pulse({ state: 'running', songMs: 99000 });
  await wait(w, HUNG_MS);
  assert.equal(w.asked, 2);
  assert.equal(w.shots.length, 2);
});

test('a page that stays hung is said to be so again at ten seconds and at a minute, no more; its coming back says how long it was', async () => {
  const w = world({ audible: () => true });
  w.watch.pulse({ state: 'running', songMs: 1000 });
  await wait(w, HUNG_MS);
  const told = w.lines.length;
  await wait(w, 8000);
  assert.equal(w.events().at(-1), 'page-hung  still=yes silentMs=10000 audible=yes');
  await wait(w, 50_000);
  assert.equal(w.events().at(-1), 'page-hung  still=yes silentMs=60000 audible=yes');
  await wait(w, 60_000);
  assert.equal(w.lines.length, told + 2);
  w.watch.pulse({ state: 'running', songMs: 190000 });
  assert.equal(w.events().at(-1), 'page-resumed  afterMs=120000 state=running');
});

test('no pulse is waited for while the play is paused or over, of a window put away, or when the PC itself slept', async () => {
  const win = { fullScreen: 'no', focused: 'yes', size: '1280x720' };
  const w = world({ window: () => win });
  // paused, done, off: frames are owed to no one
  for (const state of ['paused', 'done', 'off']) {
    w.watch.pulse({ state: 'running', songMs: 1000 });
    w.watch.pulse({ state, songMs: 1200 });
    await wait(w, HUNG_MS * 3);
  }
  // what is not a pulse is none
  w.watch.pulse({ state: 'dancing' });
  w.watch.pulse(null);
  assert.deepEqual(w.lines, []);
  // a window minimized draws nothing: the player's doing, and its coming back is no line either
  w.watch.pulse({ state: 'running', songMs: 2000 });
  win.minimized = 'yes';
  await wait(w, HUNG_MS * 2);
  delete win.minimized;
  w.watch.pulse({ state: 'running', songMs: 2100 });
  assert.deepEqual(w.lines, []);
  // the PC slept: the app's own clock jumped with the page's
  await w.advance(3_600_000);
  assert.deepEqual(w.lines, []);
  w.watch.pulse({ state: 'ending', songMs: 2200 });
  // a page that went (loaded again, its process gone) is waited for no longer
  w.watch.pageLeft();
  await wait(w, HUNG_MS * 2);
  w.watch.pulse({ state: 'running', songMs: 10 });
  w.watch.renderGone({ reason: 'crashed', exitCode: 1 });
  await wait(w, HUNG_MS * 2);
  assert.deepEqual(w.events(), ['render-process-gone  reason=crashed exitCode=1']);
  // an ending play's picture moves too
  w.watch.pulse({ state: 'ending', songMs: 99000 });
  await wait(w, HUNG_MS);
  assert.match(w.events()[1], /^page-hung  silentMs=2000 state=ending songMs=99000 fullScreen=no/);
});

test('a page that does not answer the app’s question, and Electron’s own word on a window that stopped answering', async () => {
  const w = world({
    audible: () => false,
    probe: async () => {
      throw new Error('timeout');
    },
  });
  w.watch.pulse({ state: 'running', songMs: 5000 });
  await wait(w, HUNG_MS);
  assert.deepEqual(w.events().slice(0, 1), ['page-hung  silentMs=2000 state=running songMs=5000 audible=no']);
  assert.ok(w.events().includes('page-probe  answered=no why=timeout waitedMs=0'));
  assert.deepEqual(probeFields({ visibility: 'hidden', focus: false, raf: 16 }, 12), { answered: 'yes', tookMs: 12, visibility: 'hidden', focus: 'no', frames: undefined, raf: '16' });
  assert.deepEqual(probeFields(undefined, 1500), { answered: 'no', why: 'no answer', waitedMs: 1500 });
  w.watch.unresponsive();
  await w.advance(4200);
  w.watch.responsive();
  assert.deepEqual(w.events().slice(-2), ['window-unresponsive  state=running silentMs=2000 audible=no', 'window-responsive  afterMs=4200']);
});

test('the pictures of a loss and of a hang are kept together: the newest five, whichever they are of', () => {
  assert.equal(shotName(NIGHT), 'graphics-lost-20261113-210405.jpg');
  assert.equal(shotName(NIGHT, 'hung'), 'graphics-hung-20261113-210405.jpg');
  const names = ['graphics-lost-20261113-210001.jpg', 'graphics-hung-20261113-210002.jpg', 'graphics-lost-20261113-210003.jpg', 'graphics-hung-20261112-235959.jpg', 'notes.txt', 'graphics-hung-x.jpg'];
  assert.deepEqual(staleShots(names, 2), ['graphics-hung-20261112-235959.jpg', 'graphics-lost-20261113-210001.jpg']);
  assert.deepEqual(staleShots(names, 9), []);
});
