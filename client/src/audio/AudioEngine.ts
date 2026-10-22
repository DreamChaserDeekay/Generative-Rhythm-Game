import instrumentsJson from '@config/instruments.json';
import { AudioClock, type SongClock } from './clock';
import { scheduleStemCut } from './stemKeysounds';

/** Scheduling margin so `start()` never asks Web Audio to begin in the past. */
const START_MARGIN_SEC = 0.1;
const ANALYSER_FFT = 512;
/** Ramp where a stem leaves or rejoins the mix (config/instruments.json). */
const CUT_FADE_SEC = instrumentsJson.keysound.fadeMs / 1000;
/** Note keysounds play this much louder than their own level, so a hit stands out over the song. */
const KEYSOUND_BOOST = 1.1;

export interface BufferPlacement {
  /** Song time (ms) of the buffer's first sample. */
  originMs: number;
  /** Song ms per real ms: the buffer was time-stretched by this factor (practice speed). */
  rate: number;
}

/** A stem taken out of the mix over song-time ranges, where its keysounds play instead. */
export interface StemCut {
  /** Same length and placement as the song buffer. */
  buffer: AudioBuffer;
  /** Song-ms ranges, in order and apart. */
  ranges: readonly (readonly [number, number])[];
}

/**
 * Plays one song buffer and exposes song time on the `performance.now()` timeline.
 * Song time 0 is the first sample of the song; negative values are lead-in. A practice buffer
 * holds only a stretched segment, so it carries its origin and rate.
 *
 * Keysounds of a generated chart take their stems out of the mix: each stem plays as another
 * source, sample-aligned with the mix and phase-inverted, whose gain steps from 0 (mix untouched)
 * to -1 (mix - stem) over the stem's keysound ranges. No accompaniment buffer is needed, and the
 * stems sum to the mix, so the hits put the song back together, the keysounded stems
 * KEYSOUND_BOOST louder.
 */
