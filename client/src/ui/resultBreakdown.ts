import type { ModeRecord, ScoreRecord } from '../api/client';
import { judgementConfig, lampOrder, type ClearLamp, type JudgementModeId } from '../engine/config';
import { JudgementTable } from '../engine/judgement';
import { gradeLadder, Ruleset, rulesetConfigs, type RulesetConfig, type RulesetId, type RulesetRow } from '../engine/ruleset';
import type { JudgeMark, SessionResult } from '../engine/session';
import { TempoMap } from '../engine/tempo';
import type { Chart } from '../engine/types';
import { OFFSET_MAX, SONG_OFFSET_MAX } from '../settings/settings';
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

/** Colours of the judgements that lost points on the strip, best first (MAX 90–80%, EX-SCORE's GREAT too). */
export const LOSS_CLASSES = ['g-high', 'g-mid', 'g-low', 'g-break'] as const;
export type LossClass = (typeof LOSS_CLASSES)[number];

/** Where the play lost points: the note times of the judgements under the ruleset's best colour, and of the BREAKs. */
export function lossTimes(judgements: JudgeMark[], ruleset: RulesetId): Record<LossClass, number[]> {
  const rules = new Ruleset(ruleset);
  const out: Record<LossClass, number[]> = { 'g-high': [], 'g-mid': [], 'g-low': [], 'g-break': [] };
  for (const j of judgements) {
    const cls = rules.classify(j.percent, j.percent === 0, '').cls;
    if (cls in out) out[cls as LossClass].push(j.noteMs);
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

/**
 * What a play is recorded by: the numbers a score rule leads with, its BREAKs and whether it
 * reached the end (a run its gauge stopped judged part of the chart), and its lamp.
 */
export type PlayNumbers = Pick<SessionResult, 'rate' | 'weightedScore' | 'exScore' | 'breaks' | 'failedAtMs' | 'lamp'>;

type Scoring = RulesetConfig['scoring'];

/** The number a score rule leads with: RATE (as it is saved, to 0.01), the weighted score or EX-SCORE. */
export function headlineOf(scoring: Scoring, play: Pick<PlayNumbers, 'rate' | 'weightedScore' | 'exScore'>): number {
  if (scoring === 'rate') return Math.round(play.rate * 100) / 100;
  return scoring === 'weighted' ? Math.round(play.weightedScore) : play.exScore;
}

/** A record's best of that number (null: no play under that score rule). */
function recordHeadline(scoring: Scoring, record: ModeRecord): number | null {
  if (scoring === 'rate') return record.rate;
  return (scoring === 'weighted' ? record.weightedScore : record.exScore) ?? null;
}

/** What this play changed on the chart's record: its lamp, and its bests under the play's judgement mode. */
export interface RecordChange {
  /**
   * Nothing to compare the headline with: no earlier play of the chart ('chart'), none under this
   * judgement mode ('mode') or none under this score rule ('rule'); null when there is one.
   */
  first: 'chart' | 'mode' | 'rule' | null;
  /** A better headline than the best (a tie is no record). */
  newBest: boolean;
  /**
   * The chart's lamp before and the lamp reached, when it went up: the lamp the song select shows,
   * of every judgement mode (a first play of the chart has none to go up from).
   */
  lampUp: [string, string] | null;
  /** This headline less the best's, in its unit (null when first). */
  delta: number | null;
  /**
   * This play's BREAKs less the fewest of the mode's plays that reached the end (null: none did,
   * or this one failed partway: the notes it never reached are no BREAK of its own).
   */
  breaksDelta: number | null;
  /** The mode's bests before: the headline (null: none under this rule) and the fewest BREAK. */
  before: { headline: number | null; breaks: number | null } | null;
}

/**
 * The change against the record kept before this play: the chart's lamp, and on the number the
 * score rule leads with against the plays of the same judgement mode (HARD and MAX JUDGEMENT score lower).
 */
export function recordChange(play: PlayNumbers, record: ScoreRecord | null, mode: JudgementModeId, ruleset: RulesetId): RecordChange {
  const rank = (lamp: string) => lampOrder.indexOf(lamp as ClearLamp);
  const lampUp: RecordChange['lampUp'] = record && rank(play.lamp) > rank(record.lamp) ? [record.lamp, play.lamp] : null;
  // a record without its bests by mode is the mode's (a server from before they were kept)
  const best: ModeRecord | null = record ? (record.byMode ? (record.byMode[mode] ?? null) : record) : null;
  if (!best) return { first: record ? 'mode' : 'chart', newBest: false, lampUp, delta: null, breaksDelta: null, before: null };
  const scoring = rulesetConfigs[ruleset].scoring;
  const now = headlineOf(scoring, play);
  const headline = recordHeadline(scoring, best);
  const breaks = best.minBreaks ?? null;
  return {
    first: headline === null ? 'rule' : null,
    newBest: headline !== null && now > headline,
    lampUp,
    delta: headline === null ? null : scoring === 'rate' ? Math.round((now - headline) * 100) / 100 : now - headline,
    breaksDelta: breaks === null || play.failedAtMs !== null ? null : play.breaks - breaks,
    before: { headline, breaks },
  };
}

/** "+0.42%", "−0.53%" or "±0.00%". */
export function signedPercent(delta: number): string {
  if (delta === 0) return '±0.00%';
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(2)}%`;
}

/** "+1,234", "−23" or "±0" (a score, EX-SCORE, a count of BREAK). */
export function signedCount(delta: number): string {
  if (delta === 0) return '±0';
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta).toLocaleString('en-US')}`;
}

/**
 * The next grade up and how far the headline is from it, in its unit: RATE to 0.01 (rounded up,
 * so it is never 0), the weighted score or EX-SCORE. Null at the top grade.
 */
export function nextGrade(result: Pick<SessionResult, 'ruleset' | 'score' | 'weightedScore' | 'exScore' | 'exMax'>): { grade: string; short: number } | null {
  const rules = rulesetConfigs[result.ruleset];
  if (rules.scoring === 'exscore') {
    const ranks = rules.ranks ?? [];
    if (result.exMax <= 0) return null;
    const ratio = result.exScore / result.exMax;
    const at = ranks.findIndex(([, min]) => ratio >= min);
    if (at === 0 || ranks.length === 0) return null;
    const [grade, min] = ranks[(at < 0 ? ranks.length : at) - 1];
    // the least EX-SCORE whose share reaches the rank
    return { grade, short: Math.ceil(min * result.exMax - 1e-9) - result.exScore };
  }
  const score = rules.scoring === 'weighted' ? result.weightedScore : result.score;
  const at = gradeLadder.findIndex(([, min]) => score >= min);
  if (at <= 0) return null;
  const [grade, min] = gradeLadder[at - 1];
  // RATE: 10,000 points are 1%
  return { grade, short: rules.scoring === 'weighted' ? min - score : Math.ceil((min - score) / 100) / 100 };
}

/** "다음 S+++까지 −0.08%", "다음 S+까지 −12,345", "다음 AA까지 −23". */
export function nextGradeText(next: { grade: string; short: number }, scoring: Scoring): string {
  const short = scoring === 'rate' ? `${next.short.toFixed(2)}%` : next.short.toLocaleString('en-US');
  return `다음 ${next.grade}까지 −${short}`;
}

/**
 * A lane on Shift (4K+FX and 6K+FX on both, 7K+1S's scratch by default): R pressed while it is
 * held is a Shift+R, so there the result keeps R the lane order just played.
 */
export function shiftIsLane(laneCodes: ReadonlySet<string>): boolean {
  return laneCodes.has('ShiftLeft') || laneCodes.has('ShiftRight');
}

/**
 * A key the play's lanes sent: one of its lane keys, or whatever key a pad sent from one of its pad
 * lanes (`padCode`, the control a menu bridge sent it for). A pad's X plays again on the result:
 * where it is a lane, it is a lane's press like any other.
 */
export function isLaneKey(code: string, padCode: string | null, laneKeys: ReadonlySet<string>, padLanes: ReadonlySet<string>): boolean {
  return laneKeys.has(code) || (padCode !== null && padLanes.has(padCode));
}

/** The least trimmed mean error (ms) the result offers to make up for. */
export const OFFSET_FIX_MIN_MS = 3;

/** An offset as it was and as it would make up for the play's mean error. */
export interface OffsetMove {
  from: number;
  to: number;
}

/** The trimmed mean error (whole ms, + late) and the offsets that cancel it (null: one that cannot move). */
export interface OffsetFix {
  errorMs: number;
  input: OffsetMove | null;
  song: OffsetMove | null;
}

/**
 * What the result offers to make up for the play's timing: its trimmed mean error (whole ms, +
 * late) and the offsets that cancel it, worked out from those the play ran on, so they stay what
 * they are once one is applied: the player's (real ms) or the song's own (song ms: at a
 * practice's rate the same real ms are fewer of them). Either is null where it cannot move (its
 * limit, or no song: the sync test); null for an error under OFFSET_FIX_MIN_MS.
 */
export function offsetFix(meanErrorMs: number | null, offsets: { input: number; song: number } | null, rate: number, hasSong: boolean): OffsetFix | null {
  if (meanErrorMs === null || offsets === null) return null;
  const errorMs = Math.round(meanErrorMs);
  if (Math.abs(errorMs) < OFFSET_FIX_MIN_MS) return null;
  const move = (from: number, by: number, max: number): OffsetMove | null => {
    const to = Math.round(Math.min(max, Math.max(-max, from + by)));
    return to === from ? null : { from, to };
  };
  const input = move(offsets.input, errorMs, OFFSET_MAX);
  const song = hasSong ? move(offsets.song, Math.round(errorMs * rate), SONG_OFFSET_MAX) : null;
  return input || song ? { errorMs, input, song } : null;
}

/**
 * The hits' timing errors (real ms) as the offsets at the play's end judge them: a hit judged
 * before the song's offset was changed in play is off by the changes after it (song ms, so at a
 * practice's rate fewer real ms). `shifts`: after how many hits (in the order judged), by how much.
 */
export function errorsAtEnd(hits: readonly { errorMs: number }[], shifts: readonly { hits: number; ms: number }[], rate: number): number[] {
  return hits.map((h, i) => {
    let later = 0;
    for (const s of shifts) if (s.hits > i) later += s.ms;
    return h.errorMs - later / rate;
  });
}

/** "+4ms", "0ms", "-12ms" (as the settings write an offset). */
export const offsetText = (ms: number) => `${ms > 0 ? '+' : ''}${ms}ms`;

/**
 * The windows of a play's judgement mode in real ms (a practice's timing errors are real ms):
 * its MAX 100% (and the score rule's name for it: MAX 100%, PERFECT), its MAX 1% (the timing
 * graphs' range), and the colour of the ruleset's grades out to each window, tightest first.
 */
export interface TimingWindows {
  topMs: number;
  topLabel: string;
  outerMs: number;
  bands: { ms: number; cls: string }[];
}

export function timingWindows(mode: JudgementModeId, ruleset: RulesetId): TimingWindows {
  const table = new JudgementTable(judgementConfig, mode);
  const rules = new Ruleset(ruleset);
  const bands: { ms: number; cls: string }[] = [];
  for (const g of table.grades) {
    const cls = rules.classify(g.percent, false, g.label).cls;
    const last = bands[bands.length - 1];
    if (last?.cls === cls) last.ms = g.windowMs;
    else bands.push({ ms: g.windowMs, cls });
  }
  const top = table.topGrade;
  return { topMs: top.windowMs, topLabel: rules.classify(top.percent, false, top.label).label, outerMs: table.outerMs, bands };
}

/** The colour of a timing error under those windows (the widest past them). */
export function bandOf(windows: TimingWindows, errorMs: number): string {
  const abs = Math.abs(errorMs);
  return (windows.bands.find((b) => abs <= b.ms + 1e-9) ?? windows.bands[windows.bands.length - 1]).cls;
}

/**
 * The timing histogram's bins over the MAX 1% window either side: an odd number of them, so that
 * one is centred on 0, about 2 to 4 ms wide (about 90 over the window).
 */
export function histogramBins(errors: number[], outerMs: number): { binMs: number; counts: number[] } {
  const wide = Math.min(4, Math.max(2, (2 * outerMs) / 90));
  const bins = 2 * Math.floor(outerMs / wide) + 1;
  const binMs = (2 * outerMs) / bins;
  const counts = new Array<number>(bins).fill(0);
  // an error on the window's edge is in the last bin
  for (const e of errors) if (Math.abs(e) <= outerMs) counts[Math.min(bins - 1, Math.floor((e + outerMs) / binMs))]++;
  return { binMs, counts };
}
