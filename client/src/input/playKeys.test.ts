import { describe, expect, it } from 'vitest';
import { bindingOf, cleanPlayKey, DEFAULT_PLAY_KEYS, laneTakes, playActionsOf, sharedPlayKeys } from './playKeys';

const press = (code: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean; repeat?: boolean } = {}) => ({
  code,
  ctrlKey: mods.ctrl ?? false,
  altKey: mods.alt ?? false,
  shiftKey: mods.shift ?? false,
  metaKey: mods.meta ?? false,
  repeat: mods.repeat ?? false,
});

/** A press as the browser hands it: its fields are getters of its prototype, not its own. */
function asEvent(p: ReturnType<typeof press>): ReturnType<typeof press> {
  const proto = Object.fromEntries(Object.keys(p).map((k) => [k, undefined]));
  for (const k of Object.keys(p) as (keyof typeof p)[]) Object.defineProperty(proto, k, { get: () => p[k] });
  return Object.create(proto) as ReturnType<typeof press>;
}

describe('in-play keys', () => {
  it('keeps the keys as they were but moves LIFT off Shift to Alt', () => {
    expect(playActionsOf(press('ArrowUp'), DEFAULT_PLAY_KEYS)).toEqual(['speedUp']);
    expect(playActionsOf(press('PageDown'), DEFAULT_PLAY_KEYS)).toEqual(['suddenUp']);
    expect(playActionsOf(press('PageDown', { alt: true }), DEFAULT_PLAY_KEYS)).toEqual(['liftUp']);
    expect(playActionsOf(press('PageUp', { ctrl: true }), DEFAULT_PLAY_KEYS)).toEqual([]);
    expect(playActionsOf(press('Equal'), DEFAULT_PLAY_KEYS)).toEqual(['offsetUp']);
    expect(playActionsOf(press('Home'), DEFAULT_PLAY_KEYS)).toEqual(['covers']);
    // Enter skips a long intro, else fires a manual FEVER
    expect(playActionsOf(press('Enter'), DEFAULT_PLAY_KEYS)).toEqual(['skip', 'fever']);
    expect(playActionsOf(press('Enter', { meta: true }), DEFAULT_PLAY_KEYS)).toEqual([]);
  });

  it('makes the bigger steps functions of their own on Shift, and a key with Shift that has none works the key alone', () => {
    expect(playActionsOf(press('ArrowUp', { shift: true }), DEFAULT_PLAY_KEYS)).toEqual(['speedUpBig']);
    expect(playActionsOf(press('Minus', { shift: true }), DEFAULT_PLAY_KEYS)).toEqual(['offsetDownBig']);
    // a held Shift (the scratch) keeps no key from its function
    expect(playActionsOf(press('Enter', { shift: true }), DEFAULT_PLAY_KEYS)).toEqual(['skip', 'fever']);
    expect(playActionsOf(asEvent(press('PageDown', { shift: true })), DEFAULT_PLAY_KEYS)).toEqual(['suddenUp']);
    expect(playActionsOf(press('PageDown', { shift: true }), DEFAULT_PLAY_KEYS)).toEqual(['suddenUp']);
    expect(playActionsOf(press('F2', { shift: true, repeat: true }), DEFAULT_PLAY_KEYS)).toEqual([]);
    // moved off Shift, Shift+↑ is the small step again
    const moved = { ...DEFAULT_PLAY_KEYS, speedUpBig: 'Alt+ArrowUp' };
    expect(playActionsOf(press('ArrowUp', { alt: true }), moved)).toEqual(['speedUpBig']);
    expect(playActionsOf(press('ArrowUp', { shift: true }), moved)).toEqual(['speedUp']);
    // Ctrl and Alt are not let go of that way (Ctrl+- is the browser's zoom)
    expect(playActionsOf(press('Minus', { ctrl: true }), DEFAULT_PLAY_KEYS)).toEqual([]);
  });

  it('ignores a held key repeating a retry, the covers, FEVER or the skip, and repeats the steps', () => {
    expect(playActionsOf(press('F2', { repeat: true }), DEFAULT_PLAY_KEYS)).toEqual([]);
    expect(playActionsOf(press('Home', { repeat: true }), DEFAULT_PLAY_KEYS)).toEqual([]);
    expect(playActionsOf(press('Enter', { repeat: true }), DEFAULT_PLAY_KEYS)).toEqual([]);
    expect(playActionsOf(press('ArrowDown', { repeat: true }), DEFAULT_PLAY_KEYS)).toEqual(['speedDown']);
    expect(playActionsOf(press('PageUp', { repeat: true, alt: true }), DEFAULT_PLAY_KEYS)).toEqual(['liftDown']);
  });

  it('writes a binding with the Ctrl / Alt / Shift it is pressed with, and a modifier key alone as itself', () => {
    expect(bindingOf(press('PageUp', { ctrl: true, alt: true }))).toBe('Ctrl+Alt+PageUp');
    expect(bindingOf(press('ArrowUp', { shift: true, alt: true }))).toBe('Alt+Shift+ArrowUp');
    expect(bindingOf({ code: 'ArrowUp', ctrlKey: false, altKey: false, shiftKey: false })).toBe('ArrowUp');
    expect(bindingOf(press('ControlRight', { ctrl: true }))).toBe('ControlRight');
    expect(bindingOf(press('ShiftLeft', { shift: true }))).toBe('ShiftLeft');
    expect(cleanPlayKey('Alt+Ctrl+KeyQ')).toBe('Ctrl+Alt+KeyQ');
    expect(cleanPlayKey('Shift+Alt+ArrowUp')).toBe('Alt+Shift+ArrowUp');
    expect(cleanPlayKey('Escape')).toBe(null);
    expect(cleanPlayKey('Shift+')).toBe(null);
    expect(cleanPlayKey(7)).toBe(null);
  });

  it('tells where a lane takes a function key: the same key, or the Ctrl / Alt / Shift it needs', () => {
    expect(laneTakes('Enter', 'Enter')).toBe(true);
    expect(laneTakes('PageUp', 'Alt+PageUp')).toBe(true);
    expect(laneTakes('AltLeft', 'Alt+PageUp')).toBe(true);
    expect(laneTakes('ControlLeft', 'Alt+PageUp')).toBe(false);
    // the scratch on L-Shift (7K+1S) presses itself with the bigger SPEED and offset steps, not with LIFT or SUDDEN+
    expect(laneTakes('ShiftLeft', DEFAULT_PLAY_KEYS.speedUpBig)).toBe(true);
    expect(laneTakes('ShiftRight', DEFAULT_PLAY_KEYS.offsetDownBig)).toBe(true);
    expect(laneTakes('ShiftLeft', DEFAULT_PLAY_KEYS.liftUp)).toBe(false);
    expect(laneTakes('ShiftLeft', DEFAULT_PLAY_KEYS.suddenUp)).toBe(false);
  });

  it('marks functions on the same key, apart from the skip and FEVER sharing Enter', () => {
    expect([...sharedPlayKeys(DEFAULT_PLAY_KEYS)]).toEqual([]);
    expect([...sharedPlayKeys({ ...DEFAULT_PLAY_KEYS, retry: 'Home' })].sort()).toEqual(['covers', 'retry']);
    expect([...sharedPlayKeys({ ...DEFAULT_PLAY_KEYS, retry: 'Enter' })].sort()).toEqual(['fever', 'retry', 'skip']);
  });
});
