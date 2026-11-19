/**
 * A YouTube video as the background (BGA), played by YouTube's own embedded player (the IFrame
 * Player API, privacy-enhanced host) muted and kept on song time. Nothing is downloaded: the player
 * streams the video like any embed, so it needs a connection and only works for videos whose owner
 * allows embedding.
 *
 * YouTube picks the stream by the player's size on the screen: a player that covers a 1440p screen
 * gets the 1440p stream, often at 60 frames a second, decoded while the play runs (on the processor
 * where the graphics mode cannot hand decoded frames to the card: OpenGL). The player is laid out at
 * most `maxPx` device pixels high (the setting, 480 by default: 480p and below are 30 frames a
 * second) and scaled up to cover the screen; the background is dimmed under the track anyway.
 */

/** The part of the YouTube IFrame player the background uses. */
export interface YouTubePlayerLike {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setPlaybackRate(rate: number): void;
  mute(): void;
  destroy(): void;
  /** The stream it plays ('large' is 480p, 'hd720', 'hd1080', …), where the player still tells it. */
  getPlaybackQuality?(): string;
}

/**
 * The player's box (CSS px) and the scale it is drawn at, for a screen of `width` × `height` CSS px at
 * `dpr`: a 16:9 box that covers the screen, laid out no more than `maxPx` device pixels high and scaled
 * up to the cover size when the screen is larger.
 */
export function youtubeBox(width: number, height: number, dpr: number, maxPx: number): { w: number; h: number; scale: number } {
  const coverW = Math.max(width, (height * 16) / 9);
  const coverH = (coverW * 9) / 16;
  const capH = maxPx / Math.max(dpr, 0.1);
  if (!(coverH > capH)) return { w: coverW, h: coverH, scale: 1 };
  return { w: (capH * 16) / 9, h: capH, scale: coverH / capH };
}

interface YouTubeApi {
  Player: new (
    element: HTMLElement,
    options: {
      host: string;
      videoId: string;
      width: string;
      height: string;
      playerVars: Record<string, string | number>;
      events: { onReady: () => void; onError: (e: { data: number }) => void };
    },
  ) => YouTubePlayerLike;
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const API_URL = 'https://www.youtube.com/iframe_api';
const PLAYER_HOST = 'https://www.youtube-nocookie.com';
const PLAYING = 1;
const BUFFERING = 3;
/** Re-seek when the video is this far from song time (the player reports time coarsely). */
const DRIFT_S = 0.25;
/** Seeking makes the player buffer; give it this long before judging the drift again. */
const SETTLE_MS = 1500;

let apiLoading: Promise<YouTubeApi> | null = null;

/** Loads the IFrame Player API once per page. */
export function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiLoading ??= new Promise<YouTubeApi>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = API_URL;
    script.async = true;
    script.onerror = () => {
      apiLoading = null;
      reject(new Error('유튜브 플레이어를 불러오지 못했습니다'));
    };
    document.head.appendChild(script);
  });
  return apiLoading;
}

/** Shown once the playing video is this close to song time (s, at speed 1). */
const SHOW_WITHIN_S = 0.5;
/** A re-seek this far (s) hides the video while it gets there. */
const HIDE_JUMP_S = 2;

/**
 * Keeps a muted player on song time: plays while the song plays, pauses with it, re-seeks on drift.
 * Until the song reaches the video it is loaded at the point it starts from and paused there, so
 * it starts without buffering. `visible` says when to show it: only while it plays on song time,
 * so YouTube's thumbnail, buffering and title screens stay hidden (the cover shows instead).
 */
export class YouTubeSync {
  private readonly player: YouTubePlayerLike;
  private readonly offsetMs: number;
  private readonly rate: number;
  private lastAction = -Infinity;
  /** Loaded and paused at the start point (or already played). */
  private primed = false;
  private priming = false;
  visible = false;

  constructor(player: YouTubePlayerLike, offsetMs: number, rate: number) {
    this.player = player;
    this.offsetMs = offsetMs;
    this.rate = rate;
    player.mute();
    if (rate !== 1) player.setPlaybackRate(rate);
  }

