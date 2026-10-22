import type { KeyModeConfig } from '../engine/config';
import type { SessionNote } from '../engine/session';
import { bindingOf, laneTakes, modifierOf, parseKey } from '../input/playKeys';
import { keyLabel, OFFSET_MAX } from '../settings/settings';

/** What the calibration's display step shows, how its keys move the display offset, and the sync test's keys. */

/**
 * A chord on every key lane at each click (`beats`, ms), as the renderer draws a session's notes:
 * a line of notes across the keys that meets the judge line on the click, easy to see against it.
 */
export function clickChords(mode: KeyModeConfig, beats: readonly number[]): SessionNote[] {
  const keys = mode.lanes.flatMap((l, i) => (l.kind === 'key' ? [i] : []));
  const notes: SessionNote[] = [];
  for (const t of beats) {
    for (const lane of keys) {
      notes.push({ index: notes.length, lane, t, type: 'tap', endT: t, ticks: [], nextTick: 0, headDone: false, tailDone: false, broken: false });
    }
  }
  return notes;
}

/** An offset a press moves (←→ 1 ms, with Shift 5 ms), within ±OFFSET_MAX. */
export function offsetStep(ms: number, dir: 1 | -1, big: boolean): number {
  return Math.min(OFFSET_MAX, Math.max(-OFFSET_MAX, Math.round(ms) + dir * (big ? 5 : 1)));
}

/** A pair of keys (bindings, − then +). */
export type KeyPair = readonly [string, string];

/** The keys the sync test moves its offsets with (null: no pair is free of the lanes). */
export interface SyncTestKeys {
  visual: KeyPair | null;
  /** Played by hand only. */
  judgement: KeyPair | null;
  /** A lane is on Shift (the scratch, a side lane): held, it is no modifier. */
  shiftLane: boolean;
}

/** The pairs the sync test may take, in the order it tries them. */
const SYNC_PAIRS: readonly KeyPair[] = [
  ['ArrowLeft', 'ArrowRight'],
  ['BracketLeft', 'BracketRight'],
  ['Comma', 'Period'],
];

/**
 * The sync test's keys among those no lane takes (`laneCodes`: the lanes' keys played by hand,
 * none on autoplay): the display offset on ←→ and, played by hand, the judgement offset on
 * Shift+←→. Where a lane takes them (Shift is the scratch of 7K+1S and the side lanes of the FX
 * modes, and any key can be a lane's), the next pair no lane takes: [ ], then , .
 */
export function syncTestKeys(laneCodes: readonly string[], byHand: boolean): SyncTestKeys {
  const free = (binding: string) => !laneCodes.some((code) => laneTakes(code, binding));
  const pairs = SYNC_PAIRS.filter((pair) => pair.every(free));
  const visual = pairs[0] ?? null;
  const shifted: KeyPair | null = visual && [`Shift+${visual[0]}`, `Shift+${visual[1]}`];
  const judgement = !byHand ? null : shifted && shifted.every(free) ? shifted : (pairs[1] ?? null);
  return { visual, judgement, shiftLane: laneCodes.some((code) => modifierOf(code) === 'Shift') };
}

/** The offset a key press moves and which way (null: none). Ctrl, Alt and the Windows key make no step. */
export function syncKeyOf(
  e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>,
  keys: SyncTestKeys,
): { offset: 'visual' | 'judgement'; dir: 1 | -1 } | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  const binding = bindingOf({ code: e.code, ctrlKey: false, altKey: false, shiftKey: e.shiftKey && !keys.shiftLane });
  for (const offset of ['visual', 'judgement'] as const) {
    const at = keys[offset]?.indexOf(binding) ?? -1;
    if (at >= 0) return { offset, dir: at === 0 ? -1 : 1 };
  }
  return null;
}

/** A pair as the screen names it: what is held with both (Shift), and its two keys (← →). */
export interface KeyPairNames {
  modifier: string | null;
  keys: [string, string];
}

export function keyPairNames(pair: KeyPair): KeyPairNames {
  const [down, up] = pair.map(parseKey);
  return { modifier: down.shift ? 'Shift' : null, keys: [keyLabel(down.code), keyLabel(up.code)] };
}

/** A pair in a line of text: Shift+←→, [ ]. */
export function keyPairText(pair: KeyPair): string {
  const { modifier, keys } = keyPairNames(pair);
  const arrows = keys.every((k) => k === '←' || k === '→');
  return `${modifier ? `${modifier}+` : ''}${keys.join(arrows ? '' : ' ')}`;
}
