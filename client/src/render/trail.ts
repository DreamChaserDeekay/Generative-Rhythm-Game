/**
 * What the track did in its last few seconds, kept so that a loss of its graphics can be told from what led to
 * it. A player's GPU process goes in the same places of a song: something the game does there (a camera move, the
 * FEVER coming on, a picture painted again, a shader built) or nothing at all (the driver's own doing). The
 * renderer notes its frames and what changes in them here, a few numbers a frame; when the canvas loses its
 * context the lot is put on the canvas as two lines of text (data-trail-frames, data-trail-events), which the
 * desktop app writes into graphics.log with the loss (desktop/preload.js, graphicsLog.js). Nothing is drawn, and
 * nothing leaves the page while the graphics hold.
 */

/** How far back the trail is told. */
export const TRAIL_MS = 3000;
/** The frames kept (3 s at 240 a second is 720) and the things that happened. */
const FRAMES_KEPT = 1024;
const EVENTS_KEPT = 96;
/** A frame is told as long when it took this many times the usual one, and this much longer (ms). */
const LONG_TIMES = 1.6;
const LONG_MORE_MS = 4;
/** How many long frames and how many of the last frames are told, and how long the events' text may get. */
const LONG_TOLD = 24;
const LAST_TOLD = 40;
const EVENTS_TEXT = 1500;
/** The same thing noted again within this long counts up the note before it (ms). */
const SAME_WITHIN_MS = 250;

interface TrailEvent {
  at: number;
  what: string;
  times: number;
}

const round1 = (ms: number) => String(Math.round(ms * 10) / 10);

export class Trail {
  private readonly times = new Float64Array(FRAMES_KEPT);
  private head = 0;
  private count = 0;
  private events: TrailEvent[] = [];
  private readonly watched = new Map<string, string>();
  private readonly levels = new Map<string, number>();
  private readonly sampled = new Map<string, { at: number; text: string }>();
  private readonly counts = new Map<string, number[]>();

  /** A frame drawn at `at` (ms on the page's clock: performance.now, a frame's timestamp). */
  frame(at: number): void {
    this.times[this.head] = at;
    this.head = (this.head + 1) % FRAMES_KEPT;
    if (this.count < FRAMES_KEPT) this.count += 1;
  }

  /** Something happened: a word or two ("deck:paint"). Noted again at once, it is counted on the note before. */
  note(what: string, at: number = performance.now()): void {
    const last = this.events[this.events.length - 1];
    if (last && last.what === what && at - last.at < SAME_WITHIN_MS) {
      last.times += 1;
      last.at = at;
      return;
    }
    this.events.push({ at, what, times: 1 });
    if (this.events.length > EVENTS_KEPT) this.events.splice(0, this.events.length - EVENTS_KEPT);
  }

  /** A value as it is now: noted when it is another than it was ("tex:41>42"); the first is only kept. */
  watch(name: string, value: string | number, at?: number): void {
    const now = String(value);
    const was = this.watched.get(name);
    if (was === now) return;
    this.watched.set(name, now);
    if (was !== undefined) this.note(`${name}:${was}>${now}`, at);
  }

  /**
   * A number that moves all the time (the draw calls of a frame): noted when it has left the band about the
   * value last noted (half as much again, or two thirds), not on every step.
   */
  level(name: string, value: number, at?: number): void {
    const was = this.levels.get(name);
    if (was === undefined) {
      this.levels.set(name, value);
      return;
    }
    if (value <= was * 1.5 && value >= was / 1.5) return;
    this.levels.set(name, value);
    this.note(`${name}:${was}>${value}`, at);
  }

  /** A text told while something goes on (the camera's pose in a move): noted at most every `everyMs`, when it is another. */
  sample(name: string, text: string, everyMs: number, at: number = performance.now()): void {
    const was = this.sampled.get(name);
    if (was && (was.text === text || at - was.at < everyMs)) return;
    this.sampled.set(name, { at, text });
    this.note(`${name} ${text}`, at);
  }

  /** One more of something too frequent to note each (a hit effect begun): told as how many in the time told. */
  tally(name: string, at: number = performance.now()): void {
    let times = this.counts.get(name);
    if (!times) this.counts.set(name, (times = []));
    times.push(at);
    if (times.length > 512) times.splice(0, times.length - 512);
  }

  /**
   * The frames of the last TRAIL_MS before `now`, as a line: how many, the usual one's length and the longest
   * (ms), how long ago the last one was drawn, the long ones ("-2104:41.7": 2104 ms ago, 41.7 ms long), the
   * lengths of the last few (the newest last), and how many of each thing tallied.
   */
  frames(now: number = performance.now()): string {
    const intervals: { at: number; ms: number }[] = [];
    let previous: number | null = null;
    let lastAt: number | null = null;
    for (let i = 0; i < this.count; i++) {
      const at = this.times[(this.head - this.count + i + FRAMES_KEPT * 2) % FRAMES_KEPT];
      if (previous !== null && now - at <= TRAIL_MS) intervals.push({ at, ms: at - previous });
      previous = at;
      lastAt = at;
    }
    const parts: string[] = [`n=${intervals.length}`];
    if (intervals.length > 0) {
      const sorted = intervals.map((f) => f.ms).sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      parts.push(`med=${round1(median)}`, `max=${round1(sorted[sorted.length - 1])}`);
      const long = intervals.filter((f) => f.ms >= median * LONG_TIMES && f.ms >= median + LONG_MORE_MS).slice(-LONG_TOLD);
      if (long.length > 0) parts.push(`long=${long.map((f) => `${Math.round(f.at - now)}:${round1(f.ms)}`).join(',')}`);
      parts.push(`last=${intervals.slice(-LAST_TOLD).map((f) => round1(f.ms)).join(',')}`);
    }
    if (lastAt !== null) parts.push(`ago=${round1(now - lastAt)}`);
    for (const [name, times] of this.counts) {
      const n = times.filter((at) => now - at <= TRAIL_MS).length;
      if (n > 0) parts.push(`${name}=${n}`);
    }
    return parts.join(' ');
  }

  /**
   * What happened in the last TRAIL_MS before `now`, as a line: "-2100 fever:0>2; -35 tex:41>42" (ms before
   * `now`, then the note; "x3" after one noted three times running). The oldest give way when the line gets long.
   */
  told(now: number = performance.now()): string {
    const recent = this.events.filter((e) => now - e.at <= TRAIL_MS).map((e) => `${Math.round(e.at - now)} ${e.what}${e.times > 1 ? ` x${e.times}` : ''}`);
    let text = recent.join('; ');
    while (text.length > EVENTS_TEXT && recent.length > 1) {
      recent.shift();
      text = `…; ${recent.join('; ')}`;
    }
    return text;
  }
}

/** The trail of the track being played (the one built last): what is not the renderer's own notes its part here. */
let active: Trail | null = null;

export function setActiveTrail(trail: Trail | null): void {
  active = trail;
}

export function activeTrail(): Trail | null {
  return active;
}

/** A note on the track's trail from outside the renderer (the HUD); nothing while no track is up. */
export function noteTrail(what: string): void {
  active?.note(what);
}
