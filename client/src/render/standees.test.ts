import { describe, expect, it } from 'vitest';
import { GEAR_STYLES } from './deckArt';
import { readStandees, STAGE_SLOTS, standeeBoxes, standeeOrder, type StageView } from './standees';

// the default camera on a 1280 × 720 screen: the gear's outer edges at the judge line and at the screen's bottom
const VIEW: StageView = { width: 1280, height: 720, lineY: 553.75, line: [330, 950], bottom: [255, 1025] };
const edgeAt = (side: 0 | 1, y: number) => VIEW.line[side] + ((VIEW.bottom[side] - VIEW.line[side]) * (y - VIEW.lineY)) / (VIEW.height - VIEW.lineY);

describe('the figures at a gear’s two sides', () => {
  it('only the Firestarter gear has a stage, four figures on it, and the game comes with no picture for it', async () => {
    expect(STAGE_SLOTS).toEqual({ fire: 4 });
    for (const gear of GEAR_STYLES) expect(await readStandees(gear), gear).toEqual([]);
  });

  it('stand in the order of their files’ names, numbers counted as numbers, no more than the stage has places for', () => {
    const files = ['10.png', '2-b.png', '1.png', '2-a.png', '3.png'].map((name) => ({ name }));
    expect(standeeOrder(files, 4).map((f) => f.name)).toEqual(['1.png', '2-a.png', '2-b.png', '3.png']);
    expect(standeeOrder(files, 0)).toEqual([]);
  });

  it('four stand two a side, close against the gear: the inner one’s side on the gear’s edge at its hip, the outer one beside it, a little taller and over a part of it', () => {
    const aspects = [0.42, 0.42, 0.42, 0.42];
    const boxes = standeeBoxes(aspects, VIEW).map((b) => b!);
    expect(boxes).toHaveLength(4);
    const [lo, li, ri, ro] = boxes;
    for (const b of boxes) {
      // feet at the screen's bottom, no taller than three fifths of the screen (smaller than the concept's)
      expect(b.y + b.h).toBeCloseTo(720, 6);
      expect(b.h).toBeLessThanOrEqual(720 * 0.6 + 1e-6);
      expect(b.w / b.h).toBeCloseTo(0.42, 6);
    }
    expect([lo.front, li.front, ri.front, ro.front]).toEqual([true, false, false, true]);
    expect(li.h).toBeLessThan(lo.h);
    expect(ri.h).toBeLessThan(ro.h);
    // the inner ones lean on the gear: their side on its outer edge a third of the way up them
    expect(li.x + li.w).toBeCloseTo(edgeAt(0, 720 - li.h * 0.36), 6);
    expect(ri.x).toBeCloseTo(edgeAt(1, 720 - ri.h * 0.36), 6);
    // the outer ones beside them, over a third of them, and on the screen
    expect(lo.x + lo.w).toBeCloseTo(li.x + li.w * 0.34, 6);
    expect(ro.x).toBeCloseTo(ri.x + ri.w * 0.66, 6);
    expect(lo.x).toBeGreaterThan(0);
    expect(ro.x + ro.w).toBeLessThan(1280);
    // the two sides mirror each other
    expect(1280 - (ri.x + ri.w)).toBeCloseTo(li.x, 6);
    expect(1280 - (ro.x + ro.w)).toBeCloseTo(lo.x, 6);
  });

  it('fewer stand one a side first (the odd one at the left), a wide picture is made smaller to keep its share of the room, and a side with no room has none', () => {
    const two = standeeBoxes([0.42, 0.42], VIEW).map((b) => b!);
    expect(two[0].x + two[0].w).toBeLessThan(640);
    expect(two[1].x).toBeGreaterThan(640);
    expect([two[0].front, two[1].front]).toEqual([false, false]);
    const three = standeeBoxes([0.42, 0.42, 0.42], VIEW);
    expect(three.map((b) => (b ? (b.x < 640 ? 'left' : 'right') : null))).toEqual(['left', 'left', 'right']);
    expect(standeeBoxes([0.42], VIEW)[0]!.x).toBeLessThan(640);
    // a picture wider than it is tall: no wider than half the room by the gear (where a full-size figure's hip would be), its shape kept
    const [wide] = standeeBoxes([1.4], VIEW).map((b) => b!);
    expect(wide.w).toBeCloseTo(edgeAt(0, 720 - 720 * 0.54 * 0.36) * 0.5, 6);
    expect(wide.w / wide.h).toBeCloseTo(1.4, 6);
    expect(wide.y + wide.h).toBeCloseTo(720, 6);
    // a gear that fills the screen (a wide gear on a narrow window, a preview): nobody stands
    expect(standeeBoxes([0.42, 0.42, 0.42, 0.42], { ...VIEW, line: [70, 1210], bottom: [40, 1240] })).toEqual([null, null, null, null]);
    expect(standeeBoxes([], VIEW)).toEqual([]);
  });
});
