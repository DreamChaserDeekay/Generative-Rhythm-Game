import feverJson from '@config/fever.json';

export type FeverMode = 'AUTO' | 'MANUAL' | 'OFF';

export interface FeverConfig {
  fillPerNote: number;
  tickFill: number;
  durationMs: number;
  startMultiplier: number;
  maxMultiplier: number;
  bonusTotal: number;
}

export const feverConfig = feverJson as FeverConfig;

/**
 * DJMAX-style FEVER. High judgements fill the gauge; when full it fires (automatically or on the
 * FEVER key) for `durationMs`. Consecutive fevers without a BREAK raise the multiplier up to x5;
 * a BREAK ends the fever and resets the next multiplier. The bonus is kept apart from the base
 * 1,000,000-point score.
 */
export class Fever {
  readonly mode: FeverMode;
  gauge = 0;
  active = false;
  multiplier = 1;
  endsAt = 0;
  bonus = 0;
  activations = 0;
  bestMultiplier = 1;
  private nextMultiplier: number;
  private readonly cfg: FeverConfig;
  private readonly bonusUnit: number;

  constructor(mode: FeverMode, judgeable: number, cfg: FeverConfig = feverConfig) {
    this.mode = mode;
    this.cfg = cfg;
    this.nextMultiplier = cfg.startMultiplier;
    // A whole song at the top multiplier would earn exactly `bonusTotal`.
    this.bonusUnit = judgeable > 0 ? cfg.bonusTotal / judgeable / Math.max(1, cfg.maxMultiplier - 1) : 0;
  }

  get enabled(): boolean {
    return this.mode !== 'OFF';
  }

  get ready(): boolean {
    return this.enabled && !this.active && this.gauge >= 1;
  }

  onJudge(percent: number, isBreak: boolean, timeMs: number): void {
    if (!this.enabled) return;
    if (this.active) {
      if (isBreak) {
        this.end(true);
        return;
      }
      this.bonus += this.bonusUnit * (this.multiplier - 1) * (percent / 100);
      return;
    }
    if (isBreak) return;
    this.gauge = Math.min(1, this.gauge + this.cfg.fillPerNote * (percent / 100));
    if (this.mode === 'AUTO') this.activate(timeMs);
  }

  onTick(timeMs: number): void {
    if (!this.enabled || this.active) return;
    this.gauge = Math.min(1, this.gauge + this.cfg.tickFill);
    if (this.mode === 'AUTO') this.activate(timeMs);
  }

  /** Fire the fever (MANUAL key or AUTO when full). Returns true when it started. */
  activate(timeMs: number): boolean {
    if (!this.ready) return false;
    this.active = true;
    this.multiplier = this.nextMultiplier;
    this.bestMultiplier = Math.max(this.bestMultiplier, this.multiplier);
    this.endsAt = timeMs + this.cfg.durationMs;
    this.gauge = 0;
    this.activations++;
    return true;
  }

  update(timeMs: number): void {
    if (this.active && timeMs >= this.endsAt) this.end(false);
  }

  /** 0..1 of the active fever's remaining time. */
  remaining(timeMs: number): number {
    return this.active ? Math.max(0, Math.min(1, (this.endsAt - timeMs) / this.cfg.durationMs)) : 0;
  }

  private end(broken: boolean): void {
    this.active = false;
    this.nextMultiplier = broken ? this.cfg.startMultiplier : Math.min(this.cfg.maxMultiplier, this.multiplier + 1);
    this.multiplier = 1;
  }
}
