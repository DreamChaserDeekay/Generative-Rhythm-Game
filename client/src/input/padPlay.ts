import type { PadEvent } from './gamepad';

/** The pad's function buttons in play. */
export type PadPlayButton = 'start' | 'select' | 'fever';
export const PAD_PLAY_BUTTONS: readonly PadPlayButton[] = ['start', 'select', 'fever'];

/** Start and Select of the standard mapping; no FEVER button until one is assigned. */
export const DEFAULT_PAD_PLAY: Readonly<Record<PadPlayButton, string | null>> = { start: 'Pad:B9', select: 'Pad:B8', fever: null };

export type PadPlayAction = 'pause' | 'speedDown' | 'speedUp' | 'suddenDown' | 'suddenUp' | 'retry' | 'fever';

/** Select and Start held together this long retry. */
export const RETRY_HOLD_MS = 1000;

/** What Start + the n-th key lane's button does. */
const WITH_START: readonly PadPlayAction[] = ['speedDown', 'speedUp', 'suddenDown', 'suddenUp'];

/**
 * The pad's in-play functions, IIDX style. Start tapped alone pauses (and resumes); held, the
 * first four key lanes' buttons step SPEED − / + and SUDDEN+ − / + instead of playing their lanes
 * (nothing pressed with Start reaches a lane). Select and Start held together for RETRY_HOLD_MS
 * retry. The FEVER button fires a manual FEVER (or skips a long intro).
 */
export class PadPlayControls {
  private readonly buttons: Readonly<Record<PadPlayButton, string | null>>;
  private readonly laneButtons: readonly (string | null)[];
  private startDown = false;
  private selectDown = false;
  /** Start did something while held: its release does not pause. */
  private startUsed = false;
  /** Since when Start and Select are both held (null: they are not). */
  private bothSince: number | null = null;
  /** Controls pressed with Start held: their release is not a lane's either. */
  private readonly taken = new Set<string>();

  /** `laneButtons`: the pad controls of the key lanes in order (scratch and side lanes left out). */
  constructor(buttons: Readonly<Record<PadPlayButton, string | null>>, laneButtons: readonly (string | null)[]) {
    this.buttons = buttons;
    this.laneButtons = laneButtons;
  }

  /** A pad event: the functions it works, and whether it was theirs (else it is the lanes'). */
  handle(e: Pick<PadEvent, 'code' | 'down' | 'timeMs'>): { own: boolean; actions: PadPlayAction[] } {
    const { start, select, fever } = this.buttons;
    if (e.code === start) {
      if (e.down) {
        this.startDown = true;
        this.startUsed = this.selectDown;
        if (this.selectDown) this.bothSince = e.timeMs;
        return { own: true, actions: [] };
      }
      // a release seen without its press (held through a retry) does nothing
      const tapped = this.startDown && !this.startUsed;
      this.startDown = false;
      this.bothSince = null;
      return { own: true, actions: tapped ? ['pause'] : [] };
    }
    if (e.code === select) {
      this.selectDown = e.down;
      if (e.down && this.startDown) {
        this.startUsed = true;
        this.bothSince = e.timeMs;
      } else if (!e.down) this.bothSince = null;
      return { own: true, actions: [] };
    }
    if (e.code === fever) return { own: true, actions: e.down ? ['fever'] : [] };
    if (this.taken.has(e.code)) {
      if (!e.down) this.taken.delete(e.code);
      return { own: true, actions: [] };
    }
    if (this.startDown && e.down) {
      this.taken.add(e.code);
      this.startUsed = true;
      const at = this.laneButtons.indexOf(e.code);
      return { own: true, actions: at >= 0 && at < WITH_START.length ? [WITH_START[at]] : [] };
    }
    return { own: false, actions: [] };
  }

  /** Every frame: Select and Start held long enough retry (once a hold). */
  tick(now: number): PadPlayAction[] {
    if (this.bothSince === null || now - this.bothSince < RETRY_HOLD_MS) return [];
    this.bothSince = null;
    return ['retry'];
  }

  /** Forget what is held (a retry stops the pad, which then releases everything held). */
  reset(): void {
    this.startDown = false;
    this.selectDown = false;
    this.startUsed = false;
    this.bothSince = null;
    this.taken.clear();
  }
}
