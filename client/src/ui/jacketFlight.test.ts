import { afterEach, describe, expect, it, vi } from 'vitest';
import { flightTransform, intoTrackTransform, leaveLampOrigin, setJacketOrigin, stampTransform, takeJacketOrigin, takeLampOrigin } from './jacketFlight';

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, x: left, y: top, right: left + width, bottom: top + height }) as DOMRect;

/** The clock the module reads, set by hand. */
function clock(): (ms: number) => void {
  const now = vi.spyOn(performance, 'now').mockReturnValue(0);
  return (ms) => now.mockReturnValue(ms);
}

describe('the jacket from the song select to the start card', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setJacketOrigin(null);
  });

  it('gives the place the select left once: the next card has none', () => {
    clock();
    const from = rect(492, 72, 230, 230);
    setJacketOrigin(from);
    expect(takeJacketOrigin()).toBe(from);
    expect(takeJacketOrigin()).toBeNull();
  });

  it('has nothing for a play started elsewhere, and forgets a place on null', () => {
    clock();
    expect(takeJacketOrigin()).toBeNull();
    setJacketOrigin(rect(0, 0, 100, 100));
    setJacketOrigin(null);
    expect(takeJacketOrigin()).toBeNull();
  });

  it('keeps the newest place when the select leaves two', () => {
    clock();
    const second = rect(40, 60, 200, 200);
    setJacketOrigin(rect(0, 0, 100, 100));
    setJacketOrigin(second);
    expect(takeJacketOrigin()).toBe(second);
  });

  it('ignores a place left more than a second and a half ago, and clears it', () => {
    const at = clock();
    const from = rect(10, 20, 100, 100);
    setJacketOrigin(from);
    at(1500);
    expect(takeJacketOrigin()).toBe(from);

    setJacketOrigin(from);
    at(1500 + 1501);
    expect(takeJacketOrigin()).toBeNull();
    // the stale place is gone for good, not kept for a later card
    at(1500 + 1502);
    expect(takeJacketOrigin()).toBeNull();
  });

  it('takes no place from a jacket that is not on the screen (no size)', () => {
    clock();
    setJacketOrigin(rect(10, 20, 0, 0));
    expect(takeJacketOrigin()).toBeNull();
  });

  it('moves the card’s jacket back onto the place it comes from, about its top left corner', () => {
    // from a 230 px jacket at (492, 72) to a 304 px one at (192, 176)
    expect(flightTransform(rect(492, 72, 230, 230), rect(192, 176, 304, 304))).toBe('translate(300px, -104px) scale(0.757, 0.757)');
    // the same box: nothing to do
    expect(flightTransform(rect(5, 5, 80, 80), rect(5, 5, 80, 80))).toBe('translate(0px, 0px) scale(1, 1)');
    // the top left corner lands on the origin's, the far corner on its far corner
    const [from, to] = [rect(100, 40, 120, 60), rect(20, 300, 240, 240)];
    const m = /translate\((.+)px, (.+)px\) scale\((.+), (.+)\)/.exec(flightTransform(from, to))?.slice(1).map(Number) ?? [];
    expect([to.left + m[0], to.top + m[1]]).toEqual([from.left, from.top]);
    expect([to.left + m[0] + to.width * m[2], to.top + m[1] + to.height * m[3]]).toEqual([from.left + from.width, from.top + from.height]);
  });
});

describe('the start card into the track', () => {
  it('takes the jacket from its middle to the far end of the track, small', () => {
    // a 300 px jacket whose middle is at (450, 300), to a point at (640, 80)
    expect(intoTrackTransform(rect(300, 150, 300, 300), { x: 640, y: 80 })).toBe('translate(190px, -220px) scale(0.06)');
  });
});

describe("the play's lamp to the result's stamp", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    takeLampOrigin();
  });

  /** A HUD holding (or not) the end show's lamp at `box`. */
  const hud = (box: DOMRect | null, lamp = 'hard') =>
    ({
      querySelector: () => (box ? { getBoundingClientRect: () => box, dataset: { lamp } } : null),
    }) as unknown as ParentNode;

  it('gives the lamp the play ended on, where it stood, once', () => {
    const at = clock();
    leaveLampOrigin(hud(rect(440, 300, 400, 80), 'exhard'));
    at(300);
    expect(takeLampOrigin()).toEqual({ rect: rect(440, 300, 400, 80), lamp: 'exhard' });
    expect(takeLampOrigin()).toBeNull();
  });

  it('gives none for a play that ended without one, or long ago', () => {
    const at = clock();
    leaveLampOrigin(hud(null));
    expect(takeLampOrigin()).toBeNull();
    leaveLampOrigin(hud(rect(440, 300, 400, 80)));
    at(5000);
    expect(takeLampOrigin()).toBeNull();
  });

  it('draws the stamp over the lamp, middle on middle, in its own proportions', () => {
    // a 200 × 40 stamp at (700, 100) drawn over a lamp 80 high whose middle is at (640, 340)
    expect(stampTransform(rect(440, 300, 400, 80), rect(700, 100, 200, 40))).toBe('translate(-160px, 220px) scale(2)');
  });
});
