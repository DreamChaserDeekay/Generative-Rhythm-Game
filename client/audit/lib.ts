import { expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Shared by the audit's tools: where their data goes, a pad the page reads (as e2e/gamepad.spec.ts
 * makes one), the page-side helpers that name the screen's state and its controls, and the inputs
 * a crawl presses.
 */

/** docs/audit/data (the tools run from client/). */
export const OUT_DIR = path.resolve(process.cwd(), '../docs/audit/data');

export function writeData(name: string, data: unknown): void {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, name), `${JSON.stringify(data, null, 1)}\n`);
}

export function readData<T>(name: string): T {
  return JSON.parse(readFileSync(path.join(OUT_DIR, name), 'utf8')) as T;
}

export const STORAGE_KEY = 'grg.settings.v1';

export type Device = 'kb' | 'pad';

/** The standard mapping's buttons, as the menus name them. */
export const PAD: Record<string, number> = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, Back: 8, Start: 9, LS: 10, RS: 11, Up: 12, Down: 13, Left: 14, Right: 15 };

/** Every key a keyboard crawl presses from a state's first focus (Playwright's names). */
export const KB_ALPHABET = [
  'Escape',
  'Enter',
  'Space',
  'Tab',
  'Shift+Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  'KeyQ',
  'KeyE',
  'KeyR',
  'Shift+KeyR',
  'KeyI',
  'KeyF',
  'KeyM',
  'KeyT',
  'KeyP',
  'Slash',
  'Shift+Equal',
  'Minus',
  'Backspace',
  'Delete',
  'ShiftLeft',
  'Shift+Enter',
  'Control+KeyF',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'Shift+F5',
  'F6',
  'F7',
  'F10',
  'F11',
];
export const PAD_ALPHABET = Object.keys(PAD).map((b) => `Pad:${b}`);
/** The keys that move the focus (the second level of a crawl: from every control the focus reaches). */
export const KB_NAV = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Shift+Tab'];
export const PAD_NAV = ['Pad:Up', 'Pad:Down', 'Pad:Left', 'Pad:Right'];

/**
 * A pad the page reads through navigator.getGamepads (the e2e suite's way: no real controller
 * here). Call before the page loads.
 */
export async function plugPad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const pad = {
      index: 0,
      id: 'Audit Pad',
      connected: true,
      mapping: 'standard',
      timestamp: 1,
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      axes: [0, 0, 0, 0],
    };
    (window as unknown as { __pad: typeof pad }).__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
  });
}

async function padSet(page: Page, button: number, down: boolean): Promise<void> {
  await page.evaluate(
    ([b, d]) => {
      const pad = (window as unknown as { __pad: { buttons: { pressed: boolean }[]; timestamp: number } }).__pad;
      pad.buttons[b as number].pressed = d as boolean;
      pad.timestamp = performance.now();
    },
    [button, down],
  );
}

/** One input: a key (Playwright's name, "Shift+Enter"), or a pad button ("Pad:A"), held long enough for the menus' polling. */
export async function press(page: Page, input: string): Promise<void> {
  if (input.startsWith('Pad:')) {
    const button = PAD[input.slice(4)];
    await padSet(page, button, true);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 70)));
    await padSet(page, button, false);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
  } else {
    await page.keyboard.press(input);
  }
}

/**
 * The page-side helpers (window.__audit): the state's name, the focused control's key, the
 * controls a player can work, a hash of what the page shows, and a log of key presses with
 * whether the page kept the browser's own action from them.
 */
