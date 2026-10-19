import { getAudioEngine } from './AudioEngine';

/** The highlight played on the song select screen: it loops this long from the preview point. */
export const PREVIEW_LENGTH_MS = 60000;
/** The preview plays at this share of the music volume. */
export const PREVIEW_VOLUME = 0.6;
const FADE_IN_MS = 1000;
const FADE_OUT_MS = 1500;
/** Leaving the song (another song, a play) fades the preview out this fast. */
const STOP_FADE_MS = 300;
const TICK_MS = 30;
/** Behind the settings the preview plays a little quieter and muffled, as if from the next room. */
export const MUFFLED_GAIN = 0.7;
export const MUFFLED_CUTOFF_HZ = 800;
/** Unmuffled the low-pass filter lets everything through. */
const OPEN_CUTOFF_HZ = 20000;
/** Time constant (s) of the turn to and from muffled: it settles in about a third of a second. */
const MUFFLE_TIME_S = 0.1;

/** Low-pass filter and gain a muffled preview plays through (Web Audio). */
interface MuffleRoute {
  ctx: AudioContext;
  nodes: AudioNode[];
  filter: BiquadFilterNode;
  gain: GainNode;
}

/** Volume share at `t` ms into the highlight: fades in at the start and out before it loops. */
export function previewEnvelope(t: number, lengthMs: number = PREVIEW_LENGTH_MS): number {
  if (t <= 0 || t >= lengthMs) return 0;
  return Math.min(1, t / FADE_IN_MS, (lengthMs - t) / FADE_OUT_MS);
}

/** How long the highlight from `startMs` plays: PREVIEW_LENGTH_MS, or up to the song's end if that comes first. */
export function previewLength(durationMs: number, startMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= startMs) return PREVIEW_LENGTH_MS;
  return Math.min(PREVIEW_LENGTH_MS, durationMs - startMs);
}

/**
 * The song preview: the highlight from `startMs` fades in, plays PREVIEW_LENGTH_MS (fading out
 * before the song's end when that comes first) and starts again. `stop` fades it out quickly.
 */
export class SongPreview {
  private readonly audio: HTMLAudioElement;
  private readonly startS: number;
  private volume: number;
  private readonly timer: number;
  private lengthMs = PREVIEW_LENGTH_MS;
  private stopping: { at: number; from: number } | null = null;
  /** The Web Audio route that muffles it, made the first time it is muffled (until then the element plays as it is). */
  private route: MuffleRoute | null = null;

  constructor(url: string, startMs: number, volume: number) {
    this.startS = startMs / 1000;
    this.volume = volume;
    this.audio = new Audio(url);
    this.audio.volume = 0;
    this.audio.addEventListener('loadedmetadata', () => {
      this.lengthMs = previewLength(this.audio.duration * 1000, startMs);
      this.restart();
    });
    this.audio.addEventListener('ended', () => this.restart());
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.stopping) return;
    this.stopping = { at: performance.now(), from: this.audio.volume };
    if (this.audio.paused) this.finish();
  }

  setVolume(volume: number): void {
    this.volume = volume;
  }

  /** Quieter and through a low-pass filter (on), or back as it was (off), over about a third of a second. */
  setMuffled(on: boolean): void {
    const route = this.route ?? (on ? this.connect() : null);
    if (!route) return;
    const now = route.ctx.currentTime;
    route.filter.frequency.setTargetAtTime(on ? MUFFLED_CUTOFF_HZ : OPEN_CUTOFF_HZ, now, MUFFLE_TIME_S);
    route.gain.gain.setTargetAtTime(on ? MUFFLED_GAIN : 1, now, MUFFLE_TIME_S);
  }

  private connect(): MuffleRoute | null {
    if (this.stopping) return null;
    try {
      const ctx = getAudioEngine().ctx;
      if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
      const source = ctx.createMediaElementSource(this.audio);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = OPEN_CUTOFF_HZ;
      filter.Q.value = Math.SQRT1_2; // no resonance at the cutoff
      const gain = ctx.createGain();
      source.connect(filter).connect(gain).connect(ctx.destination);
      this.route = { ctx, nodes: [source, filter, gain], filter, gain };
    } catch {
      // without Web Audio the preview plays on as it is
    }
    return this.route;
  }

  private restart(): void {
    if (this.stopping) return;
    this.audio.volume = 0;
    this.audio.currentTime = this.startS;
    this.audio.play().catch(() => undefined);
  }

  private tick(): void {
    if (this.stopping) {
      const left = 1 - (performance.now() - this.stopping.at) / STOP_FADE_MS;
      if (left <= 0) this.finish();
      else this.audio.volume = this.stopping.from * left;
      return;
    }
    if (this.audio.paused) return;
    const t = (this.audio.currentTime - this.startS) * 1000;
    if (t >= this.lengthMs) this.restart();
    else this.audio.volume = this.volume * previewEnvelope(t, this.lengthMs);
  }

  private finish(): void {
    window.clearInterval(this.timer);
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    for (const node of this.route?.nodes ?? []) node.disconnect();
  }
}

/** What the menus need of a preview (a SongPreview; a stand-in in the tests). */
export interface PreviewPlayer {
  stop(): void;
  setVolume(volume: number): void;
  setMuffled(on: boolean): void;
}

/**
 * The menus' music: the selected song's preview, one at a time. It plays on from the song select
 * into the settings, quieter and muffled there (`muffle`), and goes on where it was when the song
 * select comes back. The other screens stop it (App).
 */
export class MenuMusic {
  private current: { songId: string; player: PreviewPlayer } | null = null;
  private muffled = false;

  constructor(private readonly make: (url: string, startMs: number, volume: number) => PreviewPlayer) {}

  /** Whether `songId`'s preview is the one playing. */
  playing(songId: string): boolean {
    return this.current?.songId === songId;
  }

  /** `songId`'s preview, from the start of its highlight unless it is the one already playing. */
  play(songId: string, url: string, startMs: number, volume: number): void {
    if (this.playing(songId)) return;
    this.stop();
    const player = this.make(url, startMs, volume);
    if (this.muffled) player.setMuffled(true);
    this.current = { songId, player };
  }

  stop(): void {
    this.current?.player.stop();
    this.current = null;
  }

  muffle(on: boolean): void {
    if (on === this.muffled) return;
    this.muffled = on;
    this.current?.player.setMuffled(on);
  }

  setVolume(volume: number): void {
    this.current?.player.setVolume(volume);
  }
}

export const menuMusic = new MenuMusic((url, startMs, volume) => new SongPreview(url, startMs, volume));
