import { useEffect, useState, type ReactNode } from 'react';

/** The game's mark: four keys, one of them down. */
export function Emblem() {
  return (
    <svg className="emblem" viewBox="0 0 28 20" aria-hidden="true" fill="currentColor">
      <rect x="0" y="2" width="5" height="16" />
      <rect x="7.6" y="2" width="5" height="16" />
      <rect x="15.2" y="7" width="5" height="11" />
      <rect x="22.8" y="2" width="5" height="16" />
    </svg>
  );
}

/** The bar on top of every menu screen: the game's mark, the screen's name (and what it is on) and its actions. */
export function TopBar({ name, detail, children }: { name: string; detail?: ReactNode; children?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="wordmark">
        <Emblem />
        <span>GENERATIVE RHYTHM</span>
      </div>
      <span className="screen-name">{name}</span>
      {detail && <span className="screen-detail">{detail}</span>}
      {children && <div className="topbar-actions">{children}</div>}
    </header>
  );
}

/**
 * A key (or keys) and what it does on this screen; with `onClick` the hint is a button too. With
 * `pad`, the pad's buttons for it: while a pad works the menus the bar shows those (and only the
 * hints that have them). A `minor` hint gives way on a narrow window; the `main` one is the
 * screen's main key, drawn as a paper plate.
 */
export interface KeyHint {
  keys: string[];
  pad?: string[];
  label: string;
  onClick?: () => void;
  testId?: string;
  minor?: boolean;
  main?: boolean;
}

/**
 * Whether a pad with the standard mapping works the menus now: from its first press (the menu
 * bridge marks the page) until a key of the keyboard is pressed, or a controller of its own layout
 * takes over (its menu buttons send the keyboard's keys, so the bar names those). A pointer
 * changes nothing, so a hint does not move under it.
 */
export function usePadInput(): boolean {
  const [pad, setPad] = useState(() => document.documentElement.dataset.input === 'pad');
  useEffect(() => {
    const root = document.documentElement;
    const watch = new MutationObserver(() => {
      if (root.dataset.input === 'pad') setPad(true);
      else if (root.dataset.input === 'controller') setPad(false);
    });
    const key = (e: KeyboardEvent) => {
      if (e.isTrusted) setPad(false);
    };
    watch.observe(root, { attributes: true, attributeFilter: ['data-input'] });
    window.addEventListener('keydown', key, { capture: true });
    return () => {
      watch.disconnect();
      window.removeEventListener('keydown', key, { capture: true });
    };
  }, []);
  return pad;
}

/**
 * The bottom line of every menu screen: the keys that work here, the main one at the end (it
 * stays whole on a narrow window: the others give way, the minor ones first).
 */
export function HintBar({ hints, end = [] }: { hints: KeyHint[]; end?: KeyHint[] }) {
  const pad = usePadInput() && [...hints, ...end].some((h) => h.pad);
  const item = (h: KeyHint) => {
    const keys = pad ? (h.pad ?? []) : h.keys;
    const content = (
      <>
        {keys.map((k) => (
          <kbd key={k}>{k}</kbd>
        ))}
        <span>{h.label}</span>
      </>
    );
    const key = `${h.keys.join('+')}-${h.label}`;
    const className = `hint-item${h.minor ? ' minor' : ''}${h.main ? ' main' : ''}`;
    return h.onClick ? (
      <button key={key} className={className} data-testid={h.testId} onClick={h.onClick}>
        {content}
      </button>
    ) : (
      <span key={key} className={className} data-testid={h.testId}>
        {content}
      </span>
    );
  };
  const shown = (list: KeyHint[]) => list.filter((h) => (pad ? h.pad : h.keys.length > 0 || !h.pad));
  return (
    <footer className="hintbar" data-input={pad ? 'pad' : undefined}>
      <span className="hint-main">{shown(hints).map(item)}</span>
      {end.length > 0 && <span className="hint-end">{shown(end).map(item)}</span>}
    </footer>
  );
}
