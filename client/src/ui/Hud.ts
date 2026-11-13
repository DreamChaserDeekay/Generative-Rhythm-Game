import type { JudgeEvent } from '../engine/session';
import type { GearStyle } from '../render/deckArt';
import { GAUGE_NAMES } from '../render/gearHud';
import type { HudPlane } from '../render/TrackRenderer';
import { HUD_FONTS, type HudFont, type HudType } from '../render/skins';
import { context2d, keepPainted } from '../render/paintCanvas';
import { AIDED_WORDS, loadEndArt, wordsBox, type EndArt } from './endArt';
import { clockText, errorKind, errorText, speedText } from './format';
import { drawDisc, stemToken } from './songArt';
import { token } from './theme';
import type { KeyPairNames } from './visualSync';

/**
 * The song's jacket on its plate: its picture, or (none, or one that does not load) its disc in
 * the colour of the stem that leads the song, asked for only then (null: not known, a grey disc).
 */
export interface HudJacket {
  coverUrl: string | null;
  leadStem?: () => Promise<string | null>;
}

export interface HudInfo {
  title: string;
  /** Under the title (empty: no line). */
  artist: string;
  /** At the plate's left (null: none, the sync test has no song). */
  jacket?: HudJacket | null;
  keyMode: string;
  /** Difficulty chip: the tier on its colour and the level ("Lv.12"; empty when none). */
  difficulty: { label: string; level: string; color: string };
  /** How the play runs (data-mode on the HUD). */
  mode: 'play' | 'auto' | 'replay' | 'practice';
  /** Small chips after the key mode: AUTO / REPLAY / 연습, a judgement mode that is not NORMAL (none for a plain play). */
  chips: string[];
  /** Stems whose keysounds play (data-keysounds on the HUD; not shown). */
  keysounds: string[];
  /** Label of the main score counter (SCORE / EX-SCORE). */
  scoreLabel: string;
  /** Label of the second counter (RATE / rank). */
  subLabel: string;
  gaugeLabel: string;
  gaugeClear: number;
  survivalGauge: boolean;
  feverEnabled: boolean;
  feverManualKey: string | null;
  pacemakerLabel: string | null;
  /** The judgement and combo type (the gear's or the track's own, render/gearHud.ts). */
  type: HudType;
  /**
   * The picked gear the HUD beside the track is dressed for (data-gear: its gauge, the score panel's
   * housing, the readouts' digits, the gauge's name); none in a HUD shown without a gear.
   */
  gear?: GearStyle | null;
  /** Opacity of the judgement and the combo, so notes behind them show through (1 = solid). */
  judgementOpacity: number;
  /** The miss label (BREAK, MISS, POOR) of the counts under the score panel; null shows none. */
  counterMissLabel: string | null;
  /** The timing error bar under the judgement (null: none): the widest and the best window, real ms each way. */
  errorBar: { outerMs: number; bestMs: number } | null;
  /** The current BPM under SPEED (charts that change tempo, or BPM-linked scrolling). */
  showBpm: boolean;
  /** The key that skips a long intro. */
  skipKey: string;
  /**
   * The sync test (null: none): its display offset and, played by hand (`judgement` given), its
   * judgement offset under the song's line, each with the keys that move it (null: none free).
   */
  syncKeys?: { visual: KeyPairNames | null; judgement?: KeyPairNames | null } | null;
}

export interface HudStats {
  score: number;
  sub: string;
  maxCombo: number;
  gauge: number;
  fever: { gauge: number; active: boolean; multiplier: number; remaining: number; ready: boolean };
  pace: number | null;
  /** 0..1 of the way from the run's start to its last note, and the real ms left until that note. */
  progress: number;
  remainingMs: number;
  bpm: number;
  /** The intro can be skipped now. */
  skip: boolean;
  /** Misses and the FAST / SLOW hits so far (the counts under the panel). */
  breaks: number;
  fast: number;
  slow: number;
}

const JUDGE_VISIBLE_MS = 600;
const TOAST_MS = 1400;
/** The HUD is drawn for a 720px-high screen and grows with it, up to this much. */
const BASE_HEIGHT = 720;
const MAX_SCALE = 1.5;
/** The letters of a lamp's words stand this tall in their picture as it is shown (em of the lamp's type: endArt.wordsBox). */
const WORDS_CAP_EM = 1;

/** The lamps shown at a play's end with their words; the others are their mark alone, struck like a seal. */
const WORDED_LAMPS = new Set(['perfect', 'maxcombo', 'failed', 'aided']);
/** A full combo: the combo's number flies to the middle over this long before its words show (styles.css: lamp-words-late). */
export const COMBO_FLIGHT_MS = 420;
/** The sparks of a hard clear's two halves closing: how many, and how far they fly (em of the seal). */
const LAMP_SPARKS = 22;
const SPARK_REACH = [1.4, 3.4] as const;

/**
 * Where a spark of a seal closing flies to (em): out along the seam both ways, a little up or down, the same
 * every time; and how long after the halves meet it starts (ms).
 */
export function lampSpark(i: number, count = LAMP_SPARKS): { dx: number; dy: number; delayMs: number } {
  const hash = (k: number) => {
    const v = Math.sin((i + 1) * 78.233 + k * 37.719) * 43758.5453;
    return v - Math.floor(v);
  };
  const side = i % 2 === 0 ? 1 : -1;
  const angle = (hash(1) - 0.5) * 1.3;
  const reach = SPARK_REACH[0] + (SPARK_REACH[1] - SPARK_REACH[0]) * hash(2) * (0.6 + (0.4 * i) / count);
  return { dx: side * Math.cos(angle) * reach, dy: Math.sin(angle) * reach * 0.8, delayMs: Math.round(hash(3) * 70) };
}

/** Every combo step punches the number: it starts larger and a little lower, then settles back. */
const COMBO_BUMP: Keyframe[] = [{ transform: 'translateY(8%) scale(1.25)' }, { transform: 'none' }];
const COMBO_BUMP_MS = 150;
/**
 * Text lying on the track is drawn longer along it (like a road marking) until it looks at least
 * this tall for its width, so it still reads where the camera flattens the track; at most 2.6 times.
 */
const TEXT_ASPECT = 0.7;
const SIDE_ASPECT = 0.95;
const MAX_STRETCH = 2.6;
/**
 * The column left of the gear (SPEED, the score panel, the time left) stands upright: each block
 * as tall on the screen as it is wide, drawn up to this much longer along the track; where the
 * camera flattens the track more (LIFT, the flat cameras), it is sized by its height and so wider.
 */
const UPRIGHT_MAX_STRETCH = 4;
/** Track units the gauge stands above the judge line and runs up the track, in cells. */
const GAUGE_FROM = 0.15;
const GAUGE_LENGTH = 9;
const GAUGE_CELLS = 40;
/** The score panel's housing (a gear's): this far round its lines (screen px at 720p). */
const PLATE_PAD = 8;
const PROGRESS_GAP = 12;
/** Screen px between SPEED and the score panel, and between the panel (or the bar) and the time left over it. */
const COLUMN_GAP = 18;
/** Steps the progress bar moves in (one transform each). */
const PROGRESS_STEPS = 500;
/** Plane px per track unit (HUD_UNIT; kept here so the plane's sizes read as the sheets' px). */
const UNIT = 73.65;
/** Space between the gear and what stands beside it (plane px), and between the score panel and the screen's edge (screen px). */
const SIDE_GAP = 22;
/** The numbers written on the gear's deck: the score's and the two smaller ones' size (screen px at 720p), where their windows have the room. */
const DECK_SCORE = 34;
const DECK_SMALL = 27;
/**
 * What stands at the gear's right (FEVER, the gauge and its name) stands this much further out (screen
 * px at 720p): the gear's frame rises over the lanes and leans out on the screen, and a word set
 * against it would lie on it.
 */
const RIGHT_OUT = 12;
/** Screen px (at 720p) between the gauge's far end and its name over it. */
const GAUGE_NAME_GAP = 16;
/**
 * The rate under the judgement: its number's and its label's size and the gap over it (screen px at 720p). Small: it is
 * read at a glance between notes, and the judgement over it is the larger word.
 */
const RATE_NUM = 17;
const RATE_LABEL = 11;
const RATE_GAP = 7;
const SIDE_MARGIN = 16;
/**
 * Where the room beside the gear is narrower than the song's plate's widest part, the plate shrinks,
 * its type to no less than this share of its size at 720p.
 */
const INFO_LEAST_TYPE = 0.8;
/** The jacket on the song's plate (.hud-jacket: 48 px at 720p) is drawn once, for its side at the HUD's largest (screen px). */
const JACKET_SIDE = 48 * MAX_SCALE;
/**
 * A plate that cannot hold its jacket, this much of the song's name and the difficulty side by
 * side is a narrow one (screen px at 720p): there the artist gives way and the difficulty stands
 * under the title, so the plate is no higher than its jacket.
 */
const INFO_NAME_ROOM = 200;
/**
 * The score panel's labels and numbers (screen px tall at 720p), and the least of them it keeps
 * (labels 12 px, numbers about 21): where two columns would need less, each label goes over its
 * number (as SPEED); where that needs less too, the panel leaves the track and stands on the screen.
 */
