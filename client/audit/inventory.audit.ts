import { test, type Page } from '@playwright/test';
import { capsOf, controlsOf, defaultSettings, ensureDemoSong, hintsOf, installAudit, STORAGE_KEY, writeData } from './lib';
import { enter, NAMED_STATES } from './states';

/**
 * The inventory, read off the running game: for every named state its controls, hints (keyboard
 * and pad), the keys named on it and every piece of text; and for every option row of the settings
 * and of the play options its name, help, default, every value it takes (stepped through with →),
 * and the stored setting it writes.
 *
 *   AUDIT_ONLY=<regexp>   only the states it matches
 */

const only = process.env.AUDIT_ONLY ? new RegExp(process.env.AUDIT_ONLY) : null;

/** Every piece of text the state shows, with where it sits (and the texts kept in attributes). */
function texts() {
  const visible = (el: Element | null): el is HTMLElement => el instanceof HTMLElement && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const where = (el: Element) => {
    const host = el.closest<HTMLElement>('[data-testid]');
    const kind = el.closest('.hintbar') ? 'hint' : el.closest('kbd') ? 'key' : el.closest('h1, h2, h3') ? 'heading' : el.closest('.opt-name, .label, .pad-row-name, th') ? 'name' : el.closest('button, a, [role="tab"], [role="menuitem"]') ? 'control' : el.closest('.opt-value, .value') ? 'value' : el.closest('.hint, .settings-help, .settings-note, .select-panel-help, .key-note, .pad-row-note') ? 'help' : 'text';
    return { kind, at: host?.dataset.testid ?? '' };
  };
  const out: { kind: string; at: string; text: string }[] = [];
  const root = document.getElementById('root') ?? document.body;
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const p = n.parentElement;
    const t = (n.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!p || !t || !visible(p) || p.closest('.hud')) continue;
    out.push({ ...where(p), text: t });
  }
  for (const el of root.querySelectorAll<HTMLElement>('[title], [aria-label], [placeholder]')) {
    if (!visible(el)) continue;
    for (const attr of ['title', 'aria-label', 'placeholder']) {
      const t = el.getAttribute(attr);
      if (t) out.push({ kind: attr, at: el.closest<HTMLElement>('[data-testid]')?.dataset.testid ?? '', text: t });
    }
  }
  return out;
}

interface RowInfo {
  state: string;
  testId: string;
  label: string;
  kind: string;
  default: string;
  defaultText: string;
  /** Every value → steps to, in order (a choice: all of them; a number: its ends and steps). */
  values: { value: string; text: string }[];
  cyclic: boolean;
  min?: string;
  max?: string;
  step?: number;
  bigStep?: number;
  /** The stored settings' keys a step writes (empty: nothing is stored). */
  stores: string[];
  help: string;
  /** The help says something else on another value. */
  helpFollowsValue: boolean;
}

const stored = (page: Page) => page.evaluate((k) => localStorage.getItem(k) ?? '', STORAGE_KEY);
function diffKeys(a: string, b: string): string[] {
  const x = (a ? JSON.parse(a) : {}) as Record<string, unknown>;
  const y = (b ? JSON.parse(b) : {}) as Record<string, unknown>;
  const out: string[] = [];
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    if (JSON.stringify(x[k]) === JSON.stringify(y[k])) continue;
    // one level down where the setting is a group (parts.deck, generation.style)
    const xv = x[k];
    const yv = y[k];
    if (xv && yv && typeof xv === 'object' && typeof yv === 'object' && !Array.isArray(xv)) {
      const xs = xv as Record<string, unknown>;
      const ys = yv as Record<string, unknown>;
      for (const j of new Set([...Object.keys(xs), ...Object.keys(ys)])) if (JSON.stringify(xs[j]) !== JSON.stringify(ys[j])) out.push(`${k}.${j}`);
    } else out.push(k);
  }
  return out.sort();
}

