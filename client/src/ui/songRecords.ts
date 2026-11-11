import type { ScoreRecord, Song } from '../api/client';
import { difficultyTiers, lampOrder, type ClearLamp } from '../engine/config';
import { gradeOf, rulesetConfigs, type RulesetId } from '../engine/ruleset';
import type { KeyModeId } from '../engine/types';
import type { SongFolder, SongSort, SongSortKey } from '../settings/settings';
import type { ChartBrief } from './chartCache';

/** The song select's filters, in the order of their keys (1 to 5): which songs, and the names that order them. */
export const SONG_FILTERS = ['all', 'title', 'artist', 'album', 'favorites'] as const;
export type SongFilter = (typeof SONG_FILTERS)[number];
export const FILTER_LABELS: Record<SongFilter, string> = { all: '전체', title: '곡명', artist: '아티스트명', album: '앨범명', favorites: '즐겨찾기' };
export const SORT_DIR_LABELS: Record<SongSort['dir'], string> = { desc: '내림차순', asc: '오름차순' };

/** A record of an edited or imported chart (its own entry, on no tier). */
export const isSaved = (r: ScoreRecord) => r.kind !== undefined && r.kind !== 'generated';

const TIER_IDS = new Set(difficultyTiers.map((t) => t.id));

/** The song's bests of generated charts on a key mode (records of the removed EASY, DJMAX and EZ2ON tiers left out). */
export function recordsOn(song: Song, keyMode: KeyModeId): ScoreRecord[] {
  return (song.records ?? []).filter((r) => r.keyMode === keyMode && !isSaved(r) && TIER_IDS.has(r.difficulty));
}

/** The song's bests of its edited and imported charts on a key mode. */
export function savedRecordsOn(song: Song, keyMode: KeyModeId): ScoreRecord[] {
  return (song.records ?? []).filter((r) => r.keyMode === keyMode && isSaved(r));
}

/** The record of one chart (null: never played). */
export function recordOf(song: Song | null, chartId: string | null | undefined): ScoreRecord | null {
  return (chartId && song?.records?.find((r) => r.chartId === chartId)) || null;
}

/** The best record (highest score) of each tier among `records`. */
export function bestByTier(records: ScoreRecord[]): Map<string, ScoreRecord> {
  const best = new Map<string, ScoreRecord>();
  for (const r of records) {
    const b = best.get(r.difficulty);
    if (!b || r.score > b.score) best.set(r.difficulty, r);
  }
  return best;
}

export const lampRank = (lamp: string) => lampOrder.indexOf(lamp as ClearLamp);

/** The best lamp of `records` (null: none). */
function bestLamp(records: ScoreRecord[]): string | null {
  return records.reduce<string | null>((best, r) => (best === null || lampRank(r.lamp) > lampRank(best) ? r.lamp : best), null);
}

/** Whether a song is among the ones the song select lists: every song, or the favourites. */
export function inFolder(song: Song, folder: SongFolder, favorites: ReadonlySet<string>): boolean {
  return folder !== 'favorites' || favorites.has(song.id);
}

/**
 * A press on one of the three names: its order downward (내림차순), a second press upward
 * (오름차순), a third no order (the library's own). Another name's order ends as this one begins.
 */
export function nextSongSort(sort: SongSort | null, key: SongSortKey): SongSort | null {
  if (sort?.key !== key) return { key, dir: 'desc' };
  return sort.dir === 'desc' ? { key, dir: 'asc' } : null;
}

/** What a press on a filter says it did (the status line). */
export function sortSaid(key: SongSortKey, sort: SongSort | null): string {
  return sort ? `${FILTER_LABELS[key]} ${SORT_DIR_LABELS[sort.dir]}` : `${FILTER_LABELS[key]} 정렬 해제 · 추가한 순서`;
}

/** A tier's cell on the song list: its level and lamp (null: not known, never played). */
export interface TierMark {
  level: number | null;
  lamp: string | null;
  /** The lamp is another chart's of the tier than the one Enter plays (never played itself). */
  other?: boolean;
}

/**
 * A tier's cell on the song list: once the chart Enter plays is known (its brief), its level and
 * its own lamp, or with no play of its own the best lamp of the tier's other charts marked as
 * theirs (a new pattern, other options, an earlier generator); until then the level of the tier's
 * best play and the best lamp of its charts (as the folders and the lamp order count it).
 */
export function tierMark(records: ScoreRecord[], tier: string, brief: ChartBrief | null): TierMark {
  const own = records.filter((r) => r.difficulty === tier);
  const lamp = bestLamp(own);
  if (!brief) return { level: bestByTier(own).get(tier)?.level ?? null, lamp };
  const played = own.find((r) => r.chartId === brief.chartId);
  if (played) return { level: brief.level, lamp: played.lamp };
  return { level: brief.level, lamp, other: lamp !== null };
}

