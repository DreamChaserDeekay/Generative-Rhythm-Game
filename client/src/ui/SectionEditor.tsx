import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { api, type AnalysisResult, type SectionEdit, type SectionLabel, type SongSections } from '../api/client';
import { PREVIEW_VOLUME, menuMusic } from '../audio/songPreview';
import { TempoMap } from '../engine/tempo';
import type { ChartSection } from '../engine/types';
import { SECTION_LABEL_ORDER, groupToken, sectionLabel } from './sections';
import { canvasFont, token } from './theme';

const GROUPS = 'ABCDEFGH'.split('');
const ZOOM_MS = 6000; // the close-up shows this much either side of the play position
const PRE_ROLL_MS = 2000; // a section is played from this much before its start
const SEEK_MS = 3000;

export interface Row {
  /** First bar of the section, counted from 1 at the first downbeat. */
  bar: number;
  label: SectionLabel;
  group: string;
}

function toRows(sections: ChartSection[], bpb: number): Row[] {
  return sections.map((s) => ({
    bar: Math.round(s.startBeat / bpb) + 1,
    label: (SECTION_LABEL_ORDER.includes(s.label as SectionLabel) ? s.label : 'verse') as SectionLabel,
    group: s.group && GROUPS.includes(s.group) ? s.group : 'A',
  }));
}

/** Bars must rise from one section to the next (the first section starts with the song). */
export function sectionRowsValid(rows: { bar: number }[]): boolean {
  return rows.length > 0 && rows.every((r, i) => i === 0 || (Number.isInteger(r.bar) && r.bar >= 2 && r.bar > rows[i - 1].bar));
}

function unusedGroup(rows: Row[]): string {
  return GROUPS.find((g) => !rows.some((r) => r.group === g)) ?? 'A';
}

/** The bar (counted from 1 at the first downbeat) whose line is nearest `ms`. */
export function barAt(tempo: TempoMap, ms: number, bpb: number): number {
  return Math.round(tempo.msToBeat(ms) / bpb) + 1;
}

/** The rows with a section starting at `bar` and that row's index: the row already there, or a new
 * one (the label of the section it splits, a group of its own). Bar 1 and earlier is the first row. */
export function withBoundary(rows: Row[], bar: number): { rows: Row[]; index: number } {
  if (bar < 2) return { rows, index: 0 };
  const at = rows.findIndex((r) => r.bar === bar);
  if (at >= 0) return { rows, index: at };
  const after = rows.findIndex((r, i) => i > 0 && r.bar > bar);
  const index = after < 0 ? rows.length : after;
  return { rows: [...rows.slice(0, index), { bar, label: rows[index - 1].label, group: unusedGroup(rows) }, ...rows.slice(index)], index };
}

