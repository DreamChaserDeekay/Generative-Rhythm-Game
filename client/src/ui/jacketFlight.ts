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

/** How long the start card takes to give way to the play: the jacket into the track's far end, the card's colour into the play's. */
export const INTO_TRACK_MS = 700;

/**
 * The transform, about the jacket's middle, that takes a box at `from` to a point `to` (px) far
 * down the track: small, as far things are.
 */
export function intoTrackTransform(from: Box, to: { x: number; y: number }, scale = 0.06): string {
  const n = (v: number) => Math.round(v * 1000) / 1000;
  return `translate(${n(to.x - (from.left + from.width / 2))}px, ${n(to.y - (from.top + from.height / 2))}px) scale(${scale})`;
}

/**
 * The start card gives way to the play (it has started under it): its jacket goes off into the
 * track's far end (`to`, px on the screen), what stands around it goes at once, and its colour
 * (the card's ground and the song's backdrop) melts into the play's. Transforms and opacity only;
 * `done` comes when it is over, at once for a player who asked for less motion.
 */
export function flyIntoTrack(card: HTMLElement, to: { x: number; y: number } | null, done: () => void): void {
  // once (an effect run twice in development must not start it again from where it is)
  if (card.dataset.leaving !== undefined) return;
  card.dataset.leaving = '';
  const jacket = card.querySelector<HTMLElement>('.loading-jacket');
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (reduced || typeof card.animate !== 'function') {
    done();
    return;
  }
  const easeIn = 'cubic-bezier(0.55, 0, 0.75, 0.2)';
  const fade = (el: Element, ms: number, delay = 0) => (el as HTMLElement).animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, delay, easing: 'ease-out', fill: 'forwards' });
  for (const el of card.querySelectorAll('.loading-text, .loading-status, .loading-keys')) fade(el, 160);
  for (const el of card.querySelectorAll('.backdrop')) fade(el, INTO_TRACK_MS - 100, 100);
  const ground = getComputedStyle(card).backgroundColor;
  const clear = ground.replace(/^rgba?\(([^,]+),([^,]+),([^,)]+).*$/, 'rgba($1,$2,$3,0)');
  const melt = card.animate([{ backgroundColor: ground }, { backgroundColor: clear }], { duration: INTO_TRACK_MS - 100, delay: 100, easing: 'ease-in-out', fill: 'forwards' });
  if (jacket && to) {
    const from = jacket.getBoundingClientRect();
    // where it goes, left on it (data-into)
    jacket.dataset.into = intoTrackTransform(from, to);
    jacket.animate(
      [
        { transformOrigin: '50% 50%', transform: 'none', opacity: 1 },
        { transformOrigin: '50% 50%', transform: intoTrackTransform(from, to, 0.35), opacity: 1, offset: 0.55 },
        { transformOrigin: '50% 50%', transform: intoTrackTransform(from, to), opacity: 0 },
      ],
      { duration: INTO_TRACK_MS, easing: easeIn, fill: 'forwards' },
    );
  } else if (jacket) fade(jacket, INTO_TRACK_MS - 200);
  melt.onfinish = done;
  melt.oncancel = done;
}

/**
 * The play's last word and the result's stamp: as a play ends, the HUD leaves where its lamp
 * stood (data-testid="hud-lamp": the end of the play's own show) and which lamp it was; the result
 * that mounts next sends its lamp, the stamp, over from there. A play that ends with none (a
 * practice, autoplay, a HUD without it) leaves none, and the stamp lands as it always did.
 */
let lampOrigin: { rect: DOMRect; lamp: string; at: number } | null = null;

/** Leaves where the HUD's lamp stands now (read as the play ends, before the HUD goes). */
export function leaveLampOrigin(root: ParentNode = document): void {
  const el = root.querySelector<HTMLElement>('[data-testid="hud-lamp"]');
  const rect = el?.getBoundingClientRect();
  lampOrigin = el && rect && rect.width > 0 && rect.height > 0 ? { rect, lamp: el.dataset.lamp ?? '', at: performance.now() } : null;
}

/** The place the HUD's lamp left for the result that mounts now: given once, and only while it is fresh. */
export function takeLampOrigin(): { rect: DOMRect; lamp: string } | null {
  const left = lampOrigin;
  lampOrigin = null;
  return left && performance.now() - left.at <= FRESH_MS ? { rect: left.rect, lamp: left.lamp } : null;
}

/** How long the stamp travels from the play's lamp to its place. */
export const STAMP_FLIGHT_MS = 520;

/** The transform, about its middle, that draws a box laid out at `to` over `from`, kept in its proportions (its height matched). */
export function stampTransform(from: Box, to: Box): string {
  const n = (v: number) => Math.round(v * 1000) / 1000;
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  return `translate(${n(dx)}px, ${n(dy)}px) scale(${n(from.height / to.height)})`;
}

/**
 * Sends `stamp`, laid out in its place, over from `from` and down into it, once: a second call
 * (React's StrictMode runs an effect twice in development) would measure it in flight and start it
 * from where it is. Where it came from is left on it (data-stamp-from). Nothing moves for a player
 * who asked for less motion.
 */
export function flyStamp(stamp: HTMLElement, from: Box): void {
  if (stamp.dataset.stampFrom !== undefined) return;
  const to = stamp.getBoundingClientRect();
  if (to.width <= 0 || to.height <= 0 || typeof stamp.animate !== 'function') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const start = stampTransform(from, to);
  stamp.dataset.stampFrom = start;
  stamp.animate(
    [
      { transformOrigin: '50% 50%', transform: start },
      { transformOrigin: '50% 50%', transform: 'scale(1.08)', offset: 0.8 },
      { transformOrigin: '50% 50%', transform: 'none' },
    ],
    { duration: STAMP_FLIGHT_MS, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)' },
  );
}
