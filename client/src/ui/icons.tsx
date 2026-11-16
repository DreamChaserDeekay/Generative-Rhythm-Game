/** The menus' drawn marks: square-capped line icons on a 24 grid, in the colour of the text they stand in. */

const frame = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'square', strokeLinejoin: 'miter', 'aria-hidden': true } as const;

/** Edit (a song's cover). */
export function PencilIcon() {
  return (
    <svg className="icon" {...frame}>
      <path d="M4 20l1-4.5L15.5 5 19 8.5 8.5 19z" />
      <path d="M13.5 7l3.5 3.5" />
    </svg>
  );
}

/** A background video. */
export function FilmIcon() {
  return (
    <svg className="icon" {...frame}>
      <rect x="3.5" y="5" width="17" height="14" />
      <path d="M10 9.2v5.6l5-2.8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** A favourite: hollow, or filled once it is one. */
export function StarIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg className="icon" {...frame}>
      <path d="M12 3.6l2.5 5.4 5.9.7-4.4 4 1.2 5.8-5.2-3-5.2 3 1.2-5.8-4.4-4 5.9-.7z" fill={filled ? 'currentColor' : 'none'} />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg className="icon" {...frame}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5.5 5.5" />
    </svg>
  );
}

/** The way an order runs: down (내림차순) or up (오름차순). */
export function ArrowIcon({ dir }: { dir: 'down' | 'up' }) {
  return (
    <svg className="icon" {...frame} strokeWidth={2.6}>
      {dir === 'down' ? <path d="M12 5v13M6.5 12.5L12 18l5.5-5.5" /> : <path d="M12 19V6M6.5 11.5L12 6l5.5 5.5" />}
    </svg>
  );
}
