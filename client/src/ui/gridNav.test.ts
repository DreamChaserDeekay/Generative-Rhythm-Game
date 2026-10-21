import { describe, expect, it } from 'vitest';
import { arrowTarget, type NavStop } from './gridNav';

/** A key mode's block as the key settings lay it out: its keys, its second keys, its buttons. */
function block(mode: string, lanes: number, buttons: number): NavStop[] {
  return [
    ...Array.from({ length: lanes }, (_, i): NavStop => ({ line: `${mode}-1`, column: i })),
    ...Array.from({ length: lanes }, (_, i): NavStop => ({ line: `${mode}-2`, column: i })),
    ...Array.from({ length: buttons }, (): NavStop => ({ line: `${mode}-buttons`, column: null })),
  ];
}

describe('arrows through the key settings', () => {
  // 4K (4 lanes, 3 buttons), then 7K+1S (8 lanes, 4 buttons), then a row of its own
  const stops = [...block('4K', 4, 3), ...block('7K', 8, 4), { line: 'default', column: null }];
  const at = (line: string, column: number) => stops.findIndex((s) => s.line === line && s.column === column);

  it('goes along a line with ←→ and stops at its ends', () => {
    expect(arrowTarget(stops, at('4K-1', 1), 'right', null)).toBe(at('4K-1', 2));
    expect(arrowTarget(stops, at('4K-1', 0), 'left', null)).toBe(-1);
    expect(arrowTarget(stops, at('4K-1', 3), 'right', null)).toBe(-1);
  });

  it('keeps the lane from a key to its second key, and through the buttons to the next mode', () => {
    expect(arrowTarget(stops, at('4K-1', 2), 'down', null)).toBe(at('4K-2', 2));
    const buttons = arrowTarget(stops, at('4K-2', 2), 'down', null);
    expect(stops[buttons].line).toBe('4K-buttons');
    // the first button of the line; the lane kept is the one before it
    expect(buttons).toBe(stops.findIndex((s) => s.line === '4K-buttons'));
    expect(arrowTarget(stops, buttons, 'down', 2)).toBe(at('7K-1', 2));
    // a lane past the narrower mode's last: its nearest
    expect(arrowTarget(stops, at('7K-1', 7), 'up', null)).toBe(stops.findIndex((s) => s.line === '4K-buttons'));
    expect(arrowTarget(stops, stops.findIndex((s) => s.line === '4K-buttons'), 'up', 7)).toBe(at('4K-2', 3));
  });

  it('stops at the first and the last line', () => {
    expect(arrowTarget(stops, 0, 'up', null)).toBe(-1);
    expect(arrowTarget(stops, stops.length - 1, 'down', null)).toBe(-1);
    expect(arrowTarget(stops, stops.length - 2, 'down', 3)).toBe(stops.length - 1);
  });

  it('goes up and down a grid of two columns by its column', () => {
    const grid: NavStop[] = Array.from({ length: 6 }, (_, i) => ({ line: `row${Math.floor(i / 2)}`, column: i % 2 }));
    expect(arrowTarget(grid, 1, 'down', null)).toBe(3);
    expect(arrowTarget(grid, 4, 'up', null)).toBe(2);
    expect(arrowTarget(grid, 4, 'right', null)).toBe(5);
  });
});
