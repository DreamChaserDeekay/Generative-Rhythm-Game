// node --test (in desktop/)
const assert = require('node:assert/strict');
const test = require('node:test');
const { DEFAULT_SIZE, MIN_SIZE, restoredBounds, sanitizeState, usablePort, windowState, workAreasOf } = require('./windowState');

const MAIN = { x: 0, y: 0, width: 1920, height: 1040 };
const RIGHT = { x: 1920, y: 0, width: 2560, height: 1400 };

test('a state file that is missing, broken or of an older kind opens the default window', () => {
  assert.deepEqual(sanitizeState(null), { window: {}, port: null, token: null });
  assert.deepEqual(sanitizeState('x'), { window: {}, port: null, token: null });
  assert.deepEqual(sanitizeState({ window: { x: '1', width: 1.5, maximized: 'yes', fullScreen: 1 }, port: 80, token: '<script>' }), { window: {}, port: null, token: null });
  assert.deepEqual(sanitizeState({ window: { x: -8, y: 20, width: 1400, height: 900, fullScreen: true }, port: 51234, token: 'a1b2c3d4e5f60718' }), {
    window: { x: -8, y: 20, width: 1400, height: 900, fullScreen: true },
    port: 51234,
    token: 'a1b2c3d4e5f60718',
  });
  assert.deepEqual(restoredBounds({}, [MAIN]), DEFAULT_SIZE);
});

test('the game is served on a dynamic port only: none Chromium refuses to load (X11 6000, 10080, …)', () => {
  for (const port of [22, 1024, 6000, 10080, 32767, 65536, 50000.5]) {
    assert.equal(usablePort(port), false, String(port));
    assert.equal(sanitizeState({ port }).port, null, String(port));
  }
  for (const port of [32768, 49152, 65535]) assert.equal(sanitizeState({ port }).port, port);
});

test('the window opens where it was while that is on a screen, else centred, no larger than the screen', () => {
  assert.deepEqual(restoredBounds({ x: 100, y: 50, width: 1500, height: 900 }, [MAIN, RIGHT]), { x: 100, y: 50, width: 1500, height: 900 });
  // on the second screen
  assert.deepEqual(restoredBounds({ x: 2000, y: 100, width: 1400, height: 900 }, [MAIN, RIGHT]), { x: 2000, y: 100, width: 1400, height: 900 });
  // that screen unplugged: centred on the main one, at most its size
  assert.deepEqual(restoredBounds({ x: 2000, y: 100, width: 2400, height: 1300 }, [MAIN]), { width: 1920, height: 1040 });
  // the title bar above the screen, or all but a sliver off it
  assert.deepEqual(restoredBounds({ x: 100, y: -200, width: 1280, height: 800 }, [MAIN]), { width: 1280, height: 800 });
  assert.deepEqual(restoredBounds({ x: 1850, y: 100, width: 1280, height: 800 }, [MAIN]), { width: 1280, height: 800 });
  // never under the least size
  assert.deepEqual(restoredBounds({ width: 300, height: 200 }, [MAIN]), MIN_SIZE);
  // the main screen's size whatever order the system lists the screens in
  const screens = workAreasOf([{ id: 2, workArea: RIGHT }, { id: 1, workArea: MAIN }], 1);
  assert.deepEqual(screens, [MAIN, RIGHT]);
  assert.deepEqual(restoredBounds({ x: 9000, y: 100, width: 2400, height: 1300 }, screens), { width: 1920, height: 1040 });
});

test('what is kept of a window: its place out of maximized and full screen, and those two', () => {
  assert.deepEqual(windowState({ x: 10, y: 20, width: 1300, height: 820 }, false, false), { x: 10, y: 20, width: 1300, height: 820 });
  assert.deepEqual(windowState({ x: 10, y: 20, width: 1300, height: 820 }, true, true), { x: 10, y: 20, width: 1300, height: 820, maximized: true, fullScreen: true });
  // kept and read back, it is the same
  const kept = { window: windowState({ x: 10, y: 20, width: 1300, height: 820 }, false, true), port: 40123, token: '0123456789abcdef0123456789abcdef' };
  assert.deepEqual(sanitizeState(JSON.parse(JSON.stringify(kept))), kept);
});
