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

/**
 * Lets a gamepad drive the menus: the d-pad / left stick act as arrow keys (with key repeat),
 * A / Start as Enter, B / Back as Escape and Y as Tab, dispatched as keyboard events.
 */
export class GamepadMenuBridge {
  private readonly poller: GamepadPoller;
  private readonly held = new Map<string, number>();
  private raf = 0;

  constructor(source?: GamepadSource) {
    this.poller = new GamepadPoller((e) => this.onPad(e), { source, intervalMs: 16 });
  }

  start(): void {
    this.poller.start();
    const tick = (now: number) => {
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
    this.poller.stop();
    cancelAnimationFrame(this.raf);
    this.held.clear();
  }

  private onPad(e: PadEvent): void {
    const key = MENU_KEYS[e.code];
    if (!key) return;
    dispatchKey(key, e.down, false);
    if (REPEATING.has(key)) {
      if (e.down) this.held.set(key, performance.now() + CFG.menu.repeatDelayMs);
      else this.held.delete(key);
    }
  }
}

function dispatchKey(code: string, down: boolean, repeat: boolean): void {
  window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, repeat, bubbles: true, cancelable: true }));
}
