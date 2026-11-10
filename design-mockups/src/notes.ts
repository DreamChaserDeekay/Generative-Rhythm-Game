import { kit } from './audio';
import { songs } from './data';
import { el, esc } from './dom';
import body from './notes.html?raw';
import { EMBLEM } from './select';

/** 설명: what was seen in the game today, the idea, what changed on each screen and why, what an implementation meets, and where everything came from. */
export class NotesPage {
  readonly root = el('section', 'screen notes');
  onDone: () => void = () => undefined;

  constructor() {
    this.root.innerHTML = `
      <header class="top">
        <div class="mark">${EMBLEM}<span>GENERATIVE RHYTHM</span></div>
        <span class="where">설명</span>
      </header>
      <div class="doc" tabindex="-1"><article>${body}</article></div>`;
  }

  private fill(): void {
    const music = this.root.querySelector('[data-music]');
    if (music && songs.length)
      music.innerHTML = songs
        .map((s) => `<tr><td>${esc(s.title)}</td><td>${esc(s.artist)}</td><td><a href="${esc(s.credit.license_url ?? '#')}" target="_blank" rel="noopener">${esc(s.credit.license ?? '')}</a></td><td>${esc(s.credit.attribution ?? '')}<br /><a href="${esc(s.credit.page_url ?? '#')}" target="_blank" rel="noopener">${esc((s.credit.page_url ?? '').replace(/^https?:\/\//, ''))}</a></td></tr>`)
        .join('');
    const sound = this.root.querySelector('[data-sfx]');
    if (sound)
      sound.innerHTML = kit.events
        .flatMap((e) => e.candidates.map((c) => `<tr><td>${esc(e.label)}</td><td>${esc(c.label)}</td><td>${esc(c.source)}</td><td>${esc(c.raw ?? '')}</td><td class="num">${c.durationMs ?? ''} ms</td><td class="num">${c.peakDb?.toFixed(1) ?? ''}</td><td class="num">${c.rmsDb?.toFixed(1) ?? ''}</td></tr>`))
        .join('');
  }

  enter(): void {
    this.root.classList.add('on');
    this.fill();
    (this.root.querySelector('.doc') as HTMLElement).focus({ preventScroll: true });
  }
  leave(): void {
    this.root.classList.remove('on');
  }
  key(e: KeyboardEvent): boolean {
    const doc = this.root.querySelector('.doc') as HTMLElement;
    const page = doc.clientHeight * 0.85;
    const by = { ArrowDown: 80, ArrowUp: -80, PageDown: page, PageUp: -page, Space: page, Home: -1e9, End: 1e9 }[e.code];
    if (by !== undefined) doc.scrollBy({ top: by, behavior: 'smooth' });
    else if (e.code === 'Escape') this.onDone();
    else return false;
    return true;
  }
}