const PANEL_LABEL = 15;
const PANEL_NUM = 26;
const PANEL_MIN_SHRINK = 12 / PANEL_LABEL;
/** FAST / SLOW at least half the judgement's size (and 18 px), the ms beside it smaller (16 px at least). */
const SUB_SHARE = 0.5;
const SUB_MIN = 18;
const MS_SHARE = 0.7;
const MS_MIN = 16;
/**
 * The timing error bar under the judgement (screen px at 720p, no wider than the track): the widest
 * window each way across it, a tick per hit and a longer, thicker one for their mean.
 */
const ERROR_BAR_WIDTH = 240;
const ERROR_BAR_HEIGHT = 10;
const ERROR_BAR_GAP = 6;
const ERROR_TICK = 2;
const ERROR_MEAN = 4;
/** The last hits the error bar shows (a tick each, reused in turn) and takes the mean of. */
const ERROR_TICKS = 20;

/** The error bar's parts, the errors (real ms) its ticks show, the next tick to use, and half its width (plane px). */
export interface ErrorBar {
  el: HTMLElement;
  ticks: HTMLElement[];
  mean: HTMLElement;
  outerMs: number;
  errors: number[];
  next: number;
  meanMs: number;
  half: number;
}

/** CSS transform of the plane: its homography (row-major 3×3, plane px to screen px) as a matrix3d. */
export function planeMatrix(h: readonly number[]): string {
  const m = [h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, h[8]];
  return `matrix3d(${m.map((v) => Number(v.toPrecision(9))).join(',')})`;
}

/** Where the plane point (x, y) lies on the screen (px). */
export function planePoint(h: readonly number[], x: number, y: number): [number, number] {
  const w = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

/** Screen px per plane px across the track at (x, y), and how tall a small square there looks for its width. */
export function planeScale(h: readonly number[], x: number, y: number): { scale: number; aspect: number } {
  const w = h[6] * x + h[7] * y + h[8];
  const sx = (h[0] * x + h[1] * y + h[2]) / w;
  const sy = (h[3] * x + h[4] * y + h[5]) / w;
  // the derivatives of the projected point along x and along y
  const across = Math.hypot((h[0] - sx * h[6]) / w, (h[3] - sy * h[6]) / w);
  const along = Math.hypot((h[1] - sx * h[7]) / w, (h[4] - sy * h[7]) / w);
  return { scale: across, aspect: across > 1e-9 ? along / across : 1 };
}

/** How much longer along the track text is drawn there, so it looks at least `target` tall for its width. */
export function stretchFor(aspect: number, target: number, max = MAX_STRETCH): number {
  return Math.min(max, Math.max(1, target / Math.max(aspect, 1e-6)));
}

/**
 * Text standing upright at (x, y) of the plane: plane px per screen px (so it reads at least as
 * tall and as wide as asked wherever it lies) and how much longer along the track it is drawn.
 * Its height is the screen's vertical alone: up the track the plane's lines lean toward the
 * vanishing point, which slants the text but does not make it taller. Flatter than
 * UPRIGHT_MAX_STRETCH makes up for, it comes out wider instead of shorter.
 */
export function uprightAt(h: readonly number[], x: number, y: number): { k: number; stretch: number } {
  const w = h[6] * x + h[7] * y + h[8];
  const sy = (h[3] * x + h[4] * y + h[5]) / w;
  const { scale } = planeScale(h, x, y);
  const tall = Math.abs((h[4] - sy * h[7]) / w);
  const stretch = Math.min(UPRIGHT_MAX_STRETCH, Math.max(1, scale / Math.max(tall, 1e-9)));
  return { k: 1 / Math.max(Math.min(scale, tall * stretch), 1e-6), stretch };
}

/** The plane y where the plane's line x = `x` crosses the screen's row `sy` (px). */
export function planeYAt(h: readonly number[], x: number, sy: number): number {
  return (sy * (h[6] * x + h[8]) - h[3] * x - h[5]) / (h[4] - sy * h[7]);
}

/**
 * Screen px from `left` to the gear's left edge (plane x = -`edge`, up to the track's end at `far`)
 * on the rows `top` to `bottom` the song's plate takes. The edge is straight on the screen, so it
 * comes nearest at one end of them: the foot where it leans out toward the camera, the top (or
 * the track's far corner, if lower) where a roll turns the far end toward the plate. Above the
 * horizon there is no gear.
 */
export function infoRoom(h: readonly number[], edge: number, far: number, left: number, top: number, bottom: number): number {
  const horizon = h[7] < 0 ? h[4] / h[7] : -Infinity;
  if (bottom <= horizon) return Infinity;
  const x = (row: number) => planePoint(h, -edge, planeYAt(h, -edge, row))[0];
  const corner = planePoint(h, -edge, far)[1];
  return Math.min(x(bottom), x(Math.min(bottom, Math.max(top, corner)))) - left;
}

/** A font of the HUD as CSS's font shorthand. */
const fontSpec = (font: HudFont, px: number) => `${HUD_FONTS[font].italic ? 'italic ' : ''}${HUD_FONTS[font].weight} ${px}px '${font}'`;

/** Loads a type's font before the play starts, so the first judgement or combo is not drawn in a fallback font. */
export function loadHudFont(type: HudType): Promise<unknown> {
  const load = document.fonts?.load(fontSpec(type.font, 40), 'MAX 100% COMBO 0123456789');
  return Promise.resolve(load ? load.catch(() => null) : null);
}

/**
 * "MAX 100%" with its first word in white (a split type), else the whole label in the judgement's
 * colour; in a type with a fill of its own (HudType.fill) each word in a span that carries its text,
 * for the layers its styles lay over it (.hud-fill).
 */
export function judgementHtml(label: string, split: boolean, filled = false): string {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const word = (t: string, cls = '') => (filled ? `<span class="hud-fill${cls && ` ${cls}`}" data-text="${esc(t)}">${esc(t)}</span>` : cls ? `<span class="${cls}">${esc(t)}</span>` : esc(t));
  const space = label.indexOf(' ');
  if (!split || space < 0) return filled ? label.split(' ').map((t) => word(t)).join(' ') : esc(label);
  return `${word(label.slice(0, space), 'hud-split')} ${filled ? label.slice(space + 1).split(' ').map((t) => word(t)).join(' ') : esc(label.slice(space + 1))}`;
}

/**
 * The song's jacket for its plate, drawn once into a small canvas: its picture cut to a square
 * (the picture itself may be thousands of pixels wide, and is let go), or its disc where it has
 * none or the picture does not load. Never a broken picture. Drawn again whenever the browser hands
 * the canvas back empty (a lost graphics process, see render/paintCanvas).
 */
function jacketOf(jacket: HudJacket): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'hud-jacket';
  canvas.setAttribute('aria-hidden', 'true');
  const disc = (stem: string | null) => drawDisc(canvas, JACKET_SIDE, token(stemToken(stem)));
  const showDisc = () => {
    disc(null);
    jacket.leadStem?.().then(
      (stem) => {
        if (stem) disc(stem);
      },
      () => undefined,
    );
  };
  const showCover = (url: string) => {
    const side = Math.round(JACKET_SIDE * Math.min(2, window.devicePixelRatio || 1));
    canvas.width = side;
    canvas.height = side;
    const image = new Image();
    image.onload = () => {
      const g = context2d(canvas) as CanvasRenderingContext2D | null;
      const cut = Math.min(image.naturalWidth, image.naturalHeight);
      if (!g || cut <= 0) return showDisc();
      g.imageSmoothingQuality = 'high';
      g.drawImage(image, (image.naturalWidth - cut) / 2, (image.naturalHeight - cut) / 2, cut, cut, 0, 0, side, side);
    };
    image.onerror = showDisc;
    image.src = url;
  };
  const { coverUrl } = jacket;
  keepPainted(canvas, coverUrl ? () => showCover(coverUrl) : showDisc);
  return canvas;
}

/**
 * Imperative DOM overlay; only touches the DOM when a value changes. The song (jacket, title,
 * artist, level, key mode, how the play runs) and the messages sit on the screen; the judgement,
 * combo, score panel, gauge, speed, progress and FEVER lie on the track (one plane under the
 * camera's projection: they tilt and zoom with it).
 */
