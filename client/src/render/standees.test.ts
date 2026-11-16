import { describe, expect, it } from 'vitest';
import { GEAR_STYLES } from './deckArt';
import { isNotePicture, keptFor, readNotePicture, readStandees, shippedNames, STAGE_SLOTS, STAGES, standeeBoxes, standeeOrder, type StageView } from './standees';

// the default camera on a 1280 × 720 screen: the gear's outer edges at the judge line and at the screen's bottom
const VIEW: StageView = { width: 1280, height: 720, lineY: 553.75, line: [330, 950], bottom: [255, 1025] };
const edgeAt = (side: 0 | 1, y: number) => VIEW.line[side] + ((VIEW.bottom[side] - VIEW.line[side]) * (y - VIEW.lineY)) / (VIEW.height - VIEW.lineY);

describe('the figures at a gear’s two sides', () => {
  it('the Firestarter gear has a stage of four figures, the four AI companies’ gears two stickers and a mark for their notes', async () => {
    expect(STAGE_SLOTS).toEqual({ fire: 4, gpt: 2, gemini: 2, grok: 2, claude: 2 });
    expect(STAGES.fire).toEqual({ slots: 4, kind: 'figures' });
    for (const gear of ['gpt', 'gemini', 'grok', 'claude'] as const) expect(STAGES[gear]).toEqual({ slots: 2, kind: 'stickers', note: true });
    // where the build's pictures cannot be read (here: no page), there is none
    for (const gear of GEAR_STYLES) {
      expect(await readStandees(gear), gear).toEqual([]);
      expect(await readNotePicture(gear), gear).toBeNull();
    }
  });

  it('the build lists its pictures by gear: plain file names of gears with a stage, anything else left out', () => {
    expect(shippedNames({ fire: ['1-left.png', '2-right.webp'], gpt: ['1.png', 'note.PNG', 'photo.jpeg'] })).toEqual({ fire: ['1-left.png', '2-right.webp'], gpt: ['1.png', 'note.PNG', 'photo.jpeg'] });
    // no folders, no other kinds of file, no gear without a stage, nothing that is not a list of names
    expect(shippedNames({ fire: ['../x.png', 'a/b.png', 'run.js', '.hidden.png', 7, '1.png'], standard: ['1.png'], grok: 'note.png', claude: [] })).toEqual({ fire: ['1.png'] });
    for (const raw of [null, 3, 'x', [['fire']]]) expect(shippedNames(raw)).toEqual({});
  });

  it('a file is the notes’ mark when its name says so; a gear takes its side pictures in their order and, an AI company’s, one mark after them', () => {
    for (const name of ['note.png', 'logo.png', 'Claude_Logo.webp', 'my note 2.png']) expect(isNotePicture(name), name).toBe(true);
    // a word of the name, not letters inside another word
    for (const name of ['1.png', '2.webp', 'notebook.png', 'keynotes.png', 'logos.png']) expect(isNotePicture(name), name).toBe(false);
    const files = ['note.png', '2.png', 'logo.png', '3.png', '1.webp'].map((name) => ({ name }));
    expect(keptFor('gpt', files).map((f) => f.name)).toEqual(['1.webp', '2.png', 'logo.png']);
    // the Firestarter gear takes no mark: a file so named is a figure as any other
    expect(keptFor('fire', [{ name: 'logo.png' }, { name: 'a.png' }]).map((f) => f.name)).toEqual(['a.png', 'logo.png']);
    expect(keptFor('standard', files)).toEqual([]);
  });

  it('two stickers sit at the gear’s foot in front of it, one over each near corner, as far in as leaves the judge line clear: the right one under the line, where the gauge’s value is written', () => {
    // an outline as a bust's: narrow at its top (a head in the middle of the picture), as wide as the picture below
    const bust = { left: Array.from({ length: 20 }, (_, k) => (k < 8 ? 0.3 : 0)), right: Array.from({ length: 20 }, (_, k) => (k < 8 ? 0.7 : 1)) };
    const [left, right] = standeeBoxes([1.5, 1], VIEW, 'stickers', [bust, undefined]).map((b) => b!);
    for (const b of [left, right]) {
      expect(b.y + b.h).toBeCloseTo(720, 6);
      // in front of the gear, not behind it
      expect(b.front).toBe(true);
    }
    // the left one a third of the screen tall at most
    expect(left.h).toBeLessThanOrEqual(720 * 0.32 + 1e-6);
    expect(left.w / left.h).toBeCloseTo(1.5, 6);
    // three tenths of each one's width over the gear at its hip
    expect(left.x + left.w).toBeCloseTo(edgeAt(0, 720 - left.h * 0.36) + left.w * 0.3, 6);
    expect(right.x).toBeCloseTo(edgeAt(1, 720 - right.h * 0.36) - right.w * 0.3, 6);
    // the left one stands higher than the judge line: what of it is that high (its head) is outside the gear
    expect(left.y).toBeLessThan(VIEW.lineY);
    expect(left.x + left.w * 0.7).toBeLessThan(edgeAt(0, VIEW.lineY));
    // the right one's top stays under the judge line
    expect(right.y).toBeGreaterThan(VIEW.lineY);
    expect(right.h).toBeLessThan(left.h);
    // a sticker whose picture is full to its corners (no outline given: its whole box) is moved in no further than the gear's edge by the judge line
    const [box] = standeeBoxes([1.5], VIEW, 'stickers').map((b) => b!);
    expect(box.x + box.w).toBeLessThan(edgeAt(0, VIEW.lineY));
    expect(box.x + box.w).toBeGreaterThan(edgeAt(0, VIEW.lineY) - 720 * 0.02);
    expect(box.x).toBeLessThan(left.x);
    // one picture: at the left; a third and a fourth are not shown (a sticker stage has one place a side)
    expect(standeeBoxes([1], VIEW, 'stickers').map((b) => b !== null)).toEqual([true]);
    expect(standeeBoxes([1, 1, 1, 1], VIEW, 'stickers').map((b) => b !== null)).toEqual([false, true, true, false]);
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

  it('one picture on a side fills the side: nearly as tall as the screen, a third of it behind the gear at its hip; a side with no room has none', () => {
    const two = standeeBoxes([0.7, 0.7], VIEW).map((b) => b!);
    for (const b of two) {
      expect(b.h).toBeCloseTo(720 * 0.94, 6);
      expect(b.w / b.h).toBeCloseTo(0.7, 6);
      expect(b.y + b.h).toBeCloseTo(720, 6);
      expect(b.front).toBe(false);
    }
    const hip = 720 - 720 * 0.94 * 0.36;
    // their inner sides three tenths of their width inside the gear's edge at their hip, the two sides alike
    expect(two[0].x + two[0].w).toBeCloseTo(edgeAt(0, hip) + two[0].w * 0.3, 6);
    expect(two[1].x).toBeCloseTo(edgeAt(1, hip) - two[1].w * 0.3, 6);
    expect(1280 - (two[1].x + two[1].w)).toBeCloseTo(two[0].x, 6);
    // three: two figures at the left, one picture alone at the right
    const three = standeeBoxes([0.4, 0.4, 0.7], VIEW).map((b) => b!);
    expect(three.map((b) => (b.x + b.w / 2 < 640 ? 'left' : 'right'))).toEqual(['left', 'left', 'right']);
    expect([three[0].h, three[1].h, three[2].h].map((h) => Math.round((h / 720) * 100))).toEqual([60, 54, 94]);
    expect(standeeBoxes([0.7], VIEW)[0]!.x).toBeLessThan(640);
    // a figure wider than it is tall, one of two: no wider than half the room by the gear (where a full-size figure's hip would be), its shape kept
    const [, wide] = standeeBoxes([0.42, 1.4], { ...VIEW }).map((b) => b!);
    expect(wide.w).toBeLessThanOrEqual(edgeAt(0, 720 - 720 * 0.94 * 0.36) * 1.9 + 1e-6);
    const pair = standeeBoxes([0.42, 1.4, 0.42, 0.42], VIEW).map((b) => b!);
    expect(pair[1].w).toBeCloseTo(edgeAt(0, 720 - 720 * 0.54 * 0.36) * 0.5, 6);
    expect(pair[1].w / pair[1].h).toBeCloseTo(1.4, 6);
    expect(pair[1].y + pair[1].h).toBeCloseTo(720, 6);
    // a gear that fills the screen (a wide gear on a narrow window, a preview): nobody stands
    expect(standeeBoxes([0.42, 0.42, 0.42, 0.42], { ...VIEW, line: [70, 1210], bottom: [40, 1240] })).toEqual([null, null, null, null]);
    expect(standeeBoxes([], VIEW)).toEqual([]);
  });
});
