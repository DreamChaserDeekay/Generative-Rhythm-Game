/**
 * A number setting typed in, or picked on its gauge with the pointer (설정, the play options).
 *
 * A row shows its value through its own format ("90%", "+12ms", "×1.00", "25.0%", "끔"), so what a
 * player types is a number as the row shows it: 90 on a "90%" row is 0.9. How the shown number
 * stands to the stored one is read off the format itself (`entryScale`): a straight line through
 * what it shows at a few values, to the shown number's own precision.
 */

/** The first number in a text, signed ("−20%" is -20, "×1.50" 1.5, "2칸" 2); null where there is none. */
export function numberIn(text: string): number | null {
  const match = numberMatch(text);
  return match === null ? null : Number(match);
}

function numberMatch(text: string): string | null {
  const t = text.replace(/[−–]/g, '-').replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
  const match = /[+-]?(?:\d+(?:\.\d+)?|\.\d+)/.exec(t);
  return match ? match[0] : null;
}

/** shown = a * value + b, to `decimals` places; `resolution` is one shown place as a stored step. */
export interface EntryScale {
  a: number;
  b: number;
  decimals: number;
  resolution: number;
}

/**
 * How a row's shown number stands to its value, read off its format between min and max (stepping by
 * `step`): null where the format shows no number, or none that follows the value in a straight line.
 */
export function entryScale(format: (v: number) => string, min: number, max: number, step: number): EntryScale | null {
  if (!(max > min) || !(step > 0)) return null;
  const steps = Math.round((max - min) / step);
  const at = [...new Set([0, 1, Math.round(steps / 2), steps - 1, steps])].filter((i) => i >= 0 && i <= steps);
  const seen: { v: number; shown: number }[] = [];
  let decimals = 0;
  for (const i of at) {
    const v = Math.min(max, Math.round((min + i * step) * 1e6) / 1e6);
    const match = numberMatch(format(v));
    if (match === null) continue;
    seen.push({ v, shown: Number(match) });
    decimals = Math.max(decimals, match.split('.')[1]?.length ?? 0);
  }
  if (seen.length < 2) return null;
  const first = seen[0];
  const last = seen[seen.length - 1];
  const a = Number(((last.shown - first.shown) / (last.v - first.v)).toPrecision(6));
  if (!Number.isFinite(a) || a === 0) return null;
  const b = Number((first.shown - a * first.v).toPrecision(6)) || 0;
  // every value seen must show where the line puts it, to the shown places (a format that rounds is fine)
  const place = 10 ** -decimals;
  if (seen.some(({ v, shown }) => Math.abs(a * v + b - shown) > place / 2 + 1e-9)) return null;
  return { a, b, decimals, resolution: place / Math.abs(a) };
}

const tidy = (v: number) => Math.round(v * 1e6) / 1e6;

/** A typed number (as the row shows it) as the value it stands for: to the shown places, within min and max. */
export function typedValue(typed: number, scale: EntryScale, min: number, max: number): number {
  const v = (typed - scale.b) / scale.a;
  const placed = tidy(Math.round(v / scale.resolution) * scale.resolution);
  return Math.min(max, Math.max(min, placed));
}

/** A value as the number a player edits ("90" for 0.9 on a "90%" row). */
export function entryText(value: number, scale: EntryScale): string {
  return String(tidy(Number((scale.a * value + scale.b).toFixed(scale.decimals))));
}

/** Where a pointer at `at` (0 at the gauge's left, 1 at its right) puts a value: on a step of its range. */
export function gaugeValue(at: number, min: number, max: number, step: number): number {
  const f = Math.min(1, Math.max(0, at));
  const steps = Math.round((f * (max - min)) / step);
  return Math.min(max, Math.max(min, tidy(min + steps * step)));
}

/** The keys that start typing on a number row: a digit, a point or a minus. */
export function startsEntry(key: string): boolean {
  return /^[0-9.\-]$/.test(key);
}
