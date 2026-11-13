// What the app writes down when its graphics are lost (graphics.log beside server.log, see main.js):
// which process went and why, what the page's WebGL canvases went through, whether the server was
// making a chart then (its model works on the GPU the game is drawn with), and a picture of the
// window afterwards. Kept apart from main.js so that it runs under node --test: the clock, the
// file, the server and the window are handed in.
const fs = require('node:fs');
const path = require('node:path');

const LOG_NAME = 'graphics.log';
/** Past this size the log starts over (the old one is kept as graphics.log.1). */
const MAX_LOG_BYTES = 256 * 1024;
const SHOT_PREFIX = 'graphics-lost-';
/** How many pictures of the window are kept: the newest. */
const SHOTS_KEPT = 5;
/** The window is pictured this long after the page's graphics came back … */
const SETTLE_MS = 1000;
/** … or this long after they went, should they not come back. */
const GIVE_UP_MS = 6000;
/** Losses within this of a picture are written down only: the server is not asked nor the window pictured again. */
const QUIET_MS = 30_000;
/** How many lines the page may have written in a minute (a page gone wrong must not fill the disk). */
const PAGE_LINES_PER_MINUTE = 30;
const PAGE_EVENTS = ['webglcontextlost', 'webglcontextrestored'];
/** The parts of Chromium's GPU feature status that say whether the game is still drawn by the graphics card. */
const FEATURES = ['gpu_compositing', 'webgl', 'webgl2', '2d_canvas', 'rasterization'];

const two = (n) => String(n).padStart(2, '0');

/** The time as the PC's clock shows it, with its distance from UTC (the server's and the worker's logs are in local time too). */
function stamp(date) {
  const offset = -date.getTimezoneOffset();
  const zone = `${offset < 0 ? '-' : '+'}${two(Math.floor(Math.abs(offset) / 60))}:${two(Math.abs(offset) % 60)}`;
  const day = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
  const time = `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, '0')}`;
  return `${day} ${time} ${zone}`;
}

/** A value on a line: bare while it is one word, else quoted on one line; long ones are cut. */
function text(value) {
  const s = Array.isArray(value) ? value.join(',') : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const cut = s.length > 200 ? `${s.slice(0, 200)}…` : s;
  return /^[\w.:+\-/*,()%]+$/.test(cut) ? cut : JSON.stringify(cut);
}

/** One line of the log: the time, what happened, and what is known of it (values not known are left out). */
function entry(date, event, fields = {}) {
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0))
    .map(([key, value]) => `${key}=${text(value)}`);
  return `${stamp(date)}  ${event}${parts.length ? `  ${parts.join(' ')}` : ''}`;
}

/** What Electron tells of a process that went (child-process-gone, render-process-gone). */
function goneFields(details) {
  const d = details && typeof details === 'object' ? details : {};
  const code = Number.isInteger(d.exitCode) ? d.exitCode : undefined;
  return {
    type: typeof d.type === 'string' ? d.type : undefined,
    reason: typeof d.reason === 'string' ? d.reason : undefined,
    exitCode: code,
    // Windows' codes read in hex (0xC0000005 an access violation, …)
    exitHex: code !== undefined && (code < 0 || code > 255) ? `0x${(code >>> 0).toString(16).toUpperCase()}` : undefined,
    name: typeof d.name === 'string' ? d.name : undefined,
    serviceName: typeof d.serviceName === 'string' ? d.serviceName : undefined,
  };
}

const word = (value) => (typeof value === 'string' ? value.replace(/[^\w -]/g, '').slice(0, 40) : '');
/** How much of what the page says of its canvas is written down: so many values, each so long. */
const PAGE_VALUES = 16;
const PAGE_VALUE_LENGTH = 120;

/**
 * What the page tells of a WebGL canvas (preload.js), cleaned; null when it is nothing of the kind.
 * `about` is what the page keeps on the canvas for this log (its data- attributes: the stage of the
 * play, the song's time, the skin, what the renderer holds, …) and the kind of background video:
 * written down as it comes, a line's worth of it.
 */
function pageRecord(raw) {
  if (!raw || typeof raw !== 'object' || !PAGE_EVENTS.includes(raw.type)) return null;
  const about = {};
  const told = raw.about && typeof raw.about === 'object' ? Object.entries(raw.about) : [];
  for (const [key, value] of told) {
    if (Object.keys(about).length >= PAGE_VALUES) break;
    if (!/^[A-Za-z][A-Za-z0-9]{0,23}$/.test(key) || typeof value !== 'string' || value === '') continue;
    // (one line: nothing that ends it, nothing that is not text)
    about[key] = value.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, ' ').slice(0, PAGE_VALUE_LENGTH);
  }
  return { type: raw.type, canvas: word(raw.canvas), about };
}

