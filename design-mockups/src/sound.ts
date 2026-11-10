import { audition, bufferOf, kit, pickOf, resetPicks, setPick, sfx, type Candidate, type KitEvent } from './audio';
import { clamp, el, esc, fitCanvas, kbd, token } from './dom';
import { EMBLEM } from './select';

/** A run of the kit as the menus and a play would sound it, to hear whether it is one set. */
const DEMO: [event: string, afterMs: number][] = [
  ['cursor', 0],
  ['cursor', 140],
  ['cursor', 140],
  ['slide', 260],
  ['slide', 150],
  ['tab', 320],
  ['cursor', 260],
  ['on', 240],
  ['open', 380],
  ['slideBig', 300],
  ['back', 360],
  ['confirm', 420],
  ['start', 380],
  ['hit', 1500],
  ['hit', 170],
  ['hit', 170],
  ['hit', 340],
  ['hit', 170],
  ['hit', 170],
  ['combo', 170],
  ['hit', 340],
  ['hit', 170],
  ['fever', 170],
  ['hit', 340],
  ['hit', 170],
  ['miss', 340],
  ['pause', 600],
  ['result', 900],
];

/**
 * 소리 고르기. The ear that decides is the player's: every event has a few recorded candidates,
 * laid out along the line. ↑↓ pick the event, ←→ the candidate (it sounds at once), and what is
 * picked is what the three screens play from then on.
 */
export class SoundBoard {
  readonly root = el('section', 'screen sound');
  private at = 0;
  private wave!: HTMLCanvasElement;
  private demoTimers: number[] = [];
  onDone: () => void = () => undefined;
  onMusic: (on: boolean) => void = () => undefined;
  private music = false;

  constructor() {
    this.root.innerHTML = `
      <header class="top">
        <div class="mark">${EMBLEM}<span>GENERATIVE RHYTHM</span></div>
        <span class="where">소리 고르기</span>
      </header>
      <p class="sb-intro">모든 소리는 실제 타악기를 스튜디오에서 녹음한 CC0 샘플입니다 (VCSL · Karoryfer Samples). 합성하거나 생성한 소리는 없고, 녹음을 타격 지점에 맞춰 자르고 끝을 줄이고 음량만 맞췄습니다. 고른 후보는 이 브라우저에 남아 세 화면에서 바로 쓰입니다.</p>
      <div class="sb-events"></div>
      <div class="sb-detail">
        <div class="sb-what"></div>
        <canvas class="sb-wave"></canvas>
        <div class="sb-facts"></div>
      </div>
      <div class="sb-cands"></div>
      <div class="sb-under"></div>
      <footer class="hints"></footer>`;
    this.wave = this.root.querySelector('.sb-wave') as HTMLCanvasElement;
    this.root.addEventListener('click', (e) => this.click(e));
    window.addEventListener('resize', () => this.root.classList.contains('on') && this.draw());
  }

  private q<T extends HTMLElement>(s: string): T {
    return this.root.querySelector(s) as T;
  }
  private get event(): KitEvent | undefined {
    return kit.events[this.at];
  }

  enter(): void {
    this.root.classList.add('on');
    this.draw();
  }

  leave(): void {
    this.root.classList.remove('on');
    this.stopDemo();
    if (this.music) {
      this.music = false;
      this.onMusic(false);
    }
  }

  private draw(): void {
    const e = this.event;
    this.q('.sb-events').innerHTML = kit.events
      .map((x, i) => {
        const pick = pickOf(x.id);
        const changed = pick && pick.id !== x.candidates[0]?.id;
        return `<button class="sb-ev${i === this.at ? ' on' : ''}" data-ev="${i}"><b>${esc(x.label)}</b><span>${esc(x.where)}</span><em>${changed ? '<i class="changed"></i>' : ''}${esc(pick?.label ?? '')}</em></button>`;
      })
      .join('');
    this.q('.hints').innerHTML = `<button data-key="ArrowDown">${kbd('↑', '↓')} 이벤트</button><button data-key="ArrowRight">${kbd('←', '→')} 후보 (바로 들립니다)</button><button data-key="Enter">${kbd('Enter')} 다시 듣기</button><button data-key="KeyD">${kbd('D')} 한 벌로 듣기</button><button data-key="KeyM">${kbd('M')} 음악 위에서 듣기 ${this.music ? '끄기' : '켜기'}</button><button data-key="KeyR">${kbd('R')} 처음 후보로</button><span class="end"><button data-key="Escape">${kbd('Esc')} 선곡으로</button></span>`;
    if (!e) return;
    const pick = pickOf(e.id);
    this.q('.sb-cands').innerHTML = e.candidates.map((c, i) => `<button class="sb-cand${c.id === pick?.id ? ' on' : ''}" data-cand="${i}"><span class="cap">${i + 1} / ${e.candidates.length} · ${esc(c.source.replace(' Samples', ''))}</span><b>${esc(c.label)}</b></button>`).join('');
    this.q('.sb-under').innerHTML = `<span class="cap">이 소리가 나는 곳</span><b>${esc(e.where)}</b>`;
    this.q('.sb-what').innerHTML = `<b>${esc(e.label)}</b><span>${esc(pick?.label ?? '')}</span>`;
    if (pick) {
      const fact = (label: string, value: string) => `<div><span class="cap">${label}</span><b class="num">${value}</b></div>`;
      const db = (v: number | undefined) => (v === undefined ? '–' : `${v.toFixed(1)} dBFS`);
      const floor = pick.floorDb === undefined || pick.floorDb > -60 ? '–' : pick.floorDb <= -150 ? '디지털 무음' : `${pick.floorDb.toFixed(1)} dBFS`;
      this.q('.sb-facts').innerHTML =
        fact('길이', `${pick.durationMs ?? '–'} ms`) +
        fact('피크', db(pick.peakDb)) +
        fact('가장 큰 30 ms', db(pick.rmsDb)) +
        fact('맞춘 음량', pick.gainDb === undefined ? '–' : `${pick.gainDb > 0 ? '+' : ''}${pick.gainDb.toFixed(1)} dB`) +
        fact('원본의 잡음 바닥', floor) +
        fact('원본 클리핑', pick.clipped ? `${pick.clipped} 샘플` : '없음') +
        `<div class="wide"><span class="cap">원본 파일 · 라이선스</span><b>${esc(pick.raw ?? '')} · ${esc(pick.license ?? '')}</b></div>`;
      this.drawWave(pick);
    }
  }

