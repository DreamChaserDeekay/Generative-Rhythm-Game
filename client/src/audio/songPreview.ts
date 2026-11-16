import { getAudioEngine } from './AudioEngine';

/** The highlight played on the song select screen: it loops this long from the preview point. */
export const PREVIEW_LENGTH_MS = 60000;
/** The preview plays at this share of the music volume. */
export const PREVIEW_VOLUME = 0.6;
export const FADE_IN_MS = 1500;
const FADE_OUT_MS = 3500;
/**
 * Leaving the song (another song, a play) fades the preview out over this long from full volume
 * (from a quieter point, as much shorter). The next song's preview waits until it is silent.
 */
export const STOP_FADE_MS = 700;
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

/** How long a preview at `from` of its full volume `full` takes to fade out when it is stopped. */
export function stopFadeMs(from: number, full: number): number {
  if (!(from > 0) || !(full > 0)) return 0;
  return STOP_FADE_MS * Math.min(1, from / full);
}

/** How long the highlight from `startMs` plays: PREVIEW_LENGTH_MS, or up to the song's end if that comes first. */
export function previewLength(durationMs: number, startMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= startMs) return PREVIEW_LENGTH_MS;
  return Math.min(PREVIEW_LENGTH_MS, durationMs - startMs);
}

/**
 * The song preview: the highlight from `startMs` fades in, plays PREVIEW_LENGTH_MS (fading out
 * before the song's end when that comes first) and starts again. `stop` fades it out. It loads at
 * once but stays silent for `delayMs` (the last song's preview fading out meanwhile).
 */
export class SongPreview {
  private readonly audio: HTMLAudioElement;
  private readonly startS: number;
  private volume: number;
  private readonly timer: number;
  private lengthMs = PREVIEW_LENGTH_MS;
  private stopping: { at: number; from: number; ms: number } | null = null;
  /** Not before this (performance.now()) does it start to play. */
  private readonly startAt: number;
  private loaded = false;
  /** The Web Audio route that muffles it, made the first time it is muffled (until then the element plays as it is). */
  private route: MuffleRoute | null = null;

  constructor(url: string, startMs: number, volume: number, delayMs = 0) {
    this.startS = startMs / 1000;
    this.volume = volume;
    this.startAt = performance.now() + Math.max(0, delayMs);
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.volume = 0;
    this.audio.addEventListener('loadedmetadata', () => {
      this.lengthMs = previewLength(this.audio.duration * 1000, startMs);
      this.loaded = true;
      // (buffered from the highlight on while it waits)
      this.audio.currentTime = this.startS;
      if (performance.now() >= this.startAt) this.restart();
    });
    this.audio.src = url;
    this.audio.addEventListener('ended', () => this.restart());
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  /** Fades it out; returns how long (ms) until it is silent. */
  stop(): number {
    if (this.stopping) return Math.max(0, this.stopping.at + this.stopping.ms - performance.now());
    const from = this.audio.paused ? 0 : this.audio.volume;
    const ms = stopFadeMs(from, this.volume);
    this.stopping = { at: performance.now(), from, ms };
    if (ms <= 0) this.finish();
    return ms;
  }

  setVolume(volume: number): void {
    this.volume = volume;
  }

  /** Where in the song it is now, in ms (null: not playing yet, or on its way out). */
  songMs(): number | null {
    return this.stopping || this.audio.paused ? null : this.audio.currentTime * 1000;
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

  private started = false;

  private restart(): void {
    if (this.stopping) return;
    this.started = true;
    this.audio.volume = 0;
    this.audio.currentTime = this.startS;
    this.audio.play().catch(() => undefined);
  }

  private tick(): void {
    if (this.stopping) {
      const left = 1 - (performance.now() - this.stopping.at) / this.stopping.ms;
      if (left <= 0) this.finish();
      else this.audio.volume = this.stopping.from * left;
      return;
    }
    if (this.audio.paused) {
      if (this.loaded && !this.started && performance.now() >= this.startAt) this.restart();
      return;
    }
    const t = (this.audio.currentTime - this.startS) * 1000;
    if (t >= this.lengthMs) this.restart();
    else this.audio.volume = this.volume * previewEnvelope(t, this.lengthMs);
  }

  private finished = false;

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    window.clearInterval(this.timer);
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    for (const node of this.route?.nodes ?? []) node.disconnect();
  }
}

/** What the menus need of a preview (a SongPreview; a stand-in in the tests). */
export interface PreviewPlayer {
  /** Fades it out; how long (ms) until it is silent (nothing: at once). */
  stop(): number | void;
  setVolume(volume: number): void;
  setMuffled(on: boolean): void;
  songMs?(): number | null;
}

/**
 * The menus' music: the selected song's preview, one at a time. It plays on from the song select
 * into the settings, quieter and muffled there (`muffle`), and goes on where it was when the song
 * select comes back. The other screens stop it (App). Previews never overlap: the next one waits
 * until the last has faded out, however fast the songs go by.
 */
export class MenuMusic {
  private current: { songId: string; player: PreviewPlayer } | null = null;
  private muffled = false;
  /** When (now()) the preview stopped last is silent. */
  private quietAt = -Infinity;

  constructor(
    private readonly make: (url: string, startMs: number, volume: number, delayMs: number) => PreviewPlayer,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Whether `songId`'s preview is the one playing. */
  playing(songId: string): boolean {
    return this.current?.songId === songId;
  }

  /** `songId`'s preview, from the start of its highlight unless it is the one already playing. */
  play(songId: string, url: string, startMs: number, volume: number): void {
    if (this.playing(songId)) return;
    this.stop();
    const player = this.make(url, startMs, volume, Math.max(0, this.quietAt - this.now()));
    if (this.muffled) player.setMuffled(true);
    this.current = { songId, player };
  }

  stop(): void {
    if (!this.current) return;
    const ms = this.current.player.stop() ?? 0;
    this.quietAt = Math.max(this.quietAt, this.now() + ms);
    this.current = null;
  }

  /** Where `songId`'s preview is in its song now, in ms (null: it is not the one sounding). */
  songMs(songId: string): number | null {
    return this.current?.songId === songId ? (this.current.player.songMs?.() ?? null) : null;
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

export const menuMusic = new MenuMusic((url, startMs, volume, delayMs) => new SongPreview(url, startMs, volume, delayMs));
