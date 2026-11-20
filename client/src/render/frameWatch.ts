/**
 * A play watched for the desktop app's log (graphics.log beside its other logs). A picture that stands still
 * while the song goes on leaves no other trace: no process ends, no WebGL context is lost.
 *
 * - The play says when each of its frames has run to its end (FrameWatch.done). A frame that comes STALL_MS or
 *   more after the one before, while the picture should move, is a stall: told to the app once the frames go
 *   on, with how long it was, how late the frame before it began and how long it worked, whether the page's
 *   own timers went on meanwhile, the long tasks of that time, and what the track did in the seconds before
 *   (trail.ts). They tell the causes apart: a frame that worked long was held up in the game's own drawing
 *   (which of its parts worked long is told with it: a part that only hands the picture to the graphics
 *   process waits there when that process does not take it); one that began late, or timers that stood still
 *   with the frames, mean the page's thread was busy with something else; timers that went on mean the page
 *   was free and its picture was held up on the way to the screen (the graphics card busy).
 * - Every half second, and when the play's state changes, the app is sent a pulse. The app's main process
 *   writes down a page whose pulse stops while a play runs: a picture that does not come back, which the
 *   page cannot tell of itself.
 * - The page's errors are told once each and counted: the uncaught ones, promises rejected with no one to
 *   hear, and those a part of a frame threw while the rest of the frame was drawn all the same (guard).
 * - When a play ends, one line of how its frames came while its picture moved (page-play): how many, how
 *   far apart (the middle, 95th and 99th in a hundred, the longest), how many came late by a frame or more
 *   (34, 50, 100 ms), and the video behind the play (a file, or YouTube with the stream it played). A play
 *   that judders without ever standing still (no stall) leaves its trace there.
 *
 * Nothing is told in a browser (there is no desktop window to tell), and nothing is drawn or measured on the
 * graphics card: a few numbers a frame.
 */
import type { Trail } from './trail';

/** The states of a play as its pulse tells them; its picture moves in 'running' and 'ending'. */
export type PlayPhase = 'running' | 'paused' | 'ending' | 'done';

/** A frame this long after the one before, in a play whose picture moves, is a stall (ms). */
export const STALL_MS = 250;
/** The app is sent a pulse this often while frames come (and at once when the play's state changes). */
export const PULSE_MS = 500;
/** The page's own timer, which goes on while only the picture is held up. */
const TICK_MS = 100;
/** Stalls that follow one told within this long are counted and told together with the next (ms). */
export const STALL_TOLD_EVERY_MS = 2000;
/** A play's line (page-play) is told when its picture moved this many frames at least. */
const PLAY_LINE_FRAMES = 120;
/** Frame gaps are counted to the millisecond up to this (ms); longer ones in the last count. */
const GAP_KEPT_MS = 400;
/** The gaps a play's line counts (ms): a frame late by one or more at 60 Hz, three, six. */
const LATE_MS = [34, 50, 100] as const;

/** How many different errors are told in a run of the page, and how much of each. */
const ERRORS_KEPT = 40;
const STACK_FRAMES = 8;
/** An error that goes on is told again with its count at ten, a hundred, … and this long after it was last told. */
const ERROR_AGAIN_MS = 10_000;

/** What the app is told (desktop/preload.js: tellGraphics → graphics.log; every value a text). */
export interface GraphicsRecord {
  type: 'page-stall' | 'page-error' | 'page-play';
  canvas?: string;
  about: Record<string, string>;
}

/** The world a watch works in: the page's clock and timers, and the desktop window to tell. */
export interface WatchIo {
  now(): number;
  tell(record: GraphicsRecord): void;
  pulse(record: { state: PlayPhase | 'off'; songMs?: number }): void;
  /** Calls `fn` every `ms`; returns the way to stop. */
  every(ms: number, fn: () => void): () => void;
  /** The long tasks of the page between two times: how many, and the longest (ms). */
  longTasks?(from: number, to: number): { n: number; max: number };
  /** The page as it is: shown or hidden, with the keyboard or not, how much memory its scripts hold. */
  page?(): { visible: string; focus: boolean; heapMB?: number };
  /** The video behind the play: none, a file, or YouTube (with the stream it plays and its cap). */
  background?(): Record<string, string>;
}

