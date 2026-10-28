import { difficultyTiers } from '../engine/config';

export interface DifficultyChip {
  /** The tier ("HARD"). */
  label: string;
  /** "Lv.12", or empty when the chart has no level (the sync test). */
  level: string;
  /** The tier's colour, as a CSS value. */
  color: string;
}

/** Difficulty and level of a chart, as shown on the play HUD and the result screen. */
export function difficultyChip(meta: { difficulty: string; level: number }): DifficultyChip {
  const tier = difficultyTiers.find((t) => t.id === meta.difficulty);
  return {
    label: meta.difficulty,
    level: meta.level > 0 ? `Lv.${meta.level}` : '',
    color: tier?.color ?? 'var(--text-dim)',
  };
}
