import type { ScoreRecord } from '../api/client';
import { lampOrder, type ClearLamp } from '../engine/config';
import { Ruleset, type RulesetId, type RulesetRow } from '../engine/ruleset';
import type { JudgeMark } from '../engine/session';
import { TempoMap } from '../engine/tempo';
import type { Chart } from '../engine/types';
import { groupToken } from './sections';

/** One colour of the judgement counts: the rows it folds ("MAX 90–80%") and their total. */
export interface JudgeCell {
  label: string;
  cls: string;
  count: number;
}

/**
 * The result rows by colour: a ruleset's grades as they are, the DJMAX percents folded into their
 * four colours ("MAX 90–80%"), the miss row last.
 */
export function judgeCells(rows: RulesetRow[]): JudgeCell[] {
  const groups: RulesetRow[][] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last[0].cls === r.cls) last.push(r);
    else groups.push([r]);
  }
  return groups.map((g) => ({ label: rangeLabel(g.map((r) => r.label)), cls: g[0].cls, count: g.reduce((sum, r) => sum + r.count, 0) }));
}

/** "MAX 90%" … "MAX 80%" → "MAX 90–80%"; labels of another form are listed. */
function rangeLabel(labels: string[]): string {
  if (labels.length === 1) return labels[0];
  const parts = labels.map((l) => /^(.*?)(\d+)%$/.exec(l));
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (first && last && parts.every((m) => m?.[1] === first[1])) return `${first[1]}${first[2]}–${last[2]}%`;
  return labels.join(' · ');
}

/** Bars of the run strip: about one per 1.5 s of the span, 40 to 160. */
export function stripBins(spanMs: number): number {
  return Math.max(40, Math.min(160, Math.round(spanMs / 1500)));
}

/** Notes per bin over [startMs, endMs] (a long note counts once, at its head). */
export function densityBins(notes: { t: number }[], startMs: number, endMs: number, bins: number): number[] {
  const span = Math.max(1, endMs - startMs);
  const out = new Array<number>(bins).fill(0);
  for (const n of notes) {
    if (n.t < startMs || n.t > endMs) continue;
    out[Math.min(bins - 1, Math.floor(((n.t - startMs) / span) * bins))]++;
  }
  return out;
}

/** Colours of the judgements that lost points on the strip, best first. */
export const LOSS_CLASSES = ['g-mid', 'g-low', 'g-break'] as const;

/** Where the play lost points: the note times of the judgements in the ruleset's lower colours and of the BREAKs. */
export function lossTimes(judgements: JudgeMark[], ruleset: RulesetId): Record<(typeof LOSS_CLASSES)[number], number[]> {
  const rules = new Ruleset(ruleset);
  const out = { 'g-mid': [] as number[], 'g-low': [] as number[], 'g-break': [] as number[] };
  for (const j of judgements) {
    const cls = rules.classify(j.percent, j.percent === 0, '').cls;
    if (cls in out) out[cls as keyof typeof out].push(j.noteMs);
  }
  return out;
}

export interface SectionScore {
  /** Shares of [startMs, endMs] the section spans. */
  from: number;
  to: number;
  /** intro, verse, chorus … as the chart names it. */
  label: string;
  /** Colour token of its repetition group. */
  color: string;
  /** Mean DJMAX percent of the notes judged in it (BREAK = 0); null when none were. */
  accuracy: number | null;
}

/** The chart's sections over [startMs, endMs], each with the accuracy of the notes in it. */
export function sectionScores(chart: Pick<Chart, 'timing' | 'sections'>, judgements: JudgeMark[], startMs: number, endMs: number): SectionScore[] {
  const sections = chart.sections ?? [];
  if (sections.length === 0 || endMs <= startMs) return [];
  const tempo = new TempoMap(chart.timing);
  const span = endMs - startMs;
  const out: SectionScore[] = [];
  sections.forEach((s, i) => {
    const next = s.endBeat ?? sections[i + 1]?.startBeat;
    const a = Math.max(startMs, tempo.beatToMs(s.startBeat));
    const b = Math.min(endMs, next === undefined ? endMs : tempo.beatToMs(next));
    if (b <= a) return;
    let sum = 0;
    let n = 0;
    // the last section keeps a note that lies on the very end
    const inside = (t: number) => t >= a && (t < b || (b === endMs && t === endMs));
    for (const j of judgements) {
      if (!inside(j.noteMs)) continue;
      sum += j.percent;
      n++;
    }
    out.push({ from: (a - startMs) / span, to: (b - startMs) / span, label: s.label, color: groupToken(s.group), accuracy: n > 0 ? sum / n : null });
  });
  return out;
}

/** "100%" only when every note was MAX 100%; below that one decimal, rounded down. */
export function accuracyLabel(accuracy: number | null): string {
  if (accuracy === null) return '–';
  if (accuracy >= 100) return '100%';
  return `${(Math.floor(accuracy * 10) / 10).toFixed(1)}%`;
}

/** What this play changed on the chart's record. */
export interface RecordChange {
  /** No earlier play on this chart. */
  first: boolean;
  /** A higher score than the best (a tie is no record). */
  newBest: boolean;
  /** The best lamp before and the lamp reached, when it went up. */
  lampUp: [string, string] | null;
  /** This RATE minus the best play's (null on the first play). */
  rateDelta: number | null;
}

/** The change against the record kept before this play (rates compared as they are saved, to 0.01). */
export function recordChange(play: { score: number; rate: number; lamp: string }, before: ScoreRecord | null): RecordChange {
  if (!before) return { first: true, newBest: false, lampUp: null, rateDelta: null };
  const rank = (lamp: string) => lampOrder.indexOf(lamp as ClearLamp);
  return {
    first: false,
    newBest: play.score > before.score,
    lampUp: rank(play.lamp) > rank(before.lamp) ? [before.lamp, play.lamp] : null,
    rateDelta: Math.round((Math.round(play.rate * 100) / 100 - before.rate) * 100) / 100,
  };
}

/** "+0.42%", "−0.53%" or "±0.00%". */
export function signedPercent(delta: number): string {
  if (delta === 0) return '±0.00%';
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(2)}%`;
}
