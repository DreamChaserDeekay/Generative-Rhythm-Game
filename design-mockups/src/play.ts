import type { JudgeEvent } from '@game/engine/session';
import type { Chart } from '@game/engine/types';
import { hudTypeFor } from '@game/render/gearHud';
import { loadSkinArt } from '@game/render/skinArt';
import { bindingsFor, keyLabel, secondBindingsFor, skinOf } from '@game/settings/settings';
import { playedSettings, ruleChips } from '@game/ui/playRules';
import type { PlayRequest } from '@game/ui/App';
import { loadHudFont, type HudStats } from '@game/ui/Hud';
import { PlayController, type PlayOutcome } from '@game/ui/PlayController';
import { gameEngine, sfx, unlock } from './audio';
import { SECTION_KO, STEMS, bpmText, chartOf, detailOf, songs, type SongEntry } from './data';
import { clock, el, esc, kbd, token } from './dom';
import type { Stage } from './stage';
import { setSettings, state } from './state';

const STEM_KO: Record<string, string> = { drums: '드럼', bass: '베이스', vocals: '보컬', other: '멜로디·기타' };
/** The rail shows this much of the song above the line. */
const RAIL_AHEAD_MS = 60_000;
const FEVER_TOKENS: Record<number, string> = { 2: '#6dff8a', 3: '#ffd84f', 4: '#ff8f4f', 5: '#ff6b6b' };

/**
 * Play. The track, the gear and the HUD lying on it are the game's own (its PlayController runs
 * here unchanged). The mockup's part is what stands around them: the hand-over from the song
 * select, the song's rail, the stems being played, FEVER at the screen's edge, the pause menu on
 * the line and the slate a play ends with.
 */
export class PlayScreen {
  readonly root = el('section', 'screen play');
  private controller: PlayController | null = null;
  private run = 0;
  private paused = false;
  private pauseAt = 0;
  private outcome: PlayOutcome | null = null;
  private chart: Chart | null = null;
  private song: SongEntry | null = null;
  private railPx = 0;
  private lastCombo = 0;
  private feverOn = false;
  onLeave: () => void = () => undefined;

  constructor(
    app: HTMLElement,
    private stage: Stage,
  ) {
    this.root.innerHTML = `
      <div class="game-scope"><div class="play-screen"><div class="play-bg"></div><canvas class="play-canvas"></canvas><div class="hud"></div></div></div>
      <div class="pf-rail"><div class="pf-rail-strip"><canvas></canvas></div><i class="pf-rail-past"></i></div>
      <div class="pf-stems">${STEMS.map((s) => `<span class="cap" data-stem="${s}" style="--c:var(--stem-${s})"><i></i>${STEM_KO[s]}</span>`).join('')}</div>
      <div class="pf-head"></div>
      <button class="pf-esc" data-key="Escape">일시정지 ${kbd('Esc')}</button>
      <i class="pf-fever top"></i><i class="pf-fever bottom"></i>
      <div class="pf-slate"></div>
      <div class="pf-keys"></div>
      <div class="pf-pause"></div>
      <div class="pf-result"></div>`;
    app.append(this.root);
  }

  private q<T extends HTMLElement>(s: string): T {
    return this.root.querySelector(s) as T;
  }

  enter(auto: boolean): void {
    const mine = ++this.run;
    const song = songs[state.song];
    this.song = song;
    this.outcome = null;
    this.paused = false;
    this.root.classList.add('on');
    this.root.classList.remove('live', 'paused', 'done', 'fever');
    this.stage.drain();
    this.stage.strike();
    this.q('.pf-keys').innerHTML = '';
    const summary = song.charts[state.mode][state.tier];
    this.q('.pf-slate').innerHTML = `
      <div class="pf-slate-tier" data-tier="${state.tier}"><b>${state.tier}</b><span class="num">${summary.level}</span><em class="num">${state.mode}</em>${auto || state.autoPlay ? '<em>AUTO</em>' : ''}</div>
      <h1>${esc(song.title)}</h1>
      <div class="by">${esc(song.artist)}</div>
      <div class="pf-slate-facts"><span><span class="cap">BPM</span><b class="num">${bpmText(song)}</b></span><span><span class="cap">노트</span><b class="num">${summary.noteCount.toLocaleString('en-US')}</b></span><span><span class="cap">길이</span><b class="num">${clock(song.durationMs)}</b></span><span><span class="cap">노트 속도</span><b class="num">${state.settings.hiSpeed.toFixed(2)}</b></span></div>
      <div class="pf-slate-rules"></div>
      <div class="pf-slate-load"><span class="pf-load-text">불러오는 중…</span><i class="pf-load-bar"><u></u></i><button data-key="Escape">${kbd('Esc')} 취소</button></div>`;
    this.q('.pf-head').innerHTML = `<b>${esc(song.title)}</b><span class="pf-chip" data-tier="${state.tier}">${state.tier} <span class="num">${summary.level}</span></span><span class="num">${state.mode}</span>${auto || state.autoPlay ? '<span class="pf-tag">AUTO</span>' : ''}`;
    sfx('start');
    void this.begin(mine, song, auto || state.autoPlay);
  }

