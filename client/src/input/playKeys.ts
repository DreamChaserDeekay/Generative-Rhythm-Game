/**
 * The keyboard keys of the in-play functions (SPEED, the covers, the song offset, a retry, FEVER,
 * the intro skip), which the player can rebind. A binding is a `KeyboardEvent.code`, after "Ctrl+",
 * "Alt+" and / or "Shift+" when it needs them. Esc always pauses and is no binding.
 */
export type PlayAction =
  | 'speedDown'
  | 'speedUp'
  | 'speedDownBig'
  | 'speedUpBig'
  | 'suddenDown'
  | 'suddenUp'
  | 'liftDown'
  | 'liftUp'
  | 'offsetDown'
  | 'offsetUp'
  | 'offsetDownBig'
  | 'offsetUpBig'
  | 'covers'
  | 'retry'
  | 'skip'
  | 'fever';

/** In the order a shared key tries them: the intro skip before FEVER. */
export const PLAY_ACTIONS: readonly PlayAction[] = [
  'speedDown',
  'speedUp',
  'speedDownBig',
  'speedUpBig',
  'suddenDown',
  'suddenUp',
  'liftDown',
  'liftUp',
  'offsetDown',
  'offsetUp',
  'offsetDownBig',
  'offsetUpBig',
  'covers',
  'retry',
  'skip',
  'fever',
];

export const PLAY_ACTION_LABELS: Readonly<Record<PlayAction, string>> = {
  speedDown: 'SPEED −0.1',
  speedUp: 'SPEED +0.1',
  speedDownBig: 'SPEED −0.5',
  speedUpBig: 'SPEED +0.5',
  suddenDown: 'SUDDEN+ −',
  suddenUp: 'SUDDEN+ +',
  liftDown: 'LIFT −',
  liftUp: 'LIFT +',
  offsetDown: '곡 오프셋 −1ms',
  offsetUp: '곡 오프셋 +1ms',
  offsetDownBig: '곡 오프셋 −5ms',
  offsetUpBig: '곡 오프셋 +5ms',
  covers: '커버 켜기·끄기',
  retry: '다시 하기',
  skip: '인트로 건너뛰기',
  fever: 'FEVER (수동)',
};

/**
 * The keys as they always were (Shift with SPEED and the song offset for the bigger steps), but
 * LIFT: it left Shift for Alt, as Ctrl+PageUp / PageDown switch the browser's tabs. Shift is the
 * scratch of 7K+1S and the FX modes' side lanes, which take the press first: the bigger steps are
 * functions of their own, so such a player can move them off Shift.
 */
export const DEFAULT_PLAY_KEYS: Readonly<Record<PlayAction, string>> = {
  speedDown: 'ArrowDown',
  speedUp: 'ArrowUp',
  speedDownBig: 'Shift+ArrowDown',
  speedUpBig: 'Shift+ArrowUp',
  suddenDown: 'PageUp',
  suddenUp: 'PageDown',
  liftDown: 'Alt+PageUp',
  liftUp: 'Alt+PageDown',
  offsetDown: 'Minus',
  offsetUp: 'Equal',
  offsetDownBig: 'Shift+Minus',
  offsetUpBig: 'Shift+Equal',
  covers: 'Home',
  retry: 'F2',
  skip: 'Enter',
  fever: 'Enter',
};

/** The functions a held key repeats (the others act once a press: a retry, the covers, FEVER, the skip). */
const REPEATING: ReadonlySet<PlayAction> = new Set([
  'speedDown',
  'speedUp',
  'speedDownBig',
  'speedUpBig',
  'suddenDown',
  'suddenUp',
  'liftDown',
  'liftUp',
  'offsetDown',
  'offsetUp',
  'offsetDownBig',
  'offsetUpBig',
]);

/** Functions that may share a key: the intro skip is only before the first note, where no FEVER can fire. */
const MAY_SHARE: readonly (readonly PlayAction[])[] = [['fever', 'skip']];

export type Modifier = 'Shift' | 'Ctrl' | 'Alt' | 'Meta';

const MODIFIER_CODES: Readonly<Record<string, Modifier>> = {
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  MetaLeft: 'Meta',
  MetaRight: 'Meta',
};

/** The modifier a key is (null: none). */
export function modifierOf(code: string): Modifier | null {
  return MODIFIER_CODES[code] ?? null;
}

export interface KeyBinding {
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

export function parseKey(binding: string): KeyBinding {
  const parts = binding.split('+');
  const code = parts.pop() ?? '';
  return { code, ctrl: parts.includes('Ctrl'), alt: parts.includes('Alt'), shift: parts.includes('Shift') };
}

/** The binding a key press makes: its code after the Ctrl / Alt / Shift held with it (a modifier key alone is just its code). */
export function bindingOf(e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey'>): string {
  if (modifierOf(e.code)) return e.code;
  return `${e.ctrlKey ? 'Ctrl+' : ''}${e.altKey ? 'Alt+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.code}`;
}

/** A stored binding as bindingOf writes it (null: not one). */
export function cleanPlayKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const b = parseKey(value);
  if (!/^[A-Z][A-Za-z0-9]*$/.test(b.code) || b.code === 'Escape') return null;
  return bindingOf({ code: b.code, ctrlKey: b.ctrl, altKey: b.alt, shiftKey: b.shift });
}

/**
 * The functions a key press works: those bound to it, and on a held key's repeat only the stepping
 * ones. A key pressed with Shift that no function has with Shift works the key's own functions: a
 * held Shift lane (a scratch, a side lane) keeps no key from them.
 */
export function playActionsOf(
  e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'repeat'>,
  keys: Readonly<Record<PlayAction, string>>,
): PlayAction[] {
  if (e.metaKey) return [];
  let binding = bindingOf(e);
  // (a KeyboardEvent's fields are getters: no spreading it)
  if (e.shiftKey && !PLAY_ACTIONS.some((a) => keys[a] === binding)) binding = bindingOf({ code: e.code, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: false });
  return PLAY_ACTIONS.filter((a) => keys[a] === binding && (!e.repeat || REPEATING.has(a)));
}

/**
 * Whether a lane key takes a function's key from it: lanes are read first, so a lane on the same
 * key, or on the Ctrl / Alt / Shift it is pressed with, presses that lane instead (or as well).
 */
export function laneTakes(laneCode: string, binding: string): boolean {
  const b = parseKey(binding);
  if (laneCode === b.code) return true;
  const m = modifierOf(laneCode);
  return (m === 'Ctrl' && b.ctrl) || (m === 'Alt' && b.alt) || (m === 'Shift' && b.shift);
}

/** The functions on the same key as another one (apart from those meant to share it). */
export function sharedPlayKeys(keys: Readonly<Record<PlayAction, string>>): Set<PlayAction> {
  const shared = new Set<PlayAction>();
  for (const a of PLAY_ACTIONS) {
    for (const b of PLAY_ACTIONS) {
      if (a !== b && keys[a] === keys[b] && !MAY_SHARE.some((pair) => pair.includes(a) && pair.includes(b))) shared.add(a);
    }
  }
  return shared;
}
