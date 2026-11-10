import { defineConfig } from 'vite';
import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The mockup borrows the game's renderer, HUD and play controller as they are (nothing under
// client/ is changed) and the gears' pictures, copied next to the build.
export default defineConfig({
  root: at('.'),
  base: './',
  resolve: { alias: { '@config': at('../config'), '@game': at('../client/src') } },
  server: { fs: { allow: ['..'] } },
  css: {
    postcss: {
      plugins: [
        {
          // The game's stylesheet only dresses the play screen's HUD here: every rule of it is
          // kept inside .game-scope (its tokens too), so it cannot touch the mockup's own screens.
          postcssPlugin: 'scope-game-css',
          Rule(rule) {
            const file = rule.source?.input.file ?? '';
            if (!file.replace(/\\/g, '/').endsWith('client/src/styles.css')) return;
            const parent = rule.parent as { type?: string; name?: string } | undefined;
            if (parent?.type === 'atrule' && /keyframes$/.test(parent.name ?? '')) return;
            rule.selectors = rule.selectors.map((sel) => {
              if (sel.includes('.game-scope')) return sel;
              if (/^(:root|html|body)\b/.test(sel)) return sel.replace(/^(:root|html|body)/, '.game-scope');
              return `.game-scope ${sel}`;
            });
          },
        },
      ],
    },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 4000, assetsInlineLimit: 0 },
  plugins: [
    {
      name: 'game-media',
      closeBundle() {
        cpSync(at('../client/public/media'), at('./dist/media'), { recursive: true });
      },
    },
  ],
});
