import { test, type Page } from '@playwright/test';
import {
  capsOf,
  clickKey,
  controlsOf,
  ensureDemoSong,
  focusKey,
  hintsOf,
  installAudit,
  KB_ALPHABET,
  KB_NAV,
  keyLog,
  openRoot,
  PAD_ALPHABET,
  PAD_NAV,
  plugPad,
  press,
  settle,
  snap,
  stable,
  defaultSettings,
  writeData,
  type Control,
  type Device,
  type Hint,
  type Root,
  type Snap,
} from './lib';

/**
 * The screen transition graph, made by walking the game: from the song select (with a song, with
 * none, with no server) every key of the alphabet is pressed on every state found (level 1), the
 * focus is walked through every control the arrows and Tab reach and each is pressed with Enter
 * (level 2), and what the focus never reached is clicked, to see whether a key does the same
 * (level 3). Once with the keyboard alone, once with a pad alone.
 *
 *   AUDIT_DEVICE=kb|pad   (default: both)
 *   AUDIT_ONLY=<regexp>   expand only the states it matches (to look at one screen)
 */

interface StateRec {
  sig: string;
  root: Root;
  /** The inputs that lead here from the root (a "click:<control>" step: only a pointer got here). */
  path: string[];
  focus: string;
  hash: number;
  /** The stored settings as the state was found. */
  settings: string;
  hints: Hint[];
  caps: { key: string; on: string }[];
  controls: Control[];
  /** Every control the focus reached, with the inputs that took it there from the state's first focus. */
  stops: Record<string, string[]>;
  /** Why the state was not walked (a state that ends by itself, a play). */
  skipped?: string;
}

interface Probe {
  state: string;
  focus: string;
  input: string;
  level: 1 | 2 | 3;
  to: string;
  focusAfter: string;
  /** The settings' keys the input changed. */
  settings: string[];
  /** The page shows something else (in the same state). */
  changed: boolean;
  /** The page kept the browser's own action from the key (null: no key event was seen). */
  prevented: boolean | null;
  /** State, settings and picture after it: two inputs with the same outcome do the same. */
  outcome: string;
  /** After a move to another screen: where the back key (Esc, a pad's B) leads, and the focus there. */
  backTo?: string;
  backFocus?: string;
}

const only = process.env.AUDIT_ONLY ? new RegExp(process.env.AUDIT_ONLY) : null;
const devices = (process.env.AUDIT_DEVICE ? [process.env.AUDIT_DEVICE] : ['kb', 'pad']) as Device[];

/** Controls of the song info that change the library (the tempo, the first beat, the pictures, a deletion's second press): not pressed. */
const INFO_SAFE = new Set(['sync-auto', 'sync-play', 'open-calibration', 'open-visual-calibration', 'edit-chart', 'edit-sections', 'toggle-analysis', 'bga-youtube', 'remove-song', 'song-offset-minus5', 'song-offset-minus1', 'song-offset-plus1', 'song-offset-plus5', 'song-offset-reset']);
const NEVER = new Set(['demo-button', 'first-demo', 'editor-save', 'save-sections', 'reset-sections', 'bga-youtube-save', 'delete-saved', 'pick-pattern', 'reanalyze', 'reanalyze-failed', 'cover-remove']);

function mayPress(c: Control | undefined, sig: string): boolean {
  if (!c) return true;
  if (c.download) return false;
  const id = c.key.replace(/\[\d+\]$/, '');
  if (NEVER.has(id)) return false;
  if (/\+info/.test(sig) && c.region === 'select-panel' && !INFO_SAFE.has(id) && !/닫기/.test(c.label)) return false;
  return true;
}

function settingsDiff(a: string, b: string): string[] {
  if (a === b) return [];
  const x = a ? (JSON.parse(a) as Record<string, unknown>) : {};
  const y = b ? (JSON.parse(b) as Record<string, unknown>) : {};
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k])).sort();
}

class Crawl {
  states = new Map<string, StateRec>();
  probes: Probe[] = [];
  queue: string[] = [];
  private started = Date.now();

  /** The settings every visit starts from: the defaults, stored. */
  base = '';

  constructor(
    private page: Page,
    private device: Device,
  ) {}

  private get back() {
    return this.device === 'kb' ? 'Escape' : 'Pad:B';
  }
  private get enter() {
    return this.device === 'kb' ? 'Enter' : 'Pad:A';
  }

  log(msg: string) {
    console.log(`[${this.device} ${Math.round((Date.now() - this.started) / 1000)}s] ${msg}`);
  }

