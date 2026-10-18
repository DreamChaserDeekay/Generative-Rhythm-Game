import { token } from './theme';

export interface BackgroundOptions {
  root: HTMLElement;
  coverUrl: string | null;
  /** User video (BGA); plays muted and follows song time. */
  bgaUrl: string | null;
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

/**
 * Layer behind the track: the jacket as a soft colour field, optional user video synced to song
 * time, an audio-reactive spectrum and a dimming overlay. All DOM; nothing here touches judgement.
 */
export class PlayBackground {
  private readonly root: HTMLElement;
  private readonly video: HTMLVideoElement | null = null;
  private readonly canvas: HTMLCanvasElement | null = null;
  private readonly ctx: CanvasRenderingContext2D | null = null;
  private readonly analyser: AnalyserNode | null;
  private readonly bins: Uint8Array<ArrayBuffer>;
  private readonly options: BackgroundOptions;
  private lastDraw = 0;
  private lastSeek = 0;
  /** Spectrum colour (the accent token). */
  private readonly color = token('--accent');

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
      image.onload = () => cover.getContext('2d')?.drawImage(image, 0, 0, COVER_PX, COVER_PX);
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
      this.root.appendChild(video);
      this.video = video;
    }
    this.analyser = options.visualizer ? options.analyser : null;
    this.bins = new Uint8Array(this.analyser ? this.analyser.frequencyBinCount : 0);
    if (this.analyser) {
      const canvas = document.createElement('canvas');
      canvas.className = 'bg-visualizer';
      this.root.appendChild(canvas);
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
    }
    const dim = document.createElement('div');
    dim.className = 'bg-dim';
    dim.style.opacity = String(1 - Math.min(1, Math.max(0, options.brightness)));
    this.root.appendChild(dim);
  }

  update(songMs: number, playing: boolean, perfNow: number): void {
    this.syncVideo(songMs, playing, perfNow);
    // the spectrum stays still while paused, like the track
    if (playing && this.analyser && this.ctx && this.canvas && perfNow - this.lastDraw >= 1000 / VISUALIZER_FPS) {
      this.lastDraw = perfNow;
      this.drawSpectrum(this.ctx, this.canvas, this.analyser);
    }
  }

  dispose(): void {
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
    if (!playing || !inside) {
      if (!video.paused) video.pause();
      if (!inside && target < 0 && video.currentTime !== 0) video.currentTime = 0;
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