  /** The cut sample as it is played: its waveform over a time axis in ms. */
  private drawWave(c: Candidate): void {
    const { g, w, h } = fitCanvas(this.wave);
    const buffer = bufferOf(c);
    if (w === 0 || !buffer) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const px = rem / 16;
    const data = buffer.getChannelData(0);
    const axis = 22 * px;
    const mid = (h - axis) / 2;
    const ms = buffer.duration * 1000;
    // a round number of ms per tick, six to twelve ticks across
    const step = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => ms / s <= 12) ?? 1000;
    g.font = `600 ${13 * px}px ${token('--font-num')}`;
    g.textBaseline = 'alphabetic';
    for (let t = 0; t <= ms; t += step) {
      const x = Math.round((t / ms) * (w - 1));
      g.fillStyle = token('--rule');
      g.fillRect(x, 0, 1, h - axis);
      g.fillStyle = token('--bone-3');
      g.fillRect(x, h - axis, 1, 5 * px);
      g.fillStyle = token('--bone-2');
      g.textAlign = t === 0 ? 'left' : 'center';
      if (x < w - 24 * px) g.fillText(`${t}`, x + (t === 0 ? 2 * px : 0), h - 4 * px);
    }
    g.textAlign = 'right';
    g.fillText('ms', w, h - 4 * px);
    g.fillStyle = token('--rule-strong');
    g.fillRect(0, Math.round(mid), w, 1);
    g.fillStyle = token('--bone');
    const per = data.length / w;
    for (let x = 0; x < w; x++) {
      let lo = 0;
      let hi = 0;
      const a = Math.floor(x * per);
      const b = Math.min(data.length, Math.max(a + 1, Math.floor((x + 1) * per)));
      for (let i = a; i < b; i++) {
        if (data[i] < lo) lo = data[i];
        if (data[i] > hi) hi = data[i];
      }
      const y0 = mid - hi * (mid - 2 * px);
      const y1 = mid - lo * (mid - 2 * px);
      g.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }
  }

  private stopDemo(): void {
    this.demoTimers.forEach((t) => clearTimeout(t));
    this.demoTimers = [];
    this.root.classList.remove('demo');
  }

  private demo(): void {
    this.stopDemo();
    this.root.classList.add('demo');
    let at = 0;
    for (const [event, after] of DEMO) {
      at += after;
      this.demoTimers.push(
        window.setTimeout(() => {
          sfx(event);
          const i = kit.events.findIndex((x) => x.id === event);
          this.root.querySelectorAll('.sb-ev').forEach((n, k) => n.classList.toggle('ping', k === i));
        }, at),
      );
    }
    this.demoTimers.push(
      window.setTimeout(() => {
        this.root.querySelectorAll('.sb-ev.ping').forEach((n) => n.classList.remove('ping'));
        this.root.classList.remove('demo');
      }, at + 1200),
    );
  }

  private choose(i: number): void {
    const e = this.event;
    if (!e) return;
    const c = e.candidates[clamp(i, 0, e.candidates.length - 1)];
    setPick(e.id, c.id);
    audition(c);
    this.draw();
  }

  key(e: KeyboardEvent): boolean {
    const code = e.code;
    const ev = this.event;
    if (code === 'Escape') {
      sfx('back');
      this.onDone();
    } else if (code === 'ArrowUp' || code === 'ArrowDown') {
      this.stopDemo();
      this.at = (this.at + (code === 'ArrowUp' ? -1 : 1) + kit.events.length) % kit.events.length;
      const pick = this.event && pickOf(this.event.id);
      if (pick) audition(pick);
      this.draw();
    } else if ((code === 'ArrowLeft' || code === 'ArrowRight') && ev) {
      this.stopDemo();
      const now = ev.candidates.findIndex((c) => c.id === pickOf(ev.id)?.id);
      this.choose((now + (code === 'ArrowLeft' ? -1 : 1) + ev.candidates.length) % ev.candidates.length);
    } else if ((code === 'Enter' || code === 'NumpadEnter' || code === 'Space') && ev) {
      const pick = pickOf(ev.id);
      if (pick) audition(pick);
    } else if (code === 'KeyD') this.demo();
    else if (code === 'KeyM') {
      this.music = !this.music;
      this.onMusic(this.music);
      this.draw();
    } else if (code === 'KeyR') {
      resetPicks();
      sfx('confirm');
      this.draw();
    } else if (/^Digit[1-9]$/.test(code) && ev && e.altKey) this.choose(Number(code.slice(5)) - 1);
    else return false;
    return true;
  }

  private click(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const ev = t.closest<HTMLElement>('[data-ev]');
    if (ev) {
      this.stopDemo();
      this.at = Number(ev.dataset.ev);
      const pick = this.event && pickOf(this.event.id);
      if (pick) audition(pick);
      this.draw();
      return;
    }
    const cand = t.closest<HTMLElement>('[data-cand]');
    if (cand) this.choose(Number(cand.dataset.cand));
  }
}
