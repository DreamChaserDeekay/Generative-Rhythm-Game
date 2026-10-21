import { describe, expect, it } from 'vitest';
import { rangePoints, sectionRange, stepRange } from './practiceRange';

describe('a practice segment by key', () => {
  // bars every 2 s, the chart ends at 9 s
  const points = rangePoints([0, 2000, 4000, 6000, 8000], 9000);

  it('takes the bar lines and the end', () => {
    expect(points).toEqual([0, 2000, 4000, 6000, 8000, 9000]);
    expect(rangePoints([], 5000)).toEqual([0, 5000]);
  });

  it('moves a bar at a time keeping its length, not past either end', () => {
    expect(stepRange(points, [2000, 6000], 1, false)).toEqual([4000, 8000]);
    expect(stepRange(points, [2000, 6000], -1, false)).toEqual([0, 4000]);
    expect(stepRange(points, [0, 4000], -1, false)).toBeNull();
    expect(stepRange(points, [6000, 9000], 1, false)).toBeNull();
    // off the bar lines (dragged): from the nearest ones
    expect(stepRange(points, [2100, 5900], 1, false)).toEqual([4000, 8000]);
  });

  it('grows and shrinks by a bar, a bar long at least', () => {
    expect(stepRange(points, [2000, 6000], 1, true)).toEqual([2000, 8000]);
    expect(stepRange(points, [2000, 6000], -1, true)).toEqual([2000, 4000]);
    expect(stepRange(points, [2000, 4000], -1, true)).toBeNull();
    expect(stepRange(points, [2000, 9000], 1, true)).toBeNull();
  });

  it('takes a section from its bar to the next one', () => {
    expect(sectionRange(points, 1900, 6100)).toEqual([2000, 6000]);
    expect(sectionRange(points, 8000, 9000)).toEqual([8000, 9000]);
    expect(sectionRange(points, 4000, 4100)).toEqual([4000, 6000]);
  });
});
