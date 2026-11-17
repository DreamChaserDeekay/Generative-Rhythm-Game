import { afterEach, describe, expect, it, vi } from 'vitest';
import { compactStack, FrameWatch, guard, PULSE_MS, reportError, setErrorSink, STALL_MS, STALL_TOLD_EVERY_MS, type GraphicsRecord, type WatchIo } from './frameWatch';
import { Trail } from './trail';

/** A world for the watch: a clock moved by hand, what was told and the pulses sent, the page's timer run by hand. */
function world() {
  const w = {
    t: 1000,
    told: [] as GraphicsRecord[],
    pulses: [] as { state: string; songMs?: number }[],
    timers: [] as (() => void)[],
    stopped: 0,
    long: { n: 0, max: 0 },
    io: null as unknown as WatchIo,
    /** The page's timer runs `times`, TICK_MS apart. */
    tick(times: number, every = 100) {
      for (let i = 0; i < times; i++) {
        w.t += every;
        for (const fn of w.timers) fn();
      }
    },
  };
  w.io = {
    now: () => w.t,
    tell: (record) => void w.told.push(record),
    pulse: (record) => void w.pulses.push(record),
    every: (_ms, fn) => {
      w.timers.push(fn);
      return () => {
        w.stopped += 1;
        w.timers.splice(w.timers.indexOf(fn), 1);
      };
    },
    longTasks: () => w.long,
    page: () => ({ visible: 'visible', focus: true, heapMB: 88 }),
  };
  return w;
}

/** Frames of a play, 7 ms apart, each done a millisecond after it began: `n` of them from the world's time on. */
function run(w: ReturnType<typeof world>, watch: FrameWatch, trail: Trail, n: number, state: 'running' | 'paused' | 'ending' | 'done' = 'running') {
  for (let i = 0; i < n; i++) {
    const at = w.t;
    trail.frame(at);
    w.t += 1;
    watch.done(at, state, 60_000 + at, () => ({ style: 'flat solid bar piano flash' }));
    w.t += 6;
  }
}