/**
 * The server's answer to what chart it is making (GET /api/mapper/queue), as { ok, body } or
 * { ok: false, error }: the chart being made, how many wait, and whether the model is loaded (it
 * keeps a few GB of the GPU's memory from its first chart on, made or not).
 */
function queueFields(answer) {
  const body = answer && answer.ok ? answer.body : null;
  if (!body || typeof body !== 'object' || !('making' in body)) return { making: 'unknown', why: (answer && answer.error) || 'no answer' };
  return {
    making: typeof body.making === 'string' ? body.making : 'none',
    waiting: Number.isInteger(body.waiting) ? body.waiting : undefined,
    loaded: typeof body.loaded === 'boolean' ? (body.loaded ? 'yes' : 'no') : undefined,
  };
}

/**
 * How full the graphics cards' memory is, from nvidia-smi's answer (--query-gpu=memory.used,memory.total,
 * utilization.gpu --format=csv,noheader,nounits: a line a card), as { ok, text } or { ok: false, error }:
 * "7421/8192MB 97%" a card. A PC without an NVIDIA card has no nvidia-smi: unknown, with the reason.
 */
function memoryFields(answer) {
  if (!answer || !answer.ok || typeof answer.text !== 'string') return { vram: 'unknown', why: (answer && answer.error) || 'no answer' };
  const cards = answer.text
    .split(/\r?\n/)
    .map((line) => line.split(',').map((part) => Number(part.trim())))
    .filter((n) => n.length >= 2 && Number.isFinite(n[0]) && Number.isFinite(n[1]) && n[1] > 0)
    .slice(0, 4)
    .map(([used, total, load]) => `${used}/${total}MB${Number.isFinite(load) ? ` ${load}%` : ''}`);
  return cards.length ? { vram: cards } : { vram: 'unknown', why: 'not read' };
}

function featureFields(status) {
  const s = status && typeof status === 'object' ? status : {};
  return Object.fromEntries(FEATURES.map((key) => [key, typeof s[key] === 'string' ? s[key] : undefined]));
}

function shotName(date) {
  return `${SHOT_PREFIX}${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}.jpg`;
}

/** Of a folder's file names, the pictures to delete: all but the newest `keep` (their names sort by time). */
function staleShots(names, keep = SHOTS_KEPT) {
  const shots = names.filter((name) => /^graphics-lost-\d{8}-\d{6}\.jpg$/.test(name)).sort();
  return shots.slice(0, Math.max(0, shots.length - keep));
}

function pruneShots(dir, keep = SHOTS_KEPT) {
  for (const name of staleShots(fs.readdirSync(dir), keep)) fs.rmSync(path.join(dir, name), { force: true });
}

/** Adds a line to the log; a log grown past `maxBytes` is put aside first (one old log is kept). */
function appendLine(file, line, maxBytes = MAX_LOG_BYTES) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let size = 0;
  try {
    size = fs.statSync(file).size;
  } catch {
    // no log yet
  }
  if (size > maxBytes) fs.renameSync(file, `${file}.1`);
  fs.appendFileSync(file, `${line}\n`);
}

/**
 * The log of one run of the app. `io` is the world it works in:
 *   write(line), now() → Date, later(fn, ms) → a way to call it off,
 *   queue() → Promise of the server's answer ({ ok, body } | { ok: false, error }),
 *   memory() → Promise of nvidia-smi's answer ({ ok, text } | { ok: false, error }),
 *   features() → Chromium's GPU feature status,
 *   shot(name) → Promise of the file a picture of the window was saved as.
 * A loss (the GPU process gone, or a WebGL canvas of the page losing its context) is written down
 * as it comes; the first of a run of them also asks the server what it is making and how full the
 * graphics card's memory is, and pictures the window once the page's graphics are back (or did not
 * come back).
 */
