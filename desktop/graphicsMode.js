// The graphics compatibility modes (설정 → 연출·배경 → 그래픽 호환 모드): other ways for Chromium to draw
// the game, for a PC whose graphics driver trips on the usual one. What a player saw (2026-11-16, an RTX
// 2060 on driver 32.0.16.1714): the whole monitor blinks, the app's GPU process is gone (0x80000003) and
// the gear with it for a second or two, in the same places of a song. The app cannot stop a driver from
// resetting; it can keep off the path the driver resets on:
//   default     as Chromium does it: ANGLE on Direct3D 11, shown through DirectComposition
//   no-dcomp    Direct3D 11, shown without DirectComposition (no overlay planes of the app's own)
//   gl          ANGLE on the driver's OpenGL
//   d3d11on12   ANGLE's Direct3D 11 on top of Direct3D 12
// A mode is kept in desktop-state.json and its switches are set as the app starts (they cannot change
// while it runs). A mode that does not come up (the app gone before the game was drawn by the graphics
// card, twice in a row), or under which the game is drawn in software, goes back to default.
// Kept apart from main.js so that it runs under node --test.

/** id → the Chromium switches it starts with ([name] or [name, value]). */
const MODES = {
  default: [],
  'no-dcomp': [['disable-direct-composition']],
  gl: [['use-angle', 'gl']],
  d3d11on12: [['use-angle', 'd3d11on12']],
};
const MODE_IDS = Object.keys(MODES);
/** A start under a mode other than default counts as come up once the game has been drawn by the card this long. */
const CONFIRM_MS = 20_000;
/** A mode under which the game's page gets no WebGL at all (no track to play on) is given up this soon after the game shows. */
const NO_WEBGL_MS = 6000;
/** So many starts in a row that did not come up, and the mode is given up. */
const FAILED_STARTS = 2;
/** So many losses of the GPU process before a start has come up, and the mode is given up at once. */
const EARLY_LOSSES = 2;

function modeOf(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MODES, value) ? value : 'default';
}

/** What is kept of the modes (desktop-state.json's "graphics"), with anything of the wrong kind left out. */
function sanitizeGraphics(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = { mode: modeOf(r.mode) };
  const t = r.trial && typeof r.trial === 'object' ? r.trial : null;
  // the starts of the mode kept that have not come up yet
  if (t && modeOf(t.mode) === out.mode && out.mode !== 'default' && Number.isInteger(t.starts) && t.starts > 0 && t.starts < 100) out.trial = { mode: out.mode, starts: t.starts };
  const v = r.reverted && typeof r.reverted === 'object' ? r.reverted : null;
  if (v && modeOf(v.from) !== 'default' && typeof v.why === 'string') out.reverted = { from: modeOf(v.from), why: v.why.slice(0, 80) };
  return out;
}

/**
 * How this launch starts: the mode to start in, what is kept from here on (`graphics`), and what to write
 * down. `asked` is a mode asked for this launch only (the GRG_GRAPHICS_MODE environment variable: tests),
 * which is neither kept nor given up.
 */
function startPlan(kept, asked) {
  const graphics = sanitizeGraphics(kept);
  if (typeof asked === 'string' && asked !== '') return { mode: modeOf(asked), graphics, forced: true, note: null };
  if (graphics.mode === 'default') return { mode: 'default', graphics: { mode: 'default', ...(graphics.reverted ? { reverted: graphics.reverted } : {}) }, forced: false, note: null };
  const starts = graphics.trial ? graphics.trial.starts : 0;
  if (starts >= FAILED_STARTS) {
    const reverted = { from: graphics.mode, why: `${starts} starts did not come up` };
    return { mode: 'default', graphics: { mode: 'default', reverted }, forced: false, note: reverted };
  }
  // counted before the app goes on: a start that takes the app down with it is still counted
  return { mode: graphics.mode, graphics: { mode: graphics.mode, trial: { mode: graphics.mode, starts: starts + 1 } }, forced: false, note: null };
}

/** The mode has come up: nothing is counted against it any more. */
function confirmed(graphics) {
  return { mode: sanitizeGraphics(graphics).mode };
}

/** The mode is given up for `why`: default from the next start on, with the reason kept for the settings to show. */
function givenUp(graphics, why) {
  const from = sanitizeGraphics(graphics).mode;
  return from === 'default' ? { mode: 'default' } : { mode: 'default', reverted: { from, why: String(why).slice(0, 80) } };
}

/** The player picks `mode` in the settings: kept from the next start on, with nothing counted against it. */
function picked(mode) {
  return { mode: modeOf(mode) };
}

/**
 * Whether the game is drawn by the graphics card: from Chromium's GPU feature status and, where it is
 * known, the renderer a WebGL canvas of the page gets ('none' when it gets no context at all). A mode
 * under which it is not (the driver has no OpenGL to speak of, Direct3D 12 is missing) leaves the game to
 * software or without its track, which no one picks a mode for.
 */
function drawnByCard(status, renderer) {
  const s = status && typeof status === 'object' ? status : {};
  if (s.gpu_compositing !== 'enabled' || typeof s.webgl !== 'string' || !s.webgl.startsWith('enabled') || /software|readback/.test(s.webgl)) return false;
  return typeof renderer !== 'string' || !(renderer === 'none' || /swiftshader|llvmpipe|basic render|warp|software/i.test(renderer));
}

module.exports = { CONFIRM_MS, EARLY_LOSSES, FAILED_STARTS, MODES, MODE_IDS, NO_WEBGL_MS, confirmed, drawnByCard, givenUp, modeOf, picked, sanitizeGraphics, startPlan };
