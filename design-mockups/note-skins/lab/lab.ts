// A harness that draws one frame of the game's track (TrackRenderer) with notes placed by hand, for the
// note skin comparison sheets (design-mockups/note-skins). Driven by shoot.mjs through window.labRender.
import { cameraConfig, keyModes } from '../../../client/src/engine/config';
import { ScrollModel } from '../../../client/src/engine/scroll';
import type { SessionNote } from '../../../client/src/engine/session';
import type { ChartTiming, KeyModeId } from '../../../client/src/engine/types';
import { loadSkinArt } from '../../../client/src/render/skinArt';
import { BASE_SKIN, withParts } from '../../../client/src/render/skins';
import { TrackRenderer } from '../../../client/src/render/TrackRenderer';
import type { GearStyle } from '../../../client/src/render/deckArt';
import type { HitStyle, NoteStyle } from '../../../client/src/render/tintArt';

interface LabNote { lane: number; t: number; endT?: number; state?: 'idle' | 'held' | 'missed' }
interface LabJob {
  note: NoteStyle; deck: GearStyle; hit: HitStyle; mode: KeyModeId; camera: string; width: number; height: number;
  notes: LabNote[]; timeMs: number; visibleMs?: number; sideNotes?: 'lanes' | 'half'; fit?: number; laneWidth?: number;
}

const TIMING: ChartTiming = { offsetMs: 0, tempoMap: [{ beat: 0, bpm: 150 }], meter: [{ measure: 0, beatsPerMeasure: 4 }] };
let current: TrackRenderer | null = null;

(window as unknown as { labRender: (job: LabJob) => Promise<void> }).labRender = async (job) => {
  current?.dispose();
  const old = document.getElementById('c')!;
  const el = document.createElement('canvas');
  el.id = 'c';
  old.replaceWith(el);
  const box = document.getElementById('box')!;
  box.style.width = `${job.width}px`;
  box.style.height = `${job.height}px`;
  const skin = withParts(BASE_SKIN, { note: job.note, deck: job.deck, hit: job.hit, side: 'bar' });
  const art = await loadSkinArt(skin).catch(() => null);
  const r = new TrackRenderer(el, {
    mode: keyModes[job.mode],
    camera: cameraConfig.presets[job.camera],
    trackWidth: cameraConfig.trackWidth * (job.laneWidth ?? 1),
    trackLength: cameraConfig.trackLength,
    reducedFlash: false,
    covers: { sudden: 0, hidden: 0, lift: 0 },
    skin,
    art,
    barLines: true,
    hitEffectSize: 'off',
    sideNotes: job.sideNotes ?? 'lanes',
    ...(job.fit ? { fitWidth: job.fit } : {}),
  });
  current = r;
  r.resize(job.width, job.height);
  // the AI companies' notes are cut in a mark the renderer loads on its own: wait for it
  if (['gpt', 'gemini', 'grok', 'claude'].includes(job.note)) {
    for (let i = 0; i < 100 && el.dataset.mark === undefined; i++) await new Promise((ok) => setTimeout(ok, 30));
  }
  const visibleMs = job.visibleMs ?? 1200;
  const model = new ScrollModel({ trackLength: r.geometry.length, visibleMs, lift: 0, mode: 'time', timing: TIMING, rate: 1, durationMs: 3_600_000 });
  const notes: SessionNote[] = job.notes
    .slice()
    .sort((a, b) => a.t - b.t)
    .map((n, index) => ({
      index, lane: n.lane, t: n.t, type: n.endT !== undefined ? 'hold' : 'tap', endT: n.endT ?? n.t, ticks: [], nextTick: 0,
      headDone: n.state === 'held' || n.state === 'missed', tailDone: false, broken: n.state === 'missed', src: undefined as never,
    }));
  const held = (lane: number) => notes.find((n) => n.lane === lane && n.type === 'hold' && n.headDone && !n.broken)?.index ?? null;
  for (let i = 0; i < 3; i++)
    r.render(
      {
        timeMs: job.timeMs, scroll: model, notes, heldNote: held, keyDown: (lane) => held(lane) !== null, barTimes: [],
        fever: { active: false, multiplier: 1, remaining: 0 },
      } as never,
      performance.now(),
    );
};
(window as unknown as { labReady: boolean }).labReady = true;

// ---------- the references sent to the image model (scripts/assets/make_long_notes.py) ----------
import { LONG_OF, LONG_PAINT, NOTE_PAINT, type LongStyle, type NoteStyle as NS } from '../../../client/src/render/tintArt';

/** A tint picture as a light grey lane shows it, over black (red is how much of the grey, green lifts it toward white). */
function asWhite(src: HTMLCanvasElement): HTMLCanvasElement {
  const g = src.getContext('2d')!;
  const img = g.getImageData(0, 0, src.width, src.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const [r, gr, a] = [d[i] / 255, d[i + 1] / 255, d[i + 3] / 255];
    // a light grey lane (0.72): a white one would wash the shading out
    const k = r * 0.72;
    const v = (k + (1 - k) * gr) * a;
    d[i] = d[i + 1] = d[i + 2] = Math.round(v * 255);
    d[i + 3] = 255;
  }
  const out = document.createElement('canvas');
  [out.width, out.height] = [src.width, src.height];
  out.getContext('2d')!.putImageData(img, 0, 0);
  return out;
}

/**
 * One style's notes as its code draws them, for a light grey lane, on black: its key tap (left) and its scratch tap
 * (right) along the top, as they look on the screen (the pictures are drawn NOTE_STRETCH times deeper than they look),
 * and under them its long note idle (left) and held (right), two rails standing upright, each closed at both ends.
 */
(window as unknown as { labLongRef: (long: LongStyle, note: NS) => string }).labLongRef = (long, note) => {
  const S = 1024;
  const paint = LONG_PAINT[long];
  const rw = 200;
  const tile = Math.round(rw * paint.tile * 1.7);
  const end = Math.max(8, Math.round(rw * paint.endDepth * 1.7));
  const [top, bottom] = [360, 990];
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = [S, S];
  const g = canvas.getContext('2d')!;
  const piece = (w: number, h: number, p: (c: CanvasRenderingContext2D, w: number, h: number) => void) => {
    const c = document.createElement('canvas');
    [c.width, c.height] = [w, h];
    p(c.getContext('2d')!, w, h);
    return asWhite(c);
  };
  // the taps, 440 × 96 on the screen (their pictures 1.7 times deeper)
  const [tw, th] = [440, 96];
  (['white', 'scratch'] as const).forEach((mark, i) => {
    g.drawImage(piece(tw, Math.round(th * 1.7), (c, w, h) => NOTE_PAINT[note](c, w, h, mark)), i === 0 ? 40 : 544, 110, tw, th);
  });
  [false, true].forEach((held, i) => {
    const x = i === 0 ? 232 : 592;
    const body = held && paint.held ? paint.held.body : paint.body;
    const cap = held && paint.held ? paint.held.end : paint.end;
    const b = piece(rw, tile, body);
    for (let y = top + end; y < bottom - end; y += tile) g.drawImage(b, 0, 0, rw, Math.min(tile, bottom - end - y), x, y, rw, Math.min(tile, bottom - end - y));
    const e = piece(rw, end, cap);
    g.drawImage(e, x, top);
    g.save();
    g.translate(x, bottom);
    g.scale(1, -1);
    g.drawImage(e, 0, 0);
    g.restore();
  });
  return canvas.toDataURL('image/png');
};
void LONG_OF;
