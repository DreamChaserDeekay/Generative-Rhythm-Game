import rulesetsJson from '@config/rulesets.json';

export type RulesetId = 'RESPECT' | 'GRADE' | 'EXSCORE';

interface GroupConfig {
  label: string;
  minPercent: number;
  weight?: number;
  ex?: number;
  cls: string;
  breaksCombo?: boolean;
}

export interface RulesetConfig {
  label: string;
  reference: string;
  scoring: 'rate' | 'weighted' | 'exscore';
  missLabel: string;
  groups?: GroupConfig[];
  ranks?: [string, number][];
}

/** How one DJMAX judgement looks and counts under a ruleset. */
export interface Classified {
  label: string;
  cls: string;
  breaksCombo: boolean;
  weight: number;
  ex: number;
}

export interface RulesetRow {
  label: string;
  cls: string;
  count: number;
}

const config = rulesetsJson as unknown as {
  default: RulesetId;
  grades: { ladder: [string, number][] };
  rulesets: Record<RulesetId, RulesetConfig>;
};

export const rulesetIds = Object.keys(config.rulesets) as RulesetId[];
export const defaultRuleset = config.default;
export const rulesetConfigs = config.rulesets;

/** Grades of a score out of 1,000,000, best first: the EZ2ON ladder scaled from 1,100,000 (rulesets.json). */
export const gradeLadder = config.grades.ladder;

/** The grade (S+++ … F) of a score out of 1,000,000. */
export function gradeOf(score: number): string {
  return gradeLadder.find(([, min]) => score >= min)?.[0] ?? gradeLadder[gradeLadder.length - 1][0];
}

/** Colour class for a DJMAX percent (used by the native "정밀 %" ruleset). */
export function gradeClass(percent: number, isBreak: boolean): string {
  if (isBreak) return 'g-break';
  if (percent >= 100) return 'g-max';
  if (percent >= 80) return 'g-high';
  if (percent >= 40) return 'g-mid';
  return 'g-low';
}

/**
 * Display/scoring layer over the shared DJMAX judgement windows: the native percent grades, an
 * EZ2ON-like grade ladder, or a BMS-like EX-SCORE ladder.
 */
export class Ruleset {
  readonly id: RulesetId;
  readonly config: RulesetConfig;
  private readonly groups: GroupConfig[];

  constructor(id: RulesetId = defaultRuleset) {
    const cfg = config.rulesets[id];
    if (!cfg) throw new Error(`unknown ruleset: ${id}`);
    this.id = id;
    this.config = cfg;
    this.groups = [...(cfg.groups ?? [])].sort((a, b) => b.minPercent - a.minPercent);
  }

  classify(percent: number, isBreak: boolean, nativeLabel: string): Classified {
    if (isBreak) return { label: this.config.missLabel, cls: 'g-break', breaksCombo: true, weight: 0, ex: 0 };
    if (this.groups.length === 0) {
      return { label: nativeLabel, cls: gradeClass(percent, false), breaksCombo: false, weight: percent / 100, ex: 0 };
    }
    const g = this.groups.find((x) => percent >= x.minPercent) ?? this.groups[this.groups.length - 1];
    return { label: g.label, cls: g.cls, breaksCombo: g.breaksCombo ?? false, weight: g.weight ?? percent / 100, ex: g.ex ?? 0 };
  }

  /** Result rows: native percent counts folded into this ruleset's grades, miss last. */
  rows(counts: { label: string; percent: number; count: number }[], misses: number): RulesetRow[] {
    if (this.groups.length === 0) {
      return [...counts.map((c) => ({ label: c.label, cls: gradeClass(c.percent, false), count: c.count })), { label: this.config.missLabel, cls: 'g-break', count: misses }];
    }
    const rows = this.groups.map((g) => ({ label: g.label, cls: g.cls, count: 0 }));
    for (const c of counts) {
      const i = this.groups.findIndex((g) => c.percent >= g.minPercent);
      rows[i >= 0 ? i : rows.length - 1].count += c.count;
    }
    rows.push({ label: this.config.missLabel, cls: 'g-break', count: misses });
    return rows;
  }

  rank(exRatio: number): string {
    const ranks = this.config.ranks ?? [];
    return ranks.find(([, min]) => exRatio >= min)?.[0] ?? (ranks.length ? ranks[ranks.length - 1][0] : '');
  }

  /**
   * A play's grade: the EZ2ON ladder on its score (the grade-weighted score under 등급형), or the
   * BMS rank under EX-SCORE.
   */
  grade(score: number, weightedScore: number, exRatio: number): string {
    if (this.config.scoring === 'exscore') return this.rank(exRatio);
    return gradeOf(this.config.scoring === 'weighted' ? weightedScore : score);
  }
}
