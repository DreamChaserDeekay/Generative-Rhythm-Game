import { useCallback, useEffect, useReducer, useRef, useState, type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { api, type ServerChart, type Song } from '../api/client';
import { getAudioEngine } from '../audio/AudioEngine';
import { keysoundBank, keysoundBgm, songBuffer } from '../audio/bufferCache';
import { KeysoundVoices } from '../audio/keysounds';
import { EditorDoc, SNAP_DIVISIONS, type ClipNote, type EditNote } from '../editor/editorModel';
import { EditorView, formatMs, type EditorViewState } from '../editor/EditorView';
import { keyModes } from '../engine/config';
import type { Chart } from '../engine/types';
import { laneColorsFor, skinById } from '../render/skins';
import { bindingsFor, type Settings } from '../settings/settings';

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

interface Props {
  session: EditorSession;
  settings: Settings;
  onExit: () => void;
  onTestPlay: (chart: Chart, startMs: number) => void;
  onSaved: (chart: ServerChart) => void;
}

type Drag =
  | { kind: 'create'; lane: number; t: number; endT: number }
  | { kind: 'move'; startLane: number; startBeat: number; laneDelta: number; steps: number; ids: number[] }
  | { kind: 'resize'; id: number; t: number; endT: number }
  | { kind: 'box'; x0: number; y0: number; x1: number; y1: number; additive: boolean };

const MIN_ZOOM = 0.04;
const MAX_ZOOM = 2;
const ZOOM_STEP = 1.2;
const KEYSOUND_LOOKAHEAD_MS = 120;
const SNAP_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'];
const TOAST_MS = 2600;

/** Note value of a snap division in 4/4 terms (4 steps per beat = 1/16). */
function snapLabel(d: number): string {
  return `1/${d * 4}`;
}

export function EditorScreen({ session, settings, onExit, onTestPlay, onSaved }: Props) {
  const { doc, base, song } = session;
  const mode = keyModes[base.meta.keyMode];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const selection = useRef(new Set<number>());
  const drag = useRef<Drag | null>(null);
  const ghost = useRef<EditorViewState['ghost']>(null);
  const waveform = useRef<EditorViewState['waveform']>(null);
  const audio = useRef<{ buffer: AudioBuffer | null; voices: KeysoundVoices | null }>({ buffer: null, voices: null });
  const playback = useRef<{ raf: number; lastMs: number; scheduledUntil: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [record, setRecord] = useState(false);
  const [hitSounds, setHitSounds] = useState(true);
  const [toast, setToast] = useState<{ text: string; at: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const hitSoundsRef = useRef(hitSounds);
  hitSoundsRef.current = hitSounds;

  const keyLanes = mode.lanes.map((l, i) => (l.kind === 'key' ? i : -1)).filter((i) => i >= 0);
  const narrow = new Set(mode.lanes.map((l, i) => (l.kind !== 'key' ? i : -1)).filter((i) => i >= 0));
  const laneColors = laneColorsFor(skinById(settings.skin, settings.customSkin), settings.palette, mode).map((c) => `#${c.toString(16).padStart(6, '0')}`);
  const durationMs = Math.max(base.meta.durationMs ?? 0, song.durationMs);

  const say = useCallback((text: string) => setToast({ text, at: performance.now() }), []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  const viewState = useCallback(
    (): EditorViewState => {
      const d = drag.current;
      let dragPreview: EditNote[] | null = null;
      if (d?.kind === 'move' && (d.laneDelta !== 0 || d.steps !== 0)) {
        const ids = new Set(d.ids);
        dragPreview = doc.notes
          .filter((n) => ids.has(n.id))
          .map((n) => ({
            ...n,
            lane: n.lane + d.laneDelta,
            t: d.steps ? doc.step(n.t, d.steps, session.snap) : n.t,
            endT: n.endT === undefined ? undefined : d.steps ? doc.step(n.endT, d.steps, session.snap) : n.endT,
          }));
      }
      let g = ghost.current;
      if (d?.kind === 'create') g = { lane: d.lane, t: d.t, endT: d.endT > d.t ? d.endT : undefined };
      if (d?.kind === 'resize') {
        const n = doc.notes.find((x) => x.id === d.id);
        if (n) dragPreview = [{ ...n, type: d.endT > n.t ? 'hold' : 'tap', endT: d.endT > n.t ? d.endT : undefined }];
      }
      return {
        doc,
        cursorMs: session.cursorMs,
        pxPerMs: session.pxPerMs,
        snap: session.snap,
        selection: selection.current,
        laneColors,
        narrowLanes: narrow,
        waveform: waveform.current,
        durationMs,
        ghost: g,
        dragPreview,
        box: d?.kind === 'box' ? d : null,
      };
    },
    // laneColors / narrow are derived from props that do not change while the editor is open
    [doc, session, durationMs],
  );

  const draw = useCallback(() => {
    const view = viewRef.current;
    if (view) view.draw(viewState());
  }, [viewState]);

  const redraw = useCallback(() => {
    requestAnimationFrame(draw);
  }, [draw]);

  // canvas, resize and the waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const view = new EditorView(canvas);
    viewRef.current = view;
    view.layout(mode.lanes.length, narrow);
    draw();
    const observer = new ResizeObserver(() => {
      view.layout(mode.lanes.length, narrow);
      draw();
    });
    observer.observe(canvas);
    let alive = true;
    if (song.status === 'ready') {
      api
        .analysis(song.id)
        .then((a) => {
          if (!alive) return;
          const max = Math.max(1e-6, ...a.waveform.peaks);
          waveform.current = { frameMs: a.waveform.frameMs, peaks: a.waveform.peaks.map((p) => p / max) };
          draw();
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
      observer.disconnect();
      viewRef.current = null;
    };
    // the canvas lives as long as the screen
  }, []);

  // audio for playback (the song, or the rendered background of a keysound chart)
  useEffect(() => {
    let alive = true;
    const keysounded = (base.sounds?.length ?? 0) > 0;
    (async () => {
      try {
        const buffer = keysounded ? await keysoundBgm(song.id, base) : await songBuffer(song.id);
        let voices: KeysoundVoices | null = null;
        if (keysounded && base.sounds) {
          const bank = await keysoundBank(song.id);
          const engine = getAudioEngine();
          engine.keysoundBus.gain.value = bank.gain;
          voices = new KeysoundVoices(engine.ctx, engine.keysoundBus, bank, base.sounds);
        }
        if (alive) {
          audio.current = { buffer, voices };
          setAudioReady(true);
        }
      } catch {
        if (alive) say('음원을 불러오지 못했습니다 (재생 없이 편집할 수 있습니다)');
      }
    })();
    return () => {
      alive = false;
    };
  }, [base, song.id, say]);

  const stop = useCallback(() => {
    const p = playback.current;
    if (!p) return;
    cancelAnimationFrame(p.raf);
    playback.current = null;
    getAudioEngine().stop();
    audio.current.voices?.stopAll();
    setPlaying(false);
    redraw();
  }, [redraw]);

  const play = useCallback(async () => {
    if (playback.current || !audio.current.buffer) return;
    const engine = getAudioEngine();
    await engine.unlock();
    engine.setBuffer(audio.current.buffer, { originMs: 0, rate: 1 });
    engine.setMusicVolume(settings.musicVolume);
    engine.setSfxVolume(settings.sfxVolume);
    engine.start(session.cursorMs, 0);
    const p = { raf: 0, lastMs: session.cursorMs, scheduledUntil: session.cursorMs };
    playback.current = p;
    setPlaying(true);
    const tick = () => {
      engine.clock.sample();
      const now = engine.songTimeAtPerf(performance.now());
      session.cursorMs = now;
      const voices = audio.current.voices;
      if (voices) {
        const horizon = now + KEYSOUND_LOOKAHEAD_MS;
        for (const n of doc.notes) if (n.t > p.scheduledUntil && n.t <= horizon) voices.play(n, engine.contextTimeForSong(n.t));
        p.scheduledUntil = Math.max(p.scheduledUntil, horizon);
      } else if (hitSoundsRef.current && doc.notes.some((n) => n.t > p.lastMs && n.t <= now)) {
        engine.playHitSound();
      }
      p.lastMs = now;
      draw();
      if (now > durationMs + 500) {
        stop();
        return;
      }
      p.raf = requestAnimationFrame(tick);
    };
    p.raf = requestAnimationFrame(tick);
  }, [doc, draw, durationMs, session, settings.musicVolume, settings.sfxVolume, stop]);

  useEffect(() => () => stop(), [stop]);

  const changed = useCallback(() => {
    rerender();
    redraw();
  }, [redraw]);

  const apply = useCallback(
    (result: { ok: boolean; reason?: string }) => {
      if (!result.ok && result.reason) say(result.reason);
      changed();
      return result.ok;
    },
    [changed, say],
  );

  const setCursor = useCallback(
    (ms: number) => {
      session.cursorMs = Math.min(durationMs + 2000, Math.max(-2000, ms));
      if (playback.current) {
        stop();
      }
      changed();
    },
    [changed, durationMs, session, stop],
  );

  const save = useCallback(async () => {
    if (saving) return;
    if (doc.notes.length === 0) {
      say('노트가 없습니다');
      return;
    }
    setSaving(true);
    try {
      const chart = await api.saveEditedChart(song.id, base.meta.chartId, doc.toChartNotes(), session.name);
      session.savedChartId = chart.meta.chartId;
      doc.dirty = false;
      say(`저장했습니다 · Lv.${chart.meta.level} · 노트 ${chart.meta.noteCount}`);
      onSaved(chart);
    } catch (e) {
      say(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
      rerender();
    }
  }, [base.meta.chartId, doc, onSaved, saving, say, session, song.id]);

  const testPlay = useCallback(() => {
    stop();
    const notes = doc.toChartNotes();
    if (notes.length === 0) {
      say('노트가 없습니다');
      return;
    }
    const start = Math.max(0, doc.snap(session.cursorMs, session.snap));
    if (!notes.some((n) => n.t >= start)) {
      say('커서 뒤에 노트가 없습니다');
      return;
    }
    onTestPlay({ ...base, notes }, start);
  }, [base, doc, onTestPlay, say, session, stop]);

  const exit = useCallback(() => {
    if (doc.dirty && !window.confirm('저장하지 않은 변경이 있습니다. 편집을 끝낼까요?')) return;
    stop();
    onExit();
  }, [doc, onExit, stop]);

  const mirror = useCallback(() => {
    const ids = selection.current.size > 0 ? [...selection.current] : doc.notes.map((n) => n.id);
    apply(doc.mirror(ids, keyLanes));
    // keyLanes is derived from the key mode, fixed for this editor
  }, [apply, doc]);

  // ---------------------------------------------------------------- mouse

  const local = (e: { clientX: number; clientY: number }) => {
    const rect = (canvasRef.current as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onMouseDown = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const view = viewRef.current;
    if (!view || e.button !== 0) return;
    const { x, y } = local(e);
    const state = viewState();
    const hit = view.hitNote(x, y, state);
    const lane = view.laneAt(x);
    if (hit) {
      const id = hit.note.id;
      if (hit.part === 'end' && hit.note.endT !== undefined) {
        drag.current = { kind: 'resize', id, t: hit.note.t, endT: hit.note.endT };
      } else {
        if (e.shiftKey) {
          if (selection.current.has(id)) selection.current.delete(id);
          else selection.current.add(id);
        } else if (!selection.current.has(id)) {
          selection.current = new Set([id]);
        }
        drag.current = { kind: 'move', startLane: lane, startBeat: doc.tempo.msToBeat(view.timeAt(y, state)), laneDelta: 0, steps: 0, ids: [...selection.current] };
      }
    } else if (e.shiftKey || lane < 0) {
      drag.current = { kind: 'box', x0: x, y0: y, x1: x, y1: y, additive: e.ctrlKey || e.metaKey };
    } else {
      selection.current = new Set();
      const t = doc.snap(view.timeAt(y, state), session.snap);
      drag.current = { kind: 'create', lane, t, endT: t };
    }
    changed();
  };

  const onMouseMove = (e: ReactMouseEvent<HTMLCanvasElement> | MouseEvent) => {
    const view = viewRef.current;
    if (!view || !canvasRef.current) return;
    const { x, y } = local(e);
    const state = viewState();
    const d = drag.current;
    const t = view.timeAt(y, state);
    if (!d) {
      const lane = view.laneAt(x);
      const hit = view.hitNote(x, y, state);
      ghost.current = lane >= 0 && !hit ? { lane, t: doc.snap(t, session.snap) } : null;
      canvasRef.current.style.cursor = hit ? (hit.part === 'end' ? 'ns-resize' : 'grab') : lane >= 0 ? 'crosshair' : 'default';
    } else if (d.kind === 'create') {
      d.endT = Math.max(d.t, doc.snap(t, session.snap));
    } else if (d.kind === 'move') {
      const lane = view.laneAt(x);
      if (lane >= 0 && d.startLane >= 0) d.laneDelta = lane - d.startLane;
      d.steps = Math.round((doc.tempo.msToBeat(t) - d.startBeat) * session.snap);
    } else if (d.kind === 'resize') {
      d.endT = doc.snap(t, session.snap);
    } else if (d.kind === 'box') {
      d.x1 = x;
      d.y1 = y;
    }
    redraw();
  };

  const onMouseUp = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === 'create') {
      apply(d.endT > d.t ? doc.add(d.lane, d.t, d.endT) : doc.add(d.lane, d.t));
    } else if (d.kind === 'move') {
      if (d.laneDelta !== 0 || d.steps !== 0) apply(doc.move(d.ids, d.laneDelta, d.steps, session.snap));
      else changed();
    } else if (d.kind === 'resize') {
      apply(doc.setEnd(d.id, d.endT > d.t ? d.endT : undefined));
    } else if (d.kind === 'box') {
      const view = viewRef.current;
      const ids = view ? view.notesInBox(d, viewState()) : [];
      selection.current = d.additive ? new Set([...selection.current, ...ids]) : new Set(ids);
      changed();
    }
  }, [apply, changed, doc, session, viewState]);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (drag.current) onMouseMove(e);
    };
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', move);
    return () => {
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', move);
    };
  });

  const onContextMenu = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const view = viewRef.current;
    if (!view) return;
    const { x, y } = local(e);
    const hit = view.hitNote(x, y, viewState());
    if (!hit) return;
    const ids = selection.current.has(hit.note.id) && selection.current.size > 1 ? [...selection.current] : [hit.note.id];
    for (const id of ids) selection.current.delete(id);
    apply(doc.remove(ids));
  };

  const onWheel = (e: ReactWheelEvent<HTMLCanvasElement>) => {
    if (e.ctrlKey || e.metaKey) {
      session.pxPerMs = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, session.pxPerMs * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)));
      changed();
    } else if (!playback.current) {
      setCursor(session.cursorMs - e.deltaY / session.pxPerMs);
    }
  };

  // ---------------------------------------------------------------- keyboard

  const bindings = bindingsFor(settings, base.meta.keyMode);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const sel = [...selection.current];
      const lane = bindings.indexOf(e.code);
      if (record && playback.current && lane >= 0 && !ctrl) {
        e.preventDefault();
        if (!e.repeat) apply(doc.add(lane, doc.snap(session.cursorMs, session.snap)));
        return;
      }
      if (ctrl && e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) doc.redo();
        else doc.undo();
        selection.current = new Set();
        changed();
      } else if (ctrl && e.code === 'KeyY') {
        e.preventDefault();
        doc.redo();
        changed();
      } else if (ctrl && (e.code === 'KeyC' || e.code === 'KeyX')) {
        e.preventDefault();
        session.clipboard = doc.copy(sel);
        if (e.code === 'KeyX' && sel.length > 0) {
          selection.current = new Set();
          apply(doc.remove(sel));
        }
        say(`노트 ${session.clipboard.length}개를 복사했습니다`);
      } else if (ctrl && e.code === 'KeyV') {
        e.preventDefault();
        const r = doc.paste(session.clipboard, doc.snap(session.cursorMs, session.snap));
        if (r.ok && r.ids) selection.current = new Set(r.ids);
        apply(r);
      } else if (ctrl && e.code === 'KeyA') {
        e.preventDefault();
        selection.current = new Set(doc.notes.map((n) => n.id));
        changed();
      } else if (ctrl && e.code === 'KeyS') {
        e.preventDefault();
        void save();
      } else if (e.code === 'Space' || e.code === 'KeyP') {
        e.preventDefault();
        if (playback.current) stop();
        else void play();
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        e.preventDefault();
        if (sel.length > 0) {
          selection.current = new Set();
          apply(doc.remove(sel));
        }
      } else if (e.code === 'KeyM' && !ctrl) {
        mirror();
      } else if (e.code === 'KeyT' && !ctrl) {
        testPlay();
      } else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault();
        const dir = e.code === 'ArrowUp' ? 1 : -1;
        if (e.altKey && sel.length > 0) apply(doc.move(sel, 0, dir, session.snap));
        else setCursor(doc.step(session.cursorMs, dir * (e.shiftKey ? session.snap * 4 : 1), session.snap));
      } else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && sel.length > 0) {
        e.preventDefault();
        apply(doc.move(sel, e.code === 'ArrowRight' ? 1 : -1, 0, session.snap));
      } else if (SNAP_KEYS.includes(e.code) && !ctrl) {
        session.snap = SNAP_DIVISIONS[SNAP_KEYS.indexOf(e.code)];
        changed();
      } else if (e.code === 'Home') {
        setCursor(0);
      } else if (e.code === 'End') {
        setCursor(doc.notes.length > 0 ? doc.notes[doc.notes.length - 1].t : 0);
      } else if (e.code === 'Escape') {
        if (selection.current.size > 0) {
          selection.current = new Set();
          changed();
        } else {
          exit();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const tempo = doc.tempo;
  const bars = session.cursorMs >= base.timing.offsetMs ? tempo.barLines(session.cursorMs) : [];
  const position =
    bars.length > 0
      ? `${bars.length}마디 ${(tempo.msToBeat(session.cursorMs) - tempo.msToBeat(bars[bars.length - 1]) + 1).toFixed(2)}박`
      : '첫 마디 전';

  return (
    <div className="editor-screen" data-testid="editor-screen">
      <header className="editor-toolbar">
        <button data-testid="editor-exit" onClick={exit}>
          ← 나가기
        </button>
        <div className="editor-title">
          <strong>{song.title}</strong>
          <span>
            {base.meta.keyMode} · {base.meta.chartName ?? base.meta.difficulty}
            {doc.dirty ? ' · 저장 안 됨' : session.savedChartId ? ' · 저장됨' : ''}
          </span>
        </div>
        <label className="row">
          이름
          <input
            className="editor-name"
            value={session.name}
            maxLength={80}
            onChange={(e) => {
              session.name = e.target.value;
              doc.dirty = true;
              rerender();
            }}
          />
        </label>
        <label className="row">
          스냅
          <select
            data-testid="editor-snap"
            value={session.snap}
            onChange={(e) => {
              session.snap = Number(e.target.value);
              changed();
            }}
          >
            {SNAP_DIVISIONS.map((d) => (
              <option key={d} value={d}>
                {snapLabel(d)}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <button className="small" title="축소 (Ctrl+휠)" onClick={() => { session.pxPerMs = Math.max(MIN_ZOOM, session.pxPerMs / ZOOM_STEP); changed(); }}>
            −
          </button>
          <button className="small" title="확대 (Ctrl+휠)" onClick={() => { session.pxPerMs = Math.min(MAX_ZOOM, session.pxPerMs * ZOOM_STEP); changed(); }}>
            +
          </button>
        </div>
        <button data-testid="editor-play" disabled={!audioReady} onClick={() => (playing ? stop() : void play())}>
          {playing ? '정지' : '재생'} <kbd>Space</kbd>
        </button>
        <label className="row check" title="재생 중에 레인 키를 누르면 그 자리에 노트를 놓습니다">
          <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} data-testid="editor-record" />
          실시간 입력
        </label>
        {(base.sounds?.length ?? 0) === 0 && (
          <label className="row check">
            <input type="checkbox" checked={hitSounds} onChange={(e) => setHitSounds(e.target.checked)} />
            타격음
          </label>
        )}
        <button className="small" disabled={!doc.canUndo} onClick={() => { doc.undo(); changed(); }}>
          되돌리기
        </button>
        <button className="small" disabled={!doc.canRedo} onClick={() => { doc.redo(); changed(); }}>
          다시
        </button>
        <button className="small" onClick={mirror} title="선택한 노트(없으면 전체)를 좌우 반전 (M)">
          미러
        </button>
        <button className="primary" data-testid="editor-test" onClick={testPlay}>
          커서부터 테스트 <kbd>T</kbd>
        </button>
        <button className="primary" data-testid="editor-save" disabled={saving} onClick={() => void save()}>
          저장 <kbd>Ctrl+S</kbd>
        </button>
      </header>
      <div className="editor-body">
        <canvas
          ref={canvasRef}
          className="editor-canvas"
          data-testid="editor-canvas"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseLeave={() => {
            ghost.current = null;
            redraw();
          }}
          onContextMenu={onContextMenu}
          onWheel={onWheel}
        />
        <aside className="editor-side">
          <div className="editor-stats">
            <div>
              노트 <strong data-testid="editor-note-count">{doc.notes.length}</strong> · 선택 {selection.current.size}
            </div>
            <div>
              커서 {formatMs(session.cursorMs)} · {position}
            </div>
            <div>스냅 {snapLabel(session.snap)} · 확대 ×{(session.pxPerMs / 0.25).toFixed(2)}</div>
          </div>
          {toast && (
            <p className="editor-toast" data-testid="editor-toast">
              {toast.text}
            </p>
          )}
          <ul className="editor-help">
            <li><kbd>클릭</kbd> 노트 놓기 · <kbd>드래그</kbd> 롱노트</li>
            <li><kbd>우클릭</kbd> 지우기 · <kbd>Delete</kbd> 선택 지우기</li>
            <li>노트 <kbd>드래그</kbd> 옮기기 · 롱노트 끝 <kbd>드래그</kbd> 길이</li>
            <li><kbd>Shift</kbd>+드래그 범위 선택 · <kbd>Shift</kbd>+클릭 추가 선택</li>
            <li><kbd>휠</kbd> 이동 · <kbd>Ctrl</kbd>+<kbd>휠</kbd> 확대</li>
            <li><kbd>↑</kbd><kbd>↓</kbd> 커서 (<kbd>Shift</kbd> 4박) · <kbd>Alt</kbd>+<kbd>↑↓</kbd> 선택 이동 · <kbd>←</kbd><kbd>→</kbd> 레인</li>
            <li><kbd>1</kbd>–<kbd>8</kbd> 스냅 1/4 ~ 1/64</li>
            <li><kbd>Ctrl</kbd>+<kbd>C</kbd>/<kbd>X</kbd>/<kbd>V</kbd> 복사·잘라내기·커서에 붙이기</li>
            <li><kbd>Ctrl</kbd>+<kbd>Z</kbd>/<kbd>Y</kbd> 되돌리기·다시 · <kbd>M</kbd> 미러</li>
            <li><kbd>Space</kbd> 재생 · <kbd>T</kbd> 커서부터 테스트 · <kbd>Ctrl</kbd>+<kbd>S</kbd> 저장</li>
          </ul>
          <p className="hint">
            템포·박자는 원래 채보를 따릅니다. 저장하면 새 채보로 라이브러리에 남고(원본은 그대로), 난이도를 다시 계산합니다.
          </p>
        </aside>
      </div>
    </div>
  );
}
