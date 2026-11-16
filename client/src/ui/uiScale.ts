/**
 * The menus are drawn for a 1280 × 720 window and grow with a larger one, so a screen reads the
 * same on a 720p and a 4K display. They never shrink under it: a smaller window keeps the type
 * its size and the layouts give way instead.
 */
export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 720;

/** How much larger than their drawn size the menus show in a window of this size (1 and up). */
export function uiScaleFor(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1;
  return Math.max(1, Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT));
}

/** The scale now on the page (what one rem is over 16 px). */
export function uiScale(): number {
  return uiScaleFor(window.innerWidth, window.innerHeight);
}

/**
 * Keeps --ui-scale on the page's root at the window's scale: the style sheet's rem sizes follow
 * it. The play HUD has its own scale (Hud.ts) and is not touched by this. Returns a stop.
 */
export function watchUiScale(): () => void {
  const root = document.documentElement;
  let shown = 0;
  const apply = () => {
    // (a hundredth is finer than a pixel of type; fewer distinct values, fewer relayouts while dragging)
    const scale = Math.round(uiScale() * 100) / 100;
    if (scale === shown) return;
    shown = scale;
    root.style.setProperty('--ui-scale', String(scale));
  };
  apply();
  window.addEventListener('resize', apply);
  return () => window.removeEventListener('resize', apply);
}
