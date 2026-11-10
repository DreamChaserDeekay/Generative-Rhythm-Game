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
 * The track that never leaves the screen: the game's own renderer (the gear, notes and hit effect
 * picked in the settings) on a canvas as large as the window and framed exactly as the play screen
 * frames it. The menus only move and shrink it with a CSS transform about the judgement line, so the
 * line keeps its height on every screen and the play screen takes over without a jump.
 */
export class Stage {
  readonly canvas: HTMLCanvasElement;
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
  /** Called on every note the preview plays (the song select's lamps of the stems). */
  onHit: ((note: SessionNote) => void) | null = null;
  /** Notes stop coming (the hand-over to the play screen): what is on the track runs out. */
  draining = false;
  /** The track was built or framed anew (where its judgement line is may have changed). */
  onLayout: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, settings: Settings, mode: KeyModeId) {
    this.canvas = canvas;
    this.settings = settings;
    this.mode = mode;
    window.addEventListener('resize', () => this.fit());
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
    this.onLayout?.();
  }

  fit(): void {
    const box = this.canvas.parentElement;
    if (box && this.renderer) this.renderer.resize(box.clientWidth, box.clientHeight);
    this.onLayout?.();
  }

  /** Every lane struck at once (the song picked is hit onto the line). */
  strike(): void {
    const r = this.renderer;
    if (!r) return;
    const now = performance.now();
    r.geometry.lanes.forEach((_, lane) => r.hitEffect(lane, GRADE_COLORS['g-max'] ?? 0xffffff, now));
  }

  /** Empties the track (the hand-over to the play screen: its own notes come next). */
  drain(): void {
    this.draining = true;
    this.notes = [];
    this.next = 0;
    this.held.fill(null);
    this.renderer?.reset();
  }

  /**
   * Where each lane crosses the judgement line on the full-size canvas (CSS px). A side lane drawn
   * over half the keys has no place of its own on the line: it is given one just outside the track.
   */
  laneXs(): number[] {
    const r = this.renderer;
    if (!r) return [];
    const { h, halfWidth } = r.hudPlane();
    const unit = halfWidth / (r.geometry.width / 2);
    const at = (x: number) => (h[0] * x + h[2]) / (h[6] * x + h[8]);
    return r.geometry.lanes.map((l) => at(l.over ? Math.sign(l.x) * halfWidth * 1.16 : l.x * unit));
  }

  /** Where the track's judgement line is on the full-size canvas (CSS px): its two ends and its height. */
  lineEnds(): { left: number; right: number; y: number } | null {
    const r = this.renderer;
    if (!r) return null;
    const { h, halfWidth } = r.hudPlane();
    const at = (x: number) => {
      const w = h[6] * x + h[8];
      return [(h[0] * x + h[2]) / w, (h[3] * x + h[5]) / w];
    };
    const [left, y] = at(-halfWidth);
    const [right] = at(halfWidth);
    return { left, right, y };
  }

  /** The chart the preview plays (null: an empty track). */
  setChart(chart: Chart | null): void {
    this.chart = chart && chart.meta.keyMode === this.mode ? chart : null;
    const c = this.chart;
    this.notes = (c?.notes ?? []).map((n, index) => ({ index, lane: n.lane, t: n.t, type: n.type, endT: n.endT ?? n.t, ticks: [], nextTick: 0, headDone: false, tailDone: false, broken: false, src: n.src }));
    this.bars = c ? new TempoMap(c.timing).barLines(c.meta.durationMs ?? 0) : [];
    this.draining = false;
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
      this.onHit?.(n);
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

  /** Lets go of the canvas' renderer (the play screen draws on its own canvas over it). */
  dispose(): void {
    this.stop();
    this.building++;
    this.renderer?.dispose();
    this.renderer = null;
    this.builtKey = '';
  }
}
