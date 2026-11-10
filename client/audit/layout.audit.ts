import { test } from '@playwright/test';
import { defaultSettings, ensureDemoSong, installAudit, writeData } from './lib';
import { enter, NAMED_STATES } from './states';

/**
 * Every named state at the smallest window (960×600, the desktop app's minimum) and at the usual
 * one (1280×720): text that is cut, controls out of reach or covered, hints that give way; and the
 * interface checks of WCAG 2.2 that can be measured on the page: text contrast (1.4.3), target
 * size (2.5.8), a visible focus (2.4.7), text size, names of controls (4.1.2).
 *
 *   AUDIT_ONLY=<regexp>   only the states it matches
 */

const VIEWPORTS: [string, number, number][] = [
  ['min', 960, 600],
  ['base', 1280, 720],
];
const only = process.env.AUDIT_ONLY ? new RegExp(process.env.AUDIT_ONLY) : null;

/** Runs in the page: what is measured on one state. */
function measure() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const visible = (el: Element): el is HTMLElement => el instanceof HTMLElement && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > 0.05;
  const name = (el: Element): string => {
    const host = el.closest<HTMLElement>('[data-testid]');
    const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `${host?.dataset.testid ?? ''}>${el.tagName.toLowerCase()}${cls}`;
  };
  const text = (el: Element, max = 50) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const ownText = (el: Element) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0);
  const scroller = (el: Element): HTMLElement | null => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 1) return p;
      if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return p;
    }
    return null;
  };

  const all = [...document.querySelectorAll<HTMLElement>('#root *')].filter(visible);

  // text cut by its box (an ellipsis, a clipped line)
  const clipped = all
    .filter((el) => ownText(el) && !el.closest('.hud'))
    .filter((el) => {
      const s = getComputedStyle(el);
      const cutX = el.scrollWidth > el.clientWidth + 1 && s.overflowX !== 'visible';
      const cutY = el.scrollHeight > el.clientHeight + 2 && s.overflowY === 'hidden';
      return cutX || cutY;
    })
    .map((el) => ({ at: name(el), text: text(el, 70), ellipsis: getComputedStyle(el).textOverflow === 'ellipsis', hasTitle: Boolean(el.title || el.closest('[title]')), shownPx: el.clientWidth, needPx: el.scrollWidth }));

  // text that runs out of the window with no scroller to bring it back
  const offscreen = all
    .filter((el) => ownText(el))
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1) && !scroller(el);
    })
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { at: name(el), text: text(el), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] };
    });

  const CONTROLS = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"]), [role="tab"], [role="menuitem"], [role="switch"], [role="spinbutton"]';
  const controls = [...document.querySelectorAll<HTMLElement>(CONTROLS)].filter((el) => visible(el) && !(el as HTMLButtonElement).disabled && !el.classList.contains('opt-step'));

  // controls out of the window (no scroller) or under something else
  const unreachable: { at: string; text: string; why: string }[] = [];
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const out = cx < 0 || cy < 0 || cx > vw || cy > vh;
    if (out) {
      if (!scroller(el)) unreachable.push({ at: name(el), text: text(el), why: 'outside the window' });
      continue;
    }
    // scrolled out of its scroller's box: a scroll (the focus does it) brings it back
    const box = scroller(el)?.getBoundingClientRect();
    if (box && (cx < box.left || cx > box.right || cy < box.top || cy > box.bottom)) continue;
    const top = document.elementFromPoint(cx, cy);
    if (top && !el.contains(top) && !top.contains(el) && !(top.closest('label')?.contains(el) ?? false)) unreachable.push({ at: name(el), text: text(el), why: `under ${name(top)}` });
  }

  // target size (WCAG 2.5.8: 24 by 24 CSS px; inline links in a sentence are exempt)
  const smallTargets = controls
    .filter((el) => !el.closest('.hud'))
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width < 24 || r.height < 24)
    .map(({ el, r }) => ({ at: name(el), text: text(el, 30), w: Math.round(r.width), h: Math.round(r.height) }));

  // names of controls (WCAG 4.1.2): something to read
  const unnamed = controls
    .filter((el) => !(el.getAttribute('aria-label') || text(el) || el.title || (el instanceof HTMLInputElement && (el.placeholder || el.closest('label') || el.labels?.length))))
    .map((el) => ({ at: name(el), tag: el.tagName.toLowerCase(), type: (el as HTMLInputElement).type ?? '' }));

  // text size and contrast (WCAG 1.4.3). The background is the nearest opaque colour under the
  // text; text over a picture, a gradient or a canvas is counted apart (not measured).
  const parse = (c: string): [number, number, number, number] => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return [0, 0, 0, 0];
    const p = m[1].split(/[ ,/]+/).map(Number);
    return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]];
  };
  const lum = ([r, g, b]: number[]) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const over = (top: number[], under: number[]) => {
    const a = top[3];
    return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
  };
  const backgroundOf = (el: Element): { color: number[]; picture: boolean } => {
    const layers: number[][] = [];
    let picture = false;
    for (let p: Element | null = el; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.backgroundImage !== 'none') picture = true;
      const c = parse(s.backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 0.999) break;
    }
    let color: number[] = parse(getComputedStyle(document.body).backgroundColor);
    if (color[3] === 0) color = [0, 0, 0, 1];
    for (const layer of layers.reverse()) color = over(layer, color);
    return { color, picture };
  };
  const lowContrast: { at: string; text: string; ratio: number; need: number; px: number; fg: string; bg: string }[] = [];
  const smallText = new Map<string, { at: string; text: string; px: number; count: number }>();
  let overPicture = 0;
  let measuredText = 0;
  for (const el of all) {
    if (!ownText(el) || el.closest('.hud, canvas')) continue;
    const s = getComputedStyle(el);
    const px = parseFloat(s.fontSize);
    if (px < 12) {
      const key = `${name(el)}@${px}`;
      const had = smallText.get(key);
      if (had) had.count++;
      else smallText.set(key, { at: name(el), text: text(el, 30), px, count: 1 });
    }
    const bg = backgroundOf(el);
    if (bg.picture) {
      overPicture++;
      continue;
    }
    measuredText++;
    const fgRaw = parse(s.color);
    const fg = over([fgRaw[0], fgRaw[1], fgRaw[2], fgRaw[3] * Number(s.opacity)], bg.color);
    const l1 = lum(fg);
    const l2 = lum(bg.color);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const large = px >= 24 || (px >= 18.66 && Number(s.fontWeight) >= 700);
    const need = large ? 3 : 4.5;
    const off = (el as HTMLButtonElement).disabled || el.closest('[disabled], [aria-disabled="true"]') !== null;
    if (ratio < need && !off) lowContrast.push({ at: name(el), text: text(el, 30), ratio: Math.round(ratio * 100) / 100, need, px, fg: s.color, bg: `rgb(${bg.color.slice(0, 3).map(Math.round).join(',')})` });
  }

  const hints = [...document.querySelectorAll<HTMLElement>('.hintbar .hint-item')].map((el) => ({ text: text(el), shown: el.getClientRects().length > 0 && el.getBoundingClientRect().right <= vw + 1 }));

  return {
    pageOverflow: [document.documentElement.scrollWidth - vw, document.documentElement.scrollHeight - vh],
    clipped,
    offscreen,
    unreachable,
    smallTargets,
    unnamed,
    lowContrast,
    smallText: [...smallText.values()],
    textMeasured: measuredText,
    textOverPicture: overPicture,
    hintsHidden: hints.filter((h) => !h.shown).map((h) => h.text),
    hintsShown: hints.filter((h) => h.shown).length,
    controls: controls.length,
  };
}

