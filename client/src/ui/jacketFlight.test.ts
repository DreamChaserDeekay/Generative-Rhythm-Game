import { afterEach, describe, expect, it, vi } from 'vitest';
import { flightTransform, setJacketOrigin, takeJacketOrigin } from './jacketFlight';

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
