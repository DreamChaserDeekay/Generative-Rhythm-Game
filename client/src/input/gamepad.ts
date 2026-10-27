import inputJson from '@config/input.json';

const CFG = inputJson.gamepad;
/** Half an 8-bit step: less than that is no movement (rounding of the axis value). */
const HALF_STEP = CFG.turntable.step / 2;

/** Binding codes for gamepad controls: a button, an axis direction, or an axis used as a turntable. */
export const PAD_CODE = /^Pad:(B\d{1,2}|A\d{1,2}[+-]|TT\d{1,2})$/;
/**
 * Menu buttons of a pad without the standard mapping: a button, an axis pushed one way (a d-pad or
 * a stick that comes as axes: held, it repeats), or a turntable's turn one way (a step per movement).
 */
export const MENU_PAD_CODE = /^Pad:(B\d{1,2}|A\d{1,2}[+-]|TT\d{1,2}[+-])$/;

export function isPadCode(code: string): boolean {
  return PAD_CODE.test(code);
}

export function padCodeLabel(code: string): string {
  const m = /^Pad:(B|A|TT)(\d+)([+-]?)$/.exec(code);
  if (!m) return code;
  if (m[1] === 'B') return `버튼 ${m[2]}`;
  if (m[1] === 'TT') return `턴테이블 ${m[2]}${m[3] ? ` ${m[3] === '+' ? '+' : '−'}` : ''}`;
  return `축 ${m[2]}${m[3]}`;
}

export interface PadEvent {
  code: string;
  down: boolean;
  /** On the performance.now() timeline. */
  timeMs: number;
  /** The pad has the standard mapping (a gamepad), not a controller of its own layout. */
  standard: boolean;
  /**
   * An axis direction pressed by a jump past the threshold in one read (a d-pad or a flicked stick
   * that comes as axes); a turntable or a knob only ever gets there a step at a time.
   */
  jump?: boolean;
  /** A turntable's scratch pressed: the way it turns (1: its axis rising, -1: falling). */
  way?: number;
}

export type GamepadSource = () => readonly (Gamepad | null)[];

/** How far a turntable turns (in 8-bit axis steps) before it is a scratch, and how long it stands still before it lets go. */
export interface TurntableOptions {
  steps: number;
  releaseMs: number;
}

export const DEFAULT_TURNTABLE: TurntableOptions = { steps: CFG.turntable.steps, releaseMs: CFG.turntable.releaseMs };

interface PadState {
  timestamp: number;
  standard: boolean;
  buttons: boolean[];
  axes: number[];
  axisDir: number[];
  /**
   * Turntable: the scratch held (its direction, 0 = none), the way it last turned (0 = not yet) and
   * the furthest point it reached that way, when it last got further, and how far it got since it
   * stood still or turned back.
   */
  spin: number[];
  way: number[];
  peak: number[];
  lastMove: number[];
  moved: number[];
  /** Movement not yet sent as a menu step. */
  stepped: number[];
}

function browserPads(): readonly (Gamepad | null)[] {
  return typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
}

/**
 * Reads gamepads on its own timer, independent of the frame rate, and reports changes as
 * press/release events. The event time is the gamepad's own timestamp (when the browser received
 * the report) whenever it is plausible, so the judgement does not inherit the polling interval.
 * With `axisStep`, every axis also sends a press and release of `Pad:TT<n>+` / `-` each time it
 * moves that far one way (a menu step per movement, whatever position it stops in).
 */
export class GamepadPoller {
  private readonly states = new Map<number, PadState>();
  private readonly onEvent: (e: PadEvent) => void;
  private readonly source: GamepadSource;
  private readonly intervalMs: number;
  /** Movement that makes a scratch (a quarter step under the steps asked, for rounding). */
  private readonly spinThreshold: number;
  /** How far back from the furthest point a turn back is (at least two steps: see turntable). */
  private readonly backThreshold: number;
  private readonly releaseMs: number;
  private readonly axisStep: number;
  private timer: number | null = null;

  constructor(
    onEvent: (e: PadEvent) => void,
    options: { source?: GamepadSource; intervalMs?: number; turntable?: TurntableOptions; axisStep?: number } = {},
  ) {
    this.onEvent = onEvent;
    this.source = options.source ?? browserPads;
    this.intervalMs = options.intervalMs ?? CFG.pollIntervalMs;
    const turntable = options.turntable ?? DEFAULT_TURNTABLE;
    this.spinThreshold = (Math.max(1, turntable.steps) - 0.25) * CFG.turntable.step;
    this.backThreshold = Math.max(this.spinThreshold, 1.75 * CFG.turntable.step);
    this.releaseMs = turntable.releaseMs;
    this.axisStep = options.axisStep ?? 0;
  }

