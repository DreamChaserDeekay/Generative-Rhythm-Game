import { gaugeRules, judgementConfig } from '../engine/config';
import { placementLabels } from '../engine/placement';
import type { ReplayData } from '../engine/replay';
import { rulesetConfigs, type RulesetId } from '../engine/ruleset';
import { DEFAULT_SETTINGS, type Pacemaker, type Settings } from '../settings/settings';
import type { PlayRequest } from './App';
import type { PlayOutcome } from './PlayController';

/** What a play runs on, beyond the chart: its judgement and score rules, its mode, its pacemaker. */

type JudgementSettings = Pick<Settings, 'judgementMode' | 'ruleset' | 'gaugeType' | 'fever' | 'placement'>;

/** The settings a replay must be judged with (or, with no replay, those of `base`). */
export function judgementSettingsOf(replay: ReplayData | null, base?: Settings): Partial<Settings> {
  const src = replay?.settings ?? base;
  if (!src) return {};
  return { judgementMode: src.judgementMode, ruleset: src.ruleset, gaugeType: src.gaugeType, fever: src.fever, placement: src.placement };
}

/** The settings a play runs on: a replay's recorded judgement settings over the player's own. */
export function playedSettings(request: Pick<PlayRequest, 'replay'>, settings: Settings): Settings {
  return request.replay ? { ...settings, ...judgementSettingsOf(request.replay) } : settings;
}

/** A practice's playback rate as every screen names it ("배속" is SPEED's alone). */
export const playbackRateText = (rate: number) => `재생 속도 ×${rate.toFixed(2)}`;

/** AUTO, REPLAY or 연습 (with its playback rate); null for a play of one's own. */
export function playModeLabel(request: Pick<PlayRequest, 'replay' | 'practice' | 'autoPlay'>): string | null {
  const practice = request.practice;
  if (request.replay) return 'REPLAY';
  if (practice) return `연습${practice.rate !== 1 ? ` · ${playbackRateText(practice.rate)}` : ''}`;
  return request.autoPlay ? 'AUTO' : null;
}

/**
 * The rules of a play that differ from the defaults, as [name, value] (the judgement mode names
 * itself: HARD JUDGEMENT): nothing more is shown for a play on the defaults. Practice always runs
 * on the NORMAL gauge, so its gauge is not one of them.
 */
export function ruleChips(s: JudgementSettings, practice: boolean): [string, string][] {
  const d = DEFAULT_SETTINGS;
  const chips: [string, string][] = [];
  const judgement = judgementChip(s.judgementMode);
  if (judgement) chips.push(['', judgement]);
  if (s.placement !== d.placement) chips.push(['배치', placementLabels[s.placement]]);
  if (s.ruleset !== d.ruleset) chips.push(['점수 규칙', rulesetConfigs[s.ruleset].label]);
  if (s.gaugeType !== d.gaugeType && !practice) chips.push(['게이지', gaugeRules[s.gaugeType].label]);
  return chips;
}

/** The judgement mode's own name (HARD JUDGEMENT) for a play that is not on NORMAL; else null. */
export function judgementChip(mode: Settings['judgementMode']): string | null {
  return mode === DEFAULT_SETTINGS.judgementMode ? null : judgementConfig.modes[mode].label;
}

/** Pacemaker targets: grades under EX-SCORE (as BMS players pace), shares of the score otherwise. */
const EX_TARGETS: Pacemaker[] = ['A', 'AA', 'AAA', 'MAX'];
const SHARE_TARGETS: Pacemaker[] = ['90', '95', '98', '99', '100'];

/** The pacemakers to choose from under a score rule (the current one stays listed if it is of the other kind). */
export function pacemakerChoices(ruleset: RulesetId, current: Pacemaker): Pacemaker[] {
  const list: Pacemaker[] = ['OFF', 'BEST', ...(rulesetConfigs[ruleset].scoring === 'exscore' ? EX_TARGETS : SHARE_TARGETS)];
  return list.includes(current) ? list : [...list, current];
}

/** The share of the most that could have been scored so far a target asks for (null: OFF, BEST). */
export function paceRatio(p: Pacemaker): number | null {
  if (p === 'OFF' || p === 'BEST') return null;
  if (p === 'MAX') return 1;
  const rank = rulesetConfigs.EXSCORE.ranks?.find(([label]) => label === p);
  return rank ? rank[1] : Number(p) / 100;
}

/** The pacemaker's name beside its number: vs BEST, vs 95%, vs AAA. */
export function pacemakerLabel(p: Pacemaker): string {
  return `vs ${p === 'BEST' || EX_TARGETS.includes(p) ? p : `${p}%`}`;
}

/** Whether a play is stored as a record (autoplay, practice, replays and the sync test are not). */
export function isRecorded(request: Pick<PlayRequest, 'autoPlay' | 'replay' | 'practice' | 'chart'>): boolean {
  return !request.autoPlay && !request.replay && !request.practice && !!request.chart.meta.songId;
}

/**
 * The best a retry from the result paces against: the play just made, with its replay, when it
 * beat the record the play started with (the server keeps the best by score as well).
 */
export function bestAfterPlay(request: PlayRequest, outcome: Pick<PlayOutcome, 'result' | 'replay'>): PlayRequest['best'] {
  const best = request.best ?? null;
  if (!isRecorded(request) || !outcome.replay || (best && best.score >= outcome.result.score)) return best;
  return { score: outcome.result.score, rate: outcome.result.rate, replay: outcome.replay };
}
