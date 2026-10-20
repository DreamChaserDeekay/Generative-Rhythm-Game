import type { ReactNode } from 'react';

/** Two rails meeting toward the horizon over a judge line: the accent on the left, the brand rail on the right. */
export function Emblem({ size = 20 }: { size?: number }) {
  return (
    <svg className="emblem" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <line x1="4" y1="22" x2="10" y2="2" style={{ stroke: 'var(--accent)' }} strokeWidth="2.2" strokeLinecap="square" />
      <line x1="20" y1="22" x2="14" y2="2" style={{ stroke: 'var(--brand-rail)' }} strokeWidth="2.2" strokeLinecap="square" />
      <line x1="5.2" y1="17" x2="18.8" y2="17" style={{ stroke: 'var(--text)' }} strokeWidth="2" />
      <rect x="9.4" y="9" width="5.2" height="2" style={{ fill: 'var(--text)' }} />
    </svg>
  );
}

/** The bar on top of every menu screen: the game's mark, the screen's name and its actions. */
export function TopBar({ name, children }: { name: string; children?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="wordmark">
        <Emblem />
        <span>GENERATIVE RHYTHM</span>
      </div>
      <span className="screen-name">{name}</span>
      {children && <div className="topbar-actions">{children}</div>}
    </header>
  );
}

/** A key (or keys) and what it does on this screen; with `onClick` the hint is a button too. */
export interface KeyHint {
  keys: string[];
  label: string;
  onClick?: () => void;
  testId?: string;
}

/** The bottom line of every menu screen: the keys that work here, the main one at the end. */
export function HintBar({ hints, end = [] }: { hints: KeyHint[]; end?: KeyHint[] }) {
  const item = (h: KeyHint) => {
    const content = (
      <>
        {h.keys.map((k) => (
          <kbd key={k}>{k}</kbd>
        ))}
        {h.label}
      </>
    );
    const key = `${h.keys.join('+')}-${h.label}`;
    return h.onClick ? (
      <button key={key} className="hint-item" data-testid={h.testId} onClick={h.onClick}>
        {content}
      </button>
    ) : (
      <span key={key} className="hint-item">
        {content}
      </span>
    );
  };
  return (
    <footer className="hintbar">
      {hints.map(item)}
      {end.length > 0 && <span className="hint-end">{end.map(item)}</span>}
    </footer>
  );
}
