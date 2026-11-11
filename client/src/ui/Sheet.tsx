import { useEffect, useRef, type ReactNode } from 'react';
import { usePadInput } from './shell';

/** A row of a sheet: something to do (Enter), or a value to change (←→). */
export interface SheetItem {
  id: string;
  label: string;
  /** A second, quieter line of words beside the name. */
  sub?: string;
  /** The key that does the same without the sheet (shown at the row's end while a keyboard is used). */
  cap?: string;
  /** A value changed with ←→ (Shift: a bigger step). */
  value?: string;
  onStep?: (dir: 1 | -1, big: boolean) => void;
  onPress?: () => void;
  disabled?: boolean;
  /** Set apart from the rows above it by a line. */
  apart?: boolean;
  testId?: string;
}

interface Props {
  title: string;
  /** What the sheet is about now, beside its title (a state: 그림, 등록됨 …). */
  status?: ReactNode;
  items: SheetItem[];
  /** Under the rows: a form of the sheet's own (a link being typed). */
  children?: ReactNode;
  note?: ReactNode;
  /** Where it stands: in the middle of the screen, or by the song's jacket (what it is about). */
  anchor?: 'center' | 'jacket';
  /** The row that has the cursor as the sheet opens (the first that can be pressed otherwise). */
  initial?: string;
  onClose: () => void;
  testId?: string;
}

/** Keys the browser would act on itself while a sheet is open (a search of the page, a reload, its menu). */
const BROWSER_KEYS = new Set(['F1', 'F3', 'F5', 'F6', 'F7', 'F10', 'Tab']);

const typing = (target: EventTarget | null) => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

/**
 * A short list over the screen: the menu, adding a song, a song's cover or its background video.
 * It has the keys while it is open (none reaches the screen under it): ↑↓ move the cursor, ←→
 * change a value, Enter presses, Esc closes; a pad's d-pad, A and B come as the same keys. The
 * row under the cursor is the one with the focus, so a pointer and a screen reader agree with it.
 */
export function Sheet({ title, status, items, children, note, anchor = 'center', initial, onClose, testId }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const pad = usePadInput();
  const rows = () => [...(box.current?.querySelectorAll<HTMLButtonElement>('.menu-item:not(:disabled)') ?? [])];

  // the cursor starts on the row asked for, else on the first that can be pressed
  useEffect(() => {
    const first = (initial && box.current?.querySelector<HTMLButtonElement>(`.menu-item[data-item="${initial}"]:not(:disabled)`)) || rows()[0];
    (first ?? box.current)?.focus({ preventScroll: true });
  }, []);

  // what the sheet needs of its latest render, for the one key listener below
  const live = useRef({ items, onClose });
  live.current = { items, onClose };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // every key is the sheet's while it is open
      e.stopPropagation();
      const { items, onClose } = live.current;
      if (e.code === 'Escape') {
        e.preventDefault();
        // (a field of the sheet's own form takes its Esc first: it closes the form)
        if (!typing(e.target) && !e.repeat) onClose();
        return;
      }
      if (typing(e.target)) return;
      if (BROWSER_KEYS.has(e.code) || e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Home' || e.code === 'End' || e.code.startsWith('Page')) e.preventDefault();
      const list = rows();
      const at = list.indexOf(document.activeElement as HTMLButtonElement);
      const item = at >= 0 ? items.find((i) => i.id === list[at].dataset.item) : undefined;
      if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        if (list.length === 0) return;
        const dir = e.code === 'ArrowDown' ? 1 : -1;
        // a fresh press goes round the ends, a held key stops at them
        const next = at < 0 ? 0 : e.repeat ? Math.min(list.length - 1, Math.max(0, at + dir)) : (at + dir + list.length) % list.length;
        list[next].focus();
      } else if (e.code === 'Home' || e.code === 'End') {
        list[e.code === 'Home' ? 0 : list.length - 1]?.focus();
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        item?.onStep?.(e.code === 'ArrowRight' ? 1 : -1, e.shiftKey);
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat && !e.shiftKey) item?.onPress?.();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const stepped = items.some((i) => i.onStep);
  return (
    <div
      className="sheet"
      data-testid={testId}
      onPointerDown={(e) => {
        // a press outside the box closes it
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={box} className={`sheet-box ${anchor === 'jacket' ? 'at-jacket' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div className="sheet-head">
          <b>{title}</b>
          {status && <span>{status}</span>}
        </div>
        <div className="sheet-items" role="menu">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              role="menuitem"
              className={`menu-item ${it.apart ? 'apart' : ''}`}
              data-item={it.id}
              data-testid={it.testId}
              disabled={it.disabled}
              // (the keys press it themselves; a click is the pointer's)
              onClick={(e) => {
                if (e.detail > 0) it.onPress?.();
              }}
            >
              <span className="menu-label">{it.label}</span>
              {it.sub && <span className="menu-sub">{it.sub}</span>}
              {it.value !== undefined ? (
                <span className="menu-value">
                  <i aria-hidden="true">‹</i>
                  <b className="num">{it.value}</b>
                  <i aria-hidden="true">›</i>
                </span>
              ) : (
                it.cap && !pad && <kbd>{it.cap}</kbd>
              )}
            </button>
          ))}
        </div>
        {children}
        {note && <p className="sheet-note">{note}</p>}
        <div className="sheet-foot" aria-hidden="true">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd>고르기
          </span>
          {stepped && (
            <span>
              <kbd>←</kbd>
              <kbd>→</kbd>값
            </span>
          )}
          <span>
            <kbd>{pad ? 'A' : 'Enter'}</kbd>결정
          </span>
          <span>
            <kbd>{pad ? 'B' : 'Esc'}</kbd>닫기
          </span>
        </div>
      </div>
    </div>
  );
}
