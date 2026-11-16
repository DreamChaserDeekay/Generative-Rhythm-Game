/** A design token (custom property on :root) as drawn on a canvas, e.g. token('--bg') → '#0b0c10'. */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** A length token in CSS pixels as the page shows it now, e.g. px('--fs-label') → 13 (19.5 on a 1080p window). */
export function px(name: string): number {
  const value = token(name);
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  if (value.endsWith('rem')) return n * Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return n;
}

/** Canvas font from the type tokens: weight, size token (in pixels: a canvas knows no rem) and the page's font family. */
export function canvasFont(weight: number, sizeToken: string): string {
  return `${weight} ${px(sizeToken)}px ${getComputedStyle(document.documentElement).fontFamily}`;
}