describe('a play’s frames watched for the desktop app’s log', () => {
  it('sends a pulse every half second while frames come, at once when the play’s state changes, and "off" when the play is over', () => {
    const w = world();
    const trail = new Trail();
    const watch = new FrameWatch(trail, w.io);
    run(w, watch, trail, 1);
    expect(w.pulses).toEqual([{ state: 'running', songMs: 61000 }]);
    // 7 ms a frame: the next pulse half a second on
    run(w, watch, trail, Math.ceil(PULSE_MS / 7) - 1);
    expect(w.pulses).toHaveLength(1);
    run(w, watch, trail, 2);
    expect(w.pulses).toHaveLength(2);
    run(w, watch, trail, 1, 'paused');
    expect(w.pulses.at(-1)).toMatchObject({ state: 'paused' });
    run(w, watch, trail, 1, 'running');
    run(w, watch, trail, 1, 'ending');
    run(w, watch, trail, 1, 'done');
    expect(w.pulses.slice(-3).map((p) => p.state)).toEqual(['running', 'ending', 'done']);
    watch.stop();
    expect(w.pulses.at(-1)).toEqual({ state: 'off' });
    expect(w.stopped).toBe(1);
    // nothing was a stall
    expect(w.told).toEqual([]);
    // the frames drawn are counted where the app can ask for them
    expect((globalThis as { __grgFrames?: number }).__grgFrames).toBeGreaterThan(70);
  });

  it('tells of a stall once the frames go on: its length, the frame before it, the page’s timer meanwhile, and the frames before', () => {
    const w = world();
    const trail = new Trail();
    const watch = new FrameWatch(trail, w.io);
    run(w, watch, trail, 200);
    // (the last frame began 7 ms ago: what is told is counted from there)
    trail.note('deck:paint', w.t - 2000);
    // the picture held up for three seconds while the page was free: its timer went on
    w.tick(30);
    w.t += 6;
    trail.note('recovered', w.t);
    w.long = { n: 0, max: 0 };
    run(w, watch, trail, 1);
    expect(w.told).toHaveLength(1);
    const [stall] = w.told;
    expect(stall.type).toBe('page-stall');
    expect(stall.canvas).toBe('play-canvas');
    expect(stall.about).toMatchObject({ gapMs: '3013', lateMs: '0', workMs: '1', timerMs: '106', ticks: '30', state: 'running', visible: 'visible', focus: 'yes', heapMB: '88', style: 'flat solid bar piano flash' });
    expect(stall.about.longTask).toBeUndefined();
    // the frames up to the stall (the one that ended it is not among them), and what happened: before it and with its end
    expect(stall.about.trailFrames).toMatch(/^n=\d+ med=7 max=7 last=7(,7)* ago=0$/);
    expect(stall.about.trailEvents).toBe('-1993 deck:paint; +3013 recovered');
    // every value is a text (the app writes down nothing else)
    expect(Object.values(stall.about).every((v) => typeof v === 'string')).toBe(true);
  });

  it('tells the kinds of stall apart: the game’s own frame that worked long, the page’s thread busy elsewhere (before a frame’s time or after it), the picture held up', () => {
    // the frame before worked two seconds
    const a = world();
    const ta = new Trail();
    const wa = new FrameWatch(ta, a.io);
    run(a, wa, ta, 10);
    const at = a.t;
    ta.frame(at);
    a.t += 2000;
    wa.done(at, 'running', 1, undefined);
    a.t += 5;
    run(a, wa, ta, 1);
    expect(a.told[0].about).toMatchObject({ gapMs: '2005', lateMs: '0', workMs: '2000', timerMs: '5', ticks: '0' });
    // the page's thread was busy with something else: no timer ran, and the browser says what took it
    const b = world();
    const tb = new Trail();
    const wb = new FrameWatch(tb, b.io);
    run(b, wb, tb, 10);
    b.t += 1800;
    b.long = { n: 1, max: 1795.4 };
    run(b, wb, tb, 1);
    expect(b.told[0].about).toMatchObject({ gapMs: '1807', lateMs: '0', workMs: '1', timerMs: '1806', ticks: '0', longTask: 'n=1 max=1795' });
    // … or it was held after a frame's time was set and before the play got to work on it: that frame began late
    // (its own work was short), and the one after it comes as much later
    const c = world();
    const tc = new Trail();
    const wc = new FrameWatch(tc, c.io);
    run(c, wc, tc, 10);
    const time = c.t;
    tc.frame(time);
    c.t += 900;
    const began = c.t;
    c.t += 2;
    wc.done(time, 'running', 1, undefined, began);
    expect(c.told).toEqual([]);
    c.t += 5;
    c.long = { n: 1, max: 898 };
    run(c, wc, tc, 1);
    expect(c.told[0].about).toMatchObject({ gapMs: '907', lateMs: '900', workMs: '2', timerMs: '5', ticks: '0', longTask: 'n=1 max=898' });
  });

  it('counts only where the picture should move, and from STALL_MS on', () => {
    const w = world();
    const trail = new Trail();
    const watch = new FrameWatch(trail, w.io);
    run(w, watch, trail, 5);
    w.t += STALL_MS - 8;
    run(w, watch, trail, 1);
    expect(w.told).toEqual([]);
    // paused: the picture stands still as it should (a paused play draws no frame of the track)
    run(w, watch, trail, 1, 'paused');
    w.t += 5000;
    run(w, watch, trail, 1, 'paused');
    run(w, watch, trail, 1, 'running');
    expect(w.told).toEqual([]);
    // an ending play's picture moves
    run(w, watch, trail, 1, 'ending');
    w.t += STALL_MS;
    run(w, watch, trail, 1, 'done');
    expect(w.told.map((r) => r.about.state)).toEqual(['ending']);
    // over: a new play's first frame has none before it
    watch.stop();
    w.t += 9000;
    run(w, watch, trail, 2);
    expect(w.told).toHaveLength(1);
  });

  it('tells stalls that follow one another closely together: the first at once, the rest as a count with the next line', () => {
    const w = world();
    const trail = new Trail();
    const watch = new FrameWatch(trail, w.io);
    run(w, watch, trail, 5);
    for (let i = 0; i < 4; i++) {
      w.t += 300;
      run(w, watch, trail, 2);
    }
    expect(w.told).toHaveLength(1);
    // once the time is over, the ones held are a line of their own
    run(w, watch, trail, Math.ceil(STALL_TOLD_EVERY_MS / 7));
    expect(w.told).toHaveLength(2);
    expect(w.told[1].about).toEqual({ more: '3', moreMs: '921', moreLongest: '307', state: 'running' });
    // or they go with the next stall told (a line every two seconds at the most, whatever it is of)
    w.t += 400;
    run(w, watch, trail, 2);
    w.t += 500;
    run(w, watch, trail, 2);
    expect(w.told).toHaveLength(2);
    w.t += STALL_TOLD_EVERY_MS;
    run(w, watch, trail, 1);
    expect(w.told).toHaveLength(3);
    expect(w.told[2].about).toMatchObject({ gapMs: '2007', more: '2', moreMs: '914', moreLongest: '507' });
    // and what is still held when the play ends is told then
    w.t += 600;
    run(w, watch, trail, 2);
    watch.stop();
    expect(w.told.at(-1)!.about).toEqual({ more: '1', moreMs: '607', moreLongest: '607', state: 'running' });
  });

  it('does nothing where there is no desktop window to tell (a browser)', () => {
    const trail = new Trail();
    const watch = new FrameWatch(trail, null);
    expect(() => {
      watch.done(0, 'running', 0);
      watch.done(9000, 'running', 9000);
      watch.stop();
    }).not.toThrow();
  });
});

