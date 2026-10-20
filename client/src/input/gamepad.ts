import inputJson from '@config/input.json';

const CFG = inputJson.gamepad;

/** Binding codes for gamepad controls: a button, an axis direction, or an axis used as a turntable. */
export const PAD_CODE = /^Pad:(B\d{1,2}|A\d{1,2}[+-]|TT\d{1,2})$/;

export function isPadCode(code: string): boolean {
  return PAD_CODE.test(code);
}

export function padCodeLabel(code: string): string {
  const m = /^Pad:(B|A|TT)(\d+)([+-]?)$/.exec(code);
  if (!m) return code;
  if (m[1] === 'B') return `버튼 ${m[2]}`;
  if (m[1] === 'TT') return `턴테이블 ${m[2]}`;
  return `축 ${m[2]}${m[3]}`;
}

export interface PadEvent {
  code: string;
  down: boolean;
  /** On the performance.now() timeline. */
  timeMs: number;
}

export type GamepadSource = () => readonly (Gamepad | null)[];

interface PadState {
  timestamp: number;
  buttons: boolean[];
  axes: number[];
  axisDir: number[];
  /** Turntable: current spin direction (0 = idle) and when it last moved. */
  spin: number[];
  lastMove: number[];
}

function browserPads(): readonly (Gamepad | null)[] {
  return typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
}

/**
 * Reads gamepads on its own timer, independent of the frame rate, and reports changes as
 * press/release events. The event time is the gamepad's own timestamp (when the browser received
 * the report) whenever it is plausible, so the judgement does not inherit the polling interval.
 */
export class GamepadPoller {
  private readonly states = new Map<number, PadState>();
  private readonly onEvent: (e: PadEvent) => void;
  private readonly source: GamepadSource;
  private readonly intervalMs: number;
  private timer: number | null = null;

  constructor(onEvent: (e: PadEvent) => void, options: { source?: GamepadSource; intervalMs?: number } = {}) {
    this.onEvent = onEvent;
    this.source = options.source ?? browserPads;
    this.intervalMs = options.intervalMs ?? CFG.pollIntervalMs;
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
      st.buttons.forEach((down, i) => down && this.onEvent({ code: `Pad:B${i}`, down: false, timeMs: now }));
      st.axisDir.forEach((dir, i) => dir && this.onEvent({ code: `Pad:A${i}${dir > 0 ? '+' : '-'}`, down: false, timeMs: now }));
      st.spin.forEach((dir, i) => dir && this.onEvent({ code: `Pad:TT${i}`, down: false, timeMs: now }));
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
          buttons: gp.buttons.map((b) => b.pressed),
          axes: [...gp.axes],
          axisDir: gp.axes.map((v) => direction(v)),
          spin: gp.axes.map(() => 0),
          lastMove: gp.axes.map(() => now),
        };
        this.states.set(gp.index, st);
        continue;
      }
      const fresh = gp.timestamp !== st.timestamp;
      const t = fresh && gp.timestamp > 0 && gp.timestamp <= now + 1 && now - gp.timestamp <= CFG.maxTimestampAgeMs ? gp.timestamp : now;
      st.timestamp = gp.timestamp;
      gp.buttons.forEach((b, i) => {
        if (b.pressed !== (st.buttons[i] ?? false)) {
          st.buttons[i] = b.pressed;
          this.onEvent({ code: `Pad:B${i}`, down: b.pressed, timeMs: t });
        }
      });
      gp.axes.forEach((v, i) => {
        const dir = direction(v);
        const prevDir = st.axisDir[i] ?? 0;
        if (dir !== prevDir) {
          if (prevDir !== 0) this.onEvent({ code: `Pad:A${i}${prevDir > 0 ? '+' : '-'}`, down: false, timeMs: t });
          if (dir !== 0) this.onEvent({ code: `Pad:A${i}${dir > 0 ? '+' : '-'}`, down: true, timeMs: t });
          st.axisDir[i] = dir;
        }
        // turntable: any spin presses the scratch, a reversal is a new scratch, stopping releases it
        let delta = v - (st.axes[i] ?? v);
        if (delta > 1) delta -= 2;
        else if (delta < -1) delta += 2;
        st.axes[i] = v;
        const spin = st.spin[i] ?? 0;
        if (Math.abs(delta) > CFG.turntable.deltaThreshold) {
          const sign = delta > 0 ? 1 : -1;
          if (spin !== sign) {
            if (spin !== 0) this.onEvent({ code: `Pad:TT${i}`, down: false, timeMs: t });
            this.onEvent({ code: `Pad:TT${i}`, down: true, timeMs: t });
            st.spin[i] = sign;
          }
          st.lastMove[i] = now;
        } else if (spin !== 0 && now - (st.lastMove[i] ?? now) > CFG.turntable.releaseMs) {
          st.spin[i] = 0;
          this.onEvent({ code: `Pad:TT${i}`, down: false, timeMs: now });
        }
      });
    }
  }
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
 * focused element. A key no screen takes does what it does on a keyboard (menuAction).
 */
export class GamepadMenuBridge {
  private readonly poller: GamepadPoller;
  private readonly held = new Map<string, number>();
  /** Pad controls left alone (the pause menu leaves Start to the play screen). */
  private readonly ignore: ReadonlySet<string>;
  private raf = 0;

  constructor(options: { source?: GamepadSource; ignore?: string[] } = {}) {
    this.poller = new GamepadPoller((e) => this.onPad(e), { source: options.source, intervalMs: 16 });
    this.ignore = new Set(options.ignore ?? []);
  }

  start(): void {
    bridges.add(this);
    watchInputDevice();
    this.poller.start();
    const tick = (now: number) => {
      if (suspended > 0) this.held.clear();
      for (const [key, next] of this.held) {
        if (now >= next) {
          this.held.set(key, now + CFG.menu.repeatMs);
          dispatchKey(key, true, true);
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
    const key = MENU_KEYS[e.code];
    if (!key) return;
    if (suspended > 0) {
      this.held.delete(key);
      return;
    }
    dispatchKey(key, e.down, false);
    if (REPEATING.has(key)) {
      if (e.down) this.held.set(key, performance.now() + CFG.menu.repeatDelayMs);
      else this.held.delete(key);
    }
  }
}

function dispatchKey(code: string, down: boolean, repeat: boolean): void {
  document.documentElement.dataset.input = 'pad';
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  const unhandled = target.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, repeat, bubbles: true, cancelable: true }));
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
