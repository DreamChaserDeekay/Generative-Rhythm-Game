import { hudTypeFor } from '@game/render/gearHud';
import { loadSkinArt } from '@game/render/skinArt';
import { bindingsFor, keyLabel, secondBindingsFor, skinOf } from '@game/settings/settings';
import { playedSettings, ruleChips } from '@game/ui/playRules';
import type { PlayRequest } from '@game/ui/App';
import { loadHudFont } from '@game/ui/Hud';
import { PlayController, type PlayOutcome } from '@game/ui/PlayController';
import { gameEngine, sfx, unlock } from './audio';
import { coverOf, jacket, lampMark } from './art';
import { bpmText, chartOf, detailOf, songs, type SampleRecord, type SongEntry } from './data';
import { clock, el, esc, kbd } from './dom';
import { mediaOf, setSettings, state } from './state';

/**
 * Play. The track, the gear and the HUD lying on it are the game's own (its PlayController runs
 * here unchanged, with the game's own background layer: the jacket and the registered video). The
 * mockup's part is only what stands around them: the card a play starts from, the song's name in a
 * corner, the pause menu and the card a play ends with.
 */
export class PlayScreen {
  readonly root = el('section', 'screen play');
  private controller: PlayController | null = null;
  private run = 0;
  private paused = false;
  private pauseAt = 0;
  private outcome: PlayOutcome | null = null;
  private song: SongEntry | null = null;
  onLeave: () => void = () => undefined;

  constructor(app: HTMLElement) {
    this.root.innerHTML = `
      <div class="game-scope"><div class="play-screen"><div class="play-bg"></div><canvas class="play-canvas"></canvas><div class="hud"></div></div></div>
      <div class="pf-head"></div>
      <button class="pf-esc" data-key="Escape">${kbd('Esc')}<span>일시정지</span></button>
      <div class="pf-card"></div>
      <div class="pf-pause"></div>
      <div class="pf-result"></div>`;
    app.append(this.root);
  }

  private q<T extends HTMLElement>(s: string): T {
    return this.root.querySelector(s) as T;
  }

