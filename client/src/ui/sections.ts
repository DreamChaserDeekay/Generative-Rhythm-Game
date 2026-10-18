import type { SectionLabel } from '../api/client';
import { token } from './theme';

/** Section labels as the game shows them. */
export const SECTION_LABELS: Record<SectionLabel, string> = {
  intro: '인트로',
  verse: '벌스',
  'pre-chorus': '프리코러스',
  chorus: '후렴',
  bridge: '브리지',
  drop: '드롭',
  outro: '아웃트로',
};

export const SECTION_LABEL_ORDER = Object.keys(SECTION_LABELS) as SectionLabel[];

const GROUP_COLORS = 6;

/** Design token of a repetition group's colour (A, B, C … cycle through six). */
export function groupToken(group: string | undefined): string {
  const code = group ? group.toUpperCase().charCodeAt(0) - 65 : 0;
  return `--section-${(((code % GROUP_COLORS) + GROUP_COLORS) % GROUP_COLORS) + 1}`;
}

export function groupColor(group: string | undefined): string {
  return token(groupToken(group));
}

export function sectionLabel(label: string): string {
  return SECTION_LABELS[label as SectionLabel] ?? label;
}
