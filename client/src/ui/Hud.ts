import type { JudgeEvent } from '../engine/session';

export interface HudInfo {
  title: string;
  artist: string;
  /** Chart line under the title (key mode, difficulty, options). */
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
}

export interface HudAnchors {
  combo: { x: number; y: number };
  judge: { x: number; y: number };
}

export interface HudStats {
  score: number;
  sub: string;
  gauge: number;
  progress: number;
  ready: string;
  fever: { gauge: number; active: boolean; multiplier: number; remaining: number; ready: boolean };
  pace: number | null;
}

const JUDGE_VISIBLE_MS = 600;
const TOAST_MS = 1400;

/** Imperative DOM overlay; only touches the DOM when a value changes. */
export class Hud {
  private readonly root: HTMLElement;
  private readonly comboBox: HTMLElement;
  private readonly comboNum: HTMLElement;
  private readonly judgeBox: HTMLElement;
  private readonly judgeLabel: HTMLElement;
  private readonly judgeSub: HTMLElement;
  private readonly score: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly pace: HTMLElement;
  private readonly gaugeFill: HTMLElement;
  private readonly gaugeValue: HTMLElement;
  private readonly progressFill: HTMLElement;
  private readonly fever: HTMLElement;
  private readonly feverFill: HTMLElement;
  private readonly feverText: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly ready: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly loop: HTMLElement;
  private readonly showErrorMs: boolean;
  private readonly feverManualKey: string | null;
  private judgeAt = -Infinity;
  private toastAt = -Infinity;
  private lastCombo = -1;
  private lastScore = -1;
  private lastSub = '';
  private lastPace: number | null = null;
  private lastGauge = -1;
  private lastProgress = -1;
  private lastReady = '';
  private lastFever = '';

  constructor(root: HTMLElement, info: HudInfo, showErrorMs: boolean) {
    this.root = root;
    this.showErrorMs = showErrorMs;
    this.feverManualKey = info.feverManualKey;
    root.innerHTML = `
      <div class="hud-info">
        <div class="hud-title"></div>
        <div class="hud-artist"></div>
        <div class="hud-chart"></div>
        <div class="hud-practice"></div>
      </div>
      <div class="hud-stats">
        <div class="hud-score-label"></div><div class="hud-score">0</div>
        <div class="hud-rate-label"></div><div class="hud-rate"></div>
        <div class="hud-pace-label"></div><div class="hud-pace"></div>
      </div>
      <div class="hud-fever" data-testid="hud-fever">
        <div class="hud-fever-text"></div>
        <div class="hud-fever-bar"><div class="hud-fever-fill"></div></div>
      </div>
      <div class="hud-combo"><div class="hud-combo-num"></div><div class="hud-combo-label">COMBO</div></div>
      <div class="hud-judge"><div class="hud-judge-label"></div><div class="hud-judge-sub"></div></div>
      <div class="hud-bottom">
        <div class="hud-gauge-head"><span class="hud-gauge-type"></span><span class="hud-gauge-value"></span></div>
        <div class="hud-gauge"><div class="hud-gauge-fill"></div><div class="hud-gauge-clear"></div></div>
        <div class="hud-progress"><div class="hud-progress-fill"></div></div>
      </div>
      <div class="hud-toast"></div>
      <div class="hud-ready"></div>
      <div class="hud-banner" data-testid="hud-banner"></div>`;
    const q = (sel: string) => root.querySelector(sel) as HTMLElement;
    q('.hud-title').textContent = info.title;
    q('.hud-artist').textContent = info.artist;
    q('.hud-chart').textContent = info.chartLine;
    this.loop = q('.hud-practice');
    this.loop.textContent = info.practiceLabel ?? '';
    q('.hud-score-label').textContent = info.scoreLabel;
    q('.hud-rate-label').textContent = info.subLabel;
    q('.hud-pace-label').textContent = info.pacemakerLabel ?? '';
    q('.hud-gauge-type').textContent = info.gaugeLabel;
    const clear = q('.hud-gauge-clear');
    clear.style.left = `${info.gaugeClear}%`;
    clear.style.display = info.survivalGauge ? 'none' : '';
    q('.hud-gauge').classList.toggle('survival', info.survivalGauge);
    this.fever = q('.hud-fever');
    this.fever.style.display = info.feverEnabled ? '' : 'none';
    this.feverFill = q('.hud-fever-fill');
    this.feverText = q('.hud-fever-text');
    this.comboBox = q('.hud-combo');
    this.comboNum = q('.hud-combo-num');
    this.judgeBox = q('.hud-judge');
    this.judgeLabel = q('.hud-judge-label');
    this.judgeSub = q('.hud-judge-sub');
    this.score = q('.hud-score');
    this.sub = q('.hud-rate');
    this.pace = q('.hud-pace');
    this.gaugeFill = q('.hud-gauge-fill');
    this.gaugeValue = q('.hud-gauge-value');
    this.progressFill = q('.hud-progress-fill');
    this.banner = q('.hud-banner');
    this.ready = q('.hud-ready');
    this.toast = q('.hud-toast');
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
    this.judgeLabel.className = `hud-judge-label ${e.cls}`;
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
      this.lastScore = stats.score;
      this.score.textContent = stats.score.toLocaleString('en-US');
    }
    if (stats.sub !== this.lastSub) {
      this.lastSub = stats.sub;
      this.sub.textContent = stats.sub;
    }
    const pace = stats.pace === null ? null : Math.round(stats.pace);
    if (pace !== this.lastPace) {
      this.lastPace = pace;
      this.pace.textContent = pace === null ? '' : `${pace >= 0 ? '+' : '−'}${Math.abs(pace).toLocaleString('en-US')}`;
      this.pace.className = `hud-pace ${pace !== null && pace < 0 ? 'behind' : 'ahead'}`;
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
    const f = stats.fever;
    const fill = f.active ? f.remaining : f.gauge;
    const text = f.active ? `FEVER x${f.multiplier}` : f.ready && this.feverManualKey ? `FEVER READY · ${this.feverManualKey}` : 'FEVER';
    const key = `${text}|${Math.round(fill * 200)}|${f.active}|${f.ready}`;
    if (key !== this.lastFever) {
      this.lastFever = key;
      this.feverText.textContent = text;
      this.feverFill.style.width = `${Math.round(fill * 1000) / 10}%`;
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
