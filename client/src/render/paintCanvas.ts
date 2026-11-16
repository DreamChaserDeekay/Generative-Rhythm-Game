/**
 * Canvases a picture is painted on once and kept (a texture's picture, a jacket), and what keeps
 * them when the graphics process is lost.
 *
 * When that process goes (the driver resets, the process crashes, the card is taken away) the browser
 * wipes the canvases whose pictures it kept there, and gives the WebGL context back empty. The renderer
 * uploads its textures again from their canvases then, and from a wiped one it uploads nothing: the gear
 * came back black, without its rails and without a note, for the rest of the play.
 *
 * Which canvases are wiped depends on how the browser draws the page (found by killing the graphics
 * process of Chromium 152 and 153, 2026-11-13):
 *
 *                                        drawn by the graphics card   drawn in software
 *   a canvas of the page, as it comes    wiped                        wiped
 *   … kept in memory (willReadFrequently) kept                        wiped
 *   a canvas off the page, as it comes   wiped                        kept
 *   … kept in memory                     kept                         kept
 *
 * (The browser draws in software where the graphics card cannot be used, and from the third loss of
 * the graphics process within a while on.) So:
 *
 * - a picture that is only ever a texture or a part of another picture is painted on a canvas off
 *   the page, kept in memory: `paintCanvas` and `context2d`. It is never wiped.
 * - a canvas shown in the page is kept in memory as well, and painted again when the browser hands
 *   it back empty: `keepPainted`.
 *
 * These canvases are painted once or seldom (a gear when it is laid out, a note when it is first
 * drawn), so painting them without the graphics card costs nothing that shows. A canvas drawn afresh
 * many times a second has no use for any of this: it draws itself again.
 */
import type { CanvasTexture } from 'three';

/** A canvas to paint on: one of the page, or one off it. */
export type PaintCanvas = HTMLCanvasElement | OffscreenCanvas;
/** A texture whose picture is such a canvas. */
export type PaintTexture = CanvasTexture<PaintCanvas>;

/**
 * A canvas for a picture that is not shown in the page itself (a texture's, a stencil's, a picture
 * drawn onto another): off the page where the browser has such canvases, as large as a new canvas of
 * the page until it is sized.
 */
export function paintCanvas(): PaintCanvas {
  return typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(300, 150) : document.createElement('canvas');
}

/** The 2D context of a canvas painted once and kept: in the page's own memory, whatever else is asked of it. */
export function context2d(canvas: PaintCanvas, settings: CanvasRenderingContext2DSettings = {}): CanvasRenderingContext2D {
  // (the two kinds of canvas hand out the same context but for what it says its canvas is)
  return (canvas as HTMLCanvasElement).getContext('2d', { ...settings, willReadFrequently: true }) as CanvasRenderingContext2D;
}

/** Calls `again` whenever the browser hands a canvas of the page back empty. Returns the way to stop. */
export function whenRestored(canvas: HTMLCanvasElement, again: () => void): () => void {
  canvas.addEventListener('contextrestored', again);
  return () => canvas.removeEventListener('contextrestored', again);
}

/**
 * Paints a canvas shown in the page: now, and again whenever the browser hands it back empty (its
 * state is new then as well: `paint` sets all it needs). Returns the way to stop.
 */
export function keepPainted(canvas: HTMLCanvasElement, paint: () => void): () => void {
  paint();
  return whenRestored(canvas, paint);
}
