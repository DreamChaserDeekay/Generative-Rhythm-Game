import { context2d, whenRestored } from '../render/paintCanvas';
import { token } from './theme';
import { YouTubeBackground } from './youtubeBga';

export interface BackgroundOptions {
  root: HTMLElement;
  coverUrl: string | null;
  /** User video (BGA); plays muted and follows song time. */
  bgaUrl: string | null;
  /** Or a YouTube video, played muted by YouTube's embedded player on song time. */
  bgaYoutube: string | null;
  /**
   * The video's shift against the song: + starts it that many ms into the song (the cover shows
   * until then), - skips that many ms of its start (it is already that far in as the song starts).
   */
  bgaOffsetMs: number;
  /** Practice playback rate (the video plays at the same speed). */
  rate: number;
  /** 0 = black, 1 = full brightness. */
  brightness: number;
  visualizer: boolean;
  reducedFlash: boolean;
  analyser: AnalyserNode | null;
}

/** The jacket is drawn this many pixels wide and stretched over the screen: soft colour, no blur filter. */
const COVER_PX = 24;
const BARS = 48;
const VISUALIZER_FPS = 30;
const VIDEO_DRIFT_S = 0.12;
const VIDEO_RESYNC_MS = 500;
/** The video shows once it plays this close (s) to song time. */
const VIDEO_SHOW_WITHIN_S = 0.5;

/** Largest shift of the background video against the song (ms, either way; as the server allows). */
export const BGA_OFFSET_MAX_MS = 60000;

/** `ms` as a shift the server takes: whole ms within ±BGA_OFFSET_MAX_MS (null: not a number). */
export function clampBgaOffset(ms: number): number | null {
  if (!Number.isFinite(ms)) return null;
  return Math.min(BGA_OFFSET_MAX_MS, Math.max(-BGA_OFFSET_MAX_MS, Math.round(ms)));
}

const seconds = (ms: number) => `${Number((Math.abs(ms) / 1000).toFixed(3))}초`;

/** What a shift does, in words: which way and how far. */
export function describeBgaOffset(ms: number): string {
  if (ms > 0) return `영상을 ${seconds(ms)} 늦게 시작 (그동안 커버가 보입니다)`;
  if (ms < 0) return `영상 앞부분 ${seconds(ms)} 건너뛰기`;
  return '곡과 영상을 같이 시작';
}

/**
 * Layer behind the track: the jacket as a soft colour field, optional user video synced to song
 * time, an audio-reactive spectrum and a dimming overlay. All DOM; nothing here touches judgement.
 */
export class PlayBackground {
  private readonly root: HTMLElement;
  private readonly video: HTMLVideoElement | null = null;
  private readonly youtube: YouTubeBackground | null = null;
  private readonly canvas: HTMLCanvasElement | null = null;
  private readonly ctx: CanvasRenderingContext2D | null = null;
  private readonly analyser: AnalyserNode | null;
  private readonly bins: Uint8Array<ArrayBuffer>;
  private readonly options: BackgroundOptions;
  private lastDraw = 0;
  private lastSeek = 0;
  private videoShown = false;
  /** Spectrum colour (the accent token). */
  private readonly color = token('--field-accent');

  constructor(options: BackgroundOptions) {
    this.options = options;
    this.root = options.root;
    this.root.innerHTML = '';
    if (options.coverUrl) {
      const cover = document.createElement('canvas');
      cover.className = 'bg-cover';
      cover.width = COVER_PX;
      cover.height = COVER_PX;
      const image = new Image();
      const paint = () => {
        if (image.complete && image.naturalWidth > 0) context2d(cover).drawImage(image, 0, 0, COVER_PX, COVER_PX);
      };
      image.onload = paint;
      // (again whenever the browser hands the canvas back empty: a lost graphics process)
      whenRestored(cover, paint);
      image.src = options.coverUrl;
      this.root.appendChild(cover);
    }
    if (options.bgaUrl) {
      const video = document.createElement('video');
      video.className = 'bg-video';
      video.src = options.bgaUrl;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.playbackRate = options.rate;
      // hidden until it plays on song time (the cover shows through meanwhile)
      video.style.opacity = '0';
      video.style.transition = 'opacity 0.4s ease';
      this.root.appendChild(video);
      this.video = video;
    } else if (options.bgaYoutube) {
      const frame = document.createElement('div');
      frame.className = 'bg-youtube';
      this.root.appendChild(frame);
      this.youtube = new YouTubeBackground(frame, options.bgaYoutube, options.bgaOffsetMs, options.rate);
    }
    this.analyser = options.visualizer ? options.analyser : null;
    this.bins = new Uint8Array(this.analyser ? this.analyser.frequencyBinCount : 0);
    if (this.analyser) {
      const canvas = document.createElement('canvas');
      canvas.className = 'bg-visualizer';
      this.root.appendChild(canvas);
      this.canvas = canvas;
      // drawn afresh many times a second while the song plays: on the graphics card, and by itself again after it was lost
      this.ctx = canvas.getContext('2d');
    }
    const dim = document.createElement('div');
    dim.className = 'bg-dim';
    dim.style.opacity = String(1 - Math.min(1, Math.max(0, options.brightness)));
    this.root.appendChild(dim);
  }