export class AudioEngine implements SongClock {
  readonly ctx: AudioContext;
  readonly clock: AudioClock;
  /** Taps the music for the background visualizer. */
  readonly analyser: AnalyserNode;
  /** Note keysounds join the music here (music volume and visualizer), at setKeysoundGain's level. */
  readonly keysoundBus: GainNode;
  private readonly musicGain: GainNode;
  private readonly sfxGain: GainNode;
  private buffer: AudioBuffer | null = null;
  private cuts: StemCut[] = [];
  private placement: BufferPlacement = { originMs: 0, rate: 1 };
  private source: AudioBufferSourceNode | null = null;
  private cutSources: AudioBufferSourceNode[] = [];
  private sourceGain: GainNode | null = null;
  private anchorSec = 0;
  private pausedSongMs: number | null = 0;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.clock = new AudioClock(this.ctx);
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = ANALYSER_FFT;
    this.analyser.smoothingTimeConstant = 0.75;
    this.keysoundBus = this.ctx.createGain();
    this.setKeysoundGain(1);
    this.keysoundBus.connect(this.musicGain);
    this.musicGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.sfxGain.connect(this.ctx.destination);
  }

  /** Must be called from a user gesture before playback (autoplay policy). */
  async unlock(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  async load(url: string): Promise<AudioBuffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`오디오를 불러오지 못했습니다 (${res.status})`);
    return this.ctx.decodeAudioData(await res.arrayBuffer());
  }

  /** `cuts` (stems with the same length and placement as `buffer`) leave the mix to keysounds. */
  setBuffer(buffer: AudioBuffer | null, placement: BufferPlacement = { originMs: 0, rate: 1 }, cuts: readonly StemCut[] = []): void {
    this.stop();
    this.buffer = buffer;
    this.placement = placement;
    this.cuts = buffer ? cuts.filter((c) => c.buffer.length === buffer.length && c.ranges.length > 0) : [];
  }

  get rate(): number {
    return this.placement.rate;
  }

  /** Song time at which the buffer ends. */
  get durationMs(): number {
    return this.buffer ? this.placement.originMs + this.buffer.duration * 1000 * this.placement.rate : 0;
  }

  get isPaused(): boolean {
    return this.pausedSongMs !== null;
  }

  /** Start playback so that song time `fromMs` is heard `leadInMs` (real ms) from now. */
  start(fromMs: number, leadInMs: number): void {
    this.stopSource();
    const { originMs, rate } = this.placement;
    const when = this.ctx.currentTime + START_MARGIN_SEC + leadInMs / 1000;
    this.anchorSec = when - fromMs / 1000 / rate;
    this.pausedSongMs = null;
    this.clock.sample();
    if (!this.buffer) return;
    // Position inside the (stretched) buffer, in buffer seconds.
    const bufferSec = (fromMs - originMs) / 1000 / rate;
    const offsetSec = Math.max(0, bufferSec);
    if (offsetSec >= this.buffer.duration) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    const gain = this.ctx.createGain();
    src.connect(gain);
    gain.connect(this.musicGain);
    const at = when + Math.max(0, -bufferSec);
    src.start(at, offsetSec);
    this.source = src;
    this.sourceGain = gain;
    for (const cut of this.cuts) {
      // same start time and offset as the mix: sample-aligned, so the inverted copy cancels exactly
      const stem = this.ctx.createBufferSource();
      stem.buffer = cut.buffer;
      const cutGain = this.ctx.createGain();
      scheduleStemCut(cutGain.gain, cut.ranges, fromMs, at, (ms) => this.contextTimeForSong(ms), CUT_FADE_SEC);
      stem.connect(cutGain);
      cutGain.connect(gain);
      stem.start(at, offsetSec);
      this.cutSources.push(stem);
    }
  }

  /** Fade the music out (failed play) and stop it. */
  fadeOut(ms: number): void {
    if (!this.source || !this.sourceGain) return;
    const t = this.ctx.currentTime;
    this.sourceGain.gain.setValueAtTime(this.sourceGain.gain.value, t);
    this.sourceGain.gain.linearRampToValueAtTime(0, t + ms / 1000);
    for (const node of [this.source, ...this.cutSources]) {
      try {
        node?.stop(t + ms / 1000 + 0.05);
      } catch {
        // already stopped
      }
    }
  }

  /** Freeze song time at the current position and stop the audio. */
  pause(perfNow: number = performance.now()): number {
    const at = this.songTimeAtPerf(perfNow);
    this.stopSource();
    this.pausedSongMs = at;
    return at;
  }

  stop(): void {
    this.stopSource();
    this.pausedSongMs = 0;
  }

  songTimeAtPerf(perfMs: number): number {
    if (this.pausedSongMs !== null) return this.pausedSongMs;
    return (this.clock.contextTimeAtPerf(perfMs) - this.anchorSec) * 1000 * this.placement.rate;
  }

  /** AudioContext time at which song time `songMs` plays (to schedule sounds on the song). */
  contextTimeForSong(songMs: number): number {
    return this.anchorSec + songMs / 1000 / this.placement.rate;
  }

  perfAtSongTime(songMs: number): number {
    return this.clock.perfAtContextTime(this.anchorSec + songMs / 1000 / this.placement.rate);
  }

  setMusicVolume(volume: number): void {
    this.musicGain.gain.value = volume;
  }

  setSfxVolume(volume: number): void {
    this.sfxGain.gain.value = volume;
  }

  /**
   * Level of the note keysounds: `gain` is their own (an imported chart's, which keeps its mix from
   * clipping; 1 for a generated chart's stems), raised by KEYSOUND_BOOST.
   */
  setKeysoundGain(gain: number): void {
    this.keysoundBus.gain.value = gain * KEYSOUND_BOOST;
  }

  /** Short percussive tick for optional hit sounds. */
  playHitSound(): void {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1800, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.03);
    env.gain.setValueAtTime(0.35, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(env);
    env.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  private stopSource(): void {
    for (const node of [this.source, ...this.cutSources]) {
      if (!node) continue;
      try {
        node.stop();
      } catch {
        // already stopped
      }
      node.disconnect();
    }
    this.sourceGain?.disconnect();
    this.source = null;
    this.cutSources = [];
    this.sourceGain = null;
  }
}

let shared: AudioEngine | null = null;

/** One AudioContext for the whole app; created lazily on the first user gesture. */
export function getAudioEngine(): AudioEngine {
  shared ??= new AudioEngine();
  return shared;
}