/** Runs in the page: the controls whose look does not change when the keyboard's focus lands on them (WCAG 2.4.7). */
async function focusCheck() {
  const CONTROLS = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';
  const look = (el: HTMLElement) => {
    const s = getComputedStyle(el);
    return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor, s.color].join('|');
  };
  const els = [...document.querySelectorAll<HTMLElement>(CONTROLS)].filter((el) => el.getClientRects().length > 0 && !(el as HTMLButtonElement).disabled && !el.classList.contains('opt-step'));
  const was = document.activeElement as HTMLElement | null;
  const none: { at: string; text: string }[] = [];
  // the look of a focus given by a key: the page draws a pad's focus by the same rule (styles.css:
  // `:focus-visible, :root[data-input='pad'] :focus`), and a script's focus() is no key press
  const root = document.documentElement;
  const input = root.dataset.input;
  root.dataset.input = 'pad';
  for (const el of els) {
    el.blur();
    const before = look(el);
    el.focus({ preventScroll: true });
    if (document.activeElement !== el) continue;
    if (look(el) === before) none.push({ at: `${el.closest<HTMLElement>('[data-testid]')?.dataset.testid ?? ''}>${el.tagName.toLowerCase()}`, text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30) });
  }
  if (input === undefined) delete root.dataset.input;
  else root.dataset.input = input;
  was?.focus({ preventScroll: true });
  return { checked: els.length, none };
}

test('layout and accessibility of every named state', async ({ page }) => {
  page.on('filechooser', () => undefined);
  await installAudit(page);
  await page.goto('/');
  await ensureDemoSong(page);
  const base = await defaultSettings(page);
  const out: Record<string, unknown>[] = [];
  for (const [vp, w, h] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h });
    for (const st of NAMED_STATES) {
      if (only && !only.test(st.name)) continue;
      try {
        await enter(page, st, base);
        // a key press first: the focus the keyboard gives is the one that must show
        const m = await page.evaluate(measure);
        const focus = st.name.startsWith('play:') ? null : await page.evaluate(focusCheck);
        out.push({ state: st.name, title: st.title, viewport: vp, size: [w, h], ...m, focus });
        console.log(`${vp} ${st.name}: clipped ${m.clipped.length}, offscreen ${m.offscreen.length}, unreachable ${m.unreachable.length}, small targets ${m.smallTargets.length}, low contrast ${m.lowContrast.length}, small text ${m.smallText.length}, hints hidden ${m.hintsHidden.length}`);
      } catch (e) {
        out.push({ state: st.name, title: st.title, viewport: vp, error: (e as Error).message.split('\n')[0] });
        console.log(`${vp} ${st.name}: FAILED ${(e as Error).message.split('\n')[0]}`);
      }
      writeData('layout.json', out);
    }
  }
});