  private async begin(mine: number, song: SongEntry, autoPlay: boolean): Promise<void> {
    const settings = state.settings;
    const skin = skinOf(settings);
    try {
      await unlock();
      const [detail, buffer, art] = await Promise.all([
        detailOf(song),
        gameEngine.load(`./audio/${song.id}.mp3`),
        loadSkinArt(skin).catch(() => null),
        loadHudFont(hudTypeFor(skin.style, settings.hudType)),
        // the track is on its way to the middle of the screen meanwhile
        new Promise((r) => setTimeout(r, 900)),
      ]);
      if (mine !== this.run) return;
      const chart = chartOf(song, detail, state.mode, state.tier);
      this.chart = chart;
      this.drawRail(song);
      const request: PlayRequest = { chart, loadAudio: async () => buffer, autoPlay };
      // the rules of this play where they are not the defaults, as the game's loading card lists them
      this.q('.pf-slate-rules').innerHTML = ruleChips(playedSettings(request, settings), false)
        .map(([name, value]) => `<span>${name ? `<span class="cap">${esc(name)}</span>` : ''}<b>${esc(value)}</b></span>`)
        .join('');
      this.showKeys(chart);
      // long enough to read the keys on a fast machine too
      await new Promise((r) => setTimeout(r, 700));
      if (mine !== this.run) return;
      // the game's own hit sound is an oscillator: the mockup plays its recorded one on each judgement instead
      gameEngine.playHitSound = () => undefined;
      this.controller = new PlayController(
        { request, buffer, bufferPlacement: { originMs: 0, rate: 1 }, settings: { ...settings, hitSound: false }, canvas: this.q('.play-canvas') as HTMLCanvasElement, hudRoot: this.q('.hud'), bgRoot: this.q('.play-bg'), art },
        {
          onFinish: (outcome) => this.finish(outcome),
          onPauseChange: (paused) => this.setPaused(paused),
          onSettingsChange: (s) => setSettings({ ...s, hitSound: state.settings.hitSound }),
        },
      );
      this.tap(this.controller);
      this.stage.stop();
      this.root.classList.add('live');
      this.lastCombo = 0;
    } catch (e) {
      if (mine !== this.run) return;
      this.q('.pf-slate-load').innerHTML = `${esc(e instanceof Error ? e.message : String(e))} <span>${kbd('Esc')} 돌아가기</span>`;
    }
  }

