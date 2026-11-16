// node --test (in desktop/)
const assert = require('node:assert/strict');
const test = require('node:test');
const { FAILED_STARTS, MODES, MODE_IDS, confirmed, drawnByCard, givenUp, modeOf, picked, sanitizeGraphics, startPlan } = require('./graphicsMode');

test('the modes: default changes nothing, each other one starts Chromium with switches of its own', () => {
  assert.deepEqual(MODE_IDS, ['default', 'no-dcomp', 'gl', 'd3d11on12']);
  assert.deepEqual(MODES.default, []);
  const switches = MODE_IDS.filter((id) => id !== 'default').map((id) => JSON.stringify(MODES[id]));
  assert.equal(new Set(switches).size, switches.length);
  for (const id of MODE_IDS) for (const s of MODES[id]) assert.ok(s.length >= 1 && s.length <= 2 && s.every((part) => /^[a-z0-9-]+$/.test(part)), id);
  assert.equal(modeOf('gl'), 'gl');
  for (const not of ['', 'GL', 'constructor', '__proto__', 'toString', null, undefined, 3, {}]) assert.equal(modeOf(not), 'default');
});

test('what is kept of the modes: the mode, the starts of it that have not come up yet, and why one was given up', () => {
  assert.deepEqual(sanitizeGraphics(null), { mode: 'default' });
  assert.deepEqual(sanitizeGraphics({ mode: 'gl', trial: { mode: 'gl', starts: 1 } }), { mode: 'gl', trial: { mode: 'gl', starts: 1 } });
  // a count of another mode's starts, or of default's, or no count at all: left out
  assert.deepEqual(sanitizeGraphics({ mode: 'gl', trial: { mode: 'no-dcomp', starts: 1 } }), { mode: 'gl' });
  assert.deepEqual(sanitizeGraphics({ mode: 'default', trial: { mode: 'default', starts: 1 } }), { mode: 'default' });
  for (const starts of [0, -1, 1.5, '1', 100, null]) assert.deepEqual(sanitizeGraphics({ mode: 'gl', trial: { mode: 'gl', starts } }), { mode: 'gl' });
  assert.deepEqual(sanitizeGraphics({ mode: 'nonsense', reverted: { from: 'gl', why: 'x'.repeat(200) } }), { mode: 'default', reverted: { from: 'gl', why: 'x'.repeat(80) } });
  assert.deepEqual(sanitizeGraphics({ mode: 'default', reverted: { from: 'default', why: 'x' } }), { mode: 'default' });
  assert.deepEqual(sanitizeGraphics({ mode: 'default', reverted: { from: 'gl', why: 7 } }), { mode: 'default' });
});

test('a start: default as it is; another mode counted before the app goes on, and given up once it did not come up twice', () => {
  assert.deepEqual(startPlan(undefined, undefined), { mode: 'default', graphics: { mode: 'default' }, forced: false, note: null });
  // the reason the last one was given up stays for the settings to show
  const reverted = { from: 'gl', why: 'drawn in software' };
  assert.deepEqual(startPlan({ mode: 'default', reverted }, '').graphics, { mode: 'default', reverted });

  let kept = picked('gl');
  const starts = [];
  for (let launch = 0; launch < FAILED_STARTS + 1; launch++) {
    const plan = startPlan(kept, undefined);
    starts.push(plan.mode);
    kept = plan.graphics;
  }
  // (two starts that did not come up; the third goes back to default and says why)
  assert.deepEqual(starts, ['gl', 'gl', 'default']);
  assert.deepEqual(kept, { mode: 'default', reverted: { from: 'gl', why: '2 starts did not come up' } });
  assert.deepEqual(startPlan({ mode: 'gl', trial: { mode: 'gl', starts: FAILED_STARTS } }, undefined).note, { from: 'gl', why: '2 starts did not come up' });

  // a start that came up clears the count: the next two may fail again before it is given up
  kept = confirmed(startPlan(picked('no-dcomp'), undefined).graphics);
  assert.deepEqual(kept, { mode: 'no-dcomp' });
  assert.deepEqual(startPlan(kept, undefined).graphics, { mode: 'no-dcomp', trial: { mode: 'no-dcomp', starts: 1 } });
});

test('a mode asked for this launch only (a test’s) is run without being kept or counted', () => {
  const kept = { mode: 'gl', trial: { mode: 'gl', starts: 1 } };
  assert.deepEqual(startPlan(kept, 'd3d11on12'), { mode: 'd3d11on12', graphics: kept, forced: true, note: null });
  assert.deepEqual(startPlan(kept, 'default'), { mode: 'default', graphics: kept, forced: true, note: null });
  // (what is no mode runs as default, and is still this launch's only)
  assert.deepEqual(startPlan(kept, 'vulkan'), { mode: 'default', graphics: kept, forced: true, note: null });
});

test('given up: default from the next start on, with the mode and the reason; picking one starts it afresh', () => {
  assert.deepEqual(givenUp({ mode: 'gl', trial: { mode: 'gl', starts: 1 } }, 'the game is drawn in software under it'), { mode: 'default', reverted: { from: 'gl', why: 'the game is drawn in software under it' } });
  assert.deepEqual(givenUp({ mode: 'default' }, 'x'), { mode: 'default' });
  assert.deepEqual(picked('d3d11on12'), { mode: 'd3d11on12' });
  assert.deepEqual(picked('nonsense'), { mode: 'default' });
});

test('whether the graphics card draws the game, from Chromium’s GPU features', () => {
  assert.equal(drawnByCard({ gpu_compositing: 'enabled', webgl: 'enabled', webgl2: 'enabled' }), true);
  // Chromium fell back to drawing in software (the mode's renderer could not be started), or to no WebGL at all
  assert.equal(drawnByCard({ gpu_compositing: 'disabled_software', webgl: 'enabled_readback' }), false);
  assert.equal(drawnByCard({ gpu_compositing: 'enabled', webgl: 'unavailable_software' }), false);
  assert.equal(drawnByCard({ gpu_compositing: 'enabled', webgl: 'enabled_readback' }), false);
  assert.equal(drawnByCard({ gpu_compositing: 'enabled', webgl: 'disabled_off' }), false);
  for (const none of [null, undefined, {}, 'enabled']) assert.equal(drawnByCard(none), false);
  // and from the renderer a canvas of the page gets, where that is known
  const on = { gpu_compositing: 'enabled', webgl: 'enabled' };
  assert.equal(drawnByCard(on, 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 (0x00001F08) OpenGL 4.5.0, D3D11-32.0.16.1714)'), true);
  assert.equal(drawnByCard(on, 'none'), false);
  assert.equal(drawnByCard(on, 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)'), false);
  assert.equal(drawnByCard(on, 'ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11-10.0.19041.5794)'), false);
  assert.equal(drawnByCard({ gpu_compositing: 'disabled_software', webgl: 'enabled' }, 'ANGLE (NVIDIA, …)'), false);
});
