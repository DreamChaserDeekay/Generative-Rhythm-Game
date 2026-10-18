/** The highlight played on the song select screen: it loops this long from the preview point. */
export const PREVIEW_LENGTH_MS = 20000;
const FADE_IN_MS = 1000;
const FADE_OUT_MS = 1500;
/** Leaving the song (another song, a play) fades the preview out this fast. */
const STOP_FADE_MS = 300;
const TICK_MS = 30;

/** Volume share at `t` ms into the highlight: fades in at the start and out before it loops. */
export function previewEnvelope(t: number, lengthMs: number = PREVIEW_LENGTH_MS): number {
  if (t <= 0 || t >= lengthMs) return 0;
  return Math.min(1, t / FADE_IN_MS, (lengthMs - t) / FADE_OUT_MS);
}

/**
 * The song preview: the highlight from `startMs` fades in, plays PREVIEW_LENGTH_MS, fades out and
 * starts again (also when the song ends first). `stop` fades it out quickly.
 */
export class SongPreview {
  private readonly audio: HTMLAudioElement;
  private readonly startS: number;
  private readonly volume: number;
  private readonly timer: number;
  private stopping: { at: number; from: number } | null = null;

  constructor(url: string, startMs: number, volume: number) {
    this.startS = startMs / 1000;
    this.volume = volume;
    this.audio = new Audio(url);
    this.audio.volume = 0;
    this.audio.addEventListener('loadedmetadata', () => this.restart());
    this.audio.addEventListener('ended', () => this.restart());
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.stopping) return;
    this.stopping = { at: performance.now(), from: this.audio.volume };
    if (this.audio.paused) this.finish();
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
    if (t >= PREVIEW_LENGTH_MS) this.restart();
    else this.audio.volume = this.volume * previewEnvelope(t);
  }

  private finish(): void {
    window.clearInterval(this.timer);
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
  }
}
