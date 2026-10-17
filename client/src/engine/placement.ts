import { keyModes } from './config';
import type { Chart, ChartNote, KeyModeId } from './types';

export type PlacementId = 'OFF' | 'MIRROR' | 'RANDOM' | 'R-RANDOM' | 'S-RANDOM' | 'H-RANDOM';

export const placementIds: PlacementId[] = ['OFF', 'MIRROR', 'RANDOM', 'R-RANDOM', 'S-RANDOM', 'H-RANDOM'];

export const placementLabels: Record<PlacementId, string> = {
  OFF: '정배치',
  MIRROR: '미러',
  RANDOM: '랜덤',
  'R-RANDOM': 'R-랜덤',
  'S-RANDOM': 'S-랜덤',
  'H-RANDOM': 'H-랜덤',
};

/** H-RANDOM avoids putting a note on a lane that was hit less than this long ago. */
const H_RANDOM_GAP_MS = 150;
/** Notes closer than this count as simultaneous for S-/H-RANDOM. */
const SAME_TIME_MS = 1;
/** A lane becomes free this long after a long note on it ends. */
const HOLD_RELEASE_GAP_MS = 100;

export interface PlacementResult {
  chart: Chart;
  /** Key-lane order after a whole-chart permutation (1-based, e.g. "4213"); null for per-note randoms. */
  laneOrder: string | null;
  seed: number;
}

/** Small fast PRNG with a 32-bit state (deterministic per seed). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Rearranges key lanes (IIDX/BMS style options). The scratch lane never moves; the two side
 * lanes swap under MIRROR and swap as a pair at random under the RANDOM family.
 */
export function applyPlacement(chart: Chart, id: PlacementId, seed: number): PlacementResult {
  const mode = keyModes[chart.meta.keyMode as KeyModeId];
  const keys = mode.lanes.flatMap((l, i) => (l.kind === 'key' ? [i] : []));
  const sides = mode.lanes.flatMap((l, i) => (l.kind === 'side' ? [i] : []));
  const rand = mulberry32(seed);
  const map = mode.lanes.map((_, i) => i);
  const swapSides = (yes: boolean) => {
    if (yes && sides.length === 2) [map[sides[0]], map[sides[1]]] = [sides[1], sides[0]];
  };

  if (id === 'OFF') return { chart, laneOrder: null, seed };
  if (id === 'MIRROR' || id === 'RANDOM' || id === 'R-RANDOM') {
    let order: number[];
    if (id === 'MIRROR') {
      order = [...keys].reverse();
      swapSides(true);
    } else if (id === 'RANDOM') {
      order = shuffle(keys, rand);
      while (keys.length > 1 && order.every((lane, i) => lane === keys[i])) order = shuffle(keys, rand);
      swapSides(rand() < 0.5);
    } else {
      const shift = 1 + Math.floor(rand() * Math.max(1, keys.length - 1));
      order = keys.map((_, i) => keys[(i + shift) % keys.length]);
      if (rand() < 0.5) order.reverse();
      swapSides(rand() < 0.5);
    }
    // order[i] is the original lane shown at position i.
    order.forEach((from, i) => (map[from] = keys[i]));
    const laneOrder = order.map((from) => String(keys.indexOf(from) + 1)).join('');
    return { chart: remap(chart, (n) => map[n.lane]), laneOrder, seed };
  }

  swapSides(rand() < 0.5);
  const keySet = new Set(keys);
  const notes = [...chart.notes].sort((a, b) => a.t - b.t || a.lane - b.lane);
  const busyUntil = new Map<number, number>(); // lane -> end of its active hold
  const lastHit = new Map<number, number>();
  const out: ChartNote[] = [];
  let groupT = -Infinity;
  let usedInGroup = new Set<number>();
  for (const n of notes) {
    if (!keySet.has(n.lane)) {
      out.push({ ...n, lane: map[n.lane] });
      continue;
    }
    if (n.t - groupT > SAME_TIME_MS) {
      groupT = n.t;
      usedInGroup = new Set();
    }
    const open = keys.filter((k) => !usedInGroup.has(k) && (busyUntil.get(k) ?? -Infinity) < n.t);
    const free = open.filter((k) => (busyUntil.get(k) ?? -Infinity) + HOLD_RELEASE_GAP_MS <= n.t);
    let pool = free.length > 0 ? free : open;
    if (id === 'H-RANDOM') {
      const rested = free.filter((k) => n.t - (lastHit.get(k) ?? -Infinity) >= H_RANDOM_GAP_MS);
      if (rested.length > 0) pool = rested;
    }
    // A free lane always exists for a valid chart; fall back to the original lane otherwise.
    const lane = pool.length > 0 ? pool[Math.floor(rand() * pool.length)] : n.lane;
    usedInGroup.add(lane);
    const end = n.type === 'hold' && n.endT !== undefined ? n.endT : n.t;
    if (end > n.t) busyUntil.set(lane, end);
    lastHit.set(lane, end);
    out.push({ ...n, lane });
  }
  return { chart: { ...chart, notes: out }, laneOrder: null, seed };
}

function remap(chart: Chart, lane: (n: ChartNote) => number): Chart {
  return { ...chart, notes: chart.notes.map((n) => ({ ...n, lane: lane(n) })) };
}
