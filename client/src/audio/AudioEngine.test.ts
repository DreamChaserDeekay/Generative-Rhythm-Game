import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, softLimitCurve } from './AudioEngine';

/** What a WaveShaperNode makes of input `x` with `curve`, after the limiter's 1/range in front. */
function shape(curve: Float32Array, range: number, x: number): number {
  const v = ((x / range + 1) / 2) * (curve.length - 1);
  if (v <= 0) return curve[0];
  if (v >= curve.length - 1) return curve[curve.length - 1];
  const k = Math.floor(v);
  return curve[k] + (v - k) * (curve[k + 1] - curve[k]);
}

describe('softLimitCurve', () => {
  const curve = softLimitCurve();

  it('leaves everything up to the knee as it is, silence too', () => {
    for (const x of [0, 0.1, -0.25, 0.5, -0.75, 0.9, -0.9]) expect(shape(curve, 4, x)).toBeCloseTo(x, 6);
    expect(curve[(curve.length - 1) / 2]).toBe(0);
  });

  it('keeps louder input under full scale, rising all the way and the same both ways', () => {
    for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
    expect(Math.max(...curve)).toBeLessThanOrEqual(1);
    expect(shape(curve, 4, 1)).toBeCloseTo(0.976, 3);
    expect(shape(curve, 4, 1.2)).toBeGreaterThan(0.999);
    expect(shape(curve, 4, 1.2)).toBeLessThan(1);
    expect(shape(curve, 4, 3.9)).toBeLessThanOrEqual(1);
    for (const x of [0.95, 1.2, 2]) expect(shape(curve, 4, -x)).toBeCloseTo(-shape(curve, 4, x), 6);
  });

  it('bends without a kink at the knee', () => {
    const slope = (x: number) => (shape(curve, 4, x + 0.004) - shape(curve, 4, x)) / 0.004;
    expect(slope(0.88)).toBeCloseTo(1, 2);
    expect(slope(0.9)).toBeGreaterThan(0.95);
    expect(slope(1.1)).toBeLessThan(0.1);
  });
});

class FakeParam {
  value = 1;
}

class FakeNode {
  readonly out: FakeNode[] = [];
  constructor(readonly kind: string) {}
  connect<T extends FakeNode>(node: T): T {
    this.out.push(node);
    return node;
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
  constructor() {
    super('gain');
  }
}

class FakeShaper extends FakeNode {
  curve: Float32Array | null = null;
  oversample = '';
  constructor() {
    super('shaper');
  }
}

class FakeContext {
  readonly currentTime = 0;
  readonly destination = new FakeNode('destination');
  readonly nodes: FakeNode[] = [];
  private add<T extends FakeNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }
  createGain() {
    return this.add(new FakeGain());
  }
  createAnalyser() {
    return this.add(Object.assign(new FakeNode('analyser'), { fftSize: 0, smoothingTimeConstant: 0 }));
  }
  createWaveShaper() {
    return this.add(new FakeShaper());
  }
}