  update(songMs: number, playing: boolean, perfNow: number): void {
    const p = this.player;
    const target = (songMs - this.offsetMs) / 1000;
    const duration = p.getDuration();
    const inside = target >= 0 && (!(duration > 0) || target < duration);
    const state = p.getPlayerState();
    const moving = state === PLAYING || state === BUFFERING;
    if (!inside) this.visible = false;
    if (!playing || !inside) {
      if (!this.primed && !(duration > 0 && target >= duration)) {
        this.prime(Math.max(0, target), state, perfNow);
        return;
      }
      if (moving) p.pauseVideo();
      return;
    }
    if (this.priming) {
      // the song reached the video before it was loaded: play on from here
      this.priming = false;
      this.primed = true;
      this.lastAction = -Infinity;
    }
    if (state === PLAYING && Math.abs(p.getCurrentTime() - target) <= SHOW_WITHIN_S * this.rate) this.visible = true;
    // a play or seek takes a moment to show in the player's state
    if (perfNow - this.lastAction < SETTLE_MS) return;
    if (!moving) {
      p.seekTo(target, true);
      p.playVideo();
      this.lastAction = perfNow;
    } else if (state === PLAYING && Math.abs(p.getCurrentTime() - target) > DRIFT_S * this.rate) {
      // a jump (a practice loop going round) hides it until it is back on time
      if (Math.abs(p.getCurrentTime() - target) > HIDE_JUMP_S) this.visible = false;
      p.seekTo(target, true);
      this.lastAction = perfNow;
    }
  }

  /** Loads the video at `at` s: plays it (muted, hidden) until it moves, then pauses it there. */
  private prime(at: number, state: number, perfNow: number): void {
    const p = this.player;
    if (this.priming && state === PLAYING) {
      p.pauseVideo();
      p.seekTo(at, true);
      this.priming = false;
      this.primed = true;
      // (the song may start any moment: nothing to wait for)
      this.lastAction = -Infinity;
      return;
    }
    if (perfNow - this.lastAction < SETTLE_MS) return;
    p.seekTo(at, true);
    p.playVideo();
    this.priming = true;
    this.lastAction = perfNow;
  }
}

/** How often the stream the player plays is written on its element (for the app's log). */
const QUALITY_EVERY_MS = 2000;

/** The background video element: YouTube's player inside `container`, synced once it is ready. */
export class YouTubeBackground {
  private player: YouTubePlayerLike | null = null;
  private sync: YouTubeSync | null = null;
  private disposed = false;
  private shown = false;
  private readonly container: HTMLElement;
  private readonly maxPx: number;
  private readonly resize: ResizeObserver | null = null;
  private qualityAt = -Infinity;

  constructor(container: HTMLElement, videoId: string, offsetMs: number, rate: number, maxPx = 480) {
    this.container = container;
    this.maxPx = maxPx;
    // hidden until it plays on song time: the cover shows through meanwhile
    container.style.opacity = '0';
    container.style.transition = 'opacity 0.4s ease';
    // the player laid out small and scaled up (see the top): again when the screen changes
    container.dataset.cap = `${maxPx}p`;
    this.fit();
    if (typeof ResizeObserver === 'function') {
      this.resize = new ResizeObserver(() => this.fit());
      this.resize.observe(container);
    }
    window.addEventListener('resize', this.fit);
    const holder = document.createElement('div');
    container.appendChild(holder);
    loadYouTubeApi()
      .then((YT) => {
        if (this.disposed) return;
        this.player = new YT.Player(holder, {
          host: PLAYER_HOST,
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            playsinline: 1,
            rel: 0,
            mute: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (!this.disposed && this.player) this.sync = new YouTubeSync(this.player, offsetMs, rate);
            },
            // embedding not allowed, removed video, no connection: the song plays without it
            onError: () => this.dispose(),
          },
        });
      })
      .catch(() => undefined);
  }

  update(songMs: number, playing: boolean, perfNow: number): void {
    if (!this.sync) return;
    this.sync.update(songMs, playing, perfNow);
    if (this.sync.visible !== this.shown) {
      this.shown = this.sync.visible;
      this.container.style.opacity = this.shown ? '1' : '0';
    }
    if (perfNow - this.qualityAt >= QUALITY_EVERY_MS) {
      this.qualityAt = perfNow;
      try {
        const quality = this.player?.getPlaybackQuality?.();
        if (quality) this.container.dataset.quality = quality;
      } catch {
        // the player does not tell it any more
      }
    }
  }

  /** The player's box and scale for the screen as it is now (CSS variables of the iframe's rule). */
  private readonly fit = (): void => {
    const rect = this.container.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;
    const box = youtubeBox(width, height, window.devicePixelRatio || 1, this.maxPx);
    this.container.style.setProperty('--yt-w', `${box.w.toFixed(2)}px`);
    this.container.style.setProperty('--yt-h', `${box.h.toFixed(2)}px`);
    this.container.style.setProperty('--yt-scale', box.scale.toFixed(4));
  };

  dispose(): void {
    this.disposed = true;
    this.resize?.disconnect();
    window.removeEventListener('resize', this.fit);
    this.sync = null;
    this.container.style.opacity = '0';
    try {
      this.player?.destroy();
    } catch {
      // the player never finished loading
    }
    this.player = null;
  }
}
