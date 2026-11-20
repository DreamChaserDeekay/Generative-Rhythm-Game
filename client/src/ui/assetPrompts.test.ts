import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { promptOf, PROMPT_KINDS } from './assetPrompts';

describe('the prompts', () => {
  it('are written out in docs/CUSTOM_ASSETS.md as the app copies them', () => {
    const doc = readFileSync(new URL('../../../docs/CUSTOM_ASSETS.md', import.meta.url), 'utf8');
    for (const kind of PROMPT_KINDS) for (const language of ['ko', 'en'] as const) expect(doc, `${kind} ${language}`).toContain(promptOf(kind, language));
  });
});
