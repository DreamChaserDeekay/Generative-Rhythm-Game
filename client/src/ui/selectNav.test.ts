import { describe, expect, it } from 'vitest';
import { alongLine, cursorStep, edgeLine, landing, lineStep, randomIndex, shiftChangesFolder, type PanelLines } from './selectNav';

describe('the song list cursor', () => {
  it('wraps around the ends on a fresh press, stops there when held or paged', () => {
    expect(cursorStep(4, 5, 1, true)).toBe(0);
    expect(cursorStep(0, 5, -1, true)).toBe(4);
    expect(cursorStep(4, 5, 1, false)).toBe(4);
    expect(cursorStep(0, 5, -1, false)).toBe(0);
    expect(cursorStep(2, 5, 1, true)).toBe(3);
    // a page stops at the ends even on a fresh press
    expect(cursorStep(3, 10, 8, true)).toBe(9);
    expect(cursorStep(3, 10, -8, true)).toBe(0);
  });

  it('starts on the first song when none is under it, and finds none in an empty list', () => {
    expect(cursorStep(-1, 5, 1, true)).toBe(0);
    expect(cursorStep(-1, 5, -1, true)).toBe(0);
    expect(cursorStep(0, 0, 1, true)).toBe(-1);
  });

  it('picks a random song other than the one under the cursor', () => {
    const picks = new Set<number>();
    for (const r of [0, 0.2, 0.4, 0.6, 0.8, 0.99]) picks.add(randomIndex(5, 2, () => r));
    expect([...picks].sort()).toEqual([0, 1, 3, 4]);
    expect(randomIndex(1, 0)).toBe(0);
    expect(randomIndex(0, -1)).toBe(-1);
    expect(randomIndex(3, -1, () => 0.99)).toBe(2);
  });
});

describe('the folder key', () => {
  it('is Shift alone only while no lane of the key mode is played with Shift', () => {
    expect(shiftChangesFolder(['KeyD', 'KeyF', 'KeyJ', 'KeyK'])).toBe(true);
    expect(shiftChangesFolder(['ShiftLeft', 'KeyS', 'KeyD'])).toBe(false);
    // a second key counts too
    expect(shiftChangesFolder(['KeyD', 'KeyF', 'ShiftRight'])).toBe(false);
  });
});

describe("a panel's lines", () => {
  // the play options' tabs (the second chosen), a row, a choice of four (the third chosen), a row
  // of three buttons, a row
  const p: PanelLines = {
    lines: ['tabs', 'tabs', 'tabs', 'row', 'style', 'style', 'style', 'style', 'buttons', 'buttons', 'buttons', 'last'],
    chosen: [false, true, false, false, false, false, true, false, false, false, false, false],
  };

  it('lands on a choice on its chosen button, on any other line on its first control', () => {
    expect(landing(p, 0)).toBe(1);
    expect(landing(p, 4)).toBe(6);
    expect(landing(p, 10)).toBe(8);
    expect(landing(p, 3)).toBe(3);
  });

  it('goes line by line with ↑↓, onto the tabs above the first row and nowhere past the ends', () => {
    expect(lineStep(p, 3, 1)).toBe(6);
    expect(lineStep(p, 6, 1)).toBe(8);
    expect(lineStep(p, 9, 1)).toBe(11);
    expect(lineStep(p, 11, 1)).toBe(-1);
    expect(lineStep(p, 9, -1)).toBe(6);
    expect(lineStep(p, 3, -1)).toBe(1);
    expect(lineStep(p, 2, -1)).toBe(-1);
    expect(lineStep(p, 1, 1)).toBe(3);
  });

  it('starts Home on the first line and End on the last', () => {
    expect(edgeLine(p, false)).toBe(1);
    expect(edgeLine(p, true)).toBe(11);
    expect(edgeLine({ lines: [], chosen: [] }, true)).toBe(-1);
  });

  it("picks a choice's neighbour of the chosen button with ←→, wherever the focus is on it, round the ends", () => {
    expect(alongLine(p, 6, 1)).toBe(7);
    expect(alongLine(p, 6, -1)).toBe(5);
    // the focus on another button of the choice still steps from the chosen one
    expect(alongLine(p, 4, 1)).toBe(7);
    expect(alongLine(p, 1, 1)).toBe(2);
    expect(alongLine({ lines: ['s', 's', 's'], chosen: [false, false, true] }, 2, 1)).toBe(0);
    expect(alongLine({ lines: ['s', 's', 's'], chosen: [true, false, false] }, 0, -1)).toBe(2);
  });

  it('moves along a row of buttons with ←→ and stops at its ends', () => {
    expect(alongLine(p, 8, 1)).toBe(9);
    expect(alongLine(p, 10, 1)).toBe(-1);
    expect(alongLine(p, 8, -1)).toBe(-1);
    expect(alongLine(p, 3, 1)).toBe(-1);
  });
});
