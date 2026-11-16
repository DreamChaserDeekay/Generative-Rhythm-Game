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
    sync.update(300, true, 0); // before the video starts: loaded at its start, hidden
    expect(p.calls).toEqual(['mute', 'seek 0', 'play']);
    sync.update(400, true, 50); // it moved: paused there until the song gets to it
    expect(p.calls.slice(3)).toEqual(['pause', 'seek 0']);
    expect(sync.visible).toBe(false);
    sync.update(2500, true, 100); // 2 s into the video: no waiting on the load
    expect(p.calls.slice(5)).toEqual(['seek 2', 'play']);
    expect(sync.visible).toBe(false); // shown once it is seen playing
    p.time = 2.1;
    sync.update(2600, true, 2000); // on time: left alone, and shown
    expect(p.calls).toHaveLength(7);
    expect(sync.visible).toBe(true);
    p.time = 5;
    sync.update(2700, true, 4000); // drifted: back to song time
    expect(p.calls.at(-1)).toBe('seek 2.2');
    sync.update(2800, false, 4100); // the song pauses
    expect(p.calls.at(-1)).toBe('pause');
  });

  it('starts later with a + shift (hidden meanwhile) and skips the start with a - shift', () => {
    const late = new FakePlayer();
    const s1 = new YouTubeSync(late, 13000, 1);
    s1.update(-2000, false, 0); // the lead-in: loaded at 0
    s1.update(0, true, 20);
    expect(late.calls).toEqual(['mute', 'seek 0', 'play', 'pause', 'seek 0']);
    s1.update(12000, true, 5000); // 12 s into the song: still waiting, still hidden
    expect(late.calls).toHaveLength(5);
    expect(s1.visible).toBe(false);
    s1.update(14000, true, 6000);
    expect(late.calls.slice(5)).toEqual(['seek 1', 'play']);
    s1.update(14050, true, 6050);
    expect(s1.visible).toBe(true);

    const early = new FakePlayer();
    const s2 = new YouTubeSync(early, -13000, 1);
    s2.update(-2000, false, 0); // loaded at 11 s of the video before the song starts
    expect(early.calls).toEqual(['mute', 'seek 11', 'play']);
    s2.update(0, true, 20); // the song starts: the video is at 13 s with it
    expect(early.calls.slice(3)).toEqual(['seek 13']); // (already moving from the load)
    s2.update(50, true, 70);
    expect(s2.visible).toBe(true);
  });

  it('plays at the practice speed', () => {
    const p = new FakePlayer();
    new YouTubeSync(p, 0, 0.75);
    expect(p.calls).toEqual(['mute', 'rate 0.75']);
  });
});
