import type { JudgeEvent } from '../engine/session';
import type { HudPlane } from '../render/TrackRenderer';
import { HUD_FONTS, type HudType } from '../render/skins';
import { clockText, errorKind, errorText, speedText } from './format';

export interface HudInfo {
  title: string;
  keyMode: string;
  /** Difficulty chip: "DJMAX MX" on the tier colour and the level ("Lv.12", "SC 8"; empty when none). */
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
  /** The skin's judgement and combo type. */
  type: HudType;
  /** Opacity of the judgement and the combo, so notes behind them show through (1 = solid). */
  judgementOpacity: number;
  /** The miss label (BREAK, MISS, POOR) of the counts under the score panel; null shows none. */
  counterMissLabel: string | null;
  /** The current BPM under SPEED (charts that change tempo, or BPM-linked scrolling). */
  showBpm: boolean;
  /** The key that skips a long intro. */
  skipKey: string;
}

export interface HudStats {
  score: number;
  sub: string;
  maxCombo: number;
  gauge: number;
  ready: string;
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
/** The song's progress: a thin bar left of the gear, as long as the gauge right of it (screen px wide, and its gap to the panel). */
const PROGRESS_WIDTH = 5;
const PROGRESS_GAP = 12;
/** Screen px between SPEED and the score panel, and between the panel (or the bar) and the time left over it. */
const COLUMN_GAP = 18;
const TIME_GAP = 8;
/** Steps the progress bar moves in (one transform each). */
const PROGRESS_STEPS = 500;
/** Plane px per track unit (HUD_UNIT; kept here so the plane's sizes read as the sheets' px). */
const UNIT = 73.65;
/** Space between the gear and what stands beside it (plane px), and between the score panel and the screen's edge (screen px). */
const SIDE_GAP = 22;
const SIDE_MARGIN = 16;
/**
 * Where the room beside the gear is narrower than the song's plate's widest part, the plate shrinks,
 * its type to no less than this share of its size at 720p.
 */
const INFO_LEAST_TYPE = 0.8;
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

/** Loads a skin's type before the play starts, so the first judgement is not drawn in a fallback font. */
export function loadHudFont(type: HudType): Promise<unknown> {
  const f = HUD_FONTS[type.font];
  const load = document.fonts?.load(`${f.italic ? 'italic ' : ''}${f.weight} 40px '${type.font}'`, 'MAX 100% COMBO 0123456789');
  return load ? load.catch(() => null) : Promise.resolve(null);
}

/** "MAX 100%" with its first word in white (a split type), else the whole label in the judgement's colour. */
function judgementHtml(label: string, split: boolean): string {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const space = label.indexOf(' ');
  if (!split || space < 0) return esc(label);
  return `<span class="hud-split">${esc(label.slice(0, space))}</span> ${esc(label.slice(space + 1))}`;
}

/**
 * Imperative DOM overlay; only touches the DOM when a value changes. The song (title, level, key
 * mode, how the play runs) and the messages sit on the screen; the judgement, combo, score panel,
 * gauge, speed, progress and FEVER lie on the track (one plane under the camera's projection: they
 * tilt and zoom with it).
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
  private readonly judgeCombo: HTMLElement;
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
  /** The panel's rows, from the bottom up. */
  private readonly panelRows: HTMLElement[];
  private readonly gauge: HTMLElement;
  private readonly gaugeFill: HTMLElement;
  private readonly gaugeClear: HTMLElement;
  private readonly gaugeClearLabel: HTMLElement;
  private readonly gaugeValue: HTMLElement;
  private readonly gaugeNum: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly speedNum: HTMLElement;
  private readonly bpm: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly progressFill: HTMLElement;
  private readonly progressTime: HTMLElement;
  private readonly remaining: HTMLElement;
  private readonly fever: HTMLElement;
  private readonly feverFill: HTMLElement;
  private readonly feverText: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly ready: HTMLElement;
  private readonly skip: HTMLElement;
  private readonly toast: HTMLElement;
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
  /** null: not written yet ('' is no READY, a value shown too). */
  private lastReady: string | null = null;
  private lastFever = '';
  private lastProgress = -1;
  private lastRemaining = -1;
  private lastBpm = -1;
  private lastSkip: boolean | null = null;
  private lastCounts = '';
  private lastMatrix = '';
  /** Where the screen's top keeps clear of the song's plate (px). */
  private infoBottom = 0;
  /**
   * The column left of the gear from the last layout: the plane, the panel's right edge and foot
   * over SPEED, the progress bar's right edge and top (plane px), and the screen's margins (px).
   */
  private column: { h: readonly number[]; x: number; bottom: number; barX: number; barTop: number; margin: number; top: number } | null = null;

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
        <div class="hud-head"><span class="hud-title"></span><span class="hud-diff"><span class="hud-diff-tier"></span><span class="hud-diff-level"></span></span><span class="hud-keymode"></span></div>
      </div>
      <div class="hud-plane">
        <div class="hud-judge"><div class="hud-judge-pop"><div class="hud-judge-text"><span class="hud-judge-label"></span><span class="hud-judge-combo"></span></div><i class="hud-judge-bar"></i><div class="hud-judge-sub"><span class="hud-judge-fs"></span><span class="hud-judge-ms"></span></div></div></div>
        <div class="hud-combo"><div class="hud-combo-num"></div><div class="hud-combo-label">COMBO</div></div>
        <div class="hud-fever" data-testid="hud-fever"><span class="hud-fever-text"></span><span class="hud-fever-bar"><i class="hud-fever-fill"></i></span></div>
        <div class="hud-speed"><span class="hud-label">SPEED</span><span class="hud-num hud-speed-num" data-testid="hud-speed"></span><span class="hud-label hud-bpm" data-testid="hud-bpm">BPM <b class="hud-bpm-num"></b></span></div>
        <div class="hud-progress" data-testid="hud-progress"><i class="hud-progress-fill"></i></div>
        <div class="hud-progress-time"><span class="hud-num hud-remaining" data-testid="hud-remaining"></span></div>
        <div class="hud-gauge"><i class="hud-gauge-fill"></i></div>
        <i class="hud-gauge-clear"></i>
        <div class="hud-gauge-clear-label"><span class="hud-label">CLEAR</span></div>
        <div class="hud-gauge-value" data-testid="hud-gauge"><span class="hud-num hud-gauge-num"></span><span class="hud-label hud-gauge-type"></span></div>
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
      <div class="hud-ready" data-testid="hud-ready"></div>
      <div class="hud-skip" data-testid="hud-skip"><kbd></kbd> 건너뛰기</div>
      <div class="hud-banner" data-testid="hud-banner"></div>`;
    const q = (sel: string) => root.querySelector(sel) as HTMLElement;
    q('.hud-title').textContent = info.title;
    q('.hud-diff').style.setProperty('--diff', info.difficulty.color);
    q('.hud-diff-tier').textContent = info.difficulty.label;
    q('.hud-diff-level').textContent = info.difficulty.level;
    q('.hud-keymode').textContent = info.keyMode;
    if (info.chips.length > 0) {
      // under the song's line, so a long title keeps its room
      const chips = document.createElement('div');
      chips.className = 'hud-chips';
      for (const text of info.chips) {
        const chip = document.createElement('span');
        chip.className = 'hud-chip';
        chip.textContent = text;
        chips.append(chip);
      }
      q('.hud-info').append(chips);
    }
    root.dataset.mode = info.mode;
    root.dataset.keysounds = info.keysounds.join(' ');

    // the skin's type on the whole HUD: the plane's judgement and combo, and the end banner
    const t = info.type;
    const font = HUD_FONTS[t.font];
    root.style.setProperty('--hud-font', `'${t.font}'`);
    root.style.setProperty('--hud-weight', String(font.weight));
    root.style.setProperty('--hud-style', font.italic ? 'italic' : 'normal');
    root.style.setProperty('--hud-tracking', `${t.tracking}em`);
    root.style.setProperty('--hud-outline', t.outline);
    root.style.setProperty('--hud-stroke', `${t.stroke}px`);
    root.style.setProperty('--judge-max', t.max);
    this.plane = q('.hud-plane');
    this.plane.classList.toggle('inline', Boolean(t.inline));
    this.comboBox = q('.hud-combo');
    this.comboBox.style.opacity = this.judgeOpacity;
    this.comboNum = q('.hud-combo-num');
    this.judgeBox = q('.hud-judge');
    this.judgePop = q('.hud-judge-pop');
    this.judgeLabel = q('.hud-judge-label');
    this.judgeCombo = q('.hud-judge-combo');
    this.judgeSub = q('.hud-judge-sub');
    this.judgeFastSlow = q('.hud-judge-fs');
    this.judgeMs = q('.hud-judge-ms');
    this.judgeText = q('.hud-judge-text');
    if (t.skew) this.judgeText.style.transform = `skewX(${t.skew}deg)`;
    const bar = q('.hud-judge-bar');
    if (t.bar) bar.style.background = t.bar;
    else bar.remove();

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
    this.panelRows = ([...this.panel.children] as HTMLElement[]).reverse();

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
    this.speed = q('.hud-speed');
    this.speedNum = q('.hud-speed-num');
    this.bpm = q('.hud-bpm-num');
    if (!info.showBpm) q('.hud-bpm').remove();
    this.progress = q('.hud-progress');
    this.progressFill = q('.hud-progress-fill');
    this.progressTime = q('.hud-progress-time');
    this.remaining = q('.hud-remaining');

    this.fever = q('.hud-fever');
    this.fever.style.display = info.feverEnabled ? '' : 'none';
    this.feverFill = q('.hud-fever-fill');
    this.feverText = q('.hud-fever-text');
    this.banner = q('.hud-banner');
    this.ready = q('.hud-ready');
    this.skip = q('.hud-skip');
    q('.hud-skip kbd').textContent = info.skipKey;
    this.toast = q('.hud-toast');
    this.setCombo(0);
  }

  /**
   * Sizes the screen layer to the screen, and the song's plate no wider than the room left of the
   * gear (`p`: the track as the camera shows it at the chart's peak, see CameraFx.peak), on start,
   * resize and an in-play change; reading the size lays the page out.
   */
  fit(p: HudPlane): void {
    this.screenHeight = this.root.clientHeight;
    const scale = Math.round(Math.min(MAX_SCALE, Math.max(1, this.screenHeight / BASE_HEIGHT)) * 100) / 100;
    if (scale !== this.hudScale) {
      this.hudScale = scale;
      this.root.style.setProperty('--hud-scale', String(scale));
    }
    const info = this.root.querySelector('.hud-info') as HTMLElement;
    info.style.removeProperty('--info-scale');
    info.style.removeProperty('--info-room');
    // the plate's narrowest: its widest part that does not wrap (the difficulty, the key mode, a chip)
    const style = getComputedStyle(info);
    const parts = [...info.querySelectorAll<HTMLElement>('.hud-diff, .hud-keymode, .hud-chip')];
    const least = Math.max(0, ...parts.map((e) => e.offsetWidth)) + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 1;
    let shrink = 1;
    // a narrower plate may wrap its chips and grow: then measured again from its new foot
    for (let pass = 0; pass < 2; pass++) {
      const room = infoRoom(p.h, p.halfWidth + p.sideOut, p.far, info.offsetLeft, info.offsetTop, info.offsetTop + info.offsetHeight * shrink) - SIDE_MARGIN * scale;
      // narrower than that, the plate shrinks as a whole (on a screen narrower still it covers the gear)
      shrink = Math.min(1, Math.max(INFO_LEAST_TYPE / scale, Math.floor((room / least) * 100) / 100));
      info.style.setProperty('--info-scale', String(shrink));
      info.style.setProperty('--info-room', room < Infinity ? `${Math.max(least, Math.floor(room / shrink))}px` : '');
    }
    this.infoBottom = info.offsetTop + info.offsetHeight * shrink;
  }

  /**
   * Lays the plane's parts out for the camera's view of the track (on start, resize and a speed,
   * cover or position change): each is sized for the screen where it lies, and drawn longer along
   * the track where the camera flattens it. `judgeAt` and `comboAt` are plane px up the track.
   */
  layoutPlane(p: HudPlane, judgeAt: number, comboAt: number): void {
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
      [this.judgeCombo, t.inline ? '0000' : ''],
    ], () => (this.judgeBox.style.fontSize = px(t.size * j.k)));
    const jk = j.k * Math.min(1, (2 * p.halfWidth - 24) / Math.max(1, fit));
    this.judgeBox.style.fontSize = px(t.size * jk);
    this.judgeBox.style.setProperty('--stroke', px(t.stroke * jk));
    // FAST / SLOW large enough to read beside the judgement, the error in ms smaller beside it
    const sub = Math.max(SUB_MIN, t.size * SUB_SHARE);
    this.judgeSub.style.fontSize = px(sub * jk);
    this.judgeSub.style.setProperty('--ms-size', px(Math.max(MS_MIN, sub * MS_SHARE) * jk));
    this.judgeSub.style.setProperty('--sub-stroke', px(Math.max(3, sub * 0.16) * jk));
    const c = at(0, -comboAt, TEXT_ASPECT);
    this.place(this.comboBox, 0, -comboAt, `translate(-50%, -50%) scaleY(${c.stretch.toFixed(3)})`);
    this.comboNum.style.fontSize = px(t.combo * c.k);
    this.comboBox.style.setProperty('--stroke', px(t.stroke * c.k));
    this.comboBox.style.setProperty('--label-size', px(16 * c.k));
    this.comboBox.style.setProperty('--label-stroke', px(Math.max(3, t.stroke - 2) * c.k));

    // beside the gear, on the same plane: FEVER level with the combo, the gauge and SPEED standing on the judge line
    const right = p.halfWidth + p.sideOut + SIDE_GAP;
    const foot = -GAUGE_FROM * UNIT;
    const length = GAUGE_LENGTH * UNIT;
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
    const textX = right + width + 14 * g.k;
    const cl = at(textX, clearAt, SIDE_ASPECT);
    this.place(this.gaugeClearLabel, textX, clearAt, `translateY(-50%) scaleY(${cl.stretch.toFixed(3)})`);
    this.sizeText(this.gaugeClearLabel, cl.k, 15, 30);
    const v = at(textX, foot, SIDE_ASPECT);
    this.place(this.gaugeValue, textX, foot, `translateY(-100%) scaleY(${v.stretch.toFixed(3)})`);
    this.sizeText(this.gaugeValue, v.k, 15, 30);

    // left of the gear, as the gauge is right of it: the song's progress up the track
    const pr = at(-right, foot, SIDE_ASPECT);
    const barWidth = PROGRESS_WIDTH * pr.k;
    this.place(this.progress, -right - barWidth, foot - length, '');
    this.progress.style.width = px(barWidth);
    this.progress.style.height = px(length);

    // beside the progress a column standing on the judge line (under the line is the gear's own):
    // SPEED, the score panel over it and the time left on top (fitPanel), each upright
    const left = right + barWidth + PROGRESS_GAP * pr.k;
    const speedTop = foot - this.stand(this.speed, p.h, -left, foot, hud, 15, 30);
    const panelFoot = planeYAt(p.h, -left, planePoint(p.h, -left, speedTop)[1] - COLUMN_GAP * hud);
    // the column keeps under the song's plate, and on this side of the horizon (h[4] / h[7])
    const horizon = p.h[7] < 0 ? p.h[4] / p.h[7] : -Infinity;
    const top = Math.max(this.infoBottom, horizon) + SIDE_MARGIN * hud;
    this.column = { h: p.h, x: -left, bottom: panelFoot, barX: -right, barTop: foot - length, margin: SIDE_MARGIN * hud, top };
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
    this.sizeText(this.progressTime, hud, PANEL_LABEL, PANEL_NUM);
    const timeTall = this.progressTime.offsetHeight + TIME_GAP * hud;
    const foot = planePoint(c.h, c.x, c.bottom)[1];
    const edgeAt = (sy: number) => planePoint(c.h, c.x, planeYAt(c.h, c.x, sy))[0];
    /** The share of its size the panel keeps: every line clear of the screen's edge, the column under the plate. */
    const share = (sizes: [number, number][], widest: number | null): number => {
      const tall = sizes.reduce((sum, [, ht]) => sum + ht, 0);
      let k = Math.min(1, (foot - c.top - timeTall) / tall);
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
    let timeFoot = c.barTop;
    if (k < PANEL_MIN_SHRINK) {
      // no room on the track at a readable size: upright on the screen, in two columns at full size
      this.panel.classList.remove('stacked');
      this.panel.classList.add('upright');
      this.root.append(this.panel);
      for (const el of [...rows, ...cells]) el.removeAttribute('style');
      this.sizeText(this.panel, hud, PANEL_LABEL, PANEL_NUM);
    } else {
      let y = c.bottom;
      els.forEach((el, i) => {
        const ht = sizes[i][1];
        const u = uprightAt(c.h, c.x, planeYAt(c.h, c.x, planePoint(c.h, c.x, y)[1] - (ht * k) / 2));
        this.sizeText(el, hud * k * u.k, PANEL_LABEL, PANEL_NUM);
        // two columns line up: every row as wide on the screen as the widest (a live number wider still grows it leftward)
        if (widest !== null) el.style.minWidth = `${Math.round(widest * k * u.k * 100) / 100}px`;
        this.place(el, c.x, y, `translate(-100%, -100%) scaleY(${u.stretch.toFixed(3)})`);
        y -= ht * k * u.k * u.stretch;
      });
      timeFoot = Math.min(timeFoot, y);
    }
    // the time left over the bar, or over the panel where that reaches higher; under the plate
    const timeY = Math.max(planePoint(c.h, c.barX, timeFoot)[1] - TIME_GAP * hud, c.top + this.progressTime.offsetHeight);
    this.stand(this.progressTime, c.h, c.barX, planeYAt(c.h, c.barX, timeY), hud, PANEL_LABEL, PANEL_NUM);
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

  showJudge(e: JudgeEvent, perfNow: number): void {
    this.judgeAt = perfNow;
    this.judgeLabel.innerHTML = judgementHtml(e.label, Boolean(this.type.split));
    this.judgeLabel.className = `hud-judge-label ${e.cls}`;
    // FAST / SLOW off the best judgement, the error in whole ms (exact ones in a neutral colour)
    const error = e.isBreak ? null : e.errorMs;
    this.judgeFastSlow.textContent = error !== null && e.percent < 100 ? (error < 0 ? 'FAST' : 'SLOW') : '';
    this.judgeMs.textContent = error !== null && this.showErrorMs ? errorText(error) : '';
    this.judgeSub.className = `hud-judge-sub ${error !== null ? errorKind(error) : ''}`;
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
    // an inline type writes the combo after the judgement instead
    this.judgeCombo.textContent = this.type.inline ? text : '';
    this.comboBox.style.visibility = combo >= 2 && !this.type.inline ? 'visible' : 'hidden';
    if (rose && this.bumpCombo && !this.type.inline) {
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
    this.hideBanner();
    this.lastScore = -1;
    this.lastSub = '';
    this.lastMaxCombo = -1;
    this.lastPace = undefined;
    this.lastGauge = -1;
    this.lastReady = null;
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
      this.progressFill.style.transform = `scaleY(${progress / PROGRESS_STEPS})`;
    }
    const remaining = Math.ceil(Math.max(0, stats.remainingMs) / 1000 - 1e-6);
    if (remaining !== this.lastRemaining) {
      this.lastRemaining = remaining;
      this.remaining.textContent = clockText(remaining * 1000);
    }
    if (stats.bpm !== this.lastBpm) {
      this.lastBpm = stats.bpm;
      this.bpm.textContent = String(stats.bpm);
    }
    if (stats.ready !== this.lastReady) {
      this.lastReady = stats.ready;
      this.ready.textContent = stats.ready;
      this.ready.style.opacity = stats.ready ? '1' : '0';
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

  /** The end of a play: its lamp in the middle, the judgement and the combo out of its way. */
  showBanner(text: string, kind: string): void {
    this.banner.textContent = text;
    this.banner.className = `hud-banner show ${kind}`;
    this.root.classList.add('ended');
  }

  hideBanner(): void {
    this.banner.className = 'hud-banner';
    this.root.classList.remove('ended');
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

/** The gauge's lit cells for a shown percent (rounded down: a cell is lit once it is full). */
export function gaugeCells(shown: number): number {
  return Math.floor((shown * GAUGE_CELLS) / 100 + 1e-9);
}