  start(): void {
    if (this.timer !== null) return;
    this.poll();
    this.timer = window.setInterval(() => this.poll(), this.intervalMs);
  }

  /** Stop polling and release everything still held. */
  stop(now: number = performance.now()): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    for (const st of this.states.values()) {
      const standard = st.standard;
      st.buttons.forEach((down, i) => down && this.onEvent({ code: `Pad:B${i}`, down: false, timeMs: now, standard }));
      st.axisDir.forEach((dir, i) => dir && this.onEvent({ code: `Pad:A${i}${dir > 0 ? '+' : '-'}`, down: false, timeMs: now, standard }));
      st.spin.forEach((dir, i) => dir && this.onEvent({ code: `Pad:TT${i}`, down: false, timeMs: now, standard }));
    }
    this.states.clear();
  }

  poll(now: number = performance.now()): void {
    for (const gp of this.source()) {
      if (!gp || !gp.connected) continue;
      let st = this.states.get(gp.index);
      if (!st) {
        // the first reading only sets the baseline
        st = {
          timestamp: gp.timestamp,
          standard: gp.mapping === 'standard',
          buttons: gp.buttons.map((b) => b.pressed),
          axes: [...gp.axes],
          axisDir: gp.axes.map((v) => direction(v)),
          spin: gp.axes.map(() => 0),
          way: gp.axes.map(() => 0),
          peak: [...gp.axes],
          lastMove: gp.axes.map(() => now),
          moved: gp.axes.map(() => 0),
          stepped: gp.axes.map(() => 0),
        };
        this.states.set(gp.index, st);
        continue;
      }
      const fresh = gp.timestamp !== st.timestamp;
      const t = fresh && gp.timestamp > 0 && gp.timestamp <= now + 1 && now - gp.timestamp <= CFG.maxTimestampAgeMs ? gp.timestamp : now;
      const standard = st.standard;
      const emit = (code: string, down: boolean, timeMs: number, extra?: Pick<PadEvent, 'jump' | 'way'>) => this.onEvent({ code, down, timeMs, standard, ...extra });
      st.timestamp = gp.timestamp;
      gp.buttons.forEach((b, i) => {
        if (b.pressed !== (st.buttons[i] ?? false)) {
          st.buttons[i] = b.pressed;
          emit(`Pad:B${i}`, b.pressed, t);
        }
      });
      gp.axes.forEach((v, i) => {
        const prev = st.axes[i] ?? v;
        st.axes[i] = v;
        const dir = direction(v);
        const prevDir = st.axisDir[i] ?? 0;
        if (dir !== prevDir) {
          if (prevDir !== 0) emit(`Pad:A${i}${prevDir > 0 ? '+' : '-'}`, false, t);
          if (dir !== 0) emit(`Pad:A${i}${dir > 0 ? '+' : '-'}`, true, t, { jump: Math.abs(wrapped(v - prev)) >= CFG.axisThreshold });
          st.axisDir[i] = dir;
        }
        this.turntable(st, i, v, now, t, emit);
        const delta = wrapped(v - prev);
        if (this.axisStep > 0 && delta !== 0) {
          const stepped = st.stepped[i] ?? 0;
          let left = stepped * delta < 0 ? delta : stepped + delta;
          while (Math.abs(left) >= this.axisStep) {
            const sign = left > 0 ? 1 : -1;
            const code = `Pad:TT${i}${sign > 0 ? '+' : '-'}`;
            emit(code, true, t);
            emit(code, false, t);
            left -= sign * this.axisStep;
          }
          st.stepped[i] = left;
        }
      });
    }
  }

  /**
   * Axis i as a turntable. Getting further than the furthest point it reached presses the scratch
   * once that adds up to the sensitivity since it stood still, even one 8-bit step a read; turning
   * back presses a new one once it is as far back from that point, and two steps at least: an
   * encoder resting on an edge flickers a step back and forth, which neither presses a scratch nor
   * keeps one held (nor does a platter stopped by the hand bouncing a step back). No progress for
   * releaseMs lets go.
   */
  private turntable(st: PadState, i: number, v: number, now: number, t: number, emit: (code: string, down: boolean, timeMs: number, extra?: Pick<PadEvent, 'way'>) => void): void {
    const way = st.way[i] ?? 0;
    const d = wrapped(v - (st.peak[i] ?? v));
    const code = `Pad:TT${i}`;
    let moved = false;
    if (way !== 0 && d * way >= HALF_STEP) {
      st.moved[i] = (st.moved[i] ?? 0) + Math.abs(d);
      moved = true;
    } else if (way !== 0 ? -d * way >= this.backThreshold : Math.abs(d) >= HALF_STEP) {
      st.way[i] = d > 0 ? 1 : -1;
      st.moved[i] = Math.abs(d);
      moved = true;
    }
    const spin = st.spin[i] ?? 0;
    if (moved) {
      st.peak[i] = v;
      st.lastMove[i] = now;
      if (st.moved[i] >= this.spinThreshold && spin !== st.way[i]) {
        if (spin !== 0) emit(code, false, t);
        emit(code, true, t, { way: st.way[i] });
        st.spin[i] = st.way[i];
      }
    } else if (now - (st.lastMove[i] ?? now) > this.releaseMs) {
      st.moved[i] = 0;
      if (spin !== 0) {
        st.spin[i] = 0;
        emit(code, false, now);
      }
    }
  }
}

