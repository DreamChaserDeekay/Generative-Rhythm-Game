/** What the calibration's judgement step shows while it measures. */

/**
 * The beat the ring has counted at song time `t` (-1 before the first): each one half a beat after
 * it sounds, so the count never changes on a beat (a change on the beat is something to tap to by
 * eye, and the screen's lag would go into the judgement offset).
 */
export function countedBeat(beats: readonly number[], t: number): number {
  const half = beats.length > 1 ? (beats[1] - beats[0]) / 2 : 0;
  let idx = -1;
  for (let i = 0; i < beats.length && t >= beats[i] + half; i++) idx = i;
  return idx;
}
