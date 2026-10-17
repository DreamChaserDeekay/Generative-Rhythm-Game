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
 * when the speed is not 1. Returns where the new buffer sits on the song timeline.
 */
export async function practiceAudio(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  segment: PracticeSegment,
): Promise<{ buffer: AudioBuffer; placement: BufferPlacement }> {
  if (Math.abs(segment.rate - 1) < 1e-6) return { buffer: source, placement: { originMs: 0, rate: 1 } };
  const sr = source.sampleRate;
  const from = Math.max(0, Math.floor(((segment.startMs - PREROLL_MS) / 1000) * sr));
  const to = Math.min(source.length, Math.ceil(((segment.endMs + TAIL_MS) / 1000) * sr));
  const channels = Array.from({ length: source.numberOfChannels }, (_, c) => source.getChannelData(c).slice(from, Math.max(from + 1, to)));
  const stretched = await stretchOffThread(channels, segment.rate);
  const buffer = ctx.createBuffer(stretched.length, stretched[0].length, sr);
  stretched.forEach((data, c) => buffer.copyToChannel(data as Float32Array<ArrayBuffer>, c));
  return { buffer, placement: { originMs: (from / sr) * 1000, rate: segment.rate } };
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
