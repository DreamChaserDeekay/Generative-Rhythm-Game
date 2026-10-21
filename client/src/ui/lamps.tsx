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

/**
 * A lamp's mark, the colour of the lamp in a shape of its kind: hollow (failed), thin (assist,
 * easy), full (clear), double (hard, EX-HARD), a block (a full combo).
 */
export function LampMark() {
  return <i className="lamp-mark" aria-hidden="true" />;
}
