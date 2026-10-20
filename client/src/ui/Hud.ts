import type { JudgeEvent } from '../engine/session';
import type { HudPlane } from '../render/TrackRenderer';
import { HUD_FONTS, type HudType } from '../render/skins';

export interface HudInfo {
  title: string;
  keyMode: string;
  /** Difficulty chip: "DJMAX MX" on the tier colour and the level ("Lv.12", "SC 8"; empty when none). */
  difficulty: { label: string; level: string; color: string };
  /** Options line under the song (judgement, ruleset, placement, keysounds, AUTO). */
  chartLine: string;
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
  practiceLabel: string | null;
  /** The skin's judgement and combo type. */
  type: HudType;
  /** The song's sections as shares of the play, for the strip under the title. */
  sections: HudSection[];
}

export interface HudSection {
  from: number;
  to: number;
  /** 0..1: how loud the section is (a taller bar). */
  energy: number;
  color: string;
}

export interface HudStats {
  score: number;
  sub: string;
  maxCombo: number;
  gauge: number;
  progress: number;
  ready: string;
  fever: { gauge: number; active: boolean; multiplier: number; remaining: number; ready: boolean };
  pace: number | null;
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
/** Track units the gauge stands above the judge line and runs up the track, in cells. */
const GAUGE_FROM = 0.15;
const GAUGE_LENGTH = 9;
const GAUGE_CELLS = 40;
/** Plane px per track unit (HUD_UNIT; kept here so the plane's sizes read as the sheets' px). */
const UNIT = 73.65;
/** Space between the gear and what stands beside it (plane px). */
const SIDE_GAP = 22;

/** CSS transform of the plane: its homography (row-major 3×3, plane px to screen px) as a matrix3d. */
export function planeMatrix(h: readonly number[]): string {
  const m = [h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, h[8]];
  return `matrix3d(${m.map((v) => Number(v.toPrecision(9))).join(',')})`;
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

const EMBLEM = `<svg class="emblem" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
  <line x1="4" y1="22" x2="10" y2="2" style="stroke: var(--accent)" stroke-width="2.2" stroke-linecap="square" />
  <line x1="20" y1="22" x2="14" y2="2" style="stroke: var(--brand-rail)" stroke-width="2.2" stroke-linecap="square" />
  <line x1="5.2" y1="17" x2="18.8" y2="17" style="stroke: var(--text)" stroke-width="2" />
  <rect x="9.4" y="9" width="5.2" height="2" style="fill: var(--text)" />
</svg>`;

/**
 * Imperative DOM overlay; only touches the DOM when a value changes. The song and the messages sit
 * on the screen; the judgement, combo, score panel, gauge, hi-speed and FEVER lie on the track
 * (one plane under the camera's projection: they tilt and zoom with it).
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
  private readonly score: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly maxCombo: HTMLElement;
  private readonly pace: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly panelIn: HTMLElement;
  private readonly gauge: HTMLElement;
  private readonly gaugeFill: HTMLElement;
  private readonly gaugeClear: HTMLElement;
  private readonly gaugeClearLabel: HTMLElement;
  private readonly gaugeValue: HTMLElement;
  private readonly gaugeNum: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly speedNum: HTMLElement;
  private readonly speedGreen: HTMLElement;
  private readonly playhead: HTMLElement;
  private readonly map: HTMLElement;
  private readonly fever: HTMLElement;
  private readonly feverFill: HTMLElement;
  private readonly feverText: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly ready: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly loop: HTMLElement;
  private readonly showErrorMs: boolean;
  private readonly gaugeClearShare: number;
  /** Off with the reduced-flash setting, like the judgement pop. */
  private readonly bumpCombo: boolean;
  private readonly feverManualKey: string | null;
  private comboBump: Animation | null = null;
  private judgeAt = -Infinity;
  private toastAt = -Infinity;
  private hudScale = 1;
  private lastCombo = -1;
  private lastScore = -1;
  private lastSub = '';
  private lastMaxCombo = -1;
  private lastPace: number | null = null;
  private lastGauge = -1;
  private lastProgress = -1;
  private lastReady = '';
  private lastFever = '';
  private lastMatrix = '';
  /** The score panel's size for the screen (plane px to a screen px) and its room, from the last layout. */
  private panelK = 1;
  private panelRoom = 0;

  constructor(root: HTMLElement, info: HudInfo, showErrorMs: boolean, reducedFlash = false) {
    this.root = root;
    this.type = info.type;
    this.showErrorMs = showErrorMs;
    this.bumpCombo = !reducedFlash;
    this.feverManualKey = info.feverManualKey;
    this.gaugeClearShare = Math.min(1, Math.max(0, info.gaugeClear / 100));
    root.innerHTML = `
      <div class="hud-info">
        <div class="hud-head">${EMBLEM}<span class="hud-title"></span><span class="hud-diff"><span class="hud-diff-tier"></span><span class="hud-diff-level"></span></span><span class="hud-keymode"></span></div>
        <div class="hud-map"><b class="hud-playhead"></b></div>
        <div class="hud-chart"></div>
        <div class="hud-practice"></div>
      </div>
      <div class="hud-plane">
        <div class="hud-judge"><div class="hud-judge-pop"><div class="hud-judge-text"><span class="hud-judge-label"></span><span class="hud-judge-combo"></span></div><i class="hud-judge-bar"></i><div class="hud-judge-sub"></div></div></div>
        <div class="hud-combo"><div class="hud-combo-num"></div><div class="hud-combo-label">COMBO</div></div>
        <div class="hud-fever" data-testid="hud-fever"><span class="hud-fever-text"></span><span class="hud-fever-bar"><i class="hud-fever-fill"></i></span></div>
        <div class="hud-speed"><span class="hud-label">HI-SPEED</span><span class="hud-num hud-speed-num"></span><span class="hud-label hud-speed-green"></span></div>
        <div class="hud-gauge"><i class="hud-gauge-fill"></i></div>
        <i class="hud-gauge-clear"></i>
        <div class="hud-gauge-clear-label"><span class="hud-label">CLEAR</span></div>
        <div class="hud-gauge-value"><span class="hud-num hud-gauge-num"></span><span class="hud-label hud-gauge-type"></span></div>
        <div class="hud-panel"><div class="hud-panel-in">
          <span><span class="hud-label hud-score-label"></span><span class="hud-num hud-score">0</span></span>
          <span class="hud-pace-item"><span class="hud-label hud-pace-label"></span><span class="hud-num hud-pace"></span></span>
          <span><span class="hud-label hud-rate-label"></span><span class="hud-num hud-rate"></span></span>
          <span><span class="hud-label">MAX COMBO</span><span class="hud-num hud-max-combo">0</span></span>
        </div></div>
      </div>
      <div class="hud-toast"></div>
      <div class="hud-ready"></div>
      <div class="hud-banner" data-testid="hud-banner"></div>`;
    const q = (sel: string) => root.querySelector(sel) as HTMLElement;
    q('.hud-title').textContent = info.title;
    q('.hud-diff').style.setProperty('--diff', info.difficulty.color);
    q('.hud-diff-tier').textContent = info.difficulty.label;
    q('.hud-diff-level').textContent = info.difficulty.level;
    q('.hud-keymode').textContent = info.keyMode;
    q('.hud-chart').textContent = info.chartLine;
    this.loop = q('.hud-practice');
    this.loop.textContent = info.practiceLabel ?? '';
    this.map = q('.hud-map');
    this.playhead = q('.hud-playhead');
    for (const s of info.sections) {
      const bar = document.createElement('i');
      bar.style.left = `${s.from * 100}%`;
      bar.style.width = `calc(${(s.to - s.from) * 100}% - 2px)`;
      bar.style.height = `${Math.round(40 + 60 * Math.min(1, Math.max(0, s.energy)))}%`;
      bar.style.background = s.color;
      this.map.insertBefore(bar, this.playhead);
    }
    this.map.classList.toggle('plain', info.sections.length === 0);

    this.plane = q('.hud-plane');
    const t = info.type;
    const font = HUD_FONTS[t.font];
    this.plane.style.setProperty('--hud-font', `'${t.font}'`);
    this.plane.style.setProperty('--hud-weight', String(font.weight));
    this.plane.style.setProperty('--hud-style', font.italic ? 'italic' : 'normal');
    this.plane.style.setProperty('--hud-tracking', `${t.tracking}em`);
    this.plane.style.setProperty('--hud-outline', t.outline);
    this.plane.style.setProperty('--judge-max', t.max);
    this.plane.classList.toggle('inline', Boolean(t.inline));
    this.comboBox = q('.hud-combo');
    this.comboNum = q('.hud-combo-num');
    this.judgeBox = q('.hud-judge');
    this.judgePop = q('.hud-judge-pop');
    this.judgeLabel = q('.hud-judge-label');
    this.judgeCombo = q('.hud-judge-combo');
    this.judgeSub = q('.hud-judge-sub');
    this.judgeText = q('.hud-judge-text');
    if (t.skew) this.judgeText.style.transform = `skewX(${t.skew}deg)`;
    const bar = q('.hud-judge-bar');
    if (t.bar) bar.style.background = t.bar;
    else bar.remove();

    q('.hud-score-label').textContent = info.scoreLabel;
    q('.hud-rate-label').textContent = info.subLabel;
    q('.hud-pace-label').textContent = info.pacemakerLabel ?? '';
    this.pace = q('.hud-pace');
    if (info.pacemakerLabel === null) q('.hud-pace-item').remove();
    this.score = q('.hud-score');
    this.sub = q('.hud-rate');
    this.maxCombo = q('.hud-max-combo');
    this.panel = q('.hud-panel');
    this.panelIn = q('.hud-panel-in');

    this.gauge = q('.hud-gauge');
    this.gauge.classList.toggle('survival', info.survivalGauge);
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
    this.speedGreen = q('.hud-speed-green');

    this.fever = q('.hud-fever');
    this.fever.style.display = info.feverEnabled ? '' : 'none';
    this.feverFill = q('.hud-fever-fill');
    this.feverText = q('.hud-fever-text');
    this.banner = q('.hud-banner');
    this.ready = q('.hud-ready');
    this.toast = q('.hud-toast');
    this.setCombo(0);
  }

  /** Sizes the screen layer to the screen (on start and resize; reading the size lays the page out). */
  fit(): void {
    const scale = Math.round(Math.min(MAX_SCALE, Math.max(1, this.root.clientHeight / BASE_HEIGHT)) * 100) / 100;
    if (scale !== this.hudScale) {
      this.hudScale = scale;
      this.root.style.setProperty('--hud-scale', String(scale));
    }
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
    const fit = this.widest(this.judgeText, [
      [this.judgeLabel, 'MAX 100%'],
      [this.judgeCombo, t.inline ? '0000' : ''],
    ], () => (this.judgeBox.style.fontSize = px(t.size * j.k)));
    const jk = j.k * Math.min(1, (2 * p.halfWidth - 24) / Math.max(1, fit));
    this.judgeBox.style.fontSize = px(t.size * jk);
    this.judgeBox.style.setProperty('--stroke', px(t.stroke * jk));
    this.judgeSub.style.fontSize = px(16 * jk);
    this.judgeSub.style.setProperty('--sub-stroke', px(Math.min(3, t.stroke / 3) * jk));
    const c = at(0, -comboAt, TEXT_ASPECT);
    this.place(this.comboBox, 0, -comboAt, `translate(-50%, -50%) scaleY(${c.stretch.toFixed(3)})`);
    this.comboNum.style.fontSize = px(t.combo * c.k);
    this.comboBox.style.setProperty('--stroke', px(t.stroke * c.k));
    this.comboBox.style.setProperty('--label-size', px(16 * c.k));
    this.comboBox.style.setProperty('--label-stroke', px(Math.max(3, t.stroke - 2) * c.k));

    // beside the gear, on the same plane: FEVER level with the combo, the gauge and hi-speed standing on the judge line
    const right = p.halfWidth + p.sideOut + SIDE_GAP;
    const foot = -GAUGE_FROM * UNIT;
    const f = at(right, -comboAt, SIDE_ASPECT);
    this.place(this.fever, right, -comboAt, `translateY(-50%) scaleY(${f.stretch.toFixed(3)})`);
    this.fever.style.fontSize = px(20 * f.k);
    const s = at(-right, foot, SIDE_ASPECT);
    this.place(this.speed, -right, foot, `translate(-100%, -100%) scaleY(${s.stretch.toFixed(3)})`);
    this.sizeText(this.speed, s.k, 15, 30);

    const g = at(right, foot, SIDE_ASPECT);
    const width = 14 * 1.3 * g.k;
    const length = GAUGE_LENGTH * UNIT;
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

    // the score panel on the deck, under the caps
    const top = p.deckTop + 8 + p.capDepth + 8;
    const height = Math.min(56, Math.max(36, p.deckRoom - 6 - (top - p.deckTop) - 4));
    this.place(this.panel, -p.halfWidth + 12, top, '');
    this.panel.style.width = px(2 * p.halfWidth - 24);
    this.panel.style.height = px(height);
    const m = at(0, top + height / 2, TEXT_ASPECT, 1.8);
    this.panelIn.style.transform = `scaleY(${m.stretch.toFixed(3)})`;
    this.panelK = m.k;
    this.panelRoom = 2 * p.halfWidth - 48;
    this.fitPanel();
    this.movePlane(p);
  }

  /**
   * Sizes the score panel's text as large as the screen wants but never wider than the panel (a
   * narrow camera shrinks it), for the widest numbers usual in a play or the live ones if wider.
   */
  private fitPanel(): void {
    const wider = (el: HTMLElement, sample: string) => ((el.textContent ?? '').length > sample.length ? el.textContent ?? '' : sample);
    const wide = this.widest(this.panelIn, [
      [this.score, wider(this.score, '000,000')],
      [this.sub, wider(this.sub, '100.00%')],
      [this.maxCombo, wider(this.maxCombo, '0000')],
      [this.pace, wider(this.pace, '+00,000')],
    ], () => this.sizeText(this.panel, this.panelK, 17, 30));
    if (wide > this.panelRoom) this.sizeText(this.panel, (this.panelK * this.panelRoom) / wide, 17, 30);
  }

  /** How wide `box` lays out (plane px) with these texts in place of the live ones, sized by `size` first. */
  private widest(box: HTMLElement, samples: [HTMLElement, string][], size: () => void): number {
    size();
    const live = samples.map(([el]) => el.innerHTML);
    samples.forEach(([el, text]) => (el.textContent = text));
    const width = box.scrollWidth;
    samples.forEach(([el], i) => (el.innerHTML = live[i]));
    return width;
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

  /** HI-SPEED and the green number beside the gear (on start and when they change). */
  setSpeed(hiSpeed: number, green: number): void {
    this.speedNum.textContent = hiSpeed.toFixed(hiSpeed % 1 === 0 ? 1 : 2);
    this.speedGreen.textContent = `녹색 ${Math.round(green)}`;
  }

  showJudge(e: JudgeEvent, perfNow: number): void {
    this.judgeAt = perfNow;
    this.judgeLabel.innerHTML = judgementHtml(e.label, Boolean(this.type.split));
    this.judgeLabel.className = `hud-judge-label ${e.cls}`;
    let sub = '';
    if (!e.isBreak && e.errorMs !== null && e.percent < 100) sub = e.errorMs < 0 ? 'FAST' : 'SLOW';
    if (this.showErrorMs && e.errorMs !== null && !e.isBreak) {
      sub += `${sub ? ' ' : ''}${e.errorMs > 0 ? '+' : ''}${e.errorMs.toFixed(1)}ms`;
    }
    this.judgeSub.textContent = sub;
    this.judgeSub.className = `hud-judge-sub ${e.errorMs !== null && e.errorMs < 0 ? 'fast' : 'slow'}`;
    // restart the pop animation
    this.judgePop.classList.remove('pop');
    void this.judgePop.offsetWidth;
    this.judgePop.classList.add('pop');
    this.judgeBox.style.opacity = '1';
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

  /** Short message in the middle of the screen (hi-speed, covers). */
  showToast(text: string, perfNow: number): void {
    this.toastAt = perfNow;
    this.toast.textContent = text;
    this.toast.style.opacity = '1';
  }

  setPracticeLabel(text: string): void {
    this.loop.textContent = text;
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
      this.pace.textContent = pace === null ? '' : `${pace >= 0 ? '+' : '−'}${Math.abs(pace).toLocaleString('en-US')}`;
      this.pace.className = `hud-num hud-pace ${pace !== null && pace < 0 ? 'behind' : 'ahead'}`;
    }
    // the gauge fills whole cells, from the bottom (a clip, no layout while playing)
    const cells = Math.round((Math.min(100, Math.max(0, stats.gauge)) / 100) * GAUGE_CELLS);
    const gauge = Math.round(stats.gauge);
    if (gauge !== this.lastGauge) {
      this.lastGauge = gauge;
      this.gaugeFill.style.clipPath = `inset(${(100 * (GAUGE_CELLS - cells)) / GAUGE_CELLS}% 0 0 0)`;
      this.gaugeNum.textContent = `${gauge}%`;
    }
    const progress = Math.round(Math.min(1, Math.max(0, stats.progress)) * 1000) / 1000;
    if (progress !== this.lastProgress) {
      this.lastProgress = progress;
      this.playhead.style.left = `${progress * 100}%`;
    }
    if (stats.ready !== this.lastReady) {
      this.lastReady = stats.ready;
      this.ready.textContent = stats.ready;
      this.ready.style.opacity = stats.ready ? '1' : '0';
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

  showBanner(text: string, kind: string): void {
    this.banner.textContent = text;
    this.banner.className = `hud-banner show ${kind}`;
  }

  hideBanner(): void {
    this.banner.className = 'hud-banner';
  }

  dispose(): void {
    this.root.innerHTML = '';
  }
}
