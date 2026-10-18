import { difficultySystems, type DifficultySystemId } from '../engine/config';

export interface DifficultyChip {
  /** "DJMAX MX", or the tier alone on the original five steps ("HARD"). */
  label: string;
  /** "Lv.12", "SC 8", or empty when the chart has no level (the sync test). */
  level: string;
  /** The tier's colour, as a CSS value. */
  color: string;
}

/** Difficulty and level of a chart, as shown on the play HUD and the result screen. */
export function difficultyChip(meta: { difficulty: string; difficultySystem?: DifficultySystemId; levelScale?: string; level: number }): DifficultyChip {
  const id = meta.difficultySystem ?? 'GRG';
  const system = difficultySystems[id] ?? difficultySystems.GRG;
  const tier = system.tiers.find((t) => t.id === meta.difficulty);
  return {
    label: id !== 'GRG' ? `${system.label} ${meta.difficulty}` : meta.difficulty,
    level: meta.level > 0 ? (meta.levelScale ? `${meta.levelScale} ${meta.level}` : `Lv.${meta.level}`) : '',
    color: tier?.color ?? 'var(--text-dim)',
  };
}