interface Shell {
  tellGraphics(record: GraphicsRecord): void;
  pulse(record: { state: string; songMs?: number }): void;
}

/** The desktop app's window where it takes these (null in a browser, and in an app older than them). */
function shell(): Shell | null {
  if (typeof window === 'undefined') return null;
  const s = (window as unknown as { grgDesktop?: Partial<Shell> }).grgDesktop;
  return s && typeof s.tellGraphics === 'function' && typeof s.pulse === 'function' ? (s as Shell) : null;
}

// ---------- the page's long tasks ----------

const TASKS_KEPT = 48;
const tasks: { start: number; ms: number }[] = [];
let tasksWatched = false;

/** Keeps the page's long tasks (Chromium tells of every task of 50 ms or more) for the stalls' lines. */
function watchLongTasks(): void {
  if (tasksWatched || typeof PerformanceObserver === 'undefined') return;
  tasksWatched = true;
  try {
    if (!PerformanceObserver.supportedEntryTypes?.includes('longtask')) return;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) tasks.push({ start: entry.startTime, ms: entry.duration });
      if (tasks.length > TASKS_KEPT) tasks.splice(0, tasks.length - TASKS_KEPT);
    }).observe({ entryTypes: ['longtask'] });
  } catch {
    // a browser without them: the stalls are told without
  }
}

function longTasksBetween(from: number, to: number): { n: number; max: number } {
  const hit = tasks.filter((t) => t.start + t.ms >= from && t.start <= to);
  return { n: hit.length, max: hit.reduce((max, t) => Math.max(max, t.ms), 0) };
}

/** The watch's world on the desktop app (null in a browser: nothing is watched). */
export function desktopIo(): WatchIo | null {
  const s = shell();
  if (!s) return null;
  watchLongTasks();
  return {
    now: () => performance.now(),
    tell: (record) => s.tellGraphics(record),
    pulse: (record) => s.pulse(record),
    every(ms, fn) {
      const timer = window.setInterval(fn, ms);
      return () => window.clearInterval(timer);
    },
    longTasks: longTasksBetween,
    page() {
      const heap = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize;
      return { visible: document.visibilityState, focus: document.hasFocus(), heapMB: heap ? Math.round(heap / 1048576) : undefined };
    },
    background() {
      // (ui/PlayBackground's elements; ui/youtubeBga.ts writes the stream YouTube plays and the cap on its own)
      const youtube = document.querySelector<HTMLElement>('.play-bg .bg-youtube');
      if (youtube) return { bga: 'youtube', ...(youtube.dataset.quality ? { bgaStream: youtube.dataset.quality } : {}), ...(youtube.dataset.cap ? { bgaCap: youtube.dataset.cap } : {}) };
      const video = document.querySelector<HTMLVideoElement>('.play-bg .bg-video');
      if (video) return { bga: 'file', ...(video.videoHeight ? { bgaStream: `${video.videoWidth}x${video.videoHeight}` } : {}) };
      return { bga: 'none' };
    },
  };
}

// ---------- the page's errors ----------

interface Told {
  id: number;
  count: number;
  toldAt: number;
}

const errors = new Map<string, Told>();
let errorsDropped = false;
/** Where the errors are told: the desktop window's, unless a test has put its own. */
let errorSink: { tell(record: GraphicsRecord): void; now(): number } | null | undefined;

function sink(): { tell(record: GraphicsRecord): void; now(): number } | null {
  if (errorSink !== undefined) return errorSink;
  const s = shell();
  return s ? { tell: (record) => s.tellGraphics(record), now: () => performance.now() } : null;
}

/** For tests: where the errors go (null: nowhere), and the errors told so far forgotten. */
export function setErrorSink(to: { tell(record: GraphicsRecord): void; now(): number } | null | undefined): void {
  errorSink = to;
  errors.clear();
  errorsDropped = false;
}

const pageOrigin = () => (typeof location === 'undefined' ? '' : location.origin);

/** A script's address without the page's own ("assets/index-abc.js") and without what follows a question mark. */
function scriptName(url: string, origin: string): string {
  return (origin && url.startsWith(origin) ? url.slice(origin.length) : url).replace(/^\/+/, '').replace(/\?.*$/, '');
}

