import { useEffect, useLayoutEffect, useRef } from 'react';

/** A screen's listeners on the window: its keys, and a pointer press (seen first: capture). */
export interface WindowListeners {
  keydown?: (e: KeyboardEvent) => void;
  keyup?: (e: KeyboardEvent) => void;
  pointerdownCapture?: (e: PointerEvent) => void;
}

/**
 * A screen's listeners on the window. `make` gives this render's listeners (they read its state); the
 * window calls the latest of them through listeners added once while the screen is up, rather than
 * taken off and added again on every render.
 */
export function useWindowListeners(make: () => WindowListeners): void {
  const now = make();
  const latest = useRef(now);
  useLayoutEffect(() => {
    latest.current = now;
  });
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => latest.current.keydown?.(e);
    const keyup = (e: KeyboardEvent) => latest.current.keyup?.(e);
    const pointerdown = (e: PointerEvent) => latest.current.pointerdownCapture?.(e);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('pointerdown', pointerdown, true);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('pointerdown', pointerdown, true);
    };
  }, []);
}
