import type { GaugeRule } from './config';

export interface GaugeSample {
  timeMs: number;
  value: number;
}

/** Life gauge in percent. MAX 1% neither raises nor lowers it (DJMAX rule). */
export class Gauge {
  value: number;
  readonly rule: GaugeRule;
  readonly total: number;
  readonly history: GaugeSample[] = [];
  private readonly gainPerEvent: number;
  private failed = false;
  private failedAtMs: number | null = null;

  constructor(rule: GaugeRule, judgeableEvents: number) {
    this.rule = rule;
    this.value = rule.start;
    this.total = rule.total ? Math.min(rule.total.max, rule.total.base + rule.total.perEvent * judgeableEvents) : 0;
    this.gainPerEvent = rule.fixedGain ?? (judgeableEvents > 0 ? (this.total / judgeableEvents) * (rule.gainScale ?? 1) : 0);
    this.history.push({ timeMs: Number.NEGATIVE_INFINITY, value: this.value });
  }

  apply(percent: number, isBreak: boolean, timeMs = 0): void {
    if (this.failed) return;
    if (isBreak) {
      const low = this.rule.lowHealth;
      const damping = low && this.value < low.below ? low.factor : 1;
      this.value -= this.rule.breakPenalty * damping;
    } else if (percent > 1) {
      this.value += (this.gainPerEvent * percent) / 100;
    }
    this.value = Math.min(100, Math.max(0, this.value));
    if (this.rule.failAtZero && this.value <= 0) {
      this.failed = true;
      this.failedAtMs = timeMs;
    }
    this.history.push({ timeMs, value: this.value });
  }

  get hasFailed(): boolean {
    return this.failed;
  }

  get failedAt(): number | null {
    return this.failedAtMs;
  }

  /** Survival gauges clear by lasting to the end; the others by ending at or above the clear line. */
  get cleared(): boolean {
    if (this.failed) return false;
    return this.rule.failAtZero ? this.value > 0 : this.value >= this.rule.clear;
  }
}