describe('the page’s errors for the desktop app’s log', () => {
  afterEach(() => setErrorSink(undefined));

  const sink = () => {
    const s = { t: 0, told: [] as GraphicsRecord[], tell: (r: GraphicsRecord) => void s.told.push(r), now: () => s.t };
    setErrorSink(s);
    return s;
  };

  it('a stack as one line, the page’s own address left out', () => {
    const v8 = ['TypeError: x is undefined', '    at drawNotes (http://127.0.0.1:53211/assets/index-abc.js:1:4022)', '    at async TrackRenderer.render (http://127.0.0.1:53211/assets/index-abc.js?v=2:1:5120)', '    at http://127.0.0.1:53211/assets/index-abc.js:1:9001', '    at new Hud (https://other.example/x.js:3:4)'].join('\n');
    expect(compactStack(v8, 'http://127.0.0.1:53211')).toBe('drawNotes@assets/index-abc.js:1:4022 < TrackRenderer.render@assets/index-abc.js:1:5120 < ?@assets/index-abc.js:1:9001 < Hud@https://other.example/x.js:3:4');
    expect(compactStack('drawNotes@http://h/a.js:1:2\n@http://h/a.js:3:4', 'http://h')).toBe('drawNotes@a.js:1:2 < ?@a.js:3:4');
    expect(compactStack(undefined)).toBe('');
    // no more than eight places
    expect(compactStack(Array.from({ length: 30 }, (_, i) => `    at f${i} (http://h/a.js:1:${i})`).join('\n'), 'http://h').split(' < ')).toHaveLength(8);
  });

  it('tells an error once with its message and where it was thrown from, then counts it: again at ten, a hundred, and every ten seconds', () => {
    const s = sink();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const boom = new TypeError("Cannot read properties of undefined (reading 'width')");
    boom.stack = `TypeError: …\n    at drawNotes (http://h/assets/i.js:1:4022)\n    at render (http://h/assets/i.js:1:5120)`;
    reportError('track:notes', boom);
    expect(s.told).toHaveLength(1);
    expect(s.told[0]).toMatchObject({ type: 'page-error', about: { id: '1', count: '1', where: 'track:notes', message: "TypeError: Cannot read properties of undefined (reading 'width')" } });
    expect(s.told[0].about.stack).toMatch(/^drawNotes@.*i\.js:1:4022 < render@.*i\.js:1:5120$/);
    // said on the console once: a part that was caught would go on unseen otherwise
    expect(quiet).toHaveBeenCalledTimes(1);
    for (let i = 2; i <= 9; i++) reportError('track:notes', boom);
    expect(s.told).toHaveLength(1);
    reportError('track:notes', boom);
    expect(s.told.at(-1)!.about).toEqual({ id: '1', count: '10', where: 'track:notes', message: "TypeError: Cannot read properties of undefined (reading 'width')" });
    for (let i = 11; i <= 100; i++) reportError('track:notes', boom);
    expect(s.told.map((r) => r.about.count)).toEqual(['1', '10', '100']);
    // … and ten seconds after it was last told
    s.t += 10_000;
    reportError('track:notes', boom);
    expect(s.told.at(-1)!.about.count).toBe('101');
    expect(quiet).toHaveBeenCalledTimes(1);
    // another part, another error: one of its own
    reportError('frame:hud', boom);
    expect(s.told.at(-1)!.about).toMatchObject({ id: '2', count: '1', where: 'frame:hud' });
    // what is not an Error: as text; the browser's own word on where an uncaught one happened
    reportError('promise', { code: 7 });
    reportError('window', 'Script error.', 'assets/i.js:1:77');
    expect(s.told.slice(-2).map((r) => r.about)).toEqual([
      { id: '3', count: '1', where: 'promise', message: '{"code":7}' },
      { id: '4', count: '1', where: 'window', message: 'Script error.', at: 'assets/i.js:1:77' },
    ]);
    // (the browser says those on the console itself)
    expect(quiet).toHaveBeenCalledTimes(2);
    quiet.mockRestore();
  });

  it('tells so many different errors and says once that there were more', () => {
    const s = sink();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (let i = 0; i < 60; i++) reportError('window', new Error(`error ${i}`));
    expect(s.told).toHaveLength(41);
    expect(s.told.at(-1)!.about).toEqual({ dropped: 'more than 40 different errors' });
    quiet.mockRestore();
  });

  it('a part of a frame that throws is told, and what follows it runs all the same', () => {
    const s = sink();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ran: string[] = [];
    guard('frame:logic', () => {
      throw new RangeError('out');
    });
    guard('frame:track', () => void ran.push('track'));
    expect(ran).toEqual(['track']);
    expect(s.told.map((r) => [r.about.where, r.about.message])).toEqual([['frame:logic', 'RangeError: out']]);
    // without a desktop window (a browser) nothing is told, and nothing breaks
    setErrorSink(null);
    expect(() => guard('frame:hud', () => {
      throw new Error('again');
    })).not.toThrow();
    quiet.mockRestore();
  });
});