export async function installAudit(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const visible = (el: Element | null): el is HTMLElement => el instanceof HTMLElement && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const text = (el: Element | null, max = 40) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

    /** The screen and what is open on it: "select+info", "settings:keys+capture", "play:paused". */
    const state = (): string => {
      const flags: string[] = [];
      let sig = 'unknown';
      if (q('play-loading')) sig = 'play:loading';
      else if (q('pause-menu')) sig = 'play:paused';
      else if (q('play-screen')) sig = document.querySelector('.play-overlay .error') ? 'play:error' : 'play:running';
      else if (q('result-screen')) sig = q('result-details-panel') ? 'result:details' : 'result';
      else if (q('calibration-screen')) {
        sig = `calibration:${q('calibration-screen')?.dataset.step ?? '?'}`;
        if ((q('calib-start') as HTMLButtonElement | null)?.disabled) flags.push('running');
      } else if (q('settings-screen')) {
        sig = `settings:${(document.querySelector<HTMLElement>('.settings-nav [aria-selected="true"]')?.dataset.testid ?? '').replace('settings-tab-', '')}`;
        if (document.querySelector('.key-cap.active')) flags.push('capture');
        if (q('ghost-test')) flags.push('ghost');
        if (q('pad-test')) flags.push('padtest');
        if (q('reset-undo')) flags.push('undo');
      } else if (q('editor-screen')) {
        sig = 'editor';
        if (document.querySelector('.editor-screen [role="menu"]')) flags.push('menu');
      } else if (q('song-list')) {
        sig = 'select';
        if (q('server-offline')) flags.push('offline');
        if (q('first-run')) flags.push('first');
        if (q('play-options')) flags.push(`options:${(document.querySelector<HTMLElement>('[data-testid="play-options"] [role="tab"][aria-selected="true"]')?.dataset.testid ?? '').replace('toggle-', '')}`);
        if (q('practice-options')) flags.push('practice');
        if (q('song-info')) flags.push('info');
        if (q('section-editor')) flags.push('sections');
        if (q('bga-youtube-form')) flags.push('youtube');
        if (text(q('toggle-analysis')).includes('닫기')) flags.push('analysis');
        if (document.querySelector('.add-menu')) flags.push('add');
        if (document.activeElement === q('song-search')) flags.push('search');
      }
      if ([...document.querySelectorAll('button')].some((b) => visible(b) && /한 번 더/.test(b.textContent ?? ''))) flags.push('armed');
      return [sig, ...flags].join('+');
    };

    const CONTROLS = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [tabindex], [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="spinbutton"]';
    /** Every control a pointer can work now (the ‹ › of an option row are the row's). */
    const controls = (): HTMLElement[] =>
      [...document.querySelectorAll<HTMLElement>(CONTROLS)].filter(
        (el) => visible(el) && !(el as HTMLButtonElement).disabled && !el.classList.contains('opt-step') && !(el instanceof HTMLInputElement && el.hidden) && !(el.tabIndex < 0 && !el.matches('button, a[href], input, select, textarea, summary')),
      );

    /** A control's name as a player reads it. */
    const label = (el: HTMLElement): string => {
      const own = el.getAttribute('aria-label') ?? '';
      if (own) return own;
      if (el instanceof HTMLInputElement) return el.placeholder || text(el.closest('label')) || text(el.closest('.row')?.querySelector('.label') ?? null) || el.type;
      if (el instanceof HTMLSelectElement) return text(el.closest('.row')?.querySelector('.label') ?? null) || 'select';
      return text(el, 60);
    };

    /** A key that names a control across visits: its test id (and which of them), else where it sits under the nearest one. */
    const keyOf = (el: Element | null): string => {
      if (!el || el === document.body || !(el instanceof HTMLElement)) return '(none)';
      const id = el.dataset.testid;
      if (id) {
        if (el.dataset.songId) return `${id}#${el.dataset.songId.slice(-4)}`;
        const same = [...document.querySelectorAll(`[data-testid="${id}"]`)];
        return same.length > 1 ? `${id}[${same.indexOf(el)}]` : id;
      }
      const host = el.parentElement?.closest<HTMLElement>('[data-testid]') ?? null;
      const among = [...(host ?? document.body).querySelectorAll<HTMLElement>(CONTROLS)].filter((c) => !c.dataset.testid);
      return `${host?.dataset.testid ?? 'body'}>${el.tagName.toLowerCase()}[${among.indexOf(el)}]:${label(el).slice(0, 24)}`;
    };

    const find = (key: string): HTMLElement | null => [...document.querySelectorAll<HTMLElement>(`${CONTROLS}, [tabindex="-1"]`)].find((el) => keyOf(el) === key) ?? null;

    /** What the page shows, as a number: its text and what is chosen, switched and set (not the play's HUD, a canvas or a running count). */
    const hash = (): number => {
      const root = document.getElementById('root') ?? document.body;
      const parts: string[] = [];
      const skip = (el: Element) => el.closest('.hud, .hintbar, .calib-stats, .loading-status, [data-testid="busy"], [data-testid="ghost-result"], [data-testid="settings-help"], .select-panel-help, [data-testid="gamepad-status"], [data-testid="backend-status"]') !== null;
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const p = n.parentElement;
        if (p && !skip(p) && visible(p)) parts.push((n.textContent ?? '').trim());
      }
      for (const el of root.querySelectorAll<HTMLElement>('[aria-selected="true"], [aria-checked], [data-value], [aria-pressed="true"], [aria-expanded="true"], .active')) {
        if (!skip(el)) parts.push(`${keyOf(el)}=${el.dataset.value ?? el.getAttribute('aria-checked') ?? '1'}`);
      }
      for (const el of root.querySelectorAll<HTMLInputElement>('input')) parts.push(`${el.type}:${el.type === 'checkbox' ? el.checked : el.value}`);
      const s = parts.join('|');
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
      return h;
    };

    /** The hint bar as shown: each hint's keys and label (and whether a narrow window hides it). */
    const hints = () =>
      [...document.querySelectorAll<HTMLElement>('.hintbar .hint-item')].map((el) => ({
        keys: [...el.querySelectorAll('kbd')].map((k) => k.textContent ?? ''),
        label: [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? '').join('').trim(),
        shown: visible(el),
        end: el.closest('.hint-end') !== null,
      }));

    /** Keys named on the screen outside the hint bar (a button's own cap, a line of text), with the control they sit on. */
    const caps = () =>
      [...document.querySelectorAll<HTMLElement>('kbd')]
        .filter((k) => visible(k) && !k.closest('.hintbar'))
        .map((k) => ({ key: k.textContent ?? '', on: text(k.closest('button, a, .opt, li, p, .key-modes, .play-key, span.settings-nav-hint') ?? k.parentElement, 50) }));

    const keys: { code: string; shift: boolean; prevented: boolean; trusted: boolean }[] = [];
    window.addEventListener(
      'keydown',
      (e) => {
        const rec = { code: e.code, shift: e.shiftKey, prevented: false, trusted: e.isTrusted };
        keys.push(rec);
        setTimeout(() => {
          rec.prevented = e.defaultPrevented;
        }, 0);
      },
      true,
    );

    (window as unknown as { __audit: unknown }).__audit = {
      snap: () => ({ sig: state(), focus: keyOf(document.activeElement), hash: hash(), settings: localStorage.getItem('grg.settings.v1') ?? '', pad: document.documentElement.dataset.input ?? '' }),
      controls: () =>
        controls().map((el) => {
          const r = el.getBoundingClientRect();
          return {
            key: keyOf(el),
            label: label(el),
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute('role') ?? '',
            tabIndex: el.tabIndex,
            value: el.dataset.value ?? el.getAttribute('aria-checked') ?? el.getAttribute('aria-valuetext') ?? '',
            title: el.title,
            rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
            download: el.hasAttribute('download'),
            region: el.closest<HTMLElement>('.topbar, .hintbar, .settings-nav, .settings-rows, .select-panel, .song-list-panel, .song-detail, .result-actions, .pause-menu, .add-menu, .editor-screen')?.className.split(' ')[0] ?? '',
          };
        }),
      focus: (key: string) => {
        const el = find(key);
        el?.focus({ preventScroll: false });
        return keyOf(document.activeElement) === key;
      },
      click: (key: string) => {
        const el = find(key);
        el?.click();
        return el !== null;
      },
      hints,
      caps,
      keys: () => keys.splice(0),
      text,
    };
  });
}

