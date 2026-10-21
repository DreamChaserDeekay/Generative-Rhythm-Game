/**
 * The pictures a chart package's charts name for their song (BMS #STAGEFILE / #BANNER, the bmson
 * ones, the osu! background), so a folder import sends those and not every picture beside them
 * (a BMS's video frames).
 */

/** A picture's name as it is matched: its file name, lower case, without its extension (BMS names a .bmp shipped as a .png). */
export function pictureStem(path: string): string {
  const name = path.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** The pictures one chart file names (`fileName` tells its kind). */
export function picturesOf(fileName: string, text: string): string[] {
  if (/\.bmson$/i.test(fileName)) {
    try {
      const info = (JSON.parse(text) as { info?: Record<string, unknown> }).info ?? {};
      return ['eyecatch_image', 'banner_image'].map((k) => info[k]).filter((v): v is string => typeof v === 'string' && v !== '');
    } catch {
      return [];
    }
  }
  if (/\.osu$/i.test(fileName)) {
    // the [Events] section only (a timing point at 0 ms looks like a background line)
    const start = text.indexOf('[Events]');
    if (start < 0) return [];
    const end = text.indexOf('\n[', start);
    const background = /^\s*(?:0|Background)\s*,[^,]*,\s*"?([^",\r\n]+)"?/m.exec(text.slice(start, end < 0 ? undefined : end));
    return background ? [background[1].trim()] : [];
  }
  return [...text.matchAll(/^#(?:STAGEFILE|BANNER)[ \t]+(.+?)\s*$/gim)].map((m) => m[1]);
}

/**
 * A chart file's text as it may be written: UTF-8, else (a BMS) Shift_JIS or EUC-KR, both read,
 * as the server tells them apart and here a picture's name in either is enough.
 */
export function chartTexts(bytes: Uint8Array): string[] {
  try {
    return [new TextDecoder('utf-8', { fatal: true }).decode(bytes)];
  } catch {
    return ['shift_jis', 'euc-kr'].map((encoding) => new TextDecoder(encoding).decode(bytes));
  }
}

/** The picture files among `files` that the chart files among them name. */
export async function namedPictures<T extends { file: File; path: string }>(files: T[], isChart: (name: string) => boolean, isPicture: (name: string) => boolean): Promise<T[]> {
  const named = new Set<string>();
  for (const f of files) {
    if (!isChart(f.file.name) || /\.(zip|osz)$/i.test(f.file.name)) continue;
    for (const text of chartTexts(new Uint8Array(await f.file.arrayBuffer()))) {
      for (const name of picturesOf(f.file.name, text)) named.add(pictureStem(name));
    }
  }
  return files.filter((f) => isPicture(f.file.name) && named.has(pictureStem(f.file.name)));
}
