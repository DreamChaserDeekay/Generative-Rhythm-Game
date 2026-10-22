import type { ScoreRecord, Song } from '../api/client';
import { lampOrder, type ClearLamp, type DifficultySystemId } from '../engine/config';
import { gradeOf, rulesetConfigs, type RulesetId } from '../engine/ruleset';
import type { KeyModeId } from '../engine/types';
import type { SongFolder, SongSort } from '../settings/settings';
import type { ChartBrief } from './chartCache';

export const FOLDER_LABELS: Record<SongFolder, string> = { all: '전체', favorites: '즐겨찾기', unplayed: '미플레이', uncleared: '미클리어', noFullCombo: '풀콤 미달' };
export const SORT_LABELS: Record<SongSort, string> = {
  added: '추가순',
  title: '제목순',
  artist: '아티스트순',
  bpm: 'BPM순',
  level: '레벨순',
  lamp: '램프순',
  rate: 'RATE순',
  recent: '최근 플레이순',
};

/** A record of an edited or imported chart (its own entry, on no difficulty system). */
export const isSaved = (r: ScoreRecord) => r.kind !== undefined && r.kind !== 'generated';

/** The song's bests of generated charts on a key mode and difficulty system (DJMAX NM is not EZ2ON NM). */
export function recordsOn(song: Song, keyMode: KeyModeId, system: DifficultySystemId): ScoreRecord[] {
  return (song.records ?? []).filter((r) => r.keyMode === keyMode && !isSaved(r) && (r.system ?? 'GRG') === system);
}

/** The song's bests of its edited and imported charts on a key mode, whatever the difficulty system. */
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

/** The best lamp reached on each group among `records`: a tier (on any of its charts), or a saved chart. */
function lampByGroup(records: ScoreRecord[]): Map<string, number> {
  const lamps = new Map<string, number>();
  for (const r of records) {
    const group = isSaved(r) ? r.chartId : r.difficulty;
    lamps.set(group, Math.max(lamps.get(group) ?? -1, lampRank(r.lamp)));
  }
  return lamps;
}

/**
 * Whether a song is in a folder of the song select. 미플레이, 미클리어 and 풀콤 미달 look at the
 * selected key mode and difficulty system (and the saved charts on the key mode, each its own),
 * never at the selected tier, so ←→ never changes the list: 미클리어 has a tier or a saved chart
 * whose every play failed, 풀콤 미달 one cleared without MAX COMBO.
 */
export function inFolder(song: Song, folder: SongFolder, keyMode: KeyModeId, system: DifficultySystemId, favorites: ReadonlySet<string>): boolean {
  const played = () => [...recordsOn(song, keyMode, system), ...savedRecordsOn(song, keyMode)];
  switch (folder) {
    case 'favorites':
      return favorites.has(song.id);
    case 'unplayed':
      return played().length === 0;
    case 'uncleared':
      return [...lampByGroup(played()).values()].some((rank) => rank === lampRank('FAILED'));
    case 'noFullCombo':
      return [...lampByGroup(played()).values()].some((rank) => rank > lampRank('FAILED') && rank < lampRank('MAX COMBO'));
    default:
      return true;
  }
}

/** A tier's cell on the song list: its level and lamp (null: not known, never played). */
export interface TierMark {
  level: number | null;
  /** A level on a scale of its own (SC). */
  levelScale?: string;
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
  if (played) return { level: brief.level, levelScale: brief.levelScale, lamp: played.lamp };
  return { level: brief.level, levelScale: brief.levelScale, lamp, other: lamp !== null };
}

/** Two cells that show the same (a row of the song list is drawn again only when one of its cells changes). */
export function sameMark(a: TierMark | null, b: TierMark | null): boolean {
  if (a === null || b === null) return a === b;
  return a.level === b.level && a.levelScale === b.levelScale && a.lamp === b.lamp && Boolean(a.other) === Boolean(b.other);
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

/** What the record orders read: the key mode, difficulty system and tier selected. */
export interface SortTier {
  keyMode: KeyModeId;
  system: DifficultySystemId;
  difficulty: string;
  /** The level of the chart Enter plays on a song's selected tier, once known (as its cell shows it). */
  knownLevel?: (song: Song) => number | null;
}

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

/**
 * A song's number in a record order (null: not known, it goes last): the selected tier's level
 * (lowest first: the chart Enter plays once known, else its best play's), lamp and RATE (worst
 * first, the work still to do), the last play (newest first, on any key mode). A song never
 * played on the tier is ordered by its edited and imported charts' records (an imported library
 * by its own charts).
 */
function recordKey(song: Song, sort: SongSort, on: SortTier): number | null {
  if (sort === 'recent') {
    const times = (song.records ?? []).map((r) => r.lastPlayedAt ?? 0).filter((t) => t > 0);
    return times.length > 0 ? -Math.max(...times) : null;
  }
  const known = sort === 'level' ? (on.knownLevel?.(song) ?? null) : null;
  if (known !== null) return known;
  const onTier = recordsOn(song, on.keyMode, on.system).filter((r) => r.difficulty === on.difficulty);
  const records = onTier.length > 0 ? onTier : savedRecordsOn(song, on.keyMode);
  if (records.length === 0) return null;
  if (sort === 'lamp') return Math.max(...records.map((r) => lampRank(r.lamp)));
  if (sort === 'rate') return Math.max(...records.map((r) => r.rate));
  // the level of its best play's chart (a saved chart's as its cell shows it)
  return onTier.length > 0 ? (bestByTier(onTier).get(on.difficulty)?.level ?? null) : (savedMark(records)?.level ?? null);
}

/** The song list in an order of the song select (추가순 is the library's own: newest first). */
export function sortSongs(songs: Song[], sort: SongSort, on: SortTier): Song[] {
  if (sort === 'added') return songs;
  const byTitle = (a: Song, b: Song) => collator.compare(a.title, b.title);
  if (sort === 'title' || sort === 'artist') return [...songs].sort((a, b) => collator.compare(a[sort], b[sort]) || byTitle(a, b));
  const key = (s: Song) => (sort === 'bpm' ? s.bpm : recordKey(s, sort, on)) ?? Infinity;
  const keys = new Map(songs.map((s) => [s.id, key(s)]));
  // songs without the number (not analysed, never played) go last, in title order
  return [...songs].sort((a, b) => (keys.get(a.id) as number) - (keys.get(b.id) as number) || byTitle(a, b));
}
