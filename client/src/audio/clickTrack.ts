export interface ClickTrackSpec {
  bpm: number;
  firstBeatMs: number;
  beats: number;
  beatsPerMeasure: number;
  tailMs: number;
}

/** Beat times (ms) of a click track. */
export function clickBeatTimes(spec: ClickTrackSpec): number[] {
  return Array.from({ length: spec.beats }, (_, k) => spec.firstBeatMs + (k * 60000) / spec.bpm);
}

/**
 * Mono click track: a short decaying sine burst starting exactly at each beat sample.
 * Downbeats are higher and louder.
 */
export function renderClickSamples(spec: ClickTrackSpec, sampleRate: number): Float32Array<ArrayBuffer> {
  const times = clickBeatTimes(spec);
  const lastMs = times.length > 0 ? times[times.length - 1] : spec.firstBeatMs;
  const data = new Float32Array(Math.ceil(((lastMs + spec.tailMs) / 1000) * sampleRate));
  const burst = Math.round(0.05 * sampleRate);
  const decay = 0.012 * sampleRate;
  times.forEach((ms, k) => {
    const accent = k % spec.beatsPerMeasure === 0;
    const freq = accent ? 1760 : 1320;
    const amp = accent ? 0.9 : 0.6;
    const start = Math.round((ms / 1000) * sampleRate);
    for (let i = 0; i < burst && start + i < data.length; i++) {
      data[start + i] += amp * Math.sin((2 * Math.PI * freq * i) / sampleRate) * Math.exp(-i / decay);
    }
  });
  return data;
}

export function clickTrackBuffer(ctx: BaseAudioContext, spec: ClickTrackSpec): AudioBuffer {
  const samples = renderClickSamples(spec, ctx.sampleRate);
  const buffer = ctx.createBuffer(2, samples.length, ctx.sampleRate);
  buffer.copyToChannel(samples, 0);
  buffer.copyToChannel(samples, 1);
  return buffer;
}
