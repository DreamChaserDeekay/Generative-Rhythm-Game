import { cameraConfig, keyModes } from '@game/engine/config';
import { ScrollModel } from '@game/engine/scroll';
import type { SessionNote } from '@game/engine/session';
import { TempoMap } from '@game/engine/tempo';
import type { Chart, KeyModeId } from '@game/engine/types';
import { GRADE_COLORS } from '@game/render/palette';
import { disposeSkinArt, loadSkinArt } from '@game/render/skinArt';
import { TrackRenderer } from '@game/render/TrackRenderer';
import { activeCovers, laneColorsOf, skinOf, visibleTimeMs, type Settings } from '@game/settings/settings';

/** A key looks pressed this long after a tap. */
const PRESS_MS = 70;

/**
 * The track shown in the menus: the game's own renderer (the gear, notes and hit effect picked in
 * the settings) on a canvas of its own, playing a chart by itself in time with the preview. One
 * stage is moved to wherever it is shown (곡 정보·도구, the settings' preview).
 */
export class Stage {
  readonly box = document.createElement('div');
  readonly canvas = document.createElement('canvas');
  private renderer: TrackRenderer | null = null;
  private settings: Settings;
  private mode: KeyModeId;
  private builtKey = '';
  private building = 0;
  private chart: Chart | null = null;
  private notes: SessionNote[] = [];
  private bars: number[] = [];
  private scroll: ScrollModel | null = null;
  private held: (number | null)[] = [];
  private pressedUntil: number[] = [];
  private next = 0;
  private lastNow = -Infinity;
  private raf = 0;
  private running = false;
  /** Song time now (ms); null lets the track run on by itself. */
  clock: () => number | null = () => null;
  private freeAt = performance.now();
  private freeFrom = 0;

  constructor(settings: Settings, mode: KeyModeId) {
    this.box.className = 'stage-box';
    this.box.append(this.canvas);
    this.settings = settings;
    this.mode = mode;
    window.addEventListener('resize', () => this.fit());
  }

  /** Shows the track in `host` (it leaves wherever it was). */
  mount(host: HTMLElement): void {
    if (this.box.parentElement !== host) host.append(this.box);
    this.fit();
  }

  private key(): string {
    const s = this.settings;
    return JSON.stringify([this.mode, s.parts, s.laneWidthScale, s.reducedFlash, s.barLines, s.hitEffectSize, s.sideNotes]);
  }

  /** The settings in effect: what the renderer is built from rebuilds it, the rest changes it as it runs. */
  apply(settings: Settings, mode: KeyModeId): void {
    this.settings = settings;
    const modeChanged = mode !== this.mode;
    this.mode = mode;
    if (this.key() !== this.builtKey) void this.build();
    else this.live();
    if (modeChanged) this.setChart(null);
  }

  private async build(): Promise<void> {
    const key = this.key();
    this.builtKey = key;
    const mine = ++this.building;
    const s = this.settings;
    const skin = skinOf(s);
    const art = await loadSkinArt(skin).catch(() => null);
    if (mine !== this.building) {
      disposeSkinArt(art);
      return;
    }
    this.renderer?.dispose();
    this.renderer = new TrackRenderer(this.canvas, {
      mode: keyModes[this.mode],
      camera: cameraConfig.presets[s.cameraPreset] ?? cameraConfig.presets[cameraConfig.default],
      trackWidth: cameraConfig.trackWidth * s.laneWidthScale,
      trackLength: cameraConfig.trackLength,
      reducedFlash: s.reducedFlash,
      covers: activeCovers(s),
      skin,
      art,
      barLines: s.barLines,
      keyBeamLength: s.keyBeamLength,
      hitEffectSize: s.hitEffectSize,
      sideNotes: s.sideNotes,
      laneColors: laneColorsOf(s, this.mode),
    });
    const lanes = keyModes[this.mode].lanes.length;
    this.held = new Array(lanes).fill(null);
    this.pressedUntil = new Array(lanes).fill(-Infinity);
    this.fit();
    this.live();
    this.rewind();
  }