describe('AudioEngine output', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function engine() {
    vi.stubGlobal('AudioContext', FakeContext);
    const e = new AudioEngine();
    const ctx = e.ctx as unknown as FakeContext;
    const shaper = ctx.nodes.find((n): n is FakeShaper => n instanceof FakeShaper) as FakeShaper;
    const limiter = ctx.nodes.find((n) => n.out.includes(shaper)) as FakeGain;
    return { e, ctx, shaper, limiter };
  }

  it('plays the music with its keysounds and the effects through the limiter, and only the limiter to the speakers', () => {
    const { e, ctx, shaper, limiter } = engine();
    expect(ctx.nodes.filter((n) => n.out.includes(ctx.destination))).toEqual([shaper]);
    expect(shaper.oversample).toBe('none');
    expect(Array.from(shaper.curve ?? [])).toEqual(Array.from(softLimitCurve()));
    expect(limiter.gain.value).toBe(1 / 4);
    expect(limiter.out).toEqual([shaper]);
    // keysounds → music volume → visualizer → limiter, and the effects into the limiter as well
    const bus = e.keysoundBus as unknown as FakeGain;
    const music = bus.out[0] as FakeGain;
    expect(bus.out).toHaveLength(1);
    expect(music.out).toEqual([e.analyser as unknown as FakeNode]);
    expect((e.analyser as unknown as FakeNode).out).toEqual([limiter]);
    const feeds = ctx.nodes.filter((n) => n.out.includes(limiter));
    expect(feeds).toHaveLength(2);
    const sfx = feeds.find((n) => n !== (e.analyser as unknown as FakeNode)) as FakeGain;
    e.setSfxVolume(0.3);
    expect(sfx.gain.value).toBe(0.3);
    e.setMusicVolume(0.7);
    expect(music.gain.value).toBe(0.7);
  });

  it('plays the note keysounds 1.2 times their own level', () => {
    const { e } = engine();
    const bus = e.keysoundBus as unknown as FakeGain;
    expect(bus.gain.value).toBeCloseTo(1.2, 10);
    e.setKeysoundGain(0.5);
    expect(bus.gain.value).toBeCloseTo(0.6, 10);
  });
});

/** An AudioParam that writes down what is scheduled on it. */
class LoggedParam {
  value = 1;
  readonly log: [string, ...number[]][] = [];
  setValueAtTime(v: number, t: number) {
    this.log.push(['set', v, t]);
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.log.push(['line', v, t]);
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.log.push(['exp', v, t]);
  }
  cancelScheduledValues(t: number) {
    this.log.push(['cancel', t]);
  }
}

class Wired extends FakeNode {
  disconnect() {
    this.out.length = 0;
  }
}

class WiredGain extends Wired {
  readonly gain = new LoggedParam();
  constructor() {
    super('gain');
  }
}

class FakeSource extends Wired {
  buffer: unknown = null;
  readonly playbackRate = new LoggedParam();
  startedAt: number | null = null;
  stopAt: number | null = null;
  constructor() {
    super('source');
  }
  start(when: number) {
    this.startedAt = when;
  }
  stop(when?: number) {
    this.stopAt = when ?? 0;
  }
}

class FakeFilter extends Wired {
  type = '';
  readonly frequency = new LoggedParam();
  constructor() {
    super('filter');
  }
}

/** A context that plays buffers: time stands at 10 s. */
class PlayingContext {
  readonly currentTime = 10;
  readonly destination = new FakeNode('destination');
  readonly nodes: FakeNode[] = [];
  private add<T extends FakeNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }
  createGain() {
    return this.add(new WiredGain());
  }
  createAnalyser() {
    return this.add(Object.assign(new FakeNode('analyser'), { fftSize: 0, smoothingTimeConstant: 0 }));
  }
  createWaveShaper() {
    return this.add(new FakeShaper());
  }
  createBufferSource() {
    return this.add(new FakeSource());
  }
  createBiquadFilter() {
    return this.add(new FakeFilter());
  }
}

