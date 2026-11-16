import { defineConfig } from '../../../client/node_modules/vite/dist/node/index.js';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root: here,
  publicDir: fileURLToPath(new URL('../../../client/public', import.meta.url)),
  resolve: { alias: { '@config': fileURLToPath(new URL('../../../config', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5199, fs: { allow: ['../../..'] } },
});
