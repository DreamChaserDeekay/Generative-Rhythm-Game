import type { Page } from '@playwright/test';

/**
 * Gain of the note keysounds on the app's audio engine (the Vite dev server's module, so the same
 * engine as the play's), or null while no song is loaded on it (a play still loading).
 */
export function keysoundBusGain(page: Page): Promise<number | null> {
  return page.evaluate(async () => {
    const modulePath = '/src/audio/AudioEngine.ts';
    const m = (await import(/* @vite-ignore */ modulePath)) as typeof import('../src/audio/AudioEngine');
    const engine = m.getAudioEngine();
    return engine.durationMs > 0 ? engine.keysoundBus.gain.value : null;
  });
}