export interface Snap {
  sig: string;
  focus: string;
  hash: number;
  settings: string;
  pad: string;
}

export interface Control {
  key: string;
  label: string;
  tag: string;
  role: string;
  tabIndex: number;
  value: string;
  title: string;
  rect: [number, number, number, number];
  download: boolean;
  region: string;
}

export interface Hint {
  keys: string[];
  label: string;
  shown: boolean;
  end: boolean;
}

type AuditWindow = {
  __audit: {
    snap: () => Snap;
    controls: () => Control[];
    focus: (key: string) => boolean;
    click: (key: string) => boolean;
    hints: () => Hint[];
    caps: () => { key: string; on: string }[];
    keys: () => { code: string; shift: boolean; prevented: boolean; trusted: boolean }[];
  };
};

export const snap = (page: Page): Promise<Snap> => page.evaluate(() => (window as unknown as AuditWindow).__audit.snap());
export const controlsOf = (page: Page): Promise<Control[]> => page.evaluate(() => (window as unknown as AuditWindow).__audit.controls());
export const hintsOf = (page: Page): Promise<Hint[]> => page.evaluate(() => (window as unknown as AuditWindow).__audit.hints());
export const capsOf = (page: Page): Promise<{ key: string; on: string }[]> => page.evaluate(() => (window as unknown as AuditWindow).__audit.caps());
export const focusKey = (page: Page, key: string): Promise<boolean> => page.evaluate((k) => (window as unknown as AuditWindow).__audit.focus(k), key);
export const clickKey = (page: Page, key: string): Promise<boolean> => page.evaluate((k) => (window as unknown as AuditWindow).__audit.click(k), key);
export const keyLog = (page: Page) => page.evaluate(() => (window as unknown as AuditWindow).__audit.keys());

