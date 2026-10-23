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