  private live(): void {
    const r = this.renderer;
    if (!r) return;
    const s = this.settings;
    const covers = activeCovers(s);
    r.setCamera(cameraConfig.presets[s.cameraPreset] ?? cameraConfig.presets[cameraConfig.default]);
    r.setCovers(covers);
    r.setKeyBeamLength(s.keyBeamLength);
    r.setLaneColors(laneColorsOf(s, this.mode));
    const timing = this.chart?.timing ?? { offsetMs: 0, tempoMap: [{ beat: 0, bpm: 120 }], meter: [{ measure: 0, beatsPerMeasure: 4 }] };
    this.scroll = new ScrollModel({ trackLength: r.geometry.length, visibleMs: visibleTimeMs(s.hiSpeed), lift: covers.lift, mode: 'time', timing, rate: 1, durationMs: this.chart?.meta.durationMs ?? 3_600_000 });
  }

  fit(): void {
    const { clientWidth: w, clientHeight: h } = this.box;
    if (this.renderer && w > 0 && h > 0) this.renderer.resize(w, h);
  }

  /** The chart the preview plays (null: an empty track). */
  setChart(chart: Chart | null): void {
    this.chart = chart && chart.meta.keyMode === this.mode ? chart : null;
    const c = this.chart;
    this.notes = (c?.notes ?? []).map((n, index) => ({ index, lane: n.lane, t: n.t, type: n.type, endT: n.endT ?? n.t, ticks: [], nextTick: 0, headDone: false, tailDone: false, broken: false, src: n.src }));
    this.bars = c ? new TempoMap(c.timing).barLines(c.meta.durationMs ?? 0) : [];
    this.live();
    this.rewind();
  }

  /** The free clock starts here (before the first key, when no sound may play yet). */
  runFrom(ms: number): void {
    this.freeFrom = ms;
    this.freeAt = performance.now();
  }

  private rewind(): void {
    this.lastNow = -Infinity;
    this.renderer?.reset();
  }

  private place(now: number): void {
    // every note before now is done, every later one still to come
    this.next = 0;
    for (const n of this.notes) {
      const past = n.endT < now;
      n.headDone = n.t < now;
      n.tailDone = past;
      if (n.t < now) this.next = n.index + 1;
    }
    this.held.fill(null);
    for (const n of this.notes) if (n.type === 'hold' && n.t < now && n.endT >= now) this.held[n.lane] = n.index;
    this.renderer?.reset();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private readonly frame = (perfNow: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const r = this.renderer;
    const scroll = this.scroll;
    if (!r || !scroll) return;
    const now = this.clock() ?? this.freeFrom + (perfNow - this.freeAt);
    // the clip loops, a song changes: start over from where the clock is
    if (now < this.lastNow - 50 || now > this.lastNow + 1500) this.place(now);
    this.lastNow = now;
    const notes = this.notes;
    const hit = GRADE_COLORS['g-max'] ?? 0xffffff;
    for (; this.next < notes.length && notes[this.next].t <= now; this.next++) {
      const n = notes[this.next];
      n.headDone = true;
      r.hitEffect(n.lane, hit, perfNow);
      if (n.type === 'hold') this.held[n.lane] = n.index;
      else {
        n.tailDone = true;
        this.pressedUntil[n.lane] = now + PRESS_MS;
      }
    }
    this.held.forEach((index, lane) => {
      if (index === null || notes[index].endT > now) return;
      notes[index].tailDone = true;
      this.held[lane] = null;
      r.hitEffect(lane, hit, perfNow);
    });
    r.render(
      {
        timeMs: now,
        scroll,
        notes,
        heldNote: (lane) => this.held[lane],
        keyDown: (lane) => this.held[lane] !== null || this.pressedUntil[lane] > now,
        barTimes: this.bars,
        fever: { active: false, multiplier: 1, remaining: 0 },
      },
      perfNow,
    );
  };

  /** Lets go of the renderer. */
  dispose(): void {
    this.stop();
    this.building++;
    this.renderer?.dispose();
    this.renderer = null;
    this.builtKey = '';
  }
}