/** Two cells that show the same (a row of the song list is drawn again only when one of its cells changes). */
export function sameMark(a: TierMark | null, b: TierMark | null): boolean {
  if (a === null || b === null) return a === b;
  return a.level === b.level && a.lamp === b.lamp && Boolean(a.other) === Boolean(b.other);
}

/** The best of `records` by lamp, then score (null: none). */
function bestPlay(records: ScoreRecord[]): ScoreRecord | null {
  return records.reduce<ScoreRecord | null>((b, r) => (b === null || lampRank(r.lamp) > lampRank(b.lamp) || (r.lamp === b.lamp && r.score > b.score) ? r : b), null);
}

/** The best record of a tier on another chart than `chartId` (the best lamp, then score), or null. */
export function otherBest(records: ScoreRecord[], tier: string, chartId: string | null | undefined): ScoreRecord | null {
  return bestPlay(records.filter((r) => r.difficulty === tier && r.chartId !== chartId));
}

/** A generated chart made by another generator than the one of the moment (it is played as it was, never made again). */
export function olderGenerator(r: Pick<ScoreRecord, 'generatorVersion'>, generator: string | null): boolean {
  return Boolean(generator && r.generatorVersion && r.generatorVersion !== generator);
}

/** What another chart of a tier is to the one Enter plays: the default pattern as an earlier generator made it, or another pattern. */
export function otherLabel(r: ScoreRecord, generator: string | null): string {
  return r.defaultSeed && olderGenerator(r, generator) ? '이전 생성기' : '다른 패턴';
}

/** The saved charts' cell on the song list: the best lamp among them, with that chart's level as its file gives it. */
export function savedMark(records: ScoreRecord[]): (TierMark & { name: string }) | null {
  const best = bestPlay(records);
  if (!best) return null;
  const source = Number(best.sourceLevel);
  return { level: Number.isFinite(source) && best.sourceLevel ? source : best.level, lamp: best.lamp, name: best.name || best.difficulty };
}

/**
 * A record's score under a score rule and its grade: the base score under 정밀 %, the weighted
 * score under 등급형, the EX-SCORE under EX-SCORE (no grade: its rank needs the chart's maximum).
 * Null: no play under that rule (or from before it was kept).
 */
export function recordScore(r: Pick<ScoreRecord, 'score' | 'exScore' | 'weightedScore'>, ruleset: RulesetId): { score: number | null; grade: string | null } {
  const scoring = rulesetConfigs[ruleset].scoring;
  const score = scoring === 'weighted' ? (r.weightedScore ?? null) : scoring === 'exscore' ? (r.exScore ?? null) : r.score;
  return { score, grade: score === null || scoring === 'exscore' ? null : gradeOf(score) };
}

/**
 * The number a score rule heads a record with: RATE under 정밀 %, the grade and the weighted score
 * under 등급형, the EX-SCORE under EX-SCORE. A record without plays under that rule (or from
 * before it was kept) is headed by its RATE.
 */
export function recordHeadline(r: Pick<ScoreRecord, 'rate' | 'exScore' | 'weightedScore'>, ruleset: RulesetId): { label: string; value: string } {
  const scoring = rulesetConfigs[ruleset].scoring;
  if (scoring === 'weighted' && typeof r.weightedScore === 'number') return { label: gradeOf(r.weightedScore), value: r.weightedScore.toLocaleString('en-US') };
  if (scoring === 'exscore' && typeof r.exScore === 'number') return { label: 'EX', value: r.exScore.toLocaleString('en-US') };
  return { label: 'RATE', value: `${r.rate.toFixed(2)}%` };
}

const collator = new Intl.Collator(['ko', 'en'], { numeric: true, sensitivity: 'base' });

/**
 * The song list in the order chosen: by one name, downward or upward (Hangul before Latin, numbers
 * by their value), or as the library gives it (newest first). A song without the name it is
 * ordered by stays at the end whichever way the order runs; songs of one name keep the library's order.
 */
export function sortSongs(songs: Song[], sort: SongSort | null): Song[] {
  if (!sort) return songs;
  const { key, dir } = sort;
  const sign = dir === 'asc' ? 1 : -1;
  const at = new Map(songs.map((s, i) => [s.id, i]));
  const order = (s: Song) => at.get(s.id) as number;
  return [...songs].sort((a, b) => {
    const [x, y] = [a[key].trim(), b[key].trim()];
    if (!x || !y) return x ? -1 : y ? 1 : order(a) - order(b);
    return sign * collator.compare(x, y) || order(a) - order(b);
  });
}