export class Hud {
  private readonly root: HTMLElement;
  private readonly type: HudType;
  private readonly plane: HTMLElement;
  private readonly comboBox: HTMLElement;
  private readonly comboNum: HTMLElement;
  private readonly judgeBox: HTMLElement;
  private readonly judgePop: HTMLElement;
  private readonly judgeText: HTMLElement;
  private readonly judgeLabel: HTMLElement;
  private readonly judgeSub: HTMLElement;
  private readonly judgeFastSlow: HTMLElement;
  private readonly judgeMs: HTMLElement;
  private readonly score: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly maxCombo: HTMLElement;
  private readonly pace: HTMLElement;
  private readonly misses: HTMLElement;
  private readonly fastCount: HTMLElement;
  private readonly slowCount: HTMLElement;
  private readonly panel: HTMLElement;
  /** The panel's rows, from the bottom up (without those the gear's deck houses). */
  private panelRows: HTMLElement[];
  private readonly gauge: HTMLElement;
  private readonly gaugeFill: HTMLElement;
  private readonly gaugeClear: HTMLElement;
  private readonly gaugeClearLabel: HTMLElement;
  private readonly gaugeValue: HTMLElement;
  private readonly gaugeNum: HTMLElement;
  /** The gear's name for the gauge (FEVER, FORTE), standing over its far end. */
  private readonly gaugeName: HTMLElement;
  /** The score panel's housing on the track under its lines (a gear's). */
  private readonly panelPlate: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly speedNum: HTMLElement;
  private readonly bpm: HTMLElement;
  private readonly progressFill: HTMLElement;
  /** The song's time under its plate: how far in, of how long, over a bar; `remaining` is kept (not shown) for what reads the time left. */
  private readonly elapsed: HTMLElement;
  private readonly total: HTMLElement;
  private readonly remaining: HTMLElement;
  /** The score's and the rate's rows, which the gear's deck houses where it has windows for them (HudPlane.deck), with SPEED. */
  private readonly scoreRow: HTMLElement;
  private readonly rateRow: HTMLElement;
  private readonly maxComboRow: HTMLElement;
  /** The panel's rows as built, top down. */
  private readonly allRows: HTMLElement[];
  private onDeck = false;
  private totalMs = 0;
  private lastElapsed = -1;
  private readonly fever: HTMLElement;
  private readonly feverFill: HTMLElement;
  private readonly feverText: HTMLElement;
  private readonly lamp: HTMLElement;
  private readonly lampText: HTMLElement;
  private readonly lampFly: HTMLElement;
  /** The end's pictures, once they are loaded (null: the styles draw the lamp). */
  private endArt: EndArt | null = null;
  /** The flight of the combo's number to the middle at a full combo's end. */
  private comboFlight: Animation | null = null;
  /** 동작 줄이기 (prefers-reduced-motion): nothing flies; the styles leave their own motion out as well. */
  private readonly still: boolean;
  private readonly skip: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly syncVisual: HTMLElement | null = null;
  private readonly syncInput: HTMLElement | null = null;
  private readonly errorBar: ErrorBar | null = null;
  private readonly showErrorMs: boolean;
  private readonly gaugeClearShare: number;
  private readonly survival: boolean;
  private readonly counter: boolean;
  private readonly judgeOpacity: string;
  /** Off with the reduced-flash setting, like the judgement pop. */
  private readonly bumpCombo: boolean;
  private readonly feverManualKey: string | null;
  private comboBump: Animation | null = null;
  private judgeAt = -Infinity;
  private toastAt = -Infinity;
  private hudScale = 1;
  private screenHeight = 0;
  private lastCombo = -1;
  private lastScore = -1;
  private lastSub = '';
  private lastMaxCombo = -1;
  /** undefined: not written yet (null is a pace with nothing to compare, shown as a dash). */
  private lastPace: number | null | undefined = undefined;
  private lastGauge = -1;
  private lastFever = '';
  private lastProgress = -1;
  private lastRemaining = -1;
  private lastBpm = -1;
  private lastSkip: boolean | null = null;
  private lastCounts = '';
  private lastSync = '';
  private lastMatrix = '';
  /** Where the screen's top keeps clear of the song's plate (px). */
  private infoBottom = 0;
  /**
   * The column left of the gear from the last layout: the plane, the panel's right edge and foot
   * over SPEED, the progress bar's right edge and top (plane px), and the screen's margins (px).
   */
  private column: { h: readonly number[]; x: number; bottom: number; margin: number; top: number } | null = null;

