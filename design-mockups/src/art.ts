import { leadStem, type SampleRecord, type SongEntry } from './data';
import { esc } from './dom';
import { mediaOf } from './state';

/** The mockup's own drawn marks: icons, lamps, the jacket and the disc a song has without one. */

const svg = (body: string, box = 24) => `<svg viewBox="0 0 ${box} ${box}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter">${body}</svg>`;

export const ICON = {
  /** Edit (the jacket). */
  pencil: svg('<path d="M4 20l1-4.5L15.5 5 19 8.5 8.5 19z"/><path d="M13.5 7l3.5 3.5"/>'),
  /** A background video. */
  film: svg('<rect x="3.5" y="5" width="17" height="14"/><path d="M10 9.200v5.600l5-2.800z" fill="currentColor" stroke="none"/>'),
  star: svg('<path d="M12 3.600l2.5 5.4 5.9.700-4.4 4 1.2 5.8-5.2-3-5.2 3 1.2-5.8-4.4-4 5.9-.700z"/>'),
  starOn: svg('<path d="M12 3.600l2.5 5.4 5.9.700-4.4 4 1.2 5.8-5.2-3-5.2 3 1.2-5.8-4.4-4 5.9-.700z" fill="currentColor"/>'),
  search: svg('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/>'),
  down: svg('<path d="M12 5v13M6.5 12.500L12 18l5.5-5.5"/>'),
  up: svg('<path d="M12 19V6M6.5 11.500L12 6l5.5 5.5"/>'),
  left: svg('<path d="M14.5 5.500L8 12l6.5 6.5"/>'),
  right: svg('<path d="M9.5 5.500L16 12l-6.5 6.5"/>'),
  check: svg('<path d="M5 12.500l4.5 4.500L19 7.5"/>'),
};

/** The game's wordmark beside a small mark of the mockup's own: four keys, one of them down. */
export const MARK = `<svg class="mark-glyph" viewBox="0 0 28 20" aria-hidden="true"><rect x="0" y="2" width="5" height="16" fill="currentColor"/><rect x="7.6" y="2" width="5" height="16" fill="currentColor"/><rect x="15.2" y="7" width="5" height="11" fill="currentColor"/><rect x="22.8" y="2" width="5" height="16" fill="currentColor"/></svg>`;

const LAMP_SHAPE: Record<SampleRecord['lamp'], string> = {
  // a ring: played, not cleared
  FAILED: '<circle cx="8" cy="8" r="4.6" stroke="currentColor" stroke-width="1.8" fill="none"/>',
  // half a disc
  'EASY CLEAR': '<circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 3a5 5 0 0 0 0 10z" fill="currentColor"/>',
  CLEAR: '<circle cx="8" cy="8" r="5.4" fill="currentColor"/>',
  'HARD CLEAR': '<rect x="3" y="3" width="10" height="10" fill="currentColor"/>',
  'MAX COMBO': '<path d="M8 1.500L14.5 8 8 14.5 1.5 8z" fill="currentColor"/>',
  'PERFECT PLAY': '<path d="M8 .800l2.1 5.1 5.1 2.1-5.1 2.100L8 15.200l-2.1-5.100L.800 8l5.1-2.100z" fill="currentColor"/>',
};
const LAMP_CLASS: Record<SampleRecord['lamp'], string> = { FAILED: 'failed', 'EASY CLEAR': 'easy', CLEAR: 'clear', 'HARD CLEAR': 'hard', 'MAX COMBO': 'maxcombo', 'PERFECT PLAY': 'perfect' };

/** A clear lamp: each has its own shape, so its colour is never the only thing that tells it apart. */
export function lampMark(lamp: SampleRecord['lamp'] | null): string {
  if (!lamp) return '<i class="lamp none"></i>';
  return `<i class="lamp ${LAMP_CLASS[lamp]}" title="${lamp}"><svg viewBox="0 0 16 16" aria-hidden="true">${LAMP_SHAPE[lamp]}</svg></i>`;
}

/** The picture a song is shown with: what the player picked in this visit, else the library's (a sample jacket), else none. */
export function coverOf(song: SongEntry): string | null {
  const m = mediaOf(song.id);
  if (m.cover !== undefined) return m.cover;
  return song.hasCover ? `./covers/${song.id}.jpg` : null;
}

/**
 * A song without a jacket is a disc in the colour of the stem that leads it, as in the game. The
 * grooves are a few hairlines, the label carries nothing: the name is always beside it.
 */
function disc(song: SongEntry): string {
  const rings = [44, 40.5, 36, 33, 29.5, 25].map((r) => `<circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width=".600"/>`).join('');
  return `<svg class="disc" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="var(--bg-2)"/><circle cx="50" cy="50" r="46" fill="#090a0c"/>${rings}<circle cx="50" cy="50" r="17" fill="var(--stem-${leadStem(song)})"/><circle cx="50" cy="50" r="17" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1"/><circle cx="50" cy="50" r="2.4" fill="var(--bg-2)"/></svg>`;
}

/** The jacket as markup: the picture, or the disc. */
export function jacket(song: SongEntry, className = ''): string {
  const url = coverOf(song);
  return `<span class="jk ${className}${url ? '' : ' bare'}">${url ? `<img src="${esc(url)}" alt="" draggable="false" />` : disc(song)}</span>`;
}

const washes = new Map<string, Promise<string | null>>();
/**
 * The jacket as a wash of colour for the screen behind it: drawn once, 6 px across, and stretched
 * (the stretch is the softness: no blur filter runs).
 */
export function washOf(url: string): Promise<string | null> {
  let w = washes.get(url);
  if (!w) {
    w = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = 6;
          c.height = 6;
          const g = c.getContext('2d') as CanvasRenderingContext2D;
          g.imageSmoothingQuality = 'high';
          g.drawImage(img, 0, 0, 6, 6);
          resolve(c.toDataURL('image/jpeg', 0.8));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
    washes.set(url, w);
  }
  return w;
}
