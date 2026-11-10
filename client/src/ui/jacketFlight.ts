/**
 * The jacket's way from the song select to the start card. As a play starts the select leaves
 * where its jacket stood on the screen; the start card that mounts next takes that place and
 * brings its own jacket over from there. A play started anywhere else (a retry, the result, the
 * editor's test) leaves none, and its card simply appears.
 */

/** A place left longer ago than this belongs to a play that never came (ms). */
const FRESH_MS = 1500;
/** How long the jacket travels, and how it eases into its place. */
const FLIGHT_MS = 280;
const FLIGHT_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/** A box on the screen (px), as getBoundingClientRect gives it. */
export type Box = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

let origin: { rect: DOMRect; at: number } | null = null;

/** Leaves where the jacket stands now (the song select, just before the play starts); null forgets it. */
export function setJacketOrigin(rect: DOMRect | null): void {
  origin = rect && rect.width > 0 && rect.height > 0 ? { rect, at: performance.now() } : null;
}

/** The place left for the card that mounts now: given once, and only while it is fresh. */
export function takeJacketOrigin(): DOMRect | null {
  const left = origin;
  origin = null;
  return left && performance.now() - left.at <= FRESH_MS ? left.rect : null;
}

/** The transform, about its top left corner, that draws a box laid out at `to` where `from` is. */
export function flightTransform(from: Box, to: Box): string {
  const n = (v: number) => Math.round(v * 1000) / 1000;
  return `translate(${n(from.left - to.left)}px, ${n(from.top - to.top)}px) scale(${n(from.width / to.width)}, ${n(from.height / to.height)})`;
}

/**
 * Brings `jacket`, laid out in its place, over from `from` while `rest` (what stands around it)
 * comes up: transforms and opacity only, once. Nothing moves for a player who asked for less motion.
 */
export function flyJacket(jacket: HTMLElement, from: Box, rest: readonly HTMLElement[] = []): void {
  const to = jacket.getBoundingClientRect();
  if (to.width <= 0 || to.height <= 0 || typeof jacket.animate !== 'function') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const timing: KeyframeAnimationOptions = { duration: FLIGHT_MS, easing: FLIGHT_EASING };
  jacket.animate([{ transformOrigin: '0 0', transform: flightTransform(from, to) }, { transformOrigin: '0 0', transform: 'none' }], timing);
  for (const el of rest) el.animate([{ opacity: 0 }, { opacity: 1 }], timing);
}