  /** The jacket comes over from where it stood on the song select. */
  arriveFrom(from: DOMRect | null): void {
    const jk = this.q('.pf-card-in .jk');
    const to = jk.getBoundingClientRect();
    if (!from || to.width === 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    jk.animate(
      [
        { transformOrigin: '0 0', transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})` },
        { transformOrigin: '0 0', transform: 'none' },
      ],
      { duration: 420, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
  }

  enter(auto: boolean): void {
    const mine = ++this.run;
    const song = songs[state.song];
    this.song = song;
    this.outcome = null;
    this.paused = false;
    this.root.classList.add('on');
    this.root.classList.remove('live', 'paused', 'done');
    const c = song.charts[state.mode][state.tier];
    const chip = `<span class="chip-tier" data-tier="${state.tier}">${state.mode} · ${state.tier}<b class="num">${c.level}</b></span>`;
    this.q('.pf-card').innerHTML = `
      <div class="pf-card-in">
        ${jacket(song)}
        <div class="pf-card-text">
          <div class="pf-card-chips">${chip}${auto ? '<span class="pf-tag">AUTO</span>' : ''}</div>
          <h1>${esc(song.title)}</h1>
          <div class="by">${esc(song.artist)}</div>
          <div class="pf-card-facts">
            <span><span class="cap en">BPM</span><b class="num">${bpmText(song)}</b></span>
            <span><span class="cap">노트</span><b class="num">${c.noteCount.toLocaleString('en-US')}</b></span>
            <span><span class="cap">길이</span><b class="num">${clock(song.durationMs)}</b></span>
            <span><span class="cap">노트 속도</span><b class="num">${state.settings.hiSpeed.toFixed(2)}</b></span>
          </div>
          <div class="pf-card-rules"></div>
          <div class="pf-card-keys"></div>
        </div>
      </div>
      <div class="pf-card-load"><i class="pf-load-bar"><u></u></i><span class="pf-load-text">불러오는 중</span><button data-key="Escape">${kbd('Esc')}<span>취소</span></button></div>`;
    this.q('.pf-head').innerHTML = `${jacket(song)}<div><b>${esc(song.title)}</b><span>${esc(song.artist)}</span></div>${chip}${auto ? '<span class="pf-tag">AUTO</span>' : ''}`;
    sfx('start');
    void this.begin(mine, song, auto);
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
        new Promise((r) => setTimeout(r, 700)),
      ]);
      if (mine !== this.run) return;
      const chart = chartOf(song, detail, state.mode, state.tier);
      const media = mediaOf(song.id);
      const request: PlayRequest = {
        chart,
        loadAudio: async () => buffer,
        autoPlay,
        // the game's own background layer: the jacket, and the video registered on the song select
        // (a YouTube link needs the network and YouTube's player: the mockup leaves it out)
        background: { coverUrl: coverOf(song), bgaUrl: media.video?.kind === 'file' ? media.video.url : null, bgaYoutube: null, bgaOffsetMs: media.videoOffsetMs },
      };
      // the rules of this play where they are not the defaults, as the game's loading card lists them
      this.q('.pf-card-rules').innerHTML = ruleChips(playedSettings(request, settings), false)
        .map(([name, value]) => `<span>${name ? `<span class="cap">${esc(name)}</span>` : ''}<b>${esc(value)}</b></span>`)
        .join('');
      const keys = bindingsFor(settings, chart.meta.keyMode);
      const seconds = secondBindingsFor(settings, chart.meta.keyMode);
      this.q('.pf-card-keys').innerHTML = `<span class="cap">키</span>${keys.map((code, lane) => kbd(seconds[lane] ? `${keyLabel(code)} · ${keyLabel(seconds[lane] as string)}` : keyLabel(code))).join('')}`;
      this.root.classList.add('ready');
      // long enough to read the keys on a fast machine too
      await new Promise((r) => setTimeout(r, 900));
      if (mine !== this.run) return;
      // the game's own hit sound is an oscillator: off here (the sounds are being chosen again)
      gameEngine.playHitSound = () => undefined;
      this.controller = new PlayController(
        { request, buffer, bufferPlacement: { originMs: 0, rate: 1 }, settings: { ...settings, hitSound: false }, canvas: this.q('.play-canvas') as HTMLCanvasElement, hudRoot: this.q('.hud'), bgRoot: this.q('.play-bg'), art },
        {
          onFinish: (outcome) => this.finish(outcome),
          onPauseChange: (paused) => this.setPaused(paused),
          onSettingsChange: (s) => setSettings({ ...s, hitSound: state.settings.hitSound }),
        },
      );
      this.root.classList.add('live');
    } catch (e) {
      if (mine !== this.run) return;
      this.q('.pf-card-load').innerHTML = `<span class="pf-load-text">${esc(e instanceof Error ? e.message : String(e))}</span><button data-key="Escape">${kbd('Esc')}<span>돌아가기</span></button>`;
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
    const items: [string, string, string][] = [
      ['계속하기', 'Esc', 'Escape'],
      ['다시 하기', 'R', 'KeyR'],
      ['나가기', 'Q', 'KeyQ'],
    ];
    this.q('.pf-pause').innerHTML = `
      <div class="sheet-box">
        <div class="sheet-head"><b>일시정지</b><span class="num">${clock(now)} / ${clock(song?.durationMs ?? 0)}</span></div>
        <div class="sheet-items">${items.map(([label, key, code], i) => `<button data-key="${code}" class="${i === this.pauseAt ? 'on' : ''}"><span>${label}</span><span class="right">${kbd(key)}</span></button>`).join('')}</div>
        <div class="sheet-foot"><span>${kbd('↑', '↓')}고르기</span><span>${kbd('Enter')}결정</span></div>
      </div>`;
  }

  private finish(outcome: PlayOutcome): void {
    this.outcome = outcome;
    const r = outcome.result;
    const song = this.song as SongEntry;
    this.root.classList.add('done');
    sfx('result');
    this.q('.pf-result').innerHTML = `
      <div class="pf-result-in">
        ${jacket(song)}
        <div class="pf-result-text">
          <div class="pf-result-lamp">${lampMark(r.lamp as SampleRecord['lamp'])}<b>${esc(r.lamp)}</b></div>
          <h1>${esc(song.title)}</h1>
          <div class="pf-result-nums">
            <span><span class="cap en">RATE</span><b class="num">${r.rate.toFixed(2)}<small>%</small></b></span>
            <span><span class="cap en">SCORE</span><b class="num">${Math.round(r.score).toLocaleString('en-US')}</b></span>
            <span><span class="cap en">MAX COMBO</span><b class="num">${r.maxCombo}</b></span>
            <span><span class="cap en">BREAK</span><b class="num">${r.breaks}</b></span>
          </div>
          <div class="pf-result-hint"><button data-key="Enter">${kbd('Enter')}<span>곡 선택으로</span></button><button data-key="KeyR">${kbd('R')}<span>다시 하기</span></button></div>
          <p>결과 화면은 이번 시안의 범위 밖이라 요약만 둡니다.</p>
        </div>
      </div>`;
  }

  private retry(): void {
    this.outcome = null;
    this.root.classList.remove('done', 'paused');
    sfx('start');
    this.controller?.restart();
  }

  leave(): void {
    this.run++;
    this.controller?.dispose();
    this.controller = null;
    this.root.classList.remove('on', 'live', 'paused', 'done', 'ready');
  }

  key(e: KeyboardEvent): boolean {
    const code = e.code;
    const enter = code === 'Enter' || code === 'NumpadEnter';
    if (this.outcome) {
      if (enter || code === 'Escape') {
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
      if (code === 'KeyQ' || (enter && this.pauseAt === 2)) {
        sfx('back');
        e.stopPropagation();
        this.onLeave();
        return true;
      }
      if (code === 'KeyR' || (enter && this.pauseAt === 1)) {
        e.stopPropagation();
        this.retry();
        return true;
      }
      if (enter) {
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
