/** Frame length in samples (~46 ms at 44.1 kHz). */
const FRAME = 2048;
/** Output hop: frames overlap by half, so the Hann windows sum to one. */
const HOP = FRAME / 2;
/** How far (samples) a frame may move from its ideal input position to line up with the last one. */
const TOLERANCE = 512;
/** Coarse search and correlation stride before the full-resolution refinement. */
const COARSE = 4;

/**
 * WSOLA time-scale modification: the result plays `rate` times faster (0.5 = half speed) with the
 * pitch unchanged. Every output frame is taken from near its ideal input position, shifted within
 * ±TOLERANCE to the offset that best continues the previous frame (normalised cross-correlation
 * on the mono mix), then overlap-added with a Hann window. All channels share the alignment so
 * the stereo image stays intact.
 */
export function timeStretch(channels: readonly Float32Array[], rate: number): Float32Array[] {
  if (!(rate > 0)) throw new Error(`invalid rate: ${rate}`);
  const inLength = channels[0]?.length ?? 0;
  const outLength = Math.floor(inLength / rate);
  if (Math.abs(rate - 1) < 1e-6) return channels.map((c) => c.slice());
  const mono = new Float32Array(inLength);
  for (const c of channels) for (let i = 0; i < inLength; i++) mono[i] += c[i] / channels.length;

  const window = new Float32Array(FRAME);
  for (let n = 0; n < FRAME; n++) window[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / FRAME);
  const out = channels.map(() => new Float32Array(outLength + FRAME));
  const weight = new Float32Array(outLength + FRAME);
  const overlap = FRAME - HOP;
  const lastStart = Math.max(0, inLength - FRAME);

  let prev = 0;
  for (let k = 0; k * HOP < outLength; k++) {
    let pos = 0;
    if (k > 0) {
      const natural = prev + HOP;
      const ideal = Math.round(k * HOP * rate);
      const lo = Math.max(0, ideal - TOLERANCE);
      const hi = Math.min(lastStart, ideal + TOLERANCE);
      if (natural + overlap > inLength || lo > hi) {
        pos = Math.min(lastStart, Math.max(0, ideal));
      } else {
        let best = lo;
        let bestScore = -Infinity;
        for (let c = lo; c <= hi; c += COARSE) {
          const s = similarity(mono, natural, c, overlap, COARSE);
          if (s > bestScore) {
            bestScore = s;
            best = c;
          }
        }
        // Refine around the coarse winner at full resolution (scores are recomputed at stride 1).
        pos = best;
        let fineScore = similarity(mono, natural, best, overlap, 1);
        for (let c = Math.max(lo, best - COARSE + 1); c <= Math.min(hi, best + COARSE - 1); c++) {
          if (c === best) continue;
          const s = similarity(mono, natural, c, overlap, 1);
          if (s > fineScore) {
            fineScore = s;
            pos = c;
          }
        }
      }
    }
    const at = k * HOP;
    const n = Math.min(FRAME, inLength - pos);
    for (let ch = 0; ch < channels.length; ch++) {
      const src = channels[ch];
      const dst = out[ch];
      for (let i = 0; i < n; i++) dst[at + i] += src[pos + i] * window[i];
    }
    for (let i = 0; i < n; i++) weight[at + i] += window[i];
    prev = pos;
  }
  // Undo the window gain where frames do not fully overlap (start and end).
  for (let i = 0; i < outLength; i++) {
    const w = weight[i];
    if (w > 1e-3 && Math.abs(w - 1) > 1e-6) for (const o of out) o[i] /= w;
  }
  return out.map((o) => o.subarray(0, outLength).slice());
}

/** Normalised correlation of `x[a..a+len)` and `x[b..b+len)` sampled every `stride`. */
function similarity(x: Float32Array, a: number, b: number, len: number, stride: number): number {
  let dot = 0;
  let energy = 1e-9;
  const end = Math.min(len, x.length - Math.max(a, b));
  for (let i = 0; i < end; i += stride) {
    const v = x[b + i];
    dot += x[a + i] * v;
    energy += v * v;
  }
  return dot / Math.sqrt(energy);
}