  constructor(root: HTMLElement, info: HudInfo, showErrorMs: boolean, reducedFlash = false) {
    this.root = root;
    this.type = info.type;
    this.showErrorMs = showErrorMs;
    this.bumpCombo = !reducedFlash;
    this.feverManualKey = info.feverManualKey;
    this.gaugeClearShare = Math.min(1, Math.max(0, info.gaugeClear / 100));
    this.survival = info.survivalGauge;
    this.counter = info.counterMissLabel !== null;
    this.judgeOpacity = String(info.judgementOpacity);
    root.innerHTML = `
      <div class="hud-info">
        <div class="hud-head"><div class="hud-line"><span class="hud-name"><span class="hud-title"></span><span class="hud-artist"></span></span><span class="hud-tier"><span class="hud-diff"><span class="hud-diff-tier"></span><span class="hud-diff-level"></span></span><span class="hud-keymode"></span></span></div></div>
        <div class="hud-time hud-progress-time" data-testid="hud-time"><span class="hud-elapsed" data-testid="hud-elapsed">0:00</span><span class="hud-total" data-testid="hud-total"></span><span class="hud-progress" data-testid="hud-progress"><i class="hud-progress-fill"></i></span><span class="hud-remaining" data-testid="hud-remaining" hidden></span></div>
      </div>
      <div class="hud-plane">
        <div class="hud-judge"><div class="hud-judge-pop"><div class="hud-judge-text"><span class="hud-judge-label"></span></div><i class="hud-judge-bar"></i><div class="hud-judge-sub"><span class="hud-judge-fs"></span><span class="hud-judge-ms"></span></div></div></div>
        <div class="hud-combo"><div class="hud-combo-num"></div><div class="hud-combo-label">COMBO</div></div>
        <div class="hud-fever" data-testid="hud-fever"><span class="hud-fever-text"></span><span class="hud-fever-bar"><i class="hud-fever-fill"></i></span></div>
        <div class="hud-speed"><span class="hud-label">SPEED</span><span class="hud-num hud-speed-num" data-testid="hud-speed"></span><span class="hud-label hud-bpm" data-testid="hud-bpm">BPM <b class="hud-bpm-num"></b></span></div>
        <div class="hud-gauge"><i class="hud-gauge-fill"></i></div>
        <i class="hud-gauge-clear"></i>
        <div class="hud-gauge-clear-label"><span class="hud-label">CLEAR</span></div>
        <div class="hud-gauge-value" data-testid="hud-gauge"><span class="hud-num hud-gauge-num"></span><span class="hud-label hud-gauge-type"></span></div>
        <div class="hud-gauge-name"></div>
        <i class="hud-panel-plate"></i>
        <div class="hud-panel" data-testid="hud-panel">
          <div class="hud-row"><span class="hud-label hud-score-label"></span><span class="hud-num hud-score">0</span></div>
          <div class="hud-row hud-pace-item"><span class="hud-label hud-pace-label"></span><span class="hud-num hud-pace" data-testid="hud-pace"></span></div>
          <div class="hud-row"><span class="hud-label hud-rate-label"></span><span class="hud-num hud-rate"></span></div>
          <div class="hud-row"><span class="hud-label">MAX COMBO</span><span class="hud-num hud-max-combo">0</span></div>
          <div class="hud-row hud-counter-item"><span class="hud-label hud-miss-label"></span><span class="hud-num hud-misses" data-testid="hud-misses">0</span></div>
          <div class="hud-row hud-counter-item"><span class="hud-label">FAST · SLOW</span><span class="hud-num" data-testid="hud-fast-slow"><span class="hud-fast">0</span> · <span class="hud-slow">0</span></span></div>
        </div>
      </div>
      <div class="hud-toast" data-testid="hud-toast"></div>
      <div class="hud-skip" data-testid="hud-skip"><kbd></kbd> 건너뛰기</div>
      <div class="hud-lamp-fly" aria-hidden="true"></div>
      <div class="hud-lamp"><i class="hud-lamp-ring"></i><span class="hud-lamp-seal"><i class="hud-lamp-half top"><i class="hud-lamp-mark"></i></i><i class="hud-lamp-half bottom"><i class="hud-lamp-mark"></i></i></span><span class="hud-lamp-sparks"></span><span class="hud-lamp-text"></span><i class="hud-lamp-art"></i></div>`;
    const q = (sel: string) => root.querySelector(sel) as HTMLElement;
    q('.hud-title').textContent = info.title;
    q('.hud-artist').textContent = info.artist;
    if (info.jacket) q('.hud-head').prepend(jacketOf(info.jacket));
    q('.hud-diff').style.setProperty('--diff', info.difficulty.color);
    q('.hud-diff-tier').textContent = info.difficulty.label;
    q('.hud-diff-level').textContent = info.difficulty.level;
    q('.hud-keymode').textContent = info.keyMode;
    if (info.chips.length > 0) {
      // after the difficulty on the song's line, or under it where the line is full (a long title keeps its room)
      const chips = document.createElement('div');
      chips.className = 'hud-chips';
      for (const text of info.chips) {
        const chip = document.createElement('span');
        chip.className = 'hud-chip';
        chip.textContent = text;
        chips.append(chip);
      }
      q('.hud-line').append(chips);
    }
    const syncKeys = info.syncKeys;
    if (syncKeys) {
      // the offsets the sync test's keys move, each with its keys (those the lanes leave free)
      const sync = document.createElement('div');
      sync.className = 'hud-sync';
      sync.dataset.testid = 'hud-sync';
      const row = (label: string, id: string, keys: KeyPairNames | null): HTMLElement => {
        const line = document.createElement('div');
        line.className = 'hud-sync-row';
        const name = document.createElement('span');
        name.textContent = label;
        const value = document.createElement('b');
        value.className = `hud-sync-${id}`;
        value.dataset.testid = `hud-sync-${id}`;
        const caps = document.createElement('span');
        if (keys) {
          const cap = (text: string) => Object.assign(document.createElement('kbd'), { textContent: text });
          if (keys.modifier) caps.append(cap(keys.modifier), '+');
          caps.append(cap(keys.keys[0]), cap(keys.keys[1]));
        }
        line.append(name, value, caps);
        sync.append(line);
        return value;
      };
      this.syncVisual = row('표시 오프셋', 'visual', syncKeys.visual);
      this.syncInput = syncKeys.judgement === undefined ? null : row('판정 오프셋', 'input', syncKeys.judgement);
      // under the song's line, across the plate
      const foot = document.createElement('div');
      foot.className = 'hud-foot';
      foot.append(sync);
      q('.hud-info').append(foot);
    }
    root.dataset.mode = info.mode;
    root.dataset.keysounds = info.keysounds.join(' ');
    if (info.gear) root.dataset.gear = info.gear;

    // the type on the whole HUD: the plane's judgement and combo, and the end banner
    const t = info.type;
    const font = HUD_FONTS[t.font];
    root.style.setProperty('--hud-font', `'${t.font}'`);
    root.style.setProperty('--hud-weight', String(font.weight));
    root.style.setProperty('--hud-style', font.italic ? 'italic' : 'normal');
    root.style.setProperty('--hud-tracking', `${t.tracking}em`);
    root.style.setProperty('--hud-outline', t.outline);
    root.style.setProperty('--hud-stroke', `${t.stroke}px`);
    root.style.setProperty('--judge-max', t.max);
    root.style.setProperty('--combo-color', t.comboColor ?? 'var(--text)');
    this.plane = q('.hud-plane');
    this.comboBox = q('.hud-combo');
    this.comboBox.style.opacity = this.judgeOpacity;
    this.comboNum = q('.hud-combo-num');
    if (t.fill) {
      // a type with a fill of its own: the combo and its label carry their text as the judgement's words do (judgementHtml)
      root.dataset.fill = t.fill;
      this.comboNum.classList.add('hud-fill');
      const label = q('.hud-combo-label');
      label.classList.add('hud-fill');
      label.dataset.text = label.textContent ?? '';
    }
    this.judgeBox = q('.hud-judge');
    this.judgePop = q('.hud-judge-pop');
    this.judgeLabel = q('.hud-judge-label');
    this.judgeSub = q('.hud-judge-sub');
    this.judgeFastSlow = q('.hud-judge-fs');
    this.judgeMs = q('.hud-judge-ms');
    this.judgeText = q('.hud-judge-text');
    const bar = q('.hud-judge-bar');
    if (t.bar) bar.style.background = t.bar;
    else bar.remove();
    const errors = info.errorBar;
    if (errors) {
      // the best window shaded, the centre, a tick per recent hit and their mean (data-outer-ms, data-mean-ms; not shown)
      const el = document.createElement('div');
      el.className = 'hud-errorbar';
      el.dataset.testid = 'hud-error-bar';
      el.dataset.outerMs = String(Math.round(errors.outerMs * 100) / 100);
      el.style.opacity = this.judgeOpacity;
      el.innerHTML = `<i class="hud-eb-best"></i><i class="hud-eb-zero"></i>${'<i class="hud-eb-tick"></i>'.repeat(ERROR_TICKS)}<i class="hud-eb-mean"></i>`;
      (el.firstElementChild as HTMLElement).style.width = `${(100 * errors.bestMs) / errors.outerMs}%`;
      this.plane.append(el);
      const ticks = [...el.querySelectorAll<HTMLElement>('.hud-eb-tick')];
      this.errorBar = { el, ticks, mean: el.querySelector('.hud-eb-mean') as HTMLElement, outerMs: errors.outerMs, errors: [], next: 0, meanMs: 0, half: 0 };
    }

    q('.hud-score-label').textContent = info.scoreLabel;
    q('.hud-rate-label').textContent = info.subLabel;
    q('.hud-pace-label').textContent = info.pacemakerLabel ?? '';
    this.pace = q('.hud-pace');
    if (info.pacemakerLabel === null) root.querySelectorAll('.hud-pace-item').forEach((el) => el.remove());
    q('.hud-miss-label').textContent = info.counterMissLabel ?? '';
    this.misses = q('.hud-misses');
    this.fastCount = q('.hud-fast');
    this.slowCount = q('.hud-slow');
    if (!this.counter) root.querySelectorAll('.hud-counter-item').forEach((el) => el.remove());
    this.score = q('.hud-score');
    this.sub = q('.hud-rate');
    this.maxCombo = q('.hud-max-combo');
    this.panel = q('.hud-panel');
    this.scoreRow = this.score.parentElement as HTMLElement;
    this.rateRow = this.sub.parentElement as HTMLElement;
    // the rate stands on the track under the judgement (layoutPlane): the column and the deck have no row for it
    this.rateRow.classList.add('under-judge');
    this.plane.append(this.rateRow);
    this.allRows = [...this.panel.children] as HTMLElement[];
    this.panelRows = [...this.allRows].reverse();
    this.maxComboRow = this.maxCombo.parentElement as HTMLElement;

    this.gauge = q('.hud-gauge');
    this.gauge.classList.toggle('survival', info.survivalGauge);
    this.gauge.style.setProperty('--clear-at', `${this.gaugeClearShare * 100}%`);
    this.gaugeFill = q('.hud-gauge-fill');
    this.gaugeClear = q('.hud-gauge-clear');
    this.gaugeClearLabel = q('.hud-gauge-clear-label');
    if (info.survivalGauge) {
      this.gaugeClear.remove();
      this.gaugeClearLabel.remove();
    }
    this.gaugeValue = q('.hud-gauge-value');
    this.gaugeNum = q('.hud-gauge-num');
    q('.hud-gauge-type').textContent = info.gaugeLabel;
    // the gear's name for its gauge by it
    const gaugeName = info.gear ? GAUGE_NAMES[info.gear] : null;
    this.gaugeName = q('.hud-gauge-name');
    if (gaugeName) this.gaugeName.textContent = gaugeName;
    else this.gaugeName.remove();
    this.panelPlate = q('.hud-panel-plate');
    if (!info.gear) this.panelPlate.remove();
    this.speed = q('.hud-speed');
    this.speedNum = q('.hud-speed-num');
    this.bpm = q('.hud-bpm-num');
    if (!info.showBpm) q('.hud-bpm').remove();
    this.progressFill = q('.hud-progress-fill');
    this.elapsed = q('.hud-elapsed');
    this.total = q('.hud-total');
    this.remaining = q('.hud-remaining');

    this.fever = q('.hud-fever');
    this.fever.style.display = info.feverEnabled ? '' : 'none';
    this.feverFill = q('.hud-fever-fill');
    this.feverText = q('.hud-fever-text');
    this.lamp = q('.hud-lamp');
    this.lampText = q('.hud-lamp-text');
    this.lampFly = q('.hud-lamp-fly');
    const sparks = q('.hud-lamp-sparks');
    for (let i = 0; i < LAMP_SPARKS; i++) {
      const { dx, dy, delayMs } = lampSpark(i);
      const spark = document.createElement('i');
      spark.style.setProperty('--dx', `${dx.toFixed(2)}em`);
      spark.style.setProperty('--dy', `${dy.toFixed(2)}em`);
      spark.style.setProperty('--wait', `${delayMs}ms`);
      sparks.append(spark);
    }
    this.still = typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
    // the end's pictures: loaded while the song plays, long before they are shown
    void loadEndArt().then((art) => {
      if (!art) return;
      this.endArt = art;
      this.root.style.setProperty('--end-ring', `url("${art.url(art.index.ring.file)}")`);
      this.root.style.setProperty('--end-ring-frames', String(art.index.ring.frames));
      this.root.style.setProperty('--end-sparks', `url("${art.url(art.index.sparks.file)}")`);
      this.root.style.setProperty('--end-sparks-frames', String(art.index.sparks.frames));
    });
    this.skip = q('.hud-skip');
    q('.hud-skip kbd').textContent = info.skipKey;
    this.toast = q('.hud-toast');
    this.setCombo(0);
  }

