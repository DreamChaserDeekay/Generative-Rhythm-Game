import { describe, expect, it } from 'vitest';
import { activeTrail, noteTrail, setActiveTrail, Trail, TRAIL_MS } from './trail';

describe('the trail of the track’s last seconds', () => {
  it('tells the frames: how many, the usual and the longest, the long ones by when, the last few, and how long since the last', () => {
    const trail = new Trail();
    // 8 ms frames from 0 to 4 s, one of 41 ms at 2 s (a hitch) and one of 25 ms at 3.2 s
    let at = 0;
    const frame = (ms: number) => {
      at += ms;
      trail.frame(at);
    };
    trail.frame(0);
    while (at < 2000) frame(8);
    frame(41);
    while (at < 3200) frame(8);
    frame(25);
    while (at < 4000) frame(8);
    const text = trail.frames(4010);
    const field = (name: string) => new RegExp(`(?:^| )${name}=(\\S+)`).exec(text)?.[1];
    // (only the frames of the last three seconds)
    expect(Number(field('n'))).toBeGreaterThan(350);
    expect(Number(field('n'))).toBeLessThan(380);
    expect(field('med')).toBe('8');
    expect(field('max')).toBe('41');
    expect(field('long')).toBe(`${2041 - 4010}:41,${at - 4010 - Math.round((at - 3225) / 8) * 8}:25`);
    expect(field('last')?.split(',').length).toBe(40);
    expect(field('last')?.split(',').every((ms) => ms === '8')).toBe(true);
    expect(field('ago')).toBe(String(4010 - at));
  });

  it('keeps the frames of a fast screen for the whole time told, and tells nothing of none', () => {
    const fast = new Trail();
    for (let i = 0; i <= 2000; i++) fast.frame(i * (1000 / 240));
    const n = Number(/n=(\d+)/.exec(fast.frames((2000 * 1000) / 240))?.[1]);
    expect(n).toBeGreaterThanOrEqual(Math.floor((TRAIL_MS * 240) / 1000) - 1);
    expect(new Trail().frames(1000)).toBe('n=0');
    const one = new Trail();
    one.frame(990);
    expect(one.frames(1000)).toBe('n=0 ago=10');
  });

  it('notes what changes: a value when it is another, a moving number when it leaves its band, a pose now and then', () => {
    const trail = new Trail();
    // the first value is where things stand, not a change
    trail.watch('tex', 41, 100);
    trail.watch('tex', 41, 200);
    trail.watch('tex', 42, 300);
    trail.watch('fever', 0, 300);
    trail.watch('fever', 2, 900);
    for (const [at, calls] of [[1000, 300], [1010, 340], [1020, 449], [1030, 451], [1040, 460], [1050, 300]] as const) trail.level('calls', calls, at);
    trail.sample('cam', 'roll=0.10 fov=0.95', 500, 1100);
    trail.sample('cam', 'roll=0.11 fov=0.95', 500, 1200);
    trail.sample('cam', 'roll=0.20 fov=0.90', 500, 1650);
    trail.sample('cam', 'roll=0.20 fov=0.90', 500, 2300);
    trail.note('deck:paint', 2000);
    expect(trail.told(2500)).toBe('-2200 tex:41>42; -1600 fever:0>2; -1470 calls:300>451; -1450 calls:451>300; -1400 cam roll=0.10 fov=0.95; -850 cam roll=0.20 fov=0.90; -500 deck:paint');
    // what is older than the time told is left out
    expect(trail.told(2000 + TRAIL_MS - 300)).toBe('-2700 deck:paint');
    expect(trail.told(2000 + TRAIL_MS + 1)).toBe('');
  });

  it('counts a thing noted over and over, tallies what is too frequent to note, and lets the oldest go when the line gets long', () => {
    const trail = new Trail();
    for (let i = 0; i < 12; i++) trail.note('hud:fit', 1000 + i * 16);
    trail.note('hud:fit', 2000);
    expect(trail.told(2100)).toBe('-924 hud:fit x12; -100 hud:fit');
    for (let i = 0; i < 57; i++) trail.tally('hits', 2000 + i * 10);
    trail.frame(2560);
    trail.frame(2568);
    expect(trail.frames(2570)).toBe('n=1 med=8 max=8 last=8 ago=2 hits=57');
    // (the tally is of the time told as well: the hits of the last three seconds)
    expect(trail.frames(2570 + 2500)).toBe('n=1 med=8 max=8 last=8 ago=2502 hits=50');
    expect(trail.frames(2570 + TRAIL_MS)).toBe('n=0 ago=3002');
    const many = new Trail();
    for (let i = 0; i < 90; i++) many.note(`something that happened number ${i}`, 3000 + i * 30);
    const text = many.told(3000 + 90 * 30);
    expect(text.length).toBeLessThanOrEqual(1500 + 3);
    expect(text.startsWith('…; ')).toBe(true);
    expect(text.endsWith('-30 something that happened number 89')).toBe(true);
  });

  it('tells a time gone by: the frames up to it, and what happened before it and after it', () => {
    const trail = new Trail();
    for (let at = 0; at <= 1000; at += 10) trail.frame(at);
    trail.note('deck:paint', 400);
    // then nothing for three seconds, and the frames go on
    trail.frame(4000);
    trail.note('recovered', 4002);
    trail.frame(4010);
    // as of the last frame before the stall: its frames only, none of them long
    expect(trail.frames(1000, 1000)).toBe(`n=100 med=10 max=10 last=${Array(40).fill('10').join(',')} ago=0`);
    // without the limit the stall itself is among the frames (the frame that ended it came 3 s later)
    expect(trail.frames(1000)).toMatch(/ max=3000 long=3000:3000 /);
    // what happened: before that time, and after it with a plus
    expect(trail.told(1000)).toBe('-600 deck:paint; +3002 recovered');
  });

  it('takes notes from outside the renderer for the track that is up', () => {
    setActiveTrail(null);
    expect(() => noteTrail('hud:lamp')).not.toThrow();
    const trail = new Trail();
    setActiveTrail(trail);
    expect(activeTrail()).toBe(trail);
    noteTrail('hud:lamp');
    expect(trail.told()).toMatch(/^-?\d+ hud:lamp$/);
    setActiveTrail(null);
  });
});
