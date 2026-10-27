import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

/** How long a first press waits for the second (모두 초기화, deleting a preset, a song or a chart, leaving the editor unsaved). */
export const TWO_PRESS_MS = 3000;

/**
 * A press that asks for a second within TWO_PRESS_MS before it acts, in place of the browser's
 * confirm box (which a pad cannot answer and which stops the page). `armed` says the first press
 * is waiting; the button's own props disarm it when the focus leaves and keep a held Enter's
 * repeats from making the second press.
 */
export function useTwoPress(action: () => void): {
  armed: boolean;
  press: () => void;
  disarm: () => void;
  buttonProps: { onKeyDown: (e: ReactKeyboardEvent) => void; onBlur: () => void };
} {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), TWO_PRESS_MS);
    return () => window.clearTimeout(id);
  }, [armed]);
  const press = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    action();
  };
  const disarm = () => setArmed(false);
  return {
    armed,
    press,
    disarm,
    buttonProps: {
      onKeyDown: (e) => {
        if (e.repeat && (e.code === 'Enter' || e.code === 'NumpadEnter')) e.preventDefault();
      },
      onBlur: disarm,
    },
  };
}
