import type { ServerChart, Song } from '../api/client';
import { EditorDoc, type ClipNote } from '../editor/editorModel';

/*
 * The editor's session, apart from the editor (EditorScreen, loaded when it is first opened): the app keeps it
 * while the player test-plays, and starts one from a chart without loading the editor's screen.
 */

/** Everything the editor keeps while the player test-plays and comes back. */
export interface EditorSession {
  song: Song;
  /** The chart the edit started from (its timing, sounds and metadata). */
  base: ServerChart;
  doc: EditorDoc;
  cursorMs: number;
  pxPerMs: number;
  snap: number;
  name: string;
  savedChartId: string | null;
  clipboard: ClipNote[];
}

export function newEditorSession(song: Song, base: ServerChart): EditorSession {
  const doc = new EditorDoc(base, base.meta.lanes.length);
  const first = doc.notes[0]?.t ?? base.timing.offsetMs;
  const label = base.meta.chartName ?? `${base.meta.keyMode} ${base.meta.difficulty}`;
  return {
    song,
    base,
    doc,
    cursorMs: Math.max(0, doc.snap(first, 1) - 500),
    pxPerMs: 0.25,
    snap: 4,
    name: base.meta.source?.kind === 'edited' ? label : `${label} (편집)`,
    savedChartId: base.meta.source?.kind === 'edited' ? base.meta.chartId : null,
    clipboard: [],
  };
}
