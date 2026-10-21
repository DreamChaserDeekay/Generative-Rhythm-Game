import type { ScoreRecord, Song } from '../api/client';
import { lampOrder, type ClearLamp, type DifficultySystemId } from '../engine/config';
import type { KeyModeId } from '../engine/types';
import type { SongFolder, SongSort } from '../settings/settings';

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

/** The song's bests on a key mode and difficulty system (DJMAX NM is not EZ2ON NM). */
export function recordsOn(song: Song, keyMode: KeyModeId, system: DifficultySystemId): ScoreRecord[] {
  return (song.records ?? []).filter((r) => r.keyMode === keyMode && (r.system ?? 'GRG') === system);
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

const lampRank = (lamp: string) => lampOrder.indexOf(lamp as ClearLamp);

/** The best lamp reached on each tier among `records` (on any of its charts). */
function lampByTier(records: ScoreRecord[]): Map<string, number> {
  const lamps = new Map<string, number>();
  for (const r of records) lamps.set(r.difficulty, Math.max(lamps.get(r.difficulty) ?? -1, lampRank(r.lamp)));
  return lamps;
}

/**
 * Whether a song is in a folder of the song select. 미플레이, 미클리어 and 풀콤 미달 look at the
 * selected key mode and difficulty system only, never at the selected tier, so ←→ never changes
 * the list: 미클리어 has a tier whose every play failed, 풀콤 미달 a tier cleared without MAX COMBO.
 */
export function inFolder(song: Song, folder: SongFolder, keyMode: KeyModeId, system: DifficultySystemId, favorites: ReadonlySet<string>): boolean {
  switch (folder) {
    case 'favorites':
      return favorites.has(song.id);
    case 'unplayed':
      return recordsOn(song, keyMode, system).length === 0;
    case 'uncleared':
      return [...lampByTier(recordsOn(song, keyMode, system)).values()].some((rank) => rank === lampRank('FAILED'));
    case 'noFullCombo':
      return [...lampByTier(recordsOn(song, keyMode, system)).values()].some((rank) => rank > lampRank('FAILED') && rank < lampRank('MAX COMBO'));
    default:
      return true;
  }
}

/** What the record orders read: the key mode, difficulty system and tier selected. */
export interface SortTier {
  keyMode: KeyModeId;
  system: DifficultySystemId;
  difficulty: string;
}

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

/**
 * A song's number in a record order (null: not known, it goes last): the selected tier's level
 * (lowest first), lamp and RATE (worst first, the work still to do), the last play (newest first,
 * on any key mode).
 */
function recordKey(song: Song, sort: SongSort, on: SortTier): number | null {
  if (sort === 'recent') {
    const times = (song.records ?? []).map((r) => r.lastPlayedAt ?? 0).filter((t) => t > 0);
    return times.length > 0 ? -Math.max(...times) : null;
  }
  const records = recordsOn(song, on.keyMode, on.system).filter((r) => r.difficulty === on.difficulty);
  if (records.length === 0) return null;
  if (sort === 'lamp') return Math.max(...records.map((r) => lampRank(r.lamp)));
  if (sort === 'rate') return Math.max(...records.map((r) => r.rate));
  // the level of its best play's chart
  return bestByTier(records).get(on.difficulty)?.level ?? null;
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