/** An axis change, the short way round (a turntable's axis wraps from one end to the other). */
function wrapped(delta: number): number {
  return delta > 1 ? delta - 2 : delta < -1 ? delta + 2 : delta;
}

function direction(v: number): number {
  return v > CFG.axisThreshold ? 1 : v < -CFG.axisThreshold ? -1 : 0;
}

/** Standard-mapping controls that work the menus (they become keyboard keys). */
const MENU_KEYS: Record<string, string> = {
  'Pad:B12': 'ArrowUp',
  'Pad:B13': 'ArrowDown',
  'Pad:B14': 'ArrowLeft',
  'Pad:B15': 'ArrowRight',
  'Pad:A1-': 'ArrowUp',
  'Pad:A1+': 'ArrowDown',
  'Pad:A0-': 'ArrowLeft',
  'Pad:A0+': 'ArrowRight',
  'Pad:B0': 'Enter',
  'Pad:B9': 'Enter',
  'Pad:B1': 'Escape',
  'Pad:B8': 'Escape',
  'Pad:B3': 'Tab',
};
const REPEATING = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/**
 * The menu buttons a pad without the standard mapping is given (an IIDX or SDVX controller: its
 * keys, turntable and knobs are its lanes, and none of them is a d-pad), and the keys they send.
 */
export type MenuButton = 'ok' | 'back' | 'up' | 'down' | 'left' | 'right' | 'options' | 'retry';
export const MENU_BUTTONS: readonly MenuButton[] = ['ok', 'back', 'up', 'down', 'left', 'right', 'options', 'retry'];
export const MENU_BUTTON_KEYS: Readonly<Record<MenuButton, string>> = {
  ok: 'Enter',
  back: 'Escape',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  // the song select's play options
  options: 'Space',
  // the result's 다시 하기 on the same placement, as a pad's X there (the pause menu's too)
  retry: 'KeyR',
};

// The keys of the menu buttons assigned (or inferred) for pads without the standard mapping, by pad code.
let customMenuKeys: Readonly<Record<string, string>> = {};

/** Sets the menu keys of pads without the standard mapping (from the settings). */
export function setPadMenuKeys(keys: Readonly<Record<string, string>>): void {
  customMenuKeys = keys;
}

/**
 * The menu key a pad control sends: the standard layout's (d-pad, A, B, Start, Back, Y) on a
 * gamepad, the assigned menu buttons on any other controller (an axis held one way only where it
 * is assigned: a turntable's axis left past the middle is no arrow key held).
 */
export function padMenuKey(e: Pick<PadEvent, 'code' | 'standard'>): string | null {
  return (e.standard ? MENU_KEYS[e.code] : customMenuKeys[e.code]) ?? null;
}

/**
 * LB / RB as PageUp / PageDown: the settings' tabs, the song select's list pages (or its play
 * options' tabs). Only the menus' bridge sends them; on the play screen PageUp / PageDown move the cover.
 */
export const SHOULDER_KEYS: Readonly<Record<string, string>> = { 'Pad:B4': 'PageUp', 'Pad:B5': 'PageDown' };

/**
 * On the song select also X, LT, RT and RS (the right stick pressed): the play options (Space),
 * the song info (I), the settings (F10) and a play on autoplay (Shift+Enter).
 */
