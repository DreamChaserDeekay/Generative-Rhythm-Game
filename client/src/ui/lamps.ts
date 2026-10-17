import type { ClearLamp } from '../engine/config';

/** CSS class per clear lamp (banner, result screen, song list). */
export const LAMP_CLASS: Record<ClearLamp, string> = {
  FAILED: 'failed',
  'ASSIST CLEAR': 'assist',
  'EASY CLEAR': 'easy',
  CLEAR: 'clear',
  'HARD CLEAR': 'hard',
  'EX-HARD CLEAR': 'exhard',
  'MAX COMBO': 'maxcombo',
  'PERFECT PLAY': 'perfect',
};

export function lampClass(lamp: string): string {
  return LAMP_CLASS[lamp as ClearLamp] ?? '';
}
