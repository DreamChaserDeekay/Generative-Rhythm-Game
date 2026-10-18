/** A design token (custom property on :root) as drawn on a canvas, e.g. token('--bg') → '#0b0c10'. */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Canvas font from the type tokens: weight, size token and the page's font family. */
export function canvasFont(weight: number, sizeToken: string): string {
  return `${weight} ${token(sizeToken)} ${getComputedStyle(document.documentElement).fontFamily}`;
}
