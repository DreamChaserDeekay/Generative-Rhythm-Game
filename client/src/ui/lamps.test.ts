import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { difficultySystems } from '../engine/config';
import { LAMP_CLASS } from './lamps';

// The lamp colours of styles.css (the usual palette and the colour-blind one) against the
// difficulty colours they are shown beside: a lamp is never read as a difficulty.
const css = readFileSync(fileURLToPath(new URL('../styles.css', import.meta.url)), 'utf-8');

/** The custom properties of the first rule with this selector, `var(--x)` read from the same rule. */
function tokens(selector: string): Record<string, string> {
  const at = css.indexOf(`${selector} {`);
  const body = css.slice(at, css.indexOf('}', at));
  const all = Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  return Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.replace(/^var\((--[\w-]+)\)$/, (_, name: string) => all[name] ?? v)]));
}

/** CIE L*a*b* (D65) of a #rrggbb colour. */
function lab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const deltaE = (a: string, b: string) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));

describe('lamp colours', () => {
  const tiers = Object.values(difficultySystems).flatMap((s) => s.tiers.map((t) => [`${s.id} ${t.id}`, t.color] as const));
  const lamps = Object.values(LAMP_CLASS);

  for (const [palette, selector] of [
    ['usual', ':root'],
    ['colour-blind', ':root.palette-cb'],
  ] as const) {
    it(`keep off every difficulty colour (${palette} palette)`, () => {
      const t = tokens(selector);
      for (const lamp of lamps) {
        const colour = t[`--lamp-${lamp}`];
        expect(colour, lamp).toMatch(/^#[0-9a-f]{6}$/i);
        for (const [tier, tierColour] of tiers) expect(deltaE(colour, tierColour), `${lamp} ${colour} beside ${tier} ${tierColour}`).toBeGreaterThanOrEqual(17);
      }
    });
  }
});
