import type { BufferPlacement } from './AudioEngine';
import { timeStretch } from './timeStretch';

export interface PracticeSegment {
  startMs: number;
  endMs: number;
  /** Playback speed (0.5–1.5). */
  rate: number;
}

/** Music kept before A and after B so the lead-in and the last long notes are audible. */
const PREROLL_MS = 4000;
const TAIL_MS = 2000;

/**
 * Audio for a practice run: the A–B segment (plus pre-roll), time-stretched off the main thread
 * when the speed is not 1. The keysound lead stem, if any, is stretched together with the mix
 * (one shared alignment), so the two stay sample-aligned. Returns where the new buffers sit on
 * the song timeline.
 */
export async function practiceAudio(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  segment: PracticeSegment,
  lead: AudioBuffer | null = null,
): Promise<{ buffer: AudioBuffer; lead: AudioBuffer | null; placement: BufferPlacement }> {
  if (Math.abs(segment.rate - 1) < 1e-6) return { buffer: source, lead, placement: { originMs: 0, rate: 1 } };
  const sr = source.sampleRate;
  const from = Math.max(0, Math.floor(((segment.startMs - PREROLL_MS) / 1000) * sr));
  const to = Math.min(source.length, Math.ceil(((segment.endMs + TAIL_MS) / 1000) * sr));
  const cut = (b: AudioBuffer) => Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c).slice(from, Math.max(from + 1, to)));
  const mixChannels = cut(source);
  const leadChannels = lead && lead.length === source.length ? cut(lead) : [];
  const stretched = await stretchOffThread([...mixChannels, ...leadChannels], segment.rate);
  const build = (channels: Float32Array[]) => {
    const b = ctx.createBuffer(channels.length, channels[0].length, sr);
    channels.forEach((data, c) => b.copyToChannel(data as Float32Array<ArrayBuffer>, c));
    return b;
  };
  return {
    buffer: build(stretched.slice(0, mixChannels.length)),
    lead: leadChannels.length > 0 ? build(stretched.slice(mixChannels.length)) : null,
    placement: { originMs: (from / sr) * 1000, rate: segment.rate },
  };
}

function stretchOffThread(channels: Float32Array[], rate: number): Promise<Float32Array[]> {
  if (typeof Worker === 'undefined') return Promise.resolve(timeStretch(channels, rate));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./stretchWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ channels: Float32Array[] }>) => {
      worker.terminate();
      resolve(e.data.channels);
    };
    worker.onerror = (e) => {
      worker.terminate();
      // Fall back to the main thread rather than failing the practice run.
      try {
        resolve(timeStretch(channels, rate));
      } catch {
        reject(new Error(e.message || '타임 스트레치에 실패했습니다'));
      }
    };
    // Copied, not transferred, so the main-thread fallback still has the samples.
    worker.postMessage({ channels, rate });
  });
}
