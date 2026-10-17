import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const configDir = fileURLToPath(new URL('../config', import.meta.url));
const serverUrl = process.env.GRG_SERVER_URL ?? 'http://127.0.0.1:8765';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@config': configDir } },
  server: {
    host: '127.0.0.1',
    port: 5173,
    fs: { allow: ['..'] },
    proxy: { '/api': serverUrl },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    proxy: { '/api': serverUrl },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
