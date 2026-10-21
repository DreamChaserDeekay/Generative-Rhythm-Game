import { useEffect, useRef } from 'react';
import type { DisplayMode } from '../settings/settings';

/** The settings' 화면 모드 (창 / 전체 화면), kept in step with the screen as it really is. */

/** The desktop app's window, as its preload (desktop/preload.js) hands it to the page; absent in a browser. */
export interface DesktopShell {
  setFullScreen(on: boolean): Promise<boolean>;
  isFullScreen(): Promise<boolean>;
  /** Calls `listener` whenever the window goes into or out of full screen (F11 too); returns the way to stop. */
  onFullScreen(listener: (on: boolean) => void): () => void;
}

declare global {
  interface Window {
    grgDesktop?: DesktopShell;
  }
}

/** The desktop app's window (null in a browser). */
export function desktopShell(): DesktopShell | null {
  return window.grgDesktop ?? null;
}

/** Keyboard Lock (Chromium): in full screen Esc reaches the page (the pause), and a held Esc leaves full screen. */
interface KeyboardLock {
  lock(codes?: string[]): Promise<void>;
  unlock(): void;
}

function keyboardLock(): KeyboardLock | null {
  const keyboard = (navigator as Navigator & { keyboard?: Partial<KeyboardLock> }).keyboard;
  return keyboard?.lock && keyboard.unlock ? (keyboard as KeyboardLock) : null;
}

/** A browser's full screen keeps Esc for the game and is left with a held Esc (else an Esc leaves it at once). */
export function heldEscLeaves(): boolean {
  return keyboardLock() !== null;
}

/** The page in full screen, Esc kept for the game; rejects without a key or click to allow it. */
async function enterFullScreen(): Promise<void> {
  await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  await keyboardLock()?.lock(['Escape']).catch(() => undefined);
}

/**
 * Keeps the screen on the 화면 모드 setting and the setting on the screen. The desktop app's window
 * says how it opened (as it was left) and when F11 changes it, and follows the setting's changes.
 * A browser goes full screen when the setting changes to it, or (the setting kept from an earlier
 * visit) at the first key or click, which it needs; leaving full screen there (Esc held, F11) sets
 * the setting back to 창.
 */
export function useDisplayMode(mode: DisplayMode, onMode: (mode: DisplayMode) => void): void {
  const shell = desktopShell();
  const onModeRef = useRef(onMode);
  onModeRef.current = onMode;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  /** The desktop window's full screen as last heard (null: not yet). */
  const heard = useRef<boolean | null>(null);

  // the desktop window: its state on start and at every change
  useEffect(() => {
    if (!shell) return;
    let alive = true;
    const hear = (on: boolean) => {
      heard.current = on;
      onModeRef.current(on ? 'fullscreen' : 'window');
    };
    void shell.isFullScreen().then((on) => alive && hear(on));
    const stop = shell.onFullScreen(hear);
    return () => {
      alive = false;
      stop();
    };
  }, [shell]);

  // a browser: leaving full screen sets the setting back (a video's own full screen is not the page's)
  useEffect(() => {
    if (shell) return;
    const onChange = () => {
      if (document.fullscreenElement === null && modeRef.current === 'fullscreen') onModeRef.current('window');
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [shell]);

  // the setting's change: the screen follows
  useEffect(() => {
    const on = mode === 'fullscreen';
    if (shell) {
      if (heard.current !== null && heard.current !== on) void shell.setFullScreen(on);
      return;
    }
    const full = document.fullscreenElement === document.documentElement;
    if (!on) {
      keyboardLock()?.unlock();
      if (full) void document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (full) return;
    let gone = false;
    let waiting = false;
    const atGesture = (e: Event) => {
      // Esc lends no permission to go full screen
      if (e instanceof KeyboardEvent && e.code === 'Escape') return;
      stopWaiting();
      void enterFullScreen().catch(() => onModeRef.current('window'));
    };
    const stopWaiting = () => {
      if (!waiting) return;
      waiting = false;
      window.removeEventListener('keydown', atGesture, true);
      window.removeEventListener('pointerdown', atGesture, true);
    };
    // a change made with a key or a click goes at once; a setting kept from before waits for one
    enterFullScreen().catch(() => {
      if (gone || document.fullscreenElement) return;
      waiting = true;
      window.addEventListener('keydown', atGesture, true);
      window.addEventListener('pointerdown', atGesture, true);
    });
    return () => {
      gone = true;
      stopWaiting();
    };
  }, [shell, mode]);
}