  save() {
    writeData(`graph.${this.device}.json`, { device: this.device, states: [...this.states.values()], probes: this.probes });
  }

  private async step(input: string): Promise<Snap> {
    if (input === 'wait:end') {
      await this.page.getByTestId('result-screen').waitFor({ timeout: 150_000 });
      await this.page.waitForTimeout(2500);
      return settle(this.page);
    }
    if (input.startsWith('focus=')) {
      // where the arrows before this step are known to lead (a panel a line longer than it was does not lose the way)
      if ((await snap(this.page)).focus !== input.slice(6)) await focusKey(this.page, input.slice(6));
      return snap(this.page);
    }
    if (input.startsWith('click:')) await clickKey(this.page, input.slice(6));
    else await press(this.page, input);
    return settle(this.page);
  }

  /** From the root again: the state's path, then the inputs to one of its controls. */
  private async restore(st: StateRec, seq: string[]): Promise<Snap> {
    await openRoot(this.page, st.root, this.base);
    let now = await snap(this.page);
    for (const input of [...st.path, ...seq]) now = await this.step(input);
    await keyLog(this.page);
    return now;
  }

  /** On the state, as it was found, with the focus on `focus` (cheaply when the page is still there). */
  private async ensure(st: StateRec, focus: string, loose = false): Promise<Snap> {
    let now = await snap(this.page);
    const seq = st.stops[focus] ?? [];
    // (loose: a walk of the focus goes on from where the last step left the values; only the state must be the same)
    const there = (s: Snap) => s.sig === st.sig && (loose || (s.hash === st.hash && s.settings === st.settings));
    if (there(now) && now.focus !== focus && focus !== '(none)') {
      await focusKey(this.page, focus);
      now = await snap(this.page);
    }
    if (there(now) && now.focus === focus) return now;
    for (let attempt = 0; attempt < 2; attempt++) {
      now = await this.restore(st, seq);
      if (now.sig === st.sig && now.focus === focus) return now;
      if (now.sig === st.sig && (await focusKey(this.page, focus))) return snap(this.page);
    }
    throw new Error(`cannot get back to ${st.sig} @ ${focus} (at ${now.sig} @ ${now.focus})`);
  }

  private async add(sig: string, root: Root, path: string[], at: Snap): Promise<void> {
    const known = this.states.get(sig);
    // a state a pointer found is kept until a key finds it
    if (known && !(known.path.some((p) => p.startsWith('click:')) && !path.some((p) => p.startsWith('click:')))) return;
    // what comes in after the screen opens (levels, records) is part of it
    if (!sig.startsWith('play:')) at = await stable(this.page);
    if (at.sig !== sig) return;
    const rec: StateRec = { sig, root, path, focus: at.focus, hash: at.hash, settings: at.settings, hints: await hintsOf(this.page), caps: await capsOf(this.page), controls: await controlsOf(this.page), stops: { [at.focus]: [] } };
    this.states.set(sig, rec);
    if (!known) this.queue.push(sig);
    this.log(`state ${sig}  ← ${path.join(' ') || '(root)'}`);
  }

  /** States the crawl could not get back to (three times): left alone from then on. */
  private lost = new Map<string, number>();

  private async probe(st: StateRec, focus: string, input: string, level: 1 | 2 | 3): Promise<Probe | null> {
    if ((this.lost.get(st.sig) ?? 0) >= 3) return null;
    let before: Snap;
    try {
      before = await this.ensure(st, focus, level === 2);
    } catch (e) {
      this.lost.set(st.sig, (this.lost.get(st.sig) ?? 0) + 1);
      if (this.lost.get(st.sig) === 3) st.skipped = 'could not get back to it';
      this.log(`! ${(e as Error).message.split('\n')[0]}`);
      return null;
    }
    await keyLog(this.page);
    const after = await this.step(input);
    const log = await keyLog(this.page);
    const settings = settingsDiff(before.settings, after.settings);
    const rec: Probe = {
      state: st.sig,
      focus,
      input,
      level,
      to: after.sig,
      focusAfter: after.focus,
      settings,
      changed: after.sig === before.sig && after.hash !== before.hash,
      prevented: log.length > 0 ? log.some((k) => k.prevented) : null,
      outcome: `${after.sig}|${settings.join(',')}|${after.hash}`,
    };
    this.probes.push(rec);
    if (after.sig !== st.sig && after.sig !== 'unknown') {
      const seq = st.stops[focus] ?? [];
      await this.add(after.sig, st.root, [...st.path, ...seq, ...(seq.length > 0 ? [`focus=${focus}`] : []), input], after);
      // back again: to the state it came from, on the control it left?
      if (!after.sig.startsWith('play:') && !st.sig.startsWith('play:') && input !== this.back) {
        const back = await this.step(this.back);
        rec.backTo = back.sig;
        rec.backFocus = back.focus;
      }
    }
    return rec;
  }