/** A stack as a line: "drawNotes@assets/index-abc.js:1:4022 < render@…", the page's own address left out. */
export function compactStack(stack: string | undefined, origin = pageOrigin()): string {
  if (!stack) return '';
  const frames: string[] = [];
  for (const line of stack.split('\n')) {
    // V8: "    at name (url:line:col)" or "    at url:line:col"; others: "name@url:line:col"
    const m = /^\s*at (?:(.*?) \()?(.*?):(\d+):(\d+)\)?$/.exec(line) ?? /^(.*?)@(.*?):(\d+):(\d+)$/.exec(line);
    if (!m) continue;
    frames.push(`${(m[1] ?? '').replace(/^(async |new )/, '') || '?'}@${scriptName(m[2], origin)}:${m[3]}:${m[4]}`);
    if (frames.length >= STACK_FRAMES) break;
  }
  return frames.join(' < ');
}

function describe(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: compactStack(error.stack) };
  let message: string;
  try {
    message = typeof error === 'string' ? error : JSON.stringify(error) ?? String(error);
  } catch {
    message = String(error);
  }
  return { message, stack: '' };
}

/**
 * An error of the page, for the app's log: told the first time with its message and where it was thrown
 * from, then counted; one that goes on is told again with its count at ten, a hundred, … and every ten
 * seconds. `where`: the part of the game it was caught in ("frame:hud", "track:notes"), 'window' for an
 * uncaught one, 'promise' for a rejection no one heard; `at`: where the browser says it happened.
 */
export function reportError(where: string, error: unknown, at?: string): void {
  const to = sink();
  const { message, stack } = describe(error);
  const key = `${where}|${message}|${stack.split(' < ', 1)[0]}`;
  const told = errors.get(key);
  if (told) {
    told.count += 1;
    if (!to) return;
    const now = to.now();
    const round = /^10+$/.test(String(told.count));
    if (!round && now - told.toldAt < ERROR_AGAIN_MS) return;
    told.toldAt = now;
    to.tell({ type: 'page-error', about: { id: String(told.id), count: String(told.count), where, message: message.slice(0, 80) } });
    return;
  }
  // a part of a frame that was caught goes on unseen otherwise: said on the console once
  if (where !== 'window' && where !== 'promise') console.error(`[${where}]`, error);
  if (errors.size >= ERRORS_KEPT) {
    if (!errorsDropped && to) to.tell({ type: 'page-error', about: { dropped: `more than ${ERRORS_KEPT} different errors` } });
    errorsDropped = true;
    return;
  }
  const id = errors.size + 1;
  errors.set(key, { id, count: 1, toldAt: to ? to.now() : 0 });
  to?.tell({ type: 'page-error', about: { id: String(id), count: '1', where, message, ...(at ? { at } : {}), ...(stack ? { stack } : {}) } });
}

// ---------- how long the parts of a frame worked ----------

/** A part of a frame that worked this long is kept for the line of a stall that follows the frame (ms). */
const PART_MS = 20;
const PARTS_KEPT = 16;
const PARTS_TOLD = 4;
let parts: { where: string; ms: number }[] = [];

/** A part of the frame being worked on took `ms` ("track:draw"); only the long ones are kept. */
export function notePart(where: string, ms: number): void {
  if (ms >= PART_MS && parts.length < PARTS_KEPT) parts.push({ where, ms });
}

/** The long parts of the frame that has just ended, the longest first ("frame:track=812 track:draw=805"), and none kept any more. */
function takeParts(): string {
  if (parts.length === 0) return '';
  const told = parts
    .sort((a, b) => b.ms - a.ms)
    .slice(0, PARTS_TOLD)
    .map((p) => `${p.where}=${Math.round(p.ms)}`)
    .join(' ');
  parts = [];
  return told;
}

/**
 * Runs a part of a frame: should it throw, the error is told (reportError) and the frame goes on with its
 * other parts, so that one part gone wrong does not hold the whole picture still. How long it worked is
 * kept for a stall's line (notePart).
 */
export function guard(where: string, run: () => void): void {
  const from = performance.now();
  try {
    run();
  } catch (error) {
    reportError(where, error);
  }
  notePart(where, performance.now() - from);
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    // (a picture or a script that did not load is an event of its element, not of the window)
    if (event.target !== window) return;
    reportError('window', event.error ?? event.message, event.filename ? `${scriptName(event.filename, pageOrigin())}:${event.lineno}:${event.colno}` : undefined);
  });
  window.addEventListener('unhandledrejection', (event) => reportError('promise', event.reason));
}

