/**
 * What is dropped on the song select: files and folders, taken apart into files with their paths
 * inside what was dropped, and sorted into what the screen does with them.
 */

/** Chart files and packages (an import). */
export const CHART_FILE = /\.(osz|zip|osu|bms|bme|bml|pms|bmson)$/i;
/** Music the server takes (audio_io.SUPPORTED_EXTENSIONS). */
const AUDIO_FILE = /\.(mp3|ogg|oga|opus|wav|flac|m4a|aac|mp4)$/i;
const REPLAY_FILE = /\.json$/i;

/** A file and its path inside what was dropped: "folder/sub/file" as a picked folder's webkitRelativePath, or its name. */
export interface DroppedFile {
  file: File;
  path: string;
}

/**
 * The files of a dropped entry: the file itself, or every file under a folder. A path is the
 * entry's from the drop without its leading slash, so a folder's start with its name.
 */
export async function entryFiles(entry: FileSystemEntry): Promise<DroppedFile[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    return [{ file, path: entry.fullPath.replace(/^\//, '') }];
  }
  if (!entry.isDirectory) return [];
  // a folder's reader hands its entries over in batches (100 at a time in Chromium) until an empty one
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const files: DroppedFile[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) return files;
    for (const e of batch) files.push(...(await entryFiles(e)));
  }
}

/**
 * What a drop is for: chart files (a folder of them with its keysounds and pictures) are imported
 * whole, else a replay file is watched, else the music is uploaded; null when it holds none of those.
 */
export type Drop = { kind: 'import'; files: DroppedFile[] } | { kind: 'replay'; file: File } | { kind: 'upload'; files: File[] } | null;

export function sortDrop(files: DroppedFile[]): Drop {
  if (files.some((f) => CHART_FILE.test(f.path))) return { kind: 'import', files };
  const replay = files.find((f) => REPLAY_FILE.test(f.path));
  if (replay) return { kind: 'replay', file: replay.file };
  const music = files.filter((f) => AUDIO_FILE.test(f.path)).map((f) => f.file);
  return music.length > 0 ? { kind: 'upload', files: music } : null;
}