/** Steps one option row through its values. */
async function walkRow(page: Page, state: string, testId: string, helpId: string): Promise<RowInfo> {
  const row = page.getByTestId(testId);
  await row.focus();
  const read = async () => ({ value: (await row.getAttribute('data-value')) ?? '', text: ((await row.locator('.opt-value b').first().textContent()) ?? '').trim() });
  const help = async () => ((await page.getByTestId(helpId).textContent()) ?? '').trim();
  const label = ((await row.locator('.opt-name').first().textContent()) ?? '').trim();
  const role = (await row.getAttribute('role')) ?? ((await row.evaluate((el) => el.tagName)) === 'BUTTON' ? 'action' : '');
  const first = await read();
  const info: RowInfo = { state, testId, label, kind: role === 'switch' ? 'switch' : role === 'action' ? 'action' : 'choice', default: first.value, defaultText: first.text, values: [first], cyclic: false, stores: [], help: await help(), helpFollowsValue: false };
  if (role === 'action') return info;
  const before = await stored(page);
  const helps = new Set([info.help]);
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('ArrowRight');
    const now = await read();
    if (i === 0) info.stores = diffKeys(before, await stored(page));
    helps.add(await help());
    if (now.value === info.values[info.values.length - 1].value) break;
    if (info.values.some((v) => v.value === now.value)) {
      info.cyclic = true;
      break;
    }
    info.values.push(now);
  }
  info.helpFollowsValue = helps.size > 1;
  const numeric = info.values.every((v) => v.value !== '' && !Number.isNaN(Number(v.value))) && info.kind !== 'switch';
  if (!info.cyclic && numeric) {
    info.kind = 'number';
    if (info.values.length > 1) info.step = Math.round(Math.abs(Number(info.values[1].value) - Number(info.values[0].value)) * 1e6) / 1e6;
    // on to the top with the big step, then down to the bottom
    let last = (await read()).value;
    for (let i = 0; i < 200; i++) {
      await page.keyboard.press('Shift+ArrowRight');
      const now = (await read()).value;
      if (now === last) break;
      last = now;
    }
    info.max = last;
    const top = Number(last);
    await page.keyboard.press('Shift+ArrowLeft');
    const down = Number((await read()).value);
    info.bigStep = Math.round(Math.abs(top - down) * 1e6) / 1e6;
    last = String(down);
    for (let i = 0; i < 200; i++) {
      await page.keyboard.press('Shift+ArrowLeft');
      const now = (await read()).value;
      if (now === last) break;
      last = now;
    }
    info.min = last;
    info.values = [first];
  }
  return info;
}

test('inventory of every named state and every option row', async ({ page }) => {
  page.on('filechooser', () => undefined);
  await installAudit(page);
  await page.goto('/');
  await ensureDemoSong(page);
  const base = await defaultSettings(page);
  const states: Record<string, unknown>[] = [];
  const rows: RowInfo[] = [];
  for (const st of NAMED_STATES) {
    if (only && !only.test(st.name)) continue;
    try {
      await enter(page, st, base);
      const rec: Record<string, unknown> = {
        state: st.name,
        title: st.title,
        controls: await controlsOf(page),
        hints: await hintsOf(page),
        caps: await capsOf(page),
        texts: await page.evaluate(texts),
      };
      // the option rows of the state (each walked from a fresh visit, so one row's values do not move another's)
      const helpId = st.name.startsWith('settings:') ? 'settings-help' : st.name.startsWith('select+options') ? 'play-options-help' : null;
      const ids = helpId && !st.name.includes('@') && !st.name.includes('+ghost') ? await page.locator('.opt[data-testid]:not(.opt-block):not(.opt-static)').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.testid ?? '')) : [];
      // the pad's hints (the bar follows the device used last)
      await page.evaluate(() => {
        document.documentElement.dataset.input = 'pad';
      });
      await page.waitForTimeout(80);
      rec.padHints = await hintsOf(page);
      states.push(rec);
      for (const id of ids) {
        await enter(page, st, base);
        rows.push(await walkRow(page, st.name, id, helpId as string));
      }
      console.log(`${st.name}: ${(rec.controls as unknown[]).length} controls, ${(rec.texts as unknown[]).length} texts, ${ids.length} rows`);
    } catch (e) {
      states.push({ state: st.name, title: st.title, error: (e as Error).message.split('\n')[0] });
      console.log(`${st.name}: FAILED ${(e as Error).message.split('\n')[0]}`);
    }
    writeData('inventory.json', { defaults: JSON.parse(base) as unknown, states, rows });
  }
});