export const SELECT_PAD_KEYS: Readonly<Record<string, string>> = { ...SHOULDER_KEYS, 'Pad:B2': 'Space', 'Pad:B6': 'KeyI', 'Pad:B7': 'F10', 'Pad:B11': 'Shift+Enter' };

/** On the result also X: 다시 하기 on the same placement (R). */
export const RESULT_PAD_KEYS: Readonly<Record<string, string>> = { ...SHOULDER_KEYS, 'Pad:B2': 'KeyR' };

/** What a menu key does to the focused control when no screen handles it. */
export type MenuAction = 'press' | 'next' | 'prev' | 'increase' | 'decrease' | null;
export type ControlKind = 'button' | 'slider' | 'select' | 'text' | 'none';

/**
 * A keyboard's own effect of a menu key, for pad presses (dispatched keys have none): Enter
 * presses a button or a checkbox, Tab and ↑↓ move the focus, ←→ step a slider or a drop-down
 * and move the focus elsewhere.
 */
export function menuAction(kind: ControlKind, code: string): MenuAction {
  switch (code) {
    case 'Enter':
      return kind === 'button' ? 'press' : null;
    case 'Tab':
    case 'ArrowDown':
      return 'next';
    case 'ArrowUp':
      return 'prev';
    case 'ArrowLeft':
      return kind === 'slider' || kind === 'select' ? 'decrease' : 'prev';
    case 'ArrowRight':
      return kind === 'slider' || kind === 'select' ? 'increase' : 'next';
    default:
      return null;
  }
}

// While a settings capture waits for the next pad control, the menus get no pad presses.
let suspended = 0;
const bridges = new Set<GamepadMenuBridge>();
// The pad control behind each key a menu bridge sends.
const sentFrom = new WeakMap<Event, string>();

/**
 * The pad control a key event was sent for by a menu bridge (its repeats too); null for a key of
 * the keyboard. The result tells a press of the play's pad lanes by it.
 */
export function padCodeOf(e: Event): string | null {
  return sentFrom.get(e) ?? null;
}

/**
 * Keep the gamepad off the menus until the returned function is called. A press made meanwhile
 * (the one a capture took) never reaches them, not even when it is still held afterwards.
 */
export function suspendMenuBridges(): () => void {
  suspended++;
  let resumed = false;
  return () => {
    if (resumed) return;
    resumed = true;
    // read the pads once more while still suspended: what is held now counts as seen
    for (const bridge of bridges) bridge.catchUp();
    suspended--;
  };
}

/**
 * Lets a gamepad drive the menus: the d-pad / left stick act as arrow keys (with key repeat),
 * A / Start as Enter, B / Back as Escape and Y as Tab, dispatched as keyboard events on the
 * focused element (padCodeOf names the control). A key no screen takes does what it does on a
 * keyboard (menuAction). A controller without the standard mapping sends only its assigned menu
 * buttons (padMenuKey): its turntable or knob stopped past the middle is no arrow key held.
 */
export class GamepadMenuBridge {
  private readonly poller: GamepadPoller;
  /** Held keys: the control holding each, and how long it still has to be held before it repeats (ms). */
  private readonly held = new Map<string, { from: string; wait: number }>();
  /** Pad controls left alone (the pause menu leaves Start to the play screen). */
  private readonly ignore: ReadonlySet<string>;
  /** Controls this bridge also turns into keys (SHOULDER_KEYS on the menus). */
  private readonly extraKeys: Readonly<Record<string, string>>;
  /** The pad last pressed has the standard mapping (its held keys repeat as from it). */
  private standard = true;
  private raf = 0;

  constructor(options: { source?: GamepadSource; ignore?: string[]; keys?: Readonly<Record<string, string>> } = {}) {
    this.poller = new GamepadPoller((e) => this.onPad(e), { source: options.source, intervalMs: 16, axisStep: CFG.menu.axisStep });
    this.ignore = new Set(options.ignore ?? []);
    this.extraKeys = options.keys ?? {};
  }

