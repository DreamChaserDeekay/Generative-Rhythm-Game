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
