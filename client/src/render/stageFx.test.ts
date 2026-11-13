import { describe, expect, it } from 'vitest';
import { cameraConfig } from '../engine/config';
import { TempoMap } from '../engine/tempo';
import {
  ENTRY,
  EXIT,
  FAIL_FALL_MS,
  INTRO_MIN_MS,
  LANE_DARK,
  entryPose,
  entryShare,
  exitPose,
  failFrame,
  fallOrder,
  introEnd,
  introFrame,
  lightOrder,
  litFrame,
  outroFrame,
  planIntro,
  resumeLine,
  springRest,
  tapeStopTime,
} from './stageFx';

const tempoAt = (bpm: number, offsetMs = 0) => new TempoMap({ offsetMs, tempoMap: [{ beat: 0, bpm }], meter: [{ measure: 0, beatsPerMeasure: 4 }] });

/** Lanes of equal width side by side across the track, the first on the left. */
const lanesAcross = (n: number) => Array.from({ length: n }, (_, index) => ({ index, x: index - (n - 1) / 2 }));

describe('the order the lanes light in', () => {
  it('runs from the middle of the track outward, of a pair the left one first', () => {
    expect(lightOrder(lanesAcross(4))).toEqual([1, 2, 0, 3]);
    expect(lightOrder(lanesAcross(5))).toEqual([2, 1, 3, 0, 4]);
    expect(lightOrder(lanesAcross(7))).toEqual([3, 2, 4, 1, 5, 0, 6]);
  });

  it('leaves out a side lane laid over the keys: it has no floor of its own', () => {
    const lanes = [...lanesAcross(4), { index: 4, x: -1, over: true }, { index: 5, x: 1, over: true }];
    expect(lightOrder(lanes)).toEqual([1, 2, 0, 3]);
  });

  it('drops a failed play\'s lanes in an order without a pattern, every lane once, the same every time', () => {
    const order = lightOrder(lanesAcross(8));
    const falls = fallOrder(order);
    expect([...falls].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(falls).toEqual(fallOrder(order));
    expect(falls).not.toEqual(order);
    expect(falls).not.toEqual([...order].reverse());
  });
});

describe('a start: when the lanes light and the judge line is drawn', () => {
  it('lights a lane a beat on the chart\'s beats where there is room, the judge line after the last', () => {
    // 150 BPM: a beat is 400 ms; the run starts 1.5 s before the song, the first note is far off
    const plan = planIntro([1, 2, 0, 3], 4, -1500, 6000, 1, tempoAt(150));
    // the first beat no sooner than 150 ms into the run
    expect(plan.laneAt).toEqual([-400, -1200, -800, 0]);
    expect(plan.lineFrom).toBe(400);
    expect(plan.lineTo).toBe(800);
  });

  it('follows the chart\'s own beats: its offset moves them', () => {
    const plan = planIntro([0, 1], 2, -1500, 6000, 1, tempoAt(150, 130));
    expect(plan.laneAt).toEqual([-1070, -670]);
  });

  it('halves the beat where the lanes would take too long to be lit, or a beat is too long', () => {
    // eight lanes a beat at 120 BPM would take four seconds
    const many = planIntro(lightOrder(lanesAcross(8)), 8, -1500, 9000, 1, tempoAt(120));
    const times = [...many.laneAt].sort((a, b) => a - b);
    expect(times[1] - times[0]).toBe(250);
    expect(times[7] - times[0]).toBe(1750);
    // 80 BPM: a beat is 750 ms
    const slow = planIntro([0, 1], 2, -1500, 9000, 1, tempoAt(80));
    expect(slow.laneAt[1] - slow.laneAt[0]).toBe(375);
  });

  it('takes quarter beats where the first note comes into sight soon', () => {
    // the sync test at SPEED 4: the run starts at -1600 and the first note is in sight at 750
    const plan = planIntro(lightOrder(lanesAcross(8)), 8, -1600, 750, 1, tempoAt(120, 2000));
    const times = [...plan.laneAt].sort((a, b) => a - b);
    expect(times[1] - times[0]).toBe(125);
    expect(times[0]).toBeGreaterThanOrEqual(-1450);
    expect(plan.lineFrom).toBe(times[7] + 125);
    expect(plan.lineTo).toBeLessThanOrEqual(750 - 80);
  });

  it('spreads the lanes evenly over the room there is where no beat fits', () => {
    const plan = planIntro([1, 2, 0, 3], 4, 0, 600, 1, tempoAt(120));
    const times = [1, 2, 0, 3].map((lane) => plan.laneAt[lane]);
    expect(times[0]).toBe(150);
    for (let i = 1; i < 4; i++) expect(times[i] - times[i - 1]).toBeCloseTo(times[1] - times[0], 6);
    expect(plan.lineFrom).toBeGreaterThanOrEqual(times[3]);
    expect(plan.lineTo).toBe(520);
  });

  it('shows nothing with too little room, or no lanes: every lane lit and the judge line whole from the first frame', () => {
    for (const plan of [planIntro([0, 1, 2, 3], 4, 0, INTRO_MIN_MS - 1, 1, tempoAt(120)), planIntro([0, 1, 2, 3], 4, 500, -200, 1, tempoAt(120)), planIntro([], 4, -1500, 6000, 1, tempoAt(120))]) {
      expect(plan.laneAt).toEqual([-Infinity, -Infinity, -Infinity, -Infinity]);
      expect(plan.lineTo).toBe(-Infinity);
      expect(introEnd(plan, 1)).toBe(-Infinity);
      const frame = litFrame(4);
      introFrame(frame, plan, -1e6, 1);
      expect(frame).toEqual(litFrame(4));
    }
  });

  it('counts its room in real time: a slowed practice has more song before its first note for the same room', () => {
    // half speed: 400 real ms of room is 200 song ms
    expect(planIntro([0], 1, 0, 199, 0.5, tempoAt(120)).lineTo).toBe(-Infinity);
    expect(planIntro([0], 1, 0, 200, 0.5, tempoAt(120)).lineTo).toBe(160);
  });

  it('draws a lane dark until its moment, then lit with a flare that fades, and the judge line from nothing to whole', () => {
    const plan = planIntro([1, 2, 0, 3], 4, -1500, 6000, 1, tempoAt(150));
    const frame = litFrame(4);
    introFrame(frame, plan, -1300, 1);
    expect(frame.dark).toEqual([LANE_DARK, LANE_DARK, LANE_DARK, LANE_DARK]);
    expect(frame.flare).toEqual([0, 0, 0, 0]);
    expect(frame.line).toBe(0);
    // lane 1 has just lit, lane 2 has not
    introFrame(frame, plan, -1190, 1);
    expect(frame.dark[1]).toBeGreaterThan(0);
    expect(frame.dark[1]).toBeLessThan(LANE_DARK);
    expect(frame.flare[1]).toBeGreaterThan(0.9);
    expect(frame.dark[2]).toBe(LANE_DARK);
    // well after: lit, the flare gone
    introFrame(frame, plan, 300, 1);
    expect(frame.dark[1]).toBe(0);
    expect(frame.flare[1]).toBeLessThan(0.01);
    expect(frame.line).toBe(0);
    // the judge line is drawn fast at first
    introFrame(frame, plan, 600, 1);
    expect(frame.line).toBeGreaterThan(0.5);
    expect(frame.line).toBeLessThan(1);
    introFrame(frame, plan, 800, 1);
    expect(frame.line).toBe(1);
    expect(introEnd(plan, 1)).toBeGreaterThan(800);
    introFrame(frame, plan, introEnd(plan, 1), 1);
    expect(Math.max(...frame.flare)).toBeLessThan(0.01);
  });

  it('flares a third as bright under 번쩍임 줄이기', () => {
    const plan = planIntro([0], 1, -1500, 6000, 1, tempoAt(150));
    const [full, calm] = [litFrame(1), litFrame(1)];
    introFrame(full, plan, plan.laneAt[0] + 50, 1);
    introFrame(calm, plan, plan.laneAt[0] + 50, 1, true);
    expect(calm.flare[0]).toBeCloseTo(full.flare[0] * 0.35, 6);
  });

  it('draws the judge line again over a resume\'s rewind, whole as the play is live again', () => {
    expect(resumeLine(1000, 2500, 900)).toBe(0);
    expect(resumeLine(1000, 2500, 1000)).toBe(0);
    expect(resumeLine(1000, 2500, 1750)).toBeGreaterThan(0.5);
    expect(resumeLine(1000, 2500, 2499)).toBeLessThan(1);
    expect(resumeLine(1000, 2500, 2500)).toBe(1);
  });
});

describe('an end: the lanes go out', () => {
  const order = lightOrder(lanesAcross(6));

  it('from the outside in, the judge line drawing back, all of it out in under a second', () => {
    const frame = litFrame(6);
    outroFrame(frame, order, 0);
    expect(frame.dark).toEqual([0, 0, 0, 0, 0, 0]);
    expect(frame.line).toBe(1);
    // the outermost goes first (the last to light), the middle ones last
    outroFrame(frame, order, 130);
    const [last, first] = [order[order.length - 1], order[0]];
    expect(frame.dark[last]).toBeGreaterThan(0);
    expect(frame.dark[first]).toBe(0);
    expect(frame.line).toBeLessThan(1);
    outroFrame(frame, order, 1000);
    expect(frame.dark).toEqual(new Array(6).fill(LANE_DARK));
    expect(frame.line).toBe(0);
    expect(frame.drop).toEqual([0, 0, 0, 0, 0, 0]);
    expect(frame.crack).toBe(0);
  });

  it('all together under 동작 줄이기', () => {
    const frame = litFrame(6);
    outroFrame(frame, order, 200, true);
    expect(new Set(frame.dark).size).toBe(1);
    expect(frame.dark[0]).toBeGreaterThan(0);
    outroFrame(frame, order, 400, true);
    expect(frame.dark).toEqual(new Array(6).fill(LANE_DARK));
    expect(frame.line).toBe(0);
  });
});

describe('a failed play: the lanes crack and drop away', () => {
  const order = lightOrder(lanesAcross(8));
  const falls = fallOrder(order);

  it('cracks first, then lets the lanes go one after another, each leaving its place black', () => {
    const frame = litFrame(8);
    failFrame(frame, falls, 100);
    expect(frame.crack).toBeGreaterThan(0);
    expect(frame.crack).toBeLessThan(1);
    expect(frame.drop).toEqual(new Array(8).fill(0));
    failFrame(frame, falls, 400);
    expect(frame.crack).toBe(1);
    expect(frame.drop).toEqual(new Array(8).fill(0));
    expect(frame.line).toBe(1);
    // the first of them has let go, the last has not
    failFrame(frame, falls, 700);
    expect(frame.drop[falls[0]]).toBeGreaterThan(0);
    expect(frame.dark[falls[0]]).toBe(1);
    expect(frame.drop[falls[7]]).toBe(0);
    expect(frame.dark[falls[7]]).toBeLessThan(0.5);
    // it speeds up as it drops
    const early = frame.drop[falls[0]];
    failFrame(frame, falls, 880);
    expect(frame.drop[falls[0]]).toBeGreaterThan(early * 3);
  });

  it('has every lane out of sight by FAIL_FALL_MS, however many there are', () => {
    for (const n of [1, 4, 8, 10]) {
      const all = fallOrder(lightOrder(lanesAcross(n)));
      const frame = litFrame(n);
      failFrame(frame, all, FAIL_FALL_MS);
      expect(frame.drop).toEqual(new Array(n).fill(1));
      expect(frame.dark).toEqual(new Array(n).fill(1));
      expect(frame.line).toBe(0);
    }
  });

  it('drops nothing under 동작 줄이기: the cracked lanes go dark where they are', () => {
    const frame = litFrame(8);
    failFrame(frame, falls, 2000, true);
    expect(frame.drop).toEqual(new Array(8).fill(0));
    expect(frame.crack).toBe(1);
    expect(frame.dark).toEqual(new Array(8).fill(1));
  });

  it('draws the notes running down to a standstill with the song', () => {
    // over 1300 ms the song comes to rest half that far on
    expect(tapeStopTime(5000, 0, 1300, 1)).toBe(5000);
    expect(tapeStopTime(5000, 1300, 1300, 1)).toBe(5650);
    expect(tapeStopTime(5000, 4000, 1300, 1)).toBe(5650);
    // slower and slower
    const steps = [0, 325, 650, 975, 1300].map((ms) => tapeStopTime(5000, ms, 1300, 1));
    for (let i = 2; i < steps.length; i++) expect(steps[i] - steps[i - 1]).toBeLessThan(steps[i - 1] - steps[i - 2]);
    // a practice at half speed covers half the song time
    expect(tapeStopTime(5000, 1300, 1300, 0.5)).toBe(5325);
  });
});

describe('the camera\'s way in and out', () => {
  const dive = cameraConfig.fx.inertia.dive;

  it('is the camera\'s own spring: the closed form is where the stepped spring gets to', () => {
    // cameraFx's follower: 4 ms steps of the same spring, let go at 1 on its way to 0
    const omega = 2 * Math.PI * dive.hz;
    let [value, velocity, at] = [1, 0, 0];
    for (const ms of [100, 300, 600, 1000, 1600, 2500]) {
      for (; at < ms; at += 1) {
        velocity += (omega * omega * (0 - value) - 2 * dive.damping * omega * velocity) * 0.001;
        value += velocity * 0.001;
      }
      expect(springRest(ms, dive)).toBeCloseTo(value, 2);
    }
    expect(springRest(0, dive)).toBe(1);
    expect(springRest(-50, dive)).toBe(1);
    expect(Math.abs(springRest(4000, dive))).toBeLessThan(1e-4);
  });

  it('settles without swinging when the spring is damped fully or more', () => {
    for (const damping of [1, 1.6]) {
      let last = 1;
      for (let ms = 50; ms <= 3000; ms += 50) {
        const v = springRest(ms, { hz: 1, damping });
        expect(v).toBeLessThanOrEqual(last);
        expect(v).toBeGreaterThanOrEqual(0);
        last = v;
      }
      expect(last).toBeLessThan(0.01);
    }
  });

  it('comes down from above and in to where it plays from, as far as the strength says', () => {
    const start = entryPose(0, 1);
    expect(start.pitch).toBeCloseTo((-ENTRY.pitchDeg * Math.PI) / 180, 10);
    expect(start.fovScale).toBeCloseTo(1 + ENTRY.wide, 10);
    const half = entryPose(0, 0.5);
    expect(half.pitch).toBeCloseTo(start.pitch / 2, 10);
    expect(half.fovScale).toBeCloseTo(1 + ENTRY.wide / 2, 10);
    const rest = entryPose(5000, 1);
    expect(Math.abs(rest.pitch)).toBeLessThan(1e-4);
    expect(rest.fovScale).toBeCloseTo(1, 4);
    expect(entryPose(300, 0)).toEqual({ pitch: -0, fovScale: 1 });
  });

  it('has less of the way in with less room before the first note comes into sight', () => {
    expect(entryShare(100)).toBe(0);
    expect(entryShare(250)).toBe(0);
    expect(entryShare(675)).toBeCloseTo(0.5, 6);
    expect(entryShare(1100)).toBe(1);
    expect(entryShare(9000)).toBe(1);
  });

  it('backs away at an end, from where it plays', () => {
    const start = exitPose(0, 1);
    expect(start.pitch).toBeCloseTo(0, 10);
    expect(start.fovScale).toBe(1);
    const rest = exitPose(5000, 1);
    expect(rest.pitch).toBeCloseTo((-EXIT.pitchDeg * Math.PI) / 180, 4);
    expect(rest.fovScale).toBeCloseTo(1 + EXIT.wide, 4);
    expect(exitPose(5000, 0).fovScale).toBe(1);
  });
});