describe('AudioEngine: how a song goes out', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const buffer = { duration: 60, length: 60 * 48000 } as unknown as AudioBuffer;

  function playing(cuts: { buffer: AudioBuffer; ranges: [number, number][] }[] = []) {
    vi.stubGlobal('AudioContext', PlayingContext);
    const e = new AudioEngine();
    const ctx = e.ctx as unknown as PlayingContext;
    e.setBuffer(buffer, { originMs: 0, rate: 1 }, cuts);
    e.start(0, 0);
    const sources = ctx.nodes.filter((n): n is FakeSource => n instanceof FakeSource);
    const sourceGain = sources[0].out[0] as WiredGain;
    const music = (e.keysoundBus as unknown as FakeNode).out[0] as WiredGain;
    return { e, ctx, sources, sourceGain, music };
  }

  it('plays the song straight into the music volume, with no filter in its way', () => {
    const { ctx, sourceGain, music } = playing();
    expect(sourceGain.out).toEqual([music]);
    expect(ctx.nodes.some((n) => n instanceof FakeFilter)).toBe(false);
  });

  it('muffles it out at an end: a low-pass comes down to the cutoff and on while it fades, then it stops', () => {
    const { e, ctx, sources, sourceGain, music } = playing();
    e.muffleOut(2000, 800);
    const filter = ctx.nodes.find((n): n is FakeFilter => n instanceof FakeFilter) as FakeFilter;
    expect(filter.type).toBe('lowpass');
    // the song now reaches the music volume through the filter alone
    expect(sourceGain.out).toEqual([filter]);
    expect(filter.out).toEqual([music]);
    // open, down to the cutoff in the first part, lower still by the end
    expect(filter.frequency.log[0]).toEqual(['set', 18000, 10]);
    expect(filter.frequency.log[1][0]).toBe('exp');
    expect(filter.frequency.log[1][1]).toBe(800);
    expect(filter.frequency.log[1][2]).toBeGreaterThan(10);
    expect(filter.frequency.log[1][2]).toBeLessThan(11);
    expect(filter.frequency.log[2]).toEqual(['exp', 220, 12]);
    // its level holds at first and is silent as it ends
    expect(sourceGain.gain.log[0]).toEqual(['set', 1, 10]);
    expect(sourceGain.gain.log[1]).toEqual(['line', 1, 10.5]);
    expect(sourceGain.gain.log[2]).toEqual(['line', 0, 12]);
    expect(sources[0].stopAt).toBeCloseTo(12.05, 6);
    // a second call changes nothing
    e.muffleOut(500, 800);
    expect(ctx.nodes.filter((n) => n instanceof FakeFilter)).toHaveLength(1);
    // and the next start is the song as it is again
    e.start(0, 0);
    expect(filter.out).toEqual([]);
    const again = ctx.nodes.filter((n): n is FakeSource => n instanceof FakeSource).at(-1) as FakeSource;
    expect(again.out[0].out).toEqual([music]);
  });

  it('runs it down like a tape at a failed play: slower and lower to a standstill, silent as it stops', () => {
    const { e, sources, sourceGain } = playing();
    e.tapeStop(1300);
    expect(sources[0].playbackRate.log).toEqual([
      ['set', 1, 10],
      ['line', 0.001, 11.3],
    ]);
    expect(sourceGain.gain.log[0]).toEqual(['set', 1, 10]);
    expect(sourceGain.gain.log[1][0]).toBe('line');
    expect(sourceGain.gain.log[1][1]).toBe(1);
    expect(sourceGain.gain.log[2]).toEqual(['line', 0, 11.3]);
    expect(sources[0].stopAt).toBeCloseTo(11.35, 6);
  });

  it('brings the stems left to the keysounds back into the mix as it runs down, and runs them down with it', () => {
    const { e, sources } = playing([{ buffer, ranges: [[5000, 9000]] }]);
    expect(sources).toHaveLength(2);
    const cut = sources[1].out[0] as WiredGain;
    const scheduled = cut.gain.log.length;
    expect(scheduled).toBeGreaterThan(0);
    e.tapeStop(1300);
    const after = cut.gain.log.slice(scheduled);
    expect(after[0]).toEqual(['cancel', 10]);
    expect(after.at(-1)?.[0]).toBe('line');
    expect(after.at(-1)?.[1]).toBe(0);
    expect(sources[1].playbackRate.log).toEqual(sources[0].playbackRate.log);
    expect(sources[1].stopAt).toBeCloseTo(11.35, 6);
  });

  it('does nothing of either with no song playing', () => {
    vi.stubGlobal('AudioContext', PlayingContext);
    const e = new AudioEngine();
    const ctx = e.ctx as unknown as PlayingContext;
    const before = ctx.nodes.length;
    e.muffleOut(2000, 800);
    e.tapeStop(1300);
    expect(ctx.nodes).toHaveLength(before);
  });
});
