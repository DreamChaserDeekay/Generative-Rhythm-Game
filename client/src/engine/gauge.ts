import type { GaugeRule } from './config';

/** Life gauge in percent. MAX 1% neither raises nor lowers it (DJMAX rule). */
export class Gauge {
  value: number;
  readonly rule: GaugeRule;
  readonly total: number;
  private readonly gainPerEvent: number;
  private failed = false;

  constructor(rule: GaugeRule, judgeableEvents: number) {
    this.rule = rule;
    this.value = rule.start;
    this.total = Math.min(rule.total.max, rule.total.base + rule.total.perEvent * judgeableEvents);
    this.gainPerEvent = judgeableEvents > 0 ? this.total / judgeableEvents : 0;
  }

  apply(percent: number, isBreak: boolean): void {
    if (this.failed) return;
    if (isBreak) this.value -= this.rule.breakPenalty;
    else if (percent > 1) this.value += (this.gainPerEvent * percent) / 100;
    this.value = Math.min(100, Math.max(0, this.value));
    if (this.rule.failAtZero && this.value <= 0) this.failed = true;
  }

  get hasFailed(): boolean {
    return this.failed;
  }

  get cleared(): boolean {
    return !this.failed && this.value >= this.rule.clear;
  }
}