  /** What is pressed on a state from its first focus. */
  private alphabet(sig: string): string[] {
    const all = this.device === 'kb' ? KB_ALPHABET : PAD_ALPHABET;
    if (sig === 'play:running') return [this.device === 'kb' ? 'Escape' : 'Pad:Start', 'wait:end'];
    // a key being bound takes any key: only the ways out
    if (/\+capture/.test(sig)) return this.device === 'kb' ? ['Escape', 'Backspace'] : ['Pad:B'];
    if (/calibration:input\+running/.test(sig)) return this.device === 'kb' ? ['Escape'] : ['Pad:B'];
    return all;
  }

  async expand(sig: string): Promise<void> {
    const st = this.states.get(sig);
    if (!st) return;
    if (/armed|play:loading|play:error|unknown/.test(sig)) {
      st.skipped = 'ends by itself';
      return;
    }
    if (only && !only.test(sig)) {
      st.skipped = 'not asked for';
      return;
    }
    // level 1: every key from the first focus
    for (const input of this.alphabet(sig)) await this.probe(st, st.focus, input, 1);
    if (sig.startsWith('play:running') || /\+capture|\+running/.test(sig)) return;

    // a search or the add menu over a panel: its keys are those of the search and the menu alone
    if (/\+(options|info).*\+(search|add)/.test(sig)) return;

    // level 2: the focus through every control it reaches
    const nav = this.device === 'kb' ? KB_NAV : PAD_NAV;
    const todo = [st.focus];
    while (todo.length > 0 && Object.keys(st.stops).length < 260) {
      const from = todo.shift() as string;
      for (const input of nav) {
        const p = await this.probe(st, from, input, 2);
        if (!p || p.to !== sig || p.focusAfter === from || p.focusAfter === '(none)') continue;
        if (!(p.focusAfter in st.stops)) {
          st.stops[p.focusAfter] = [...(st.stops[from] ?? []), input];
          todo.push(p.focusAfter);
        }
      }
    }
    // … and each pressed
    for (const stop of Object.keys(st.stops)) {
      if (stop === st.focus || stop === '(none)') continue;
      if (!mayPress(st.controls.find((c) => c.key === stop), sig)) continue;
      await this.probe(st, stop, this.enter, 2);
    }
    this.log(`walked ${sig}: ${Object.keys(st.stops).length} stops of ${st.controls.length} controls, ${this.probes.length} probes`);
    this.save();
  }

  /** Level 3: the controls the focus never reached are clicked (does a key do the same?). */
  async clicks(sig: string): Promise<void> {
    const st = this.states.get(sig);
    if (!st || st.skipped || sig.startsWith('play:running') || /\+capture|\+running/.test(sig)) return;
    for (const c of st.controls) {
      if (c.key in st.stops || !mayPress(c, sig) || c.region === 'hintbar') continue;
      await this.probe(st, st.focus, `click:${c.key}`, 3);
    }
    this.save();
  }

  async run(): Promise<void> {
    this.base = await defaultSettings(this.page);
    for (const root of ['lib', 'empty', 'offline'] as Root[]) {
      await openRoot(this.page, root, this.base);
      const at = await snap(this.page);
      await this.add(at.sig, root, [], at);
      while (this.queue.length > 0) await this.expand(this.queue.shift() as string);
    }
    this.save();
    const walked = [...this.states.keys()];
    for (const sig of walked) await this.clicks(sig);
    // what only a pointer found is walked too
    while (this.queue.length > 0) await this.expand(this.queue.shift() as string);
    this.save();
  }
}

for (const device of devices) {
  test(`graph: ${device}`, async ({ page }) => {
    page.on('filechooser', () => undefined);
    page.on('dialog', (d) => void d.dismiss());
    page.on('download', (d) => void d.cancel());
    await installAudit(page);
    if (device === 'pad') await plugPad(page);
    await page.goto('/');
    await ensureDemoSong(page);
    const crawl = new Crawl(page, device);
    await crawl.run();
    crawl.log(`done: ${crawl.states.size} states, ${crawl.probes.length} probes`);
  });
}
