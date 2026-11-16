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

/** A value on a line: bare while it is one word, else quoted on one line; ones longer than `limit` are cut. */
function text(value, limit = 200) {
  const s = Array.isArray(value) ? value.join(',') : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const cut = s.length > limit ? `${s.slice(0, limit)}…` : s;
  return /^[\w.:+\-/*,()%]+$/.test(cut) ? cut : JSON.stringify(cut);
}

/**
 * One line of the log: the time, what happened, and what is known of it (values not known are left out);
 * `limit`: how long a value may be (the lines that are one long value: what the page did before a loss).
 */
function entry(date, event, fields = {}, limit = 200) {
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0))
    .map(([key, value]) => `${key}=${text(value, limit)}`);
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
const PAGE_VALUES = 24;
const PAGE_VALUE_LENGTH = 120;
/**
 * What the page did in the seconds before a loss (client/src/render/trail.ts keeps it on the canvas): its
 * frames' lengths and what happened in them, each a line of its own, this long at most.
 */
const TRAIL_KEYS = ['trailFrames', 'trailEvents'];
const TRAIL_LENGTH = 1600;

/**
 * What the page tells of a WebGL canvas (preload.js), cleaned; null when it is nothing of the kind.
 * `about` is what the page keeps on the canvas for this log (its data- attributes: the stage of the
 * play, the song's time, the skin, what the renderer holds, …) and the kind of background video:
 * written down as it comes, a line's worth of it.
 */
function pageRecord(raw) {
  if (!raw || typeof raw !== 'object' || !PAGE_EVENTS.includes(raw.type)) return null;
  const about = {};
  const trail = {};
  const told = raw.about && typeof raw.about === 'object' ? Object.entries(raw.about) : [];
  // (one line: nothing that ends it, nothing that is not text)
  const clean = (value, length) => value.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, ' ').slice(0, length);
  for (const [key, value] of told) {
    if (typeof value !== 'string' || value === '') continue;
    if (TRAIL_KEYS.includes(key)) trail[key] = clean(value, TRAIL_LENGTH);
    else if (Object.keys(about).length < PAGE_VALUES && /^[A-Za-z][A-Za-z0-9]{0,23}$/.test(key)) about[key] = clean(value, PAGE_VALUE_LENGTH);
  }
  return { type: raw.type, canvas: word(raw.canvas), about, trail };
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

const yesNo = (value) => (typeof value === 'boolean' ? (value ? 'yes' : 'no') : undefined);
const short = (value) => (typeof value === 'string' && value !== '' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined);

/**
 * How Chromium draws: from its GPU information (app.getGPUInfo), what a driver's fault may hang on. The
 * renderer string names ANGLE's backend and the driver ("ANGLE (NVIDIA, … Direct3D11 vs_5_0 ps_5_0,
 * D3D11-32.0.16.1714)", or OpenGL, or Direct3D 11 on 12); DirectComposition and the overlay planes are the
 * way the picture gets to the screen. Names differ between Chromium versions: what is not there is left
 * out, and every other plain value of the information is in `aux` as it comes.
 */
function configFields(info) {
  const aux = info && typeof info === 'object' && info.auxAttributes && typeof info.auxAttributes === 'object' ? info.auxAttributes : {};
  const beside = info && typeof info === 'object' ? info.overlayInfo : null;
  const overlay = aux.overlayInfo && typeof aux.overlayInfo === 'object' ? aux.overlayInfo : beside && typeof beside === 'object' ? beside : aux;
  const planes = ['nv12OverlaySupport', 'yuy2OverlaySupport', 'bgra8OverlaySupport', 'rgb10a2OverlaySupport', 'p010OverlaySupport']
    .map((key) => (short(overlay[key]) ? `${key.replace('OverlaySupport', '')}:${overlay[key]}` : null))
    .filter(Boolean);
  // (told by name above, or of no use here: the build's own facts, what the card can decode, lists of extensions)
  const named = [
    ...['glRenderer', 'glVersion', 'displayType', 'skiaBackendType', 'directComposition', 'supportsOverlays', 'overlayInfo', 'glExtensions', 'glWsExtensions', 'glWsVendor', 'glWsVersion', 'glVendor'],
    ...['isAsan', 'isClangCoverage', 'targetCpuBits', 'visibilityCallbackCallCount', 'initializationTime', 'jpegDecodeAcceleratorSupported', 'subpixelFontRendering', 'canSupportThreadedTextureMailbox', 'machineModelName', 'machineModelVersion'],
  ];
  const rest = Object.entries(aux)
    .filter(([key, value]) => !named.includes(key) && !/OverlaySupport$/.test(key) && (typeof value === 'boolean' || short(value) !== undefined))
    .map(([key, value]) => `${key}:${typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value).slice(0, 40)}`);
  return {
    gl: short(aux.glRenderer),
    glVersion: short(aux.glVersion),
    display: short(aux.displayType),
    skia: short(aux.skiaBackendType),
    dcomp: yesNo(overlay.directComposition ?? aux.directComposition),
    overlays: yesNo(overlay.supportsOverlays ?? aux.supportsOverlays),
    planes,
    aux: rest,
  };
}

/** Every part of Chromium's GPU feature status as it is ("gpu_compositing:enabled,…"): the parts the game needs are FEATURES. */
function statusList(status) {
  const s = status && typeof status === 'object' ? status : {};
  return Object.entries(s)
    .filter(([, value]) => typeof value === 'string')
    .map(([key, value]) => `${key}:${value}`);
}

/** The screens (Electron's screen.getAllDisplays): size, refresh rate, bits a colour, scale, and the colour space where it is not plain sRGB. */
function displayList(displays) {
  return (Array.isArray(displays) ? displays : []).slice(0, 4).map((d) => {
    const size = d && d.size ? `${d.size.width}x${d.size.height}` : '?';
    const hz = Number.isFinite(d && d.displayFrequency) && d.displayFrequency > 0 ? `@${Math.round(d.displayFrequency)}Hz` : '';
    const bits = Number.isFinite(d && d.depthPerComponent) ? ` ${d.depthPerComponent}bit` : '';
    const scale = Number.isFinite(d && d.scaleFactor) && d.scaleFactor !== 1 ? ` x${d.scaleFactor}` : '';
    const space = typeof (d && d.colorSpace) === 'string' && /HDR|PQ|HLG|2020|P3|SCRGB/i.test(d.colorSpace) ? ` ${d.colorSpace.replace(/[{}\s]/g, '').slice(0, 60)}` : '';
    return `${size}${hz}${bits}${scale}${space}`;
  });
}

/** The registry keys Windows keeps those settings under (reg query <key>), by the name registryFields knows each by. */
const REGISTRY_KEYS = {
  drivers: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers',
  dwm: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\Dwm',
  game: 'HKCU\\System\\GameConfigStore',
};

/**
 * Windows' settings that change how a window gets to the screen, from `reg query` of the keys they are
 * under (REGISTRY_KEYS; the answers as { ok, text } or { ok: false, error }): hardware-accelerated GPU
 * scheduling (HwSchMode: 2 on, 1 off), the time a driver is given before Windows resets it (TdrDelay,
 * seconds: 2 unless set), the overlay planes (OverlayTestMode: 5 turns them off), and the Game Bar's
 * recording and full screen handling. A value not set is left out; a key that is not there has none set.
 */
function registryFields(answers) {
  const a = answers && typeof answers === 'object' ? answers : {};
  const value = (answer, name) => {
    if (!answer || !answer.ok || typeof answer.text !== 'string') return undefined;
    const m = new RegExp(`^\\s*${name}\\s+REG_DWORD\\s+0x([0-9a-fA-F]+)\\s*$`, 'm').exec(answer.text);
    return m ? String(parseInt(m[1], 16)) : undefined;
  };
  // (reg answers a key that is not there with an error and the code 1: nothing is set under it)
  const failed = Object.keys(REGISTRY_KEYS).find((key) => !a[key] || (!a[key].ok && a[key].error !== '1'));
  return {
    HwSchMode: value(a.drivers, 'HwSchMode'),
    TdrDelay: value(a.drivers, 'TdrDelay'),
    TdrDdiDelay: value(a.drivers, 'TdrDdiDelay'),
    TdrLevel: value(a.drivers, 'TdrLevel'),
    OverlayTestMode: value(a.dwm, 'OverlayTestMode'),
    GameDVR: value(a.game, 'GameDVR_Enabled'),
    FSEBehavior: value(a.game, 'GameDVR_FSEBehaviorMode'),
    why: failed ? String((a[failed] && a[failed].error) || 'no answer').slice(0, 60) : undefined,
  };
}

/** The filter of Windows' event log (wevtutil qe <log> /q:…) for what the graphics drivers and the system said of them in the last `ms`. */
function driverEventQuery(ms) {
  const providers = ['Display', 'nvlddmkm', 'Microsoft-Windows-DxgKrnl', 'amdkmdag', 'amdwddmg', 'igfx', 'igfxn', 'BasicDisplay', 'Microsoft-Windows-Kernel-Power'];
  return `*[System[Provider[${providers.map((name) => `@Name='${name}'`).join(' or ')}] and TimeCreated[timediff(@SystemTime) <= ${Math.round(ms)}]]]`;
}

/** The same for programs that crashed (the Application log: which module of the app's process, at what offset, with what code). */
function crashEventQuery(ms) {
  return `*[System[Provider[@Name='Application Error' or @Name='Windows Error Reporting'] and TimeCreated[timediff(@SystemTime) <= ${Math.round(ms)}]]]`;
}

/**
 * The events of wevtutil's XML answer (/f:xml), newest first as asked: who said it, its number, when (UTC, as
 * the log keeps it) and what it carried. "Display 4101" is Windows saying it reset a display driver that
 * stopped answering; nvlddmkm's are the NVIDIA driver's own errors.
 */
function logEvents(xml, most = 8) {
  const events = [];
  for (const m of String(xml || '').matchAll(/<Event[ >][\s\S]*?<\/Event>/g)) {
    if (events.length >= most) break;
    const one = m[0];
    const provider = /<Provider[^>]*\bName=['"]([^'"]+)['"]/.exec(one);
    const id = /<EventID[^>]*>(\d+)<\/EventID>/.exec(one);
    const at = /<TimeCreated[^>]*\bSystemTime=['"]([^'"]+)['"]/.exec(one);
    const data = [...one.matchAll(/<Data(?:\s[^>]*)?>([\s\S]*?)<\/Data>/g)].map((d) => d[1].replace(/&[a-z]+;|&#\d+;/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
    events.push({ source: provider ? provider[1] : undefined, id: id ? Number(id[1]) : undefined, at: at ? at[1].replace(/(\.\d{3})\d*Z$/, '$1Z') : undefined, data: data.slice(0, 14).join(' | ').slice(0, 300) || undefined });
  }
  return events;
}

/**
 * The lines of Chromium's own log (chromium.log beside this one: the app's processes write their warnings
 * and errors there, the GPU process among them) from `fromMs` to `toMs`, the newest `most` of them, as
 * { pid, level, at, src, text }. A line of that log starts "[pid:MMDD/HHMMSS.mmm:LEVEL:file.cc:line] " (a
 * thread's number after the pid in some builds, microseconds on Linux); the year is the one of `toMs`.
 * What ANGLE says of a lost device is among them (the DXGI reason: 0x887A0006 the device hung, 0x887A0007
 * it was reset, 0x887A0020 the driver's own error).
 */
function chromiumLines(tail, fromMs, toMs, most = 16) {
  const year = new Date(toMs).getFullYear();
  const found = [];
  for (const line of String(tail || '').split(/\r?\n/)) {
    const m = /^\[(\d+):(?:\d+:)?(\d{2})(\d{2})\/(\d{2})(\d{2})(\d{2})\.(\d{3,6}):([A-Z]+\d*):([^\]]*)\]\s?(.*)$/.exec(line);
    if (!m) {
      // (a message of several lines: its first two are kept)
      const last = found[found.length - 1];
      if (last && last.more < 1 && line.trim()) {
        last.text = `${last.text} / ${line.trim()}`.slice(0, 300);
        last.more += 1;
      }
      continue;
    }
    const milli = Number(m[7].slice(0, 3));
    const time = new Date(year, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]), milli).getTime();
    if (time < fromMs || time > toMs) {
      // (and what follows a line out of the time asked for is not a line of one in it)
      found.push({ skip: true, more: 9 });
      continue;
    }
    found.push({ pid: Number(m[1]), level: m[8], at: `${m[4]}:${m[5]}:${m[6]}.${m[7].slice(0, 3)}`, src: m[9].replace(/^.*[\\/]/, ''), text: m[10].slice(0, 300), more: 0 });
  }
  return found
    .filter((line) => !line.skip)
    .slice(-most)
    .map(({ more: _more, ...line }) => line);
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

/** After a loss, what the system and Chromium wrote of it is read this long later (a crash dump takes a moment to be written). */
const AFTERMATH_MS = 1500;
/** How far back from a loss Windows' logs and Chromium's are read, and what the window saw is told. */
const EVENTS_BEFORE_MS = 120_000;
const CHROMIUM_BEFORE_MS = 10_000;
/** How many lines of Chromium's log are copied after a loss: the newest. */
const CHROMIUM_LINES = 24;
const SEEN_BEFORE_MS = 15_000;
const SEEN_KEPT = 24;
/** A line that is one long list (the GPU features, the return addresses of a crash) may be this long. */
const LONG_VALUE = 1600;

/**
 * The log of one run of the app. `io` is the world it works in:
 *   write(line), now() → Date, later(fn, ms) → a way to call it off,
 *   queue() → Promise of the server's answer ({ ok, body } | { ok: false, error }),
 *   memory() → Promise of nvidia-smi's answer ({ ok, text } | { ok: false, error }),
 *   features() → Chromium's GPU feature status,
 *   shot(name) → Promise of the file a picture of the window was saved as,
 * and, each of them optional (what is not there is not written down):
 *   info() → Promise of Chromium's GPU information (app.getGPUInfo('complete')),
 *   page() → Promise of the renderer a WebGL canvas of the game's page gets ('none' when it gets none),
 *   displays() → the screens, window() → { fullScreen, focused, … } of the game's window,
 *   gpuProcess() → { pid, workingSetMB, … } of the GPU process as last looked at,
 *   registry() → Promise of reg's answers by REGISTRY_KEYS' names,
 *   events(log, query) → Promise of wevtutil's answer ({ ok, text } | { ok: false, error }),
 *   chromium() → Promise of the end of Chromium's own log,
 *   dump(sinceMs) → Promise of the crash dump written since ({ file, summary } | null).
 * A loss (the GPU process gone, or a WebGL canvas of the page losing its context) is written down
 * as it comes; the first of a run of them also asks the server what it is making and how full the
 * graphics card's memory is, reads what Windows, Chromium and the crash dump say of it, and pictures
 * the window once the page's graphics are back (or did not come back).
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
  /** What the window and the screens were seen to do of late: [{ at, what }], the newest last. */
  let seen = [];
  const log = (event, fields, limit) => io.write(entry(io.now(), event, fields, limit));
  const sameFeatures = (now) => FEATURES.every((key) => features[key] === now[key]);
  const ms = () => io.now().getTime();
  const has = (name) => typeof io[name] === 'function';
  const why = (e) => String((e && e.message) || e).slice(0, 80);
  /** `io[name](…)` as a promise that never rejects: its answer, or { failed: why }. */
  const ask = (name, ...args) =>
    Promise.resolve()
      .then(() => io[name](...args))
      .catch((e) => ({ failed: why(e) }));

  /** How Chromium draws now: the renderer, the way to the screen, every GPU feature, the screens and the window. */
  const config = (when) => {
    const status = statusList(io.features());
    const screens = has('displays') ? displayList(io.displays()) : undefined;
    const win = has('window') ? io.window() : {};
    const proc = has('gpuProcess') ? io.gpuProcess() : {};
    const write = ([info, page]) => {
      // (webgl: what the page itself is given to draw with, should it differ from what the GPU process says it is)
      log('gpu-config', { when, ...configFields(info), webgl: typeof page === 'string' ? page : undefined, gpuPid: proc && proc.pid, why: info && info.failed }, 600);
      log('gpu-status', { when, status }, LONG_VALUE);
      if (screens) log('screens', { when, screens, ...win }, 400);
    };
    return Promise.all([has('info') ? ask('info') : null, has('page') ? ask('page') : null]).then(write);
  };

  /** What Windows' logs hold of the graphics drivers and of crashed programs up to now, a line an event. */
  const windowsEvents = () => {
    if (!has('events')) return Promise.resolve();
    const one = (name, logName, query, kind) =>
      ask('events', logName, query).then((answer) => {
        if (!answer || !answer.ok) {
          log(name, { why: (answer && (answer.error || answer.failed)) || 'no answer' });
          return;
        }
        const events = logEvents(answer.text);
        if (events.length === 0) log(name, { found: 'none', sinceMs: EVENTS_BEFORE_MS });
        for (const event of events) log(kind, event, 320);
      });
    return Promise.all([
      one('driver-events', 'System', driverEventQuery(EVENTS_BEFORE_MS), 'driver-event'),
      one('crash-events', 'Application', crashEventQuery(EVENTS_BEFORE_MS), 'crash-event'),
    ]);
  };

  /** What Chromium's own log holds from a little before the loss on: the GPU process's last words among it. */
  const chromiumLog = (since) => {
    if (!has('chromium')) return Promise.resolve();
    return ask('chromium').then((tail) => {
      if (tail && tail.failed) {
        log('chromium', { why: tail.failed });
        return;
      }
      // (the page's own console is not Chromium's word on the graphics: a page that talks much would crowd it out)
      const lines = chromiumLines(tail, since - CHROMIUM_BEFORE_MS, ms() + 1000, 400)
        .filter((line) => !/^CONSOLE/.test(line.src))
        .slice(-CHROMIUM_LINES);
      if (lines.length === 0) log('chromium', { found: 'none' });
      for (const line of lines) log('chromium', line, 320);
    });
  };

  /** Where the crashed process stopped, from the dump Crashpad wrote of it. */
  const crashDump = (since) => {
    if (!has('dump')) return Promise.resolve();
    return ask('dump', since - 2000).then((found) => {
      if (!found || found.failed || !found.summary) {
        log('crash-dump', found && found.failed ? { why: found.failed } : found && found.file ? { file: found.file, why: 'not read' } : { found: 'none' });
        return;
      }
      const { summary } = found;
      log('crash-dump', { file: found.file, code: summary.code, at: summary.at, ip: summary.ip, thread: summary.thread });
      if (summary.frames.length) log('crash-stack', { frames: summary.frames }, LONG_VALUE);
      for (const m of summary.modules) log('crash-module', m);
    });
  };

  const picture = () => {
    const { webgl } = incident;
    incident.picturing = true;
    features = featureFields(io.features());
    log('gpu-features', features);
    // (how it is drawn after the loss: by the same renderer, or by another Chromium fell back to)
    if (has('info')) void config('after-loss').catch(() => {});
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
    const at = ms();
    incident = { webgl, until: at + 2 * GIVE_UP_MS, off: null, picturing: false };
    arm(GIVE_UP_MS);
    // what the window and the screens did in the seconds before it (a screen changing its mode, the window losing the keyboard)
    const before = seen.filter((s) => at - s.at <= SEEN_BEFORE_MS).map((s) => `${s.at - at}ms ${s.what}`);
    if (has('window') || before.length) log('window', { ...(has('window') ? io.window() : {}), before }, 600);
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
    if (has('events') || has('chromium') || has('dump')) {
      io.later(() => {
        void Promise.all([chromiumLog(at), windowsEvents(), crashDump(at)]).catch(() => {});
      }, AFTERMATH_MS);
    }
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
    /** Any other line (the graphics mode picked, given up, come up). */
    note: (event, fields) => log(event, fields),
    /** How Chromium draws, as the run starts: gpu-config, gpu-status and screens lines; resolves when they are written. */
    config: () => config('start'),
    /** Windows' settings (registryFields), as the run starts. */
    windows() {
      if (!has('registry')) return Promise.resolve();
      return ask('registry').then((answers) => {
        const fields = answers && answers.failed ? { why: answers.failed } : registryFields(answers);
        // (none of them set: Windows' own defaults)
        log('windows', Object.values(fields).some((v) => v !== undefined) ? fields : { set: 'none' });
      });
    },
    /**
     * Something the window or a screen did (it lost the keyboard, went into full screen; a screen changed
     * its mode): kept for a while, and told with a loss that follows it. `write` for what is written down
     * at once as well (a screen changing: rare, and a sign of the driver's doing when no one asked).
     */
    seen(what, write = false) {
      const told = String(what).slice(0, 60);
      const last = seen[seen.length - 1];
      // (a window dragged tells of every step: one thing seen, at its latest)
      if (last && last.what === told && ms() - last.at < 1000) last.at = ms();
      else seen.push({ at: ms(), what: told });
      if (seen.length > SEEN_KEPT) seen = seen.slice(-SEEN_KEPT);
      if (write) log('screen', { what: String(what).slice(0, 160), screens: has('displays') ? displayList(io.displays()) : undefined }, 400);
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
      const gpu = details && details.type === 'GPU';
      // (the GPU process as it was last looked at: how much memory it held before it went)
      log('child-process-gone', { ...goneFields(details), ...(gpu && has('gpuProcess') ? io.gpuProcess() : {}) });
      // (a GPU process that ended as it should, one Chromium started to ask the card something, is no loss)
      if (gpu && details.reason !== 'clean-exit') lost('none');
    },
    renderGone: (details) => log('render-process-gone', goneFields(details)),
    page(raw) {
      const record = pageRecord(raw);
      if (!record || !pageMayWrite()) return;
      if (record.type === 'webglcontextlost') {
        lostAt = ms();
        log(record.type, { canvas: record.canvas, ...record.about });
        // what the page did in the seconds before (render/trail.ts): its frames, then what happened in them
        if (record.trail.trailFrames) log('page-frames', { frames: record.trail.trailFrames }, TRAIL_LENGTH);
        if (record.trail.trailEvents) log('page-events', { events: record.trail.trailEvents }, TRAIL_LENGTH);
        lost('lost');
      } else {
        log(record.type, { canvas: record.canvas, afterMs: lostAt === null ? undefined : ms() - lostAt, ...record.about });
        back();
      }
    },
  };
}

module.exports = {
  AFTERMATH_MS,
  FEATURES,
  GIVE_UP_MS,
  LOG_NAME,
  MAX_LOG_BYTES,
  PAGE_LINES_PER_MINUTE,
  QUIET_MS,
  REGISTRY_KEYS,
  SETTLE_MS,
  SHOTS_KEPT,
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
  pruneShots,
  queueFields,
  registryFields,
  shotName,
  staleShots,
  stamp,
  statusList,
};
