// What the desktop app keeps between launches (desktop-state.json in its user data folder): the
// window's size and place, whether it was maximized or full screen, and the home port the game is
// served on (the page's origin: the game's settings are kept in that origin's storage) with the
// token its server stops on (a later launch stops a server an earlier one left on that port).

const DEFAULT_SIZE = { width: 1280, height: 800 };
const MIN_SIZE = { width: 960, height: 600 };
/** The least port the game is served on: the dynamic ports, above every one Chromium refuses to load (6000, 10080, …). */
const PORT_MIN = 32768;
/** A window counts as on a screen when this much of its title bar lies on a work area (px). */
const TITLE_GRIP = 120;
const TITLE_HEIGHT = 32;

/** A port the game may be served on. */
function usablePort(port) {
  return Number.isInteger(port) && port >= PORT_MIN && port <= 65535;
}

/** The state as kept, with anything missing or of the wrong kind left out. */
function sanitizeState(raw) {
  const state = { window: {}, port: null, token: null };
  if (!raw || typeof raw !== 'object') return state;
  const w = raw.window && typeof raw.window === 'object' ? raw.window : {};
  for (const key of ['x', 'y', 'width', 'height']) if (Number.isInteger(w[key])) state.window[key] = w[key];
  if (w.maximized === true) state.window.maximized = true;
  if (w.fullScreen === true) state.window.fullScreen = true;
  if (usablePort(raw.port)) state.port = raw.port;
  if (typeof raw.token === 'string' && /^[0-9a-f]{16,64}$/.test(raw.token)) state.token = raw.token;
  return state;
}

/** Whether a window at (x, y), `width` wide, has its title bar on the work area `a`: seen, and dragged by it. */
function onArea(a, x, y, width) {
  const left = Math.max(a.x, x);
  const right = Math.min(a.x + a.width, x + width);
  return right - left >= TITLE_GRIP && y >= a.y && y + TITLE_HEIGHT <= a.y + a.height;
}

/**
 * Where the window opens (BrowserWindow bounds): its last size, no smaller than the least and no
 * larger than the screen, at its last place while that lies on a screen (`workAreas`, the main
 * one first: the system centres a window without a place on it); otherwise without a place.
 */
function restoredBounds(saved, workAreas) {
  let width = Math.max(MIN_SIZE.width, saved.width ?? DEFAULT_SIZE.width);
  let height = Math.max(MIN_SIZE.height, saved.height ?? DEFAULT_SIZE.height);
  const area = saved.x === undefined || saved.y === undefined ? undefined : workAreas.find((a) => onArea(a, saved.x, saved.y, width));
  const fit = area ?? workAreas[0];
  if (fit) {
    width = Math.min(width, Math.max(MIN_SIZE.width, fit.width));
    height = Math.min(height, Math.max(MIN_SIZE.height, fit.height));
  }
  return area ? { x: saved.x, y: saved.y, width, height } : { width, height };
}

/** The screens' work areas, the main one first (the system lists the screens in an order of its own). */
function workAreasOf(displays, mainId) {
  return [...displays.filter((d) => d.id === mainId), ...displays.filter((d) => d.id !== mainId)].map((d) => d.workArea);
}

/**
 * What is kept of the window: its size and place out of maximized and full screen, and those two
 * (maximized: under its full screen too, so it comes back so).
 */
function windowState(normalBounds, maximized, fullScreen) {
  const { x, y, width, height } = normalBounds;
  return { x, y, width, height, ...(maximized ? { maximized: true } : {}), ...(fullScreen ? { fullScreen: true } : {}) };
}

module.exports = { DEFAULT_SIZE, MIN_SIZE, PORT_MIN, sanitizeState, restoredBounds, usablePort, windowState, workAreasOf };
