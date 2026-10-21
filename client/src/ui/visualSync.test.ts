import { describe, expect, it } from 'vitest';
import { keyModes } from '../engine/config';
import { OFFSET_MAX } from '../settings/settings';
import { clickChords, keyPairText, offsetStep, syncKeyOf, syncTestKeys } from './visualSync';

describe('the display step of the calibration', () => {
  it('puts a chord on every key lane at each click, and none on the scratch', () => {
    const mode = keyModes['7K+1S'];
    const notes = clickChords(mode, [1500, 2000]);
    expect(notes).toHaveLength(14);
    expect(new Set(notes.map((n) => n.lane))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7]));
    expect(notes.filter((n) => n.t === 2000)).toHaveLength(7);
    // the renderer reads them by index, in time order
    expect(notes.map((n) => n.index)).toEqual(notes.map((_, i) => i));
    expect(notes.every((n, i) => i === 0 || n.t >= notes[i - 1].t)).toBe(true);
    expect(notes.every((n) => n.type === 'tap' && n.endT === n.t && !n.headDone)).toBe(true);
  });

  it('moves the offset by 1 ms, 5 with Shift, and no further than the settings take it', () => {
    expect(offsetStep(0, 1, false)).toBe(1);
    expect(offsetStep(0, -1, true)).toBe(-5);
    expect(offsetStep(OFFSET_MAX - 2, 1, true)).toBe(OFFSET_MAX);
    expect(offsetStep(-OFFSET_MAX, -1, false)).toBe(-OFFSET_MAX);
    // a stored value off the ms grid comes back on it
    expect(offsetStep(2.4, 1, false)).toBe(3);
  });
});

describe('the sync test keys', () => {
  const press = (code: string, shiftKey = false, ctrlKey = false) => ({ code, shiftKey, ctrlKey, altKey: false, metaKey: false });

  it('moves the display offset with ←→ and, played by hand, the judgement offset with Shift+←→', () => {
    const keys = syncTestKeys(['KeyD', 'KeyF', 'KeyJ', 'KeyK'], true);
    expect(keys).toEqual({ visual: ['ArrowLeft', 'ArrowRight'], judgement: ['Shift+ArrowLeft', 'Shift+ArrowRight'], shiftLane: false });
    expect(syncKeyOf(press('ArrowRight'), keys)).toEqual({ offset: 'visual', dir: 1 });
    expect(syncKeyOf(press('ArrowLeft', true), keys)).toEqual({ offset: 'judgement', dir: -1 });
    expect(syncKeyOf(press('ArrowLeft', false, true), keys)).toBeNull();
    expect(syncKeyOf(press('KeyD'), keys)).toBeNull();
    // on autoplay the lanes take no key, and Shift moves nothing
    const auto = syncTestKeys([], false);
    expect(auto).toEqual({ visual: ['ArrowLeft', 'ArrowRight'], judgement: null, shiftLane: false });
    expect(syncKeyOf(press('ArrowLeft', true), auto)).toBeNull();
  });

  it('leaves Shift to a lane on it (the scratch, the side lanes): the judgement offset goes to [ ], a held Shift lane keeps ←→', () => {
    for (const mode of ['7K+1S', '6K+FX', '4K+FX'] as const) {
      const keys = syncTestKeys(keyModes[mode].bindings.default, true);
      expect(keys.visual).toEqual(['ArrowLeft', 'ArrowRight']);
      expect(keys.judgement).toEqual(['BracketLeft', 'BracketRight']);
      expect(syncKeyOf(press('BracketRight'), keys)).toEqual({ offset: 'judgement', dir: 1 });
      expect(syncKeyOf(press('ArrowLeft', true), keys)).toEqual({ offset: 'visual', dir: -1 });
      expect(syncKeyOf(press('BracketLeft', true), keys)).toEqual({ offset: 'judgement', dir: -1 });
    }
  });

  it('takes the next pair no lane takes, or none', () => {
    const keys = syncTestKeys(['ArrowLeft', 'KeyF', 'KeyJ', 'ArrowRight'], true);
    expect(keys.visual).toEqual(['BracketLeft', 'BracketRight']);
    expect(keys.judgement).toEqual(['Shift+BracketLeft', 'Shift+BracketRight']);
    expect(syncKeyOf(press('ArrowLeft'), keys)).toBeNull();
    const crowded = syncTestKeys(['ShiftLeft', 'ArrowLeft', 'BracketRight', 'Period'], true);
    expect(crowded).toEqual({ visual: null, judgement: null, shiftLane: true });
  });

  it('names a pair as the screen shows it', () => {
    expect(keyPairText(['ArrowLeft', 'ArrowRight'])).toBe('←→');
    expect(keyPairText(['Shift+ArrowLeft', 'Shift+ArrowRight'])).toBe('Shift+←→');
    expect(keyPairText(['BracketLeft', 'BracketRight'])).toBe('[ ]');
  });
});
