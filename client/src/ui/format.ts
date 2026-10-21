/** How the play's numbers are written, the same on every screen (HUD, toasts, cards, settings). */

/** A speed: 4.00, 4.10, 4.37 (two decimals: keeping the visible time moves it by 0.01). */
export const speedText = (v: number) => v.toFixed(2);

/** A cover or LIFT share: 25.0% (one decimal: in play they move by 2.5 %). */
export const coverText = (v: number) => `${(Math.round(v * 1000) / 10).toFixed(1)}%`;

/** A length in minutes and seconds: 2:05 (rounded up, so the last second reads 0:01, not 0:00). */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000 - 1e-6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * A timing error in whole ms, signed (+ late, - early); under half a ms it is exact and unsigned.
 * A tenth of a ms is finer than any input reports a press.
 */
export function errorText(errorMs: number): string {
  if (Math.abs(errorMs) < 0.5) return '0ms';
  // rounded away from zero alike on both sides (-0.5 is -1, as +0.5 is +1)
  const ms = Math.sign(errorMs) * Math.round(Math.abs(errorMs));
  return `${ms > 0 ? '+' : ''}${ms}ms`;
}

/** fast / slow / exact (|error| under half a ms) for the colour of an error. */
export function errorKind(errorMs: number): 'fast' | 'slow' | 'exact' {
  if (Math.abs(errorMs) < 0.5) return 'exact';
  return errorMs < 0 ? 'fast' : 'slow';
}