function graphicsWatch(io) {
  /** The loss being followed up: { webgl: 'none' | 'lost' | 'back', until, off, picturing } */
  let incident = null;
  let quietUntil = 0;
  /** When a WebGL canvas of the page last lost its context. */
  let lostAt = null;
  let pageTimes = [];
  /** The GPU features as they were last written down: a line is written when they change. */
  let features = null;
  const log = (event, fields) => io.write(entry(io.now(), event, fields));
  const sameFeatures = (now) => FEATURES.every((key) => features[key] === now[key]);
  const ms = () => io.now().getTime();

  const picture = () => {
    const { webgl } = incident;
    incident.picturing = true;
    features = featureFields(io.features());
    log('gpu-features', features);
    const done = (fields) => {
      log('picture', { ...fields, webgl });
      incident = null;
      quietUntil = ms() + QUIET_MS;
    };
    Promise.resolve()
      .then(() => io.shot(shotName(io.now())))
      .then(
        (file) => done({ file }),
        (e) => done({ failed: String((e && e.message) || e) }),
      );
  };

  /** The picture in `delay` ms, yet no later than the incident may last (losses that keep coming do not put it off for ever). */
  const arm = (delay) => {
    if (incident.off) incident.off();
    incident.off = io.later(picture, Math.max(0, Math.min(delay, incident.until - ms())));
  };

  const lost = (webgl) => {
    if (incident) {
      if (webgl === 'lost' && !incident.picturing) {
        incident.webgl = 'lost';
        arm(GIVE_UP_MS);
      }
      return;
    }
    if (ms() < quietUntil) return;
    incident = { webgl, until: ms() + 2 * GIVE_UP_MS, off: null, picturing: false };
    arm(GIVE_UP_MS);
    Promise.resolve()
      .then(() => io.queue())
      .then(
        (answer) => log('server', queueFields(answer)),
        (e) => log('server', queueFields({ ok: false, error: String((e && e.message) || e) })),
      );
    Promise.resolve()
      .then(() => io.memory())
      .then(
        (answer) => log('gpu-memory', memoryFields(answer)),
        (e) => log('gpu-memory', memoryFields({ ok: false, error: String((e && e.message) || e) })),
      );
  };

  const back = () => {
    if (!incident || incident.picturing || incident.webgl !== 'lost') return;
    incident.webgl = 'back';
    arm(SETTLE_MS);
  };

  /** Whether the page may write another line this minute; the first one over the limit is said to be dropped. */
  const pageMayWrite = () => {
    const now = ms();
    pageTimes = pageTimes.filter((t) => now - t < 60_000);
    if (pageTimes.length > PAGE_LINES_PER_MINUTE) return false;
    pageTimes.push(now);
    if (pageTimes.length <= PAGE_LINES_PER_MINUTE) return true;
    log('page', { dropped: 'too many lines this minute' });
    return false;
  };

  return {
    /** The first line of a run; `fields` has the GPU features among the rest. */
    started(fields) {
      features = featureFields(fields);
      log('start', fields);
    },
    /**
     * Chromium's GPU information changed: written down when it changes how the game is drawn (the fall
     * back to software, above all). Not before the first line of the run, which says how it is drawn
     * (Chromium has much to say of the GPU while it starts).
     */
    featuresMayHaveChanged() {
      if (features === null) return;
      const now = featureFields(io.features());
      if (sameFeatures(now)) return;
      features = now;
      log('gpu-features', now);
    },
    childGone(details) {
      log('child-process-gone', goneFields(details));
      // (a GPU process that ended as it should, one Chromium started to ask the card something, is no loss)
      if (details && details.type === 'GPU' && details.reason !== 'clean-exit') lost('none');
    },
    renderGone: (details) => log('render-process-gone', goneFields(details)),
    page(raw) {
      const record = pageRecord(raw);
      if (!record || !pageMayWrite()) return;
      if (record.type === 'webglcontextlost') {
        lostAt = ms();
        log(record.type, { canvas: record.canvas, ...record.about });
        lost('lost');
      } else {
        log(record.type, { canvas: record.canvas, afterMs: lostAt === null ? undefined : ms() - lostAt, ...record.about });
        back();
      }
    },
  };
}

module.exports = {
  FEATURES,
  GIVE_UP_MS,
  LOG_NAME,
  MAX_LOG_BYTES,
  PAGE_LINES_PER_MINUTE,
  QUIET_MS,
  SETTLE_MS,
  SHOTS_KEPT,
  appendLine,
  entry,
  featureFields,
  goneFields,
  graphicsWatch,
  memoryFields,
  pageRecord,
  pruneShots,
  queueFields,
  shotName,
  staleShots,
  stamp,
};