function clock(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

/**
 * The song's sections as a list the user can correct: where each starts, what it is and its
 * repetition group (the same letter = the same music, which gets the same patterns). The song plays
 * over its waveform, so a boundary can be set where the music changes (M) and checked by playing
 * the section from just before it. Charts made after saving use them; "분석값으로" goes back to the
 * analysed sections.
 */
export function SectionEditor({ songId, onSaved, onClose }: { songId: string; onSaved: () => void | Promise<void>; onClose: () => void }) {
  const [data, setData] = useState<SongSections | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const player = useRef<HTMLDivElement>(null);
  const overview = useRef<HTMLCanvasElement>(null);
  const zoom = useRef<HTMLCanvasElement>(null);
  const position = useRef<HTMLSpanElement>(null);
  const draw = useRef(() => {});

  useEffect(() => {
    let alive = true;
    setData(null);
    setAnalysis(null);
    api
      .sections(songId)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setRows(toRows(d.sections, d.beatsPerBar));
      })
      .catch((e: Error) => alive && setError(e.message));
    // the beats and the waveform to play along; without them the list still edits
    api
      .analysis(songId)
      .then((a) => alive && setAnalysis(a))
      .catch(() => undefined);
    return () => {
      alive = false;
      audio.current?.pause();
      audio.current = null;
      setPlaying(false);
    };
  }, [songId]);

  useEffect(() => {
    if (!playing) return;
    let id = requestAnimationFrame(function frame() {
      draw.current();
      id = requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(id);
  }, [playing]);
  useEffect(() => draw.current());
  useEffect(() => {
    const redraw = () => draw.current();
    window.addEventListener('resize', redraw);
    return () => window.removeEventListener('resize', redraw);
  }, []);

  if (!data) return error ? <p className="hint">{error}</p> : null;
  const bpb = data.beatsPerBar;
  const valid = sectionRowsValid(rows);
  const sel = Math.min(selected, rows.length - 1);
  const update = (i: number, change: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...change } : r)));
  const tempo = analysis ? new TempoMap(analysis.timing) : null;
  const durationMs = analysis?.durationMs ?? 0;
  const rowMs = (i: number) => (i === 0 || !tempo ? 0 : tempo.beatToMs((rows[i].bar - 1) * bpb));
  const nowMs = () => (audio.current?.currentTime ?? 0) * 1000;

  const sound = (): HTMLAudioElement => {
    if (!audio.current) {
      const a = new Audio(api.audioUrl(songId));
      a.volume = PREVIEW_VOLUME;
      a.addEventListener('play', () => setPlaying(true));
      a.addEventListener('pause', () => setPlaying(false));
      a.addEventListener('seeked', () => draw.current());
      audio.current = a;
    }
    return audio.current;
  };
  const seek = (ms: number) => {
    sound().currentTime = Math.min(Math.max(ms, 0), durationMs) / 1000;
    draw.current();
  };
  const play = () => {
    menuMusic.stop(); // the song select's preview would play over it
    void sound().play();
  };
  const toggle = () => (sound().paused ? play() : sound().pause());
  const playFrom = (i: number) => {
    setSelected(i);
    seek(rowMs(i) - PRE_ROLL_MS);
    play();
    player.current?.focus();
  };
  const addHere = () => {
    if (!tempo) return;
    const next = withBoundary(rows, barAt(tempo, nowMs(), bpb));
    setRows(next.rows);
    setSelected(next.index);
  };
  const moveHere = () => {
    const bar = tempo ? barAt(tempo, nowMs(), bpb) : 0;
    if (sel > 0 && bar >= 2) update(sel, { bar });
  };
  // keys while the waveform has focus; they stay here (the song select would play on Enter)
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey) return;
    const keys: Record<string, () => void> = {
      Space: toggle,
      KeyM: addHere,
      KeyN: moveHere,
      Enter: () => playFrom(sel),
      ArrowLeft: () => seek(nowMs() - SEEK_MS),
      ArrowRight: () => seek(nowMs() + SEEK_MS),
      ArrowUp: () => setSelected(Math.max(0, sel - 1)),
      ArrowDown: () => setSelected(Math.min(rows.length - 1, sel + 1)),
    };
    const run = keys[e.code];
    if (!run) return;
    e.preventDefault();
    e.stopPropagation();
    run();
  };
  const onWave = (from: (now: number) => number, to: (now: number) => number) => (e: MouseEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const now = nowMs();
    seek(from(now) + ((e.clientX - box.left) / box.width) * (to(now) - from(now)));
    player.current?.focus();
  };

  draw.current = () => {
    if (!analysis || !tempo) return;
    const now = nowMs();
    if (position.current) position.current.textContent = `${clock(now)} · ${Math.max(1, barAt(tempo, now, bpb))}마디`;
    const lane = (canvas: HTMLCanvasElement | null, t0: number, t1: number, beats: boolean) => {
      const w = canvas?.clientWidth ?? 0;
      const h = canvas?.clientHeight ?? 0;
      if (!canvas || w === 0) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      ctx.scale(dpr, dpr);
      const x = (ms: number) => ((ms - t0) / (t1 - t0)) * w;
      rows.forEach((r, i) => {
        const a = rowMs(i);
        const b = i + 1 < rows.length ? rowMs(i + 1) : durationMs;
        ctx.globalAlpha = i === sel ? 0.45 : 0.22;
        ctx.fillStyle = token(groupToken(r.group));
        ctx.fillRect(x(a), 0, x(b) - x(a), h);
      });
      const { frameMs, peaks } = analysis.waveform;
      const first = Math.max(0, Math.floor(t0 / frameMs));
      const last = Math.min(peaks.length, Math.ceil(t1 / frameMs));
      const step = Math.max(1, Math.floor((last - first) / w));
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = token('--text-dim');
      for (let k = first; k < last; k += step) {
        const p = Math.max(...peaks.slice(k, k + step));
        ctx.fillRect(x(k * frameMs), h / 2 - p * (h / 2 - 2), Math.max(1, x((k + step) * frameMs) - x(k * frameMs)), 2 * p * (h / 2 - 2));
      }
      if (beats) {
        for (const b of analysis.beats) {
          if (b.t < t0 || b.t > t1) continue;
          ctx.globalAlpha = b.isDownbeat ? 0.8 : 0.15;
          ctx.fillStyle = token(b.isDownbeat ? '--accent' : '--text');
          ctx.fillRect(x(b.t), 0, 1, h);
        }
      }
      ctx.globalAlpha = 1;
      ctx.font = canvasFont(700, '--fs-label');
      ctx.textBaseline = 'top';
      rows.forEach((r, i) => {
        const at = x(rowMs(i));
        if (at < -200 || at > w) return;
        ctx.fillStyle = token('--text');
        if (i > 0) ctx.fillRect(at - (i === sel ? 1 : 0.5), 0, i === sel ? 3 : 2, h);
        ctx.fillText(`${sectionLabel(r.label)} ${r.group}`, at + 4, 2);
      });
      ctx.fillStyle = token('--g-break');
      ctx.fillRect(x(now) - 1, 0, 2, h);
    };
    lane(overview.current, 0, durationMs, false);
    lane(zoom.current, now - ZOOM_MS, now + ZOOM_MS, true);
  };

  const save = async (edits: SectionEdit[]) => {
    setSaving(true);
    setError(null);
    try {
      await api.patchSong(songId, { sections: edits });
      const d = await api.sections(songId);
      setData(d);
      setRows(toRows(d.sections, d.beatsPerBar));
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const first = data.sections[0]?.startBeat ?? 0;
  const edits = (): SectionEdit[] =>
    rows.map((r, i) => ({ startBeat: i === 0 ? Math.min(first, 0) : (r.bar - 1) * bpb, label: r.label, group: r.group }));
  const keepFocus = (e: MouseEvent) => e.preventDefault(); // the toolbar's buttons leave the keys with the waveform

  return (
    <div className="section-editor" data-testid="section-editor">
      {analysis && (
        <div className="section-player" tabIndex={0} ref={player} onKeyDown={onKey} data-testid="section-player">
          <div className="row">
            <button className="small" onMouseDown={keepFocus} onClick={toggle} data-testid="section-play">
              {playing ? '멈춤' : '재생'}
            </button>
            <span className="value" ref={position} data-testid="section-position" />
            <button className="small" onMouseDown={keepFocus} onClick={addHere} data-testid="section-add-here">
              여기에 경계 (M)
            </button>
            <button className="small" onMouseDown={keepFocus} onClick={moveHere} disabled={sel <= 0}>
              고른 경계를 여기로 (N)
            </button>
          </div>
          <canvas className="section-wave" ref={overview} onClick={onWave(() => 0, () => durationMs)} />
          <canvas className="section-wave zoom" ref={zoom} onClick={onWave((n) => n - ZOOM_MS, (n) => n + ZOOM_MS)} />
        </div>
      )}
      {rows.map((r, i) => (
        <div className={`row section-row${i === sel ? ' selected' : ''}`} key={i} data-testid="section-row" onClick={() => setSelected(i)}>
          <span className="section-swatch" style={{ background: `var(${groupToken(r.group)})` }} />
          {i === 0 ? (
            <span className="value section-start">1마디</span>
          ) : (
            <label className="section-start">
              <input type="number" min={2} value={r.bar} aria-label="시작 마디" onChange={(e) => update(i, { bar: Math.round(Number(e.target.value)) })} />
              마디
            </label>
          )}
          <select value={r.label} aria-label="구간" onChange={(e) => update(i, { label: e.target.value as SectionLabel })}>
            {SECTION_LABEL_ORDER.map((l) => (
              <option key={l} value={l}>
                {sectionLabel(l)}
              </option>
            ))}
          </select>
          <select value={r.group} aria-label="반복 묶음" onChange={(e) => update(i, { group: e.target.value })}>
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          {analysis && (
            <button className="small" aria-label="2초 앞부터 재생" onClick={() => playFrom(i)}>
              ▶
            </button>
          )}
          {i > 0 && (
            <button className="small" onClick={() => setRows(rows.filter((_, k) => k !== i))}>
              빼기
            </button>
          )}
        </div>
      ))}
      <div className="row">
        <button
          className="small"
          onClick={() => {
            const last = rows[rows.length - 1];
            setRows([...rows, { bar: Math.max(2, (last?.bar ?? 1) + 8), label: 'verse', group: unusedGroup(rows) }]);
          }}
        >
          구간 추가
        </button>
        <button className="small" data-testid="save-sections" disabled={!valid || saving} onClick={() => void save(edits())}>
          저장
        </button>
        {data.edited && (
          <button className="small" data-testid="reset-sections" disabled={saving} onClick={() => void save([])}>
            분석값으로
          </button>
        )}
        <button className="small" onClick={onClose}>
          닫기
        </button>
      </div>
      <p className="hint">
        같은 글자의 구간은 같은 음악으로 보고 같은 패턴을 씁니다. 마디는 첫 다운비트부터 셉니다. 저장하면 채보를 다시 만듭니다.
        {analysis && ' 파형을 누르면 그 자리로 갑니다. 파형을 누른 뒤 Space 재생 · M 지금 마디에 경계 · N 고른 경계를 지금 마디로 · Enter 고른 구간을 2초 앞부터 · ←→ 3초 · ↑↓ 구간 고르기.'}
        {!valid && ' 시작 마디는 앞 구간보다 뒤여야 합니다.'}
      </p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
