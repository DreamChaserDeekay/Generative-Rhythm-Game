import { describe, expect, it } from 'vitest';
import { YouTubeSync, type YouTubePlayerLike } from './youtubeBga';

/** Records what the background asks of YouTube's player. */
class FakePlayer implements YouTubePlayerLike {
  state = -1; // unstarted
  time = 0;
  readonly calls: string[] = [];
  playVideo(): void {
    this.calls.push('play');
    this.state = 1;
  }
  pauseVideo(): void {
    this.calls.push('pause');
    this.state = 2;
  }
  seekTo(seconds: number): void {
    this.calls.push(`seek ${seconds}`);
    this.time = seconds;
  }
  getCurrentTime(): number {
    return this.time;
  }
  getDuration(): number {
    return 200;
  }
  getPlayerState(): number {
    return this.state;
  }
  setPlaybackRate(rate: number): void {
    this.calls.push(`rate ${rate}`);
  }
  mute(): void {
    this.calls.push('mute');
  }
  destroy(): void {}
}

describe('YouTube background video', () => {
  it('starts on song time, pauses with the song and re-seeks when it drifts', () => {
    const p = new FakePlayer();
    const sync = new YouTubeSync(p, 500, 1); // the video starts 0.5 s into the song
    expect(p.calls).toEqual(['mute']);
    sync.update(300, true, 0); // before the video starts
    expect(p.calls).toEqual(['mute']);
    sync.update(2500, true, 10); // 2 s into the video
    expect(p.calls).toEqual(['mute', 'seek 2', 'play']);
    p.time = 2.1;
    sync.update(2600, true, 2000); // on time: left alone
    expect(p.calls).toHaveLength(3);
    p.time = 5;
    sync.update(2700, true, 4000); // drifted: back to song time
    expect(p.calls.at(-1)).toBe('seek 2.2');
    sync.update(2800, false, 4100); // the song pauses
    expect(p.calls.at(-1)).toBe('pause');
  });

  it('plays at the practice speed', () => {
    const p = new FakePlayer();
    new YouTubeSync(p, 0, 0.75);
    expect(p.calls).toEqual(['mute', 'rate 0.75']);
  });
});
