import instrumentsJson from '@config/instruments.json';
import { AudioClock, type SongClock } from './clock';

/** Scheduling margin so `start()` never asks Web Audio to begin in the past. */
const START_MARGIN_SEC = 0.1;
const ANALYSER_FFT = 512;
/** Lead-stem duck when a keysound note is missed (config/instruments.json). */
const DUCK = instrumentsJson.keysound.duck;

export interface BufferPlacement {
  /** Song time (ms) of the buffer's first sample. */
  originMs: number;
  /** Song ms per real ms: the buffer was time-stretched by this factor (practice speed). */
  rate: number;
}

/**
 * Plays one song buffer and exposes song time on the `performance.now()` timeline.
 * Song time 0 is the first sample of the song; negative values are lead-in. A practice buffer
 * holds only a stretched segment, so it carries its origin and rate.
 *
 * Stem keysound mode adds the lead stem as a second source, sample-aligned with the mix and
 * phase-inverted through `leadGain`: at gain 0 the mix plays untouched, and ducking the gain
 * towards -1 subtracts the lead from the mix (mix - lead = accompaniment), so no separate
 * accompaniment buffer is needed.
 */
export class AudioEngine implements SongClock {
  readonly ctx: AudioContext;
  readonly clock: AudioClock;
  /** Taps the music for the background visualizer. */
  readonly analyser: AnalyserNode;
  /** Note keysounds of imported charts join the music here (music volume and visualizer). */
  readonly keysoundBus: GainNode;
  private readonly musicGain: GainNode;
  private readonly sfxGain: GainNode;
  private buffer: AudioBuffer | null = null;
  private lead: AudioBuffer | null = null;
  private placement: BufferPlacement = { originMs: 0, rate: 1 };
  private source: AudioBufferSourceNode | null = null;
  private leadSource: AudioBufferSourceNode | null = null;
  private sourceGain: GainNode | null = null;
  private leadGain: GainNode | null = null;
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

  /** `lead` (same length and placement as `buffer`) enables the stem keysound mode. */
  setBuffer(buffer: AudioBuffer | null, placement: BufferPlacement = { originMs: 0, rate: 1 }, lead: AudioBuffer | null = null): void {
    this.stop();
    this.buffer = buffer;
    this.placement = placement;
    this.lead = buffer && lead && lead.length === buffer.length ? lead : null;
  }

  get hasLead(): boolean {
    return this.lead !== null;
  }

  /** Turn the lead stem down for a moment (a missed keysound note). */
  duckLead(level = DUCK.level, attackMs = DUCK.attackMs, holdMs = DUCK.holdMs, releaseMs = DUCK.releaseMs): void {
    const g = this.leadGain?.gain;
    if (!g) return;
    const t = this.ctx.currentTime;
    const down = -(1 - level);
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(down, t + attackMs / 1000);
    g.setValueAtTime(down, t + (attackMs + holdMs) / 1000);
    g.linearRampToValueAtTime(0, t + (attackMs + holdMs + releaseMs) / 1000);
  }

  /** Back to full volume right away (the player hit a keysound note). */
  restoreLead(): void {
    const g = this.leadGain?.gain;
    if (!g || g.value === 0) return;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + DUCK.restoreMs / 1000);
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
    if (this.lead) {
      // same start time and offset as the mix: sample-aligned, so the inverted copy cancels exactly
      const lead = this.ctx.createBufferSource();
      lead.buffer = this.lead;
      const leadGain = this.ctx.createGain();
      leadGain.gain.value = 0;
      lead.connect(leadGain);
      leadGain.connect(gain);
      lead.start(at, offsetSec);
      this.leadSource = lead;
      this.leadGain = leadGain;
    }
  }

  /** Fade the music out (failed play) and stop it. */
  fadeOut(ms: number): void {
    if (!this.source || !this.sourceGain) return;
    const t = this.ctx.currentTime;
    this.sourceGain.gain.setValueAtTime(this.sourceGain.gain.value, t);
    this.sourceGain.gain.linearRampToValueAtTime(0, t + ms / 1000);
    for (const node of [this.source, this.leadSource]) {
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
    for (const node of [this.source, this.leadSource]) {
      if (!node) continue;
      try {
        node.stop();
      } catch {
        // already stopped
      }
      node.disconnect();
    }
    this.sourceGain?.disconnect();
    this.leadGain?.disconnect();
    this.source = null;
    this.leadSource = null;
    this.sourceGain = null;
    this.leadGain = null;
  }
}

let shared: AudioEngine | null = null;

/** One AudioContext for the whole app; created lazily on the first user gesture. */
export function getAudioEngine(): AudioEngine {
  shared ??= new AudioEngine();
  return shared;
}