  /**
   * Sizes the screen layer to the screen, and the song's plate no wider than the room left of the
   * gear (`p`: the track as the camera shows it at the chart's peak, see CameraFx.peak) nor than
   * what stands on it, on start, resize and an in-play change; reading the size lays the page out.
   * The plate keeps low, for the column left of the gear stands under it: on a narrow plate
   * (INFO_NAME_ROOM) the artist gives way and the difficulty stands under the title.
   */
  fit(p: HudPlane): void {
    this.screenHeight = this.root.clientHeight;
    const scale = Math.round(Math.min(MAX_SCALE, Math.max(1, this.screenHeight / BASE_HEIGHT)) * 100) / 100;
    if (scale !== this.hudScale) {
      this.hudScale = scale;
      this.root.style.setProperty('--hud-scale', String(scale));
    }
    const info = this.root.querySelector('.hud-info') as HTMLElement;
    const line = info.querySelector('.hud-line') as HTMLElement;
    const name = line.querySelector('.hud-name') as HTMLElement;
    const tier = line.querySelector('.hud-tier') as HTMLElement;
    const foot = info.querySelector<HTMLElement>('.hud-foot');
    info.classList.remove('tight');
    const widest = (parts: Iterable<HTMLElement>) => Math.max(0, ...[...parts].map((e) => e.offsetWidth));
    const padding = (box: HTMLElement) => {
      const style = getComputedStyle(box);
      return { left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight) };
    };
    const linePad = padding(line);
    // the plate's narrowest: the jacket and, beside it, the widest part of the song's line that does
    // not wrap (the difficulty with its key mode, a chip); or the sync test's rows under them
    const jacket = info.querySelector<HTMLElement>('.hud-jacket')?.offsetWidth ?? 0;
    const footPad = foot ? padding(foot) : { left: 0, right: 0 };
    const rows = foot ? widest(foot.querySelectorAll<HTMLElement>('.hud-sync')) + footPad.left + footPad.right : 0;
    const least = Math.max(jacket + widest(line.querySelectorAll<HTMLElement>('.hud-tier, .hud-chip')) + linePad.left + linePad.right, rows) + 1;
    /** Gives the plate its room (and, narrower than its narrowest, its scale); the scale. */
    const lay = (): number => {
      info.style.removeProperty('--info-scale');
      info.style.removeProperty('--info-room');
      let shrink = 1;
      // a narrower plate may wrap its line and grow: then measured again from its new foot
      for (let pass = 0; pass < 2; pass++) {
        const room = infoRoom(p.h, p.halfWidth + p.sideOut, p.far, info.offsetLeft, info.offsetTop, info.offsetTop + info.offsetHeight * shrink) - SIDE_MARGIN * scale;
        // narrower than that, the plate shrinks as a whole (on a screen narrower still it covers the gear)
        shrink = Math.min(1, Math.max(INFO_LEAST_TYPE / scale, Math.floor((room / least) * 100) / 100));
        info.style.setProperty('--info-scale', String(shrink));
        info.style.setProperty('--info-room', room < Infinity ? `${Math.max(least, Math.floor(room / shrink))}px` : '');
      }
      return shrink;
    };
    let shrink = lay();
    // the difficulty went under the name (the plate is then as wide as it may be), and beside a
    // name of some length it would not fit either: under the title, in the artist's place
    const beside = jacket + linePad.left + INFO_NAME_ROOM * scale + (parseFloat(getComputedStyle(line).columnGap) || 0) + tier.offsetWidth + linePad.right;
    if (tier.offsetTop >= name.offsetTop + name.offsetHeight && info.offsetWidth < beside) {
      info.classList.add('tight');
      shrink = lay();
    }
    // a line that wrapped leaves the plate as wide as its room: no wider than what stands on it
    // (2 px over the whole pixels read, so the widest line keeps all its parts)
    const reach = Math.max(0, ...([...line.children] as HTMLElement[]).map((e) => e.offsetLeft + e.offsetWidth));
    const used = Math.ceil(Math.max(reach + linePad.right, rows)) + 2;
    if (used < info.offsetWidth) info.style.setProperty('--info-room', `${used}px`);
    this.infoBottom = info.offsetTop + info.offsetHeight * shrink;
  }

  /**
   * Lays the plane's parts out for the camera's view of the track (on start, resize and a speed,
   * cover or position change): each is sized for the screen where it lies, and drawn longer along
   * the track where the camera flattens it. `judgeAt` and `comboAt` are plane px up the track.
   */
  layoutPlane(p: HudPlane, judgeAt: number, comboAt: number): void {
    // as high on the screen as the default camera has them, whichever camera this is
    [judgeAt, comboAt] = [p.like(judgeAt), p.like(comboAt)];
    const t = this.type;
    const hud = this.hudScale;
    const px = (v: number) => `${Math.round(v * 100) / 100}px`;
    /** Plane px for a size in screen px where (x, y) lies, and the stretch there. */
    const at = (x: number, y: number, target: number, max?: number) => {
      const { scale, aspect } = planeScale(p.h, x, y);
      return { k: hud / Math.max(scale, 1e-6), stretch: stretchFor(aspect, target, max) };
    };

    // the judgement and the combo, centred on the track; the judgement no wider than the track
    const j = at(0, -judgeAt, TEXT_ASPECT);
    this.place(this.judgeBox, 0, -judgeAt, `translate(-50%, -50%) scaleY(${j.stretch.toFixed(3)})`);
    const [fit] = this.measure(this.judgeText, [
      [this.judgeLabel, 'MAX 100%'],
    ], () => (this.judgeBox.style.fontSize = px(t.size * j.k)));
    const jk = j.k * Math.min(1, (2 * p.halfWidth - 24) / Math.max(1, fit));
    this.judgeBox.style.fontSize = px(t.size * jk);
    this.judgeBox.style.setProperty('--stroke', px(t.stroke * jk));
    // FAST / SLOW large enough to read beside the judgement, the error in ms smaller beside it
    const sub = Math.max(SUB_MIN, t.size * SUB_SHARE);
    this.judgeSub.style.fontSize = px(sub * jk);
    this.judgeSub.style.setProperty('--ms-size', px(Math.max(MS_MIN, sub * MS_SHARE) * jk));
    this.judgeSub.style.setProperty('--sub-stroke', px(Math.max(3, sub * 0.16) * jk));
    // under the judgement and its FAST / SLOW (measured as they show at their largest), drawn longer as they are:
    // the timing error bar where a player has it, then the rate
    const [, tall] = this.measure(
      this.judgeBox,
      [
        [this.judgeLabel, 'MAX 100%'],
        [this.judgeFastSlow, 'FAST'],
        [this.judgeMs, this.showErrorMs ? '+00ms' : ''],
      ],
      () => undefined,
    );
    const below = -judgeAt + (tall * j.stretch) / 2;
    const e = at(0, below, TEXT_ASPECT);
    let under = below;
    const eb = this.errorBar;
    if (eb) {
      const width = Math.min(ERROR_BAR_WIDTH * e.k, 2 * p.halfWidth - 24);
      this.place(eb.el, 0, below + ERROR_BAR_GAP * e.k * e.stretch, `translateX(-50%) scaleY(${e.stretch.toFixed(3)})`);
      eb.el.style.width = px(width);
      eb.el.style.height = px(ERROR_BAR_HEIGHT * e.k);
      eb.el.style.setProperty('--tick', px(ERROR_TICK * e.k));
      eb.el.style.setProperty('--mean', px(ERROR_MEAN * e.k));
      eb.half = width / 2;
      // the hits shown so far keep their place across the new width
      eb.errors.forEach((ms, i) => (eb.ticks[i].style.transform = errorShift(eb, ms)));
      eb.mean.style.transform = errorShift(eb, eb.meanMs);
      under = below + (ERROR_BAR_GAP + ERROR_BAR_HEIGHT) * e.k * e.stretch;
    }
    this.place(this.rateRow, 0, under + RATE_GAP * e.k * e.stretch, `translateX(-50%) scaleY(${e.stretch.toFixed(3)})`);
    this.sizeText(this.rateRow, e.k, RATE_LABEL, RATE_NUM);
    const c = at(0, -comboAt, TEXT_ASPECT);
    this.place(this.comboBox, 0, -comboAt, `translate(-50%, -50%) scaleY(${c.stretch.toFixed(3)})`);
    this.comboNum.style.fontSize = px(t.combo * c.k);
    this.comboBox.style.setProperty('--stroke', px(t.stroke * c.k));
    this.comboBox.style.setProperty('--label-size', px(16 * c.k));
    this.comboBox.style.setProperty('--label-stroke', px(Math.max(3, t.stroke - 2) * c.k));

    // beside the gear, on the same plane: FEVER level with the combo, the gauge and SPEED standing on the judge line
    const side = p.halfWidth + p.sideOut + SIDE_GAP;
    // the gauge from as high to as high on the screen as the default camera has it (a camera that lays the track
    // flatter would show the same length of track far shorter)
    const foot = -p.like(GAUGE_FROM * UNIT);
    const length = p.like((GAUGE_FROM + GAUGE_LENGTH) * UNIT) + foot;
    // the right side's stand a little further out than the left's (RIGHT_OUT)
    const right = side + RIGHT_OUT * at(side, foot, SIDE_ASPECT).k;
    const f = at(right, -comboAt, SIDE_ASPECT);
    this.place(this.fever, right, -comboAt, `translateY(-50%) scaleY(${f.stretch.toFixed(3)})`);
    this.fever.style.fontSize = px(20 * f.k);

    const g = at(right, foot, SIDE_ASPECT);
    const width = 14 * 1.3 * g.k;
    this.place(this.gauge, right, foot - length, '');
    this.gauge.style.width = px(width);
    this.gauge.style.height = px(length);
    this.gauge.style.setProperty('--cell', px(length / GAUGE_CELLS));
    this.gauge.style.setProperty('--gap', px(3 * g.k));
    const clearAt = foot - this.gaugeClearShare * length;
    this.place(this.gaugeClear, right - 6 * g.k, clearAt, 'translateY(-50%)');
    this.gaugeClear.style.width = px(width + 12 * g.k);
    this.gaugeClear.style.height = px(4 * g.k);
    const cx = right + width + 14 * g.k;
    const cl = at(cx, clearAt, SIDE_ASPECT);
    this.place(this.gaugeClearLabel, cx, clearAt, `translateY(-50%) scaleY(${cl.stretch.toFixed(3)})`);
    this.sizeText(this.gaugeClearLabel, cl.k, 15, 30);
    // the gear's name for the gauge over its far end, a gap between them, starting at the gauge's
    // left edge (centred on the gauge, a name wider than it would reach over the gear's frame)
    const nameTop = foot - length - GAUGE_NAME_GAP * g.k;
    const n = at(right, nameTop, SIDE_ASPECT);
    this.place(this.gaugeName, right, nameTop, `translate(0, -100%) scaleY(${n.stretch.toFixed(3)})`);
    this.gaugeName.style.fontSize = px(18 * n.k);
    const textX = right + width + 14 * g.k;
    const v = at(textX, foot, SIDE_ASPECT);
    this.place(this.gaugeValue, textX, foot, `translateY(-100%) scaleY(${v.stretch.toFixed(3)})`);
    this.sizeText(this.gaugeValue, v.k, 15, 30);

    // left of the gear a column standing on the judge line (under the line is the gear's own): SPEED
    // and the score panel over it (fitPanel), each upright; the score, the rate and SPEED lie in the
    // gear's deck where it has windows for them (layDeck), and the column keeps what is left
    this.layDeck(p);
    const left = side + PROGRESS_GAP * at(-side, foot, SIDE_ASPECT).k;
    const speedTop = this.onDeck ? foot : foot - this.stand(this.speed, p.h, -left, foot, hud, 15, 30);
    const panelFoot = planeYAt(p.h, -left, planePoint(p.h, -left, speedTop)[1] - COLUMN_GAP * hud);
    // the column keeps under the song's plate, and on this side of the horizon (h[4] / h[7])
    const horizon = p.h[7] < 0 ? p.h[4] / p.h[7] : -Infinity;
    const top = Math.max(this.infoBottom, horizon) + SIDE_MARGIN * hud;
    this.column = { h: p.h, x: -left, bottom: panelFoot, margin: SIDE_MARGIN * hud, top };
    this.fitPanel();
    this.movePlane(p);

    // messages under the judge line, over the gear: they hide neither the combo nor a note coming
    const [lineX, lineY] = planePoint(p.h, 0, 0);
    this.toast.style.left = px(lineX);
    this.toast.style.top = px(lineY + Math.max(0, this.screenHeight - lineY) * 0.3);
  }

  /**
   * Lays the score panel over SPEED, bottom up, a line at a time (a row of label and number, or
   * stacked, each label and each number), each sized for the screen where it lies and upright
   * there (uprightAt), so the farthest line reads as large as the nearest; in two columns every row
   * as wide as the widest, for the widest numbers usual in a play (or the live ones if wider). It
   * keeps the size the screen wants unless a line would pass the screen's edge left of the gear
   * (the gear widens toward the camera) or the column the song's plate: then smaller, down to
   * 12 px labels; below that each label stands over its number; below that again the panel leaves
   * the track and stands at the screen's lower left. The time left tops the column (over the
   * progress bar, or over the panel where that reaches higher).
   */
  private fitPanel(): void {
    const c = this.column;
    if (!c) return;
    const hud = this.hudScale;
    const wider = (el: HTMLElement, sample: string) => ((el.textContent ?? '').length > sample.length ? el.textContent ?? '' : sample);
    const samples: [HTMLElement, string][] = [
      [this.score, wider(this.score, '000,000')],
      [this.sub, wider(this.sub, '100.00%')],
      [this.maxCombo, wider(this.maxCombo, '0000')],
      [this.pace, wider(this.pace, '+00,000')],
      [this.misses, wider(this.misses, '000')],
      [this.fastCount, wider(this.fastCount, '00')],
      [this.slowCount, wider(this.slowCount, '00')],
    ];
    const rows = this.panelRows;
    if (rows.length === 0) {
      // every line is the deck's: no panel, no housing
      this.panelPlate.style.display = 'none';
      return;
    }
    const cells = rows.flatMap((row) => ([...row.children] as HTMLElement[]).reverse());
    // measured on the track (upright on the screen its rows have no box of their own), from no layout
    this.panel.classList.remove('upright');
    if (this.panel.parentElement !== this.plane) this.plane.append(this.panel);
    for (const el of [...rows, ...cells]) el.removeAttribute('style');
    /** The lines of a layout, bottom up, and each one's screen px (width, height) upright at the HUD's size. */
    const lines = (stacked: boolean): [HTMLElement[], [number, number][]] => {
      this.panel.classList.toggle('stacked', stacked);
      const els = stacked ? cells : rows;
      for (const el of els) this.sizeText(el, hud, PANEL_LABEL, PANEL_NUM);
      return [els, this.measureAll(els, samples)];
    };
    const foot = planePoint(c.h, c.x, c.bottom)[1];
    const edgeAt = (sy: number) => planePoint(c.h, c.x, planeYAt(c.h, c.x, sy))[0];
    /** The share of its size the panel keeps: every line clear of the screen's edge, the column under the plate. */
    const share = (sizes: [number, number][], widest: number | null): number => {
      const tall = sizes.reduce((sum, [, ht]) => sum + ht, 0);
      let k = Math.min(1, (foot - c.top) / tall);
      // a smaller panel lies lower, where the gear is wider: once more for the lines' new places
      for (let pass = 0; pass < 2; pass++) {
        let sy = foot;
        let least = k;
        for (const [w, ht] of sizes) {
          least = Math.min(least, (edgeAt(sy) - c.margin) / (widest ?? w));
          sy -= ht * k;
        }
        k = Math.min(k, least);
      }
      return k;
    };
    // two columns, every row as wide as the widest; else stacked, each line its own width
    let [els, sizes] = lines(false);
    let widest: number | null = Math.max(...sizes.map(([w]) => w));
    let k = share(sizes, widest);
    if (k < PANEL_MIN_SHRINK) {
      [els, sizes] = lines(true);
      widest = null;
      k = share(sizes, null);
    }
    if (k < PANEL_MIN_SHRINK) {
      // no room on the track at a readable size: upright on the screen, in two columns at full size
      this.panel.classList.remove('stacked');
      this.panel.classList.add('upright');
      this.root.append(this.panel);
      this.panelPlate.style.display = 'none';
      for (const el of [...rows, ...cells]) el.removeAttribute('style');
      this.sizeText(this.panel, hud, PANEL_LABEL, PANEL_NUM);
    } else {
      let y = c.bottom;
      let left = c.x;
      let pad = 0;
      els.forEach((el, i) => {
        const ht = sizes[i][1];
        const u = uprightAt(c.h, c.x, planeYAt(c.h, c.x, planePoint(c.h, c.x, y)[1] - (ht * k) / 2));
        this.sizeText(el, hud * k * u.k, PANEL_LABEL, PANEL_NUM);
        // two columns line up: every row as wide on the screen as the widest (a live number wider still grows it leftward)
        if (widest !== null) el.style.minWidth = `${Math.round(widest * k * u.k * 100) / 100}px`;
        this.place(el, c.x, y, `translate(-100%, -100%) scaleY(${u.stretch.toFixed(3)})`);
        if (i === 0) pad = PLATE_PAD * hud * k * u.k;
        left = Math.min(left, c.x - el.offsetWidth);
        y -= ht * k * u.k * u.stretch;
      });
      // the gear's housing lying under the lines
      this.panelPlate.style.display = '';
      this.place(this.panelPlate, left - pad, y - pad, '');
      this.panelPlate.style.width = `${Math.round((c.x - left + 2 * pad) * 100) / 100}px`;
      this.panelPlate.style.height = `${Math.round((c.bottom - y + 2 * pad) * 100) / 100}px`;
    }
  }

  /**
   * The score, SPEED and the rate in the windows of the gear's deck (HudPlane.deck), each upright in
   * the middle of its window and no larger than the window lets it be; the panel left of the gear
   * then keeps only what a player asked for beside them (the pacemaker, the judge counter): MAX COMBO
   * goes, the combo standing on the track. A gear without windows leaves all of it in the column.
   */
  private layDeck(p: HudPlane): void {
    const d = p.deck;
    const on = d !== null;
    // on a panel's display the readouts are light on its dark glass, whatever the gear's windows drawn in code take
    this.root.toggleAttribute('data-panel', Boolean(d?.panel));
    if (on !== this.onDeck) {
      this.onDeck = on;
      const moved = [this.scoreRow];
      const kept = this.allRows.filter((row) => !on || (!moved.includes(row) && row !== this.maxComboRow));
      this.panel.replaceChildren(...kept);
      if (on) this.plane.append(...moved);
      else this.maxComboRow.removeAttribute('style');
      for (const el of [...moved, this.speed]) {
        el.classList.toggle('on-deck', on);
        el.removeAttribute('style');
      }
      this.panelRows = [...kept].reverse();
    }
    if (!d) return;
    const hud = this.hudScale;
    const lay = (el: HTMLElement, box: { x: number; y: number; w: number; h: number }, num: number) => {
      const [cx, cy] = [box.x + box.w / 2, box.y + box.h / 2];
      const u = uprightAt(p.h, cx, cy);
      const { scale, aspect } = planeScale(p.h, cx, cy);
      // its type's size no more than the window's depth as the screen shows it (however flat the camera
      // lays the deck: `aspect`; digits and capitals are seven tenths of their size tall, so they stand
      // clear of the window's edges), nor than the HUD's size
      const tall = Math.min(num * hud, box.h * scale * aspect);
      let k = (tall / num) * u.k;
      this.sizeText(el, k, PANEL_LABEL * (num / PANEL_NUM), num);
      const wide = el.offsetWidth;
      if (wide > box.w * 0.9) {
        k *= (box.w * 0.9) / wide;
        this.sizeText(el, k, PANEL_LABEL * (num / PANEL_NUM), num);
      }
      this.place(el, cx, cy, `translate(-50%, -50%) scaleY(${u.stretch.toFixed(3)})`);
    };
    lay(this.scoreRow, d.score, DECK_SCORE);
    lay(this.speed, d.speed, DECK_SMALL);
  }

  /**
   * Sizes a block of labels and numbers (`label`, `num` screen px, times `size`) upright for where
   * its top line lies (the lines under it are nearer, so larger) and stands its lower right corner
   * at (x, y) of the plane; how far up the track it reaches (plane px).
   */
  private stand(el: HTMLElement, h: readonly number[], x: number, y: number, size: number, label: number, num: number): number {
    this.sizeText(el, size, label, num);
    const tall = el.offsetHeight;
    const first = el.firstElementChild as HTMLElement;
    const u = uprightAt(h, x, planeYAt(h, x, planePoint(h, x, y)[1] - tall + first.offsetTop + first.offsetHeight / 2));
    this.sizeText(el, size * u.k, label, num);
    this.place(el, x, y, `translate(-100%, -100%) scaleY(${u.stretch.toFixed(3)})`);
    return tall * u.k * u.stretch;
  }

  /** How large each of `els` lays out (px) with these texts in place of the live ones. */
  private measureAll(els: HTMLElement[], samples: [HTMLElement, string][]): [number, number][] {
    const live = samples.map(([el]) => el.innerHTML);
    samples.forEach(([el, text]) => (el.textContent = text));
    const sizes = els.map((el): [number, number] => [el.offsetWidth, el.offsetHeight]);
    samples.forEach(([el], i) => (el.innerHTML = live[i]));
    return sizes;
  }

  /** How large `box` lays out (plane px) with these texts in place of the live ones, sized by `size` first. */
  private measure(box: HTMLElement, samples: [HTMLElement, string][], size: () => void): [number, number] {
    size();
    const live = samples.map(([el]) => el.innerHTML);
    samples.forEach(([el, text]) => (el.textContent = text));
    const measured: [number, number] = [box.scrollWidth, box.scrollHeight];
    samples.forEach(([el], i) => (el.innerHTML = live[i]));
    return measured;
  }

  /** Labels and numbers of a block on the plane, `k` plane px to a screen px (gaps scale with the numbers). */
  private sizeText(el: HTMLElement, k: number, label: number, num: number): void {
    const px = (v: number) => `${Math.round(v * k * 100) / 100}px`;
    el.style.setProperty('--label', px(label));
    el.style.setProperty('--num', px(num));
    el.style.setProperty('--gap', px((28 * num) / 30));
    el.style.setProperty('--label-gap', px(6));
  }

  /** Moves the plane with the camera (its tilt and zoom); the parts keep their layout. */
  movePlane(p: HudPlane): void {
    const matrix = planeMatrix(p.h);
    if (matrix === this.lastMatrix) return;
    this.lastMatrix = matrix;
    this.plane.style.transform = matrix;
  }

  private place(el: HTMLElement, x: number, y: number, transform: string): void {
    el.style.left = `${Math.round(x * 100) / 100}px`;
    el.style.top = `${Math.round(y * 100) / 100}px`;
    el.style.transform = transform;
  }

  /** SPEED beside the gear (on start and when it changes). */
  setSpeed(hiSpeed: number): void {
    this.speedNum.textContent = speedText(hiSpeed);
  }

  /** The sync test's offsets (ms) under the song's line, written when they change. */
  setSyncOffsets(visualMs: number, inputMs: number): void {
    const key = `${visualMs} ${inputMs}`;
    if (key === this.lastSync) return;
    this.lastSync = key;
    const text = (ms: number) => `${ms > 0 ? '+' : ''}${ms}ms`;
    if (this.syncVisual) this.syncVisual.textContent = text(visualMs);
    if (this.syncInput) this.syncInput.textContent = text(inputMs);
  }

  showJudge(e: JudgeEvent, perfNow: number): void {
    this.judgeAt = perfNow;
    this.judgeLabel.innerHTML = judgementHtml(e.label, Boolean(this.type.split), Boolean(this.type.fill));
    this.judgeLabel.className = `hud-judge-label ${e.cls}`;
    // FAST / SLOW off the best judgement, the error in whole ms (exact ones in a neutral colour)
    const error = e.isBreak ? null : e.errorMs;
    this.judgeFastSlow.textContent = error !== null && e.percent < 100 ? (error < 0 ? 'FAST' : 'SLOW') : '';
    this.judgeMs.textContent = error !== null && this.showErrorMs ? errorText(error) : '';
    this.judgeSub.className = `hud-judge-sub ${error !== null ? errorKind(error) : ''}`;
    if (error !== null && this.errorBar) markError(this.errorBar, error);
    // restart the pop animation
    this.judgePop.classList.remove('pop');
    void this.judgePop.offsetWidth;
    this.judgePop.classList.add('pop');
    this.judgeBox.style.opacity = this.judgeOpacity;
    this.setCombo(e.combo);
  }

  setCombo(combo: number): void {
    if (combo === this.lastCombo) return;
    const rose = combo > this.lastCombo && combo >= 2;
    this.lastCombo = combo;
    const text = combo >= 2 ? String(combo) : '';
    this.comboNum.textContent = text;
    if (this.type.fill) this.comboNum.dataset.text = text;
    this.comboBox.style.visibility = combo >= 2 ? 'visible' : 'hidden';
    if (rose && this.bumpCombo) {
      // a transform animation: runs on the compositor, no layout per hit
      this.comboBump?.cancel();
      this.comboBump = this.comboNum.animate(COMBO_BUMP, { duration: COMBO_BUMP_MS, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' });
    }
  }

  /** Short message under the judge line (hi-speed, covers, practice). */
  showToast(text: string, perfNow: number): void {
    this.toastAt = perfNow;
    this.toast.textContent = text;
    this.toast.style.opacity = '1';
  }

  /**
   * Back to how a play starts (a retry, a practice loop): no combo, judgement, message, banner,
   * and every shown value written again at the next update.
   */
  reset(): void {
    this.comboBump?.cancel();
    this.comboBump = null;
    this.setCombo(0);
    this.judgeAt = -Infinity;
    this.judgeBox.style.opacity = '0';
    this.toastAt = -Infinity;
    this.toast.style.opacity = '0';
    const eb = this.errorBar;
    if (eb) {
      for (const el of [...eb.ticks, eb.mean]) el.style.opacity = '0';
      eb.errors.length = 0;
      eb.next = 0;
      eb.meanMs = 0;
      delete eb.el.dataset.meanMs;
    }
    this.hideLamp();
    this.lastScore = -1;
    this.lastSub = '';
    this.lastMaxCombo = -1;
    this.lastPace = undefined;
    this.lastGauge = -1;
    this.lastFever = '';
    this.lastProgress = -1;
    this.lastRemaining = -1;
    this.lastBpm = -1;
    this.lastSkip = null;
    this.lastCounts = '';
  }

  update(perfNow: number, stats: HudStats): void {
    if (perfNow - this.judgeAt > JUDGE_VISIBLE_MS) this.judgeBox.style.opacity = '0';
    if (perfNow - this.toastAt > TOAST_MS) this.toast.style.opacity = '0';
    if (stats.score !== this.lastScore) {
      const text = stats.score.toLocaleString('en-US');
      // a score wider than the panel was laid out for (a perfect 1,000,000) refits it, once
      const grew = text.length > 7 && text.length > (this.score.textContent ?? '').length;
      this.lastScore = stats.score;
      this.score.textContent = text;
      if (grew) this.fitPanel();
    }
    if (stats.sub !== this.lastSub) {
      this.lastSub = stats.sub;
      this.sub.textContent = stats.sub;
    }
    if (stats.maxCombo !== this.lastMaxCombo) {
      this.lastMaxCombo = stats.maxCombo;
      this.maxCombo.textContent = String(stats.maxCombo);
    }
    const pace = stats.pace === null ? null : Math.round(stats.pace);
    if (pace !== this.lastPace) {
      this.lastPace = pace;
      // a dash: nothing to compare with (a best without its replay under EX-SCORE or 등급형)
      this.pace.textContent = pace === null ? '—' : `${pace >= 0 ? '+' : '−'}${Math.abs(pace).toLocaleString('en-US')}`;
      this.pace.className = `hud-num hud-pace ${pace === null ? '' : pace < 0 ? 'behind' : 'ahead'}`;
    }
    if (this.counter) {
      const counts = `${stats.breaks}|${stats.fast}|${stats.slow}`;
      if (counts !== this.lastCounts) {
        this.lastCounts = counts;
        this.misses.textContent = String(stats.breaks);
        this.fastCount.textContent = String(stats.fast);
        this.slowCount.textContent = String(stats.slow);
      }
    }
    const gauge = gaugeShown(stats.gauge, this.survival);
    if (gauge !== this.lastGauge) {
      this.lastGauge = gauge;
      // whole cells from the bottom (a clip, no layout while playing), rounded down as the number
      const cells = gaugeCells(gauge);
      this.gaugeFill.style.clipPath = `inset(${(100 * (GAUGE_CELLS - cells)) / GAUGE_CELLS}% 0 0 0)`;
      this.gaugeNum.textContent = `${gauge}%`;
      this.gaugeValue.classList.toggle('cleared', !this.survival && stats.gauge >= this.gaugeClearShare * 100);
    }
    const progress = Math.round(Math.min(1, Math.max(0, stats.progress)) * PROGRESS_STEPS);
    if (progress !== this.lastProgress) {
      this.lastProgress = progress;
      this.progressFill.style.transform = `scaleX(${progress / PROGRESS_STEPS})`;
    }
    const remaining = Math.ceil(Math.max(0, stats.remainingMs) / 1000 - 1e-6);
    if (remaining !== this.lastRemaining) {
      this.lastRemaining = remaining;
      this.remaining.textContent = clockText(remaining * 1000);
    }
    // how long the song is, from how far in it is and what is left (told once it has begun)
    if (stats.progress > 0.002 && stats.progress < 0.995) {
      const total = stats.remainingMs / (1 - stats.progress);
      if (Math.abs(total - this.totalMs) > 1500) {
        this.totalMs = total;
        this.total.textContent = ` / ${clockText(total)}`;
      }
    }
    const elapsed = Math.floor(Math.max(0, this.totalMs - Math.max(0, stats.remainingMs)) / 1000 + 1e-6);
    if (elapsed !== this.lastElapsed) {
      this.lastElapsed = elapsed;
      this.elapsed.textContent = clockText(elapsed * 1000);
    }
    if (stats.bpm !== this.lastBpm) {
      this.lastBpm = stats.bpm;
      this.bpm.textContent = String(stats.bpm);
    }
    if (stats.skip !== this.lastSkip) {
      this.lastSkip = stats.skip;
      this.skip.style.opacity = stats.skip ? '1' : '0';
    }
    const f = stats.fever;
    const fill = f.active ? f.remaining : f.gauge;
    const text = f.active ? `FEVER x${f.multiplier}` : f.ready && this.feverManualKey ? `FEVER READY · ${this.feverManualKey}` : 'FEVER';
    const key = `${text}|${Math.round(fill * 200)}|${f.active}|${f.ready}`;
    if (key !== this.lastFever) {
      this.lastFever = key;
      this.feverText.textContent = text;
      this.feverFill.style.transform = `scaleX(${Math.round(fill * 1000) / 1000})`;
      this.fever.className = `hud-fever ${f.active ? `active x${f.multiplier}` : f.ready ? 'ready' : ''}`;
    }
  }

  /**
   * The end of a play: its lamp in the middle of the screen, the judgement and the combo out of its way.
   * `kind` is the lamp's class (lamps.LAMP_CLASS; `aided`: a play that earns none), kept on data-lamp. A clear
   * shows no word: its mark alone, struck like a seal with a ring running out from it, or for a hard clear its
   * two halves closing on each other with sparks along the seam. A full combo, an all-perfect play, a failed
   * one and a play without a lamp show their words: a full combo's after the combo's number has flown to the
   * middle, a failed play's sinking, or breaking up when it failed halfway (`crashed`). The element stays where
   * it is, as large as what it ends with, until the HUD is reset or disposed.
   *
   * Only a lamp the play earned is named data-testid="hud-lamp": the result screen sends its stamp over from
   * where that one stands (jacketFlight), and a play without a lamp (autoplay, a practice's end) gives it
   * nothing to start from, though its words show as well.
   */
  showLamp(text: string, kind: string, crashed = false): void {
    const worded = WORDED_LAMPS.has(kind);
    // where the combo's number is, before it leaves with the judgement
    const combo = kind === 'maxcombo' && !this.still ? this.comboNum.getBoundingClientRect() : null;
    if (kind === 'aided') this.lamp.removeAttribute('data-testid');
    else this.lamp.dataset.testid = 'hud-lamp';
    this.lamp.dataset.lamp = kind;
    this.lamp.setAttribute('aria-label', text);
    this.lampText.textContent = worded ? text : '';
    this.lamp.className = `hud-lamp show ${kind} lamp-${kind} ${worded ? 'worded' : 'sealed'}${crashed ? ' crashed' : ''}${this.pictureLamp(kind, text) ? ' pictured' : ''}`;
    this.root.classList.add('ended');
    if (combo && combo.width > 0 && this.comboNum.textContent) this.flyCombo(combo);
    else this.lamp.classList.add('at-once');
  }

  /**
   * The lamp's picture from the end's pictures (endArt), where there is one: its words as lettering sized by
   * the letters in it (a play without a lamp: the words it ends with, `text`), or its seal. False: the styles
   * draw the lamp (the words as type, the seal as its mark).
   */
  private pictureLamp(kind: string, text: string): boolean {
    const art = this.endArt;
    const [words, seal] = [art?.index.words[kind === 'aided' ? (AIDED_WORDS[text] ?? '') : kind], art?.index.seals[kind]];
    const style = this.lamp.style;
    for (const name of ['--art', '--art-w', '--art-h', '--art-lift']) style.removeProperty(name);
    if (!art || (!words && !seal)) return false;
    style.setProperty('--art', `url("${art.url((words ?? seal)!.file)}")`);
    if (words) {
      const box = wordsBox(words.size, words.band, WORDS_CAP_EM);
      style.setProperty('--art-w', `${box.width.toFixed(3)}em`);
      style.setProperty('--art-h', `${box.height.toFixed(3)}em`);
      style.setProperty('--art-lift', `${box.lift.toFixed(3)}em`);
    }
    return true;
  }

  /** The combo's number, from where it stood (`from`) to the middle of the lamp, where the words take its place. */
  private flyCombo(from: DOMRect): void {
    const root = this.root.getBoundingClientRect();
    const to = this.lamp.getBoundingClientRect();
    const fly = this.lampFly;
    fly.textContent = this.comboNum.textContent;
    fly.style.color = getComputedStyle(this.comboNum).color;
    fly.style.fontSize = `${from.height}px`;
    fly.style.left = `${from.left + from.width / 2 - root.left}px`;
    fly.style.top = `${from.top + from.height / 2 - root.top}px`;
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const grow = Math.min(2.2, Math.max(1, (to.height * 0.9) / Math.max(1, from.height)));
    this.comboFlight?.cancel();
    this.comboFlight = fly.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${grow})`, opacity: 1, offset: 0.82 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${grow * 1.25})`, opacity: 0 },
      ],
      { duration: COMBO_FLIGHT_MS / 0.82, easing: 'cubic-bezier(0.5, 0, 0.2, 1)', fill: 'both' },
    );
  }

  /** A play that ends failed with its gauge short of the line: what is left of the gauge runs out, red. */
  drainGauge(): void {
    this.gauge.classList.add('drain');
  }

  /** The whole HUD but the lamp loses its colour (a play that failed halfway). */
  setFailed(on: boolean): void {
    this.root.classList.toggle('failed', on);
  }

  hideLamp(): void {
    this.comboFlight?.cancel();
    this.comboFlight = null;
    this.lamp.className = 'hud-lamp';
    this.lamp.removeAttribute('data-testid');
    delete this.lamp.dataset.lamp;
    this.lamp.removeAttribute('aria-label');
    this.lampText.textContent = '';
    this.gauge.classList.remove('drain');
    this.root.classList.remove('ended', 'failed');
  }

  dispose(): void {
    this.root.innerHTML = '';
  }
}

