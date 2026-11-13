/**
 * The 2D context of a canvas a picture is painted on once and kept: a texture's picture, a jacket.
 *
 * It is kept in the page's own memory, not on the graphics card (`willReadFrequently`). When the graphics
 * process is lost (the driver resets, the process crashes, the card is taken away) the browser wipes every
 * canvas it had drawn on the card, and gives the WebGL context back empty. The renderer uploads its textures
 * again from their canvases then, and from a wiped one it uploads nothing: the gear came back black, without
 * its rails and without a note, for the rest of the play. A canvas kept in memory is still there to upload.
 *
 * These canvases are painted once or seldom (a gear when it is laid out, a note when it is first drawn), so
 * painting them without the graphics card costs nothing that shows. A canvas that is drawn afresh every frame
 * has no use for this: it draws itself again.
 */
export function context2d(canvas: HTMLCanvasElement, settings: CanvasRenderingContext2DSettings = {}): CanvasRenderingContext2D {
  return canvas.getContext('2d', { ...settings, willReadFrequently: true }) as CanvasRenderingContext2D;
}