  update(songMs: number, playing: boolean, perfNow: number): void {
    this.syncVideo(songMs, playing, perfNow);
    this.youtube?.update(songMs, playing, perfNow);
    // the spectrum stays still while paused, like the track
    if (playing && this.analyser && this.ctx && this.canvas && perfNow - this.lastDraw >= 1000 / VISUALIZER_FPS) {
      this.lastDraw = perfNow;
      this.drawSpectrum(this.ctx, this.canvas, this.analyser);
    }
  }

  dispose(): void {
    this.youtube?.dispose();
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    }
    this.root.innerHTML = '';
  }

  private syncVideo(songMs: number, playing: boolean, perfNow: number): void {
    const video = this.video;
    if (!video || video.readyState < 2) return;
    const target = (songMs - this.options.bgaOffsetMs) / 1000;
    const inside = target >= 0 && (!Number.isFinite(video.duration) || target < video.duration);
    if (!inside) this.showVideo(video, false);
    else if (playing && !video.paused && !video.seeking && Math.abs(video.currentTime - target) <= VIDEO_SHOW_WITHIN_S * this.options.rate) this.showVideo(video, true);
    if (!playing || !inside) {
      if (!video.paused) video.pause();
      // waiting at the point it starts from (a - shift: already some way in), loaded there
      const at = Math.max(0, Number.isFinite(video.duration) ? Math.min(target, video.duration) : target);
      if (!video.seeking && Math.abs(video.currentTime - at) > VIDEO_DRIFT_S) video.currentTime = at;
      return;
    }
    if (video.paused) {
      video.currentTime = target;
      void video.play().catch(() => undefined);
      this.lastSeek = perfNow;
    } else if (Math.abs(video.currentTime - target) > VIDEO_DRIFT_S && perfNow - this.lastSeek > VIDEO_RESYNC_MS) {
      video.currentTime = target;
      this.lastSeek = perfNow;
    }
  }

  private showVideo(video: HTMLVideoElement, on: boolean): void {
    if (on === this.videoShown) return;
    this.videoShown = on;
    video.style.opacity = on ? '1' : '0';
  }

  private drawSpectrum(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, analyser: AnalyserNode): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    analyser.getByteFrequencyData(this.bins);
    ctx.clearRect(0, 0, w, h);
    // log-spaced bands from ~60 Hz up, mirrored around the centre
    const n = this.bins.length;
    ctx.fillStyle = this.color;
    ctx.globalAlpha = this.options.reducedFlash ? 0.16 : 0.32;
    const barW = w / (BARS * 2);
    for (let b = 0; b < BARS; b++) {
      const lo = Math.floor(2 * Math.pow(n / 2, b / BARS));
      const hi = Math.max(lo + 1, Math.floor(2 * Math.pow(n / 2, (b + 1) / BARS)));
      let v = 0;
      for (let k = lo; k < hi && k < n; k++) v = Math.max(v, this.bins[k]);
      const bh = (v / 255) * h * 0.45;
      ctx.fillRect(w / 2 + b * barW, h - bh, barW * 0.7, bh);
      ctx.fillRect(w / 2 - (b + 1) * barW, h - bh, barW * 0.7, bh);
    }
  }
}