/**
 * The gauge as shown: whole percent, rounded down, so it never reads 80 % before it clears at 80 %
 * (a survival gauge still alive shows at least 1 %).
 */
export function gaugeShown(value: number, survival: boolean): number {
  const v = Math.min(100, Math.max(0, value));
  const shown = Math.floor(v + 1e-9);
  return survival && v > 0 ? Math.max(1, shown) : shown;
}

/** Where an error (+ = late) lies across the error bar: -1 at the widest window's early edge, 1 at its late edge, past them at the edge. */
export function errorBarAt(errorMs: number, outerMs: number): number {
  return Math.min(1, Math.max(-1, errorMs / outerMs));
}

/** The transform that moves a tick (or the mean) of the error bar from its middle to an error. */
function errorShift(bar: ErrorBar, errorMs: number): string {
  return `translateX(${(errorBarAt(errorMs, bar.outerMs) * bar.half).toFixed(2)}px)`;
}

/**
 * A hit on the error bar: the next tick (the oldest once all are used) moves to its error, the
 * newest brightest and each older one fainter, and the mean of the hits shown follows. Only
 * transforms and opacity, on a judgement: nothing a frame.
 */
export function markError(bar: ErrorBar, errorMs: number): void {
  const { ticks, errors } = bar;
  errors[bar.next] = errorMs;
  const tick = ticks[bar.next];
  tick.className = `hud-eb-tick ${errorKind(errorMs)}`;
  tick.style.transform = errorShift(bar, errorMs);
  for (let age = 0; age < errors.length; age++) ticks[(bar.next - age + ERROR_TICKS) % ERROR_TICKS].style.opacity = String((100 - (80 * age) / ERROR_TICKS) / 100);
  bar.next = (bar.next + 1) % ERROR_TICKS;
  bar.meanMs = errors.reduce((sum, ms) => sum + ms, 0) / errors.length;
  bar.mean.style.transform = errorShift(bar, bar.meanMs);
  bar.mean.style.opacity = '1';
  bar.el.dataset.meanMs = String(Math.round(bar.meanMs));
}

/** The gauge's lit cells for a shown percent (rounded down: a cell is lit once it is full). */
export function gaugeCells(shown: number): number {
  return Math.floor((shown * GAUGE_CELLS) / 100 + 1e-9);
}