/**
 * Waits until the page has settled after an input: the same state and picture twice in a row. A
 * loading play is waited out (to the play itself).
 */
export async function settle(page: Page, maxMs = 2500): Promise<Snap> {
  await page.waitForTimeout(60);
  let last = await snap(page);
  const end = Date.now() + maxMs;
  let loadingEnd = Date.now() + 60_000;
  for (;;) {
    await page.waitForTimeout(90);
    const now = await snap(page);
    if (now.sig === 'play:loading' || now.sig === 'unknown') {
      if (Date.now() > loadingEnd) return now;
      last = now;
      continue;
    }
    loadingEnd = 0;
    if (now.sig === last.sig && now.hash === last.hash && now.focus === last.focus) return now;
    if (Date.now() > end) return now;
    last = now;
  }
}

/** Waits until the page shows the same thing for `quietMs` (levels and records come in after a screen opens). */
export async function stable(page: Page, quietMs = 500, maxMs = 8000): Promise<Snap> {
  let last = await snap(page);
  let since = Date.now();
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    await page.waitForTimeout(100);
    const now = await snap(page);
    if (now.sig !== last.sig || now.hash !== last.hash || now.focus !== last.focus) since = Date.now();
    else if (Date.now() - since >= quietMs) return now;
    last = now;
  }
  return last;
}

/**
 * The stored settings with every key at its default (the game stores them all at the first
 * change): Tab and Shift+Tab change the key mode and change it back.
 */
export async function defaultSettings(page: Page): Promise<string> {
  await openRoot(page, 'lib');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await page.waitForTimeout(200);
  return page.evaluate((key) => localStorage.getItem(key) ?? '', STORAGE_KEY);
}

/** The library the crawl starts from: one demo song (analysed, its chart ready), none, or no server. */
export type Root = 'lib' | 'empty' | 'offline';

/** The demo song in the server's library, analysed (once per run of the tools). */
export async function ensureDemoSong(page: Page): Promise<void> {
  const songs = (await (await page.request.get('/api/songs')).json()) as { songs?: unknown[] } | unknown[];
  const list = Array.isArray(songs) ? songs : (songs.songs ?? []);
  if (list.length === 0) await page.request.post('/api/songs/demo', { data: { bpm: 128, bars: 16, seed: 7 } });
  await expect
    .poll(
      async () => {
        const body = (await (await page.request.get('/api/songs')).json()) as { songs?: { status: string }[] } | { status: string }[];
        const all = Array.isArray(body) ? body : (body.songs ?? []);
        return all.length > 0 && all.every((s) => s.status === 'ready');
      },
      { timeout: 120_000 },
    )
    .toBe(true);
}

/** Opens the game on a root with the settings given (none: the defaults), and waits until it can be worked. */
export async function openRoot(page: Page, root: Root, settings: string | null = null): Promise<void> {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  if (root === 'empty') await page.route(/^https?:\/\/[^/]+\/api\/songs$/, (route) => (route.request().method() === 'GET' ? route.fulfill({ json: { songs: [] } }) : route.abort()));
  if (root === 'offline') await page.route(/^https?:\/\/[^/]+\/api\//, (route) => route.abort());
  if (page.url() === 'about:blank') await page.goto('/');
  await page.evaluate(
    ([key, value]) => {
      localStorage.clear();
      if (value) localStorage.setItem(key as string, value as string);
    },
    [STORAGE_KEY, settings],
  );
  await page.goto('/');
  await expect(page.getByTestId('song-list')).toBeVisible({ timeout: 30_000 });
  if (root === 'lib') await expect(page.getByTestId('play-button')).toBeEnabled({ timeout: 90_000 });
  if (root === 'empty') await expect(page.getByTestId('first-run')).toBeVisible({ timeout: 30_000 });
  if (root === 'offline') await expect(page.getByTestId('server-offline')).toBeVisible({ timeout: 30_000 });
  await stable(page);
}