  /** The keys that play the lanes, standing on the track's line each at its lane, under the colour of the stem the lane follows most. */
  private showKeys(chart: Chart): void {
    const xs = this.stage.laneXs();
    const keys = bindingsFor(state.settings, chart.meta.keyMode);
    const seconds = secondBindingsFor(state.settings, chart.meta.keyMode);
    const counts = chart.meta.lanes.map(() => new Map<string, number>());
    for (const n of chart.notes) if (n.src) counts[n.lane]?.set(n.src, (counts[n.lane].get(n.src) ?? 0) + 1);
    const stems = counts.map((c) => [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);
    const present = STEMS.filter((s) => stems.includes(s));
    this.q('.pf-keys').innerHTML =
      keys.map((code, lane) => `<span style="left:${xs[lane] ?? 0}px;--c:${stems[lane] ? `var(--stem-${stems[lane]})` : 'var(--rule-strong)'}">${kbd(seconds[lane] ? `${keyLabel(code)} · ${keyLabel(seconds[lane] as string)}` : keyLabel(code))}<i></i></span>`).join('') +
      `<em class="cap">레인이 따라가는 악기 ${present.map((s) => `<b style="--c:var(--stem-${s})"><i></i>${STEM_KO[s]}</b>`).join('')}</em>`;
  }

  /** Listens in on the game's HUD: what it is told each frame and each judgement drives the frame around it. */
  private tap(controller: PlayController): void {
    const hud = (controller as unknown as { hud: { update: (t: number, s: HudStats) => void; showJudge: (e: JudgeEvent, t: number) => void } }).hud;
    const update = hud.update.bind(hud);
    hud.update = (t, s) => {
      update(t, s);
      this.frame(s);
    };
    const showJudge = hud.showJudge.bind(hud);
    hud.showJudge = (e, t) => {
      showJudge(e, t);
      this.judged(e);
    };
  }

  private judged(e: JudgeEvent): void {
    if (e.isBreak) {
      if (e.comboBreak && this.lastCombo >= 10) sfx('miss');
      this.lastCombo = 0;
      return;
    }
    if (e.kind !== 'tail' && state.settings.hitSound) sfx('hit', 0.9);
    const src = this.chart?.notes[e.noteIndex]?.src;
    if (src) this.q(`.pf-stems [data-stem="${src}"] i`)?.animate([{ opacity: 1 }, { opacity: 0.22 }], { duration: 200, easing: 'ease-out' });
    if (Math.floor(e.combo / 100) > Math.floor(this.lastCombo / 100)) sfx('combo');
    this.lastCombo = e.combo;
  }

  private frame(s: HudStats): void {
    const song = this.song;
    // once the play has ended its clock is gone: the rail stays where the song left it
    if (!song || this.outcome) return;
    const now = gameEngine.songTimeAtPerf(performance.now());
    // the rail: the song comes down to the line as the notes do, sixty seconds to the screen
    const strip = this.q('.pf-rail-strip');
    strip.style.transform = `translateY(${(Math.max(0, now) / song.durationMs) * this.railPx}px)`;
    const fever = s.fever;
    if (fever.active !== this.feverOn) {
      this.feverOn = fever.active;
      this.root.classList.toggle('fever', fever.active);
      if (fever.active) sfx('fever');
    }
    if (fever.active) {
      this.root.style.setProperty('--fever', FEVER_TOKENS[Math.min(5, Math.max(2, fever.multiplier))] ?? token('--bone'));
      this.root.style.setProperty('--fever-left', String(fever.remaining));
    }
  }

  /** The song as a rail: its sections by name in their leading stem's colour, and the chart's notes per second beside them. */
  private drawRail(song: SongEntry): void {
    const canvas = this.q('.pf-rail-strip canvas') as HTMLCanvasElement;
    const rail = this.q('.pf-rail');
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const px = rem / 16;
    const w = rail.clientWidth;
    const ahead = this.root.clientHeight * 0.77;
    const h = Math.round((song.durationMs / RAIL_AHEAD_MS) * ahead);
    this.railPx = h;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const g = canvas.getContext('2d') as CanvasRenderingContext2D;
    g.scale(dpr, dpr);
    const y = (ms: number) => h - (ms / song.durationMs) * h;
    const nps = song.charts[state.mode][state.tier].nps;
    const top = Math.max(1, ...nps.graph);
    const bar = 5 * px;
    const x0 = bar + 4 * px;
    const room = w - x0 - 2 * px;
    // the chart's notes per second as a profile beside the sections: wider where there is more to hit
    g.fillStyle = token('--ink-3');
    nps.graph.forEach((v, i) => {
      const y1 = y((i + 1) * nps.binMs);
      const y0 = y(i * nps.binMs);
      g.fillRect(x0, y1, (v / top) * room, y0 - y1 + 0.5);
    });
    g.strokeStyle = token('--bone-3');
    g.lineWidth = 1.5 * px;
    g.beginPath();
    nps.graph.forEach((v, i) => {
      const x = x0 + (v / top) * room;
      g.lineTo(x, y(i * nps.binMs));
      g.lineTo(x, y((i + 1) * nps.binMs));
    });
    g.stroke();
    g.font = `700 ${13 * px}px ${token('--font-ui')}`;
    g.textBaseline = 'bottom';
    for (const s of song.sketch.sections) {
      const y0 = y(s.t);
      const y1 = y(s.endT);
      g.fillStyle = token(`--stem-${s.leader ?? 'other'}`);
      g.fillRect(0, y1 + px, bar, y0 - y1 - 2 * px);
      g.fillStyle = token('--rule-strong');
      g.fillRect(0, Math.round(y0) - px, w, px);
      if (y0 - y1 > 20 * px) {
        g.fillStyle = token('--bone');
        g.fillText(SECTION_KO[s.label] ?? s.label, bar + 6 * px, y0 - 4 * px);
      }
    }
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.root.classList.toggle('paused', paused);
    if (!paused) return;
    sfx('pause');
    this.pauseAt = 0;
    this.drawPause();
  }

  private drawPause(): void {
    const song = this.song;
    const now = Math.max(0, gameEngine.songTimeAtPerf(performance.now()));
    const section = song?.sketch.sections.find((s) => now >= s.t && now < s.endT);
    const items: [string, string][] = [
      ['계속하기', 'Esc'],
      ['다시 하기', 'R'],
      ['나가기', 'Q'],
    ];
    const codes = ['Escape', 'KeyR', 'KeyQ'];
    this.q('.pf-pause').innerHTML = `
      <div class="pf-pause-head"><b>일시정지</b><span class="num">${clock(now)} / ${clock(song?.durationMs ?? 0)}</span>${section ? `<span class="cap">${SECTION_KO[section.label] ?? section.label}</span>` : ''}</div>
      <div class="pf-pause-items">${items.map(([label, key], i) => `<button data-key="${codes[i]}" class="${i === this.pauseAt ? 'on' : ''}">${label}${kbd(key)}</button>`).join('')}</div>
      <div class="pf-pause-hint"><span>${kbd('←', '→')} 고르기</span><span>${kbd('Enter')} 결정</span></div>`;
  }

  private finish(outcome: PlayOutcome): void {
    this.outcome = outcome;
    const r = outcome.result;
    this.root.classList.add('done');
    this.root.classList.remove('fever');
    sfx('result');
    this.q('.pf-result').innerHTML = `
      <div class="pf-result-lamp" data-lamp="${r.lamp}"><i class="lamp" data-lamp="${r.lamp}"></i><b>${r.lamp}</b></div>
      <div class="pf-result-nums">
        <span><span class="cap">RATE</span><b class="num">${r.rate.toFixed(2)}%</b></span>
        <span><span class="cap">SCORE</span><b class="num">${Math.round(r.score).toLocaleString('en-US')}</b></span>
        <span><span class="cap">MAX COMBO</span><b class="num">${r.maxCombo}</b></span>
        <span><span class="cap">BREAK</span><b class="num">${r.breaks}</b></span>
      </div>
      <div class="pf-result-hint"><button data-key="Enter">${kbd('Enter')} 선곡으로</button><button data-key="KeyR">${kbd('R')} 다시 하기</button><em>결과 화면은 이번 시안의 범위 밖이라 요약만 둡니다</em></div>`;
  }

  private retry(): void {
    this.outcome = null;
    this.root.classList.remove('done', 'paused', 'fever');
    this.feverOn = false;
    this.lastCombo = 0;
    sfx('start');
    this.controller?.restart();
  }

  leave(): void {
    this.run++;
    this.controller?.dispose();
    this.controller = null;
    this.root.classList.remove('on', 'live', 'paused', 'done', 'fever');
    this.feverOn = false;
    // the menus' track takes the stage again
    this.stage.draining = false;
    this.stage.start();
    this.stage.fit();
  }

  key(e: KeyboardEvent): boolean {
    const code = e.code;
    if (this.outcome) {
      if (code === 'Enter' || code === 'NumpadEnter' || code === 'Escape') {
        sfx('confirm');
        this.onLeave();
      } else if (code === 'KeyR') this.retry();
      return true;
    }
    if (!this.controller) {
      // still loading
      if (code === 'Escape') {
        sfx('back');
        this.onLeave();
      }
      return true;
    }
    if (this.paused) {
      if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'ArrowUp' || code === 'ArrowDown') {
        const d = code === 'ArrowLeft' || code === 'ArrowUp' ? -1 : 1;
        this.pauseAt = (this.pauseAt + d + 3) % 3;
        sfx('cursor');
        this.drawPause();
        e.stopPropagation();
        return true;
      }
      if (code === 'KeyQ' || ((code === 'Enter' || code === 'NumpadEnter') && this.pauseAt === 2)) {
        sfx('back');
        e.stopPropagation();
        this.onLeave();
        return true;
      }
      if (code === 'KeyR' || ((code === 'Enter' || code === 'NumpadEnter') && this.pauseAt === 1)) {
        e.stopPropagation();
        this.retry();
        return true;
      }
      if (code === 'Enter' || code === 'NumpadEnter') {
        e.stopPropagation();
        sfx('confirm');
        this.controller.resume();
        return true;
      }
      if (code === 'Escape' && !e.isTrusted) {
        // 계속하기 pressed with a pointer (a pressed Esc is the game's own)
        this.controller.resume();
        return true;
      }
    }
    // everything else is the game's own (lanes, Esc, speed, FEVER…)
    return false;
  }
}