  start(): void {
    bridges.add(this);
    watchInputDevice();
    this.poller.start();
    let last = performance.now();
    const tick = (now: number) => {
      // a long frame counts as maxFrameMs at most: a tap that ended while the page was too busy to
      // read the pad (a screen starting its renderer) is not taken for a held key once it is free
      const frame = Math.min(Math.max(0, now - last), CFG.menu.maxFrameMs);
      last = now;
      if (suspended > 0) this.held.clear();
      for (const [key, hold] of this.held) {
        if (hold.wait > frame) hold.wait -= frame;
        else {
          hold.wait = CFG.menu.repeatMs;
          dispatchKey(key, true, true, this.standard, hold.from);
        }
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    bridges.delete(this);
    this.poller.stop();
    cancelAnimationFrame(this.raf);
    this.held.clear();
  }

  /** Take in the pads' current state (presses made while suspended are dropped). */
  catchUp(): void {
    this.poller.poll();
  }

  private onPad(e: PadEvent): void {
    if (this.ignore.has(e.code)) return;
    const key = padMenuKey(e) ?? (e.standard ? this.extraKeys[e.code] : undefined);
    if (!key) return;
    if (suspended > 0) {
      this.held.delete(key);
      return;
    }
    this.standard = e.standard;
    dispatchKey(key, e.down, false, e.standard, e.code);
    if (REPEATING.has(key)) {
      if (e.down) this.held.set(key, { from: e.code, wait: CFG.menu.repeatDelayMs });
      else this.held.delete(key);
    }
  }
}

/**
 * Sends a menu key for the pad control `from` to the focused element. The page is marked as
 * driven by a pad ('pad': a standard one, whose buttons the key hints can name) or by a
 * controller of its own layout ('controller': its menu buttons send the keyboard's keys, so the
 * hints stay the keyboard's). A key named with "Shift+" is sent with Shift held.
 */
function dispatchKey(key: string, down: boolean, repeat: boolean, standard: boolean, from: string): void {
  document.documentElement.dataset.input = standard ? 'pad' : 'controller';
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  const shiftKey = key.startsWith('Shift+');
  const code = shiftKey ? key.slice('Shift+'.length) : key;
  const event = new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, shiftKey, repeat, bubbles: true, cancelable: true });
  sentFrom.set(event, from);
  const unhandled = target.dispatchEvent(event);
  if (!unhandled || !down) return;
  const action = menuAction(controlKind(target), code);
  if (action === 'press') {
    if (!repeat) target.click();
  } else if (action === 'next' || action === 'prev') {
    moveFocus(target, action === 'next' ? 1 : -1);
  } else if (action === 'increase' || action === 'decrease') {
    stepValue(target, action === 'increase' ? 1 : -1);
  }
}

function controlKind(el: HTMLElement): ControlKind {
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLInputElement) {
    if (el.type === 'range') return 'slider';
    return ['button', 'submit', 'reset', 'checkbox', 'radio'].includes(el.type) ? 'button' : 'text';
  }
  if (el instanceof HTMLTextAreaElement || el.isContentEditable) return 'text';
  if (el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement || el.tagName === 'SUMMARY') return 'button';
  return 'none';
}

const FOCUSABLE = 'button, a[href], input, select, textarea, summary, [tabindex]';

/** The next (or previous) control on the page in document order, wrapping around. */
function moveFocus(from: HTMLElement, dir: 1 | -1): void {
  const list = [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) =>
      el.tabIndex >= 0 &&
      !(el as HTMLButtonElement).disabled &&
      !(el instanceof HTMLInputElement && el.type === 'hidden') &&
      el.getClientRects().length > 0 &&
      !el.closest('[inert]'),
  );
  if (list.length === 0) return;
  const at = list.indexOf(from);
  const next = at < 0 ? list[dir > 0 ? 0 : list.length - 1] : list[(at + dir + list.length) % list.length];
  next.focus();
  next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** One step of a slider or a drop-down, reported like a user's change. */
function stepValue(el: HTMLElement, dir: 1 | -1): void {
  if (el instanceof HTMLSelectElement) {
    const index = Math.min(el.options.length - 1, Math.max(0, el.selectedIndex + dir));
    if (index === el.selectedIndex) return;
    el.selectedIndex = index;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (el instanceof HTMLInputElement) {
    if (dir > 0) el.stepUp();
    else el.stepDown();
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// The pad's focus outline shows while it drives the menus; a key or a pointer of the user's own
// hands the outline back to the browser's own rules.
let watchingDevice = false;
function watchInputDevice(): void {
  if (watchingDevice) return;
  watchingDevice = true;
  const own = (e: Event) => {
    if (e.isTrusted) delete document.documentElement.dataset.input;
  };
  window.addEventListener('keydown', own, { capture: true });
  window.addEventListener('pointerdown', own, { capture: true });
}
