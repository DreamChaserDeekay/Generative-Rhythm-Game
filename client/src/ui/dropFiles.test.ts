import { describe, expect, it } from 'vitest';
import { entryFiles, sortDrop, type DroppedFile } from './dropFiles';

/** A file entry as a browser hands a dropped one (only what entryFiles reads). */
function fileEntry(fullPath: string): FileSystemEntry {
  const file = new File(['x'], fullPath.split('/').pop() as string);
  return { isFile: true, isDirectory: false, fullPath, file: (ok: (f: File) => void) => ok(file) } as unknown as FileSystemEntry;
}

/** A folder entry whose reader hands its entries over in the batches given, then an empty one. */
function folderEntry(fullPath: string, batches: FileSystemEntry[][]): FileSystemEntry {
  return {
    isFile: false,
    isDirectory: true,
    fullPath,
    createReader: () => {
      let at = 0;
      return { readEntries: (ok: (e: FileSystemEntry[]) => void) => ok(batches[at++] ?? []) };
    },
  } as unknown as FileSystemEntry;
}

const dropped = (...paths: string[]): DroppedFile[] => paths.map((path) => ({ file: new File(['x'], path.split('/').pop() as string), path }));

describe('entryFiles', () => {
  it('walks a folder through every batch and its sub-folders, paths from the folder dropped', async () => {
    const pack = folderEntry('/E2E Pack', [
      [fileEntry('/E2E Pack/song.bms'), folderEntry('/E2E Pack/keys', [[fileEntry('/E2E Pack/keys/kick.wav')]])],
      [fileEntry('/E2E Pack/stage.png')],
    ]);
    const files = await entryFiles(pack);
    expect(files.map((f) => f.path)).toEqual(['E2E Pack/song.bms', 'E2E Pack/keys/kick.wav', 'E2E Pack/stage.png']);
    expect(files[1].file.name).toBe('kick.wav');
  });

  it('gives a file dropped alone its name', async () => {
    expect((await entryFiles(fileEntry('/play.grgreplay.json'))).map((f) => f.path)).toEqual(['play.grgreplay.json']);
  });
});

describe('sortDrop', () => {
  it('imports everything when a chart is among the files (its keysounds and pictures go with it)', () => {
    const files = dropped('Pack/a.bms', 'Pack/kick.wav', 'Pack/stage.png');
    expect(sortDrop(files)).toEqual({ kind: 'import', files });
  });

  it('watches a replay file, uploads the music alone, and takes nothing else', () => {
    const replay = dropped('play.grgreplay.json');
    expect(sortDrop(replay)).toEqual({ kind: 'replay', file: replay[0].file });
    const music = dropped('a.MP3', 'cover.png', 'b.flac');
    expect(sortDrop(music)).toEqual({ kind: 'upload', files: [music[0].file, music[2].file] });
    expect(sortDrop(dropped('notes.txt', 'clip.webm'))).toBe(null);
    expect(sortDrop([])).toBe(null);
  });
});
