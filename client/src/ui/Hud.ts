import type { JudgeEvent } from '../engine/session';

export interface HudInfo {
  title: string;
  artist: string;
  keyMode: string;
  difficulty: string;
  level: number;
  autoPlay: boolean;
  judgementLabel: string;
}

export interface HudAnchors {
  combo: { x: number; y: number };
  judge: { x: number; y: number };
}

/** Grade colour class shared by the HUD and the result screen. */
export function gradeClass(percent: number, isBreak: boolean): string {
  if (isBreak) return 'g-break';
  if (percent >= 100) return 'g-max';
  if (percent >= 80) return 'g-high';
  if (percent >= 40) return 'g-mid';
  return 'g-low';
}

/** Hex colour per grade class, for 3D hit effects. */
export const GRADE_COLORS: Record<string, number> = {
  'g-max': 0x7cf7ff,
  'g-high': 0x8bff9c,
  'g-mid': 0xffe26b,
  'g-low': 0xffb15c,
  'g-break': 0xff4d6a,
};

const JUDGE_VISIBLE_MS = 600;

/** Imperative DOM overlay; only touches the DOM when a value changes. */
export class Hud {
  private readonly root: HTMLElement;
  private readonly comboBox: HTMLElement;
  private readonly comboNum: HTMLElement;
  private readonly judgeBox: HTMLElement;
  private readonly judgeLabel: HTMLElement;
  private readonly judgeSub: HTMLElement;
  private readonly score: HTMLElement;
  private readonly rate: HTMLElement;
  private readonly gaugeFill: HTMLElement;
  private readonly gaugeValue: HTMLElement;
  private readonly progressFill: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly ready: HTMLElement;
  private readonly showErrorMs: boolean;
  private judgeAt = -Infinity;
  private lastCombo = -1;
  private lastScore = -1;
  private lastRate = -1;
  private lastGauge = -1;
  private lastProgress = -1;
  private lastReady = '';

  constructor(root: HTMLElement, info: HudInfo, gaugeClear: number, showErrorMs: boolean) {
    this.root = root;
    this.showErrorMs = showErrorMs;
    root.innerHTML = `
      <div class="hud-info">
        <div class="hud-title"></div>
        <div class="hud-artist"></div>
        <div class="hud-chart"></div>
      </div>
      <div class="hud-stats">
        <div class="hud-score-label">SCORE</div><div class="hud-score">0</div>
        <div class="hud-rate-label">RATE</div><div class="hud-rate">100.00%</div>
      </div>
      <div class="hud-combo"><div class="hud-combo-num"></div><div class="hud-combo-label">COMBO</div></div>
      <div class="hud-judge"><div class="hud-judge-label"></div><div class="hud-judge-sub"></div></div>
      <div class="hud-bottom">
        <div class="hud-gauge"><div class="hud-gauge-fill"></div><div class="hud-gauge-clear"></div><div class="hud-gauge-value"></div></div>
        <div class="hud-progress"><div class="hud-progress-fill"></div></div>
      </div>
      <div class="hud-ready"></div>
      <div class="hud-banner"></div>`;
    const q = (sel: string) => root.querySelector(sel) as HTMLElement;
    q('.hud-title').textContent = info.title;
    q('.hud-artist').textContent = info.artist;
    q('.hud-chart').textContent =
      `${info.keyMode} · ${info.difficulty}${info.level > 0 ? ` Lv.${info.level}` : ''} · ${info.judgementLabel}${info.autoPlay ? ' · AUTO' : ''}`;
    (q('.hud-gauge-clear') as HTMLElement).style.left = `${gaugeClear}%`;
    this.comboBox = q('.hud-combo');
    this.comboNum = q('.hud-combo-num');
    this.judgeBox = q('.hud-judge');
    this.judgeLabel = q('.hud-judge-label');
    this.judgeSub = q('.hud-judge-sub');
    this.score = q('.hud-score');
    this.rate = q('.hud-rate');
    this.gaugeFill = q('.hud-gauge-fill');
    this.gaugeValue = q('.hud-gauge-value');
    this.progressFill = q('.hud-progress-fill');
    this.banner = q('.hud-banner');
    this.ready = q('.hud-ready');
    this.setCombo(0);
  }

  place(anchors: HudAnchors): void {
    this.comboBox.style.left = `${anchors.combo.x}px`;
    this.comboBox.style.top = `${anchors.combo.y}px`;
    this.judgeBox.style.left = `${anchors.judge.x}px`;
    this.judgeBox.style.top = `${anchors.judge.y}px`;
  }

  showJudge(e: JudgeEvent, perfNow: number): void {
    this.judgeAt = perfNow;
    this.judgeLabel.textContent = e.label;
    this.judgeLabel.className = `hud-judge-label ${gradeClass(e.percent, e.isBreak)}`;
    let sub = '';
    if (!e.isBreak && e.errorMs !== null && e.percent < 100) sub = e.errorMs < 0 ? 'FAST' : 'SLOW';
    if (this.showErrorMs && e.errorMs !== null && !e.isBreak) {
      sub += `${sub ? ' ' : ''}${e.errorMs > 0 ? '+' : ''}${e.errorMs.toFixed(1)}ms`;
    }
    this.judgeSub.textContent = sub;
    this.judgeSub.className = `hud-judge-sub ${e.errorMs !== null && e.errorMs < 0 ? 'fast' : 'slow'}`;
    // restart the pop animation
    this.judgeBox.classList.remove('pop');
    void this.judgeBox.offsetWidth;
    this.judgeBox.classList.add('pop');
    this.judgeBox.style.opacity = '1';
    this.setCombo(e.combo);
  }

  setCombo(combo: number): void {
    if (combo === this.lastCombo) return;
    this.lastCombo = combo;
    this.comboNum.textContent = combo > 0 ? String(combo) : '';
    this.comboBox.style.visibility = combo >= 2 ? 'visible' : 'hidden';
  }

  update(perfNow: number, stats: { score: number; rate: number; gauge: number; progress: number; ready: string }): void {
    if (perfNow - this.judgeAt > JUDGE_VISIBLE_MS) this.judgeBox.style.opacity = '0';
    if (stats.score !== this.lastScore) {
      this.lastScore = stats.score;
      this.score.textContent = stats.score.toLocaleString('en-US');
    }
    const rate = Math.floor(stats.rate * 100) / 100;
    if (rate !== this.lastRate) {
      this.lastRate = rate;
      this.rate.textContent = `${rate.toFixed(2)}%`;
    }
    const gauge = Math.round(stats.gauge);
    if (gauge !== this.lastGauge) {
      this.lastGauge = gauge;
      this.gaugeFill.style.width = `${gauge}%`;
      this.gaugeValue.textContent = `${gauge}%`;
    }
    const progress = Math.round(Math.min(1, Math.max(0, stats.progress)) * 1000) / 10;
    if (progress !== this.lastProgress) {
      this.lastProgress = progress;
      this.progressFill.style.width = `${progress}%`;
    }
    if (stats.ready !== this.lastReady) {
      this.lastReady = stats.ready;
      this.ready.textContent = stats.ready;
      this.ready.style.opacity = stats.ready ? '1' : '0';
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
