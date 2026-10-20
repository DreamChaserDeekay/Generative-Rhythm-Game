import type { ScoreRecord, Song } from '../api/client';
import type { DifficultySystemId } from '../engine/config';
import type { KeyModeId } from '../engine/types';
import type { SongFolder, SongSort } from '../settings/settings';

export const FOLDER_LABELS: Record<SongFolder, string> = { all: '전체', favorites: '즐겨찾기', unplayed: '미플레이', uncleared: '미클리어' };
export const SORT_LABELS: Record<SongSort, string> = { added: '추가순', title: '제목순', artist: '아티스트순', bpm: 'BPM순' };

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

/** Some tier was played and every play of it failed. */
function hasUncleared(records: ScoreRecord[]): boolean {
  const cleared = new Map<string, boolean>();
  for (const r of records) cleared.set(r.difficulty, (cleared.get(r.difficulty) ?? false) || r.lamp !== 'FAILED');
  return [...cleared.values()].some((c) => !c);
}

/**
 * Whether a song is in a folder of the song select. 미플레이 and 미클리어 look at the selected key
 * mode and difficulty system only, never at the selected tier, so ←→ never changes the list.
 */
export function inFolder(song: Song, folder: SongFolder, keyMode: KeyModeId, system: DifficultySystemId, favorites: ReadonlySet<string>): boolean {
  switch (folder) {
    case 'favorites':
      return favorites.has(song.id);
    case 'unplayed':
      return recordsOn(song, keyMode, system).length === 0;
    case 'uncleared':
      return hasUncleared(recordsOn(song, keyMode, system));
    default:
      return true;
  }
}

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

/** The song list in an order of the song select (추가순 is the library's own: newest first). */
export function sortSongs(songs: Song[], sort: SongSort): Song[] {
  if (sort === 'added') return songs;
  const sorted = [...songs];
  if (sort === 'bpm') sorted.sort((a, b) => (a.bpm ?? Infinity) - (b.bpm ?? Infinity) || collator.compare(a.title, b.title));
  else sorted.sort((a, b) => collator.compare(a[sort], b[sort]) || collator.compare(a.title, b.title));
  return sorted;
}
