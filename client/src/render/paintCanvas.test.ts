import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { context2d, keepPainted, paintCanvas, whenRestored } from './paintCanvas';

/** A canvas that only writes down what it is asked for. */
function fakeCanvas() {
  const asked: unknown[][] = [];
  const context = { mine: true };
  const listeners = new Map<string, Set<() => void>>();
  const canvas = {
    getContext: (...args: unknown[]) => (asked.push(args), context),
    addEventListener: (type: string, fn: () => void) => void (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn),
    removeEventListener: (type: string, fn: () => void) => void listeners.get(type)?.delete(fn),
  } as unknown as HTMLCanvasElement;
  /** The browser hands the canvas back empty. */
  const restore = () => [...(listeners.get('contextrestored') ?? [])].forEach((fn) => fn());
  return { canvas, asked, context, restore, listening: () => [...listeners.values()].reduce((n, set) => n + set.size, 0) };
}

/** Every source file under `dir` (a URL ending in /) that is not a test, with its path from there. */
function sources(dir: URL, under = ''): { path: string; text: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return sources(new URL(`${entry.name}/`, dir), `${under}${entry.name}/`);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [{ path: `${under}${entry.name}`, text: readFileSync(new URL(entry.name, dir), 'utf-8') }];
  });
}

const SRC = new URL('../', import.meta.url);

afterEach(() => vi.unstubAllGlobals());

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

  it('is off the page where the browser has such canvases: the one kind that is never wiped', () => {
    class Off {
      constructor(
        readonly width: number,
        readonly height: number,
      ) {}
    }
    vi.stubGlobal('OffscreenCanvas', Off);
    const made = paintCanvas();
    expect(made).toBeInstanceOf(Off);
    // as large as a new canvas of the page, until it is sized
    expect([made.width, made.height]).toEqual([300, 150]);
    // a browser without them: a canvas of the page, as before
    vi.stubGlobal('OffscreenCanvas', undefined);
    const element = { tagName: 'CANVAS' };
    vi.stubGlobal('document', { createElement: (tag: string) => (tag === 'canvas' ? element : null) });
    expect(paintCanvas()).toBe(element);
  });
});

describe('a canvas shown in the page', () => {
  it('is painted at once, and again every time the browser hands it back empty, until told to stop', () => {
    const { canvas, restore, listening } = fakeCanvas();
    const paint = vi.fn();
    const stop = keepPainted(canvas, paint);
    expect(paint).toHaveBeenCalledTimes(1);
    restore();
    restore();
    expect(paint).toHaveBeenCalledTimes(3);
    stop();
    restore();
    expect(paint).toHaveBeenCalledTimes(3);
    expect(listening()).toBe(0);
  });

  it('can be only watched: what paints it is called when it is handed back, not before', () => {
    const { canvas, restore, listening } = fakeCanvas();
    const again = vi.fn();
    const stop = whenRestored(canvas, again);
    expect(again).not.toHaveBeenCalled();
    restore();
    expect(again).toHaveBeenCalledTimes(1);
    stop();
    expect(listening()).toBe(0);
  });
});

describe('the sources', () => {
  const all = sources(SRC);

  it('take a 2D context through context2d only, but for the canvases that draw themselves again many times a second', () => {
    // A canvas taken any other way is drawn on the graphics card: its picture goes with the graphics
    // process (a black gear with no notes, blank jackets). The ones let be, with how often each takes
    // a context by itself:
    const letBe: Record<string, number> = {
      // this file's own
      'render/paintCanvas.ts': 1,
      // the spectrum behind the play: drawn afresh 30 times a second while the song plays
      'ui/PlayBackground.ts': 1,
      // the chart editor's view: drawn again on every change and every frame of its playback, and
      // laid out and drawn again when its canvas is handed back empty (ui/EditorScreen.tsx)
      'editor/EditorView.ts': 1,
    };
    expect(all.length).toBeGreaterThan(100);
    const taking = Object.fromEntries(
      all
        .map(({ path, text }) => [path, text.split('\n').filter((line) => /getContext\(\s*['"]2d['"]/.test(line)).length] as const)
        .filter(([, count]) => count > 0),
    );
    expect(taking).toEqual(letBe);
  });

  it('make the renderer’s canvases through paintCanvas only: a texture’s picture is never a canvas of the page', () => {
    // (a canvas of the page is wiped where the browser draws in software, even kept in memory)
    const making = all.filter(({ path, text }) => path.startsWith('render/') && path !== 'render/paintCanvas.ts' && /createElement\(\s*['"]canvas['"]/.test(text)).map(({ path }) => path);
    expect(making).toEqual([]);
  });

  it('paint a canvas of the page again when it is handed back empty', () => {
    // every file that puts a painted canvas in the page watches for it (keepPainted or whenRestored);
    // PlayBackground's spectrum and the editor's view are named above
    const shown = ['ui/Hud.ts', 'ui/songArt.tsx', 'ui/PlayBackground.ts', 'ui/ChartMinimap.tsx', 'ui/AnalysisView.tsx', 'ui/EditorScreen.tsx'];
    for (const path of shown) {
      const file = all.find((f) => f.path === path);
      expect(file, path).toBeDefined();
      expect(/\b(keepPainted|whenRestored)\(/.test(file!.text), path).toBe(true);
    }
    // the other canvases of the page are the track's (WebGL: the renderer's own, which three.js sets up
    // again when its context is given back); a file that comes with a canvas must be put in one of the two lists
    const tracks = ['ui/CalibrationScreen.tsx', 'ui/ChartStage.tsx', 'ui/GearPreview.tsx', 'ui/PlayScreen.tsx'];
    const withCanvas = all.filter(({ path, text }) => !path.startsWith('render/') && (/<canvas\b/.test(text) || /createElement\(\s*['"]canvas['"]/.test(text))).map(({ path }) => path);
    expect(withCanvas.sort()).toEqual([...shown, ...tracks].sort());
    for (const path of tracks) expect(all.find((f) => f.path === path)!.text, path).toMatch(/new TrackRenderer\(|canvas: canvasRef\.current/);
  });
});
