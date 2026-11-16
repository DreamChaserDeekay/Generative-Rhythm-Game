import { MARK } from './art';
import { songs } from './data';
import { el, esc } from './dom';
import body from './notes.html?raw';

/** 설명: what the feedback asked for and where it went, how the three screens are built now, what an implementation meets, and where everything came from. */
export class NotesPage {
  readonly root = el('section', 'screen notes');
  onDone: () => void = () => undefined;
  onChoice: (name: 'backdrop' | 'wheel') => void = () => undefined;

  constructor() {
    this.root.innerHTML = `
      <header class="top">
        <div class="mark">${MARK}<span>GENERATIVE RHYTHM</span></div>
        <span class="where">시안 설명</span>
      </header>
      <div class="doc" tabindex="-1"><article>${body}</article></div>`;
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-choice]');
      if (b) this.onChoice(b.dataset.choice as 'backdrop' | 'wheel');
    });
  }

  /** The two side-by-side choices as they stand now, on their buttons. */
  showChoices(now: { backdrop: string; wheel: string }): void {
    for (const [name, label] of [
      ['backdrop', '배경'],
      ['wheel', '목록'],
    ] as const) {
      const b = this.root.querySelector(`[data-choice="${name}"] span`);
      if (b) b.textContent = `${label}: ${now[name]}`;
    }
  }

  private fill(): void {
    const music = this.root.querySelector('[data-music]');
    if (music && songs.length)
      music.innerHTML = songs
        .map((s) => `<tr><td>${esc(s.title)}</td><td>${esc(s.artist)}</td><td>${esc(s.album || '–')}</td><td><a href="${esc(s.credit.license_url ?? '#')}" target="_blank" rel="noopener">${esc(s.credit.license ?? '')}</a></td><td class="wrap">${esc(s.credit.attribution ?? '')}<br /><a href="${esc(s.credit.page_url ?? '#')}" target="_blank" rel="noopener">${esc((s.credit.page_url ?? '').replace(/^https?:\/\//, ''))}</a></td></tr>`)
        .join('');
    const covers = this.root.querySelector('[data-covers]');
    if (covers) covers.innerHTML = songs.filter((s) => s.hasCover).map((s) => `<figure><img loading="lazy" src="./covers/${s.id}.jpg" alt="" /><figcaption>${esc(s.title)}</figcaption></figure>`).join('');
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
