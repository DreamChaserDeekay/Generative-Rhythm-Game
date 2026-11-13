import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { context2d } from './paintCanvas';

/** A canvas that only writes down what it is asked for. */
function fakeCanvas() {
  const asked: unknown[][] = [];
  const context = { mine: true };
  const canvas = { getContext: (...args: unknown[]) => (asked.push(args), context) } as unknown as HTMLCanvasElement;
  return { canvas, asked, context };
}

describe('a canvas a picture is painted on once', () => {
  it('is kept in memory: a lost graphics process does not wipe it', () => {
    const { canvas, asked, context } = fakeCanvas();
    expect(context2d(canvas)).toBe(context);
    expect(asked).toEqual([['2d', { willReadFrequently: true }]]);
  });

  it('keeps what else is asked of it', () => {
    const { canvas, asked } = fakeCanvas();
    context2d(canvas, { alpha: false });
    expect(asked).toEqual([['2d', { alpha: false, willReadFrequently: true }]]);
    // and cannot be asked out of it
    context2d(canvas, { willReadFrequently: false });
    expect(asked[1]).toEqual(['2d', { willReadFrequently: true }]);
  });

  it('is the only way the renderer and the HUD take a 2D context', () => {
    // a canvas taken any other way is drawn on the graphics card: its picture goes with the graphics process,
    // and the track comes back without it (a black gear, no notes)
    const here = new URL('./', import.meta.url);
    const sources = readdirSync(here)
      .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'paintCanvas.ts')
      .map((name) => new URL(name, here));
    sources.push(new URL('../ui/Hud.ts', here));
    expect(sources.length).toBeGreaterThan(10);
    for (const file of sources) {
      const taken = readFileSync(file, 'utf-8')
        .split('\n')
        .filter((line) => /getContext\(\s*['"]2d['"]/.test(line));
      expect(taken, file.pathname).toEqual([]);
    }
  });
});