// ---------- a play's frames ----------

const moves = (state: PlayPhase | 'off') => state === 'running' || state === 'ending';

export class FrameWatch {
  /** The frame before: its time (its timestamp), when its work began and was done, and the play's state then. */
  private lastAt = -1;
  private lastStart = 0;
  private lastEnd = 0;
  private lastState: PlayPhase | 'off' = 'off';
  private pulseAt = -Infinity;
  private pulseState: PlayPhase | 'off' = 'off';
  /** The page's timer since the last frame: when it last ran (or the frame ended), its longest wait, how often it ran. */
  private tickAt = 0;
  private tickGap = 0;
  private ticks = 0;
  private stopTicks: (() => void) | null = null;
  /** The stalls not told yet (they followed one that was): how many, their sum and the longest (ms). */
  private held = { n: 0, ms: 0, longest: 0 };
  private stallToldAt = -Infinity;
  private frames = 0;
  /** The play's frame gaps while its picture moved, counted by the millisecond (for its line, page-play). */
  private readonly gaps = new Uint32Array(GAP_KEPT_MS + 1);
  private moved = 0;
  private movedMs = 0;
  private longestGap = 0;
  private background: Record<string, string> = {};
  /** The long parts of the frame before (takeParts). */
  private lastParts = '';

  constructor(
    private readonly trail: Trail,
    private readonly io: WatchIo | null = desktopIo(),
  ) {
    // (what another track's frames left: a preview's, which no play's frame followed)
    takeParts();
  }

  /**
   * A frame of the play has run to its end: `frameAt` its timestamp (the frame's time), `state` the play's,
   * `songMs` the song's time drawn, `about` what else is told with a stall (the skin, what the renderer holds),
   * `startedAt` when the play began to work on it (the page's clock: later than the frame's time when
   * something else held the page's thread first).
   */
  done(frameAt: number, state: PlayPhase, songMs: number, about?: () => Record<string, string>, startedAt = frameAt): void {
    const io = this.io;
    const worked = takeParts();
    if (!io) return;
    const now = io.now();
    this.frames += 1;
    // (the app asks for it when the pulse has stopped: desktop/main.js's pageProbe)
    (globalThis as { __grgFrames?: number }).__grgFrames = this.frames;
    if (!this.stopTicks) this.stopTicks = io.every(TICK_MS, this.tick);
    // the pulse first: the app's word on a page that was hung comes before the page's own on the stall
    if (state !== this.pulseState || now - this.pulseAt >= PULSE_MS) {
      this.pulseAt = now;
      this.pulseState = state;
      io.pulse({ state, songMs: Math.round(songMs) });
      // what is behind the play, kept as it is while it plays (the background may go before the play's end)
      if (moves(state)) this.background = io.background?.() ?? {};
    }
    const gap = this.lastAt >= 0 ? frameAt - this.lastAt : 0;
    if (moves(this.lastState) && moves(state) && gap > 0) {
      this.gaps[Math.min(GAP_KEPT_MS, Math.round(gap))] += 1;
      this.moved += 1;
      this.movedMs += gap;
      this.longestGap = Math.max(this.longestGap, gap);
    }
    if (moves(this.lastState) && gap >= STALL_MS) {
      if (now - this.stallToldAt < STALL_TOLD_EVERY_MS) {
        this.held = { n: this.held.n + 1, ms: this.held.ms + gap, longest: Math.max(this.held.longest, gap) };
      } else {
        this.tellStall(io, gap, frameAt, now, songMs, about);
      }
    } else if (this.held.n > 0 && now - this.stallToldAt >= STALL_TOLD_EVERY_MS) {
      this.tellHeld(io, now);
    }
    this.lastAt = frameAt;
    this.lastStart = Math.max(frameAt, Math.min(startedAt, now));
    this.lastEnd = now;
    this.lastState = state;
    this.lastParts = worked;
    this.tickAt = now;
    this.tickGap = 0;
    this.ticks = 0;
  }

  /** The play is over (its renderer let go): no pulse is owed any more. */
  stop(): void {
    const io = this.io;
    if (!io) return;
    this.stopTicks?.();
    this.stopTicks = null;
    if (this.moved >= PLAY_LINE_FRAMES) this.tellPlay(io);
    if (this.held.n > 0) this.tellHeld(io, io.now());
    this.gaps.fill(0);
    this.moved = 0;
    this.movedMs = 0;
    this.longestGap = 0;
    if (this.pulseState !== 'off') io.pulse({ state: 'off' });
    this.pulseState = 'off';
    this.lastState = 'off';
    this.lastAt = -1;
  }

  private readonly tick = (): void => {
    const now = this.io!.now();
    this.tickGap = Math.max(this.tickGap, now - this.tickAt);
    this.tickAt = now;
    this.ticks += 1;
  };

  private tellStall(io: WatchIo, gap: number, frameAt: number, now: number, songMs: number, about?: () => Record<string, string>): void {
    this.stallToldAt = now;
    const ms = (v: number) => String(Math.round(v));
    const long = io.longTasks?.(this.lastAt, frameAt);
    const page = io.page?.();
    const more = this.held;
    this.held = { n: 0, ms: 0, longest: 0 };
    io.tell({
      type: 'page-stall',
      canvas: 'play-canvas',
      about: {
        gapMs: ms(gap),
        // the frame before it: how late its work began (something else held the page's thread first) and how
        // long it worked (long, and the stall was in the game's own drawing)
        lateMs: ms(this.lastStart - this.lastAt),
        workMs: ms(this.lastEnd - this.lastStart),
        // and which of its parts worked long (20 ms or more), the longest first
        ...(this.lastParts ? { slow: this.lastParts } : {}),
        // the longest wait of the page's own timer in the stall, and how often it ran: about TICK_MS and many, and the page was free
        timerMs: ms(Math.max(this.tickGap, frameAt - this.tickAt)),
        ticks: String(this.ticks),
        ...(long && long.n > 0 ? { longTask: `n=${long.n} max=${ms(long.max)}` } : {}),
        state: this.lastState,
        songMs: ms(songMs),
        ...(page ? { visible: page.visible, focus: page.focus ? 'yes' : 'no', ...(page.heapMB ? { heapMB: String(page.heapMB) } : {}) } : {}),
        ...(more.n > 0 ? { more: String(more.n), moreMs: ms(more.ms), moreLongest: ms(more.longest) } : {}),
        ...(about ? about() : {}),
        // the frames up to the stall, and what happened from three seconds before it on (what the frame it ended with did is among it)
        trailFrames: this.trail.frames(this.lastAt, this.lastAt),
        trailEvents: this.trail.told(this.lastAt),
      },
    });
  }

  /** How the play's frames came while its picture moved, and what was behind it: one line as it ends. */
  private tellPlay(io: WatchIo): void {
    const at = (share: number): number => {
      const want = Math.ceil(share * this.moved);
      let seen = 0;
      for (let ms = 0; ms <= GAP_KEPT_MS; ms++) {
        seen += this.gaps[ms];
        if (seen >= want) return ms;
      }
      return GAP_KEPT_MS;
    };
    const late = (from: number): number => {
      let n = 0;
      for (let ms = from; ms <= GAP_KEPT_MS; ms++) n += this.gaps[ms];
      return n;
    };
    io.tell({
      type: 'page-play',
      canvas: 'play-canvas',
      about: {
        frames: String(this.moved),
        seconds: String(Math.round(this.movedMs / 1000)),
        // the gap between frames: the middle one is the screen's own (17 ms at 60 Hz); the 99th tells a judder
        gapMs: `p50=${at(0.5)} p95=${at(0.95)} p99=${at(0.99)} max=${Math.round(this.longestGap)}`,
        late: LATE_MS.map((ms) => `${ms}=${late(ms)}`).join(' '),
        ...this.background,
      },
    });
  }

  /** The stalls that followed one told, as a line of their own: how many, their sum, the longest. */
  private tellHeld(io: WatchIo, now: number): void {
    const more = this.held;
    this.held = { n: 0, ms: 0, longest: 0 };
    this.stallToldAt = now;
    const ms = (v: number) => String(Math.round(v));
    io.tell({ type: 'page-stall', canvas: 'play-canvas', about: { more: String(more.n), moreMs: ms(more.ms), moreLongest: ms(more.longest), state: this.lastState } });
  }
}
